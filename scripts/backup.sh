#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pizza Denfert — MongoDB backup.
#
# Streams a mongodump archive of the whole `pizzadenfert` DB out of the
# mongo container and gzips it into ./backups/.
#
# Usage (from repo root):
#   sudo make backup                 # via Makefile
#   sudo bash scripts/backup.sh      # direct
#
# Retention: keeps the last 14 daily snapshots.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

DB_NAME="${DB_NAME:-pizzadenfert}"
BACKUP_DIR="$REPO_DIR/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/mongo-$DB_NAME-$STAMP.archive.gz"

mkdir -p "$BACKUP_DIR"

echo "==> Dumping MongoDB '$DB_NAME' to $OUT"
docker compose exec -T mongo mongodump \
  --db="$DB_NAME" --archive --gzip > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "==> Snapshot written ($SIZE)"

echo "==> Applying 14-snapshot retention"
ls -1t "$BACKUP_DIR"/mongo-"$DB_NAME"-*.archive.gz 2>/dev/null | tail -n +15 | xargs -r rm --
echo "    kept: $(ls -1 "$BACKUP_DIR"/mongo-"$DB_NAME"-*.archive.gz 2>/dev/null | wc -l) snapshots"
