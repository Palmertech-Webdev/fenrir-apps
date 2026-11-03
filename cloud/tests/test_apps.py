"""Each app (FENRIR_APP) serves its own pages and the core, nothing else, and never hands work to an app it does not run."""
import dataclasses
import os

import pytest
from fastapi.testclient import TestClient

from conftest import ADMIN_PASSWORD, login
from fenrir_cloud import apps
from fenrir_cloud.config import Settings
from fenrir_cloud.main import create_app

# One page of each app, read with GET: served only where the app (or complete) runs.
OWN = {
    "rmm": "/api/console/rmm/overview",
    "av": "/api/console/alerts",
    "vuln": "/api/console/vulnerabilities",
    "crm": "/api/console/crm/accounts",
    "psa": "/api/console/tickets",
    "grc": "/api/console/grc/programmes",
    "m365": "/api/console/m365/connections",
    "docs": "/api/console/vault/credentials",
}
# The core: in every app.
CORE = ["/api/console/tenants", "/api/console/users", "/api/console/webhooks", "/api/console/audit", "/api/console/roles"]


@pytest.fixture()
def app_client(monkeypatch, request):
    key = request.param
    monkeypatch.setenv("FENRIR_APP", key)
    settings = dataclasses.replace(Settings(), database_url="sqlite://", bootstrap_admin_password=ADMIN_PASSWORD, secret_key="test-secret",
                                   public_base_url="https://fenrir.test", dns_blocklists_enabled=False, require_mfa=False)
    with TestClient(create_app(settings)) as client:
        yield key, client, login(client)


@pytest.mark.parametrize("app_client", list(apps.APPS), indirect=True)
def test_each_app_serves_its_pages_and_the_core_only(app_client):
    key, client, admin = app_client
    info = client.get("/api/app").json()
    assert info["key"] == key and info["title"] == apps.APPS[key].title
    for path in CORE:
        assert client.get(path, headers=admin).status_code == 200, (key, path)
    features = apps.APPS[key].features
    for other, path in OWN.items():
        status = client.get(path, headers=admin).status_code
        if other in features:
            assert status == 200, (key, path)
        else:
            assert status == 404, (key, path, "served by an app that should not have it")


@pytest.mark.parametrize("app_client", ["docs", "psa", "crm"], indirect=True)
def test_shared_parts_follow_the_apps_that_use_them(app_client):
    key, client, admin = app_client
    kb = client.get("/api/console/psa/kb", headers=admin).status_code
    quotes = client.get("/api/console/psa/quotes", headers=admin).status_code
    assert kb == (200 if key in {"docs", "psa"} else 404)
    assert quotes == (200 if key in {"crm", "psa"} else 404)


@pytest.mark.parametrize("app_client", ["av"], indirect=True)
def test_no_tickets_without_the_psa(app_client):
    _key, client, admin = app_client
    from fenrir_cloud import db, services
    from fenrir_cloud.models import Tenant, Ticket

    tenant = client.post("/api/console/tenants", json={"name": "Acme", "template": "balanced"}, headers=admin).json()
    with db.session_factory()() as session:
        assert services.open_ticket(session, tenant["id"], "Should not exist") is None
        assert session.query(Ticket).count() == 0
        assert session.get(Tenant, tenant["id"]) is not None


def test_jobs_follow_the_app(monkeypatch):
    monkeypatch.setenv("FENRIR_APP", "crm")
    assert apps.job_enabled("audit.checkpoint")  # core jobs always run
    assert not apps.job_enabled("rmm") and not apps.job_enabled("psa.mailbox") and not apps.job_enabled("clients.health")
    monkeypatch.setenv("FENRIR_APP", "complete")
    assert all(apps.job_enabled(name) for name in apps.JOBS)


def test_unknown_app_is_refused(monkeypatch):
    monkeypatch.setenv("FENRIR_APP", "spreadsheet")
    with pytest.raises(ValueError, match="not an app"):
        apps.current()


def test_default_is_the_complete_platform(monkeypatch):
    monkeypatch.delenv("FENRIR_APP", raising=False)
    assert apps.current_key() == "complete"
    assert os.getenv("FENRIR_APP") is None
