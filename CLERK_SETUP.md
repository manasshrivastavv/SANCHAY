# SANCHAY — Production Clerk Authentication Setup Guide

This document provides complete, step-by-step instructions for setting up **Clerk** as the production authentication provider for **SANCHAY**, enabling:
1. **Continue with Google** (Official Google OAuth)
2. **Continue with Mobile** (Indian Mobile Numbers `+91` with Real SMS OTP)

> [!CAUTION]
> **Security Notice**: Never commit real API keys, secret keys, or live credentials to git. Use environment variables exclusively.

---

## 1. Create a Clerk Application

1. Go to [https://dashboard.clerk.com/](https://dashboard.clerk.com/) and sign in or create an account.
2. Click **Create Application**.
3. Set the application name to `SANCHAY` (or `SANCHAY Production`).
4. Under **Select authentication options**, check:
   - **Google** (Social login)
   - **Phone number** (SMS OTP)
5. Click **Create Application**.

---

## 2. Enable & Configure Google Authentication

1. In the Clerk Dashboard sidebar, navigate to **User & Authentication** > **Social Connections**.
2. Ensure **Google** is toggled **ON**.
3. For development, Clerk's shared credentials work automatically.
4. For production with your own custom branding:
   - Follow Clerk's instructions to obtain a Google OAuth Client ID and Secret from the [Google Cloud Console](https://console.cloud.google.com/).
   - Add authorized redirect URIs provided by Clerk: `https://<your-clerk-frontend-api>/v1/oauth_callback`.
   - Enter your Client ID and Client Secret into Clerk Dashboard.

---

## 3. Enable Phone Number Authentication & SMS OTP

1. In the Clerk Dashboard sidebar, navigate to **User & Authentication** > **Email, Phone, Username**.
2. In the **Phone Number** row:
   - Toggle **Phone number** to **ON**.
   - Set as **Required** or **Optional** (both are supported; SANCHAY allows citizens to sign in with either Google or Mobile).
3. Under **Authentication Factors**:
   - Ensure **SMS verification code** (Phone Code) is enabled as a **First factor**.
4. In **SMS Settings** (under **Settings** > **SMS / Phone**):
   - Ensure SMS provider is active (Clerk includes test SMS credits and production carrier routing).
   - Set default country code to **India (+91)** for optimal experience.

---

## 4. Configure Allowed Origins & Redirect URLs

1. In the Clerk Dashboard, navigate to **Configure** > **Paths** or **Domains**.
2. Under **Redirect URLs**:
   - **Development**:
     - `http://localhost:5173`
     - `http://localhost:5173/sso-callback`
     - `http://127.0.0.1:5173`
   - **Production (Vercel)**:
     - `https://your-sanchay-app.vercel.app`
     - `https://your-sanchay-app.vercel.app/sso-callback`
     - Custom domain (e.g., `https://sanchay.in` and `https://sanchay.in/sso-callback` if configured).

---

## 5. Obtain Clerk API Keys

1. In the Clerk Dashboard sidebar, click **API Keys**.
2. Copy the two keys:
   - **Publishable Key**: Starts with `pk_test_...` (dev) or `pk_live_...` (production).
   - **Secret Key**: Starts with `sk_test_...` (dev) or `sk_live_...` (production).

---

## 6. Configure Environment Variables

### Frontend Environment Variables (Vercel & Local)

Add to local `.env` and configure in **Vercel Project Settings > Environment Variables**:

```env
# Frontend Clerk Publishable Key (safe to expose to client bundle)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key_here

# Backend REST API endpoint
VITE_API_URL=https://sanchay-backend.onrender.com
```

*(For local frontend development, `VITE_API_URL=http://127.0.0.1:8000`)*

### Backend Environment Variables (Render & Local)

Add to local `backend/.env` and configure in **Render Service Dashboard > Environment**:

```env
# Clerk Secret Key (NEVER expose to frontend or commit to repository)
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key_here

# Frontend Application Origin for secure CORS handling
FRONTEND_URL=https://your-sanchay-app.vercel.app

# MongoDB Atlas Connection
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=sanchay_db

# Google Gemini API Key for Sakhi Assistant
GEMINI_API_KEY=your_gemini_api_key_here

# Admin Secret Key for Master Data Operations
ADMIN_API_KEY=sanchay_admin_secret_key_2026

# Server Port
PORT=8000
```

---

## 7. Verifying End-to-End Authentication

### A. Testing Google Authentication

1. Start both backend and frontend:
   ```bash
   # Terminal 1 (Backend)
   cd backend
   venv/Scripts/uvicorn app.main:app --reload --port 8000

   # Terminal 2 (Frontend)
   npm run dev
   ```
2. Open `http://localhost:5173`.
3. In the Navbar, click **Log In**.
4. Click **Continue with Google**.
5. Select a Google account in the OAuth prompt.
6. Observe automatic redirect back through `/sso-callback` to SANCHAY.
7. Verify that:
   - The Navbar shows the citizen's profile avatar and first name.
   - The Citizen Account dropdown provides access to **My Profile** and **My Plans**.
   - Visiting `/api/auth/me` verifies your session cryptographically.

### B. Testing Mobile Number + Real SMS OTP

1. In the Navbar, click **Log In** (or sign out first if logged in).
2. Under **Continue with Mobile**, enter a 10-digit Indian mobile number (e.g. `9876543210`).
3. Click **Send OTP**.
4. Check your phone for the real SMS containing the 6-digit verification code.
5. Enter the 6-digit OTP into the input fields.
6. Click **Verify OTP**.
7. Observe immediate session creation and user record synchronization in MongoDB.

### C. Testing My Plans User Isolation

1. While logged in as User A, open **Government Schemes**, find `PPF`, and click **Save to My Plans**.
2. Sign out via the Navbar dropdown.
3. Sign in as User B (different Google account or different phone number).
4. Navigate to `/my-plans`:
   - User B will **NOT** see User A's saved PPF plan.
5. Save `SCSS` as User B.
6. Switch back to User A:
   - User A sees only PPF, never SCSS.
   - User isolation is cryptographically enforced on FastAPI and MongoDB Atlas.

---

## 8. Production Deployment Checklist

- [ ] Clerk production instance created (`pk_live_...` and `sk_live_...`).
- [ ] Vercel environment variable `VITE_CLERK_PUBLISHABLE_KEY` added.
- [ ] Vercel environment variable `VITE_API_URL` set to Render backend URL.
- [ ] Render environment variable `CLERK_SECRET_KEY` added.
- [ ] Render environment variable `FRONTEND_URL` set to Vercel production domain.
- [ ] Allowed redirect origins verified in Clerk dashboard.
- [ ] SMS credits / Twilio / Clerk SMS gateway active for Indian carriers.
- [ ] Automated test suite verified (`pytest backend/tests/test_clerk_auth.py` and `test_final_qa_audit.py`).
- [ ] Production build verified (`npm run build`).
