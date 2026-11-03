"""Fenrir apps: one codebase, run as the complete platform or as one app on its own.

``FENRIR_APP`` picks the app a server runs (default ``complete``). Each app switches on a set of *features*; a
feature owns server routes, background jobs and dashboard pages. The core (sign-in, users, roles, customers,
settings, audit) is part of every app. Nothing in an app depends on a feature it does not switch on: where one app
would hand work to another (a monitor raising a ticket, say), that hand-off is skipped when the other is absent.

==========  =============================================================================================
App         Features
==========  =============================================================================================
complete    everything (the all-in-one platform)
rmm         endpoint + rmm: devices, monitoring, scripts, patching, software, remote access, AD, network
av          endpoint + av: antivirus/EDR, detections, quarantine, isolation, DNS filtering, Defender
vuln        endpoint + vuln: vulnerabilities, CVE/EPSS/KEV context, exposure, verified remediation
crm         crm: accounts, contacts, leads, opportunities, quotes
psa         psa: tickets, service board, time, projects, contracts, billing, client portal
grc         grc: compliance programmes, policies, evidence, risks, vendor risk
m365        m365: Microsoft 365 tenants, users, Exchange, Intune, sign-in protection, reports, standards
mobile      endpoint + mobile: Android phones, iPhone/iPad web protection, app protection, phone policy
docs        docs: IT documentation and the credential vault
==========  =============================================================================================
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class App:
    key: str
    title: str
    summary: str
    features: frozenset[str]


FEATURES = ("endpoint", "rmm", "av", "vuln", "crm", "psa", "grc", "m365", "mobile", "docs", "complete")

APPS: dict[str, App] = {a.key: a for a in (
    App("complete", "Fenrir", "The complete platform: every app in one console.", frozenset(FEATURES)),
    App("rmm", "Fenrir RMM", "Remote monitoring and management: devices, monitoring, scripts, patching, software, remote "
        "access, Active Directory and network.", frozenset({"endpoint", "rmm"})),
    App("av", "Fenrir Antivirus", "Endpoint protection: antivirus and EDR, detections, quarantine, isolation, DNS filtering "
        "and managed Microsoft Defender.", frozenset({"endpoint", "av"})),
    App("vuln", "Fenrir Vulnerability Manager", "Vulnerabilities with CVE, EPSS and CISA KEV context, external exposure and "
        "verified remediation.", frozenset({"endpoint", "vuln"})),
    App("crm", "Fenrir CRM", "Customer relationship management: accounts, contacts, leads, opportunities and quotes.",
        frozenset({"crm"})),
    App("psa", "Fenrir PSA", "Professional services automation: tickets, service board, time, projects, contracts, "
        "billing and a client portal.", frozenset({"psa"})),
    App("grc", "Fenrir GRC", "Governance, risk and compliance: programmes, policies, evidence, risks and vendor risk.",
        frozenset({"grc"})),
    App("m365", "Fenrir Microsoft 365", "Microsoft 365 administration: tenants, users, Exchange, Intune, sign-in "
        "protection, reports and security standards.", frozenset({"m365"})),
    App("mobile", "Fenrir Mobile", "Phone management: Android phones (location, lost mode, remote support, policy, app "
        "protection) and web protection for iPhone, iPad and Mac.", frozenset({"endpoint", "mobile"})),
    App("docs", "Fenrir Docs & Vault", "IT documentation and a credential vault.", frozenset({"docs"})),
)}


def current_key() -> str:
    key = (os.getenv("FENRIR_APP") or "complete").strip().lower()
    if key not in APPS:
        raise ValueError(f"FENRIR_APP={key!r} is not an app. Choose one of: {', '.join(APPS)}")
    return key


def current() -> App:
    return APPS[current_key()]


def enabled(*features: str) -> bool:
    """True when the running app includes every feature named (the core is always included)."""
    have = current().features
    return all(f in have for f in features)


def any_enabled(*features: str) -> bool:
    have = current().features
    return any(f in have for f in features)


# --- server routes ---------------------------------------------------------------------------------------------
# Console routers by feature. A router listed under several features loads when any of them is on. Routers agents
# call (check-in, telemetry, commands, uploads) load whenever "endpoint" is on, so one agent build serves every app.
ROUTERS: dict[str, tuple[str, ...]] = {
    "core": ("admin", "customization", "roles", "apikeys", "approvals", "search"),
    "endpoint": ("agent_api", "fleet", "agent_health", "rollouts", "remote"),
    "rmm": ("rmm", "condition_packages", "active_directory", "network", "backup", "oob"),
    "av": ("protection", "soc", "soc_workflows", "triage", "exclusions", "defender"),
    "vuln": ("protection", "exposure_intel"),
    "crm": ("crm", "business"),
    "psa": ("psa", "service_mgmt", "business", "portal"),
    "grc": ("grc", "grc_programme", "grc_assurance"),
    "m365": ("m365", "m365_admin", "m365_collaboration", "m365_exchange", "m365_intune", "m365_lifecycle",
             "m365_partner", "m365_reports", "m365_signin", "m365_workspace"),
    "mobile": ("mobile_apps",),
    "docs": ("documentation",),
    # Cross-app views (a customer's whole picture, onboarding across modules) are part of the complete platform.
    "complete": ("clients", "onboarding"),
}


def router_enabled(name: str) -> bool:
    if name in ROUTERS["core"]:
        return True
    return any(name in routers and f in current().features for f, routers in ROUTERS.items())


# --- background jobs -------------------------------------------------------------------------------------------
JOBS: dict[str, str] = {
    # every 30 seconds (main._scheduled_jobs)
    "rmm": "rmm", "psa.timed-workflows": "psa", "remote.expire-sessions": "endpoint",
    "m365.temp-admin-expiry": "m365", "m365.workflows-waiting": "m365", "m365.signin-protection": "m365",
    "events.outbox": "core", "network": "rmm", "psa.mailbox": "psa", "condition-remediation": "rmm",
    "backup.health": "rmm", "remediation": "vuln", "remediation.verify": "vuln", "topology": "rmm",
    "artifacts.purge": "endpoint", "audit.checkpoint": "core", "audit.retention": "core",
    # hourly (main._maintenance_jobs)
    "telemetry.retention": "endpoint", "intel.feed": "av", "m365.partner": "m365", "documentation.auto": "docs",
    "tprm": "grc", "grc.automation": "grc", "darkweb": "vuln", "m365.standards": "m365", "m365.workspace": "m365",
    "m365.reports": "m365", "billing.sync": "psa", "clients.health": "complete", "defender": "av",
    "web.profiles": "mobile", "dns.blocklists": "av",
}


def job_enabled(name: str) -> bool:
    feature = JOBS.get(name, "complete")
    return feature == "core" or feature in current().features


def describe() -> dict:
    """What the dashboard needs: the app, its title and features (it shows only their pages)."""
    app = current()
    return {"key": app.key, "title": app.title, "summary": app.summary, "features": sorted(app.features)}
