#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pizza Denfert — MongoDB restore.
#
# WARNING: this REPLACES the current `pizzadenfert` DB. Take a fresh backup
# first if you want to preserve current state.
#
# Usage:
#   sudo bash scripts/restore.sh <path-to-backup.archive.gz>
# ---------------------------------------------------------------------------
set -euo pipefail

ARCHIVE="${1:-}"
[ -n "$ARCHIVE" ] || { echo "usage: $0 <backup.archive.gz>" >&2; exit 2; }
[ -f "$ARCHIVE" ] || { echo "file not found: $ARCHIVE" >&2; exit 2; }

DB_NAME="${DB_NAME:-pizzadenfert}"

echo "==> Restoring $ARCHIVE into MongoDB '$DB_NAME'"
echo "    (existing collections in that DB will be DROPPED)"
read -r -p "    Continue? [y/N] " ans
[ "${ans:-N}" = "y" ] || [ "${ans:-N}" = "Y" ] || { echo "aborted"; exit 1; }

docker compose exec -T mongo mongorestore \
  --db="$DB_NAME" --archive --gzip --drop < "$ARCHIVE"

echo "==> Restore complete"
