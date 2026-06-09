"""
Pizza Denfert — Iteration 5 backend tests.

Covers the new reservation-zones feature and the admin capacity settings
endpoints introduced in iteration 5:

  - GET  /api/reservations/availability?date=&time=
  - POST /api/reservations            (zone aware, 409 when full)
  - POST /api/reservations/guest      (zone aware, 409 when full)
  - GET  /api/admin/settings/capacity (admin only)
  - PUT  /api/admin/settings/capacity (owner/manager only)

Reservation documents are stored in MongoDB ; we use the same unique
slots within this file and reuse pymongo for one direct DB tweak
(setting status:"cancelled" — no public cancel endpoint exists).
"""
import os
import secrets
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")

ADMIN_EMAIL = "admin@pizzadenfert.fr"
ADMIN_PASSWORD = "Admin1234!"

# Unique slots — chosen by the review request to avoid clashes with previous runs.
SLOT_INDEP_DATE = "2026-08-01"
SLOT_INDEP_TIME = "19:00"
SLOT_TERRACE_FILL_DATE = "2026-08-02"
SLOT_TERRACE_FILL_TIME = "12:00"
SLOT_VALIDATION_DATE = "2026-08-03"
SLOT_VALIDATION_TIME = "20:30"
SLOT_CANCEL_DATE = "2026-08-04"
SLOT_CANCEL_TIME = "13:00"
SLOT_LOWER_CAP_DATE = "2026-08-05"
SLOT_LOWER_CAP_TIME = "21:00"


