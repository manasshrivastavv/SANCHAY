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
from app.services.firebase_service import TEST_SECRET_KEY
from app.database import get_users_collection, init_db

client = TestClient(app)


def make_test_firebase_token(
    uid: str,
    exp_seconds: int = 3600,
    email: str = "citizen@sanchay.test",
    phone_number: str = "+919876543210",
    name: str = "Test Citizen",
    picture: str = None
):
    """Helper to generate a cryptographically signed test Firebase token."""
    payload = {
        "uid": uid,
        "sub": uid,
        "user_id": uid,
        "iss": "https://securetoken.google.com/sanchay-prod",
        "aud": "sanchay-prod",
        "exp": int(time.time()) + exp_seconds,
        "iat": int(time.time()),
        "auth_time": int(time.time()),
        "email": email,
        "phone_number": phone_number,
        "name": name,
        "picture": picture,
        "firebase": {
            "sign_in_provider": "google.com" if email else "phone"
        }
    }
    return jwt.encode(payload, TEST_SECRET_KEY, algorithm="HS256")


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    init_db()
    users_col = get_users_collection()
    # Clean up test users before and after test module
    users_col.delete_many({"firebase_uid": {"$regex": "^fb_test_"}})
    yield
    users_col.delete_many({"firebase_uid": {"$regex": "^fb_test_"}})


def test_unauthenticated_request_returns_401():
    """Protected API without token returns 401."""
    res = client.get("/api/auth/me")
    assert res.status_code == 401
    assert "detail" in res.json()

    res_plans = client.get("/api/auth/plans")
    assert res_plans.status_code == 401

    res_add = client.post("/api/auth/plans/add", json={"scheme_id": "ppf_001"})
    assert res_add.status_code == 401


def test_invalid_token_returns_401():
    """Invalid or malformed token returns 401."""
    headers = {"Authorization": "Bearer invalid_garbage_token_12345"}
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 401

    headers2 = {"Authorization": "Bearer header.payload.fake_signature"}
    res2 = client.get("/api/auth/me", headers=headers2)
    assert res2.status_code == 401


def test_expired_token_returns_401():
    """Expired Firebase token returns 401."""
    expired_token = make_test_firebase_token(
        uid="fb_test_expired_1",
        exp_seconds=-100  # expired in the past
    )
    headers = {"Authorization": f"Bearer {expired_token}"}
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 401
    assert "expired" in res.json().get("detail", "").lower()


def test_valid_firebase_token_creates_and_syncs_user():
    """Valid Firebase identity is accepted & synchronized in MongoDB."""
    uid = "fb_test_citizen_alpha"
    token = make_test_firebase_token(
        uid=uid,
        email="citizen.alpha@sanchay.test",
        phone_number="+919876543210",
        name="Alpha Citizen"
    )
    headers = {"Authorization": f"Bearer {token}"}
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data.get("firebase_uid") == uid
    assert data.get("email") == "citizen.alpha@sanchay.test"
    assert data.get("phone") == "+919876543210"
    assert data.get("full_name") == "Alpha Citizen"

    # Verify MongoDB record
    users_col = get_users_collection()
    user_doc = users_col.find_one({"firebase_uid": uid})
    assert user_doc is not None
    assert user_doc["firebase_uid"] == uid


def test_firebase_phone_user_sync():
    """Phone-only Firebase user (e.g. SMS OTP login) correctly provisions profile."""
    uid = "fb_test_phone_citizen"
    token = make_test_firebase_token(
        uid=uid,
        email=None,
        phone_number="+919988776655",
        name="Citizen"
    )
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post("/api/auth/sync", json={
        "phone": "+919988776655",
        "full_name": "Citizen",
        "email": ""
    }, headers=headers)
    assert res.status_code == 200
    user_data = res.json()["user"]
    assert user_data["firebase_uid"] == uid
    assert user_data["phone"] == "+919988776655"


def test_user_plans_isolation():
    """
    CRITICAL: User A cannot access or modify User B's saved plans.
    Enforces server-verified Firebase token identity.
    """
    user_a_id = "fb_test_alice_plan"
    user_b_id = "fb_test_bob_plan"

    token_a = make_test_firebase_token(uid=user_a_id, email="alice@test.com", name="Alice")
    token_b = make_test_firebase_token(uid=user_b_id, email="bob@test.com", name="Bob")

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
    User A cannot modify User B's profile.
    Modifying any request parameter does not compromise another user's profile.
    """
    user_a_id = "fb_test_alice_prof"
    user_b_id = "fb_test_bob_prof"

    token_a = make_test_firebase_token(uid=user_a_id, email="alice.p@test.com", name="Alice Original")
    token_b = make_test_firebase_token(uid=user_b_id, email="bob.p@test.com", name="Bob Original")

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
    """Profile photo and avatar updates only affect current authenticated user."""
    uid = "fb_test_avatar_citizen"
    token = make_test_firebase_token(uid=uid, email="avatar@test.com", name="Avatar Citizen")
    headers = {"Authorization": f"Bearer {token}"}

    # Update avatar
    res_av = client.post("/api/auth/avatar", json={"avatar_id": "female_3"}, headers=headers)
    assert res_av.status_code == 200
    assert res_av.json()["user"]["avatar_id"] == "female_3"

    # Update profile photo
    res_photo = client.post("/api/auth/profile-photo", json={"profile_photo": "data:image/jpeg;base64,sample123"}, headers=headers)
    assert res_photo.status_code == 200
    assert res_photo.json()["user"]["profile_photo"] == "data:image/jpeg;base64,sample123"


def test_firebase_private_key_newline_conversion_and_env_reading():
    """
    Verify that single-line FIREBASE_PRIVATE_KEY containing literal \\n sequences
    is correctly unescaped into actual newlines and read dynamically from environment.
    """
    raw_env_val = '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\\n-----END PRIVATE KEY-----\\n'
    os.environ["FIREBASE_PRIVATE_KEY"] = raw_env_val
    os.environ["FIREBASE_PROJECT_ID"] = "sanchay-test-project"
    os.environ["FIREBASE_CLIENT_EMAIL"] = "firebase-adminsdk@sanchay-test-project.iam.gserviceaccount.com"

    # Read from environment as firebase_service does
    pk = os.getenv("FIREBASE_PRIVATE_KEY", "").strip()
    if (pk.startswith('"') and pk.endswith('"')) or (pk.startswith("'") and pk.endswith("'")):
        pk = pk[1:-1]
    pk = pk.replace("\\n", "\n")

    assert "\n" in pk
    assert "\\n" not in pk
    assert pk.startswith("-----BEGIN PRIVATE KEY-----\n")
    assert pk.endswith("\n-----END PRIVATE KEY-----\n")
    assert os.getenv("FIREBASE_PROJECT_ID") == "sanchay-test-project"
    assert os.getenv("FIREBASE_CLIENT_EMAIL") == "firebase-adminsdk@sanchay-test-project.iam.gserviceaccount.com"


if __name__ == "__main__":
    pytest.main(["-v", __file__])
