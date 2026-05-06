# Adazella — Project Memory

> This file is loaded by Claude Code at the start of every session. Keep it accurate. When something changes, update this file in the same commit.

---

## 🎯 What we're building

**Product**: Adazella — multi-tenant SaaS dashboard for Amazon sellers (PPC analytics + AI insights).
**Audience**: Brand sellers in India + US selling on Amazon Ads.
**Differentiator**: AI agents that find waste, suggest bid changes, monitor competitors — built BY a seller (Sustainaura founder).

**Tagline**: "Amazon ads dashboard built by sellers, for sellers."

---

## 👤 Who I'm working with

- **Founder**: Sustainaura LLC (sells shower curtains on Amazon IN + US, brand: sustainaura.eco)
- **Role**: Solo founder, technical-but-not-deep-engineer; learning AWS, comfortable with web stack
- **Communication style**: prefers concrete steps over abstract concepts; appreciates honest assessment over false reassurance
- **Time horizon**: building for 2-3 month launch to relatives → beta → public

---

## 🏗️ Architecture (current state)

```
Frontend (Vite + React 18 + TS)
    ↓ Hosted on Netlify (adszella.netlify.app)
    ↓ Auth: Supabase Auth (Google OAuth + email)
    ↓ HTTP calls
Backend API (Express + TS, Node 20)
    ↓ Hosted on Render (adazella-api.onrender.com)
    ↓ DB: Supabase Postgres (project: lelkclmnxuytpxozddir)
Scheduler (Python 3, schedule + psycopg2)
    ↓ Hosted on Render
    ↓ Fetches Amazon data every 1-180 min depending on report type
    ↓ Connects to Amazon Ads API (per-workspace OAuth tokens)
```

### Future state (when AWS is ready)
- Compute: AWS App Runner (API) + Lambda (scheduler)
- Frontend: AWS Amplify
- DB: AWS RDS PostgreSQL
- Auth: AWS Cognito
- Email: AWS SES
- Secrets: AWS Secrets Manager + KMS
- WAF/CDN: CloudFront + AWS WAF

---

## 📂 Directory structure

```
adpilot/
├── api/                      # Backend Express API (TypeScript)
│   ├── src/
│   │   ├── server.ts         # Entry point, middleware setup
│   │   ├── routes/           # All API endpoints
│   │   ├── middleware/       # auth, rate-limit, security
│   │   └── lib/              # crypto, audit, logger, supabase client
│   └── tsconfig.json         # rootDir=./src, NO ../shared include
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── pages/            # 7 pages: Overview, Campaigns, ...
│   │   ├── components/       # shared UI (ui/, etc.)
│   │   ├── layouts/          # DashboardLayout
│   │   ├── lib/              # api client, formatters, cn utility
│   │   └── contexts/         # ThemeContext
│   └── netlify.toml (in repo root, NOT in frontend/)
├── scheduler/                # Python data fetcher
│   ├── main.py               # entry, schedule loop
│   ├── fetcher.py            # Amazon API client
│   ├── token_manager.py      # OAuth token refresh per workspace
│   └── crypto_util.py        # AES-256-GCM (mirror of api/src/lib/crypto.ts)
├── database/migrations/      # SQL files numbered 001+
├── CLAUDE.md                 # ← THIS FILE
├── CHANGELOG.csv             # Daily change log (open in Excel)
└── .claude/                  # Claude Code config (skills, hooks, subagents)
```

---

## ✅ What's been shipped

| Phase | Commit | What |
|---|---|---|
| Sprint 1 | `950b8fd` | Helmet + CSP + rate limits + toasts + skeletons + dark mode |
| S2A | `021ea26` | Token encryption (AES-256-GCM) + audit log table + log scrubbing + error sanitization |

## 🚧 What's in progress

- Phase A critical bug fixes (4 of 8 done — ACoS display, budget edit close, error toasts on 2 pages)
- Building Agent Development Kit (THIS COMMIT)

## 📋 What's pending (priority order)

1. Finish Phase A: C1 (auth refresh), C3 (error sanitization), C4 (RLS), C5 (token race), C6 (connection check), remaining C8 toasts
2. Phase B: 10 UX improvements
3. Stripe billing integration
4. AI Agents (product features) — PPC Waste Detector, Search Term Harvester, Campaign Health Monitor
5. AWS migration (when senior finishes setup)
6. Apply for Amazon SP-API
7. Apply for AWS Activate credits ($1k), Google Cloud ($2k), Microsoft Startups
8. Landing page + pricing page
9. Onboarding wizard

---

## 🎨 Code conventions

### TypeScript / Node
- ES modules (`type: "module"` in package.json), `.js` extensions in imports
- CommonJS only in `scheduler/` Python (not relevant here) and v1 backup at `amazon-ads-dashboard/api/server.js`
- Always use `import` not `require` in api/
- Strict typing — avoid `any`. Use Zod for API request validation.
- Tabs vs spaces: 2 spaces

