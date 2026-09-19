#!/usr/bin/env bash
# Tägliches Backup der Produktions-SQLite auf der VM.
#
# Der Node-Teil steht in ops/backup-vacuum.cjs und wird in den laufenden Container eingespeist:
# Er räumt Reste des letzten Laufs weg, schreibt den Snapshot mit VACUUM INTO und prüft ihn, bevor
# er das Volume verlässt (integrity_check, Salden gegen Ledger, Zeilenzahlen gegen die Quelle).
# Warum nicht `cp cp.db`: steht dort im Kopf, samt dem Grund, warum eine Größenschwelle das nicht
# abfängt.
#
# Zurückspielen: ops/README.md, Abschnitt "Ein Backup zurückspielen".
#
# Installation auf der VM (täglich 3:17 UTC):
#   17 3 * * * /opt/control-plane/repo/ops/backup.sh >> /var/log/cp-backup.log 2>&1
set -uo pipefail

SKRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
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

# Schreibt erst ins Volume, weil der Container nur dort schreiben darf. Die Ausgabe wird
# festgehalten: Ohne sie stand im Log jahrelang nur "fehlgeschlagen" ohne den Grund.
if ! AUSGABE=$(docker compose -f docker-compose.prod.yml exec -T cp node - < "$SKRIPT_DIR/backup-vacuum.cjs" 2>&1); then
  melde_fehler "Backup im Container fehlgeschlagen: $(printf '%s' "$AUSGABE" | tr '\n' ' ' | tail -c 400)"
  exit 1
fi

if ! docker run --rm -v deploy_cp-data:/data -v "$ZIEL":/out alpine \
     sh -c "mv /data/backup-tmp.db /out/$NAME" >/dev/null 2>&1; then
  melde_fehler "Backup konnte nicht aus dem Volume geholt werden (Platte voll?)"
  exit 1
fi

# Der Container kennt die genaue Größe des geprüften Snapshots, also wird sie verglichen statt
# gegen eine feste Untergrenze geprüft. Eine Schwelle von 20 KB half hier nicht: Das Schema allein
# wiegt rund 80 KB, eine inhaltsleere Kopie liegt weit darüber und käme damit durch.
ERWARTET=$(printf '%s' "$AUSGABE" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p' | tail -1)
GROESSE=$(stat -c %s "$ZIEL/$NAME" 2>/dev/null || echo 0)
if [[ -z "$ERWARTET" || "$GROESSE" != "$ERWARTET" ]]; then
  # Der Torso kommt weg: Eine halb geschriebene Datei im Bestand sieht später aus wie ein Backup.
  rm -f "$ZIEL/$NAME"
  melde_fehler "Backup $NAME ist $GROESSE Bytes groß, im Container waren es ${ERWARTET:-unbekannt}. Abtransport unvollständig, Datei verworfen."
  exit 1
fi

find "$ZIEL" -name 'cp-*.db' -type f -mtime "+$BEHALTEN_TAGE" -delete 2>/dev/null || true
ANZAHL=$(find "$ZIEL" -name 'cp-*.db' -type f | wc -l | tr -d ' ')
echo "$TS [OK] $NAME, $GROESSE Bytes, $ANZAHL Backups im Bestand, Inhalt: $(printf '%s' "$AUSGABE" | tail -1)"
