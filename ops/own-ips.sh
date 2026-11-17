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
#   source ops/own-ips.sh; OWN=$(own_ips_offline)
#   source ops/own-ips.sh; OWN=$(own_ips_checked "$CP_OWN_IPS_FILE") || exit 2
#
# own_ips_checked is the one guard a counter puts in front of own_ips, so no tool builds its own: it
# returns 2 with one line on stderr that names the file and never an address when the list is missing,
# names no address itself, or own_ips fails or names nothing; otherwise it prints what own_ips prints.
# The live address and the remembered ones must not stand in for the list, or an emptied list would
# count every address it used to name as a stranger.
#
# own_ips_offline is the same answer without the live address, for a log read from disk: the list,
# CP_OWN_IPS and the seen file, nothing over the network, nothing written. It ends with 1 when the
# list is not there and with 2, printing nothing, when the list names no address, even if
# CP_OWN_IPS or the seen file do: an emptied list must never read as "we have no addresses".

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

# The rules both own_ips and own_ips_offline read by, kept in one place.
_own_ips_list_missing() {
  echo "own_ips: $1 is not there. The list of our own addresses lives in the" >&2
  echo "            repository; without it every traffic count is guesswork." >&2
  echo "            If you are in zsh, source this from the repository root or set" >&2
  echo "            CP_OWN_IPS_FILE=<repo>/ops/own-ips.txt; zsh has no BASH_SOURCE." >&2
}

# Where addresses seen live are remembered, outside the checkout.
_own_ips_seen_file() {
  printf '%s\n' "${CP_OWN_IPS_SEEN:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/control-plane/own-ips-seen.txt}"
}

# The addresses the list names: first field of every line that does not start with "#".
_own_ips_listed() {
  grep -v '^#' "$1" | awk 'NF {print $1}' || true
}

# The addresses the seen file names, nothing when it is not there.
_own_ips_seen() {
  if [[ -f "$1" ]]; then awk 'NF {print $1}' "$1" 2>/dev/null || true; fi
}

own_ips() {
  local list_file="$CP_OWN_IPS_FILE"
  local key="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
  local host="${CP_HOST:-root@76.13.144.207}"
  local live
  # Missing means the path is wrong, not that the history is empty. Say so rather than start a
  # fresh one somewhere else.
  if [[ ! -f "$list_file" ]]; then
    _own_ips_list_missing "$list_file"
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
  local seen_file
  seen_file=$(_own_ips_seen_file)
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
    _own_ips_listed "$list_file"
    _own_ips_seen "$seen_file"
  } | grep -v '^$' | sort -u | tr '\n' ' '
}

# The answer of own_ips for a log read from disk: no live address, no network, no write.
own_ips_offline() {
  local list_file="$CP_OWN_IPS_FILE" listed
  if [[ ! -f "$list_file" ]]; then
    _own_ips_list_missing "$list_file"
    return 1
  fi
  listed=$(_own_ips_listed "$list_file" | grep -v '^$' || true)
  if [[ -z "$listed" ]]; then
    return 2
  fi
  {
    printf '%s\n' "${CP_OWN_IPS:-}" | tr ' ' '\n'
    printf '%s\n' "$listed"
    _own_ips_seen "$(_own_ips_seen_file)"
  } | grep -v '^$' | sort -u | tr '\n' ' '
}

# The answer of own_ips for <file>, or 2 with one line on stderr (the file, never an address) when the
# list is missing, names no address itself, or own_ips fails or names none. Returns, never exits: this
# file is sourced. The stderr of own_ips is dropped because it can name the live address, and stdin is
# /dev/null because a caller may read a log from its own stdin and ssh would eat it.
own_ips_checked() {
  local file="${1:-}" out
  if [[ -z "$file" ]]; then
    echo "own_ips_checked: no list file was given" >&2
    return 2
  fi
  if [[ ! -f "$file" ]]; then
    echo "own_ips_checked: the list of our own addresses $file is missing" >&2
    return 2
  fi
  if [[ -z "$(_own_ips_listed "$file" 2>/dev/null)" ]]; then
    echo "own_ips_checked: the list of our own addresses $file names no address" >&2
    return 2
  fi
  if ! out=$(CP_OWN_IPS_FILE="$file" own_ips 2>/dev/null </dev/null) || [[ -z "${out// /}" ]]; then
    echo "own_ips_checked: own_ips could not name our own addresses from $file" >&2
    return 2
  fi
  printf '%s' "$out"
}
