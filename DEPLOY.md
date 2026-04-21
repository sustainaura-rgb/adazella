# AdPilot Deployment Guide

Production deployment to Vercel (frontend) + Render (API + scheduler).

---

## Prerequisites

- ✅ Code pushed to GitHub: `https://github.com/sustainaura-rgb/adazella`
- ✅ Supabase project running with migration applied
- ✅ Amazon LWA security profile (dev credentials)

---

## Step 1 — Deploy Frontend to Vercel (5 min)

### 1a. Sign up + import project
1. Go to **https://vercel.com** → **Sign up with GitHub**
2. Authorize Vercel to access your repos
3. Click **"Add New..."** → **"Project"**
4. Find `adazella` in the list → click **Import**

### 1b. Configure build
- **Framework Preset:** Vite (should auto-detect)
- **Root Directory:** click **Edit** → set to `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### 1c. Add environment variables
Click **Environment Variables** and add:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://lelkclmnxuytpxozddir.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your anon key |
| `VITE_API_URL` | `https://adazella-api.onrender.com` (we'll create this next) |

### 1d. Deploy
Click **Deploy**. Wait ~2 minutes. You'll get a URL like `https://adazella.vercel.app`.

**Save this URL.**

---

## Step 2 — Deploy API to Render (10 min)

### 2a. Sign up
1. Go to **https://render.com** → **Sign up with GitHub**
2. Authorize Render

### 2b. Create Web Service for API
1. Dashboard → **New +** → **Web Service**
2. Connect repo `adazella` → Connect
3. Configure:
   - **Name:** `adazella-api`
   - **Region:** pick closest to your users (Singapore for India)
   - **Branch:** `main`
   - **Root Directory:** `api`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`

### 2c. Environment variables
Add these (click "Advanced" → "Add Environment Variable"):

| Name | Value |
|------|-------|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | `https://lelkclmnxuytpxozddir.supabase.co` |
| `SUPABASE_ANON_KEY` | your anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role key |
| `FRONTEND_URL` | `https://adazella.vercel.app` (from Step 1) |
| `AMAZON_ADS_CLIENT_ID` | `amzn1.application-oa2-client.xxx` |
| `AMAZON_ADS_CLIENT_SECRET` | your secret |
| `AMAZON_ADS_REDIRECT_URI` | `https://adazella-api.onrender.com/callback` |

### 2d. Deploy
Click **Create Web Service**. Wait ~3-5 minutes for first build.

URL: `https://adazella-api.onrender.com`

**Save this URL.**

### 2e. Go back to Vercel and update `VITE_API_URL`
1. Vercel → your project → Settings → Environment Variables
2. Update `VITE_API_URL` to `https://adazella-api.onrender.com`
3. Deployments tab → redeploy the latest

---

## Step 3 — Deploy Scheduler to Render (10 min)

### 3a. Create second Web Service
1. Render dashboard → **New +** → **Web Service**
2. Same repo `adazella` → Connect
3. Configure:
   - **Name:** `adazella-scheduler`
   - **Region:** same as API
   - **Branch:** `main`
   - **Root Directory:** `scheduler`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python main.py`
   - **Instance Type:** `Free`

### 3b. Environment variables
| Name | Value |
|------|-------|
| `DATABASE_URL` | `postgresql://postgres.xxx:pw@aws-xxx.pooler.supabase.com:6543/postgres` |
| `SUPABASE_URL` | `https://lelkclmnxuytpxozddir.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role key |
| `AMAZON_ADS_CLIENT_ID` | `amzn1.application-oa2-client.xxx` |
| `AMAZON_ADS_CLIENT_SECRET` | your secret |
| `PORT` | `10000` |

### 3c. Deploy
Click **Create Web Service**. Wait ~3 minutes.

### 3d. Important — free tier caveat
Render free tier web services **sleep after 15 minutes of inactivity**. To keep the scheduler running 24/7:

**Option A (cheapest):** Use UptimeRobot (free)
1. Sign up at https://uptimerobot.com
2. Add monitor: URL = `https://adazella-scheduler.onrender.com`, interval = 5 minutes
3. This pings every 5 min → scheduler never sleeps

**Option B:** Upgrade scheduler service to Render's $7/mo tier (no sleep)

---

## Step 4 — Update Amazon LWA Security Profile

The redirect URI changed from localhost to production.

1. Go to **https://developer.amazon.com/settings/console/securityprofile/overview.html**
2. Click your AdPilot profile → **Web Settings** → **Edit**
3. Update:
   - **Allowed Origins:** `https://adazella.vercel.app`
   - **Allowed Return URLs:** `https://adazella-api.onrender.com/callback`
   
   (Keep `http://localhost:5173` and `http://localhost:3000/callback` in the list too — so you can still test locally.)
4. Save

---

## Step 5 — Update Supabase Auth URLs

Supabase needs to know your production URL so it sends email links there.

1. Supabase dashboard → **Authentication** → **URL Configuration**
2. **Site URL:** `https://adazella.vercel.app`
3. **Redirect URLs:** add both:
   - `https://adazella.vercel.app/dashboard`
   - `https://adazella.vercel.app/reset-password`
   - `http://localhost:5173/dashboard` (keep local)
   - `http://localhost:5173/reset-password` (keep local)
4. Save

---

## Step 6 — Smoke test (5 min)

Visit **https://adazella.vercel.app**

1. **Sign up** with a new email → verify email → land on dashboard
2. **Click Connect Amazon** → redirects to Amazon → Allow → returns with green banner
3. **Click through all 7 tabs** — mock data should render (or real data if scheduler has fetched)
4. **Check scheduler logs** on Render dashboard for any errors

---

## Troubleshooting

### "CORS blocked" error in browser console
Your `FRONTEND_URL` env var on Render API doesn't match the actual Vercel URL. Double-check in Render dashboard.

### Amazon OAuth returns "invalid_parameter"
Return URL mismatch. Verify Amazon LWA profile has EXACTLY `https://adazella-api.onrender.com/callback` (no trailing slash).

### Supabase email sends link to localhost
You forgot Step 5 — update Site URL in Supabase Auth settings.

### Scheduler logs show "No active Amazon connection"
No users have connected Amazon yet on production. Sign up + connect through the live site.

### "relation does not exist" in API/scheduler logs
Your `DATABASE_URL` points at the wrong project, or migration hasn't been applied on production.

### Scheduler never runs fetches
Probably sleeping. Check UptimeRobot is configured (Step 3d).

---

## 🎉 After successful deploy

- **Live dashboard:** https://adazella.vercel.app
- **API:** https://adazella-api.onrender.com
- **Scheduler:** runs 24/7 (if keep-alive configured)

Share the frontend URL with your first beta sellers!
