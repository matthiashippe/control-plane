#!/usr/bin/env bash
# Daily backup of the production SQLite on the VM.
#
# The Node part is in ops/backup-vacuum.cjs and is fed into the running container: it clears out
# leftovers of the last run, writes the snapshot with VACUUM INTO and checks it before it leaves the
# volume (integrity_check, balances against the ledger, row counts against the source). Why not
# `cp cp.db`: that is in the header there, together with the reason why a size threshold does not
# catch it.
#
# Restoring: ops/README.md, section "Ein Backup zurueckspielen".
#
# Installation on the VM (daily at 3:17 UTC):
#   17 3 * * * /opt/control-plane/repo/ops/backup.sh >> /var/log/cp-backup.log 2>&1
set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TARGET="${CP_BACKUP_DIR:-/opt/control-plane/backups}"
KEEP_DAYS="${CP_BACKUP_KEEP_DAYS:-14}"
COMPOSE_DIR="${CP_COMPOSE_DIR:-/opt/control-plane/repo/deploy}"
WEBHOOK="${CP_ALERT_WEBHOOK:-}"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NAME="cp-$(date -u +%F-%H%M).db"

report_failure() {
  echo "$TS [ERROR] $1"
  [[ -n "$WEBHOOK" ]] || return 0
  curl -s -m 15 -X POST "$WEBHOOK" -H "Title: control-plane backup failed" \
    -H "Priority: high" --data "Backup failed: $1 ($TS)" >/dev/null || true
}

mkdir -p "$TARGET" || { report_failure "cannot create target directory $TARGET"; exit 1; }

cd "$COMPOSE_DIR" || { report_failure "compose directory $COMPOSE_DIR is missing"; exit 1; }

# Writes into the volume first, because that is the only place the container may write. The output
# is kept: without it the log said "failed" for years without the reason.
if ! OUTPUT=$(docker compose -f docker-compose.prod.yml exec -T cp node - < "$SCRIPT_DIR/backup-vacuum.cjs" 2>&1); then
  report_failure "backup inside the container failed: $(printf '%s' "$OUTPUT" | tr '\n' ' ' | tail -c 400)"
  exit 1
fi

if ! docker run --rm -v deploy_cp-data:/data -v "$TARGET":/out alpine \
     sh -c "mv /data/backup-tmp.db /out/$NAME" >/dev/null 2>&1; then
  report_failure "could not move the backup out of the volume (disk full?)"
  exit 1
fi

# The container knows the exact size of the checked snapshot, so that is what is compared instead of
# a fixed lower bound. A threshold of 20 KB did not help here: the schema alone weighs around 80 KB,
# so a copy without content sits far above it and would pass.
EXPECTED=$(printf '%s' "$OUTPUT" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p' | tail -1)
SIZE=$(stat -c %s "$TARGET/$NAME" 2>/dev/null || echo 0)
if [[ -z "$EXPECTED" || "$SIZE" != "$EXPECTED" ]]; then
  # The torso goes: a half-written file in the set later looks like a backup.
  rm -f "$TARGET/$NAME"
  report_failure "backup $NAME is $SIZE bytes, inside the container it was ${EXPECTED:-unknown}. Transfer incomplete, file discarded."
  exit 1
fi

find "$TARGET" -name 'cp-*.db' -type f -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
COUNT=$(find "$TARGET" -name 'cp-*.db' -type f | wc -l | tr -d ' ')
echo "$TS [OK] $NAME, $SIZE bytes, $COUNT backups in the set, content: $(printf '%s' "$OUTPUT" | tail -1)"
