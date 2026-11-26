#!/usr/bin/env bash
# Who opened a card page, and how many 402s went to the maintained runtime (kunden 15). Reads only,
# prints sums only.
#
#   ops/card-visits.sh --since <ISO UTC> --until <ISO UTC>               production: the whole Caddy access
#                                                                        log (ops/access-log.sh, rotated files
#                                                                        included), CP_HOST and CP_SSH_KEY from
#                                                                        the environment or loop.env
#   ops/card-visits.sh --log <file> --since <ISO UTC> --until <ISO UTC>  the same count from a file
#   ops/card-visits.sh --selftest                                        no network: planted lines in a temp
#                                                                        dir, every rule in both directions
#   own addresses: conway_own_list from ops/conway-arrivals.sh (CP_OWN_IPS=<file> replaces the list)
#   times: strict ISO UTC like 2026-11-19T14:30:00Z, since before until; a request counts when
#   since <= ts < until
#
# Output, exactly in this order, nothing else on stdout (diagnostics go to stderr):
#
#   CARD VISITS since <t> until <u>: <h> by people, <b> by bots, <o> from own addresses
#   MAINTAINED 402 since <t> until <u>: <n> answers 402 on /v1/chat/completions to automaton-maintained runtimes
#   MAINTAINED 402 VERSION automaton-maintained/<version>: <n>      one line per version seen
#
# CARD VISITS counts every GET or HEAD on a path that starts with /card/, with or without query; /cards,
# /card.json and a bare /card do not count. <o> is from our own addresses (own_ips: the list, the
# address this machine is seen with live and CP_OWN_IPS_SEEN). Of the foreign ones a request is a bot
# when its User-Agent contains bot, crawl, spider or fetch in any case, or is empty; <h> is the rest.
#
# MAINTAINED 402 counts every POST on /v1/chat/completions (path without query) with status 402 from a
# foreign address whose User-Agent starts with automaton-maintained/. The version is the token after the
# slash up to the first whitespace. Versions are sorted naturally (digit runs compare as numbers, so
# 0.2.10 comes after 0.2.2), because plain text order would put 0.2.10 between 0.2.1 and 0.2.2. A
# token that is not a plain version (or reads like an address or a wallet; the client writes it) is
# printed as `other` and sorts last. The counting lives in ops/card_visits.py.
#
# The card link carries ?address=<wallet>, so no address, wallet or query ever reaches the output.
# Exit 2 when the log cannot be read or the own list is missing or empty. Exit 1 on a wrong argument
# or a time that is not strict ISO UTC.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELF="$ROOT/ops/card-visits.sh"
# shellcheck source=ops/conway-arrivals.sh
source "$ROOT/ops/conway-arrivals.sh"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
PY="$ROOT/ops/card_visits.py"

usage() { sed -n '4,14p' "$SELF" | sed 's/^# \{0,1\}//' >&2; exit 1; }

count() { # log since until; the own addresses come from own_ips with CP_HOST and CP_SSH_KEY as set
  local own rc
  own=$(mktemp)
  if ! conway_own_list "$own"; then
    rm -f "$own"
    return 2
  fi
  python3 -B "$PY" count "$1" "$own" "$2" "$3"
  rc=$?
  rm -f "$own"
  return "$rc"
}

