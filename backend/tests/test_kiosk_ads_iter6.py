"""
Iteration 6 — Kiosk / Ads-Management backend smoke-tests + backward-compat
checks for Pizza Denfert.

Covers (per review request):
  1. PUBLIC GET /api/ads/slides — shape + settings keys/types.
  2. ADMIN auth gating (no token, wrong token) on /api/admin/ads/* and
     PUT /api/admin/ads/settings.
  3. ADMIN happy path — login, list, create, patch, delete a slide.
  4. ADMIN settings — get + put round-trip, restore to default after test.
  5. Backwards-compat sanity — /api/auth/login, /api/menu,
     /api/reservations/me.

Runs against EXPO_PUBLIC_BACKEND_URL (Kubernetes ingress) with the /api
prefix. No prod-data mutations beyond a single TEST_SMOKE slide that is
created + deleted within the same test, and a transient idle_seconds tweak
that is restored at module teardown.
"""
import os
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")

ADMIN_EMAIL = "admin@pizzadenfert.fr"
ADMIN_PASSWORD = "Admin1234!"

SETTINGS_KEYS = {
    "idle_seconds": int,
    "loop": bool,
    "default_duration_ms": int,
    "show_section_titles": bool,
}


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body and body["token"], "Missing token in admin login response"
    assert body.get("user", {}).get("is_admin") is True, "Admin user must have is_admin=True"
    return body["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module", autouse=True)
def restore_kiosk_settings(api, auth_headers):
    """Snapshot kiosk settings before tests run, restore them at teardown."""
    pre = api.get(f"{BASE_URL}/api/admin/ads/settings", headers=auth_headers)
    saved = pre.json() if pre.status_code == 200 else None
    yield
    if saved:
        # Restore the original idle_seconds (and any other knobs we might have touched)
        api.put(
            f"{BASE_URL}/api/admin/ads/settings",
            headers=auth_headers,
            json={
                "idle_seconds": int(saved.get("idle_seconds", 30)),
                "loop": bool(saved.get("loop", True)),
                "default_duration_ms": int(saved.get("default_duration_ms", 5000)),
                "show_section_titles": bool(saved.get("show_section_titles", True)),
            },
        )


# ====================================================================
# 1. PUBLIC GET /api/ads/slides
# ====================================================================
class TestPublicSlides:
    """Public kiosk endpoint — no auth required."""

    def test_public_slides_returns_200_with_expected_shape(self, api):
        r = api.get(f"{BASE_URL}/api/ads/slides")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert isinstance(body, dict), "Body must be a JSON object"
        assert "slides" in body, "Missing 'slides' key in response"
        assert "settings" in body, "Missing 'settings' key in response"
        assert isinstance(body["slides"], list), "'slides' must be an array"
        assert isinstance(body["settings"], dict), "'settings' must be an object"

    def test_public_slides_settings_keys_and_types(self, api):
        body = api.get(f"{BASE_URL}/api/ads/slides").json()
        settings = body["settings"]
        for key, typ in SETTINGS_KEYS.items():
            assert key in settings, f"Missing settings key: {key}"
            # bool is a subclass of int in Python; check bool first to avoid false positives
            if typ is bool:
                assert isinstance(settings[key], bool), (
                    f"settings[{key!r}] must be bool, got {type(settings[key]).__name__}"
                )
            else:
                assert isinstance(settings[key], typ) and not isinstance(settings[key], bool), (
                    f"settings[{key!r}] must be {typ.__name__}, got "
                    f"{type(settings[key]).__name__}"
                )

    def test_public_slides_only_active_and_well_formed(self, api):
        body = api.get(f"{BASE_URL}/api/ads/slides").json()
        for s in body["slides"]:
            # Public endpoint filters to active=True
            assert s.get("active", True) is True, f"Inactive slide leaked to public: {s}"
            # Required fields on every slide
            assert "id" in s and s["id"], "Slide missing id"
            assert s.get("section") in ("loyalty", "experience", "ingredients"), (
                f"Bad section: {s.get('section')!r}"
            )
            assert isinstance(s.get("title", ""), str)
            assert isinstance(s.get("order", 0), int)
            assert isinstance(s.get("duration_ms", 0), int)


