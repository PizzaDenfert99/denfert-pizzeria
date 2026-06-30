"""
Final production verification for https://loyalty.pizzadenfert.fr
Read-only HTTPS curl-style checks. No mocks. No SSH.
"""
import json
import time
import requests
import pytest

BASE = "https://loyalty.pizzadenfert.fr"


def _get(path, **kwargs):
    return requests.get(f"{BASE}{path}", timeout=10, **kwargs)


# --- Test 1: /api/menu/version called 3x spaced 3s, identical bodies & schema ---
def test_menu_version_consistency_and_schema():
    bodies = []
    statuses = []
    for i in range(3):
        r = _get("/api/menu/version")
        statuses.append(r.status_code)
        bodies.append(r.json())
        if i < 2:
            time.sleep(3)
    print(f"\n[TEST 1] /api/menu/version body sample: {json.dumps(bodies[0])}")
    assert all(s == 200 for s in statuses), f"Non-200 statuses: {statuses}"
    # Schema: {rev: int, count: int, updated_at: str|null}
    b = bodies[0]
    assert "rev" in b and isinstance(b["rev"], int), f"rev missing/not int: {b}"
    assert "count" in b and isinstance(b["count"], int), f"count missing/not int: {b}"
    assert "updated_at" in b, f"updated_at missing: {b}"
    assert b["updated_at"] is None or isinstance(b["updated_at"], str), f"updated_at wrong type: {b}"
    # Identical bodies
    assert bodies[0] == bodies[1] == bodies[2], f"Bodies not identical: {bodies}"


# --- Test 2: /api/menu returns array length >= 1 ---
def test_menu_returns_non_empty_array():
    r = _get("/api/menu")
    assert r.status_code == 200, f"Status={r.status_code}"
    data = r.json()
    assert isinstance(data, list), f"Not a list: {type(data)}"
    assert len(data) >= 1, f"Empty array (len={len(data)})"


# --- Test 3a: /api/loyalty/me without token -> 401 ---
def test_loyalty_me_requires_auth():
    r = _get("/api/loyalty/me")
    assert r.status_code == 401, f"Expected 401, got {r.status_code} body={r.text[:200]}"


# --- Test 3b: /api/reservations/me without token -> 401 ---
def test_reservations_me_requires_auth():
    r = _get("/api/reservations/me")
    assert r.status_code == 401, f"Expected 401, got {r.status_code} body={r.text[:200]}"


# --- Test 4: Frontend SPA root returns 200 ---
def test_frontend_spa_loads():
    r = _get("/")
    assert r.status_code == 200, f"SPA status={r.status_code}"


# --- Test 5: /api/menu/version response time < 2s ---
def test_menu_version_response_time():
    start = time.time()
    r = _get("/api/menu/version")
    elapsed = time.time() - start
    assert r.status_code == 200
    assert elapsed < 2.0, f"Slow: {elapsed:.3f}s"
    print(f"\n[TEST 5] /api/menu/version response time: {elapsed:.3f}s")


# --- Test 6: CORS preflight ---
def test_cors_preflight():
    headers = {
        "Origin": "https://pizzadenfert.fr",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
    }
    r = requests.options(f"{BASE}/api/menu/version", headers=headers, timeout=10)
    assert r.status_code in (200, 204), f"CORS preflight status={r.status_code}"
    allow_origin = r.headers.get("Access-Control-Allow-Origin", "")
    assert allow_origin in ("*", "https://pizzadenfert.fr"), (
        f"CORS Allow-Origin invalid: '{allow_origin}' headers={dict(r.headers)}"
    )
    print(f"\n[TEST 6] CORS Allow-Origin: '{allow_origin}'")


# --- Test 7: count in /api/menu/version matches len(/api/menu) ---
def test_menu_version_count_matches_menu_length():
    v = _get("/api/menu/version").json()
    m = _get("/api/menu").json()
    print(f"\n[TEST 7] /api/menu/version body: {json.dumps(v)}")
    print(f"[TEST 7] len(/api/menu) = {len(m)}")
    assert v["count"] == len(m), f"count={v['count']} != len(menu)={len(m)}"


# --- Test 8: No regression after 15s wait, repeat tests 1-4 once ---
def test_no_regression_after_wait():
    time.sleep(15)
    # version
    r1 = _get("/api/menu/version")
    assert r1.status_code == 200
    b1 = r1.json()
    assert "rev" in b1 and "count" in b1 and "updated_at" in b1
    # menu
    r2 = _get("/api/menu")
    assert r2.status_code == 200 and len(r2.json()) >= 1
    # auth endpoints still 401
    assert _get("/api/loyalty/me").status_code == 401
    assert _get("/api/reservations/me").status_code == 401
    # frontend
    assert _get("/").status_code == 200
    print(f"\n[TEST 8] Post-wait /api/menu/version: {json.dumps(b1)}")
