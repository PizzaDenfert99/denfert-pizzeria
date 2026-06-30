"""
Verification of production nginx routing fix for /api/menu/version on
https://loyalty.pizzadenfert.fr

Background: nginx vhost was proxying /api/ to a stale uvicorn on :8000 that did
not include the /api/menu/version route. Vhost was repointed to :8001 (the
active pizzadenfert.service). These read-only HTTPS tests confirm the fix.
"""
import time
import pytest
import requests

BASE_URL = "https://loyalty.pizzadenfert.fr"
TIMEOUT = 15


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Accept": "application/json", "User-Agent": "verification-bot/1.0"})
    return s


# --- Test 1: /api/menu/version returns 200 with expected schema ---
def test_menu_version_returns_200_with_schema(client):
    r = client.get(f"{BASE_URL}/api/menu/version", timeout=TIMEOUT)
    print(f"\n[menu/version] status={r.status_code} headers={dict(r.headers)} body={r.text[:500]}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
    ct = r.headers.get("Content-Type", "")
    assert "application/json" in ct, f"Expected JSON content type, got {ct}"
    data = r.json()
    assert isinstance(data, dict), f"Expected JSON object, got {type(data)}"
    assert "rev" in data, f"Missing key 'rev' in response: {data}"
    assert "count" in data, f"Missing key 'count' in response: {data}"
    assert "updated_at" in data, f"Missing key 'updated_at' in response: {data}"
    assert isinstance(data["rev"], int), f"'rev' should be int, got {type(data['rev'])}"
    assert isinstance(data["count"], int), f"'count' should be int, got {type(data['count'])}"
    assert data["updated_at"] is None or isinstance(data["updated_at"], str), (
        f"'updated_at' should be string or null, got {type(data['updated_at'])}"
    )


# --- Test 2: /api/menu (sanity that other public routes still work) ---
def test_menu_returns_non_empty_array(client):
    r = client.get(f"{BASE_URL}/api/menu", timeout=TIMEOUT)
    print(f"\n[menu] status={r.status_code} body_len={len(r.text)}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
    data = r.json()
    assert isinstance(data, list), f"Expected list, got {type(data)}"
    assert len(data) > 0, "Expected non-empty menu list"


# --- Test 3: /api/loyalty/me without auth -> 401 ---
def test_loyalty_me_requires_auth(client):
    r = client.get(f"{BASE_URL}/api/loyalty/me", timeout=TIMEOUT)
    print(f"\n[loyalty/me no-auth] status={r.status_code} body={r.text[:200]}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text[:300]}"


# --- Test 4: /api/reservations/me without auth -> 401 ---
def test_reservations_me_requires_auth(client):
    r = client.get(f"{BASE_URL}/api/reservations/me", timeout=TIMEOUT)
    print(f"\n[reservations/me no-auth] status={r.status_code} body={r.text[:200]}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text[:300]}"


# --- Test 5: 5 consecutive calls all return 200 (no flakiness) ---
def test_menu_version_consistency_5x(client):
    statuses = []
    bodies = []
    for i in range(5):
        r = client.get(f"{BASE_URL}/api/menu/version", timeout=TIMEOUT)
        statuses.append(r.status_code)
        bodies.append(r.text[:120])
    print(f"\n[5x menu/version] statuses={statuses}")
    print(f"  bodies: {bodies}")
    assert all(s == 200 for s in statuses), f"Inconsistent statuses: {statuses}"


# --- Test 6: Content-Type indicates FastAPI/uvicorn JSON serving ---
def test_menu_version_content_type_json(client):
    r = client.get(f"{BASE_URL}/api/menu/version", timeout=TIMEOUT)
    ct = r.headers.get("Content-Type", "")
    server = r.headers.get("Server", "")
    print(f"\n[headers] Content-Type={ct!r} Server={server!r}")
    assert r.status_code == 200
    assert "application/json" in ct, f"Expected JSON content type, got {ct}"


# --- Test 7: Two runs 5s apart both return 200 (rules out cache) ---
def test_menu_version_after_delay(client):
    r1 = client.get(f"{BASE_URL}/api/menu/version", timeout=TIMEOUT)
    print(f"\n[delay-test run1] status={r1.status_code} body={r1.text[:120]}")
    assert r1.status_code == 200
    time.sleep(5)
    r2 = client.get(f"{BASE_URL}/api/menu/version", timeout=TIMEOUT)
    print(f"[delay-test run2 after 5s] status={r2.status_code} body={r2.text[:120]}")
    assert r2.status_code == 200
