#!/usr/bin/env bash
# Monthly restore test (plan.md SOP-08): restore a backup into a scratch
# database and sanity-check row counts, without ever touching the real one.
#
# Usage: DATABASE_URL=postgresql://user:pass@host/postgres \
#        ./scripts/restore_db.sh backups/daak-20260101T000000Z.dump [scratch_db_name]
set -euo pipefail

DUMP_FILE="${1:?usage: restore_db.sh <dump-file> [scratch_db_name]}"
SCRATCH_DB="${2:-daak_restore_test}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set (connect to the 'postgres' maintenance db, not daak itself)" >&2
  exit 1
fi

echo "Creating scratch database $SCRATCH_DB..."
psql "$DATABASE_URL" -c "DROP DATABASE IF EXISTS $SCRATCH_DB;"
psql "$DATABASE_URL" -c "CREATE DATABASE $SCRATCH_DB;"

SCRATCH_URL="${DATABASE_URL%/*}/$SCRATCH_DB"
pg_restore --dbname="$SCRATCH_URL" --no-owner --no-privileges "$DUMP_FILE"

echo "Restore complete. Row counts:"
psql "$SCRATCH_URL" -c "
  SELECT 'shipments' AS table, count(*) FROM shipments
  UNION ALL SELECT 'customers', count(*) FROM customers
  UNION ALL SELECT 'shipment_events', count(*) FROM shipment_events;
"

echo "Drop the scratch database when done: psql \"$DATABASE_URL\" -c \"DROP DATABASE $SCRATCH_DB;\""
