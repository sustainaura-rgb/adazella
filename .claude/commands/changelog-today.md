---
description: Show today's changelog entries from CHANGELOG.csv with summary. Quick way to see what's been done today without opening Excel.
---

Read CHANGELOG.csv and filter rows where Date matches today.

Output as a clean markdown table with columns: Time, Category, Subcategory, Severity, Description, Effort.

After the table, give a one-line summary: "Today: X entries, Y categories touched, ~Z hours of work."

Group by category if there are 5+ entries.
