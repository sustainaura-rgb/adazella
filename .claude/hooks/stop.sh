#!/usr/bin/env bash
# Stop hook — runs when Claude finishes responding (turn ends).
# Use case: remind to update CHANGELOG.csv if commits happened but log wasn't touched.

set -e

# Did the most recent commit touch CHANGELOG.csv?
LAST_COMMIT_FILES=$(git log -1 --name-only --pretty=format: 2>/dev/null | tr '\n' ' ')

# If last commit changed real files but NOT CHANGELOG.csv, remind about logging
if [ -n "$LAST_COMMIT_FILES" ]; then
  if echo "$LAST_COMMIT_FILES" | grep -qE '\.(ts|tsx|js|jsx|py|sql|md|json)$'; then
    if ! echo "$LAST_COMMIT_FILES" | grep -q "CHANGELOG.csv"; then
      LAST_HASH=$(git log -1 --pretty=%h)
      echo ""
      echo "💡 Reminder: commit $LAST_HASH didn't touch CHANGELOG.csv."
      echo "   Add an entry: echo \"\$(date +%Y-%m-%d),\$(date +%H:%M),Category,...\" >> CHANGELOG.csv"
    fi
  fi
fi

exit 0
