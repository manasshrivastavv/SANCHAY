import os
import sys
import time
import json
import pytest
import jwt
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Enable SANCHAY_TEST_MODE for fast local cryptographic testing
os.environ["SANCHAY_TEST_MODE"] = "1"

from fastapi.testclient import TestClient
from app.main import app
from app.services.clerk_service import TEST_SECRET_KEY
from app.database import get_users_collection, init_db

client = TestClient(app)


def make_test_clerk_token(sub: str, exp_seconds: int = 3600, email: str = "test@example.com", phone: str = "+919876543210", name: str = "Test Citizen"):
    """Helper to generate a cryptographically signed test Clerk token."""
    payload = {
        "sub": sub,
        "iss": "https://clerk.sanchay.test",
        "exp": int(time.time()) + exp_seconds,
        "iat": int(time.time()),
        "email": email,
        "phone_number": phone,
        "name": name
    }
    return jwt.encode(payload, TEST_SECRET_KEY, algorithm="HS256")


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    init_db()
    users_col = get_users_collection()
    # Clean up test users before and after test module
    users_col.delete_many({"clerk_user_id": {"$regex": "^user_test_"}})
    yield
    users_col.delete_many({"clerk_user_id": {"$regex": "^user_test_"}})


def test_unauthenticated_request_returns_401():
    """Requirement 9 & 26: Protected API without token returns 401."""
    res = client.get("/api/auth/me")
    assert res.status_code == 401
    assert "detail" in res.json()

    res_plans = client.get("/api/auth/plans")
    assert res_plans.status_code == 401

    res_add = client.post("/api/auth/plans/add", json={"scheme_id": "ppf_001"})
    assert res_add.status_code == 401


def test_invalid_token_returns_401():
    """Requirement 9 & 26: Invalid token returns 401."""
    headers = {"Authorization": "Bearer invalid_garbage_token_12345"}
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 401

    # Malformed token
    headers2 = {"Authorization": "Bearer header.payload.fake_sig"}
    res2 = client.get("/api/auth/me", headers=headers2)
    assert res2.status_code == 401


def test_expired_token_returns_401():
    """Requirement 9 & 26: Expired token returns 401."""
    expired_token = make_test_clerk_token(
        sub="user_test_expired_1",
        exp_seconds=-100  # expired in past
    )
    headers = {"Authorization": f"Bearer {expired_token}"}
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 401
    assert "expired" in res.json().get("detail", "").lower()


def test_valid_clerk_token_creates_and_syncs_user():
    """Requirement 9, 11 & 26: Valid Clerk identity is accepted & synchronized in MongoDB."""
    clerk_id = "user_test_citizen_alpha"
    token = make_test_clerk_token(
        sub=clerk_id,
        email="citizen.alpha@sanchay.test",
        phone="+919876543210",
        name="Alpha Citizen"
    )
    headers = {"Authorization": f"Bearer {token}"}
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data.get("clerk_user_id") == clerk_id
    assert data.get("email") == "citizen.alpha@sanchay.test"
    assert data.get("phone") == "+919876543210"
    assert data.get("full_name") == "Alpha Citizen"

    # Verify MongoDB record
    users_col = get_users_collection()
    user_doc = users_col.find_one({"clerk_user_id": clerk_id})
    assert user_doc is not None
    assert user_doc["clerk_user_id"] == clerk_id