# ====================================================================
# 2. Admin auth gating
# ====================================================================
class TestAdminAuthGate:
    """All /api/admin/ads/* + PUT /api/admin/ads/settings must reject anon/garbage tokens."""

    BAD_HEADERS = [
        ("no_header", {}),
        ("garbage_bearer", {"Authorization": "Bearer not-a-real-token-xyz"}),
        ("wrong_scheme", {"Authorization": "Basic admin:admin"}),
    ]

    @pytest.mark.parametrize("label,headers", BAD_HEADERS, ids=[x[0] for x in BAD_HEADERS])
    def test_get_admin_slides_rejected(self, api, label, headers):
        r = api.get(f"{BASE_URL}/api/admin/ads/slides", headers=headers)
        assert r.status_code in (401, 403), (
            f"[{label}] expected 401/403, got {r.status_code}: {r.text}"
        )

    @pytest.mark.parametrize("label,headers", BAD_HEADERS, ids=[x[0] for x in BAD_HEADERS])
    def test_post_admin_slides_rejected(self, api, label, headers):
        r = api.post(
            f"{BASE_URL}/api/admin/ads/slides",
            headers=headers,
            json={"section": "experience", "title": "TEST_SMOKE_UNAUTH", "duration_ms": 5000, "active": True},
        )
        assert r.status_code in (401, 403), (
            f"[{label}] expected 401/403, got {r.status_code}: {r.text}"
        )

    @pytest.mark.parametrize("label,headers", BAD_HEADERS, ids=[x[0] for x in BAD_HEADERS])
    def test_patch_admin_slide_rejected(self, api, label, headers):
        r = api.patch(
            f"{BASE_URL}/api/admin/ads/slides/non-existent-id",
            headers=headers,
            json={"title": "shouldnotapply"},
        )
        assert r.status_code in (401, 403), (
            f"[{label}] expected 401/403, got {r.status_code}: {r.text}"
        )

    @pytest.mark.parametrize("label,headers", BAD_HEADERS, ids=[x[0] for x in BAD_HEADERS])
    def test_delete_admin_slide_rejected(self, api, label, headers):
        r = api.delete(
            f"{BASE_URL}/api/admin/ads/slides/non-existent-id",
            headers=headers,
        )
        assert r.status_code in (401, 403), (
            f"[{label}] expected 401/403, got {r.status_code}: {r.text}"
        )

    @pytest.mark.parametrize("label,headers", BAD_HEADERS, ids=[x[0] for x in BAD_HEADERS])
    def test_put_admin_settings_rejected(self, api, label, headers):
        r = api.put(
            f"{BASE_URL}/api/admin/ads/settings",
            headers=headers,
            json={"idle_seconds": 99},
        )
        assert r.status_code in (401, 403), (
            f"[{label}] expected 401/403, got {r.status_code}: {r.text}"
        )

    @pytest.mark.parametrize("label,headers", BAD_HEADERS, ids=[x[0] for x in BAD_HEADERS])
    def test_get_admin_settings_rejected(self, api, label, headers):
        r = api.get(f"{BASE_URL}/api/admin/ads/settings", headers=headers)
        assert r.status_code in (401, 403), (
            f"[{label}] expected 401/403, got {r.status_code}: {r.text}"
        )


