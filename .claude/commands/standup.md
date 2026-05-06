---
description: Morning daily standup. Reads recent commits + yesterday's CHANGELOG + current focus from CLAUDE.local.md, then proposes top 3 priorities for today.
---

Run my morning standup ritual:

1. **Recent commits** — show last 5 with `git log --oneline -5`
2. **Yesterday's progress** — filter CHANGELOG.csv for yesterday's date, summarize by category, count entries
3. **Current focus** — read CLAUDE.local.md "Today's focus" section if present
4. **Pending work** — check the todo list at top of session

Then synthesize into:

```markdown
## ☕ Morning standup — [today's date]

### Yesterday recap
- X commits, Y CHANGELOG entries, ~Z hours of work
- Top win: [most impactful change]
- Open items carried over: [anything not finished]

### Today's top 3 priorities
1. [Most important task] — Why it matters: [reason]
2. [Second priority]
3. [Third priority]

### Skip / defer
- [Things you'd be tempted to do but should skip today]

### One thing to remember
[A single insight or constraint to keep in mind]
```

Be decisive. Don't list 10 things. Pick 3.
