#!/usr/bin/env bash
# The alarm for a rollout that cost a stranger an answer.
#
# ops/deploy-window.sh measures the window around every rollout and, when a request from outside
# got a 502, sends this file to the VM and runs it there:
#
#   ssh <vm> "bash -s <count> <HH:MM:SS>" < ops/deploy-alarm.sh
#
# Until 2026-11-14 such a 502 only became a warning in the log of the deploy job, which nobody
# reads on a green run. The VM already has a way to reach us: the crontab line of ops/watchdog.sh
# sets CP_ALERT_WEBHOOK. This script takes the URL from that line, so it lives in exactly one place
# and never in this public repository, and posts one line of text without an address.
#
# The URL never appears in an output: deploy.yml prints everything into the public logs of a public
# repository, and whoever knows the topic can read and post to it (ops/README.md, Watchdog). curl's
# own error lines name the host, so they are dropped.
#
# The POST carries the headers `Title: deploy-window 502` and `Priority: high`, following the headers of
# ops/watchdog.sh, so a 502 to a stranger rings as loud as an outage. The title is fixed text without an address;
# it does not start with `control-plane `, so ops/status.sh does not count it as a delivery of the watchdog.
#
# An alarm that does not go out is kept for the watchdog: when the POST fails (exit 1) or the crontab sets no webhook
# (exit 2), one line `<count> <HH:MM:SS>` is appended to `<state>.deploy-502`, never overwritten. `<state>` is the state
# path of ops/watchdog.sh, taken from the crontab like the webhook (the first active line that sets CP_WATCHDOG_STATE,
# otherwise /var/lib/cp-watchdog.state), so the file lies next to `.alive`, `.credit` and `.cert`. The watchdog sends it on
# its next run and removes it only after a delivered POST. The file holds no address and no URL, and no output here names
# its path. Bad arguments and a delivered POST leave no file. When the file cannot be written, the exit code stays and
# stderr says so in one line.
#
#   CP_CRONTAB_FILE   read this file instead of `crontab -l` (tests)
#
# Exit 0: posted. Exit 1: the POST failed. Exit 2: no webhook in the crontab, or bad arguments.
set -uo pipefail

count="${1:-}"
at="${2:-}"
if [[ ! "$count" =~ ^[0-9]+$ || ! "$at" =~ ^[0-9]{2}:[0-9]{2}:[0-9]{2}$ ]]; then
  echo "usage: deploy-alarm.sh <count of 502> <HH:MM:SS of the container start, UTC>" >&2
  exit 2
fi

if [[ -n "${CP_CRONTAB_FILE:-}" ]]; then
  tab=$(cat "$CP_CRONTAB_FILE" 2>/dev/null || true)
else
  tab=$(crontab -l 2>/dev/null || true)
fi

# The first active line that sets the variable, either as an environment line of its own or as a
# prefix of the watchdog command. A commented line is switched off and does not count.
from_tab() {
  printf '%s\n' "$tab" | grep -vE '^[[:space:]]*#' | grep -oE "$1=[^[:space:]]+" | head -n 1 \
    | sed -E "s/^$1=//; s/^[\"']//; s/[\"']\$//"
}
url=$(from_tab CP_ALERT_WEBHOOK)
state=$(from_tab CP_WATCHDOG_STATE)
pending="${state:-/var/lib/cp-watchdog.state}.deploy-502"

# Appends count and time for ops/watchdog.sh. Neither the path nor the URL goes into an output.
keep() {
  # The braces catch the error of the redirection itself, which would name the path.
  if { printf '%s %s\n' "$count" "$at" >> "$pending"; } 2>/dev/null; then
    echo "the alarm is kept on the VM, the watchdog sends it on its next run" >&2
  else
    echo "the alarm could not be kept for the watchdog either" >&2
  fi
}

if [[ -z "$url" ]]; then
  echo "no webhook in the crontab" >&2
  keep
  exit 2
fi

text="deploy window: $count request(s) from outside answered 502 after the rollout at $at UTC"
if ! curl -fsS -m 10 -H "Title: deploy-window 502" -H "Priority: high" -d "$text" "$url" >/dev/null 2>&1; then
  echo "the POST to the webhook failed" >&2
  keep
  exit 1
fi
echo "posted to the webhook from the crontab"
