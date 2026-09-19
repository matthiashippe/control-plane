#!/usr/bin/env bash
# Läuft auf der VM selbst per Cron und schlägt Alarm, wenn der Dienst von außen nicht antwortet
# oder das Zertifikat abläuft. Ohne gesetzte CP_ALERT_WEBHOOK schreibt er nur ins Log; mit
# gesetzter URL schickt er eine Zeile Text dorthin (ntfy, Slack, Discord, was auch immer).
#
# Installation auf der VM (alle 5 Minuten):
#   */5 * * * * /opt/control-plane/repo/ops/watchdog.sh >> /var/log/cp-watchdog.log 2>&1
#
# Er meldet den Wechsel des Zustands, nicht jeden Lauf: ein Ausfall meldet einmal, die Rückkehr
# meldet einmal. Sonst stumpft die Meldung ab und wird ignoriert, wenn es zählt.
set -uo pipefail

URL="${CP_URL:-https://cp.hippe.eu}"
STATE_FILE="${CP_WATCHDOG_STATE:-/var/lib/cp-watchdog.state}"
WEBHOOK="${CP_ALERT_WEBHOOK:-}"
CERT_WARN_DAYS="${CP_CERT_WARN_DAYS:-20}"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

melde() {
  local schwere="$1" text="$2"
  echo "$TS [$schwere] $text"
  [[ -n "$WEBHOOK" ]] || return 0
  curl -s -m 15 -X POST "$WEBHOOK" \
    -H "Content-Type: text/plain" \
    -H "Title: control-plane $schwere" \
    -H "Priority: $([[ "$schwere" == OK ]] && echo default || echo high)" \
    --data "control-plane $schwere: $text ($URL, $TS)" >/dev/null || echo "$TS [WARN] Webhook nicht erreichbar"
}

# Zwei Versuche mit Pause, damit ein einzelner Aussetzer nicht sofort alarmiert.
pruefe_health() {
  local code
  for versuch in 1 2; do
    code=$(curl -s -o /dev/null -m 20 -w "%{http_code}" "$URL/health" 2>/dev/null)
    [[ "$code" == "200" ]] && { echo 200; return; }
    [[ $versuch -eq 1 ]] && sleep 20
  done
  echo "${code:-000}"
}

CODE=$(pruefe_health)
VORHER=$(cat "$STATE_FILE" 2>/dev/null || echo "unbekannt")

if [[ "$CODE" == "200" ]]; then
  [[ "$VORHER" == "down" ]] && melde "OK" "wieder erreichbar"
  echo "up" > "$STATE_FILE" 2>/dev/null || true
else
  [[ "$VORHER" == "down" ]] || melde "AUSFALL" "HTTP $CODE, zweimal hintereinander"
  echo "down" > "$STATE_FILE" 2>/dev/null || true
  # Bei Ausfall gleich den Compose-Zustand ins Log, damit die Ursache später nachlesbar ist.
  docker ps -a --filter "name=deploy-" --format "{{.Names}} {{.Status}}" 2>/dev/null | sed "s/^/$TS [INFO] /"
  exit 1
fi

# Zertifikat: `openssl -checkend` statt Datumsrechnung, weil `date -d` nur auf GNU existiert und
# das Skript auch auf dem Mac laufen können soll. Nur einmal am Tag melden, sonst wird die Warnung
# zur Tapete.
HOST="${URL#https://}"; HOST="${HOST%%/*}"
PEM=$(echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null)
if [[ -n "$PEM" ]]; then
  if ! echo "$PEM" | openssl x509 -noout -checkend $(( CERT_WARN_DAYS * 86400 )) >/dev/null 2>&1; then
    HEUTE=$(date -u +%F)
    if [[ "$(cat "${STATE_FILE}.cert" 2>/dev/null)" != "$HEUTE" ]]; then
      ENDE=$(echo "$PEM" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
      melde "WARNUNG" "Zertifikat läuft in weniger als $CERT_WARN_DAYS Tagen ab (gültig bis $ENDE)"
      echo "$HEUTE" > "${STATE_FILE}.cert" 2>/dev/null || true
    fi
  fi
  echo "$TS [INFO] ok, Zertifikat gültig bis $(echo "$PEM" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
else
  echo "$TS [WARN] Zertifikat nicht lesbar (s_client ohne Antwort)"
fi
