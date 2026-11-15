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
#
# It also sends a deploy alarm that did not go out: ops/deploy-alarm.sh appends `<count> <HH:MM:SS>` to
# `<state file>.deploy-502` when its POST failed or the crontab set no webhook. Every run looks for that file before the
# health check, posts it once with `Title: deploy-window 502` and priority high and removes it only after the POST went
# through.
set -uo pipefail

URL="${CP_URL:-https://postyourprice.com}"
STATE_FILE="${CP_WATCHDOG_STATE:-/var/lib/cp-watchdog.state}"
WEBHOOK="${CP_ALERT_WEBHOOK:-}"
CERT_WARN_DAYS="${CP_CERT_WARN_DAYS:-20}"
CREDIT_TIMEOUT="${CP_CREDIT_TIMEOUT:-45}"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# The one POST to the webhook, for every message of this script. Exits non-zero when the POST failed: no answer or an
# HTTP error of the webhook (`--fail`). The caller then keeps the old state, so the next run sends the message again.
# Every delivered POST of the watchdog leaves `[INFO] webhook delivered`, so ops/status.sh can tell a failure that is over
# from one that still lasts (ops/webhook-last.sh).
# `report <severity> <text>` sends a message of the watchdog. `report "" <text> <title header> <priority header>
# <delivered line>` sends the text as it is with its own headers and its own log line after delivery (the kept deploy
# alarm), without the line `[<severity>] <text>`.
report() {
  local severity="$1" text="$2" title="${3:-}" priority="${4:-}" delivered="${5:-webhook delivered}" data
  if [[ -n "$title" ]]; then
    data="$text"
  else
    echo "$TS [$severity] $text"
    title="Title: control-plane $severity"
    case "$severity" in
      OK) priority="Priority: default" ;;
      ALIVE) priority="Priority: min" ;;
      *) priority="Priority: high" ;;
    esac
    data="control-plane $severity: $text ($URL, $TS)"
  fi
  [[ -n "$WEBHOOK" ]] || return 0
  if ! curl -s --fail -m 15 -X POST "$WEBHOOK" \
    -H "Content-Type: text/plain" \
    -H "$title" \
    -H "$priority" \
    --data "$data" >/dev/null; then
    echo "$TS [WARN] webhook unreachable"
    return 1
  fi
  echo "$TS [INFO] $delivered"
}

# A dead webhook does not announce itself: on a day without a change of state nothing is posted, so nothing can fail.
# The first run in each of three windows per UTC day (from 00:00, 08:00 and 16:00 UTC) posts a sign of life with priority
# `min` (ntfy delivers it without sound or vibration). Three windows, because ops/status.sh compares the last delivery with
# the topic only while it is younger than 11 hours (ntfy caches 12 hours); with one sign of life a day `received` was
# `unknown` from about 11:05 UTC on. The stamp is the start of the window (`YYYY-MM-DDTHH`), taken from TS and not from
# another call of `date`; a stamp of the old format (`YYYY-MM-DD`) counts as a missing window. It is stored only after the
# POST went through, so with a dead webhook every run of the window tries again and leaves one line
# `[WARN] webhook unreachable`. It runs before the health check, so a run during an outage tries it as well.
# CP_WATCHDOG_ALIVE=0 switches only this off, for tests that count every POST.
sign_of_life() {
  local hour window
  [[ -n "$WEBHOOK" && "${CP_WATCHDOG_ALIVE:-1}" != "0" ]] || return 0
  hour=$((10#${TS:11:2}))
  if (( hour >= 16 )); then window=16; elif (( hour >= 8 )); then window=08; else window=00; fi
  window="${TS:0:10}T$window"
  [[ "$(cat "${STATE_FILE}.alive" 2>/dev/null)" == "$window" ]] && return 0
  report "ALIVE" "daily sign of life, the alarm path works" &&
    { echo "$window" > "${STATE_FILE}.alive" 2>/dev/null || true; }
}

# A deploy alarm kept by ops/deploy-alarm.sh. Same title as there, so ops/status.sh does not count it as a message of
# the watchdog. Only lines of the form `<count> <HH:MM:SS>` go into the text, so it names no address and no URL. The file
# goes only after a delivered POST; lines appended while the POST ran stay for the next run.
send_kept_deploy_alarm() {
  local file="${STATE_FILE}.deploy-502" kept text rest
  [[ -f "$file" ]] || return 0
  if [[ -z "$WEBHOOK" ]]; then
    echo "$TS [WARN] a deploy alarm is waiting, no webhook set"
    return 0
  fi
  kept=$(cat "$file" 2>/dev/null) || return 0
  text=$(printf '%s\n' "$kept" | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9]$/ {
    printf "%s%s request(s) from outside answered 502 after the rollout at %s UTC", (n++ ? "; " : ""), $1, $2 }')
  [[ -n "$text" ]] || text="a deploy alarm was kept, its lines are not readable"
  # Its own line after delivery, not `[INFO] webhook delivered`: ops/webhook-last.sh reads that line as a delivery of the
  # watchdog, and ops/status.sh then wants a message titled `control-plane ...` on the topic, which this title is not.
  report "" "deploy window, sent late by the watchdog: $text" "Title: deploy-window 502" "Priority: high" \
    "deploy alarm delivered" || return 0
  rest=$(cat "$file" 2>/dev/null)
  if [[ "$rest" == "$kept" ]]; then
    rm -f "$file"
  else
    printf '%s\n' "${rest#"$kept"$'\n'}" > "$file" 2>/dev/null || true
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
sign_of_life
send_kept_deploy_alarm

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
