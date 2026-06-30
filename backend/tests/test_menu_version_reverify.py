"""
Re-verification (iteration 12) of nginx routing fix for production VPS:
https://loyalty.pizzadenfert.fr

Read-only HTTPS verification only. No SSH, no config changes.
Per review_request:
  1) GET /api/menu/version -> 200 with keys rev,count,updated_at
  2) GET /api/menu        -> 200 non-empty array
  3) GET /api/loyalty/me  -> 401 (no auth)
  4) GET /api/reservations/me -> 401 (no auth)
  5) GET /                -> 200 (frontend SPA)
  6) Spaced sampling: hit /api/menu/version, wait 10s, hit again. Both 200.
  7) Response time of /api/menu/version under 2 seconds.
"""
import time
import pytest
import requests

BASE_URL = "https://loyalty.pizzadenfert.fr"
TIMEOUT = 15


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({
        "Accept": "application/json",
        "User-Agent": "reverify-bot/iteration-12",
    })
    return s


# --- 1) /api/menu/version returns 200 with required schema keys ---
def test_menu_version_200_with_required_keys(client):
    r = client.get(f"{BASE_URL}/api/menu/version", timeout=TIMEOUT)
    print(f"\n[1] GET /api/menu/version -> status={r.status_code}")
    print(f"    body={r.text}")
    print(f"    headers Server={r.headers.get('Server')!r} CT={r.headers.get('Content-Type')!r}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
    data = r.json()
    assert isinstance(data, dict), f"Expected JSON object, got {type(data)}"
    for k in ("rev", "count", "updated_at"):
        assert k in data, f"Missing key '{k}' in body: {data}"


# --- 2) /api/menu non-empty array ---
def test_menu_non_empty_array(client):
    r = client.get(f"{BASE_URL}/api/menu", timeout=TIMEOUT)
    print(f"\n[2] GET /api/menu -> status={r.status_code} body_len={len(r.text)}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    assert isinstance(data, list), f"Expected list, got {type(data)}"
    assert len(data) > 0, "Menu list is empty"
    print(f"    item_count={len(data)}; sample_keys={list(data[0].keys())[:8] if data else []}")


# --- 3) /api/loyalty/me without auth -> 401 ---
def test_loyalty_me_unauthenticated_401(client):
    r = client.get(f"{BASE_URL}/api/loyalty/me", timeout=TIMEOUT)
    print(f"\n[3] GET /api/loyalty/me (no auth) -> status={r.status_code} body={r.text[:200]}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text[:300]}"


# --- 4) /api/reservations/me without auth -> 401 ---
def test_reservations_me_unauthenticated_401(client):
    r = client.get(f"{BASE_URL}/api/reservations/me", timeout=TIMEOUT)
    print(f"\n[4] GET /api/reservations/me (no auth) -> status={r.status_code} body={r.text[:200]}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text[:300]}"


# --- 5) Frontend SPA root returns 200 ---
def test_frontend_spa_root_200(client):
    # SPA may return text/html, override Accept to be permissive
    r = requests.get(
        f"{BASE_URL}/",
        timeout=TIMEOUT,
        headers={"Accept": "text/html,application/xhtml+xml", "User-Agent": "reverify-bot/iteration-12"},
    )
    print(f"\n[5] GET / -> status={r.status_code} CT={r.headers.get('Content-Type')!r} body_len={len(r.text)}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"


# --- 6) Spaced sampling: now, wait 10s, again. Both must be 200. ---
def test_menu_version_spaced_sampling_10s(client):
    r1 = client.get(f"{BASE_URL}/api/menu/version", timeout=TIMEOUT)
    print(f"\n[6] sample-1 status={r1.status_code} body={r1.text[:120]}")
    assert r1.status_code == 200, f"Sample 1 expected 200, got {r1.status_code}"
    time.sleep(10)
    r2 = client.get(f"{BASE_URL}/api/menu/version", timeout=TIMEOUT)
    print(f"    sample-2 (after 10s) status={r2.status_code} body={r2.text[:120]}")
    assert r2.status_code == 200, f"Sample 2 expected 200, got {r2.status_code}"


# --- 7) Response time of /api/menu/version under 2 seconds (health gate) ---
def test_menu_version_response_time_under_2s(client):
    t0 = time.monotonic()
    r = client.get(f"{BASE_URL}/api/menu/version", timeout=TIMEOUT)
    elapsed = time.monotonic() - t0
    print(f"\n[7] GET /api/menu/version elapsed={elapsed:.3f}s status={r.status_code}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert elapsed < 2.0, f"Response too slow: {elapsed:.3f}s (>=2s threshold)"
