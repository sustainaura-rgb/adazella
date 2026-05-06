#!/usr/bin/env bash
# Reference: export Supabase Postgres data for migration to AWS RDS.
#
# Usage: SUPABASE_DB_URL="..." bash .claude/skills/aws-migration/scripts/backup-supabase.sh

set -e

SUPABASE_DB_URL="${SUPABASE_DB_URL:?ERROR: set SUPABASE_DB_URL (use the same DATABASE_URL from Render env)}"
OUTPUT="${OUTPUT:-supabase-backup-$(date +%Y%m%d-%H%M).sql}"

echo "Exporting Supabase data → $OUTPUT"
echo "(excluding auth + storage schemas — those will be re-created on AWS)"

pg_dump "$SUPABASE_DB_URL" \
  --no-owner --no-acl --clean --if-exists \
  --exclude-schema=auth \
  --exclude-schema=storage \
  --exclude-schema=realtime \
  --exclude-schema=supabase_functions \
  --exclude-schema=supabase_migrations \
  > "$OUTPUT"

echo ""
echo "✅ Backup saved to: $OUTPUT"
echo "Size: $(du -h "$OUTPUT" | awk '{print $1}')"
echo ""
echo "Next step: import to AWS RDS with:"
echo "  psql \"\$RDS_DB_URL\" < $OUTPUT"