def test_user_plans_isolation():
    """
    Requirement 13, 24 & 26 (CRITICAL):
    User A cannot access or modify User B's saved plans.
    Never accepts an arbitrary user ID from the frontend.
    """
    user_a_id = "user_test_alice_plan"
    user_b_id = "user_test_bob_plan"

    token_a = make_test_clerk_token(sub=user_a_id, email="alice@test.com", name="Alice")
    token_b = make_test_clerk_token(sub=user_b_id, email="bob@test.com", name="Bob")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. User A saves PPF
    res_a_add = client.post("/api/auth/plans/add", json={"scheme_id": "ppf_001"}, headers=headers_a)
    assert res_a_add.status_code == 200
    assert "ppf_001" in res_a_add.json()["saved_plans"]

    # 2. User B saves SCSS
    res_b_add = client.post("/api/auth/plans/add", json={"scheme_id": "scss_001"}, headers=headers_b)
    assert res_b_add.status_code == 200
    assert "scss_001" in res_b_add.json()["saved_plans"]

    # 3. Verify User A only sees PPF, NOT SCSS
    res_a_plans = client.get("/api/auth/plans", headers=headers_a)
    assert res_a_plans.status_code == 200
    a_scheme_ids = [p.get("scheme_id") or p.get("id") for p in res_a_plans.json()]
    assert "ppf_001" in a_scheme_ids
    assert "scss_001" not in a_scheme_ids

    # 4. Verify User B only sees SCSS, NOT PPF
    res_b_plans = client.get("/api/auth/plans", headers=headers_b)
    assert res_b_plans.status_code == 200
    b_scheme_ids = [p.get("scheme_id") or p.get("id") for p in res_b_plans.json()]
    assert "scss_001" in b_scheme_ids
    assert "ppf_001" not in b_scheme_ids

    # 5. User A tries to remove User B's plan -> fails to remove from B
    res_a_remove_b = client.post("/api/auth/plans/remove", json={"scheme_id": "scss_001"}, headers=headers_a)
    assert res_a_remove_b.status_code == 200
    # User B's plans must still contain scss_001!
    res_b_plans_again = client.get("/api/auth/plans", headers=headers_b)
    b_ids_again = [p.get("scheme_id") or p.get("id") for p in res_b_plans_again.json()]
    assert "scss_001" in b_ids_again


def test_user_profile_isolation():
    """
    Requirement 14 & 26:
    User A cannot modify User B's profile.
    Modifying any request parameter does not compromise another user's profile.
    """
    user_a_id = "user_test_alice_prof"
    user_b_id = "user_test_bob_prof"

    token_a = make_test_clerk_token(sub=user_a_id, email="alice.p@test.com", name="Alice Original")
    token_b = make_test_clerk_token(sub=user_b_id, email="bob.p@test.com", name="Bob Original")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Initialize both profiles
    client.get("/api/auth/me", headers=headers_a)
    client.get("/api/auth/me", headers=headers_b)

    # User A updates profile with custom details
    update_data = {
        "full_name": "Alice Modified",
        "age": 28,
        "gender": "female",
        "profession": "Software Engineer"
    }
    res_update = client.put("/api/auth/profile", json=update_data, headers=headers_a)
    assert res_update.status_code == 200
    assert res_update.json()["user"]["full_name"] == "Alice Modified"
    assert res_update.json()["user"]["age"] == 28

    # Verify User B was NOT touched
    res_b_me = client.get("/api/auth/me", headers=headers_b)
    assert res_b_me.status_code == 200
    assert res_b_me.json()["full_name"] == "Bob Original"
    assert res_b_me.json()["age"] is None


def test_avatar_and_photo_update_under_verified_session():
    """Requirement 14: Profile photo and avatar updates only affect current authenticated user."""
    clerk_id = "user_test_avatar_citizen"
    token = make_test_clerk_token(sub=clerk_id, email="avatar@test.com", name="Avatar Citizen")
    headers = {"Authorization": f"Bearer {token}"}

    # Update avatar
    res_av = client.post("/api/auth/avatar", json={"avatar_id": "female_3"}, headers=headers)
    assert res_av.status_code == 200
    assert res_av.json()["user"]["avatar_id"] == "female_3"

    # Update profile photo
    res_photo = client.post("/api/auth/profile-photo", json={"profile_photo": "data:image/jpeg;base64,sample123"}, headers=headers)
    assert res_photo.status_code == 200
    assert res_photo.json()["user"]["profile_photo"] == "data:image/jpeg;base64,sample123"


if __name__ == "__main__":
    pytest.main(["-v", __file__])
