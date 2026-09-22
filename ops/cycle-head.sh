#!/usr/bin/env bash
# The line that opens a protocol entry, with times nobody typed.
#
# Three times in two days the same trap: the VM and the log run on UTC, this machine runs on CEST,
# and a time written from memory is two hours out. It cost a deploy window that measured a window
# that had not happened, a block of protocol entries dated a day ahead, and a constant in
# ops/depth.sh that sat two hours and forty minutes in the future and would have discarded every
# reader in silence. Each time the fix was the same: take the time from the machine.
#
# So the header is printed, not written:
#
#   ops/cycle-head.sh 187          the header for cycle 187, starting at the last one's end
#   ops/cycle-head.sh 187 10:20    the header for cycle 187, starting at a given UTC time
#
# It also prints the last deploy, from the container start, because that is the other number a
# protocol entry gets wrong.
set -uo pipefail
cd "$(dirname "$0")/.."

NUM="${1:-}"
FROM="${2:-}"
if [[ -z "$NUM" ]]; then
  echo "usage: ops/cycle-head.sh <cycle number> [HH:MM start, UTC]" >&2
  exit 64
fi

NOW=$(date -u +%H:%M)
TODAY=$(date -u +%d.%m.)

# The start: given, or the end of the last entry in the protocol, or simply now.
if [[ -z "$FROM" ]]; then
  FROM=$(grep -Eo '^## Zyklus [0-9]+, [0-9.]+ [0-9]{2}:[0-9]{2} bis [0-9]{2}:[0-9]{2} UTC' \
        .scratch/gtm/nachtlauf.md 2>/dev/null | tail -1 | grep -Eo '[0-9]{2}:[0-9]{2} UTC$' | cut -d' ' -f1)
  [[ -z "$FROM" ]] && FROM="$NOW"
fi

if [[ "$FROM" > "$NOW" ]]; then
  echo "COULD NOT TELL: the start $FROM UTC is after the current time $NOW UTC." >&2
  echo "        That comes from the previous entry, so the previous entry carries a time" >&2
  echo "        somebody typed. Fix it there, or pass a start explicitly." >&2
  exit 2
fi

echo "## Zyklus $NUM, $TODAY $FROM bis $NOW UTC"
echo

KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
started=$(timeout 20 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 "$HOST" \
  'docker inspect deploy-cp-1 --format "{{.State.StartedAt}}"' 2>/dev/null || true)
if [[ -n "$started" ]]; then
  echo "(last deploy: ${started:11:5} UTC, from the container start. Now: $NOW UTC.)"
else
  echo "(the container start time was not readable, so no deploy time here. Not a finding.)"
fi
