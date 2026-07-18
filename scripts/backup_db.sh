#!/usr/bin/env bash
# Daily automated backup (plan.md SOP-08). Point a cron job / scheduled
# task at this once the database lives somewhere persistent — nothing in
# this repo schedules it automatically.
#
# Usage: DATABASE_URL=postgresql://... ./scripts/backup_db.sh [outdir]
set -euo pipefail

OUTDIR="${1:-./backups}"
mkdir -p "$OUTDIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTFILE="$OUTDIR/daak-$TIMESTAMP.dump"

pg_dump --format=custom --file="$OUTFILE" "$DATABASE_URL"
echo "backed up to $OUTFILE"

# Keep the last 30 daily backups, prune older ones.
ls -1t "$OUTDIR"/daak-*.dump 2>/dev/null | tail -n +31 | xargs -r rm --
