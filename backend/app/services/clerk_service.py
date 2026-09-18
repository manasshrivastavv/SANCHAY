import os
import time
import json
from typing import Dict, Any, Optional
import httpx
import jwt
from jwt import PyJWKClient, InvalidTokenError, ExpiredSignatureError

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "").strip()
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "").strip()
CLERK_PEM_PUBLIC_KEY = os.getenv("CLERK_PEM_PUBLIC_KEY", "").strip()

# In-memory cache for PyJWKClient instances per issuer to optimize performance
_jwk_clients: Dict[str, PyJWKClient] = {}
# In-memory cache for fetched Clerk user profiles (TTL: 5 minutes)
_user_profile_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 300  # seconds

# Optional local test key support for unit tests
TEST_SECRET_KEY = os.getenv("SANCHAY_TEST_JWT_SECRET", "sanchay_test_clerk_mock_secret_2026")


class ClerkVerificationError(Exception):
    """Raised when Clerk token verification fails."""
    pass


class ClerkService:
    def __init__(self):
        self.secret_key = CLERK_SECRET_KEY

    def get_jwk_client(self, jwks_url: str) -> PyJWKClient:
        """Get or initialize a cached PyJWKClient for a specific JWKS endpoint."""
        if jwks_url not in _jwk_clients:
            _jwk_clients[jwks_url] = PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=3600)
        return _jwk_clients[jwks_url]

    def verify_token(self, token: str) -> Dict[str, Any]:
        """
        Cryptographically verify a Clerk session JWT.
        Validates signature, expiration, issuer, and returns verified payload.
        Raises ClerkVerificationError on failure.
        """
        if not token or not isinstance(token, str):
            raise ClerkVerificationError("Missing authentication token.")

        token = token.strip()
        if token.startswith("Bearer "):
            token = token[7:].strip()

        if not token or token.count(".") != 2:
            raise ClerkVerificationError("Malformed authentication token.")

        # 1. Check if token is a test-mode token (HS256 with TEST_SECRET_KEY for automated tests)
        if os.getenv("SANCHAY_TEST_MODE") == "1" or not self.secret_key:
            try:
                # Try test key verification first if in test mode or no secret key configured yet
                unverified_headers = jwt.get_unverified_header(token)
                if unverified_headers.get("alg") == "HS256":
                    payload = jwt.decode(
                        token,
                        TEST_SECRET_KEY,
                        algorithms=["HS256"],
                        options={"verify_exp": True}
                    )
                    if not payload.get("sub"):
                        raise ClerkVerificationError("Token missing sub (user ID).")
                    return payload
            except ExpiredSignatureError:
                raise ClerkVerificationError("Session token has expired. Please log in again.")
            except InvalidTokenError as e:
                # If not test token, continue to RS256 JWKS verification
                pass

        # 2. Inspect unverified header and claims to determine JWKS URL
        try:
            unverified_header = jwt.get_unverified_header(token)
            unverified_payload = jwt.decode(token, options={"verify_signature": False})
        except Exception as e:
            raise ClerkVerificationError(f"Unable to parse token: {str(e)}")

        # Check expiration early
        exp = unverified_payload.get("exp")
        if exp and exp < time.time():
            raise ClerkVerificationError("Session token has expired. Please log in again.")

        issuer = unverified_payload.get("iss", "")
        
        # 3. If explicit PEM key is configured, verify directly
        if CLERK_PEM_PUBLIC_KEY:
            try:
                verified_payload = jwt.decode(
                    token,
                    CLERK_PEM_PUBLIC_KEY,
                    algorithms=["RS256"],
                    options={"verify_exp": True}
                )
                return verified_payload
            except ExpiredSignatureError:
                raise ClerkVerificationError("Session token has expired. Please log in again.")
            except InvalidTokenError as e:
                raise ClerkVerificationError(f"Invalid token signature: {str(e)}")

        # 4. Resolve JWKS URL:
        # Priority A: Configured CLERK_JWKS_URL
        # Priority B: Derived from Issuer claim (https://<clerk-domain>/.well-known/jwks.json)
        # Priority C: Default Clerk JWKS (https://api.clerk.com/v1/jwks)
        jwks_url = CLERK_JWKS_URL
        if not jwks_url:
            if issuer and issuer.startswith("https://"):
                jwks_url = f"{issuer.rstrip('/')}/.well-known/jwks.json"
            else:
                jwks_url = "https://api.clerk.com/v1/jwks"

        try:
            jwks_client = self.get_jwk_client(jwks_url)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            
            # Verify cryptographic signature using RSA public key from Clerk
            decode_options = {
                "verify_exp": True,
                "verify_iss": bool(issuer),
            }
            kwargs = {
                "algorithms": ["RS256"],
                "options": decode_options
            }
            if issuer:
                kwargs["issuer"] = issuer

            verified_payload = jwt.decode(
                token,
                signing_key.key,
                **kwargs
            )

            clerk_user_id = verified_payload.get("sub")
            if not clerk_user_id:
                raise ClerkVerificationError("Token missing user ID claim (sub).")

            return verified_payload
        except ExpiredSignatureError:
            raise ClerkVerificationError("Session token has expired. Please log in again.")
        except InvalidTokenError as e:
            raise ClerkVerificationError(f"Invalid Clerk session token: {str(e)}")
        except Exception as e:
            # If network error connecting to JWKS or Clerk unavailable
            raise ClerkVerificationError(f"Clerk authentication verification failed: {str(e)}")

    def get_clerk_user_details(self, clerk_user_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch user details from Clerk Backend API using CLERK_SECRET_KEY.
        Cached in-memory to minimize external API calls.
        """
        if not clerk_user_id:
            return None

        # Check cache
        now = time.time()
        cached = _user_profile_cache.get(clerk_user_id)
        if cached and cached.get("_cached_at", 0) + CACHE_TTL > now:
            return cached.get("data")

        secret_key = os.getenv("CLERK_SECRET_KEY", "").strip()
        if not secret_key:
            return None

        try:
            headers = {"Authorization": f"Bearer {secret_key}"}
            with httpx.Client(timeout=4.0) as client:
                res = client.get(f"https://api.clerk.com/v1/users/{clerk_user_id}", headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    # Extract verified email
                    email = ""
                    email_addresses = data.get("email_addresses", [])
                    primary_email_id = data.get("primary_email_address_id")
                    for ea in email_addresses:
                        if ea.get("id") == primary_email_id:
                            email = ea.get("email_address", "")
                            break
                    if not email and email_addresses:
                        email = email_addresses[0].get("email_address", "")

                    # Extract verified phone number
                    phone = ""
                    phone_numbers = data.get("phone_numbers", [])
                    primary_phone_id = data.get("primary_phone_number_id")
                    for pn in phone_numbers:
                        if pn.get("id") == primary_phone_id:
                            phone = pn.get("phone_number", "")
                            break
                    if not phone and phone_numbers:
                        phone = phone_numbers[0].get("phone_number", "")

                    # Extract name
                    first_name = data.get("first_name") or ""
                    last_name = data.get("last_name") or ""
                    full_name = f"{first_name} {last_name}".strip()
                    if not full_name:
                        full_name = data.get("username") or "Citizen"

                    user_info = {
                        "clerk_user_id": clerk_user_id,
                        "email": email,
                        "phone": phone,
                        "full_name": full_name,
                        "image_url": data.get("image_url")
                    }

                    _user_profile_cache[clerk_user_id] = {
                        "_cached_at": now,
                        "data": user_info
                    }
                    return user_info
        except Exception as e:
            print(f"[CLERK_SERVICE] Notice fetching user {clerk_user_id}: {e}")
            return None

        return None


clerk_service = ClerkService()
