---
description: Run all tests + typecheck + build verification across api and frontend. Shortcut for invoking test-runner agent.
---

Spawn the test-runner agent to validate the codebase. Specifically:

1. cd api → npm run typecheck
2. cd api → npm run build
3. cd frontend → npx tsc --noEmit
4. cd frontend → npm run build
5. cd scheduler → python -m py_compile *.py

Return PASS / FAIL with specific error excerpts.

If FAIL, suggest the fix path.
