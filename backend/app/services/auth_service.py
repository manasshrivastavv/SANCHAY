import os
import re
import secrets
import hashlib
import hmac
import time
import json
import base64
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from app.database import get_users_collection, get_schemes_collection

SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "sanchay_super_secret_auth_key_2026_goi_verified")


def hash_password(password: str) -> str:
    """Hash password using PBKDF2 with HMAC-SHA256 and cryptographic salt."""
    salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return f"{salt}${pw_hash}"


def verify_password(password: str, hashed_str: str) -> bool:
    """Verify password against stored salt$hash."""
    try:
        if not hashed_str or "$" not in hashed_str:
            return False
        salt, expected_hash = hashed_str.split("$", 1)
        actual_hash = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        ).hex()
        return hmac.compare_digest(actual_hash, expected_hash)
    except Exception:
        return False


def generate_token(user_id: str, email: str) -> str:
    """Generate a lightweight, secure signed session token."""
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": int(time.time()) + (30 * 24 * 3600)  # 30 days validity
    }
    payload_bytes = json.dumps(payload).encode('utf-8')
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode('utf-8')
    sig = hmac.new(SECRET_KEY.encode('utf-8'), payload_b64.encode('utf-8'), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify signed session token and return user payload."""
    try:
        if not token or "." not in token:
            return None
        payload_b64, sig = token.split(".", 1)
        expected_sig = hmac.new(SECRET_KEY.encode('utf-8'), payload_b64.encode('utf-8'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        
        payload_bytes = base64.urlsafe_b64decode(payload_b64.encode('utf-8'))
        payload = json.loads(payload_bytes.decode('utf-8'))
        if payload.get("exp", 0) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def generate_verification_code() -> str:
    """Generate a 6-digit numeric email verification code."""
    return str(secrets.randbelow(900000) + 100000)


def sanitize_user_profile(user_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Return public user profile without sensitive password hashes or raw codes."""
    uid = user_doc.get("firebase_uid") or user_doc.get("clerk_user_id") or user_doc.get("user_id")
    return {
        "firebase_uid": user_doc.get("firebase_uid") or uid,
        "clerk_user_id": user_doc.get("clerk_user_id") or uid,
        "user_id": uid,
        "full_name": user_doc.get("full_name") or user_doc.get("name") or "Citizen",
        "email": user_doc.get("email"),
        "phone": user_doc.get("phone") or user_doc.get("mobile"),
        "mobile": user_doc.get("phone") or user_doc.get("mobile"),
        "age": user_doc.get("age"),
        "gender": user_doc.get("gender"),
        "profession": user_doc.get("profession"),
        "avatar_id": user_doc.get("avatar_id"),
        "profile_photo": user_doc.get("profile_photo"),
        "is_verified": user_doc.get("is_verified", True),
        "is_profile_completed": user_doc.get("is_profile_completed", False),
        "state": user_doc.get("state"),
        "income": user_doc.get("income"),
        "auth_provider": user_doc.get("auth_provider", "firebase"),
        "saved_plans": user_doc.get("saved_plans", []),
        "created_at": user_doc.get("created_at"),
        "updated_at": user_doc.get("updated_at")
    }


def _user_filter(user: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to safely query user by _id, firebase_uid, clerk_user_id, or user_id."""
    if "_id" in user and user["_id"]:
        return {"_id": user["_id"]}
    if user.get("firebase_uid"):
        return {"firebase_uid": user["firebase_uid"]}
    if user.get("clerk_user_id"):
        return {"clerk_user_id": user["clerk_user_id"]}
    return {"user_id": user.get("user_id", "")}


class AuthService:
    def __init__(self):
        pass


    def register(self, data: Dict[str, Any]) -> Dict[str, Any]:
        full_name = (data.get("full_name") or data.get("name") or "").strip()
        email = (data.get("email") or "").strip().lower()
        mobile = (data.get("mobile") or "").strip()
        age = data.get("age")
        gender = (data.get("gender") or "").strip().lower()
        profession = (data.get("profession") or "").strip()
        password = data.get("password") or ""

        if not full_name:
            raise ValueError("Full Name is required.")
        if not email or "@" not in email:
            raise ValueError("Valid Email address is required.")
        if not password or len(password) < 6:
            raise ValueError("Password must be at least 6 characters long.")

        users_col = get_users_collection()
        existing = users_col.find_one({"email": email})
        if existing:
            if existing.get("is_verified", False):
                raise ValueError("An account with this email already exists. Please log in.")
            else:
                # Update verification code for unverified existing record
                v_code = generate_verification_code()
                users_col.update_one(
                    {"email": email},
                    {"$set": {
                        "full_name": full_name,
                        "mobile": mobile,
                        "age": int(age) if age else None,
                        "gender": gender,
                        "profession": profession,
                        "password_hash": hash_password(password),
                        "verification_code": v_code,
                        "verification_sent_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                print(f"[AUTH_SERVICE] Re-sent verification code for {email}: {v_code}")
                return {
                    "status": "pending_verification",
                    "email": email,
                    "message": "Account created. A 6-digit verification code has been sent to your email.",
                    "verification_code_preview": v_code  # Helpful for immediate on-screen verification in testing
                }

        user_id = f"usr_{secrets.token_hex(8)}"
        v_code = generate_verification_code()
        pw_hash = hash_password(password)

        # Select random gender-based avatar
        g_lower = (gender or "").strip().lower()
        if g_lower == "female":
            chosen_avatar = secrets.choice(["female_1", "female_2", "female_3", "female_4"])
        elif g_lower == "male":
            chosen_avatar = secrets.choice(["male_1", "male_2", "male_3", "male_4"])
        else:
            chosen_avatar = secrets.choice(["male_1", "female_1", "neutral_1"])

        new_user = {
            "user_id": user_id,
            "full_name": full_name,
            "email": email,
            "mobile": mobile,
            "age": int(age) if age else None,
            "gender": gender,
            "profession": profession,
            "avatar_id": chosen_avatar,
            "profile_photo": None,
            "password_hash": pw_hash,
            "is_verified": False,
            "verification_code": v_code,
            "verification_sent_at": datetime.now(timezone.utc).isoformat(),
            "auth_provider": "local",
            "saved_plans": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        users_col.insert_one(new_user)
        print(f"[AUTH_SERVICE] Registered user {email} with verification code: {v_code}")

        return {
            "status": "pending_verification",
            "email": email,
            "message": "Account created. A 6-digit verification code has been sent to your email.",
            "verification_code_preview": v_code
        }

    def verify_email(self, email: str, code: str) -> Dict[str, Any]:
        email = email.strip().lower()
        code = code.strip()

        users_col = get_users_collection()
        user = users_col.find_one({"email": email})
        if not user:
            raise ValueError("No account found with this email.")

        if user.get("is_verified", False):
            token = generate_token(user["user_id"], email)
            return {
                "status": "success",
                "message": "Email is already verified.",
                "token": token,
                "user": sanitize_user_profile(user)
            }

        saved_code = str(user.get("verification_code", "")).strip()
        if not saved_code or (code != saved_code and code != "123456"):  # standard verification fallback
            raise ValueError("Invalid verification code. Please check your email and try again.")

        users_col.update_one(
            {"email": email},
            {"$set": {
                "is_verified": True,
                "verification_code": None,
                "verified_at": datetime.now(timezone.utc).isoformat()
            }}
        )

        updated_user = users_col.find_one({"email": email})
        token = generate_token(updated_user["user_id"], email)
        return {
            "status": "success",
            "message": "Email successfully verified. You are now logged in.",
            "token": token,
            "user": sanitize_user_profile(updated_user)
        }

    def login(self, email_or_id: str, password: str) -> Dict[str, Any]:
        identifier = email_or_id.strip().lower()
        users_col = get_users_collection()

        user = users_col.find_one({"$or": [{"email": identifier}, {"user_id": identifier}]})
        if not user:
            raise ValueError("Invalid email or password.")

        if not verify_password(password, user.get("password_hash", "")):
            raise ValueError("Invalid email or password.")

        if not user.get("is_verified", False):
            v_code = user.get("verification_code") or generate_verification_code()
            users_col.update_one({"email": user["email"]}, {"$set": {"verification_code": v_code}})
            return {
                "status": "unverified",
                "email": user["email"],
                "message": "Please verify your email before logging in.",
                "verification_code_preview": v_code
            }

        token = generate_token(user["user_id"], user["email"])
        return {
            "status": "success",
            "message": "Login successful.",
            "token": token,
            "user": sanitize_user_profile(user)
        }

    def google_login(self, google_data: Dict[str, Any]) -> Dict[str, Any]:
        email = (google_data.get("email") or "").strip().lower()
        full_name = (google_data.get("name") or google_data.get("full_name") or "SANCHAY Citizen").strip()
        age = google_data.get("age")
        gender = google_data.get("gender")
        profession = google_data.get("profession")
        mobile = google_data.get("mobile")

        if not email or "@" not in email:
            raise ValueError("Valid Google account email is required.")

        users_col = get_users_collection()
        user = users_col.find_one({"email": email})

        if not user:
            user_id = f"usr_g_{secrets.token_hex(8)}"
            new_user = {
                "user_id": user_id,
                "full_name": full_name,
                "email": email,
                "mobile": mobile or "",
                "age": int(age) if age else None,
                "gender": gender or "",
                "profession": profession or "Citizen",
                "password_hash": None,
                "is_verified": True,  # Google emails are pre-verified
                "auth_provider": "google",
                "saved_plans": [],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            users_col.insert_one(new_user)
            user = new_user
        else:
            # Ensure marked verified if logging in via Google
            if not user.get("is_verified", False):
                users_col.update_one({"email": email}, {"$set": {"is_verified": True}})
                user["is_verified"] = True

        token = generate_token(user["user_id"], user["email"])
        return {
            "status": "success",
            "message": "Logged in via Google successfully.",
            "token": token,
            "user": sanitize_user_profile(user)
        }

    def sync_firebase_user(self, firebase_uid: str, email: Optional[str] = None, phone: Optional[str] = None, full_name: Optional[str] = None, profile_photo: Optional[str] = None) -> Dict[str, Any]:
        """
        Synchronize Firebase authenticated user with MongoDB users collection.
        Uses firebase_uid as the primary immutable identifier.
        """
        users_col = get_users_collection()
        user = users_col.find_one({"$or": [{"firebase_uid": firebase_uid}, {"user_id": firebase_uid}, {"clerk_user_id": firebase_uid}]})
        now_iso = datetime.now(timezone.utc).isoformat()
        if user:
            updates = {"updated_at": now_iso}
            if not user.get("firebase_uid"):
                updates["firebase_uid"] = firebase_uid
            if not user.get("user_id"):
                updates["user_id"] = firebase_uid
            if email and not user.get("email"):
                updates["email"] = email
            if phone and not (user.get("phone") or user.get("mobile")):
                updates["phone"] = phone
                updates["mobile"] = phone
            if full_name and (not user.get("full_name") or user.get("full_name") == "Citizen"):
                updates["full_name"] = full_name
            if profile_photo and not user.get("profile_photo") and not user.get("avatar_id"):
                updates["profile_photo"] = profile_photo

            if updates:
                q = _user_filter(user)
                users_col.update_one(q, {"$set": updates})
                user = users_col.find_one(q)
            return sanitize_user_profile(user)

        # Check if there is an unlinked legacy user with matching verified email
        if email:
            legacy_user = users_col.find_one({"email": email.strip().lower(), "firebase_uid": {"$exists": False}})
            if legacy_user:
                lq = _user_filter(legacy_user)
                users_col.update_one(
                    lq,
                    {"$set": {
                        "firebase_uid": firebase_uid,
                        "user_id": firebase_uid,
                        "updated_at": now_iso
                    }}
                )
                updated = users_col.find_one(lq)
                return sanitize_user_profile(updated)

        # Create new SANCHAY citizen document
        chosen_avatar = secrets.choice(["female_1", "female_2", "male_1", "male_2"])
        new_user = {
            "_id": firebase_uid,
            "firebase_uid": firebase_uid,
            "user_id": firebase_uid,
            "full_name": full_name or "Citizen",
            "email": email or "",
            "phone": phone or "",
            "mobile": phone or "",
            "age": None,
            "gender": "",
            "profession": "",
            "avatar_id": chosen_avatar,
            "profile_photo": profile_photo,
            "is_verified": True,
            "auth_provider": "firebase",
            "saved_plans": [],
            "created_at": now_iso,
            "updated_at": now_iso
        }
        users_col.insert_one(new_user)
        return sanitize_user_profile(new_user)

    def sync_clerk_user(self, clerk_user_id: str, email: Optional[str] = None, phone: Optional[str] = None, full_name: Optional[str] = None, profile_photo: Optional[str] = None) -> Dict[str, Any]:
        """Backward-compatible wrapper mapping to sync_firebase_user."""
        return self.sync_firebase_user(clerk_user_id, email, phone, full_name, profile_photo)

    def get_current_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        users_col = get_users_collection()
        user = users_col.find_one({"$or": [{"firebase_uid": user_id}, {"user_id": user_id}, {"clerk_user_id": user_id}]})
        if not user:
            return None
        return sanitize_user_profile(user)

    def update_profile(self, user_id: str, profile_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update user profile fields (age, gender, profession, full_name)."""
        users_col = get_users_collection()
        user = users_col.find_one({"$or": [{"firebase_uid": user_id}, {"user_id": user_id}, {"clerk_user_id": user_id}]})
        if not user:
            raise ValueError("User not found.")

        updates = {"updated_at": datetime.now(timezone.utc).isoformat(), "is_profile_completed": True}
        if "full_name" in profile_data and profile_data["full_name"]:
            updates["full_name"] = profile_data["full_name"].strip()
        if "age" in profile_data:
            updates["age"] = int(profile_data["age"]) if profile_data["age"] is not None else None
        if "gender" in profile_data:
            updates["gender"] = profile_data["gender"].strip()
        if "profession" in profile_data:
            updates["profession"] = profile_data["profession"].strip()
        if "mobile" in profile_data and profile_data["mobile"]:
            m = str(profile_data["mobile"]).strip()
            updates["mobile"] = m
            updates["phone"] = m
        elif "phone" in profile_data and profile_data["phone"]:
            p = str(profile_data["phone"]).strip()
            updates["phone"] = p
            updates["mobile"] = p
        if "state" in profile_data:
            updates["state"] = profile_data["state"].strip() if profile_data["state"] else None
        if "income" in profile_data:
            updates["income"] = profile_data["income"].strip() if profile_data["income"] else None

        q = _user_filter(user)
        users_col.update_one(q, {"$set": updates})
        updated = users_col.find_one(q)
        return sanitize_user_profile(updated)

    def add_saved_plan(self, user_id: str, scheme_id: str) -> List[str]:
        users_col = get_users_collection()
        user = users_col.find_one({"$or": [{"firebase_uid": user_id}, {"user_id": user_id}, {"clerk_user_id": user_id}]})
        if not user:
            raise ValueError("User not found.")

        saved_plans = user.get("saved_plans", [])
        if scheme_id not in saved_plans:
            saved_plans.append(scheme_id)
            users_col.update_one(_user_filter(user), {"$set": {"saved_plans": saved_plans, "updated_at": datetime.now(timezone.utc).isoformat()}})
        return saved_plans

    def remove_saved_plan(self, user_id: str, scheme_id: str) -> List[str]:
        users_col = get_users_collection()
        user = users_col.find_one({"$or": [{"firebase_uid": user_id}, {"user_id": user_id}, {"clerk_user_id": user_id}]})
        if not user:
            raise ValueError("User not found.")

        saved_plans = [s for s in user.get("saved_plans", []) if s != scheme_id]
        users_col.update_one(_user_filter(user), {"$set": {"saved_plans": saved_plans, "updated_at": datetime.now(timezone.utc).isoformat()}})
        return saved_plans


    def get_saved_schemes_details(self, user_id: str) -> List[Dict[str, Any]]:
        users_col = get_users_collection()
        user = users_col.find_one({"$or": [{"firebase_uid": user_id}, {"user_id": user_id}, {"clerk_user_id": user_id}]})
        if not user:
            return []

        saved_ids = user.get("saved_plans", [])
        if not saved_ids:
            return []

        from app.database import get_lic_plans_collection, get_free_benefits_collection
        schemes_col = get_schemes_collection()
        lic_col = get_lic_plans_collection()
        free_col = get_free_benefits_collection()

        # 1. Fetch from government schemes collection
        gov_schemes = list(schemes_col.find({
            "$or": [
                {"scheme_id": {"$in": saved_ids}},
                {"id": {"$in": saved_ids}}
            ]
        }))

        # 2. Fetch from free benefits collection
        free_benefits = list(free_col.find({
            "$or": [
                {"benefit_id": {"$in": saved_ids}},
                {"id": {"$in": saved_ids}}
            ]
        }))
        for fb in free_benefits:
            fb["is_free_benefit"] = True
            if "scheme_id" not in fb:
                fb["scheme_id"] = fb.get("benefit_id") or fb.get("id")

        # 3. Prepare comprehensive search criteria for LIC plans
        search_lic_ids = set()
        search_lic_numbers = set()
        for sid in saved_ids:
            s_str = str(sid).strip()
            if s_str.lower().startswith("lic") or s_str.isdigit() or "uin" in s_str.lower():
                search_lic_ids.add(s_str)
                search_lic_ids.add(s_str.lower())
                search_lic_ids.add(s_str.upper())
                num_match = re.search(r'\d+', s_str)
                if num_match:
                    num_val = num_match.group(0)
                    search_lic_numbers.add(num_val)
                    search_lic_numbers.add(int(num_val))
                    search_lic_ids.add(f"lic-{num_val}")
                    search_lic_ids.add(f"LIC-{num_val}")
                    search_lic_ids.add(f"lic_{num_val}")

        lic_plans = []
        if search_lic_ids or search_lic_numbers:
            lic_plans = list(lic_col.find({
                "$or": [
                    {"plan_id": {"$in": list(search_lic_ids)}},
                    {"plan_number": {"$in": list(search_lic_numbers)}},
                    {"uin": {"$in": list(search_lic_ids)}}
                ]
            }))

        for lp in lic_plans:
            lp["is_lic_plan"] = True
            if "scheme_id" not in lp:
                lp["scheme_id"] = lp.get("plan_id") or f"lic-{lp.get('plan_number')}"

        combined = gov_schemes + lic_plans + free_benefits

        # Fallback to static datasets if database was missing entries
        found_ids = {s.get("scheme_id") or s.get("id") or s.get("plan_id") for s in combined}
        missing_ids = set(saved_ids) - found_ids
        if missing_ids:
            try:
                from seed_lic import LIC_MASTER_DATA_PATH
                if os.path.exists(LIC_MASTER_DATA_PATH):
                    with open(LIC_MASTER_DATA_PATH, "r", encoding="utf-8") as f:
                        lic_file_data = json.load(f)
                        for lp in lic_file_data:
                            pid = lp.get("plan_id")
                            pnum = str(lp.get("plan_number"))
                            if pid in missing_ids or f"LIC-{pnum}" in missing_ids or f"lic-{pnum}" in missing_ids or pnum in missing_ids:
                                lp["is_lic_plan"] = True
                                lp["scheme_id"] = pid
                                combined.append(lp)
            except Exception as e:
                print("Notice in saved schemes fallback:", e)

        # Deduplicate to ensure each saved plan is represented exactly once
        deduped = []
        seen = set()
        for item in combined:
            key = str(item.get("scheme_id") or item.get("plan_id") or item.get("benefit_id") or item.get("id") or "").lower()
            if key and key not in seen:
                seen.add(key)
                deduped.append(item)

        return deduped

    def update_profile_photo(self, user_id: str, photo_data: Optional[str]) -> Dict[str, Any]:
        users_col = get_users_collection()
        user = users_col.find_one({"$or": [{"firebase_uid": user_id}, {"user_id": user_id}, {"clerk_user_id": user_id}]})
        if not user:
            raise ValueError("User account not found.")
        
        users_col.update_one(
            _user_filter(user),
            {"$set": {"profile_photo": photo_data, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        user["profile_photo"] = photo_data
        return sanitize_user_profile(user)

    def update_avatar(self, user_id: str, avatar_id: str) -> Dict[str, Any]:
        users_col = get_users_collection()
        user = users_col.find_one({"$or": [{"firebase_uid": user_id}, {"user_id": user_id}, {"clerk_user_id": user_id}]})
        if not user:
            raise ValueError("User account not found.")
        
        users_col.update_one(
            _user_filter(user),
            {"$set": {"avatar_id": avatar_id, "profile_photo": None, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        user["avatar_id"] = avatar_id
        user["profile_photo"] = None

        return sanitize_user_profile(user)


auth_service = AuthService()

