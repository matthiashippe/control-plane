# shellcheck shell=bash
# The own addresses for counting arrivals from Conway-Research, once, for ops/landing-yield.sh and
# ops/github-yield.sh. Sourced, never run. The counting rule itself is in ops/conway_arrivals.py.
#
#   source ops/conway-arrivals.sh; conway_own_list <file> || exit 2
#
# Until messung 03 both tools read ops/own-ips.txt directly. That missed the address this machine is
# seen with live and every address remembered in CP_OWN_IPS_SEEN, so a check from the code-host could
# count as a foreign arrival. `own_ips` from ops/own-ips.sh knows all three, so the list comes from it,
# through `own_ips_checked`, the guard that stops on a missing or empty list.
#
# CP_OWN_IPS names a FILE for both tools, their selftests and their tests; `own_ips` reads
# CP_OWN_IPS as a list of addresses and takes its file from CP_OWN_IPS_FILE. So when CP_OWN_IPS is set,
# it becomes CP_OWN_IPS_FILE for the call and `own_ips` runs without it. CP_HOST and CP_SSH_KEY go to
# `own_ips` as the caller set them, the same pair the caller gives ops/access-log.sh.

CONWAY_ARRIVALS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/own-ips.sh
source "$CONWAY_ARRIVALS_DIR/own-ips.sh"

# Writes our own addresses to <file>, one per line. Returns 2 with one line on stderr when
# `own_ips_checked` from ops/own-ips.sh stops: the list is missing, names no address itself, or `own_ips`
# fails or names none. That line names the file and never an address.
conway_own_list() {
  local out="$1" file err list
  file="${CP_OWN_IPS:-$CP_OWN_IPS_FILE}"
  if ! err=$(CP_OWN_IPS="" own_ips_checked "$file" 2>&1 >"$out"); then
    : >"$out"
    echo "conway-arrivals: $err, so nothing is counted." >&2
    return 2
  fi
  list=$(<"$out")
  printf '%s\n' "$list" | tr ' ' '\n' | grep -v '^$' >"$out"
}
