"""The per-app READMEs and guides exist for every app, match apps/build_docs.py, and link only to files that exist."""
import importlib.util
import re
from pathlib import Path

from fenrir_cloud import apps

REPO = Path(__file__).resolve().parents[2]
APPS_DIR = REPO / "apps"


def _builder():
    spec = importlib.util.spec_from_file_location("build_docs", APPS_DIR / "build_docs.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_every_app_has_a_readme_and_a_guide():
    builder = _builder()
    assert set(builder.ORDER) == set(apps.APPS) - {"complete"}
    for key in builder.ORDER:
        assert builder.APPS[key]["title"] == apps.APPS[key].title
        for name in ("README.md", "GUIDE.md"):
            assert (APPS_DIR / key / name).is_file(), f"apps/{key}/{name} is missing"


def test_generated_files_are_up_to_date():
    builder = _builder()
    assert (APPS_DIR / "README.md").read_text() == builder.index(), "run: python3 apps/build_docs.py"
    for key in builder.ORDER:
        assert (APPS_DIR / key / "README.md").read_text() == builder.readme(key, builder.APPS[key]), key
        assert (APPS_DIR / key / "GUIDE.md").read_text() == builder.guide(key, builder.APPS[key]), key


def test_links_point_at_real_files():
    for doc in APPS_DIR.rglob("*.md"):
        for target in re.findall(r"\]\(([^)#\s]+)(?:#[^)]*)?\)", doc.read_text()):
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            assert (doc.parent / target).resolve().exists(), f"{doc.relative_to(REPO)} links to missing {target}"


def test_device_apps_match_the_server():
    builder = _builder()
    for key in builder.ORDER:
        assert builder.APPS[key]["devices"] == ("endpoint" in apps.APPS[key].features), key
