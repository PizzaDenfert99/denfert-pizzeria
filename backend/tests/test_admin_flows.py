"""
Pizza Denfert backend tests - admin panel + OTP customer flow.
Tests against the public preview URL with /api prefix.
"""
import os
import secrets
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")

ADMIN_EMAIL = "admin@pizzadenfert.fr"
ADMIN_PASSWORD = "Admin1234!"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["is_admin"] is True
    return data["token"]


def _unique_phone():
    # 11+ digit unique phone, French style
    return "+3361" + str(secrets.randbelow(10**8)).zfill(8)


@pytest.fixture(scope="session")
def customer(api):
    """Create a fresh customer via OTP flow."""
    phone = _unique_phone()
    r = api.post(f"{BASE_URL}/api/auth/otp/request",
                 json={"phone": phone, "name": "TEST OTP User"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "dev_code" in body and len(body["dev_code"]) == 6
    code = body["dev_code"]

    r2 = api.post(f"{BASE_URL}/api/auth/otp/verify",
                  json={"phone": phone, "code": code, "name": "TEST OTP User"})
    assert r2.status_code == 200, r2.text
    d = r2.json()
    user = d["user"]
    assert user["is_admin"] is False
    assert user["phone"] == phone
    assert user.get("qr_token")
    assert user.get("pizza_count", 0) == 0

    # fetch qr_data via /loyalty/me
    me = api.get(f"{BASE_URL}/api/loyalty/me",
                 headers={"Authorization": f"Bearer {d['token']}"})
    assert me.status_code == 200, me.text
    loyalty = me.json()
    return {
        "token": d["token"],
        "user_id": user["user_id"],
        "qr_token": user["qr_token"],
        "qr_data": loyalty["qr_data"],
        "phone": phone,
        "name": user["name"],
    }


# ---------- OTP / Auth ----------
class TestOtpAuth:
    def test_otp_request_returns_dev_code(self, api):
        phone = _unique_phone()
        r = api.post(f"{BASE_URL}/api/auth/otp/request",
                     json={"phone": phone, "name": "TEST"})
        assert r.status_code == 200
        b = r.json()
        assert b["phone"] == phone
        assert len(b["dev_code"]) == 6 and b["dev_code"].isdigit()
        assert b["expires_in"] == 600

    def test_otp_verify_wrong_code(self, api):
        phone = _unique_phone()
        api.post(f"{BASE_URL}/api/auth/otp/request",
                 json={"phone": phone, "name": "TEST"})
        r = api.post(f"{BASE_URL}/api/auth/otp/verify",
                     json={"phone": phone, "code": "000000"})
        assert r.status_code == 401

    def test_otp_verify_without_request(self, api):
        phone = _unique_phone()
        r = api.post(f"{BASE_URL}/api/auth/otp/verify",
                     json={"phone": phone, "code": "123456"})
        assert r.status_code == 400

    def test_otp_request_short_phone(self, api):
        r = api.post(f"{BASE_URL}/api/auth/otp/request",
                     json={"phone": "+331"})
        assert r.status_code == 400

    def test_admin_login_legacy(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        b = r.json()
        assert b["user"]["is_admin"] is True
        assert b["token"]


# ---------- Admin scan ----------
class TestAdminScan:
    def test_scan_valid_qr(self, api, admin_token, customer):
        r = api.post(f"{BASE_URL}/api/admin/scan",
                     json={"qr_data": customer["qr_data"]},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user_id"] == customer["user_id"]
        assert d["qr_token"] == customer["qr_token"]
        assert d["pizza_count"] == 0
        assert "available_rewards" in d

    def test_scan_malformed_qr(self, api, admin_token):
        r = api.post(f"{BASE_URL}/api/admin/scan",
                     json={"qr_data": "not-a-valid-qr"},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 400

    def test_scan_unknown_user(self, api, admin_token):
        r = api.post(f"{BASE_URL}/api/admin/scan",
                     json={"qr_data": "PIZZA-DENFERT:user_nonexistent:badtoken"},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 404

    def test_scan_without_admin_token(self, api, customer):
        r = api.post(f"{BASE_URL}/api/admin/scan",
                     json={"qr_data": customer["qr_data"]},
                     headers={"Authorization": f"Bearer {customer['token']}"})
        assert r.status_code == 403


# ---------- Admin add pizza ----------
class TestAdminAddPizza:
    def test_add_one_pizza(self, api, admin_token, customer):
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json={"user_id": customer["user_id"],
                           "qr_token": customer["qr_token"],
                           "pizza_count": 1},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["pizza_count"] == 1

    def test_add_to_3_yields_coffee(self, api, admin_token, customer):
        # already at 1 from previous test; add 2 more
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json={"user_id": customer["user_id"],
                           "qr_token": customer["qr_token"],
                           "pizza_count": 2},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        d = r.json()
        assert d["pizza_count"] == 3
        rewards = [a["reward"] for a in d["available_rewards"]]
        assert "coffee" in rewards

    def test_add_to_5_yields_dessert(self, api, admin_token, customer):
        # currently 3 -> +2 = 5
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json={"user_id": customer["user_id"],
                           "qr_token": customer["qr_token"],
                           "pizza_count": 2},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        d = r.json()
        assert d["pizza_count"] == 5
        rewards = [a["reward"] for a in d["available_rewards"]]
        assert "dessert" in rewards

    def test_add_to_10_yields_margherita(self, api, admin_token, customer):
        # currently 5 -> +5 = 10
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json={"user_id": customer["user_id"],
                           "qr_token": customer["qr_token"],
                           "pizza_count": 5},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        d = r.json()
        assert d["pizza_count"] == 10
        rewards = [a["reward"] for a in d["available_rewards"]]
        assert "margherita" in rewards

    def test_add_zero_rejected(self, api, admin_token, customer):
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json={"user_id": customer["user_id"],
                           "qr_token": customer["qr_token"],
                           "pizza_count": 0},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 400

    def test_add_too_many_rejected(self, api, admin_token, customer):
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json={"user_id": customer["user_id"],
                           "qr_token": customer["qr_token"],
                           "pizza_count": 25},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 400

    def test_add_wrong_qr_token(self, api, admin_token, customer):
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json={"user_id": customer["user_id"],
                           "qr_token": "ffffffffffffffffffffffff",
                           "pizza_count": 1},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 404


# ---------- Admin redeem ----------
class TestAdminRedeem:
    def test_redeem_coffee(self, api, admin_token, customer):
        # customer should be at 10 with coffee/dessert/margherita all available
        r = api.post(f"{BASE_URL}/api/admin/customer/redeem",
                     json={"user_id": customer["user_id"],
                           "qr_token": customer["qr_token"],
                           "reward": "coffee"},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        d = r.json()
        history = [h["reward"] for h in d["history"]]
        assert "coffee" in history
        rewards = [a["reward"] for a in d["available_rewards"]]
        # After one redemption with pizza_count=10, earned=10//3=3 used=1 -> still available
        # so coffee still in list but count reduced — only fully gone if used==earned
        # Verify the count decremented properly (earned 3, used 1 -> available 2)
        coffee_entry = next((a for a in d["available_rewards"] if a["reward"] == "coffee"), None)
        assert coffee_entry is not None
        assert coffee_entry["available"] == 2

    def test_redeem_unavailable(self, api, admin_token):
        """Brand new customer can't redeem anything yet."""
        phone = _unique_phone()
        rq = api.post(f"{BASE_URL}/api/auth/otp/request",
                      json={"phone": phone, "name": "TEST Fresh"})
        code = rq.json()["dev_code"]
        v = api.post(f"{BASE_URL}/api/auth/otp/verify",
                     json={"phone": phone, "code": code})
        u = v.json()["user"]
        r = api.post(f"{BASE_URL}/api/admin/customer/redeem",
                     json={"user_id": u["user_id"],
                           "qr_token": u["qr_token"],
                           "reward": "coffee"},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 400

    def test_redeem_invalid_name(self, api, admin_token, customer):
        r = api.post(f"{BASE_URL}/api/admin/customer/redeem",
                     json={"user_id": customer["user_id"],
                           "qr_token": customer["qr_token"],
                           "reward": "pineapple"},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 400


# ---------- Admin search ----------
class TestAdminSearch:
    def test_search_by_full_phone(self, api, admin_token, customer):
        r = api.post(f"{BASE_URL}/api/admin/search",
                     json={"query": customer["phone"]},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        results = r.json()
        assert any(u["user_id"] == customer["user_id"] for u in results)

    def test_search_by_partial_name(self, api, admin_token, customer):
        # name was set to "TEST OTP User" - search by partial
        r = api.post(f"{BASE_URL}/api/admin/search",
                     json={"query": "TEST OTP"},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        results = r.json()
        assert any(u["user_id"] == customer["user_id"] for u in results)

    def test_search_empty(self, api, admin_token):
        r = api.post(f"{BASE_URL}/api/admin/search",
                     json={"query": ""},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert r.json() == []

    def test_search_excludes_admins(self, api, admin_token):
        r = api.post(f"{BASE_URL}/api/admin/search",
                     json={"query": "Admin"},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        results = r.json()
        # No admin user should leak through
        # Admin user_id starts with "admin_"
        assert not any(u["user_id"].startswith("admin_") for u in results), \
            f"Admin leaked into search: {results}"


# ---------- Admin dashboard ----------
class TestAdminDashboard:
    def test_dashboard_shape(self, api, admin_token):
        r = api.get(f"{BASE_URL}/api/admin/dashboard",
                    headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["total_pizzas_sold"], int)
        assert isinstance(d["loyalty_members"], int)
        assert isinstance(d["vip_customers"], int)
        for k in ("today", "week", "month", "total"):
            assert k in d["reservations"]
        for k in ("coffee", "dessert", "margherita", "total"):
            assert k in d["rewards_redeemed"]
        assert isinstance(d["top_customers"], list)
        assert len(d["top_customers"]) <= 5
        if d["top_customers"]:
            tc = d["top_customers"][0]
            assert "name" in tc and "phone" in tc and "pizzas" in tc

    def test_dashboard_non_admin_rejected(self, api, customer):
        r = api.get(f"{BASE_URL}/api/admin/dashboard",
                    headers={"Authorization": f"Bearer {customer['token']}"})
        assert r.status_code == 403


# ---------- Admin create staff ----------
class TestAdminCreateStaff:
    def test_create_staff(self, api, admin_token):
        phone = _unique_phone()
        r = api.post(f"{BASE_URL}/api/admin/staff/create",
                     json={"phone": phone, "name": "TEST Staff One", "role": "staff"},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, f"Staff create failed: {r.status_code} {r.text}"
        d = r.json()
        assert d["created"]["is_admin"] is True
        assert d["created"]["phone"] == phone
        # Save for duplicate test
        TestAdminCreateStaff.dup_phone = phone

    def test_create_staff_duplicate(self, api, admin_token):
        phone = getattr(TestAdminCreateStaff, "dup_phone", None)
        assert phone, "previous test must have run"
        r = api.post(f"{BASE_URL}/api/admin/staff/create",
                     json={"phone": phone, "name": "TEST Staff Dup", "role": "staff"},
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 400

    def test_create_staff_as_customer_forbidden(self, api, customer):
        phone = _unique_phone()
        r = api.post(f"{BASE_URL}/api/admin/staff/create",
                     json={"phone": phone, "name": "TEST Staff Cust", "role": "staff"},
                     headers={"Authorization": f"Bearer {customer['token']}"})
        assert r.status_code == 403
