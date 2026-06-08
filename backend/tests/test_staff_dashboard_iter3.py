"""
Iteration 3 — Pizza Denfert backend regression tests.

Covers:
A) GET  /api/admin/staff
B) PATCH /api/admin/staff/{user_id}/role
C) PATCH /api/admin/staff/{user_id}/disable
D) DELETE /api/admin/staff/{user_id}
E) POST /api/admin/customer/add-pizza  (with pizza_id)
F) GET  /api/admin/dashboard?period=...
G) Disabled-account auth check via cu()

Reuses fixtures/utilities from test_admin_flows.py where relevant; these
tests are self-contained for clarity.
"""
import os
import secrets
import pytest
import requests
from pymongo import MongoClient

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")

ADMIN_EMAIL = "admin@pizzadenfert.fr"
ADMIN_PASSWORD = "Admin1234!"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ---------- helpers ----------
def _unique_phone():
    return "+3361" + str(secrets.randbelow(10**8)).zfill(8)


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_user_id(api, admin_token):
    r = api.get(f"{BASE_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    # /auth/me returns the user object directly.
    return body.get("user_id") or body["user"]["user_id"]


@pytest.fixture(scope="module")
def customer(api):
    phone = _unique_phone()
    rq = api.post(f"{BASE_URL}/api/auth/otp/request",
                  json={"phone": phone, "name": "TEST iter3 customer"})
    assert rq.status_code == 200
    code = rq.json()["dev_code"]
    v = api.post(f"{BASE_URL}/api/auth/otp/verify",
                 json={"phone": phone, "code": code, "name": "TEST iter3 customer"})
    assert v.status_code == 200, v.text
    d = v.json()
    return {
        "token": d["token"],
        "user_id": d["user"]["user_id"],
        "qr_token": d["user"]["qr_token"],
        "phone": phone,
    }


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _create_staff(api, admin_token, role="staff", name_prefix="TEST iter3 staff"):
    phone = _unique_phone()
    r = api.post(f"{BASE_URL}/api/admin/staff/create",
                 json={"phone": phone, "name": f"{name_prefix} {role}", "role": role},
                 headers=_h(admin_token))
    assert r.status_code == 200, f"create staff failed: {r.status_code} {r.text}"
    return {"user_id": r.json()["created"]["user_id"], "phone": phone, "role": role}


def _otp_login(api, phone, name="TEST iter3"):
    rq = api.post(f"{BASE_URL}/api/auth/otp/request",
                  json={"phone": phone, "name": name})
    assert rq.status_code == 200, rq.text
    code = rq.json()["dev_code"]
    v = api.post(f"{BASE_URL}/api/auth/otp/verify",
                 json={"phone": phone, "code": code, "name": name})
    assert v.status_code == 200, v.text
    return v.json()


# ====================================================================
# A) GET /api/admin/staff
# ====================================================================
class TestListStaff:
    def test_list_staff_as_admin_contains_admin(self, api, admin_token, admin_user_id):
        r = api.get(f"{BASE_URL}/api/admin/staff", headers=_h(admin_token))
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        # Required keys on every row.
        required = {"user_id", "name", "email", "phone", "role",
                    "disabled", "is_self", "created_at"}
        for row in rows:
            missing = required - row.keys()
            assert not missing, f"missing keys {missing} in row {row}"
            assert isinstance(row["disabled"], bool)
            assert isinstance(row["is_self"], bool)
        # The default admin must be present and flagged is_self.
        me = next((r for r in rows if r["user_id"] == admin_user_id), None)
        assert me is not None, "default admin not in /admin/staff list"
        assert me["is_self"] is True
        assert me["email"] == ADMIN_EMAIL

    def test_list_staff_includes_newly_created(self, api, admin_token):
        s = _create_staff(api, admin_token, role="staff")
        r = api.get(f"{BASE_URL}/api/admin/staff", headers=_h(admin_token))
        assert r.status_code == 200
        ids = [row["user_id"] for row in r.json()]
        assert s["user_id"] in ids
        row = next(row for row in r.json() if row["user_id"] == s["user_id"])
        assert row["role"] == "staff"
        assert row["disabled"] is False
        assert row["is_self"] is False
        assert row["phone"] == s["phone"]

    def test_list_staff_non_admin_forbidden(self, api, customer):
        r = api.get(f"{BASE_URL}/api/admin/staff", headers=_h(customer["token"]))
        assert r.status_code == 403


# ====================================================================
# B) PATCH /api/admin/staff/{user_id}/role
# ====================================================================
class TestUpdateRole:
    def test_patch_role_to_cashier(self, api, admin_token):
        s = _create_staff(api, admin_token, role="staff")
        r = api.patch(f"{BASE_URL}/api/admin/staff/{s['user_id']}/role",
                      json={"role": "cashier"}, headers=_h(admin_token))
        assert r.status_code == 200, r.text
        # Confirm via list.
        rows = api.get(f"{BASE_URL}/api/admin/staff", headers=_h(admin_token)).json()
        row = next(row for row in rows if row["user_id"] == s["user_id"])
        assert row["role"] == "cashier"

    def test_patch_role_invalid_role(self, api, admin_token):
        s = _create_staff(api, admin_token, role="staff")
        r = api.patch(f"{BASE_URL}/api/admin/staff/{s['user_id']}/role",
                      json={"role": "boss"}, headers=_h(admin_token))
        assert r.status_code == 400

    def test_patch_role_unknown_user(self, api, admin_token):
        r = api.patch(f"{BASE_URL}/api/admin/staff/staff_doesnotexist/role",
                      json={"role": "cashier"}, headers=_h(admin_token))
        assert r.status_code == 404

    def test_patch_role_as_customer_forbidden(self, api, customer, admin_token):
        s = _create_staff(api, admin_token, role="staff")
        r = api.patch(f"{BASE_URL}/api/admin/staff/{s['user_id']}/role",
                      json={"role": "cashier"}, headers=_h(customer["token"]))
        assert r.status_code == 403


# ====================================================================
# C) PATCH /api/admin/staff/{user_id}/disable
# ====================================================================
class TestDisableStaff:
    def test_disable_then_reenable(self, api, admin_token):
        s = _create_staff(api, admin_token, role="staff")
        # disable
        r = api.patch(f"{BASE_URL}/api/admin/staff/{s['user_id']}/disable",
                      json={"disabled": True}, headers=_h(admin_token))
        assert r.status_code == 200, r.text
        assert r.json()["disabled"] is True
        # verify persisted via list
        rows = api.get(f"{BASE_URL}/api/admin/staff", headers=_h(admin_token)).json()
        row = next(row for row in rows if row["user_id"] == s["user_id"])
        assert row["disabled"] is True
        # re-enable
        r2 = api.patch(f"{BASE_URL}/api/admin/staff/{s['user_id']}/disable",
                       json={"disabled": False}, headers=_h(admin_token))
        assert r2.status_code == 200
        rows = api.get(f"{BASE_URL}/api/admin/staff", headers=_h(admin_token)).json()
        row = next(row for row in rows if row["user_id"] == s["user_id"])
        assert row["disabled"] is False

    def test_cannot_disable_yourself(self, api, admin_token, admin_user_id):
        r = api.patch(f"{BASE_URL}/api/admin/staff/{admin_user_id}/disable",
                      json={"disabled": True}, headers=_h(admin_token))
        assert r.status_code == 400
        assert "yourself" in r.text.lower()

    def test_cannot_disable_last_active_owner(self, api, admin_token, mongo):
        """Create a brand new owner-role staff. Because the seeded admin has no
        explicit role field, the count of {role: 'owner', disabled: false}
        equals 1 (just the new one) → disabling it must return 400."""
        # Make sure no other explicit owners are lingering (test isolation).
        mongo.users.update_many(
            {"is_admin": True, "role": "owner"},
            {"$set": {"role": "staff"}},
        )
        new_owner = _create_staff(api, admin_token, role="owner",
                                  name_prefix="TEST iter3 owner")
        try:
            r = api.patch(f"{BASE_URL}/api/admin/staff/{new_owner['user_id']}/disable",
                          json={"disabled": True}, headers=_h(admin_token))
            assert r.status_code == 400, r.text
            assert "owner" in r.text.lower()
        finally:
            # cleanup: demote to staff first (deleting the last explicit owner
            # is blocked by the server), then delete.
            api.patch(f"{BASE_URL}/api/admin/staff/{new_owner['user_id']}/role",
                      json={"role": "staff"}, headers=_h(admin_token))
            api.delete(f"{BASE_URL}/api/admin/staff/{new_owner['user_id']}",
                       headers=_h(admin_token))


# ====================================================================
# D) DELETE /api/admin/staff/{user_id}
# ====================================================================
class TestDeleteStaff:
    def test_delete_staff(self, api, admin_token):
        s = _create_staff(api, admin_token, role="staff")
        r = api.delete(f"{BASE_URL}/api/admin/staff/{s['user_id']}",
                       headers=_h(admin_token))
        assert r.status_code == 200, r.text
        rows = api.get(f"{BASE_URL}/api/admin/staff", headers=_h(admin_token)).json()
        assert all(row["user_id"] != s["user_id"] for row in rows)

    def test_cannot_delete_yourself(self, api, admin_token, admin_user_id):
        r = api.delete(f"{BASE_URL}/api/admin/staff/{admin_user_id}",
                       headers=_h(admin_token))
        assert r.status_code == 400
        assert "yourself" in r.text.lower()

    def test_cannot_delete_last_owner(self, api, admin_token, mongo):
        # Ensure no other explicit owners exist (leftovers from prior runs).
        mongo.users.update_many(
            {"is_admin": True, "role": "owner"},
            {"$set": {"role": "staff"}},
        )
        new_owner = _create_staff(api, admin_token, role="owner",
                                  name_prefix="TEST iter3 owner-del")
        # Now only one explicit owner exists. Trying to delete it must 400.
        r = api.delete(f"{BASE_URL}/api/admin/staff/{new_owner['user_id']}",
                       headers=_h(admin_token))
        # Expected: server counts {is_admin:true, role:'owner'} → 1 → 400.
        assert r.status_code == 400, r.text
        assert "owner" in r.text.lower()
        # Cleanup: demote the new owner to staff so it can be deleted.
        api.patch(f"{BASE_URL}/api/admin/staff/{new_owner['user_id']}/role",
                  json={"role": "staff"}, headers=_h(admin_token))
        api.delete(f"{BASE_URL}/api/admin/staff/{new_owner['user_id']}",
                   headers=_h(admin_token))


# ====================================================================
# E) POST /api/admin/customer/add-pizza with pizza_id
# ====================================================================
class TestAddPizzaWithPizzaId:
    def test_add_pizza_with_pizza_id_records_event(self, api, admin_token, customer):
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json={"user_id": customer["user_id"],
                           "qr_token": customer["qr_token"],
                           "pizza_count": 2,
                           "pizza_id": "p-margherita"},
                     headers=_h(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["pizza_count"] >= 2

        # Verify indirectly via dashboard top_pizzas.
        dash = api.get(f"{BASE_URL}/api/admin/dashboard?period=all",
                       headers=_h(admin_token))
        assert dash.status_code == 200
        top = dash.json().get("top_pizzas", [])
        marg = next((p for p in top if p["pizza_id"] == "p-margherita"), None)
        assert marg is not None, f"top_pizzas missing margherita: {top}"
        assert marg["count"] >= 2
        assert marg.get("name")  # joined with menu

    def test_add_pizza_without_pizza_id_still_ok(self, api, admin_token, customer):
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json={"user_id": customer["user_id"],
                           "qr_token": customer["qr_token"],
                           "pizza_count": 1},
                     headers=_h(admin_token))
        assert r.status_code == 200, r.text


# ====================================================================
# F) GET /api/admin/dashboard?period=...
# ====================================================================
class TestDashboardPeriods:
    EXPECTED_TOP_KEYS = {
        "period", "total_pizzas_sold", "loyalty_members", "vip_customers",
        "reservations_in_period", "reservations", "rewards_redeemed",
        "top_customers", "top_pizzas",
    }

    @pytest.mark.parametrize("period,expected", [
        ("today", "today"),
        ("week", "week"),
        ("month", "month"),
        ("all", "all"),
        ("bogus", "all"),
    ])
    def test_dashboard_period(self, api, admin_token, period, expected):
        r = api.get(f"{BASE_URL}/api/admin/dashboard?period={period}",
                    headers=_h(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        missing = self.EXPECTED_TOP_KEYS - d.keys()
        assert not missing, f"missing keys {missing} in dashboard payload"
        assert d["period"] == expected
        # Types
        assert isinstance(d["total_pizzas_sold"], int)
        assert isinstance(d["loyalty_members"], int)
        assert isinstance(d["vip_customers"], int)
        assert isinstance(d["reservations_in_period"], int)
        for k in ("today", "week", "month", "total"):
            assert k in d["reservations"]
            assert isinstance(d["reservations"][k], int)
        for k in ("coffee", "dessert", "margherita", "total"):
            assert k in d["rewards_redeemed"]
            assert isinstance(d["rewards_redeemed"][k], int)
        assert isinstance(d["top_customers"], list)
        assert isinstance(d["top_pizzas"], list)

    def test_dashboard_top_pizzas_contains_margherita(self, api, admin_token):
        """After TestAddPizzaWithPizzaId, the all-time top_pizzas must list p-margherita."""
        r = api.get(f"{BASE_URL}/api/admin/dashboard?period=all",
                    headers=_h(admin_token))
        assert r.status_code == 200
        top = r.json()["top_pizzas"]
        assert any(p["pizza_id"] == "p-margherita" for p in top), \
            f"margherita missing from top_pizzas: {top}"


# ====================================================================
# G) Disabled-account auth check on cu()
# ====================================================================
class TestDisabledAuth:
    def test_disabled_admin_blocked_then_reenabled(self, api, mongo, admin_user_id):
        """Toggle admin disabled flag directly in mongo and verify /auth/me reacts."""
        # Fresh login for clean token (also avoid using shared token after disable).
        r0 = api.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r0.status_code == 200
        tok = r0.json()["token"]
        # baseline /auth/me works
        ok = api.get(f"{BASE_URL}/api/auth/me", headers=_h(tok))
        assert ok.status_code == 200

        # disable directly via DB
        res = mongo.users.update_one({"user_id": admin_user_id},
                                     {"$set": {"disabled": True}})
        assert res.matched_count == 1
        try:
            blocked = api.get(f"{BASE_URL}/api/auth/me", headers=_h(tok))
            assert blocked.status_code == 403, blocked.text
        finally:
            # re-enable so subsequent tests can use admin again
            mongo.users.update_one({"user_id": admin_user_id},
                                   {"$unset": {"disabled": ""}})

        # Login again, /auth/me works again
        r1 = api.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r1.status_code == 200
        tok1 = r1.json()["token"]
        ok2 = api.get(f"{BASE_URL}/api/auth/me", headers=_h(tok1))
        assert ok2.status_code == 200

    def test_disabled_staff_otp_login_blocked(self, api, mongo, admin_token):
        """Create staff → OTP-login (works) → set disabled via /admin/staff/disable →
        cu() should reject the stored token on next call."""
        s = _create_staff(api, admin_token, role="staff",
                          name_prefix="TEST iter3 disabled-flow")
        login = _otp_login(api, s["phone"], name="TEST iter3 disabled-flow")
        staff_tok = login["token"]
        # /auth/me works initially
        ok = api.get(f"{BASE_URL}/api/auth/me", headers=_h(staff_tok))
        assert ok.status_code == 200, ok.text

        # disable via API
        d = api.patch(f"{BASE_URL}/api/admin/staff/{s['user_id']}/disable",
                      json={"disabled": True}, headers=_h(admin_token))
        assert d.status_code == 200

        # /auth/me now blocked. NOTE: the disable handler also deletes the
        # user_sessions row, so cu() falls through to JWT decode and finds
        # disabled=True → 403.
        blocked = api.get(f"{BASE_URL}/api/auth/me", headers=_h(staff_tok))
        assert blocked.status_code == 403, blocked.text
