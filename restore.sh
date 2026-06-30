#!/bin/sh
# Restore a Katei database from a pg_dump backup.
#
# Backups are written daily to $BACKUP_DIR (inside the data volume). Each dump is
# self-contained (pg_dump --clean --if-exists), so restoring replaces the current
# database contents with the snapshot.
#
# Usage (inside the running container):
#   docker exec -it <container> /app/restore.sh                # list backups
#   docker exec -it <container> /app/restore.sh katei_2026-06-30.sql
set -e

BACKUP_DIR="${BACKUP_DIR:-/var/lib/postgresql/data/katei_backups}"
PGUSER=katei
PGDB=katei
PGPASSWORD="${POSTGRES_PASSWORD:-katei}"
# Prefer the env the app uses; otherwise rebuild it like entrypoint.sh does.
DATABASE_URL="${DATABASE_URL:-postgresql://$PGUSER:$PGPASSWORD@localhost:5432/$PGDB}"

if [ -z "$1" ]; then
  echo "Available backups in $BACKUP_DIR:"
  ls -1 "$BACKUP_DIR" 2>/dev/null | grep '\.sql$' | sed 's/^/  /' || echo "  (none)"
  echo ""
  echo "Usage: $0 <backup-file.sql>"
  exit 0
fi

FILE="$1"
# Accept either a bare filename (resolved under BACKUP_DIR) or an absolute path.
case "$FILE" in
  /*) ;;
  *) FILE="$BACKUP_DIR/$FILE" ;;
esac

if [ ! -f "$FILE" ]; then
  echo "Backup not found: $FILE" >&2
  exit 1
fi

printf "This will OVERWRITE the current %s database with %s. Continue? [y/N] " "$PGDB" "$FILE"
read -r answer
case "$answer" in
  y|Y|yes|YES) ;;
  *) echo "Aborted."; exit 1 ;;
esac

echo "[katei] Restoring $FILE ..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$FILE"
echo "[katei] Restore complete."
