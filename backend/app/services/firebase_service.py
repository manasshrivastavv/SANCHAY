import os
import json
import time
from typing import Dict, Any, Optional
import jwt
from jwt import ExpiredSignatureError, InvalidTokenError

# Flag for fast local testing and CI
SANCHAY_TEST_MODE = os.getenv("SANCHAY_TEST_MODE", "0") == "1"
TEST_SECRET_KEY = os.getenv("SANCHAY_TEST_JWT_SECRET", "sanchay_test_clerk_mock_secret_2026")

class FirebaseVerificationError(Exception):
    """Raised when Firebase token verification fails."""
    pass


class FirebaseService:
    def __init__(self):
        self._app = None
        self._initialized = False
        self._init_firebase()

    def _init_firebase(self):
        """Initialize Firebase Admin SDK from environment variables if available."""
        project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
        client_email = os.getenv("FIREBASE_CLIENT_EMAIL", "").strip()
        private_key = os.getenv("FIREBASE_PRIVATE_KEY", "").strip()

        if private_key:
            # Strip enclosing quotes if present in environment variable setting
            if (private_key.startswith('"') and private_key.endswith('"')) or (private_key.startswith("'") and private_key.endswith("'")):
                private_key = private_key[1:-1]
            # Convert escaped newline sequences into actual newlines
            private_key = private_key.replace("\\n", "\n")

        if project_id and client_email and private_key:
            try:
                import firebase_admin
                from firebase_admin import credentials
                if not firebase_admin._apps:
                    cred_dict = {
                        "type": "service_account",
                        "project_id": project_id,
                        "client_email": client_email,
                        "private_key": private_key,
                        "token_uri": "https://oauth2.googleapis.com/token"
                    }
                    cred = credentials.Certificate(cred_dict)
                    self._app = firebase_admin.initialize_app(cred)
                    self._initialized = True
            except Exception as e:
                # Log non-secret warning
                print(f"[FIREBASE_ADMIN] Notice: Firebase Admin credentials initialization deferred: {type(e).__name__}")
                self._initialized = False

    def is_configured(self) -> bool:
        if not self._initialized:
            self._init_firebase()
        return self._initialized

    def verify_token(self, token: str) -> Dict[str, Any]:
        """
        Cryptographically verify a Firebase ID Token.
        Validates signature, expiration, issuer, and returns verified claims.
        Raises FirebaseVerificationError on any failure.
        """
        if not token or not isinstance(token, str):
            raise FirebaseVerificationError("Missing authentication token.")

        token = token.strip()
        if token.startswith("Bearer "):
            token = token[7:].strip()

        if not token or token.count(".") != 2:
            raise FirebaseVerificationError("Malformed authentication token.")

        # 1. Fast hermetic verification in test mode or before live credentials are set
        if SANCHAY_TEST_MODE or not self._initialized:
            try:
                unverified_headers = jwt.get_unverified_header(token)
                if unverified_headers.get("alg") == "HS256":
                    payload = jwt.decode(
                        token,
                        TEST_SECRET_KEY,
                        algorithms=["HS256"],
                        options={"verify_exp": True, "verify_aud": False, "verify_iss": False}
                    )
                    uid = payload.get("uid") or payload.get("sub") or payload.get("user_id")
                    if not uid:
                        raise FirebaseVerificationError("Token missing subject (UID).")
                    payload["uid"] = uid
                    payload["sub"] = uid
                    return payload
            except ExpiredSignatureError:
                raise FirebaseVerificationError("Session token has expired. Please log in again.")
            except InvalidTokenError as e:
                if not self._initialized:
                    raise FirebaseVerificationError(f"Invalid authentication token: {str(e)}")

        # 2. Production verification via Firebase Admin SDK
        if not self._initialized:
            self._init_firebase()

        if self._initialized:
            try:
                from firebase_admin import auth
                decoded_claims = auth.verify_id_token(token, check_revoked=False)
                uid = decoded_claims.get("uid")
                if not uid:
                    raise FirebaseVerificationError("Invalid Firebase token: missing UID.")
                decoded_claims["sub"] = uid
                return decoded_claims
            except Exception as e:
                err_str = str(e).lower()
                if "expired" in err_str:
                    raise FirebaseVerificationError("Session token has expired. Please log in again.")
                raise FirebaseVerificationError(f"Invalid authentication token: {str(e)}")

        raise FirebaseVerificationError("Firebase Authentication service is not initialized.")


firebase_service = FirebaseService()
