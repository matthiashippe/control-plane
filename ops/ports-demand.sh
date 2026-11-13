#!/usr/bin/env bash
# How many strangers asked to expose a port of their sandbox and were told 409?
#
# Until sandbox 06 the control plane answers POST /v1/sandboxes/{id}/ports/expose with 409
# port_exposure_unavailable. Buying a domain for exposed ports is only worth it if somebody other
# than us asked for one, so this counts the addresses that did, from the Caddy access log of the
# payment server (rotated files included, via ops/access-log.sh), with our own addresses removed
# (ops/own-ips.sh). Addresses never leave the pipeline: the output is one line of counts.
#
#   ops/ports-demand.sh [--since 'YYYY-MM-DD HH:MM:SS'] [--log <file>]
#   ops/ports-demand.sh --selftest
#
# Output, exactly one line:
#   PORTS DEMAND: <n> foreign addresses, <m> calls, since <YYYY-MM-DD HH:MM:SS> UTC
#
# --since is the start of the window in UTC. If the log does not reach back that far, the window
# starts at the earliest line of the log instead, and the line says so by printing that time: a
# count over a window the tool could not see would read as "nobody asked" when it means "blind".
# --log reads a file instead of the server and needs no network; our own addresses are then the
# list in ops/own-ips.txt, CP_OWN_IPS and the addresses this machine was seen with before, without
# asking the server for the live one.
#
# Exit 2 means the log could not be read, which says nothing about demand.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Counts from a JSON access log on stdin. $1 is the own addresses separated by spaces, $2 the start
# of the window in epoch seconds. Prints "<n> <m> <start epoch>", where start is the later of $2 and
# the earliest parsable line.
count_demand() {
  jq -rRn --arg own "$1" --argjson since "$2" '
    ($own | split(" ") | map(select(length > 0))) as $ips
    | [inputs | fromjson? | select(type == "object" and (.ts | type) == "number")] as $all
    | ([$all[].ts] | min // $since) as $first
    | ([$since, $first] | max) as $from
    | [ $all[]
        | select(.ts >= $from)
        | select(.request.method == "POST")
        | select((.request.uri // "") | sub("\\?.*"; "") | test("^/v1/sandboxes/[^/]+/ports/expose$"))
        | select(.status == 409)
        | (.request.client_ip // .request.remote_ip // "")
        | select(length > 0)
        | select(. as $c | $ips | index($c) | not) ] as $hits
    | "\($hits | unique | length) \($hits | length) \($from | floor)"
  ' 2>/dev/null
}

# Own addresses without network: the tracked list, CP_OWN_IPS and the remembered live addresses.
own_ips_offline() {
  local list_file="${CP_OWN_IPS_FILE:-$HERE/own-ips.txt}"
  local seen_file="${CP_OWN_IPS_SEEN:-${XDG_STATE_HOME:-$HOME/.local/state}/control-plane/own-ips-seen.txt}"
  [[ -f "$list_file" ]] || { echo "ports-demand: $list_file is not there" >&2; return 1; }
  {
    printf '%s\n' "${CP_OWN_IPS:-}" | tr ' ' '\n'
    grep -v '^#' "$list_file" | awk 'NF {print $1}'
    if [[ -f "$seen_file" ]]; then awk 'NF {print $1}' "$seen_file"; fi
  } | grep -v '^$' | sort -u | tr '\n' ' '
}

report() {
  local n m from
  read -r n m from <<<"$1"
  printf 'PORTS DEMAND: %s foreign addresses, %s calls, since %s UTC\n' \
    "$n" "$m" "$(date -u -d "@$from" '+%Y-%m-%d %H:%M:%S')"
}

if [[ "${1:-}" == "--selftest" ]]; then
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  # Documentation addresses (RFC 5737), never real readers.
  own="192.0.2.1"; stranger="198.51.100.7"; other="203.0.113.9"
  line() { # ts ip method uri status
    printf '{"ts":%s,"request":{"client_ip":"%s","method":"%s","uri":"%s"},"status":%s}\n' "$@"
  }
  fails=0
  expect() { # name want got
    if [[ "$2" == "$3" ]]; then echo "ok   $1"; else echo "FAIL $1: want '$2', got '$3'"; fails=$((fails + 1)); fi
  }
  t0=1762970000 # 2025-11-12 17:53:20 UTC
  run() { count_demand "$own" "$1" < "$tmp/log"; }

  { line $t0 "$own" GET /health 200
    line $((t0 + 10)) "$stranger" POST /v1/sandboxes/sbx-a/ports/expose 409; } > "$tmp/log"
  expect "a foreign 409 on ports/expose counts" "1 1 $t0" "$(run $t0)"

  { line $t0 "$own" GET /health 200
    line $((t0 + 10)) "$own" POST /v1/sandboxes/sbx-a/ports/expose 409; } > "$tmp/log"
  expect "an own address does not count" "0 0 $t0" "$(run $t0)"

  { line $t0 "$stranger" GET /health 200
    line $((t0 + 10)) "$stranger" DELETE /v1/sandboxes/sbx-a/ports/8080 409
    line $((t0 + 11)) "$stranger" POST /v1/sandboxes/sbx-a/exec 409; } > "$tmp/log"
  expect "another path does not count" "0 0 $t0" "$(run $t0)"

  { line $t0 "$stranger" GET /health 200
    line $((t0 + 10)) "$stranger" POST /v1/sandboxes/sbx-a/ports/expose 401
    line $((t0 + 11)) "$stranger" POST /v1/sandboxes/sbx-a/ports/expose 501; } > "$tmp/log"
  expect "another status does not count" "0 0 $t0" "$(run $t0)"

  { line $t0 "$own" GET /health 200
    line $((t0 + 10)) "$stranger" POST /v1/sandboxes/sbx-a/ports/expose 409
    line $((t0 + 20)) "$stranger" 'POST' '/v1/sandboxes/sbx-b/ports/expose?x=1' 409; } > "$tmp/log"
  expect "two calls of one address are one address and two calls" "1 2 $t0" "$(run $t0)"

  { line $t0 "$other" GET /health 200
    line $((t0 + 10)) "$other" POST /v1/sandboxes/sbx-c/ports/expose 409
    line $((t0 + 100)) "$stranger" POST /v1/sandboxes/sbx-a/ports/expose 409; } > "$tmp/log"
  expect "a call before --since does not count" "1 1 $((t0 + 50))" "$(run $((t0 + 50)))"
  expect "--since before the earliest line starts at the earliest line" "2 2 $t0" "$(run $((t0 - 86400)))"

  { printf '%s\n' "not json"; line $t0 "$own" GET /health 200; } > "$tmp/log"; line $((t0 + 10)) "$stranger" POST /v1/sandboxes/sbx-a/ports/expose 409 >> "$tmp/log"
  expect "the planted hit survives a non JSON line" "1 1 $t0" "$(run $t0)"
  expect "the report line has the agreed shape" \
    "PORTS DEMAND: 1 foreign addresses, 1 calls, since 2025-11-12 17:53:20 UTC" "$(report "$(run $t0)")"

  # The --log path end to end, with the own address coming from a list file, as in production.
  printf '# own\n%s 2026-01-01  test\n' "$own" > "$tmp/own.txt"
  { line $t0 "$own" GET /health 200
    line $((t0 + 10)) "$own" POST /v1/sandboxes/sbx-a/ports/expose 409
    line $((t0 + 20)) "$stranger" POST /v1/sandboxes/sbx-a/ports/expose 409; } > "$tmp/log"
  expect "--log with an own-list file counts only the stranger" \
    "PORTS DEMAND: 1 foreign addresses, 1 calls, since 2025-11-12 17:53:20 UTC" \
    "$(CP_OWN_IPS= CP_OWN_IPS_FILE="$tmp/own.txt" CP_OWN_IPS_SEEN="$tmp/seen.txt" \
       bash "$HERE/ports-demand.sh" --log "$tmp/log" --since '2025-11-12 17:53:20')"

  if [[ $fails -eq 0 ]]; then echo "PORTS DEMAND SELFTEST OK"; exit 0; fi
  echo "PORTS DEMAND SELFTEST FAILED ($fails)"; exit 1
fi

since_arg=""; log_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since) since_arg="${2:-}"; shift 2 ;;
    --log) log_file="${2:-}"; shift 2 ;;
    *) echo "usage: ops/ports-demand.sh [--since 'YYYY-MM-DD HH:MM:SS'] [--log <file>] | --selftest" >&2; exit 64 ;;
  esac
done

since=0
if [[ -n "$since_arg" ]]; then
  since=$(date -u -d "$since_arg UTC" +%s 2>/dev/null) || { echo "ports-demand: --since is not a time" >&2; exit 64; }
fi

if [[ -n "$log_file" ]]; then
  [[ -s "$log_file" ]] || { echo "ports-demand: $log_file is empty or missing" >&2; exit 2; }
  own=$(own_ips_offline) || exit 2
  result=$(count_demand "$own" "$since" < "$log_file")
else
  # shellcheck source=ops/own-ips.sh
  source "$HERE/own-ips.sh"
  own=$(own_ips) || exit 2
  log=$(mktemp); trap 'rm -f "$log"' EXIT
  bash "$HERE/access-log.sh" > "$log" || exit 2
  result=$(count_demand "$own" "$since" < "$log")
fi
[[ -n "$result" ]] || { echo "ports-demand: the log has no parsable line" >&2; exit 2; }
report "$result"
