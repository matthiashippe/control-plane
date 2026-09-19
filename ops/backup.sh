#!/usr/bin/env bash
# Tägliches Backup der Produktions-SQLite auf der VM.
#
# Warum nicht einfach `cp cp.db`: Die Datenbank läuft im WAL-Modus. Die .db-Datei ist wenige
# Kilobyte groß, der Inhalt steht im -wal daneben. Ein `cp` der .db allein ergibt ein leeres
# Backup, das erst auffällt, wenn man es braucht. `VACUUM INTO` schreibt eine konsistente,
# vollständige Kopie aus der laufenden Anwendung heraus.
#
# Installation auf der VM (täglich 3:17 UTC):
#   17 3 * * * /opt/control-plane/repo/ops/backup.sh >> /var/log/cp-backup.log 2>&1
set -uo pipefail

ZIEL="${CP_BACKUP_DIR:-/opt/control-plane/backups}"
BEHALTEN_TAGE="${CP_BACKUP_KEEP_DAYS:-14}"
COMPOSE_DIR="${CP_COMPOSE_DIR:-/opt/control-plane/repo/deploy}"
WEBHOOK="${CP_ALERT_WEBHOOK:-}"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NAME="cp-$(date -u +%F-%H%M).db"

melde_fehler() {
  echo "$TS [FEHLER] $1"
  [[ -n "$WEBHOOK" ]] || return 0
  curl -s -m 15 -X POST "$WEBHOOK" -H "Title: control-plane Backup fehlgeschlagen" \
    -H "Priority: high" --data "Backup fehlgeschlagen: $1 ($TS)" >/dev/null || true
}

mkdir -p "$ZIEL" || { melde_fehler "Zielverzeichnis $ZIEL nicht anlegbar"; exit 1; }

cd "$COMPOSE_DIR" || { melde_fehler "Compose-Verzeichnis $COMPOSE_DIR fehlt"; exit 1; }

# Schreibt erst ins Volume, weil der Container nur dort schreiben darf.
if ! docker compose -f docker-compose.prod.yml exec -T cp node -e '
  const Database = require("better-sqlite3");
  const db = new Database(process.env.CP_DB_PATH, { readonly: true });
  db.exec("VACUUM INTO (\x27/data/backup-tmp.db\x27)");
' >/dev/null 2>&1; then
  melde_fehler "VACUUM INTO im Container fehlgeschlagen"
  exit 1
fi

if ! docker run --rm -v deploy_cp-data:/data -v "$ZIEL":/out alpine \
     sh -c "mv /data/backup-tmp.db /out/$NAME" >/dev/null 2>&1; then
  melde_fehler "Backup konnte nicht aus dem Volume geholt werden"
  exit 1
fi

# Ein Backup unter 20 KB ist mit an Sicherheit grenzender Wahrscheinlichkeit kaputt: allein das
# Schema der leeren Datenbank ist größer.
GROESSE=$(stat -c %s "$ZIEL/$NAME" 2>/dev/null || echo 0)
if [[ "$GROESSE" -lt 20480 ]]; then
  melde_fehler "Backup $NAME ist nur $GROESSE Bytes groß, vermutlich leer"
  exit 1
fi

find "$ZIEL" -name 'cp-*.db' -type f -mtime "+$BEHALTEN_TAGE" -delete 2>/dev/null || true
ANZAHL=$(find "$ZIEL" -name 'cp-*.db' -type f | wc -l | tr -d ' ')
echo "$TS [OK] $NAME, $GROESSE Bytes, $ANZAHL Backups im Bestand"
