---
description: Run a full security audit on the codebase using the security-auditor subagent. Checks for OWASP issues, IDOR risks, RLS gaps, secret leaks, encryption weaknesses.
---

Run the security-auditor agent on the codebase. Specifically:

1. Audit api/src/routes/ for IDOR + auth gaps
2. Audit database/migrations/ for RLS policy gaps
3. Audit api/src/lib/crypto.ts and scheduler/crypto_util.py for encryption correctness
4. Check that no secrets are committed (grep for hardcoded api keys, tokens, passwords)
5. Verify rate limiters cover all sensitive endpoints

Return findings prioritized by severity (Critical / High / Medium / Info).

After audit, append summary entry to CHANGELOG.csv:
`<date>,<time>,Audit,Security Review,Info,(audit run),Found N critical M high issues,30 min,Done,(no commit)`
