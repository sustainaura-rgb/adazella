# AdPilot Setup Guide

Complete walkthrough to get Phase 1 running locally. Follow in order.

**Estimated time:** 45 min active + 1-3 day wait for Amazon approval.

---

## ✅ Step 1 — Install Node.js + Python (5 min)

You likely already have these from v1, but verify:
- **Node.js** 20+: https://nodejs.org/ → LTS installer
- **Python** 3.10+: https://www.python.org/downloads/

Check in terminal:
```bash
node --version    # should be v20.x or higher
python --version  # should be 3.10+
```

---

## ✅ Step 2 — Create Supabase project (5 min) — FREE

1. Go to **https://supabase.com** → Start your project
2. Sign up with GitHub or Google
3. **New project** →
   - Name: `adpilot` (or whatever)
   - Database password: generate a strong one and **save it somewhere**
   - Region: closest to you (`South Asia (Mumbai)` for India)
   - Plan: **Free**
4. Wait ~2 min for provisioning

---

## ✅ Step 3 — Get Supabase credentials (2 min)

Once your project is ready:
1. Sidebar → **Settings (gear icon)** → **API**
2. Copy these three values:
   - **Project URL** → `https://xxx.supabase.co`
   - **anon public key** → starts with `eyJhbGc...`
   - **service_role secret** → starts with `eyJhbGc...` (keep this one secret!)
3. Sidebar → **Settings** → **Database** → **Connection string** → **URI** → copy the full `postgresql://...` URL (replace `[YOUR-PASSWORD]` with the password you saved)

---

## ✅ Step 4 — Run the database migration (2 min)

1. In Supabase → Sidebar → **SQL Editor** → **+ New query**
2. Open the file `D:\Amazon ads dashboard\adpilot\database\migrations\001_init.sql` in a text editor
3. Copy ALL its contents
4. Paste into Supabase SQL Editor
5. Click **Run** (or press Ctrl+Enter)
6. Should see: `Success. No rows returned`
7. Verify: Sidebar → **Table Editor** → you should see 16 tables (workspaces, workspace_members, amazon_connections, campaigns, etc.)

---

## ✅ Step 5 — Enable Google OAuth in Supabase (10 min) — Optional but recommended

For "Sign in with Google" button:

1. **Google Cloud Console:** https://console.cloud.google.com/
2. Create new project → name: `AdPilot OAuth`
3. Search for **OAuth consent screen** → External → fill in:
   - App name: AdPilot
   - User support email: your email
   - Developer contact: your email
   - Save
