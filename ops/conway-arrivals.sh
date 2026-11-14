# shellcheck shell=bash
# The own addresses for counting arrivals from Conway-Research, once, for ops/landing-yield.sh and
# ops/github-yield.sh. Sourced, never run. The counting rule itself is in ops/conway_arrivals.py.
#
#   source ops/conway-arrivals.sh; conway_own_list <file> || exit 2
#
# Until messung 03 both tools read ops/own-ips.txt directly. That missed the address this machine is
# seen with live and every address remembered in CP_OWN_IPS_SEEN, so a check from the code-host could
# count as a foreign arrival. `own_ips` from ops/own-ips.sh knows all three, so the list comes from it.
#
# CP_OWN_IPS names a FILE for both tools, their selftests and their tests; `own_ips` reads
# CP_OWN_IPS as a list of addresses and takes its file from CP_OWN_IPS_FILE. So when CP_OWN_IPS is set,
# it becomes CP_OWN_IPS_FILE for the call and `own_ips` runs without it. CP_HOST and CP_SSH_KEY go to
# `own_ips` as the caller set them, the same pair the caller gives ops/access-log.sh.

CONWAY_ARRIVALS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/own-ips.sh
source "$CONWAY_ARRIVALS_DIR/own-ips.sh"

# Writes our own addresses to <file>, one per line. Returns 2 with one line on stderr when the list
# `own_ips` reads is missing, names no address itself, or `own_ips` names no address at all: a missing
# or empty list must never read as "none of these addresses are ours". The stderr of `own_ips` is dropped because it can name the live
# address, and no output of the tools may name an address.
conway_own_list() {
  local out="$1" file list
  file="${CP_OWN_IPS:-$CP_OWN_IPS_FILE}"
  if [[ ! -f "$file" ]]; then
    echo "conway-arrivals: own_ips has no list of our own addresses ($file is missing), so nothing is counted." >&2
    return 2
  fi
  # The list itself must name an address, read the way `own_ips` reads it. The live address and the ones
  # remembered in CP_OWN_IPS_SEEN are ours too, but they must not stand in for the list: an emptied list
  # would then pass unnoticed and count every address it used to name as a foreign arrival.
  if ! grep -v '^#' "$file" | awk 'NF {print $1}' | grep -q .; then
    echo "conway-arrivals: own_ips has an empty list of our own addresses ($file names none), so nothing is counted." >&2
    return 2
  fi
  # own_ips ends with 1 under pipefail when it finds no address at all; the size check below says so.
  list=$(CP_OWN_IPS_FILE="$file" CP_OWN_IPS="" own_ips 2>/dev/null)
  printf '%s\n' "$list" | tr ' ' '\n' | grep -v '^$' > "$out"
  if [[ ! -s "$out" ]]; then
    echo "conway-arrivals: own_ips named no own address at all (the list $file is empty), so nothing is counted." >&2
    return 2
  fi
}