# ---------------------------------------------------------------------------
# Direct DB access (only used for cleanup / cancellation simulation)
# ---------------------------------------------------------------------------
def _db():
    env_path = Path("/app/backend/.env")
    cfg = dotenv_values(env_path) if env_path.exists() else {}
    mongo_url = cfg.get("MONGO_URL") or os.environ.get("MONGO_URL")
    db_name = cfg.get("DB_NAME") or os.environ.get("DB_NAME")
    assert mongo_url and db_name, "MONGO_URL/DB_NAME must be configured"
    return MongoClient(mongo_url)[db_name]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
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
    data = r.json()
    assert data["user"]["is_admin"] is True
    return data["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _unique_phone() -> str:
    return "+3361" + str(secrets.randbelow(10 ** 8)).zfill(8)


def _make_customer(api) -> dict:
    """Create a fresh OTP-verified customer and return a small dict."""
    phone = _unique_phone()
    r = api.post(
        f"{BASE_URL}/api/auth/otp/request",
        json={"phone": phone, "name": "TEST Zones Customer"},
    )
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    r2 = api.post(
        f"{BASE_URL}/api/auth/otp/verify",
        json={"phone": phone, "code": code, "name": "TEST Zones Customer"},
    )
    assert r2.status_code == 200, r2.text
    d = r2.json()
    return {"token": d["token"], "phone": phone, "name": d["user"]["name"], "user_id": d["user"]["user_id"]}


@pytest.fixture(scope="module")
def customer(api):
    return _make_customer(api)


@pytest.fixture(scope="module")
def customer_headers(customer):
    return {"Authorization": f"Bearer {customer['token']}"}


# ---------------------------------------------------------------------------
# Module-level setup / teardown: snapshot & restore capacity + cleanup
# ---------------------------------------------------------------------------
ALL_TEST_SLOTS = [
    (SLOT_INDEP_DATE, SLOT_INDEP_TIME),
    (SLOT_TERRACE_FILL_DATE, SLOT_TERRACE_FILL_TIME),
    (SLOT_VALIDATION_DATE, SLOT_VALIDATION_TIME),
    (SLOT_CANCEL_DATE, SLOT_CANCEL_TIME),
    (SLOT_LOWER_CAP_DATE, SLOT_LOWER_CAP_TIME),
]


@pytest.fixture(scope="module", autouse=True)
def _snapshot_and_cleanup(api):
    """
    - Save current capacity.
    - Pre-clean reservations on the slots we will use to avoid leftovers from
      previous test runs.
    - After all tests, restore capacity and clean our reservations.
    """
    db = _db()

    # 1. Capacity snapshot (force seed first by calling endpoint).
    api.get(f"{BASE_URL}/api/reservations/availability?date=2026-08-01&time=19:00")
    snap_doc = db.app_settings.find_one({"key": "capacity"})
    snap = {"indoor": int(snap_doc["indoor"]), "terrace": int(snap_doc["terrace"])} if snap_doc else {"indoor": 30, "terrace": 20}

    # 2. Pre-cleanup test slots so the tests start from a clean state.
    for d, t in ALL_TEST_SLOTS:
        db.reservations.delete_many({"date": d, "time": t})

    yield snap

    # 3. Post cleanup — wipe our reservations, restore capacity.
    for d, t in ALL_TEST_SLOTS:
        db.reservations.delete_many({"date": d, "time": t})

    db.app_settings.update_one(
        {"key": "capacity"},
        {"$set": {"key": "capacity", "indoor": snap["indoor"], "terrace": snap["terrace"]}},
        upsert=True,
    )


def _availability(api, date: str, time: str) -> dict:
    r = api.get(f"{BASE_URL}/api/reservations/availability", params={"date": date, "time": time})
    assert r.status_code == 200, r.text
    return r.json()


# ===========================================================================
# A. Default capacity seed
# ===========================================================================
class TestADefaultCapacitySeed:
    def test_defaults_indoor_30_terrace_20(self, api):
        # Force a fresh seed by clearing and calling the public endpoint.
        db = _db()
        db.app_settings.delete_one({"key": "capacity"})

        data = _availability(api, "2026-09-09", "19:00")
        assert data["zones"]["indoor"]["capacity"] == 30
        assert data["zones"]["terrace"]["capacity"] == 20
        # Booked at a fresh slot should be 0.
        assert data["zones"]["indoor"]["booked"] == 0
        assert data["zones"]["terrace"]["booked"] == 0
        assert data["zones"]["indoor"]["available"] == 30
        assert data["zones"]["terrace"]["available"] == 20
        assert data["zones"]["indoor"]["full"] is False
        assert data["zones"]["terrace"]["full"] is False

        # The settings doc should now exist with defaults.
        doc = db.app_settings.find_one({"key": "capacity"})
        assert doc is not None
        assert int(doc["indoor"]) == 30
        assert int(doc["terrace"]) == 20


# ===========================================================================
# B. Independent zone math at a single slot
# ===========================================================================
class TestBZoneMath:
    def test_indoor_fills_terrace_unaffected(self, api, customer_headers):
        d, t = SLOT_INDEP_DATE, SLOT_INDEP_TIME

        def book(guests: int, zone: str = "indoor"):
            return api.post(
                f"{BASE_URL}/api/reservations",
                headers=customer_headers,
                json={
                    "date": d, "time": t, "guests": guests, "zone": zone,
                    "name": "TEST B", "phone": "+33600000001",
                },
            )

        # Start: 30 / 20
        av = _availability(api, d, t)
        assert av["zones"]["indoor"]["available"] == 30
        assert av["zones"]["terrace"]["available"] == 20

        # +4 indoor -> 26
        r = book(4)
        assert r.status_code == 200, r.text
        assert r.json()["zone"] == "indoor"
        assert _availability(api, d, t)["zones"]["indoor"]["available"] == 26

        # +16 indoor -> 10
        r = book(16)
        assert r.status_code == 200, r.text
        assert _availability(api, d, t)["zones"]["indoor"]["available"] == 10

        # +10 indoor -> 0 / full
        r = book(10)
        assert r.status_code == 200, r.text
        av = _availability(api, d, t)
        assert av["zones"]["indoor"]["available"] == 0
        assert av["zones"]["indoor"]["full"] is True
        assert av["zones"]["indoor"]["booked"] == 30

        # +1 indoor -> 409
        r = book(1)
        assert r.status_code == 409, r.text

        # Terrace untouched throughout.
        av = _availability(api, d, t)
        assert av["zones"]["terrace"]["available"] == 20
        assert av["zones"]["terrace"]["booked"] == 0
        assert av["zones"]["terrace"]["full"] is False


# ===========================================================================
# C. Independence proof at a different slot — terrace fills, indoor untouched
# ===========================================================================
class TestCTerraceFillsIndoorOpen:
    def test_terrace_fills_indoor_open(self, api, customer_headers):
        d, t = SLOT_TERRACE_FILL_DATE, SLOT_TERRACE_FILL_TIME

        # Fill terrace exactly to 20 with two bookings.
        r1 = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": d, "time": t, "guests": 15, "zone": "terrace",
                  "name": "TEST C1", "phone": "+33600000002"},
        )
        assert r1.status_code == 200, r1.text
        r2 = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": d, "time": t, "guests": 5, "zone": "terrace",
                  "name": "TEST C2", "phone": "+33600000002"},
        )
        assert r2.status_code == 200, r2.text

        av = _availability(api, d, t)
        assert av["zones"]["terrace"]["available"] == 0
        assert av["zones"]["terrace"]["full"] is True

        # Indoor still fully open at the same slot.
        assert av["zones"]["indoor"]["available"] == 30
        assert av["zones"]["indoor"]["full"] is False

        # Indoor booking should still succeed.
        r3 = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": d, "time": t, "guests": 2, "zone": "indoor",
                  "name": "TEST C3", "phone": "+33600000002"},
        )
        assert r3.status_code == 200, r3.text
        assert r3.json()["zone"] == "indoor"

        # Another terrace booking should be rejected.
        r4 = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": d, "time": t, "guests": 1, "zone": "terrace",
                  "name": "TEST C4", "phone": "+33600000002"},
        )
        assert r4.status_code == 409, r4.text


