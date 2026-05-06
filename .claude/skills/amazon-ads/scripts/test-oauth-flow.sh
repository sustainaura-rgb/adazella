#!/usr/bin/env bash
# Reference script: test the Amazon OAuth flow end-to-end.
# Useful when debugging connection issues.
#
# Usage: bash .claude/skills/amazon-ads/scripts/test-oauth-flow.sh

set -e

API_URL="${API_URL:-http://localhost:3000}"
TOKEN="${TOKEN:?ERROR: set TOKEN env var to a valid Supabase JWT}"

echo "1. Requesting OAuth start URL..."
START_RES=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/api/oauth/amazon/start")
echo "Response: $START_RES"

URL=$(echo "$START_RES" | jq -r '.url')
if [ -z "$URL" ] || [ "$URL" = "null" ]; then
  echo "ERROR: didn't get a URL back. Response: $START_RES"
  exit 1
fi

echo ""
echo "2. Open this URL in your browser:"
echo "   $URL"
echo ""
echo "3. After completing Amazon auth, you'll redirect to FRONTEND_URL/dashboard?amazon_connected=1"
echo "4. Check Supabase: SELECT * FROM amazon_connections WHERE workspace_id = 'YOUR_WS_ID';"
