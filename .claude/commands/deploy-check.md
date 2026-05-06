---
description: Pre-deployment checklist. Runs typecheck, build, security-check, and prints what's about to ship. Use before pushing to main on important commits.
---

Pre-deployment validation:

1. **Run test-runner subagent** — typecheck + build for api/ and frontend/
2. **Run security-auditor subagent** on routes changed in current uncommitted/unstaged work
3. **Show staged diff summary**: `git diff --stat` for what's about to be committed
4. **Check CHANGELOG.csv has entries** for today's work
5. **Verify no .env or secrets** in staged files

Output a checklist:
- ✅ / ❌ Typecheck (api)
- ✅ / ❌ Typecheck (frontend)
- ✅ / ❌ Frontend build
- ✅ / ❌ Security review (no critical findings)
- ✅ / ❌ CHANGELOG.csv updated
- ✅ / ❌ No secrets in staged files

If all green, suggest the commit command. If any red, list what to fix first.
