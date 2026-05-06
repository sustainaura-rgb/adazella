#!/usr/bin/env bash
# Pre-tool-use guardrail.
# Reads JSON event from stdin describing the tool call Claude wants to make.
# Exit 0 → allow. Exit 1 → block (and write reason to stderr).
#
# Wired in .claude/settings.json under hooks.PreToolUse.
#
# Goal: stop Claude from running destructive commands without explicit user okay.

set -e

EVENT="$(cat)"
TOOL_NAME=$(echo "$EVENT" | jq -r '.tool_name // empty')
COMMAND=$(echo "$EVENT" | jq -r '.tool_input.command // empty')

# Only check Bash tool calls
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

# ──────────────────────────────────────────────────────────────────
# Block patterns — destructive ops that should never run unattended
# ──────────────────────────────────────────────────────────────────

# rm -rf on root, home, or tmp wildcards
if echo "$COMMAND" | grep -qE 'rm\s+(-[rRfF]+|-[rRfF]+\s+|--recursive|--force).*(/|~|\$HOME|\*)\s*$'; then
  echo "BLOCKED: rm -rf on a wide path. Use specific file paths instead." >&2
  exit 1
fi

# git push --force to main/master
if echo "$COMMAND" | grep -qE 'git push.*--force.*\b(main|master|production)\b'; then
  echo "BLOCKED: force push to protected branch. Ask user before bypassing." >&2
  exit 1
fi

# git reset --hard
if echo "$COMMAND" | grep -qE 'git reset\s+--hard'; then
  echo "BLOCKED: git reset --hard discards uncommitted work. Confirm with user first." >&2
  exit 1
fi

# DROP TABLE / DROP DATABASE
if echo "$COMMAND" | grep -qiE '\bDROP\s+(TABLE|DATABASE|SCHEMA)\b'; then
  echo "BLOCKED: SQL DROP statement. Schema changes must go through migrations/." >&2
  exit 1
fi

# git push --no-verify (skipping hooks)
if echo "$COMMAND" | grep -q '\-\-no-verify'; then
  echo "BLOCKED: --no-verify skips pre-commit hooks. Don't bypass; fix the actual issue." >&2
  exit 1
fi

# kill -9 on someone else's process (basic check)
if echo "$COMMAND" | grep -qE 'kill\s+(-9|-KILL)\s+1\b'; then
  echo "BLOCKED: kill -9 on init process." >&2
  exit 1
fi

# Sudo (we don't sudo in dev)
if echo "$COMMAND" | grep -qE '^\s*sudo\s'; then
  echo "BLOCKED: sudo not used in this project." >&2
  exit 1
fi

# Allow everything else
exit 0
