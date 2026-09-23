#!/usr/bin/env bash
# Does the free check keep a stranger's draft, and does the page say the same thing?
#
# /check answers two ways. `POST /v1/briefs/check` carries the draft in the request body, and
# Caddy logs no bodies. `GET /check?brief=...` carries it in the address, and Caddy logs
# `request>uri` in full. `deploy/Caddyfile` keeps that file for 720 hours over ten 50 MiB rolls.
#
# Until 2026-09-23 the page said "nothing stored" on both, and recommended the address bar to
# anybody without a terminal. A probe sent that way came back out of /var/log/caddy/access.log
# three seconds later, word for word. A stranger was told their draft was not kept while it was
# being written into a log kept for a month, on the one page that asks them to paste real work.
#
# So the claim is measured now, from both ends, and the page has to agree with the measurement in
# BOTH directions: saying the log keeps it when it does not is also wrong, just harmlessly so, and
# that is the version that will be wrong first, on the day the log filter lands.
#
#   ops/what-the-log-keeps.sh              measure against the live service
#   ops/what-the-log-keeps.sh --selftest   prove the finder finds and misses on a fixture
#
# Exit 0: the measurement and the page agree. Exit 1: they do not, and the line says which way.
# Exit 2: could not measure, which is not a finding about either.
set -uo pipefail

BASE_URL="${CP_URL:-https://postyourprice.com}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The finder, as a function, because --selftest has to run the same one the measurement runs.
# `grep -q` closes the pipe on its first hit, the writer takes SIGPIPE, and under `set -o pipefail`
# the whole pipeline then reports failure on the very runs that FOUND something. Measured on
# 2026-09-22: 15 of 40 runs of an equivalent line reported "not found" against a file that
# contained the string. So: count, never -q.
found_in() { # haystack-file marker -> 0 when present
  local hits
  hits=$(/usr/bin/grep -c -- "$2" "$1" 2>/dev/null || true)
  [[ "${hits:-0}" -gt 0 ]]
}

if [[ "${1:-}" == "--selftest" ]]; then
  fixture=$(mktemp); trap 'rm -f "$fixture"' EXIT
  printf '%s\n' \
    '{"ts":1,"request":{"uri":"/check?brief=SELFTEST+MARKER+ALPHA","remote_ip":"1.2.3.4"}}' \
    '{"ts":2,"request":{"uri":"/v1/briefs/check","remote_ip":"1.2.3.4"}}' > "$fixture"
  fail=0
  found_in "$fixture" "SELFTEST" || { echo "SELFTEST FAILED: did not find a marker that is there"; fail=1; }
  found_in "$fixture" "NOT_IN_THERE_AT_ALL" && { echo "SELFTEST FAILED: found a marker that is not there"; fail=1; }
  # The failure this function exists to survive: many runs, every one of them a hit.
  misses=0
  for _ in $(seq 1 40); do found_in "$fixture" "SELFTEST" || misses=$((misses + 1)); done
  [[ "$misses" -eq 0 ]] || { echo "SELFTEST FAILED: $misses of 40 runs missed a marker that is there"; fail=1; }
  [[ "$fail" -eq 0 ]] && echo "SELFTEST OK: the finder finds, misses, and does not flake over 40 runs."
  exit "$fail"
fi

marker="LOGPROBE$(date -u +%Y%m%d%H%M%S)$$"

# Through the address bar, the way the page used to recommend.
q_code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' --get \
  --data-urlencode "brief=$marker FACT SHEET on whether this line is kept anywhere." \
  "$BASE_URL/check" 2>/dev/null || echo 000)
# Through the body, the way a terminal does it.
b_code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -X POST "$BASE_URL/v1/briefs/check" \
  -H 'content-type: application/json' \
  -d "{\"brief\":\"${marker}B FACT SHEET on whether this line is kept anywhere.\"}" 2>/dev/null || echo 000)

if [[ "$q_code" != "200" || "$b_code" != "200" ]]; then
  echo "COULD NOT MEASURE: the check answered $q_code through the address and $b_code through the body." >&2
  echo "                   Nothing was probed, so this says nothing about the log." >&2
  exit 2
fi

log=$(mktemp); trap 'rm -f "$log"' EXIT
# Only the tail: the probe is seconds old and the whole file is 30 MB.
if ! timeout 45 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 "$HOST" \
  'sleep 3; docker exec deploy-caddy-1 tail -c 400000 /var/log/caddy/access.log' > "$log" 2>/dev/null; then
  echo "COULD NOT MEASURE: the access log was not readable. A connection problem, not a finding." >&2
  exit 2
fi

# `+` because a browser and curl both encode the space that way in a query string; the raw marker
# has none, so this matches either encoding.
query_kept=1; found_in "$log" "$marker" && query_kept=0
body_kept=1;  found_in "$log" "${marker}B" && body_kept=0

echo "the free check, what the log keeps"
echo "  through the address  $([[ $query_kept -eq 0 ]] && echo 'KEPT   the draft is in /var/log/caddy/access.log' || echo 'not kept')"
echo "  through the body     $([[ $body_kept  -eq 0 ]] && echo 'KEPT   the draft is in /var/log/caddy/access.log' || echo 'not kept')"

# What the page says, read from the page and not from memory.
says=$(curl -s -m 20 "$BASE_URL/check" 2>/dev/null)
claims_logged=1
case "$says" in *"kept for 30 days"*) claims_logged=0 ;; esac

rc=0
if [[ $body_kept -eq 0 ]]; then
  echo "WRONG  the body route is logged. That is the route the page calls unlogged, and it is the"
  echo "       one a terminal uses. Check the log filter in deploy/Caddyfile."
  rc=1
fi
if [[ $query_kept -eq 0 && $claims_logged -ne 0 ]]; then
  echo "WRONG  the address route is logged and the page does not say so. A reader pasting a"
  echo "       client's brief is told nothing about where it goes."
  rc=1
fi
if [[ $query_kept -ne 0 && $claims_logged -eq 0 ]]; then
  echo "STALE  the address route is no longer logged, so the warning on /check is now false in the"
  echo "       harmless direction. Drop it: src/public/checkpage.ts, whatIsKept()."
  rc=1
fi
[[ $rc -eq 0 ]] && echo "AGREES the page says what the log does."
exit "$rc"
