#!/usr/bin/env bash
# Every stranger who ever got an error here, and what they were trying to do.
#
#   ops/failures.sh              read the live log on the VM
#   ops/failures.sh --summary    one line, for ops/check-all.sh
#   ops/failures.sh --selftest   prove it separates a caller from a scanner and from us
#   CP_FAILURE_LOG=file ops/failures.sh   read a local log instead of the VM
#
# Why this exists. The standing order puts one rule above everything in the backlog: an error a
# real user saw beats any task. Until 2026-09-23 there was no way to ask that question, so the
# answer arrived by accident. One address in Helsinki spent three days and eight attempts failing
# to find the API entry point, and it surfaced because a path in an unrelated report looked like a
# formatting bug. Nothing would have shown it otherwise, and nothing would show the next one.
#
# Two filters decide whether this list is worth reading. Our own addresses make up 6,700 of the
# errors in this log, every one of them a test of ours, and leaving them in buries the nine
# requests that matter under four thousand that do not. Scanners asking for wp-login.php or /.env
# are not people we failed; they are counted and set aside, never silently dropped, because a
# filter that hides things is how a real visitor disappears.
set -uo pipefail
HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" = "--selftest" ]; then
  # Four addresses, one of each kind the filters have to tell apart: a stranger who got a real
  # error, a scanner probing for wordpress, one of our own test addresses, and a stranger whose
  # requests all worked. Only the first belongs in the list.
  fixture="$(mktemp)"
  cat > "$fixture" <<'JSON'
{"ts":1758360000,"request":{"remote_ip":"31.77.203.199","uri":"/v1/status/v1/models","method":"GET","headers":{"User-Agent":["python-httpx/0.28.1"]}},"status":404}
{"ts":1758360060,"request":{"remote_ip":"185.220.101.5","uri":"/wp-login.php","method":"GET","headers":{"User-Agent":["curl/7.0"]}},"status":404}
{"ts":1758360120,"request":{"remote_ip":"82.194.125.90","uri":"/v1/bounties","method":"POST","headers":{"User-Agent":["curl/8.7.1"]}},"status":401}
{"ts":1758360180,"request":{"remote_ip":"9.9.9.9","uri":"/","method":"GET","headers":{"User-Agent":["Mozilla/5.0"]}},"status":200}
JSON
  out="$(CP_FAILURE_LOG="$fixture" CP_OWN_ADDRESSES="82.194.125.90" "$0" 2>&1)"
  rm -f "$fixture"
  echo "$out"
  echo
  listed=$(echo "$out" | grep -c "31.77.203.199" || true)
  scanner_hidden=$(echo "$out" | grep -c "185.220.101.5" || true)
  scanner_counted=$(echo "$out" | grep -c "1 scanner address" || true)
  ours_hidden=$(echo "$out" | grep -c "82.194.125.90" || true)
  quiet_hidden=$(echo "$out" | grep -c "9.9.9.9" || true)
  echo "SELFTEST  caller=$listed scanner_listed=$scanner_hidden scanner_counted=$scanner_counted ours_listed=$ours_hidden ok_listed=$quiet_hidden"
  if [ "$listed" -ge 1 ] && [ "$scanner_hidden" -eq 0 ] && [ "$scanner_counted" -ge 1 ] \
     && [ "$ours_hidden" -eq 0 ] && [ "$quiet_hidden" -eq 0 ]; then
    echo "SELFTEST OK  the caller is listed, the scanner is counted and not listed, we and the"
    echo "             untroubled visitor are out."
    exit 0
  fi
  echo "SELFTEST FAILED  the filters do not separate those four. Without that this list is noise."
  exit 1
fi

# Our own addresses, from the written history rather than from whoever is connected right now.
if [ -z "${CP_OWN_ADDRESSES:-}" ]; then
  source "$DIR/own-ips.sh"
  CP_OWN_ADDRESSES="$(own_ips 2>/dev/null)"
fi
export CP_OWN_ADDRESSES
if [ -z "$CP_OWN_ADDRESSES" ]; then
  echo "WARNING  the list of our own addresses is empty, so our own 6,700 test errors will be" >&2
  echo "         in this list and bury everything that matters. See ops/own-ips.sh." >&2
fi

if [ -n "${CP_FAILURE_LOG:-}" ]; then
  cat "$CP_FAILURE_LOG"
else
  # gzip on the far side: 30 MB of log becomes about 1.3 MB on the wire.
  ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" \
    'docker exec deploy-caddy-1 cat /var/log/caddy/access.log 2>/dev/null | gzip -c' | gunzip -c
fi | python3 "$DIR/failures.py" "${1:-}"