# ===========================================================================
# D. Validation
# ===========================================================================
class TestDValidation:
    def test_zone_omitted_defaults_to_indoor(self, api, customer_headers):
        # No zone field -> should default to "indoor" and succeed.
        r = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": SLOT_VALIDATION_DATE, "time": SLOT_VALIDATION_TIME,
                  "guests": 2, "name": "TEST D1", "phone": "+33600000003"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["zone"] == "indoor"

    def test_invalid_zone_returns_400(self, api, customer_headers):
        r = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": SLOT_VALIDATION_DATE, "time": SLOT_VALIDATION_TIME,
                  "guests": 2, "zone": "patio",
                  "name": "TEST D2", "phone": "+33600000003"},
        )
        assert r.status_code == 400, r.text

    def test_guests_zero_returns_400(self, api, customer_headers):
        r = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": SLOT_VALIDATION_DATE, "time": SLOT_VALIDATION_TIME,
                  "guests": 0, "zone": "indoor",
                  "name": "TEST D3", "phone": "+33600000003"},
        )
        assert r.status_code == 400, r.text

    def test_guests_twenty_one_returns_400(self, api, customer_headers):
        r = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": SLOT_VALIDATION_DATE, "time": SLOT_VALIDATION_TIME,
                  "guests": 21, "zone": "indoor",
                  "name": "TEST D4", "phone": "+33600000003"},
        )
        assert r.status_code == 400, r.text

    def test_over_cap_returns_409(self, api, customer_headers):
        # Reuse the validation slot; we've already booked 2 indoor (test_zone_omitted_defaults_to_indoor).
        # Fill to exactly 30 indoor.
        r_a = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": SLOT_VALIDATION_DATE, "time": SLOT_VALIDATION_TIME,
                  "guests": 20, "zone": "indoor",
                  "name": "TEST D5", "phone": "+33600000003"},
        )
        assert r_a.status_code == 200, r_a.text
        r_b = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": SLOT_VALIDATION_DATE, "time": SLOT_VALIDATION_TIME,
                  "guests": 8, "zone": "indoor",
                  "name": "TEST D6", "phone": "+33600000003"},
        )
        assert r_b.status_code == 200, r_b.text
        # 2 + 20 + 8 = 30. Now over-cap.
        r_c = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": SLOT_VALIDATION_DATE, "time": SLOT_VALIDATION_TIME,
                  "guests": 1, "zone": "indoor",
                  "name": "TEST D7", "phone": "+33600000003"},
        )
        assert r_c.status_code == 409, r_c.text


