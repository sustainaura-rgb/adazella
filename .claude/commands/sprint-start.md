---
description: Start a new sprint by tagging upcoming CHANGELOG.csv entries with the sprint name. Helps you see "what shipped in Sprint 3" later.
---

Start a new sprint:

1. Ask user for sprint name (e.g., "Sprint 3 — AI Agents") if not provided
2. Append a SPRINT_START marker row to CHANGELOG.csv:
   `<date>,<time>,Setup,Sprint Start,Info,(none),"Sprint X — <name>",—,Started,(no commit)`
3. Update CLAUDE.local.md "Today's focus" section with the sprint name
4. Confirm: "Sprint X started. Future CHANGELOG entries will reference it."

Then offer to:
- Show the previous sprint's summary (filter CHANGELOG between previous SPRINT_START markers)
- Plan the sprint: ask user to list 3-5 goals, you draft a sprint plan