if [[ "${1:-}" == "--selftest" ]]; then
  [[ $# -eq 1 ]] || usage
  # No network: own_ips asks ssh for the live address, and timeout runs the program ssh, not a shell
  # function. A fake ssh first on PATH answers nothing, and CP_OWN_IPS_SEEN points into the temp dir,
  # so neither the server nor the state directory of this machine reaches the selftest. No fixture
  # files: every planted line and both own lists are written into the temp dir here.
  stub=$(mktemp -d); trap 'rm -rf "$stub"' EXIT
  printf '#!/bin/sh\nexit 255\n' >"$stub/ssh"
  chmod +x "$stub/ssh"
  export PATH="$stub:$PATH" CP_OWN_IPS_SEEN="$stub/seen.txt"
  unset CP_OWN_IPS_WRITE
  own_ip="192.0.2.254"
  printf '%s 2026-11-19  planted own address\n' "$own_ip" >"$stub/own.txt"
  printf '192.0.2.253 2026-11-19  not in any planted line\n' >"$stub/other.txt"
  printf '# names no address\n' >"$stub/empty.txt"
  export CP_OWN_IPS="$stub/own.txt"
  S="2026-11-19T14:00:00Z"; U="2026-11-19T15:00:00Z"
  T0=1795096800; T1=1795100400   # S and U as unix seconds
  wallet="0x$(printf 'cd%.0s' {1..20})"
  moz="Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0"
  chat="/v1/chat/completions"

  line() { # ts ip method uri status agent: one Caddy JSON access line
    printf '{"ts": %s, "status": %s, "request": {"client_ip": "%s", "remote_ip": "%s", "method": "%s", "uri": "%s", "headers": {"User-Agent": ["%s"], "Referer": [""]}}}\n' \
      "$1" "$5" "$2" "$2" "$3" "$4" "$6"
  }
  cv() { echo "CARD VISITS since ${3:-$S} until ${4:-$U}: $1 by people, $2 by bots, $5 from own addresses"; }
  card() { cv "$1" "$2" "$S" "$U" "$3"; }
  m402() { echo "MAINTAINED 402 since $S until $U: $1 answers 402 on $chat to automaton-maintained runtimes"; }
  ver() { echo "MAINTAINED 402 VERSION automaton-maintained/$1: $2"; }

  fail=0
  # Never echo the planted lines or a want/got pair with addresses: on a mismatch the output of the
  # counter goes to stderr with every address-looking string masked.
  want() { # actual, expected, reason
    if [[ "$1" == "$2" ]]; then echo "ok $3"; else
      echo "FAIL $3"
      sed -E 's/([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}|address=[^ ]*/<masked>/g; s/^/     got: /' <<<"$1" >&2
      fail=1
    fi
  }
  plant() { cat >"$stub/case.log"; }                     # the lines of one case, from stdin
  run() { count "$stub/case.log" "${1:-$S}" "${2:-$U}" 2>/dev/null; }   # [since] [until]

  plant <<<"$(line $((T0 + 60)) 203.0.113.10 GET "/card/5?address=$wallet" 200 "$moz")"
  want "$(run | sed -n 1p)" "$(card 1 0 0)" "a person on a card page with the wallet query is counted as a person"
  plant <<<"$(line $((T0 + 60)) 203.0.113.10 HEAD /card/7 200 "$moz")"
  want "$(run | sed -n 1p)" "$(card 1 0 0)" "HEAD on a card page is counted like GET"
  plant <<<"$(line $((T0 + 60)) 198.51.100.20 GET /card/5 200 "Mozilla/5.0 (compatible; Googlebot/2.1)")"
  want "$(run | sed -n 1p)" "$(card 0 1 0)" "a bot User-Agent is counted as a bot, not as a person"
  plant <<<"$(line $((T0 + 60)) 198.51.100.21 GET /card/5 200 "Some-CRAWLER/1.0"
    line $((T0 + 61)) 198.51.100.22 GET /card/5 200 "spider-x"
    line $((T0 + 62)) 198.51.100.23 GET /card/5 200 "node-Fetch/3")"
  want "$(run | sed -n 1p)" "$(card 0 3 0)" "crawl, spider and fetch in any case are bots"
  plant <<<"$(line $((T0 + 60)) 198.51.100.24 GET "/card/5?address=$wallet" 200 "")"
  want "$(run | sed -n 1p)" "$(card 0 1 0)" "an empty User-Agent is counted as a bot, not as a person"

  plant <<<"$(line $((T0 + 60)) "$own_ip" GET "/card/5?address=$wallet" 200 "$moz")"
  want "$(run | sed -n 1p)" "$(card 0 0 1)" "our own address is counted as own, not as foreign"
  want "$(CP_OWN_IPS="$stub/other.txt" run | sed -n 1p)" "$(card 1 0 0)" \
    "without its own list entry the same address counts as a person, so the filter is what keeps it out"

  plant <<<"$(line $((T0 + 60)) 203.0.113.11 GET /cards 200 "$moz"
    line $((T0 + 61)) 203.0.113.11 GET /card.json 200 "$moz"
    line $((T0 + 62)) 203.0.113.11 GET /card 200 "$moz"
    line $((T0 + 63)) 203.0.113.11 GET /cardx/5 200 "$moz")"
  want "$(run | sed -n 1p)" "$(card 0 0 0)" "the paths /cards, /card.json, /card and /cardx/ are no card pages"
  plant <<<"$(line $((T0 + 60)) 203.0.113.12 POST /card/5 200 "$moz")"
  want "$(run | sed -n 1p)" "$(card 0 0 0)" "POST on a card page is no visit"

  plant <<<"$(line $((T0 - 1)) 203.0.113.13 GET /card/5 200 "$moz"
    line "$T1" 203.0.113.14 GET /card/5 200 "$moz"
    line "$T0" 203.0.113.15 GET /card/5 200 "$moz")"
  want "$(run | sed -n 1p)" "$(card 1 0 0)" \
    "a line one second before --since and one exactly at --until are not counted, one exactly at --since is"
  early="2026-11-19T13:59:59Z"; late="2026-11-19T15:00:01Z"
  want "$(run "$early" | sed -n 1p)" "$(cv 2 0 "$early" "$U" 0)" "moving --since back by one second takes the early line in"
  want "$(run "$S" "$late" | sed -n 1p)" "$(cv 2 0 "$S" "$late" 0)" "moving --until on by one second takes the line at --until in"

  plant <<<"$(line $((T0 + 60)) 203.0.113.20 POST "$chat" 402 "node")"
  want "$(run)" "$(card 0 0 0; m402 0)" "a 402 to another runtime (User-Agent node) is not counted for the package, and no version line"
  plant <<<"$(line $((T0 + 60)) 203.0.113.20 POST "$chat" 402 "automaton-maintained/0.2.1")"
  want "$(run)" "$(card 0 0 0; m402 1; ver 0.2.1 1)" "the same 402 to automaton-maintained is counted, so the agent rule is what keeps node out"
  plant <<<"$(line $((T0 + 60)) 203.0.113.21 POST "$chat" 402 "automaton-maintained/0.2.10"
    line $((T0 + 61)) 203.0.113.22 POST "$chat?stream=1" 402 "automaton-maintained/0.2.2 (linux; node 22)"
    line $((T0 + 62)) 203.0.113.23 POST "$chat" 402 "automaton-maintained/0.2.10")"
  want "$(run)" "$(card 0 0 0; m402 3; ver 0.2.2 1; ver 0.2.10 2)" \
    "two versions are counted separately, in natural order, the query does not change the path"
  plant <<<"$(line $((T0 + 60)) 203.0.113.24 POST "$chat" 200 "automaton-maintained/0.2.1"
    line $((T0 + 61)) 203.0.113.24 GET "$chat" 402 "automaton-maintained/0.2.1"
    line $((T0 + 62)) "$own_ip" POST "$chat" 402 "automaton-maintained/0.2.1")"
  want "$(run | sed -n 2p)" "$(m402 0)" "a 200, a GET and a 402 to our own address are not counted for the package"
  want "$(CP_OWN_IPS="$stub/other.txt" run | sed -n 2p)" "$(m402 1)" \
    "without its own list entry the 402 to our own address counts, so the filter is what keeps it out"
  plant <<<"$(line $((T0 + 60)) 203.0.113.25 POST "$chat" 402 "automaton-maintained/1.2.3.4"
    line $((T0 + 61)) 203.0.113.26 POST "$chat" 402 "automaton-maintained/$wallet")"
  want "$(run | sed -n 3p)" "$(ver other 2)" "a version token that reads like an address or a wallet is printed as other"

  # Everything at once: the exact output, and not a single address, wallet or query in it.
  plant <<<"$(line "$T0" 203.0.113.10 GET "/card/5?address=$wallet" 402 "$moz"
    line $((T0 + 1)) 203.0.113.11 HEAD /card/7 200 "$moz"
    line $((T0 + 2)) 198.51.100.20 GET /card/5 200 "Googlebot/2.1"
    line $((T0 + 3)) 198.51.100.21 GET "/card/5?address=$wallet" 200 ""
    line $((T0 + 4)) "$own_ip" GET "/card/5?address=$wallet" 200 "$moz"
    line $((T0 + 5)) 203.0.113.12 GET /cards 200 "$moz"
    line $((T0 - 1)) 203.0.113.13 GET /card/5 200 "$moz"
    line "$T1" 203.0.113.14 GET /card/5 200 "$moz"
    line $((T0 + 6)) 203.0.113.20 POST "$chat" 402 "node"
    line $((T0 + 7)) 203.0.113.21 POST "$chat" 402 "automaton-maintained/0.2.10"
    line $((T0 + 8)) 203.0.113.22 POST "$chat" 402 "automaton-maintained/0.2.2"
    line $((T0 + 9)) "$own_ip" POST "$chat" 402 "automaton-maintained/0.2.2")"
  out=$(run); rc=$?
  want "$rc" "0" "a readable log and own list exit 0"
  want "$out" "$(card 2 2 1; m402 2; ver 0.2.2 1; ver 0.2.10 1)" "all cases in one log give exactly the expected three kinds of lines"
  leak=$(grep -ciE '([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}|address=|\?' <<<"$out")
  want "$leak" "0" "no address, no wallet and no query in the output"

  count "$stub/no-such-file.log" "$S" "$U" >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an unreadable log exits 2"
  CP_OWN_IPS="$stub/no-such-list.txt" run >/dev/null; rc=$?
  want "$rc" "2" "a missing own list exits 2"
  CP_OWN_IPS="$stub/empty.txt" run >/dev/null; rc=$?
  want "$rc" "2" "an own list that names no address exits 2"
  bash "$SELF" --log "$stub/case.log" --since yesterday --until "$U" >/dev/null 2>&1; rc=$?
  want "$rc" "1" "a time that is not strict ISO UTC exits 1"
  bash "$SELF" --log "$stub/case.log" --since "$U" --until "$S" >/dev/null 2>&1; rc=$?
  want "$rc" "1" "--since after --until exits 1"
  bash "$SELF" --log "$stub/case.log" --since "$S" >/dev/null 2>&1; rc=$?
  want "$rc" "1" "a missing --until exits 1"

  if [[ "$fail" -eq 0 ]]; then
    echo "SELFTEST OK: every planted case counted or left out as planted, in both directions"
  else echo "SELFTEST FAILED"; fi
  exit "$fail"
