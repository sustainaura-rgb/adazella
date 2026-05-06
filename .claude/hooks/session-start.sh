#!/usr/bin/env bash
# SessionStart hook — runs when a Claude Code session begins.
# Output is shown to Claude as context, helping it understand recent work.
#
# Goal: every new session, Claude knows last 3 commits + today's CHANGELOG entries.

set -e

# Show project state
echo "═══════════════════════════════════════════════════"
echo "📂 Adazella project state"
echo "═══════════════════════════════════════════════════"

# Last 3 commits (compact)
echo ""
echo "Recent commits:"
git log --oneline -3 2>/dev/null || echo "(no git history yet)"

# Today's changes from CHANGELOG.csv
TODAY=$(date +%Y-%m-%d)
if [ -f "CHANGELOG.csv" ]; then
  echo ""
  echo "📝 Today's changelog ($TODAY):"
  COUNT=$(grep -c "^$TODAY," CHANGELOG.csv 2>/dev/null || echo 0)
  if [ "$COUNT" -gt 0 ]; then
    grep "^$TODAY," CHANGELOG.csv | head -5 | awk -F, '{printf "  • %s | %s | %s\n", $4, $5, $7}'
    if [ "$COUNT" -gt 5 ]; then echo "  ... and $((COUNT - 5)) more (see CHANGELOG.csv)"; fi
  else
    echo "  (no entries today yet — first session of the day)"
  fi
fi

# Uncommitted changes warning
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$UNCOMMITTED" -gt 0 ]; then
  echo ""
  echo "⚠️  $UNCOMMITTED uncommitted file change(s) — use 'git status' to inspect"
fi

# Active branch (warn if not main)
BRANCH=$(git branch --show-current 2>/dev/null)
if [ -n "$BRANCH" ] && [ "$BRANCH" != "main" ]; then
  echo ""
  echo "🌿 On branch: $BRANCH (not main)"
fi

echo ""
echo "═══════════════════════════════════════════════════"
exit 0