4. Search for **Credentials** → **+ Create Credentials** → **OAuth client ID**
   - Type: **Web application**
   - Name: AdPilot Web
   - Authorized redirect URIs: (you'll get this from Supabase — see next step)
5. **Supabase** → **Authentication** → **Providers** → **Google**
   - Enable toggle ON
   - It will show a **Callback URL** like `https://xxx.supabase.co/auth/v1/callback` — copy it
6. Back in **Google Cloud Console** → paste that URL into **Authorized redirect URIs** → Save
7. Google gives you **Client ID** + **Client Secret**
8. Paste both into Supabase's Google provider form → Save

Done. The "Sign in with Google" button on the login page will now work.

---

## ✅ Step 6 — Apply for Amazon Ads API access (15 min + 1-3 day wait)

This is the longest step because Amazon reviews applications manually.

### 6a. Register as an Amazon developer
1. Go to **https://advertising.amazon.com/API/docs/en-us/setting-up/overview**
2. Click **"Apply for access"** — sign in with your Amazon Seller account
3. Fill in the application:
   - **Company name:** your company (e.g., SustainAura)
   - **Use case:** Select "I'm building a tool to manage MY OWN Amazon advertising" (for now — change to "I'm building a SaaS for other sellers" later when you're ready to scale)
   - **Expected API calls/day:** ~10,000
4. Submit and wait 1-3 business days for approval email

### 6b. Create Login with Amazon (LWA) security profile
Once approved:
1. Go to **https://developer.amazon.com/settings/console/securityprofile/overview.html**
2. **Create a new security profile**:
   - Security Profile Name: `AdPilot`
   - Description: `Amazon Ads automation tool`
   - Consent Privacy Notice URL: `https://adpilot.app/privacy` (you'll make this later, any URL works for now)
3. Go to your new profile → **Web Settings** tab → **Edit**:
   - **Allowed Origins:** `http://localhost:5173`
   - **Allowed Return URLs:** `http://localhost:4000/api/oauth/amazon/callback`
   - (Add your production URLs later when you deploy)
4. Copy the **Client ID** (starts with `amzn1.application-oa2-client.xxxxx`)
5. Copy the **Client Secret**

---

## ✅ Step 7 — Fill in environment files (5 min)

### 7a. Root `.env`
```bash
cd "D:\Amazon ads dashboard\adpilot"
cp .env.example .env
```
Open `.env` and fill in (no quotes needed):
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@...supabase.co:5432/postgres
AMAZON_ADS_CLIENT_ID=amzn1.application-oa2-client.xxx
AMAZON_ADS_CLIENT_SECRET=xxx
```

### 7b. Frontend `.env.local`
```bash
cp frontend/.env.example frontend/.env.local
```
Open `frontend/.env.local`:
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
VITE_API_URL=http://localhost:4000
```

### 7c. API `.env`
```bash
cp api/.env.example api/.env
```
Open `api/.env`:
```
PORT=4000
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
FRONTEND_URL=http://localhost:5173
AMAZON_ADS_CLIENT_ID=amzn1.application-oa2-client.xxx
AMAZON_ADS_CLIENT_SECRET=xxx
AMAZON_ADS_REDIRECT_URI=http://localhost:4000/api/oauth/amazon/callback
```

### 7d. Scheduler `.env`
```bash
cp scheduler/.env.example scheduler/.env
```
Open `scheduler/.env`:
```
DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@...supabase.co:5432/postgres
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
AMAZON_ADS_CLIENT_ID=amzn1.application-oa2-client.xxx
AMAZON_ADS_CLIENT_SECRET=xxx
PORT=10000
```

---

## ✅ Step 8 — Install dependencies (3 min)

### 8a. Node dependencies (frontend + api)
```bash
cd "D:\Amazon ads dashboard\adpilot"
npm install
```
This installs for ALL workspaces thanks to `npm workspaces`.

### 8b. Python dependencies (scheduler)
```bash
cd "D:\Amazon ads dashboard\adpilot\scheduler"
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
# source venv/bin/activate
pip install -r requirements.txt
```

---

## ✅ Step 9 — Start the dev servers (2 min)

Open **3 terminal windows**:

**Terminal 1 — API:**
```bash
cd "D:\Amazon ads dashboard\adpilot\api"
npm run dev
```
Should see: `🚀 AdPilot API listening on http://localhost:4000`

**Terminal 2 — Frontend:**
```bash
cd "D:\Amazon ads dashboard\adpilot\frontend"
npm run dev
```
Should see: `Local: http://localhost:5173/`

**Terminal 3 — Scheduler** (start AFTER you've connected an Amazon account via the UI):
```bash
cd "D:\Amazon ads dashboard\adpilot\scheduler"
# activate venv first
venv\Scripts\activate    # Windows
python main.py
```

---

## ✅ Step 10 — Smoke test the auth flow (5 min)

1. Open **http://localhost:5173** in your browser
2. Click **Sign up free**
3. Enter your name, email, password → Create account
4. Check your email → click the verification link
5. You should land on the Dashboard showing "Connect your Amazon Ads account"
6. Click **Connect Amazon Account**
7. You'll be redirected to Amazon → log in → approve access
8. You're redirected back to the dashboard with a green success banner
9. The dashboard now shows your Amazon account name + profile ID

If you see that, **Phase 1 is complete!** 🎉

---

## 🎯 What Phase 1 gives you

✅ Users can sign up / log in (email or Google)
✅ Each user gets their own workspace
✅ Each workspace can connect its own Amazon Ads account
✅ OAuth tokens stored securely per workspace
✅ Database isolated per workspace (Row-Level Security)
✅ Scheduler can loop over all workspaces and fetch their data
✅ Password reset flow works
✅ Trial countdown displayed (14 days)

## ⏭️ What Phase 2 will add

- Overview page with KPI cards, trend chart, funnel, alerts
- Campaigns table (with play/pause, budget edit, pacing bars, drill-down)
- Search Terms tab with negativity scoring
- Products tab
- Negatives page (grouped, expandable)
- Opportunities tab (harvest, negatives, upgrades)
- Settings page (product profile + target ACoS)

---

## 🆘 Troubleshooting

**"Cannot find module 'react'" errors in code:** You haven't run `npm install` yet. Do Step 8a.

**API returns 401 on `/api/me`:** Your Supabase JWT is expired. Sign out and back in.

**Amazon OAuth redirects to "invalid_state":** Your redirect URI in the LWA profile doesn't exactly match `http://localhost:4000/api/oauth/amazon/callback`. Check for typos.

**"Database connection failed" in API:** Your `DATABASE_URL` is wrong. Go to Supabase → Settings → Database → copy the URI again.

**Scheduler errors "No active Amazon connection":** No users have connected their Amazon account yet. Sign up + connect via the UI first.

---

## 📧 Support

If you get stuck, share the exact error message and which step you're on.
