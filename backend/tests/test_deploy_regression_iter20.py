"""
Iteration 20 — regression tests for Docker Compose Mongo host-port fix.

Verifies:
  - Backend endpoints (/api/healthz, /api/menu, /api/menu/version) still work
    under supervisor (no runtime code regression from the compose-only change).
  - docker-compose.yml has the correct shape (mongo has no host-port binding,
    backend still points to mongodb://mongo:27017).
  - No stray '27017:27017' host-port mappings in the repo.
  - scripts/bootstrap.sh has the pre-flight :27017 warning.
"""

import os
import re
import subprocess
from pathlib import Path

import pytest
import requests
import yaml

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
REPO_ROOT = Path("/app")


# --- Backend HTTP endpoints -------------------------------------------------
class TestBackendEndpoints:
    def test_healthz_returns_ok(self):
        r = requests.get(f"{BASE_URL}/api/healthz", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "ok", body

    def test_menu_returns_nonempty_list(self):
        r = requests.get(f"{BASE_URL}/api/menu", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list), f"expected list, got {type(data).__name__}"
        assert len(data) > 0, "menu should be non-empty"
        # Sanity: first item has expected fields
        first = data[0]
        assert "id" in first and "name" in first, first

    def test_menu_version_has_rev(self):
        r = requests.get(f"{BASE_URL}/api/menu/version", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "rev" in body, body
        assert isinstance(body["rev"], int), body


# --- docker-compose.yml static validation -----------------------------------
class TestDockerComposeShape:
    @pytest.fixture(scope="class")
    def compose(self):
        path = REPO_ROOT / "docker-compose.yml"
        assert path.exists(), "docker-compose.yml missing"
        with path.open() as f:
            return yaml.safe_load(f)

    def test_yaml_is_valid(self, compose):
        assert isinstance(compose, dict)
        assert "services" in compose
        assert "mongo" in compose["services"]
        assert "backend" in compose["services"]

    def test_mongo_has_no_host_ports(self, compose):
        mongo = compose["services"]["mongo"]
        assert "ports" not in mongo or not mongo.get("ports"), (
            f"mongo must NOT publish host ports, got: {mongo.get('ports')!r}"
        )

    def test_mongo_exposes_27017_internal_only(self, compose):
        mongo = compose["services"]["mongo"]
        expose = mongo.get("expose", [])
        # Accept string or int form
        expose_norm = [str(x) for x in expose]
        assert "27017" in expose_norm, f"expected '27017' in expose, got {expose!r}"

    def test_backend_still_uses_docker_dns_mongo_url(self, compose):
        env = compose["services"]["backend"]["environment"]
        mongo_url = env.get("MONGO_URL")
        assert mongo_url == "mongodb://mongo:27017", (
            f"backend MONGO_URL should target internal 'mongo' service, got {mongo_url!r}"
        )


# --- Repo-wide grep for 27017:27017 host-port mappings ----------------------
class TestNoHostPortMapping:
    def test_no_27017_host_port_binding_in_code(self):
        # git grep is fast and respects .gitignore; fall back to find/grep if not a git repo
        result = subprocess.run(
            ["grep", "-rn", "27017:27017", str(REPO_ROOT),
             "--include=*.yml", "--include=*.yaml",
             "--include=*.sh", "--include=*.py",
             "--include=*.js", "--include=*.ts", "--include=*.tsx",
             "--include=*.json"],
            capture_output=True, text=True,
        )
        matches = [ln for ln in result.stdout.splitlines() if ln.strip()]
        # bootstrap.sh may reference the literal string inside a WARN message
        # (e.g. "docker run -p 27017:27017"). That's fine — it's user-facing help
        # text, not an actual port binding. Filter it out.
        offending = [
            ln for ln in matches
            if "scripts/bootstrap.sh" not in ln
            and "backend/tests/" not in ln  # this test file references the string
        ]
        assert not offending, f"Found stray 27017:27017 host-port mappings:\n{chr(10).join(offending)}"


# --- bootstrap.sh preflight -------------------------------------------------
class TestBootstrapPreflight:
    def test_bootstrap_greps_for_port_27017(self):
        script = (REPO_ROOT / "scripts" / "bootstrap.sh").read_text()
        # Must mention port 27017 in a preflight check (ss or grep or lsof)
        assert re.search(r":27017", script), "bootstrap.sh should reference :27017 preflight"
        assert re.search(r"\bss\b|\blsof\b|\bnetstat\b", script), (
            "bootstrap.sh should use ss/lsof/netstat to detect listeners"
        )
        # And it should warn (not die) — deploy must still work
        assert "warn " in script, "bootstrap.sh should use warn() (non-blocking) for this check"
