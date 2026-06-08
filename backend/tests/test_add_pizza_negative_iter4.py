"""
Iteration 4 — Pizza Denfert backend tests for the
`POST /api/admin/customer/add-pizza` endpoint after the bug fix that
introduced support for negative `pizza_count` (the "minus" button on
the admin loyalty screen).

Contract under test:
- pizza_count must be in [-20, 20] and != 0 → 400 otherwise.
- Positive pizza_count adds.
- Negative pizza_count subtracts but the resulting `pizza_count` is
  clamped at 0 (never negative).
- If the customer is already at 0, a negative pizza_count is a no-op
  (returns 200 with unchanged payload, NOT 400).
- When pizzas are removed, any over-counted entries in
  `rewards_redeemed` are pruned so the loyalty math stays consistent.
- Every adjustment (positive or negative) is logged in `pizza_events`.

Scenarios A–J from the iteration_4 review request.
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


# ---------- shared helpers ----------
def _unique_phone():
    return "+3361" + str(secrets.randbelow(10**8)).zfill(8)


def _h(token):
    return {"Authorization": f"Bearer {token}"}


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


def _make_customer(api, name="TEST iter4 add-pizza customer"):
    """Create a fresh OTP customer and return its credentials."""
    phone = _unique_phone()
    rq = api.post(f"{BASE_URL}/api/auth/otp/request",
                  json={"phone": phone, "name": name})
    assert rq.status_code == 200, rq.text
    code = rq.json()["dev_code"]
    v = api.post(f"{BASE_URL}/api/auth/otp/verify",
                 json={"phone": phone, "code": code, "name": name})
    assert v.status_code == 200, v.text
    d = v.json()
    return {
        "token": d["token"],
        "user_id": d["user"]["user_id"],
        "qr_token": d["user"]["qr_token"],
        "phone": phone,
    }


def _add_pizza(api, admin_token, customer, count, pizza_id=None):
    payload = {
        "user_id": customer["user_id"],
        "qr_token": customer["qr_token"],
        "pizza_count": count,
    }
    if pizza_id is not None:
        payload["pizza_id"] = pizza_id
    return api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                    json=payload, headers=_h(admin_token))


# ===================================================================
# A) Happy path positive — fresh customer, pizza_count=3 → coffee
# ===================================================================
class TestPositiveHappyPath:
    def test_positive_3_grants_coffee(self, api, admin_token):
        cust = _make_customer(api)
        r = _add_pizza(api, admin_token, cust, 3)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["pizza_count"] == 3
        rewards = {x["reward"] for x in body["available_rewards"]}
        assert "coffee" in rewards, (
            f"expected coffee in available_rewards but got {body['available_rewards']}"
        )


# ===================================================================
# B) Happy path negative — subtract 1 → coffee no longer available
# ===================================================================
class TestNegativeHappyPath:
    def test_negative_1_removes_coffee(self, api, admin_token):
        cust = _make_customer(api)
        r1 = _add_pizza(api, admin_token, cust, 3)
        assert r1.status_code == 200, r1.text
        assert r1.json()["pizza_count"] == 3

        r2 = _add_pizza(api, admin_token, cust, -1)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body["pizza_count"] == 2
        rewards = {x["reward"] for x in body["available_rewards"]}
        assert "coffee" not in rewards, (
            f"coffee should not be available at pc=2, got {body['available_rewards']}"
        )


# ===================================================================
# C) Clamp at zero — at 2, send -10 → pc=0, no rewards
# ===================================================================
class TestClampAtZero:
    def test_negative_overshoot_clamps_to_zero(self, api, admin_token):
        cust = _make_customer(api)
        r1 = _add_pizza(api, admin_token, cust, 2)
        assert r1.status_code == 200 and r1.json()["pizza_count"] == 2

        r2 = _add_pizza(api, admin_token, cust, -10)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body["pizza_count"] == 0
        assert body["available_rewards"] == [], (
            f"expected no available rewards at pc=0, got {body['available_rewards']}"
        )


# ===================================================================
# D) No-op at zero — at 0, send -1 → 200, pc=0 (NOT 400)
# ===================================================================
class TestNoOpAtZero:
    def test_subtract_at_zero_is_noop(self, api, admin_token):
        cust = _make_customer(api)
        # Customer starts fresh at pizza_count=0
        r = _add_pizza(api, admin_token, cust, -1)
        assert r.status_code == 200, (
            f"subtract at zero must be 200 no-op, got {r.status_code}: {r.text}"
        )
        body = r.json()
        assert body["pizza_count"] == 0
        assert body["available_rewards"] == []


# ===================================================================
# E) Reward pruning — redeem coffee at 3, subtract to 2,
#    then add back to 3, coffee must be available again.
# ===================================================================
class TestRewardPruning:
    def test_reward_pruning_after_subtract(self, api, admin_token):
        cust = _make_customer(api)
        # Bring to 3 pizzas.
        r1 = _add_pizza(api, admin_token, cust, 3)
        assert r1.status_code == 200 and r1.json()["pizza_count"] == 3
        rewards1 = {x["reward"] for x in r1.json()["available_rewards"]}
        assert "coffee" in rewards1

        # Redeem the coffee.
        redeem = api.post(f"{BASE_URL}/api/admin/customer/redeem",
                          json={"user_id": cust["user_id"],
                                "qr_token": cust["qr_token"],
                                "reward": "coffee"},
                          headers=_h(admin_token))
        assert redeem.status_code == 200, redeem.text
        rewards_after_redeem = {x["reward"] for x in redeem.json()["available_rewards"]}
        assert "coffee" not in rewards_after_redeem  # already consumed

        # Subtract 1 → pc=2. Server must prune the "coffee" entry from rewards_redeemed
        # so the customer can re-earn it later.
        r2 = _add_pizza(api, admin_token, cust, -1)
        assert r2.status_code == 200, r2.text
        assert r2.json()["pizza_count"] == 2
        # At pc=2 coffee is not earned anyway, so available_rewards has no coffee.

        # Add 1 back → pc=3. Because pruning removed the stale "coffee" redemption,
        # coffee must show up in available_rewards again with available=1.
        r3 = _add_pizza(api, admin_token, cust, 1)
        assert r3.status_code == 200, r3.text
        body3 = r3.json()
        assert body3["pizza_count"] == 3
        coffee_entries = [x for x in body3["available_rewards"] if x["reward"] == "coffee"]
        assert len(coffee_entries) == 1, (
            f"expected coffee in available_rewards after pruning+re-earn, got "
            f"{body3['available_rewards']}"
        )
        assert coffee_entries[0]["available"] == 1, (
            f"expected available=1 for coffee, got {coffee_entries[0]}"
        )

    def test_rewards_redeemed_pruned_in_db(self, api, admin_token, mongo):
        """Direct DB check that `rewards_redeemed` array no longer contains
        the over-counted reward key after the subtract."""
        cust = _make_customer(api)
        # 3 pizzas → redeem coffee → array has ['coffee'].
        assert _add_pizza(api, admin_token, cust, 3).status_code == 200
        rd = api.post(f"{BASE_URL}/api/admin/customer/redeem",
                      json={"user_id": cust["user_id"],
                            "qr_token": cust["qr_token"],
                            "reward": "coffee"},
                      headers=_h(admin_token))
        assert rd.status_code == 200, rd.text
        before = mongo.users.find_one({"user_id": cust["user_id"]},
                                      {"_id": 0, "rewards_redeemed": 1})
        assert "coffee" in (before.get("rewards_redeemed") or [])

        # Subtract back to 2 → coffee redemption must be pruned.
        assert _add_pizza(api, admin_token, cust, -1).status_code == 200
        after = mongo.users.find_one({"user_id": cust["user_id"]},
                                     {"_id": 0, "rewards_redeemed": 1})
        assert "coffee" not in (after.get("rewards_redeemed") or []), (
            f"coffee should have been pruned, got {after.get('rewards_redeemed')}"
        )


# ===================================================================
# F) Validation — count=0, 21, -21 → 400 ; -20 → 200 (valid edge)
# ===================================================================
class TestValidationBounds:
    @pytest.mark.parametrize("bad", [0, 21, -21, 100, -100])
    def test_bad_counts_rejected(self, api, admin_token, bad):
        cust = _make_customer(api)
        r = _add_pizza(api, admin_token, cust, bad)
        assert r.status_code == 400, (
            f"expected 400 for pizza_count={bad}, got {r.status_code}: {r.text}"
        )

    def test_lower_edge_minus_20_accepted(self, api, admin_token):
        # First grow the customer well above 0 so the negative isn't just a no-op edge.
        cust = _make_customer(api)
        assert _add_pizza(api, admin_token, cust, 5).status_code == 200

        r = _add_pizza(api, admin_token, cust, -20)
        assert r.status_code == 200, (
            f"-20 must be a valid edge (clamped at zero), got {r.status_code}: {r.text}"
        )
        body = r.json()
        assert body["pizza_count"] == 0  # clamped

    def test_upper_edge_20_accepted(self, api, admin_token):
        cust = _make_customer(api)
        r = _add_pizza(api, admin_token, cust, 20)
        assert r.status_code == 200, r.text
        assert r.json()["pizza_count"] == 20


# ===================================================================
# G) Wrong qr_token → 404 for both positive and negative requests
# ===================================================================
class TestWrongQrToken:
    def test_wrong_qr_token_positive_404(self, api, admin_token):
        cust = _make_customer(api)
        bad = {"user_id": cust["user_id"],
               "qr_token": "deadbeef-not-a-real-token",
               "pizza_count": 2}
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json=bad, headers=_h(admin_token))
        assert r.status_code == 404, r.text

    def test_wrong_qr_token_negative_404(self, api, admin_token):
        cust = _make_customer(api)
        # Bump real pc first via real qr_token so we'd notice any wrong mutation.
        assert _add_pizza(api, admin_token, cust, 4).status_code == 200
        bad = {"user_id": cust["user_id"],
               "qr_token": "deadbeef-not-a-real-token",
               "pizza_count": -2}
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json=bad, headers=_h(admin_token))
        assert r.status_code == 404, r.text
        # Confirm customer pc was NOT changed by the bad request.
        ok = _add_pizza(api, admin_token, cust, 0 if False else 1)  # +1
        # quick sanity: pc moved from 4 → 5 (not 4 - 2 + 1 = 3)
        assert ok.status_code == 200
        assert ok.json()["pizza_count"] == 5


# ===================================================================
# H) Customer (non-admin) token → 403 (both positive and negative)
# ===================================================================
class TestCustomerTokenForbidden:
    def test_customer_token_positive_forbidden(self, api):
        cust = _make_customer(api)
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json={"user_id": cust["user_id"],
                           "qr_token": cust["qr_token"],
                           "pizza_count": 1},
                     headers=_h(cust["token"]))
        assert r.status_code == 403, r.text

    def test_customer_token_negative_forbidden(self, api):
        cust = _make_customer(api)
        r = api.post(f"{BASE_URL}/api/admin/customer/add-pizza",
                     json={"user_id": cust["user_id"],
                           "qr_token": cust["qr_token"],
                           "pizza_count": -1},
                     headers=_h(cust["token"]))
        assert r.status_code == 403, r.text


# ===================================================================
# J) pizza_events logging — verify both via dashboard.top_pizzas
#    decrement AND directly via mongo `pizza_events`.
# ===================================================================
class TestPizzaEventsLogged:
    def test_negative_logged_via_dashboard_top_pizzas(self, api, admin_token):
        """Add 2 margheritas, then subtract 1 with pizza_id=p-margherita.
        Dashboard top_pizzas margherita count should reflect a NET delta of +1
        (i.e. the -1 row appears in pizza_events and the aggregation sums it)."""
        cust = _make_customer(api)

        dash0 = api.get(f"{BASE_URL}/api/admin/dashboard?period=all",
                        headers=_h(admin_token))
        assert dash0.status_code == 200
        before = next(
            (p["count"] for p in dash0.json().get("top_pizzas", [])
             if p["pizza_id"] == "p-margherita"),
            0,
        )

        # +2 margheritas
        r1 = _add_pizza(api, admin_token, cust, 2, pizza_id="p-margherita")
        assert r1.status_code == 200, r1.text

        # -1 margherita
        r2 = _add_pizza(api, admin_token, cust, -1, pizza_id="p-margherita")
        assert r2.status_code == 200, r2.text

        dash1 = api.get(f"{BASE_URL}/api/admin/dashboard?period=all",
                        headers=_h(admin_token))
        assert dash1.status_code == 200
        after = next(
            (p["count"] for p in dash1.json().get("top_pizzas", [])
             if p["pizza_id"] == "p-margherita"),
            0,
        )
        # Net change should be +2 + (-1) = +1.
        assert after - before == 1, (
            f"expected dashboard margherita count to change by +1 (i.e. -1 row was "
            f"logged in pizza_events), before={before} after={after}"
        )

    def test_negative_logged_directly_in_pizza_events(self, api, admin_token, mongo):
        """Subtract 1 pizza and look for a `pizza_events` row with count=-1
        for that customer."""
        cust = _make_customer(api)
        # Bring pc to 2 so subtract is effective.
        assert _add_pizza(api, admin_token, cust, 2).status_code == 200

        before_count = mongo.pizza_events.count_documents(
            {"user_id": cust["user_id"], "count": -1}
        )
        r = _add_pizza(api, admin_token, cust, -1)
        assert r.status_code == 200, r.text
        after_count = mongo.pizza_events.count_documents(
            {"user_id": cust["user_id"], "count": -1}
        )
        assert after_count - before_count == 1, (
            f"expected one new pizza_events row with count=-1, "
            f"before={before_count} after={after_count}"
        )

    def test_noop_at_zero_does_not_log_event(self, api, admin_token, mongo):
        """If the customer is already at 0, a subtract returns 200 but the
        clamped effective delta is 0 → no event should be inserted."""
        cust = _make_customer(api)
        before = mongo.pizza_events.count_documents({"user_id": cust["user_id"]})
        r = _add_pizza(api, admin_token, cust, -3)
        assert r.status_code == 200
        after = mongo.pizza_events.count_documents({"user_id": cust["user_id"]})
        assert after == before, (
            f"no-op subtract at zero should not insert a pizza_events row, "
            f"before={before} after={after}"
        )
