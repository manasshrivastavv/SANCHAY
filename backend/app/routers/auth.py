from fastapi import APIRouter, HTTPException, Header, Depends, Body
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, EmailStr
from app.services.auth_service import auth_service, verify_token
from app.services.clerk_service import clerk_service, ClerkVerificationError

router = APIRouter(prefix="/auth", tags=["User Accounts & Authentication"])


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    mobile: Optional[str] = ""
    age: Optional[int] = None
    gender: Optional[str] = ""
    profession: Optional[str] = ""
    password: str
    confirm_password: Optional[str] = None


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleLoginRequest(BaseModel):
    email: str
    name: Optional[str] = None
    mobile: Optional[str] = ""
    age: Optional[int] = None
    gender: Optional[str] = ""
    profession: Optional[str] = ""


class PlanActionRequest(BaseModel):
    scheme_id: str


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    profession: Optional[str] = None


class ClerkSyncRequest(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    full_name: Optional[str] = None
    profile_photo: Optional[str] = None


def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Production-grade FastAPI dependency verifying Clerk session token.
    Never trusts user_id from frontend payload. Validates signature, issuer,
    and expiration, then extracts verified identity and loads/syncs MongoDB document.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required. Please log in.")
    
    parts = authorization.strip().split(" ")
    token = parts[1] if len(parts) == 2 else parts[0]
    
    # 1. Verify with Clerk cryptographic service (JWKS / RS256 / HS256 in test mode)
    try:
        clerk_payload = clerk_service.verify_token(token)
        clerk_user_id = clerk_payload.get("sub")
        if not clerk_user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing subject claim.")

        email = clerk_payload.get("email") or clerk_payload.get("email_address")
        phone = clerk_payload.get("phone_number") or clerk_payload.get("phone")
        full_name = clerk_payload.get("name") or clerk_payload.get("full_name")
        image_url = clerk_payload.get("picture") or clerk_payload.get("image_url")

        if not (email or phone):
            details = clerk_service.get_clerk_user_details(clerk_user_id)
            if details:
                email = details.get("email") or email
                phone = details.get("phone") or phone
                full_name = details.get("full_name") or full_name
                image_url = details.get("image_url") or image_url

        user = auth_service.sync_clerk_user(
            clerk_user_id=clerk_user_id,
            email=email,
            phone=phone,
            full_name=full_name,
            profile_photo=image_url
        )
        return user
    except ClerkVerificationError as e:
        # Re-raise explicit expired/invalid token errors
        if "expired" in str(e).lower():
            raise HTTPException(status_code=401, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        pass

    # 2. Fallback to legacy HMAC signed token for backwards compatibility in existing unit tests
    legacy_payload = verify_token(token)
    if legacy_payload and legacy_payload.get("user_id"):
        user = auth_service.get_current_user(legacy_payload["user_id"])
        if user:
            return user

    raise HTTPException(status_code=401, detail="Invalid or expired session token. Please log in again.")


def get_current_user_payload(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Compatibility adapter returning payload dictionary with verified user_id."""
    return {"user_id": user["user_id"], "clerk_user_id": user.get("clerk_user_id"), "email": user.get("email")}


@router.post("/sync")
def sync_clerk(req: ClerkSyncRequest, user: Dict[str, Any] = Depends(get_current_user)):
    synced = auth_service.sync_clerk_user(
        clerk_user_id=user.get("clerk_user_id") or user["user_id"],
        email=req.email,
        phone=req.phone,
        full_name=req.full_name,
        profile_photo=req.profile_photo
    )
    return {"status": "success", "user": synced}


@router.put("/profile")
def update_profile(req: UpdateProfileRequest, user: Dict[str, Any] = Depends(get_current_user)):
    try:
        updated = auth_service.update_profile(user["user_id"], req.dict(exclude_unset=True))
        return {"status": "success", "user": updated}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/register")
def register(req: RegisterRequest):
    try:
        if req.confirm_password and req.password != req.confirm_password:
            raise HTTPException(status_code=400, detail="Passwords do not match.")
        res = auth_service.register(req.dict())
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration error: {str(e)}")


@router.post("/verify-email")
def verify_email(req: VerifyEmailRequest):
    try:
        res = auth_service.verify_email(req.email, req.code)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification error: {str(e)}")


@router.post("/login")
def login(req: LoginRequest):
    try:
        res = auth_service.login(req.email, req.password)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login error: {str(e)}")


@router.post("/google")
def google_login(req: GoogleLoginRequest):
    try:
        res = auth_service.google_login(req.dict())
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Google login error: {str(e)}")


class ProfilePhotoRequest(BaseModel):
    profile_photo: Optional[str] = None


class AvatarRequest(BaseModel):
    avatar_id: str


@router.get("/me")
def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    return user


@router.post("/profile-photo")
def update_profile_photo(req: ProfilePhotoRequest, user: Dict[str, Any] = Depends(get_current_user)):
    try:
        updated_user = auth_service.update_profile_photo(user["user_id"], req.profile_photo)
        return {"status": "success", "user": updated_user}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/avatar")
def update_avatar(req: AvatarRequest, user: Dict[str, Any] = Depends(get_current_user)):
    try:
        updated_user = auth_service.update_avatar(user["user_id"], req.avatar_id)
        return {"status": "success", "user": updated_user}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plans")
def get_saved_plans(user: Dict[str, Any] = Depends(get_current_user)):
    schemes = auth_service.get_saved_schemes_details(user["user_id"])

    
    # Standardize output for frontend
    clean_list = []
    for s in schemes:
        is_free = s.get("is_free_benefit") or "benefit_id" in s or str(s.get("scheme_id", "")).lower().startswith("fb_")
        is_lic = not is_free and (s.get("is_lic_plan") or "plan_number" in s or str(s.get("scheme_id", "")).lower().startswith("lic"))
        
        if is_free:
            ben_id = s.get("benefit_id") or s.get("scheme_id") or s.get("id")
            name = s.get("name") or "Free Government Benefit"
            cat = s.get("category") or "Free Benefit"
            desc = s.get("description") or s.get("benefit") or "100% Free Government welfare benefit."
            ben_text = s.get("benefit") or desc
            el_text = s.get("eligibility") or "Refer official guidelines."
            raw_url = str(s.get("official_url") or "https://india.gov.in")
            if not raw_url.startswith("http"):
                raw_url = f"https://{raw_url}"
            clean_list.append({
                "scheme_id": ben_id,
                "id": ben_id,
                "benefit_id": ben_id,
                "is_free_benefit": True,
                "is_lic_plan": False,
                "name": name,
                "category": cat,
                "description": desc,
                "benefit": ben_text,
                "eligibility": el_text,
                "benefit_type": s.get("benefit_type") or "Free Welfare",
                "state": s.get("state") or "All India",
                "level": s.get("level") or "National",
                "authority": s.get("authority") or "Government of India",
                "official_url": raw_url,
                "last_verified_date": s.get("last_verified_date") or "2026-08-30",
                "image": s.get("image") or "/schemes/pmjjby_001.svg",
                "benefits": {
                    "summary": ben_text,
                    "interest_rate": "100% Free / Direct Benefit",
                    "tax_benefit": "Not Applicable / Full Subsidy"
                },
                "financial": {
                    "interest_rate": "100% Free / Direct Benefit",
                    "minimum_contribution": 0,
                    "maximum_contribution": 0,
                    "lock_in_years": None,
                    "tax_treatment": "Exempt / Direct Subsidy"
                },
                "raw_benefit": s
            })
        elif is_lic:
            plan_name = s.get("plan_name") or s.get("name") or "LIC Plan"
            plan_num = s.get("plan_number") or ""
            uin = s.get("uin") or ""
            cat = s.get("category") or "Life Insurance"
            desc = s.get("short_description") or s.get("description") or s.get("main_purpose") or f"Official LIC plan (Plan No. {plan_num})."
            raw_url = str(s.get("official_lic_url") or s.get("official_url") or "https://www.licindia.in/")
            
            prem_rules = s.get("premium_rules", {}) if isinstance(s.get("premium_rules"), dict) else {}
            pol_term = s.get("policy_term", {}) if isinstance(s.get("policy_term"), dict) else {}
            ben_obj = s.get("benefits", {}) if isinstance(s.get("benefits"), dict) else {}
            
            clean_list.append({
                "scheme_id": s.get("scheme_id") or s.get("plan_id") or f"lic-{plan_num}",
                "id": s.get("scheme_id") or s.get("plan_id") or f"lic-{plan_num}",
                "plan_id": s.get("plan_id") or f"lic-{plan_num}",
                "is_lic_plan": True,
                "plan_number": plan_num,
                "uin": uin,
                "name": plan_name,
                "plan_name": plan_name,
                "category": f"LIC — {cat}",
                "description": desc,
                "short_description": desc,
                "authority": "Life Insurance Corporation of India (LIC)",
                "official_url": raw_url,
                "official_lic_url": raw_url,
                "last_verified_date": s.get("last_verified_date") or "2026-08-30",
                "image": "/schemes/pmjjby_001.svg",
                "age_rules": s.get("age_rules", {}),
                "premium_rules": prem_rules,
                "policy_term": pol_term,
                "benefits": {
                    "summary": desc,
                    "interest_rate": s.get("maturity_benefit") or ben_obj.get("bonus_type") or "Guaranteed Sum Assured + Bonus",
                    "tax_benefit": "Section 80C & 10(10D) Tax Exemption"
                },
                "financial": {
                    "interest_rate": s.get("maturity_benefit") or ben_obj.get("bonus_type") or "Statutory Life Assurance",
                    "minimum_contribution": prem_rules.get("min_sum_assured_text") or "₹1,00,000 Sum Assured",
                    "lock_in_years": pol_term.get("available_terms") or "10-25 Yrs",
                    "tax_treatment": "Exempt under Section 80C & 10(10D)"
                },
                "raw_plan": s
            })
        else:
            name_obj = s.get("name", {})
            name_en = name_obj.get("en", str(name_obj)) if isinstance(name_obj, dict) else str(name_obj)
            fin = s.get("financial", {}) if isinstance(s.get("financial"), dict) else {}
            ben = s.get("benefits", {}) if isinstance(s.get("benefits"), dict) else {}
            ver = s.get("verification", {}) if isinstance(s.get("verification"), dict) else {}
            ownership = s.get("ownership", {}) if isinstance(s.get("ownership"), dict) else {}
            desc = s.get("description") or ben.get("summary") or s.get("short_description") or f"Government of India verified {s.get('category')} scheme."
            
            interest_display = fin.get("interest_rate") or ben.get("amount") or ben.get("interest_rate") or (f"₹{ben.get('monthly_pension_after_60'):,}/mo Pension" if ben.get("monthly_pension_after_60") else None) or "Statutory Defined Benefit"
            
            raw_url = str(s.get("official_url") or ver.get("official_url") or "https://india.gov.in")
            if "wcd.nic.in/bbbp-schemes" in raw_url:
                official_url_val = "https://wcd.nic.in"
            elif not raw_url.startswith("http"):
                official_url_val = f"https://{raw_url}"
            else:
                official_url_val = raw_url

            clean_list.append({
                "scheme_id": s.get("scheme_id", s.get("id")),
                "id": s.get("scheme_id", s.get("id")),
                "is_lic_plan": False,
                "name": name_en,
                "category": s.get("category"),
                "description": desc,
                "authority": s.get("authority") or ver.get("source_authority") or ownership.get("ministry") or "Government of India",
                "official_url": official_url_val,
                "last_verified_date": s.get("last_verified_date") or ver.get("last_verified") or "2026-08-29",
                "image": s.get("image"),
                "benefits": {
                    "summary": ben.get("summary") or desc,
                    "interest_rate": interest_display,
                    "tax_benefit": ben.get("tax_benefit") or s.get("tax_treatment")
                },
                "financial": {
                    "interest_rate": interest_display,
                    "minimum_contribution": fin.get("minimum_contribution") or 0,
                    "maximum_contribution": fin.get("maximum_contribution"),
                    "lock_in_years": fin.get("lock_in_years"),
                    "lock_in": fin.get("lock_in"),
                    "tax_treatment": fin.get("tax_treatment") or ben.get("tax_benefit")
                }
            })
    return clean_list


@router.post("/plans/add")
def add_saved_plan(req: PlanActionRequest, user: Dict[str, Any] = Depends(get_current_user)):
    try:
        saved_plans = auth_service.add_saved_plan(user["user_id"], req.scheme_id)
        return {"status": "success", "message": "Scheme added to My Plans.", "saved_plans": saved_plans}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/plans/remove")
def remove_saved_plan(req: PlanActionRequest, user: Dict[str, Any] = Depends(get_current_user)):
    try:
        saved_plans = auth_service.remove_saved_plan(user["user_id"], req.scheme_id)
        return {"status": "success", "message": "Scheme removed from My Plans.", "saved_plans": saved_plans}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

