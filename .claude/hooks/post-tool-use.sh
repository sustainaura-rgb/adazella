#!/usr/bin/env bash
# Post-tool-use hook.
# Runs after Edit/Write tool calls to catch type errors immediately.
# Output is appended as a system reminder visible to Claude on next turn.
#
# Wired in .claude/settings.json under hooks.PostToolUse.

set -e

EVENT="$(cat)"
TOOL_NAME=$(echo "$EVENT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$EVENT" | jq -r '.tool_input.file_path // empty')

# Only act on Edit/Write to TypeScript files
if [ "$TOOL_NAME" != "Edit" ] && [ "$TOOL_NAME" != "Write" ]; then
  exit 0
fi

# TypeScript files in api/
if [[ "$FILE_PATH" =~ /api/src/.*\.ts$ ]]; then
  cd "$(dirname "$FILE_PATH" | sed 's|/src.*||')" 2>/dev/null || exit 0
  if [ -f "tsconfig.json" ]; then
    OUTPUT=$(npx tsc --noEmit 2>&1 || true)
    if [ -n "$OUTPUT" ] && [[ ! "$OUTPUT" =~ ^[[:space:]]*$ ]]; then
      echo "🔴 TypeScript errors after edit:" >&2
      echo "$OUTPUT" | head -20 >&2
    fi
  fi
fi

# TypeScript files in frontend/
if [[ "$FILE_PATH" =~ /frontend/src/.*\.tsx?$ ]]; then
  cd "$(dirname "$FILE_PATH" | sed 's|/src.*||')" 2>/dev/null || exit 0
  if [ -f "tsconfig.json" ]; then
    OUTPUT=$(npx tsc --noEmit 2>&1 || true)
    if [ -n "$OUTPUT" ] && [[ ! "$OUTPUT" =~ ^[[:space:]]*$ ]]; then
      echo "🔴 TypeScript errors after edit:" >&2
      echo "$OUTPUT" | head -20 >&2
    fi
  fi
fi

exit 0
