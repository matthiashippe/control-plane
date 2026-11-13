#!/usr/bin/env bash
# Counts the lines `<TS> [WARN] webhook unreachable` of the last 24 hours in the watchdog log and prints the number.
#   ops/webhook-unreachable.sh [LOG]      (default CP_WATCHDOG_LOG, else /var/log/cp-watchdog.log)
#
# ops/watchdog.sh writes this line whenever the POST to the webhook fails, and retries every five minutes, so three lines are
# fifteen minutes in which no alarm reached anybody. ops/status.sh sends this script over ssh (`bash -s`) to the server.
# "Now" is CP_NOW (Unix seconds) or the clock. <TS> has the fixed format of `date -u +%Y-%m-%dT%H:%M:%SZ`, so comparing it as a
# string against the cutoff in the same format is enough.
# A missing or unreadable log prints nothing and exits 2: no number is not the same as zero.
set -uo pipefail
LOG="${1:-${CP_WATCHDOG_LOG:-/var/log/cp-watchdog.log}}"
[[ -f "$LOG" && -r "$LOG" ]] || exit 2
now="${CP_NOW:-$(date -u +%s)}"
cutoff=$(date -u -d "@$((now - 86400))" +%Y-%m-%dT%H:%M:%SZ) || exit 2
# Written out digit by digit instead of `[0-9]{4}`: the server's awk may be an older mawk without interval expressions, and
# there the pattern would silently match nothing. It goes in through the environment, because `awk -v` would eat the backslashes.
D='[0-9]'
WEBHOOK_RE="^$D$D$D$D-$D$D-$D${D}T$D$D:$D$D:$D${D}Z"' \[WARN\] webhook unreachable$' \
  awk -v cutoff="$cutoff" '
  $0 ~ ENVIRON["WEBHOOK_RE"] && $1 >= cutoff { n++ }
  END { print n + 0 }
' "$LOG"