# ===========================================================================
# E. Admin capacity endpoints
# ===========================================================================
class TestEAdminCapacityEndpoints:
    def test_get_capacity_as_admin(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/settings/capacity", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "indoor" in body and "terrace" in body
        assert isinstance(body["indoor"], int) and isinstance(body["terrace"], int)

    def test_get_capacity_as_non_admin(self, api, customer_headers):
        r = api.get(f"{BASE_URL}/api/admin/settings/capacity", headers=customer_headers)
        assert r.status_code == 403, r.text

    def test_get_capacity_no_auth_returns_401(self, api):
        r = api.get(f"{BASE_URL}/api/admin/settings/capacity")
        assert r.status_code == 401, r.text

    def test_put_capacity_as_owner(self, api, admin_headers):
        r = api.put(
            f"{BASE_URL}/api/admin/settings/capacity",
            headers=admin_headers,
            json={"indoor": 50, "terrace": 25},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["indoor"] == 50
        assert body["terrace"] == 25

        # Availability should echo the new caps on a fresh slot.
        av = _availability(api, "2026-09-15", "19:00")
        assert av["zones"]["indoor"]["capacity"] == 50
        assert av["zones"]["terrace"]["capacity"] == 25

    def test_put_capacity_indoor_negative(self, api, admin_headers):
        r = api.put(
            f"{BASE_URL}/api/admin/settings/capacity",
            headers=admin_headers,
            json={"indoor": -1, "terrace": 25},
        )
        assert r.status_code == 400, r.text

    def test_put_capacity_indoor_over_500(self, api, admin_headers):
        r = api.put(
            f"{BASE_URL}/api/admin/settings/capacity",
            headers=admin_headers,
            json={"indoor": 501, "terrace": 25},
        )
        assert r.status_code == 400, r.text

    def test_put_capacity_terrace_negative(self, api, admin_headers):
        r = api.put(
            f"{BASE_URL}/api/admin/settings/capacity",
            headers=admin_headers,
            json={"indoor": 30, "terrace": -1},
        )
        assert r.status_code == 400, r.text

    def test_put_capacity_terrace_over_500(self, api, admin_headers):
        r = api.put(
            f"{BASE_URL}/api/admin/settings/capacity",
            headers=admin_headers,
            json={"indoor": 30, "terrace": 501},
        )
        assert r.status_code == 400, r.text

    def test_put_capacity_as_customer_returns_403(self, api, customer_headers):
        r = api.put(
            f"{BASE_URL}/api/admin/settings/capacity",
            headers=customer_headers,
            json={"indoor": 30, "terrace": 20},
        )
        assert r.status_code == 403, r.text

    def test_lower_cap_below_existing_bookings_rejects_new(
        self, api, admin_headers, customer_headers
    ):
        """Capacity lowered below current bookings -> existing reservations
        remain untouched, new bookings get 409."""
        d, t = SLOT_LOWER_CAP_DATE, SLOT_LOWER_CAP_TIME

        # Ensure capacity > 0 first (use 50 from previous test).
        # Book 10 indoor.
        rb = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": d, "time": t, "guests": 10, "zone": "indoor",
                  "name": "TEST E1", "phone": "+33600000005"},
        )
        assert rb.status_code == 200, rb.text
        existing_res_id = rb.json()["id"]

        # Lower indoor cap to 5 (below current 10 booked).
        r = api.put(
            f"{BASE_URL}/api/admin/settings/capacity",
            headers=admin_headers,
            json={"indoor": 5, "terrace": 25},
        )
        assert r.status_code == 200, r.text

        # Availability shows booked 10, capacity 5, available 0 (clamped), full=True.
        av = _availability(api, d, t)
        assert av["zones"]["indoor"]["capacity"] == 5
        assert av["zones"]["indoor"]["booked"] == 10
        assert av["zones"]["indoor"]["available"] == 0
        assert av["zones"]["indoor"]["full"] is True

        # New booking rejected with 409.
        rn = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": d, "time": t, "guests": 1, "zone": "indoor",
                  "name": "TEST E2", "phone": "+33600000005"},
        )
        assert rn.status_code == 409, rn.text

        # Existing reservation still present in db.
        db = _db()
        doc = db.reservations.find_one({"id": existing_res_id})
        assert doc is not None
        assert doc["status"] == "confirmed"
        assert doc["guests"] == 10

    def test_restore_original_capacity(self, api, admin_headers, _snapshot_and_cleanup):
        """Explicit test to ensure the original capacity is restored.
        (The autouse fixture restores after the module, but we also call the
        admin endpoint here so the API surface acts as the source of truth.)"""
        snap = _snapshot_and_cleanup  # captured snapshot dict
        r = api.put(
            f"{BASE_URL}/api/admin/settings/capacity",
            headers=admin_headers,
            json={"indoor": snap["indoor"], "terrace": snap["terrace"]},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["indoor"] == snap["indoor"]
        assert body["terrace"] == snap["terrace"]


# ===========================================================================
# F. Cancelled reservations excluded from booked count
# ===========================================================================
class TestFCancelledExcluded:
    def test_cancelled_status_excluded(self, api, customer_headers):
        d, t = SLOT_CANCEL_DATE, SLOT_CANCEL_TIME

        # Need to know current indoor capacity (may still be the modified value).
        cap_doc = _db().app_settings.find_one({"key": "capacity"})
        indoor_cap = int(cap_doc["indoor"]) if cap_doc else 30

        # Book 4 indoor.
        rb = api.post(
            f"{BASE_URL}/api/reservations",
            headers=customer_headers,
            json={"date": d, "time": t, "guests": 4, "zone": "indoor",
                  "name": "TEST F1", "phone": "+33600000006"},
        )
        assert rb.status_code == 200, rb.text
        res_id = rb.json()["id"]

        av = _availability(api, d, t)
        assert av["zones"]["indoor"]["booked"] == 4
        assert av["zones"]["indoor"]["available"] == indoor_cap - 4

        # Directly mark as cancelled in mongo.
        db = _db()
        upd = db.reservations.update_one({"id": res_id}, {"$set": {"status": "cancelled"}})
        assert upd.modified_count == 1

        # Availability should reflect the cancellation: booked=0.
        av2 = _availability(api, d, t)
        assert av2["zones"]["indoor"]["booked"] == 0
        assert av2["zones"]["indoor"]["available"] == indoor_cap
        assert av2["zones"]["indoor"]["full"] is False


# ===========================================================================
# Bonus — guest reservation also honours zone & validates inputs
# ===========================================================================
class TestGuestEndpointZones:
    def test_guest_zone_invalid_returns_400(self, api):
        r = api.post(
            f"{BASE_URL}/api/reservations/guest",
            json={"date": "2026-09-20", "time": "19:00", "guests": 2,
                  "zone": "patio", "name": "GUEST", "phone": "+33600000007"},
        )
        assert r.status_code == 400, r.text

    def test_guest_zone_defaults_to_indoor(self, api):
        r = api.post(
            f"{BASE_URL}/api/reservations/guest",
            json={"date": "2026-09-20", "time": "20:00", "guests": 2,
                  "name": "GUEST", "phone": "+33600000007"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["zone"] == "indoor"
        # Cleanup
        _db().reservations.delete_one({"id": body["id"]})
