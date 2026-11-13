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
# So the list is written down and grows: an address this machine is observed to have is appended
# to ops/own-ips.txt with the date it was first seen when the caller sets CP_OWN_IPS_WRITE=1, and
# the file is in the repository because it is evidence, not a scratch file. Without the variable
# the live address is not written to the list and stderr says how to keep it there, so a check
# with network never leaves the checkout dirty; it is remembered outside the checkout instead
# (CP_OWN_IPS_SEEN, default $XDG_STATE_HOME/control-plane/own-ips-seen.txt) and counted as ours in
# every later run on this machine. Filtering an address that later belongs to somebody else
# loses a real reader, which is the direction this counter must err in.
#
#   source ops/own-ips.sh; OWN=$(own_ips)

# Resolved here and not inside the function: ${BASH_SOURCE[0]} names the file being sourced at
# THIS moment, and by the time the function runs it can be empty. It was, and the function
# quietly created a second list in whatever directory the caller happened to stand in, where
# nobody commits it. A history that writes to the wrong place is not a history.
#
# And BASH_SOURCE does not exist in zsh, which is the shell an operator stands in. Sourcing this
# from a zsh prompt made `dirname ""` resolve to `.`, so the path became <repo>/own-ips.txt and the
# guard below refused. That guard is what saved it: on 2026-09-23 a hand-written traffic query ran
# with an empty own-list and was one step from reporting our own address, with 11,772 requests in
# the log, as a stranger who got errors. The fallbacks below cover the shell; the guard stays
# because a list that is merely absent must never read as a list that is empty.
if [[ -z "${CP_OWN_IPS_FILE:-}" ]]; then
  if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    CP_OWN_IPS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/own-ips.txt"
  elif [[ -f "$PWD/ops/own-ips.txt" ]]; then
    CP_OWN_IPS_FILE="$PWD/ops/own-ips.txt"
  elif [[ -f "$PWD/own-ips.txt" ]]; then
    CP_OWN_IPS_FILE="$PWD/own-ips.txt"
  else
    CP_OWN_IPS_FILE="$PWD/own-ips.txt"
  fi
fi

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
    echo "            If you are in zsh, source this from the repository root or set" >&2
    echo "            CP_OWN_IPS_FILE=<repo>/ops/own-ips.txt; zsh has no BASH_SOURCE." >&2
    return 1
  fi
  live=$(timeout 15 ssh -i "$key" -o BatchMode=yes -o ConnectTimeout=8 "$host" \
    'echo "$SSH_CLIENT"' 2>/dev/null | awk '{print $1}' || true)
  # A new address is written only when a human asks for it with CP_OWN_IPS_WRITE=1. Until
  # 2026-11-13 every call appended it, and since the list is tracked, any check with network left
  # the checkout dirty and `check` red. Without the variable the address still counts as ours for
  # this run, because dropping it would count our own checks as strangers.
  if [[ -n "$live" ]] && ! grep -q "^$live " "$list_file" 2>/dev/null; then
    if [[ "${CP_OWN_IPS_WRITE:-}" == "1" ]]; then
      printf '%s %s  this machine, seen live\n' "$live" "$(date -u +%Y-%m-%d)" >> "$list_file"
      echo "  (new own address $live, written to $(basename "$list_file"))" >&2
    else
      echo "  (new own address $live, counted for this run only; CP_OWN_IPS_WRITE=1 writes it to $(basename "$list_file"))" >&2
    fi
  fi
  # The list above only grows by hand now, and this line reconnects to a new address most days, so
  # an address seen yesterday would count as a stranger today: the 2026-09-22 error again. Every
  # address seen live is therefore remembered outside the checkout, in CP_OWN_IPS_SEEN or the state
  # directory, and counted as ours in every later run. A failed write there must not cost the
  # caller its answer, so errors are dropped.
  local seen_file="${CP_OWN_IPS_SEEN:-${XDG_STATE_HOME:-$HOME/.local/state}/control-plane/own-ips-seen.txt}"
  if [[ -n "$live" ]] && ! grep -q "^$live " "$list_file" 2>/dev/null \
    && ! grep -q "^$live " "$seen_file" 2>/dev/null; then
    { mkdir -p "$(dirname "$seen_file")" \
      && printf '%s %s\n' "$live" "$(date -u +%Y-%m-%d)" >> "$seen_file"; } 2>/dev/null || true
  fi
  {
    # tr, not word splitting: this file gets sourced by scripts, and one shell that does not split
    # an unquoted variable turns the whole list into a single line that matches no address.
    printf '%s\n' "${CP_OWN_IPS:-}" | tr ' ' '\n'
    printf '%s\n' "$live"
    grep -v '^#' "$list_file" | awk 'NF {print $1}'
    if [[ -f "$seen_file" ]]; then awk 'NF {print $1}' "$seen_file" 2>/dev/null; fi
  } | grep -v '^$' | sort -u | tr '\n' ' '
}
