#!/usr/bin/env bash
# Which addresses in the access log are us?
#
# Every traffic script has to answer this, and until 2026-09-22 each one answered it the same wrong
# way: take `CP_OWN_IPS` plus the address the live ssh connection comes from. That covers the
# moment the script runs, and the access log is a record of days. This line reconnects and gets a
# new address (82.194.125.90 -> 62.224.55.59 -> 82.194.125.90 within a day), so the log holds
# requests from addresses that were ours an hour ago and are not in any list.
#
# What it cost: `ops/depth.sh` reported "1 page load from outside, control pixel fetched" on the
# day the depth pixels went in. The one page load was our own deploy check from 62.224.55.59, an
# address we had held that morning, and the run before it had already moved on. A measurement that
# can only flatter is not a measurement.
#
# So the list is written down and grows: every address this machine is observed to have is appended
# to ops/own-ips.txt with the date it was first seen, and the file is in the repository because
# it is evidence, not a scratch file. Filtering an address that later belongs to somebody else
# loses a real reader, which is the direction this counter must err in.
#
#   source ops/own-ips.sh; OWN=$(own_ips)

# Resolved here and not inside the function: ${BASH_SOURCE[0]} names the file being sourced at
# THIS moment, and by the time the function runs it can be empty. It was, and the function
# quietly created a second list in whatever directory the caller happened to stand in, where
# nobody commits it. A history that writes to the wrong place is not a history.
CP_OWN_IPS_FILE="${CP_OWN_IPS_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/own-ips.txt}"

own_ips() {
  local list_file="$CP_OWN_IPS_FILE"
  local key="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
  local host="${CP_HOST:-root@76.13.144.207}"
  local live
  # Missing means the path is wrong, not that the history is empty. Say so rather than start a
  # fresh one somewhere else.
  if [[ ! -f "$list_file" ]]; then
    echo "own_ips: $list_file is not there. The list of our own addresses lives in the" >&2
    echo "            repository; without it every traffic count is guesswork." >&2
    return 1
  fi
  live=$(timeout 15 ssh -i "$key" -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    'echo "$SSH_CLIENT"' 2>/dev/null | awk '{print $1}' || true)
  if [[ -n "$live" ]] && ! grep -q "^$live " "$list_file" 2>/dev/null; then
    printf '%s %s  this machine, seen live\n' "$live" "$(date -u +%Y-%m-%d)" >> "$list_file"
    echo "  (new own address $live, written to $(basename "$list_file"))" >&2
  fi
  {
    # tr, not word splitting: this file gets sourced by scripts, and one shell that does not split
    # an unquoted variable turns the whole list into a single line that matches no address.
    printf '%s' "${CP_OWN_IPS:-}" | tr ' ' '\n'
    grep -v '^#' "$list_file" | awk 'NF {print $1}'
  } | grep -v '^$' | sort -u | tr '\n' ' '
}
