#!/usr/bin/env bash
# Prints the time of the last line `[WARN] webhook unreachable` and of the last line `[INFO] webhook delivered` in the watchdog
# log, separated by one space, `-` for none:
#   ops/webhook-last.sh [LOG]      (default CP_WATCHDOG_LOG, else /var/log/cp-watchdog.log)
#
# ops/watchdog.sh writes the first line for every failed POST to the webhook and the second for every delivered one. A delivery
# after the last failure means the alarm path works again, so ops/status.sh (which sends this script over ssh, `bash -s`) keeps
# `alarm_path` red only while no delivery followed. The whole log counts, not only 24 hours. <TS> has the fixed format of
# `date -u +%Y-%m-%dT%H:%M:%SZ`, so the larger string is the later time.
# A missing or unreadable log prints nothing and exits 2.
set -uo pipefail
LOG="${1:-${CP_WATCHDOG_LOG:-/var/log/cp-watchdog.log}}"
[[ -f "$LOG" && -r "$LOG" ]] || exit 2
# Written out digit by digit instead of `[0-9]{4}`: the server's awk may be an older mawk without interval expressions, and
# there the pattern would silently match nothing. The patterns go in through the environment, because `awk -v` would eat the
# backslashes.
D='[0-9]'
TS_RE="^$D$D$D$D-$D$D-$D${D}T$D$D:$D$D:$D${D}Z"
UNREACHABLE_RE="$TS_RE"' \[WARN\] webhook unreachable$' DELIVERED_RE="$TS_RE"' \[INFO\] webhook delivered$' \
  awk '
  $0 ~ ENVIRON["UNREACHABLE_RE"] && $1 > u { u = $1 }
  $0 ~ ENVIRON["DELIVERED_RE"] && $1 > d { d = $1 }
  END { print (u == "" ? "-" : u) " " (d == "" ? "-" : d) }
' "$LOG"
