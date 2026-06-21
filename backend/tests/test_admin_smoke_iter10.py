"""Iter10 backend smoke — confirm admin endpoints still respond after the
main/loyalty mode split (no new endpoints in this iteration)."""
import os
import requests
import pytest

BASE = os.environ.get("EXPO_BACKEND_URL") or "https://denfert-pizzeria.preview.emergentagent.com"
ADMIN_EMAIL = "admin@pizzadenfert.fr"
ADMIN_PW = "Admin1234!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert data.get("token"), "no token in login response"
    assert data["user"].get("is_admin") is True, "admin flag missing"
    return data["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_admin_reservations_list(headers):
    r = requests.get(f"{BASE}/api/admin/reservations", headers=headers, timeout=15)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert "items" in body


def test_menu_public():
    # CMS menu is served via Supabase + /api/menu (no /api/admin/menu route by design)
    r = requests.get(f"{BASE}/api/menu", timeout=15)
    assert r.status_code == 200, r.text[:200]
    assert isinstance(r.json(), list)


def test_admin_settings_capacity(headers):
    r = requests.get(f"{BASE}/api/admin/settings/capacity", headers=headers, timeout=15)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert "indoor" in data and "terrace" in data


def test_admin_ads_slides(headers):
    r = requests.get(f"{BASE}/api/admin/ads/slides", headers=headers, timeout=15)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert "slides" in body


def test_admin_ads_settings(headers):
    r = requests.get(f"{BASE}/api/admin/ads/settings", headers=headers, timeout=15)
    assert r.status_code == 200, r.text[:200]


def test_admin_dashboard(headers):
    r = requests.get(f"{BASE}/api/admin/dashboard?period=all", headers=headers, timeout=20)
    assert r.status_code == 200, r.text[:200]


def test_admin_staff_list(headers):
    r = requests.get(f"{BASE}/api/admin/staff", headers=headers, timeout=15)
    assert r.status_code == 200, r.text[:200]


def test_public_ads_slides_no_auth():
    # kiosk fetches w/o auth
    r = requests.get(f"{BASE}/api/ads/slides", timeout=15)
    assert r.status_code == 200, r.text[:200]
