"""
Iteration 14: End-to-end sync verification for the shared FastAPI backend
across two hostnames after nginx vhost + SSL cert were provisioned for
api.pizzadenfert.fr.

Covers:
- Baseline READ parity (steps 1-4)
- CORS preflight from both origins (steps 5-6)
- SSL cert validity (step 7)
- Auth-protected endpoints return 401 (steps 8-9)
- Menu write-then-read across both hostnames (steps 10-16)
- Reservation write-then-read across both hostnames (steps 17-20)
"""

import json
import ssl
import socket
import pytest
import requests
from datetime import datetime

LOYALTY = "https://loyalty.pizzadenfert.fr"
API = "https://api.pizzadenfert.fr"

ADMIN_EMAIL = "admin@pizzadenfert.fr"
ADMIN_PASSWORD = "Admin1234!"

SYNC_ITEM_NAME = "__SYNC_TEST_ITEM__"
SYNC_GUEST_NAME = "__SYNC_TEST_GUEST__"


# ---------- shared state across tests (module-scoped) ----------
state = {
    "token": None,
    "menu_item_id": None,
    "baseline_menu_len": None,
    "baseline_version": None,
    "reservation_id": None,
}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# =====================================================================
# Baseline READ parity (tests 1-4)
# =====================================================================
def test_01_get_menu_loyalty(session):
    r = session.get(f"{LOYALTY}/api/menu", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list), f"Expected list, got {type(data)}"
    state["baseline_menu_len"] = len(data)


def test_02_get_menu_api(session):
    r = session.get(f"{API}/api/menu", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)


def test_03_menu_bodies_identical(session):
    r1 = session.get(f"{LOYALTY}/api/menu", timeout=15)
    r2 = session.get(f"{API}/api/menu", timeout=15)
    assert r1.status_code == 200 and r2.status_code == 200
    # Compare parsed JSON (order-sensitive but same DB should yield same list)
    assert r1.json() == r2.json(), "Menu JSON differs between hostnames!"


def test_04_menu_version_bodies_identical(session):
    r1 = session.get(f"{LOYALTY}/api/menu/version", timeout=15)
    r2 = session.get(f"{API}/api/menu/version", timeout=15)
    assert r1.status_code == 200 and r2.status_code == 200, f"{r1.text} | {r2.text}"
    b1, b2 = r1.json(), r2.json()
    assert b1 == b2, f"/api/menu/version differs: {b1} vs {b2}"
    state["baseline_version"] = b1


# =====================================================================
# CORS preflight (tests 5-6)
# =====================================================================
def _preflight(origin: str):
    r = requests.options(
        f"{API}/api/menu/version",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=15,
    )
    return r


def test_05_cors_preflight_loyalty_origin():
    r = _preflight("https://loyalty.pizzadenfert.fr")
    assert r.status_code in (200, 204), f"status={r.status_code} body={r.text}"
    aco = r.headers.get("Access-Control-Allow-Origin", "")
    assert aco in ("https://loyalty.pizzadenfert.fr", "*"), (
        f"ACAO='{aco}' headers={dict(r.headers)}"
    )


def test_06_cors_preflight_customer_origin():
    r = _preflight("https://pizzadenfert.fr")
    assert r.status_code in (200, 204), f"status={r.status_code} body={r.text}"
    aco = r.headers.get("Access-Control-Allow-Origin", "")
    assert aco in ("https://pizzadenfert.fr", "*"), (
        f"ACAO='{aco}' headers={dict(r.headers)}"
    )


# =====================================================================
# TLS cert SAN (test 7)
# =====================================================================
def test_07_tls_cert_san_api_host():
    # curl without -k must succeed (default verification)
    r = requests.get(f"{API}/api/menu/version", timeout=15)
    assert r.status_code == 200

    # Also inspect the actual peer cert for SAN
    ctx = ssl.create_default_context()
    with socket.create_connection(("api.pizzadenfert.fr", 443), timeout=10) as sock:
        with ctx.wrap_socket(sock, server_hostname="api.pizzadenfert.fr") as ssock:
            cert = ssock.getpeercert()
    sans = [v for k, v in cert.get("subjectAltName", []) if k == "DNS"]
    assert "api.pizzadenfert.fr" in sans, f"SAN missing api host, got {sans}"


# =====================================================================
# Auth-protected sanity (tests 8-9)
# =====================================================================
def test_08_admin_reservations_unauth_401(session):
    r = session.get(f"{API}/api/admin/reservations", timeout=15)
    assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text[:200]}"


def test_09_admin_menu_unauth_401(session):
    r = session.get(f"{API}/api/admin/menu", timeout=15)
    assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text[:200]}"


# =====================================================================
# Admin login (test 10)
# =====================================================================
def test_10_admin_login(session):
    # Discovered endpoint: /api/auth/login
    r = session.post(
        f"{LOYALTY}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:400]}"
    data = r.json()
    assert "token" in data, f"no token in response: {data}"
    assert data.get("user", {}).get("is_admin") is True, "user is not admin"
    state["token"] = data["token"]


def _auth_headers():
    assert state["token"], "no admin token available"
    return {
        "Authorization": f"Bearer {state['token']}",
        "Content-Type": "application/json",
    }


# =====================================================================
# Menu write-then-read (tests 11-16)
# =====================================================================
def test_11_create_menu_item_on_api_host():
    payload = {"category": "pizzas", "name": SYNC_ITEM_NAME, "price": 9.99}
    r = requests.post(
        f"{API}/api/admin/menu",
        headers=_auth_headers(),
        json=payload,
        timeout=15,
    )
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text[:500]}"
    body = r.json()
    # id can be "id" or "_id"
    item_id = body.get("id") or body.get("_id") or body.get("item_id")
    assert item_id, f"no id returned in create response: {body}"
    state["menu_item_id"] = item_id


