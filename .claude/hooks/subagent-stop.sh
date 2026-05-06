#!/usr/bin/env bash
# SubagentStop hook — runs when a delegated subagent (code-reviewer, security-auditor, etc.) finishes.
# Use case: log subagent invocation to CHANGELOG.csv so we track audit/review activity.

set -e

EVENT="$(cat)"
AGENT_TYPE=$(echo "$EVENT" | jq -r '.subagent_type // "unknown"')

# Append a row to CHANGELOG.csv noting subagent ran
TODAY=$(date +%Y-%m-%d)
NOW=$(date +%H:%M)

# Only log if CHANGELOG.csv exists (don't auto-create)
if [ -f "CHANGELOG.csv" ]; then
  echo "$TODAY,$NOW,Audit,Subagent Run,Info,(none),Subagent '$AGENT_TYPE' completed,5 min,Done,(no commit)" >> CHANGELOG.csv
fi

exit 0
