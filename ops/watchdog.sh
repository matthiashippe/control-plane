#!/usr/bin/env bash
# Runs on the VM itself via cron and raises an alarm when the service does not answer from outside
# or the certificate is about to expire. Without CP_ALERT_WEBHOOK set it only writes to the log;
# with a URL set it sends one line of text there (ntfy, Slack, Discord, whatever).
#
# Installation on the VM (every 5 minutes):
#   */5 * * * * /opt/control-plane/repo/ops/watchdog.sh >> /var/log/cp-watchdog.log 2>&1
#
# It reports the change of state, not every run: an outage reports once, the return reports once.
# Otherwise the message goes blunt and gets ignored when it counts.
set -uo pipefail

URL="${CP_URL:-https://cp.hippe.eu}"
STATE_FILE="${CP_WATCHDOG_STATE:-/var/lib/cp-watchdog.state}"
WEBHOOK="${CP_ALERT_WEBHOOK:-}"
CERT_WARN_DAYS="${CP_CERT_WARN_DAYS:-20}"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

report() {
  local severity="$1" text="$2"
  echo "$TS [$severity] $text"
  [[ -n "$WEBHOOK" ]] || return 0
  curl -s -m 15 -X POST "$WEBHOOK" \
    -H "Content-Type: text/plain" \
    -H "Title: control-plane $severity" \
    -H "Priority: $([[ "$severity" == OK ]] && echo default || echo high)" \
    --data "control-plane $severity: $text ($URL, $TS)" >/dev/null || echo "$TS [WARN] webhook unreachable"
}

# Two attempts with a pause, so a single hiccup does not alarm straight away.
check_health() {
  local code
  for attempt in 1 2; do
    code=$(curl -s -o /dev/null -m 20 -w "%{http_code}" "$URL/health" 2>/dev/null)
    [[ "$code" == "200" ]] && { echo 200; return; }
    [[ $attempt -eq 1 ]] && sleep 20
  done
  echo "${code:-000}"
}

CODE=$(check_health)
PREVIOUS=$(cat "$STATE_FILE" 2>/dev/null || echo "unknown")

if [[ "$CODE" == "200" ]]; then
  [[ "$PREVIOUS" == "down" ]] && report "OK" "reachable again"
  echo "up" > "$STATE_FILE" 2>/dev/null || true
else
  [[ "$PREVIOUS" == "down" ]] || report "OUTAGE" "HTTP $CODE, twice in a row"
  echo "down" > "$STATE_FILE" 2>/dev/null || true
  # On an outage, put the compose state into the log right away so the cause can be read up later.
  docker ps -a --filter "name=deploy-" --format "{{.Names}} {{.Status}}" 2>/dev/null | sed "s/^/$TS [INFO] /"
  exit 1
fi

# Certificate: `openssl -checkend` instead of date arithmetic, because `date -d` only exists on GNU
# and the script should run on a Mac as well. Report only once a day, otherwise the warning turns
# into wallpaper.
HOST="${URL#https://}"; HOST="${HOST%%/*}"
PEM=$(echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null)
if [[ -n "$PEM" ]]; then
  if ! echo "$PEM" | openssl x509 -noout -checkend $(( CERT_WARN_DAYS * 86400 )) >/dev/null 2>&1; then
    TODAY=$(date -u +%F)
    if [[ "$(cat "${STATE_FILE}.cert" 2>/dev/null)" != "$TODAY" ]]; then
      END=$(echo "$PEM" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
      report "WARNING" "certificate expires in less than $CERT_WARN_DAYS days (valid until $END)"
      echo "$TODAY" > "${STATE_FILE}.cert" 2>/dev/null || true
    fi
  fi
  echo "$TS [INFO] ok, certificate valid until $(echo "$PEM" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
else
  echo "$TS [WARN] certificate not readable (s_client gave no answer)"
fi
