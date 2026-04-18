# AdPilot

> Amazon Ads automation platform for sellers. Multi-tenant SaaS.

## Monorepo structure

```
adpilot/
├── frontend/      → Dashboard app (Vite + React + TypeScript + Tailwind)
├── marketing/     → Landing page + pricing (Next.js)
├── api/           → Backend (Node.js + Express + TypeScript)
├── scheduler/     → Amazon Ads data fetcher (Python)
├── database/      → SQL migrations for Supabase
├── shared/        → Shared TypeScript types between frontend/api
└── docs/          → Internal docs
```

## Tech stack

- **Frontend**: Vite + React 18 + TypeScript + Tailwind + shadcn/ui
- **Marketing**: Next.js 14 (app router)
- **API**: Node.js + Express + TypeScript
- **Database**: Supabase (Postgres with RLS)
- **Auth**: Supabase Auth (email + Google OAuth)
- **Billing**: Stripe
- **Scheduler**: Python (ported from v1, works today)
- **Email**: Resend
- **Hosting**: Vercel (frontend + marketing) + Render (api + scheduler)
- **Monitoring**: Sentry

## Getting started

### 1. Install dependencies
```bash
npm install
```

### 2. Create Supabase project
1. Go to https://supabase.com → create free project
2. Copy URL + anon key + service role key into `.env`
3. Run migrations: `psql $DATABASE_URL < database/migrations/001_init.sql`

### 3. Set up Amazon Ads API app
1. Register at https://advertising.amazon.com/API/docs
2. Add redirect URI: `http://localhost:5173/oauth/amazon/callback`
3. Copy client ID + secret into `.env`

### 4. Start dev servers
```bash
npm run dev
```

Visit:
- Dashboard: http://localhost:5173
- Marketing: http://localhost:3000
- API: http://localhost:4000

## Roadmap

- [x] Phase 1: Auth + multi-tenant foundation
- [ ] Phase 2: Port v1 features (campaigns, search terms, products, negatives, opportunities)
- [ ] Phase 3: Stripe billing + onboarding + marketing site
- [ ] Phase 4: Automation rules + profit tracking + email alerts
- [ ] Phase 5: Launch beta + iterate

## License

Proprietary. All rights reserved.