fi

LOG=""; SINCE=""; UNTIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --log) [[ $# -ge 2 ]] || usage; LOG="$2"; shift 2 ;;
    --since) [[ $# -ge 2 ]] || usage; SINCE="$2"; shift 2 ;;
    --until) [[ $# -ge 2 ]] || usage; UNTIL="$2"; shift 2 ;;
    *) echo "card-visits: unknown argument $1" >&2; usage ;;
  esac
done
[[ -n "$SINCE" && -n "$UNTIL" ]] || usage
# The window is checked before anything is read, so a wrong time is exit 1 and never an ssh call.
python3 -B "$PY" window "$SINCE" "$UNTIL" || exit 1

if [[ -n "$LOG" ]]; then
  count "$LOG" "$SINCE" "$UNTIL"
  exit $?
fi

# Production needs host and key. Like ops/github-yield.sh the script reads loop.env itself when the
# environment has none. Sourced in a subshell: only these two values come out, the other secrets in
# that file never reach ssh or python.
env_file="$HOME/.config/control-plane/loop.env"
if [[ ( -z "${CP_HOST:-}" || -z "${CP_SSH_KEY:-}" ) && -f "$env_file" ]]; then
  # shellcheck disable=SC1090
  from_env=$( set -a; . "$env_file" >/dev/null 2>&1; printf '%s\n%s\n' "${CP_HOST:-}" "${CP_SSH_KEY:-}" )
  env_host=$(sed -n 1p <<<"$from_env"); env_key=$(sed -n 2p <<<"$from_env")
  [[ -n "${CP_HOST:-}" || -z "$env_host" ]] || HOST="$env_host"
  [[ -n "${CP_SSH_KEY:-}" || -z "$env_key" ]] || KEY="$env_key"
fi

dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
CP_SSH_KEY="$KEY" CP_HOST="$HOST" bash "$ROOT/ops/access-log.sh" >"$dir/access.jsonl" || {
  echo "card-visits: the access log could not be read. This says nothing about traffic." >&2
  exit 2
}
# own_ips asks the same host with the same key for the live address, like ops/access-log.sh above.
CP_SSH_KEY="$KEY" CP_HOST="$HOST" count "$dir/access.jsonl" "$SINCE" "$UNTIL"