### Frontend
- Tailwind CSS classes via `cn()` helper from `lib/cn.ts`
- All formatters live in `lib/formatters.ts` — use them everywhere (NEVER inline `.toFixed()`)
- Use `<Skeleton>` and `<EmptyState>` from `components/ui/` for loading/empty states
- Toast errors via `sonner` (`toast.error()`)
- Theme tokens via CSS variables: `bg-[rgb(var(--bg-card))]`

### Database
- All columns snake_case
- Migrations numbered: `001_init.sql`, `002_*.sql`, etc. — never edit existing migrations
- RLS policies enabled on all tenant tables (workspace_id-scoped)
- Use `supabaseAdmin` (service role) only when RLS bypass is intentional

### Security non-negotiables
- Never log Bearer tokens, DB connection strings, password fields (handled by `lib/logger.ts` scrubbing)
- Encrypt Amazon `refresh_token` and `access_token` before DB write (use `lib/crypto.ts`)
- Validate ALL user input with Zod
- Check workspace ownership before mutations (`assertCampaignOwnership` pattern)

---

## 💡 Decision log (why things are the way they are)

| Decision | Why |
|---|---|
| Supabase Auth (not Clerk yet) | Already integrated; will swap to Cognito on AWS migration |
| Brevo SMTP failed → email OTP deferred | `ENABLE_OTP=false` flag; will re-enable with Resend after AWS migration |
| `tsconfig.json` excludes `../shared/**` | Including it broke Render build (rootDir auto-computed too high) |
| `netlify.toml` lives in repo root, not frontend/ | Netlify reads from base directory but config must be at repo root |
| Domain `sustainaura.eco` | Owned via GoDaddy, authenticated in Brevo + Resend DNS |
| 2 separate Supabase projects (v1 + v2) | v1 = Sustainaura personal dashboard data; v2 = Adazella multi-tenant |

---

## 🔐 Security posture (current)

✅ Helmet + CSP + HSTS  
✅ Rate limiting (3 tiers: 120/30/10 per minute)  
✅ Per-IP + per-user lockout (5 fails = 15 min)  
✅ Short JWT (8h, was 7 days)  
✅ Error sanitization (no stack leaks)  
✅ Log scrubbing (tokens, secrets redacted)  
✅ AES-256-GCM encryption for Amazon tokens at rest  
✅ Audit log on mutations  
🟡 Email OTP deferred (waiting on Resend setup)  
❌ AWS KMS (will add post-migration)  
❌ Cloudflare WAF (not yet)  

---

## 🚦 How Claude should approach work in this repo

1. **Before making changes**: read CLAUDE.md, check CHANGELOG.csv for recent edits.
2. **For new features**: follow existing patterns (see `routes/campaigns.ts` for full mutation example).
3. **For bug fixes**: write the fix + add CHANGELOG.csv entry + commit message references the fix.
4. **For migrations**: never edit existing migrations; always add a new numbered file.
5. **For AWS-related work**: assume AWS is NOT yet ready unless user confirms.
6. **For destructive operations**: NEVER run `rm -rf`, `DROP TABLE`, `git push --force`, `git reset --hard` without explicit user confirmation in the same message.
7. **For commits**: include `Co-Authored-By: Claude` line; never use `--no-verify` flag.

---

## 📊 Daily change tracking

Every commit should append to `CHANGELOG.csv`. Columns:
`Date, Time, Category, Subcategory, Severity, Files, Description, Effort, Status, Commit`

Categories:
- `Frontend` — React/Vite changes
- `Backend` — Express API changes
- `Database` — migrations, schema
- `Scheduler` — Python data fetcher
- `Security` — vulnerability fixes, hardening
- `Feature` — new functionality
- `Bug Fix` — bug repair
- `UI Polish` — visual/UX improvement
- `Refactor` — internal cleanup, no behavior change
- `Setup` — infra, tooling, config
- `Documentation` — docs/comments
- `Audit` — code review or analysis (no commit)

---

## 🤖 Available specialized agents

See `.claude/agents/` for full definitions. Quick reference:

- **code-reviewer** — reviews changes before commit, checks security/perf/correctness
- **security-auditor** — scans for OWASP vulnerabilities, RLS gaps, encryption issues
- **amazon-validator** — verifies data fetched from Amazon matches expected schema
- **migration-runner** — safely runs DB migrations with rollback plan

Spawn via `Agent` tool with `subagent_type` matching the agent name.

---

## 📚 Available skills

See `.claude/skills/` for detailed knowledge. Topics covered:

- **amazon-ads** — Amazon Ads API patterns, OAuth flow, report types
- **stripe-billing** — subscription patterns, webhook idempotency, India tax
- **aws-migration** — RDS+Cognito+App Runner setup steps
- **postgres-rls** — Row-Level Security patterns for multi-tenant

---

## 🎯 Current sprint goal

**This week**: Ship Phase A critical fixes + build Agent Development Kit + start Phase B UX improvements.
**Next week**: Stripe integration + landing page + first AI agent (PPC Waste Detector).
**Week 3+**: Wait for AWS, prepare migration scripts.

---

*Last updated: 2026-04-22 by Claude Sonnet 4.7. Update this file whenever architecture/decisions change.*
