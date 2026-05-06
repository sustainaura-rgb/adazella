---
description: End-of-day summary. Reviews today's commits + CHANGELOG entries, generates summary, suggests tomorrow's top priority.
---

Run my end-of-day ritual:

1. **Today's commits** — show all commits with date matching today
2. **CHANGELOG entries** — filter rows where Date = today, group by Category
3. **Open todos** — list incomplete items from todo list
4. **Build state** — quick check: does it still typecheck? `cd api && npm run typecheck && cd ../frontend && npx tsc --noEmit`

Then synthesize into:

```markdown
## 🌙 End of day — [today's date]

### What shipped
- 🚀 [Notable feature/fix #1]
- 🐛 [Notable feature/fix #2]
- ...

### Numbers
- N commits | M CHANGELOG entries | ~H hours
- Categories touched: [Frontend, Backend, ...]

### What didn't ship (rolling to tomorrow)
- [Incomplete task]
- [Blocked item, with blocker]

### Tomorrow's #1 priority
[The single most important thing to start with tomorrow]

### Reflection
[1-2 lines: what felt slow, what felt good, what surprised me]
```

Then offer to:
- Append a "EOD" entry to CHANGELOG.csv summarizing the day
- Update CLAUDE.local.md "Today's focus" with tomorrow's priority

Don't be exhaustive. Highlights only.