def test_12_new_item_visible_on_loyalty_host():
    r = requests.get(f"{LOYALTY}/api/menu", timeout=15)
    assert r.status_code == 200
    names = [it.get("name") for it in r.json()]
    assert SYNC_ITEM_NAME in names, f"item not present on loyalty: last10={names[-10:]}"


def test_13_new_item_visible_on_api_host():
    r = requests.get(f"{API}/api/menu", timeout=15)
    assert r.status_code == 200
    names = [it.get("name") for it in r.json()]
    assert SYNC_ITEM_NAME in names, f"item not present on api host: last10={names[-10:]}"


def test_14_menu_version_incremented():
    r = requests.get(f"{LOYALTY}/api/menu/version", timeout=15)
    assert r.status_code == 200
    new_v = r.json()
    old_v = state["baseline_version"] or {}
    # Accept either `count` bump or `rev` bump
    old_count = old_v.get("count")
    new_count = new_v.get("count")
    old_rev = old_v.get("rev")
    new_rev = new_v.get("rev")
    count_bumped = (
        old_count is not None and new_count is not None and new_count == old_count + 1
    )
    rev_bumped = old_rev is not None and new_rev is not None and new_rev > old_rev
    assert count_bumped or rev_bumped, (
        f"neither count nor rev bumped: old={old_v} new={new_v}"
    )


def test_15_delete_menu_item():
    item_id = state["menu_item_id"]
    r = requests.delete(
        f"{API}/api/admin/menu/{item_id}",
        headers=_auth_headers(),
        timeout=15,
    )
    assert r.status_code in (200, 204), (
        f"delete failed: {r.status_code} {r.text[:500]}"
    )


def test_16_item_removed_from_both_hosts():
    r1 = requests.get(f"{LOYALTY}/api/menu", timeout=15)
    r2 = requests.get(f"{API}/api/menu", timeout=15)
    n1 = [it.get("name") for it in r1.json()]
    n2 = [it.get("name") for it in r2.json()]
    assert SYNC_ITEM_NAME not in n1, "item still on loyalty host after delete"
    assert SYNC_ITEM_NAME not in n2, "item still on api host after delete"


# =====================================================================
# Reservation write-then-read (tests 17-20)
# =====================================================================
def test_17_create_guest_reservation_on_loyalty():
    payload = {
        "date": "2026-08-15",
        "time": "19:30",
        "zone": "indoor",
        "name": SYNC_GUEST_NAME,
        "phone": "+33600000123",
        "people": 2,
        "guests": 2,
    }
    r = requests.post(
        f"{LOYALTY}/api/reservations/guest",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=15,
    )
    assert r.status_code in (200, 201), (
        f"guest reservation failed: {r.status_code} {r.text[:500]}"
    )
    body = r.json()
    rid = (
        body.get("id")
        or body.get("_id")
        or body.get("reservation_id")
        or (body.get("reservation") or {}).get("id")
    )
    state["reservation_id"] = rid  # may be None; not required for the assertions


def _list_admin_reservations(base_url):
    # Try period=all first, then no param
    for params in ({"period": "all"}, None):
        r = requests.get(
            f"{base_url}/api/admin/reservations",
            headers=_auth_headers(),
            params=params,
            timeout=20,
        )
        if r.status_code == 200:
            data = r.json()
            # Response may be a list or an object with a `reservations` key
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                for key in ("reservations", "items", "data", "results"):
                    if key in data and isinstance(data[key], list):
                        return data[key]
                # fallback: flatten nested groups (e.g. today/upcoming/past)
                flat = []
                for v in data.values():
                    if isinstance(v, list):
                        flat.extend(v)
                if flat:
                    return flat
            raise AssertionError(f"unexpected reservations shape: {type(data)} keys={list(data.keys()) if isinstance(data, dict) else 'n/a'}")
    raise AssertionError(f"could not list reservations: {r.status_code} {r.text[:300]}")


def test_18_reservation_visible_via_api_host():
    resvs = _list_admin_reservations(API)
    names = [r.get("name") or r.get("customer_name") or r.get("guest_name") for r in resvs]
    assert SYNC_GUEST_NAME in names, (
        f"reservation not visible via api host; found {len(resvs)} total, last names={names[-15:]}"
    )


def test_19_reservation_visible_via_loyalty_host():
    resvs = _list_admin_reservations(LOYALTY)
    names = [r.get("name") or r.get("customer_name") or r.get("guest_name") for r in resvs]
    assert SYNC_GUEST_NAME in names, (
        f"reservation not visible via loyalty host; found {len(resvs)}"
    )


def test_20_cleanup_reservation():
    """Best-effort cleanup; leaves reservation if no DELETE endpoint exists."""
    rid = state["reservation_id"]
    if not rid:
        # Try to look up by name to find the id
        resvs = _list_admin_reservations(API)
        for res in resvs:
            if (res.get("name") or res.get("customer_name") or res.get("guest_name")) == SYNC_GUEST_NAME:
                rid = res.get("id") or res.get("_id") or res.get("reservation_id")
                break
    if not rid:
        pytest.skip("no reservation id found for cleanup; test reservation left in DB")

    # Try a few likely delete paths
    for path in (
        f"{API}/api/admin/reservations/{rid}",
        f"{API}/api/reservations/{rid}",
    ):
        r = requests.delete(path, headers=_auth_headers(), timeout=15)
        if r.status_code in (200, 204):
            return
    pytest.skip(
        f"no DELETE endpoint accepted reservation cleanup for id={rid}; leaving __SYNC_TEST_GUEST__ in DB"
    )