# ====================================================================
# 3. Admin slides CRUD — happy path
# ====================================================================
class TestAdminSlidesCRUD:
    """Login → list → create → patch → delete a slide."""

    def test_admin_list_slides_returns_list(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/admin/ads/slides", headers=auth_headers)
        assert r.status_code == 200, f"GET admin slides failed: {r.status_code} {r.text}"
        body = r.json()
        assert "slides" in body and isinstance(body["slides"], list)
        # Default seed should have populated at minimum 14 slides if collection was empty
        assert len(body["slides"]) >= 1, "Admin list returned 0 slides"

    def test_create_patch_delete_slide(self, api, auth_headers):
        # CREATE
        create_body = {
            "section": "experience",
            "title": "TEST_SMOKE",
            "duration_ms": 5000,
            "active": True,
        }
        r = api.post(
            f"{BASE_URL}/api/admin/ads/slides",
            headers=auth_headers,
            json=create_body,
        )
        assert r.status_code == 201, f"Create returned {r.status_code}: {r.text}"
        created = r.json()
        assert "id" in created and created["id"], "Created slide missing id"
        assert created["section"] == "experience"
        assert created["title"] == "TEST_SMOKE"
        assert created["duration_ms"] == 5000
        assert created["active"] is True
        sid = created["id"]

        try:
            # Verify it shows up in the admin list
            lst = api.get(f"{BASE_URL}/api/admin/ads/slides", headers=auth_headers).json()
            assert any(s["id"] == sid for s in lst["slides"]), "Created slide missing from admin list"

            # PATCH
            patch_body = {"title": "TEST_SMOKE_UPDATED", "duration_ms": 7500}
            r2 = api.patch(
                f"{BASE_URL}/api/admin/ads/slides/{sid}",
                headers=auth_headers,
                json=patch_body,
            )
            assert r2.status_code == 200, f"Patch returned {r2.status_code}: {r2.text}"
            patched = r2.json()
            assert patched.get("title") == "TEST_SMOKE_UPDATED"
            assert patched.get("duration_ms") == 7500
            # Untouched fields should remain
            assert patched.get("section") == "experience"
            assert patched.get("active") is True
        finally:
            # DELETE — always attempt, even if intermediate assertion failed
            r3 = api.delete(
                f"{BASE_URL}/api/admin/ads/slides/{sid}",
                headers=auth_headers,
            )
            assert r3.status_code == 200, f"Delete returned {r3.status_code}: {r3.text}"
            assert r3.json().get("deleted") is True

            # GET admin list should no longer contain it
            lst_after = api.get(f"{BASE_URL}/api/admin/ads/slides", headers=auth_headers).json()
            assert not any(s["id"] == sid for s in lst_after["slides"]), (
                "Deleted slide still present in admin list"
            )

            # And the public endpoint must not return it either
            pub = api.get(f"{BASE_URL}/api/ads/slides").json()
            assert not any(s["id"] == sid for s in pub["slides"]), (
                "Deleted slide still present in public response"
            )

    def test_delete_non_existent_returns_404(self, api, auth_headers):
        r = api.delete(
            f"{BASE_URL}/api/admin/ads/slides/does-not-exist-xyz",
            headers=auth_headers,
        )
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"

    def test_create_invalid_section_returns_400(self, api, auth_headers):
        r = api.post(
            f"{BASE_URL}/api/admin/ads/slides",
            headers=auth_headers,
            json={"section": "bogus", "title": "TEST_BAD_SECTION", "duration_ms": 5000},
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"


# ====================================================================
# 4. Admin kiosk settings
# ====================================================================
class TestAdminKioskSettings:
    """GET + PUT /api/admin/ads/settings round-trip with restore."""

    def test_get_settings_shape(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/admin/ads/settings", headers=auth_headers)
        assert r.status_code == 200, f"GET settings failed: {r.status_code} {r.text}"
        body = r.json()
        for key, typ in SETTINGS_KEYS.items():
            assert key in body, f"Missing key {key}"
            if typ is bool:
                assert isinstance(body[key], bool)
            else:
                assert isinstance(body[key], typ) and not isinstance(body[key], bool)

    def test_put_settings_updates_and_persists(self, api, auth_headers):
        # Set idle_seconds = 45
        r = api.put(
            f"{BASE_URL}/api/admin/ads/settings",
            headers=auth_headers,
            json={"idle_seconds": 45},
        )
        assert r.status_code == 200, f"PUT settings failed: {r.status_code} {r.text}"
        assert r.json().get("idle_seconds") == 45

        # Re-GET should reflect new value
        r2 = api.get(f"{BASE_URL}/api/admin/ads/settings", headers=auth_headers)
        assert r2.status_code == 200
        assert r2.json().get("idle_seconds") == 45, "idle_seconds=45 did not persist"

        # Public endpoint also exposes the same settings
        pub = api.get(f"{BASE_URL}/api/ads/slides").json()
        assert pub["settings"]["idle_seconds"] == 45, (
            "Public settings should reflect the updated idle_seconds"
        )

        # Restore to 30 as instructed by the review request
        r3 = api.put(
            f"{BASE_URL}/api/admin/ads/settings",
            headers=auth_headers,
            json={"idle_seconds": 30},
        )
        assert r3.status_code == 200
        assert r3.json().get("idle_seconds") == 30

        r4 = api.get(f"{BASE_URL}/api/admin/ads/settings", headers=auth_headers).json()
        assert r4["idle_seconds"] == 30, "Restore to 30 did not persist"

    def test_put_settings_rejects_out_of_range_idle_seconds(self, api, auth_headers):
        # Backend enforces 5..600
        r_low = api.put(
            f"{BASE_URL}/api/admin/ads/settings",
            headers=auth_headers,
            json={"idle_seconds": 1},
        )
        assert r_low.status_code == 400, (
            f"Expected 400 for idle_seconds<5, got {r_low.status_code}: {r_low.text}"
        )
        r_high = api.put(
            f"{BASE_URL}/api/admin/ads/settings",
            headers=auth_headers,
            json={"idle_seconds": 99999},
        )
        assert r_high.status_code == 400, (
            f"Expected 400 for idle_seconds>600, got {r_high.status_code}: {r_high.text}"
        )


# ====================================================================
# 5. Backwards-compat sanity checks (no regression in existing endpoints)
# ====================================================================
class TestBackwardsCompat:
    """Existing endpoints must remain green after the Phase-3 work."""

    def test_auth_login_admin(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
        d = r.json()
        assert "token" in d and d["token"]
        assert "user" in d
        assert d["user"].get("email", "").lower() == ADMIN_EMAIL
        assert d["user"].get("is_admin") is True

    def test_menu_endpoint_returns_list(self, api):
        r = api.get(f"{BASE_URL}/api/menu")
        assert r.status_code == 200, f"Menu failed: {r.status_code} {r.text}"
        items = r.json()
        assert isinstance(items, list), "/api/menu must return a JSON array"
        assert len(items) > 0, "Menu must not be empty in this environment"
        # Spot-check structure of a single menu item
        sample = items[0]
        assert "id" in sample, "Menu item missing 'id'"
        # Items in this app use 'name' (FR) for display
        assert "name" in sample or "title" in sample, "Menu item missing name/title"

    def test_reservations_me_with_admin_token(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/reservations/me", headers=auth_headers)
        assert r.status_code == 200, (
            f"GET /reservations/me failed: {r.status_code} {r.text}"
        )
        body = r.json()
        assert isinstance(body, list), "/reservations/me must return a JSON array (possibly empty)"
