#!/usr/bin/env bash
# Runs on the VM itself via cron and raises an alarm when the service does not answer from outside
# or the certificate is about to expire. Without CP_ALERT_WEBHOOK set it only writes to the log;
# with a URL set it sends one line of text there (ntfy, Slack, Discord, whatever).
#
# Installation on the VM (every 5 minutes):
#   */5 * * * * /opt/control-plane/repo/ops/watchdog.sh >> /var/log/cp-watchdog.log 2>&1
#
# It reports the change of state, not every run: an outage reports once, the return reports once.
# Otherwise the message goes blunt and gets ignored when it counts. The new state is stored only after the
# POST went through: when the webhook fails, the next run reports the same change again.
set -uo pipefail

URL="${CP_URL:-https://postyourprice.com}"
STATE_FILE="${CP_WATCHDOG_STATE:-/var/lib/cp-watchdog.state}"
WEBHOOK="${CP_ALERT_WEBHOOK:-}"
CERT_WARN_DAYS="${CP_CERT_WARN_DAYS:-20}"
CREDIT_TIMEOUT="${CP_CREDIT_TIMEOUT:-45}"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Exits non-zero when the POST failed: no answer or an HTTP error of the webhook (`--fail`). The caller then keeps the
# old state, so the next run sends the message again.
report() {
  local severity="$1" text="$2"
  echo "$TS [$severity] $text"
  [[ -n "$WEBHOOK" ]] || return 0
  if ! curl -s --fail -m 15 -X POST "$WEBHOOK" \
    -H "Content-Type: text/plain" \
    -H "Title: control-plane $severity" \
    -H "Priority: $([[ "$severity" == OK ]] && echo default || echo high)" \
    --data "control-plane $severity: $text ($URL, $TS)" >/dev/null; then
    echo "$TS [WARN] webhook unreachable"
    return 1
  fi
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

# Balance at the inference provider. On 2026-11-11 it ran out and every inference request of a paying customer got 503 for
# 28 hours while the service itself stayed healthy, so this runs before the health verdict and on every run. Like the health
# check it reports the change only: one [WARN] when the runway falls below the threshold, one more [WARN] when the balance
# reaches 0 (the state of 2026-11-11, so a missed first warning is not the only one), one [OK] when it is back. The line
# comes from ops/credit-runway.sh, which asks from inside the service container, so no key passes through here. An unreadable
# answer keeps the stored state and posts at most once a day. The whole query has a time limit: it runs before the health check,
# and a hanging Docker daemon would otherwise hold every run and with it the outage alarm. `timeout` signals its whole process
# group, so `docker exec` dies with the script.
check_credit() {
  local line code previous today left now posted=1
  if command -v timeout >/dev/null 2>&1; then
    line=$(timeout -k 5 "$CREDIT_TIMEOUT" bash "$HERE"/credit-runway.sh --container 2>/dev/null | head -n 1)
    code=${PIPESTATUS[0]}
  else
    # No coreutils timeout (a Mac without it): unbounded, the server always has one.
    line=$(bash "$HERE"/credit-runway.sh --container 2>/dev/null | head -n 1)
    code=${PIPESTATUS[0]}
  fi
  [[ "$code" == 124 || "$code" == 137 ]] && line="no answer from ops/credit-runway.sh within ${CREDIT_TIMEOUT} s"
  previous=$(cat "${STATE_FILE}.credit" 2>/dev/null || echo "unknown")
  case "$code" in
    0)
      if [[ "$previous" == "low" || "$previous" == "empty" ]]; then report "OK" "credit $line" || posted=0; fi
      [[ $posted == 1 ]] && { echo "ok" > "${STATE_FILE}.credit" 2>/dev/null || true; }
      echo "$TS [INFO] credit $line" ;;
    1)
      # The line starts with "CREDIT RUNWAY LOW: <left> USD"; a balance of 0 or below is empty.
      left=${line#CREDIT RUNWAY LOW: }; left=${left%% USD*}
      if [[ "$left" =~ ^(-[0-9.]+|0(\.0+)?)$ ]]; then now="empty"; else now="low"; fi
      if [[ "$now" == "empty" && "$previous" != "empty" ]]; then
        report "WARN" "credit empty, $left USD left, every inference request fails until topped up at https://openrouter.ai/settings/credits" || posted=0
      elif [[ "$now" == "low" && "$previous" != "low" && "$previous" != "empty" ]]; then
        report "WARN" "credit $line, top up at https://openrouter.ai/settings/credits" || posted=0
      else
        echo "$TS [INFO] credit still $now"
      fi
      [[ $posted == 1 ]] && { echo "$now" > "${STATE_FILE}.credit" 2>/dev/null || true; } ;;
    *)
      today=$(date -u +%F)
      if [[ "$(cat "${STATE_FILE}.credit-fail" 2>/dev/null)" != "$today" ]]; then
        report "WARN" "credit unreadable (${line:-no answer from ops/credit-runway.sh})" &&
          { echo "$today" > "${STATE_FILE}.credit-fail" 2>/dev/null || true; }
      else
        echo "$TS [WARN] credit unreadable (${line:-no answer from ops/credit-runway.sh})"
      fi ;;
  esac
}

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
check_credit

CODE=$(check_health)
PREVIOUS=$(cat "$STATE_FILE" 2>/dev/null || echo "unknown")

if [[ "$CODE" == "200" ]]; then
  if [[ "$PREVIOUS" != "down" ]] || report "OK" "reachable again"; then
    echo "up" > "$STATE_FILE" 2>/dev/null || true
  fi
else
  if [[ "$PREVIOUS" == "down" ]] || report "OUTAGE" "HTTP $CODE, twice in a row"; then
    echo "down" > "$STATE_FILE" 2>/dev/null || true
  fi
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
      report "WARNING" "certificate expires in less than $CERT_WARN_DAYS days (valid until $END)" &&
        { echo "$TODAY" > "${STATE_FILE}.cert" 2>/dev/null || true; }
    fi
  fi
  echo "$TS [INFO] ok, certificate valid until $(echo "$PEM" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
else
  echo "$TS [WARN] certificate not readable (s_client gave no answer)"
fi
