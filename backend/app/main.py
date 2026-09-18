import os
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
root_env = BACKEND_DIR.parent / ".env"
backend_env = BACKEND_DIR / ".env"

if root_env.exists():
    load_dotenv(root_env, override=False)
if backend_env.exists():
    load_dotenv(backend_env, override=False)
load_dotenv(override=False)


from app.database import init_db, get_schemes_collection, get_lic_plans_collection, get_free_benefits_collection
from app.routers import schemes, recommendations, compare, sakhi, admin, eligibility, auth, lic, free_benefits, pre_deployment_test
from seed_master import seed_master_schemes, MASTER_DATA_PATH
from seed_lic import seed_lic_database

# Initialize Application
app = FastAPI(
    title="SANCHAY API — Indian Government Scheme & Guidance Engine",
    description=(
        "Production-grade RESTful FastAPI backend for SANCHAY. "
        "Provides deterministic rule-based eligibility evaluation, explainable fit-score ranking across verified scheme categories, "
        "multi-scheme comparisons, admin data ingestion, LIC plans guidance, Free Benefits & Assistance, and the Sakhi grounded AI assistant."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Configuration
def get_allowed_origins() -> list:
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://sanchay-seven.vercel.app",
    ]

    fe_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if fe_url and fe_url not in origins:
        origins.append(fe_url)
    custom_origins = os.getenv("ALLOWED_ORIGINS", "")
    if custom_origins:
        for o in custom_origins.split(","):
            cleaned = o.strip().rstrip("/")
            if cleaned and cleaned not in origins:
                origins.append(cleaned)
    return origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_origin_regex=r"https:\/\/.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.on_event("startup")
def on_startup():
    print("SANCHAY Backend: Initializing database and verifying master schemes dataset...")
    init_db()
    col = get_schemes_collection()
    import json
    try:
        with open(MASTER_DATA_PATH, "r", encoding="utf-8") as f:
            master_records = json.load(f)
            master_count = len(master_records)
    except Exception as e:
        print(f"Notice: Failed to read master file {MASTER_DATA_PATH}: {e}")
        master_records = []
        master_count = 184

    # Always sync master_schemes.json to ensure single source of truth across MongoDB and fallback
    print(f"Syncing master schemes dataset ({master_count} verified schemes) to database...")
    seed_master_schemes(MASTER_DATA_PATH)
    current_count = col.count_documents({})
    print(f"Database successfully synchronized and verified with {current_count} active/verified schemes.")

    # Synchronize separate LIC dataset
    try:
        print("Synchronizing dedicated LIC plans dataset (38 active plans)...")
        seed_lic_database()
        lic_col = get_lic_plans_collection()
        print(f"LIC Database initialized with {lic_col.count_documents({})} active plans.")
    except Exception as e:
        print(f"Notice: LIC database auto-sync: {e}")

    # Synchronize Free Benefits dataset
    try:
        from pathlib import Path
        data_dir = Path(__file__).resolve().parent.parent / "data"
        fb_master_file = data_dir / "free_benefits_master.json"
        if fb_master_file.exists():
            with open(fb_master_file, "r", encoding="utf-8") as f:
                fb_records = json.load(f)
            fb_col = get_free_benefits_collection()
            for rec in fb_records:
                fb_col.update_one({"benefit_id": rec["benefit_id"]}, {"$set": rec}, upsert=True)
            print(f"Free Benefits Database synchronized with {fb_col.count_documents({})} verified records.")
    except Exception as e:
        print(f"Notice: Free Benefits database auto-sync: {e}")


# Base / Health Endpoints
@app.get("/")
def root_health():
    return {
        "status": "online",
        "platform": "SANCHAY — Trusted Indian Savings & Scheme Guidance",
        "version": "2.0.0",
        "verified_data": "Official Government of India Gazettes, myScheme, India Post, PFRDA, LIC & Free Benefits",
        "documentation": "/docs"
    }


@app.get("/health")
@app.get("/api/health")
def api_health():
    col = get_schemes_collection()
    total_active = col.count_documents({"$or": [{"status.active": True}, {"active": True}]})
    total_verified = col.count_documents({
        "$or": [{"verification.status": "VERIFIED"}, {"verification_status": "verified"}, {"verified": True}]
    })
    return {
        "status": "healthy",
        "database": "connected",
        "total_active_schemes": total_active,
        "total_verified_schemes": total_verified,
        "active_verified_schemes": total_verified,
        "supported_categories": [c["id"] for c in schemes.MASTER_CATEGORIES]
    }


# Mount Routers under /api, /api/v1, and root prefixes for maximum frontend compatibility
api_router = APIRouter(prefix="/api")
api_router.include_router(schemes.router)
api_router.include_router(recommendations.router)
api_router.include_router(compare.router)
api_router.include_router(sakhi.router)
api_router.include_router(admin.router)
api_router.include_router(eligibility.router)
api_router.include_router(auth.router)
api_router.include_router(lic.router, prefix="/lic")
api_router.include_router(lic.router, prefix="/v1/lic")
api_router.include_router(free_benefits.router)
api_router.include_router(pre_deployment_test.router)

# Direct /api/v1 router mount
v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(lic.router, prefix="/lic")
v1_router.include_router(free_benefits.router)

app.include_router(api_router)
app.include_router(v1_router)
app.include_router(schemes.router)
app.include_router(recommendations.router)
app.include_router(compare.router)
app.include_router(sakhi.router)
app.include_router(admin.router)
app.include_router(eligibility.router)
app.include_router(auth.router)
app.include_router(lic.router, prefix="/lic")
app.include_router(lic.router, prefix="/api/v1/lic")
app.include_router(free_benefits.router)
app.include_router(pre_deployment_test.router)

