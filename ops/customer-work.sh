#!/usr/bin/env bash
# What a customer did on the way from a bounty to credit (kunden 08). Reads only, names no address.
#
#   ops/customer-work.sh --since <ISO UTC> [--until <ISO UTC>] [--customer <n>] [--numbered-from <ISO UTC>]
#                                    production: the database through ops/db-report.cjs with
#                                    CP_REPORT=customer-work (readonly: true, in the container cp) and
#                                    the whole Caddy access log (ops/access-log.sh)
#   ops/customer-work.sh --db-json <file> --log <file> --since <ISO UTC> [--until <ISO UTC>] [--customer <n>]
#                                    the same count from files; either flag alone replaces its source
#   ops/customer-work.sh --selftest  no network, both directions
#   own addresses: own_ips from ops/own-ips.sh (CP_OWN_IPS=<file> replaces its list)
#
# The customer is customer <n> (default 1) of ops/customer-decline.sh: foreign wallets numbered by their
# first inference row from --numbered-from (default 2026-11-05T00:00:00Z, the window of kunden 01). Its
# wallet stays inside the container; its addresses in the access log come from matching its inference
# rows to log lines, the rule in ops/customer_match.py. Our own addresses are never matched or counted.
#
#   WORK since <t> until <u>: customer <n>
#   MATCH: ips <m>, <x> of <k> inference rows without a log line within 5 s
#   DAY <YYYY-MM-DD>: <r> board reads, <s> submit calls, <a> submissions stored, <o> open bounties (<q> ours)
#   SUBMIT STATUS <code>: <n>            each status of POST /v1/submissions in the window
#   AWARD CALLS: <n> calls to POST /v1/bounties/award
#   AWARDS: <w> awarded to the customer, <i> inference rows after the first award
#
# board reads are GET /bounties.json and GET /v1/bounties; open bounties are not the customer's own,
# `ours` counts those that oursClause calls ours. No address, amount, id or brief is printed.
# Exit 1 on a wrong argument, a time that is no ISO time in UTC, or --until not after --since.
# Exit 2 when the own list is missing or empty, the log or the JSON cannot be read, or the customer is unknown.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=ops/conway-arrivals.sh
source "$ROOT/ops/conway-arrivals.sh"

NUMBERED_FROM_DEFAULT=2026-11-05T00:00:00Z

usage() { sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 1; }

# The counting, the same code for production, files and selftest. No address leaves this block.
# shellcheck disable=SC2016
COUNT_PY='
import collections, datetime, json, os, re, sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.environ["CONWAY_ARRIVALS_DIR"])
import conway_arrivals as ca
import customer_match as cm

ISO = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z")
BOARD = {("GET", "/bounties.json"), ("GET", "/v1/bounties")}
SUBMIT = ("POST", "/v1/submissions")
AWARD = ("POST", "/v1/bounties/award")

def fail(msg, code=2):
    print(f"customer-work: {msg}", file=sys.stderr)
    raise SystemExit(code)

def parse(name, value):
    if not ISO.fullmatch(value):
        fail(f"{name} is no ISO time in UTC: {value}", 1)
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        fail(f"{name} is no ISO time in UTC: {value}", 1)

def iso(t):
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def day(t):
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%d")

mode = sys.argv[1]
if mode == "times":
    # since, until (empty: now), numbered-from, customer -> four lines, or exit 1
    since = parse("--since", sys.argv[2])
    until = parse("--until", sys.argv[3]) if sys.argv[3] else float(int(datetime.datetime.now(datetime.timezone.utc).timestamp()))
    numbered = parse("--numbered-from", sys.argv[4])
    if until <= since:
        fail("--until is not after --since", 1)
    if numbered >= until:
        fail("--numbered-from is not before --until", 1)
    if not re.fullmatch(r"[1-9][0-9]{0,3}", sys.argv[5]):
        fail(f"--customer is no number from 1: {sys.argv[5]}", 1)
    print(iso(since)); print(iso(until)); print(iso(numbered)); print(sys.argv[5])
    raise SystemExit(0)

db_file, log_file, own_file, since_arg, until_arg, n = sys.argv[2:8]
since, until = parse("--since", since_arg), parse("--until", until_arg)
if until <= since:
    fail("--until is not after --since", 1)
if own_file == "-":
    fail("the list of our own addresses is missing or names none, so nothing is counted.")
try:
    own = ca.own_addresses(own_file)
except ca.Unreadable as e:
    fail(f"{e}, so nothing is counted.")
try:
    log, _ = ca.read_log(log_file)
except ca.Unreadable:
    fail("the access log is not readable. This says nothing about the customer.")
try:
    with open(db_file, encoding="utf-8") as f:
        data = json.load(f)
    found = data["found"]
    times = [datetime.datetime.fromisoformat(str(t).replace("Z", "+00:00")).timestamp() for t in data["inference_at"]]
    days_in = {d["day"]: d for d in data["days"]}
    for d in days_in.values():
        for k in ("submissions", "open", "ours", "awards", "inference_after_award"):
            assert isinstance(d[k], int)
except Exception:
    fail("the database JSON is not readable. This says nothing about the customer.")
if found is not True:
    fail(f"customer {n} has no inference row in the numbered window, so there is nobody to count.")

ips, unmatched = cm.match_rows(times, cm.ok_lines(cm.inference_lines(log, own)))

days = []
t = datetime.datetime.fromtimestamp(since, datetime.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
while t.timestamp() < until:
    days.append(t.strftime("%Y-%m-%d"))
    t += datetime.timedelta(days=1)
if set(days) != set(days_in):
    fail("the database JSON covers other days than the window. This says nothing about the customer.")

mine = [l for l in log if l.ip in ips and l.ip not in own and since <= l.ts < until]
print(f"WORK since {iso(since)} until {iso(until)}: customer {n}")
print(f"MATCH: ips {len(ips)}, {unmatched} of {len(times)} inference rows without a log line within 5 s")
for d in days:
    dl = [l for l in mine if day(l.ts) == d]
    reads = sum(1 for l in dl if (l.method, l.path) in BOARD)
    submits = sum(1 for l in dl if (l.method, l.path) == SUBMIT)
    stored, open_n, ours_n = (days_in[d][k] for k in ("submissions", "open", "ours"))
    print(f"DAY {d}: {reads} board reads, {submits} submit calls, {stored} submissions stored, "
          f"{open_n} open bounties ({ours_n} ours)")
status = collections.Counter(str(l.status) for l in mine if (l.method, l.path) == SUBMIT)
for code in sorted(status):
    print(f"SUBMIT STATUS {code}: {status[code]}")
print(f"AWARD CALLS: {sum(1 for l in mine if (l.method, l.path) == AWARD)} calls to POST /v1/bounties/award")
awards = sum(x["awards"] for x in days_in.values())
after = sum(x["inference_after_award"] for x in days_in.values())
print(f"AWARDS: {awards} awarded to the customer, {after} inference rows after the first award")
'

py() { CONWAY_ARRIVALS_DIR="$ROOT/ops" python3 -c "$COUNT_PY" "$@"; }

# Our own addresses into <file>, one per line, or return 2. From a file of the log (offline) the list,
# CP_OWN_IPS and the seen file; in production also the address this machine is seen with live.
own_list() { # out offline(0|1)
  local out="$1" file="${CP_OWN_IPS:-$CP_OWN_IPS_FILE}" list
  if [[ "$2" == "1" ]]; then
    [[ -f "$file" ]] || return 2
    list=$(CP_OWN_IPS="" CP_OWN_IPS_FILE="$file" own_ips_offline 2>/dev/null) || return 2
    [[ -n "${list// /}" ]] || return 2
    printf '%s\n' "$list" | tr ' ' '\n' | grep -v '^$' >"$out"
  else
    conway_own_list "$out" 2>/dev/null
  fi
}

count() { # db-json log since until customer offline(0|1)
  local own rc ownarg
  own=$(mktemp)
  ownarg="$own"
  own_list "$own" "$6" || ownarg="-"
  py count "$1" "$2" "$ownarg" "$3" "$4" "$5"
  rc=$?
  rm -f "$own"
  return "$rc"
}

# The database part on a local database file: the same script and branch the container runs.
report_local() { # db since until customer numbered-from -> JSON on stdout
  (cd "$ROOT" && CP_DB_PATH="$1" CP_REPORT=customer-work CP_SINCE="$2" CP_UNTIL="$3" CP_CUSTOMER="$4" \
    CP_CUSTOMER_SINCE="$5" CP_CUSTOMER_ADDRESSES="" node - <"$ROOT/ops/db-report.cjs")
}

if [[ "${1:-}" == "--selftest" ]]; then
  [[ $# -eq 1 ]] || usage
  # No network and nothing of this machine: a fake ssh answers nothing, the seen file is a temp file.
  stub=$(mktemp -d); trap 'rm -rf "$stub"' EXIT
  printf '#!/bin/sh\nexit 255\n' >"$stub/ssh"
  chmod +x "$stub/ssh"
  export PATH="$stub:$PATH" CP_OWN_IPS_SEEN="$stub/seen.txt"
  unset CP_OWN_IPS_WRITE
  fx="$ROOT/ops/fixtures"
  log="$fx/customer-work.log"; plant="$fx/customer-work-plant.mts"
  export CP_OWN_IPS="$fx/customer-work-own-ips.txt"
  [[ -f "$log" && -f "$plant" && -f "$CP_OWN_IPS" ]] || { echo "SELFTEST FAILED: fixture missing in $fx"; exit 1; }
  S=2026-11-13T00:00:00Z; U=2026-11-16T00:00:00Z; F=$NUMBERED_FROM_DEFAULT
  fail=0
  want() { # actual, expected, reason
    if [[ "$1" == "$2" ]]; then echo "ok   $3"; else echo "FAIL $3"; echo "     want: $2"; echo "     got:  $1"; fail=1; fi
  }
  line() { grep -E "$1" <<<"$2" | head -1; }
  plant_db() { # file variant
    (cd "$ROOT" && node --import tsx "$plant" "$1" "$2") >/dev/null 2>&1
  }
  if ! plant_db "$stub/plain.db" plain || ! plant_db "$stub/foreign.db" foreign-operator; then
    echo "SELFTEST FAILED: the planted database could not be built (node, tsx, better-sqlite3)"; exit 1
  fi
  report_local "$stub/plain.db" "$S" "$U" 1 "$F" >"$stub/c1.json"
  report_local "$stub/plain.db" "$S" "$U" 2 "$F" >"$stub/c2.json"
  report_local "$stub/foreign.db" "$S" "$U" 1 "$F" >"$stub/c1-foreign.json"
  report_local "$stub/plain.db" "$S" "$U" 3 "$F" >"$stub/c3.json"

  out=$(count "$stub/c1.json" "$log" "$S" "$U" 1 1); rc=$?
  want "$rc" "0" "the planted window exits 0"
  want "$(sed -n 1p <<<"$out")" "WORK since $S until $U: customer 1" "customer 1 of the decline numbering, our earlier inference never numbered"
  want "$(line '^MATCH:' "$out")" "MATCH: ips 1, 0 of 4 inference rows without a log line within 5 s" \
    "ours: our own address, nearer to the first row, is never matched, so the customer has one address"
  want "$(line '^DAY 2026-11-13:' "$out")" "DAY 2026-11-13: 4 board reads, 0 submit calls, 0 submissions stored, 2 open bounties (1 ours)" \
    "open: a bounty past its deadline and our cancelled one were open, the one closed the day before and the customer's own are not; ours: our reads of the board are not the customer's"
  want "$(line '^DAY 2026-11-14:' "$out")" "DAY 2026-11-14: 1 board reads, 2 submit calls, 1 submissions stored, 2 open bounties (0 ours)" \
    "submit: two calls to submit, one stored; open: the bounty awarded that day counts"
  want "$(line '^DAY 2026-11-15:' "$out")" "DAY 2026-11-15: 0 board reads, 0 submit calls, 0 submissions stored, 0 open bounties (0 ours)" \
    "open: past the deadline and after the award nothing is open"
  want "$(grep -E '^SUBMIT STATUS' <<<"$out" | tr '\n' '|')" "SUBMIT STATUS 201: 1|SUBMIT STATUS 409: 1|" \
    "submit: each status of the customer's calls to submit, nobody else's"
  want "$(line '^AWARD CALLS:' "$out")" "AWARD CALLS: 1 calls to POST /v1/bounties/award" "award: the customer's call to award is counted"
  want "$(line '^AWARDS:' "$out")" "AWARDS: 1 awarded to the customer, 1 inference rows after the first award" \
    "award: one award to the customer, its inference before the award is not counted after it"
  want "$(tail -1 <<<"$out" | cut -c1-7)" "AWARDS:" "AWARDS is the last line"
  want "$(grep -cE '([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}' <<<"$out")" "0" "no address and no wallet in the output"

  # The other direction for each count.
  other="$stub/other-own.txt"
  echo "192.0.2.254 2026-11-21  not in the fixture" >"$other"
  out2=$(CP_OWN_IPS="$other" count "$stub/c1.json" "$log" "$S" "$U" 1 1)
  want "$(line '^MATCH:' "$out2")" "MATCH: ips 2, 0 of 4 inference rows without a log line within 5 s" \
    "ours counter-proof: off the list, our own address is the nearest line and joins the customer"
  want "$(line '^DAY 2026-11-13:' "$out2" | cut -d, -f1)" "DAY 2026-11-13: 6 board reads" \
    "ours counter-proof: off the list, our two reads of the board count for the customer"
  out3=$(count "$stub/c1-foreign.json" "$log" "$S" "$U" 1 1)
  want "$(line '^DAY 2026-11-13:' "$out3" | sed 's/.*submissions stored, //')" "2 open bounties (0 ours)" \
    "ours counter-proof: the same bounty from a foreign wallet is not ours"
  out4=$(count "$stub/c2.json" "$log" "$S" "$U" 2 1)
  want "$(line '^DAY 2026-11-13:' "$out4")" "DAY 2026-11-13: 1 board reads, 1 submit calls, 1 submissions stored, 3 open bounties (1 ours)" \
    "submit counter-proof: the other customer's submission is its own; open counter-proof: the first customer's bounty is open for it"
  want "$(line '^DAY 2026-11-15:' "$out4" | sed 's/.*submissions stored, //')" "1 open bounties (0 ours)" \
    "open counter-proof: a bounty without deadline or close stays open"
  want "$(line '^AWARDS:' "$out4")" "AWARDS: 1 awarded to the customer, 1 inference rows after the first award" \
    "award counter-proof: the other wallet's award counts for it and not for customer 1"
  grep -v '"status": 200' "$log" >"$stub/no-200.log"
  out5=$(count "$stub/c1.json" "$stub/no-200.log" "$S" "$U" 1 1)
  want "$(line '^DAY 2026-11-14:' "$out5" | cut -d, -f1-2)" "DAY 2026-11-14: 0 board reads, 0 submit calls" \
    "submit counter-proof: without its 200 lines the customer has no address, so no call is its"
  want "$(line '^MATCH:' "$out5")" "MATCH: ips 0, 4 of 4 inference rows without a log line within 5 s" \
    "match counter-proof: without the 200 lines every row is unmatched"

  count "$stub/c3.json" "$log" "$S" "$U" 3 1 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "a customer number nobody has exits 2"
  count "$stub/c1.json" "$fx/no-such.log" "$S" "$U" 1 1 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an unreadable log exits 2"
  echo "{" >"$stub/broken.json"
  count "$stub/broken.json" "$log" "$S" "$U" 1 1 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an unreadable database JSON exits 2"
  CP_OWN_IPS="$fx/no-such-list.txt" count "$stub/c1.json" "$log" "$S" "$U" 1 1 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "a missing own list exits 2"
  py times "2026-11-13" "$U" "$F" 1 >/dev/null 2>&1; rc=$?
  want "$rc" "1" "a time without clock and zone exits 1"
  py times "$S" "$S" "$F" 1 >/dev/null 2>&1; rc=$?
  want "$rc" "1" "--until not after --since exits 1"
  if [[ "$fail" -eq 0 ]]; then
    echo "SELFTEST OK planted customer, its submissions, the open bounties, ours and its awards counted, both directions"
  else echo "SELFTEST FAILED"; fi
  exit "$fail"
fi

DB=""; LOG=""; SINCE=""; UNTIL=""; CUSTOMER=1; NUMBERED_FROM=$NUMBERED_FROM_DEFAULT
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-json) [[ $# -ge 2 ]] || usage; DB="$2"; shift 2 ;;
    --log) [[ $# -ge 2 ]] || usage; LOG="$2"; shift 2 ;;
    --since) [[ $# -ge 2 ]] || usage; SINCE="$2"; shift 2 ;;
    --until) [[ $# -ge 2 ]] || usage; UNTIL="$2"; shift 2 ;;
    --customer) [[ $# -ge 2 ]] || usage; CUSTOMER="$2"; shift 2 ;;
    --numbered-from) [[ $# -ge 2 ]] || usage; NUMBERED_FROM="$2"; shift 2 ;;
    *) echo "customer-work: unknown argument $1" >&2; usage ;;
  esac
done
[[ -n "$SINCE" ]] || usage
win=$(py times "$SINCE" "$UNTIL" "$NUMBERED_FROM" "$CUSTOMER") || exit 1
SINCE=$(sed -n 1p <<<"$win"); UNTIL=$(sed -n 2p <<<"$win"); NUMBERED_FROM=$(sed -n 3p <<<"$win")

if [[ -n "$DB" && -n "$LOG" ]]; then
  count "$DB" "$LOG" "$SINCE" "$UNTIL" "$CUSTOMER" 1
  exit $?
fi

# Production needs hosts and keys. Like ops/customer-decline.sh the script reads loop.env itself when the
# environment has none, in a subshell: only these four values come out, no other secret of that file.
env_file="$HOME/.config/control-plane/loop.env"
if [[ -f "$env_file" ]]; then
  # shellcheck disable=SC1090
  from_env=$( set -a; . "$env_file" >/dev/null 2>&1
    printf '%s\n%s\n%s\n%s\n' "${CP_HOST:-}" "${CP_SSH_KEY:-}" "${CP_DEPLOY_HOST:-}" "${CP_DEPLOY_KEY:-}" )
  [[ -n "${CP_HOST:-}" ]] || CP_HOST=$(sed -n 1p <<<"$from_env")
  [[ -n "${CP_SSH_KEY:-}" ]] || CP_SSH_KEY=$(sed -n 2p <<<"$from_env")
  [[ -n "${CP_DEPLOY_HOST:-}" ]] || CP_DEPLOY_HOST=$(sed -n 3p <<<"$from_env")
  [[ -n "${CP_DEPLOY_KEY:-}" ]] || CP_DEPLOY_KEY=$(sed -n 4p <<<"$from_env")
fi
HOST="${CP_HOST:-root@76.13.144.207}"; KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
DHOST="${CP_DEPLOY_HOST:-$HOST}"; DKEY="${CP_DEPLOY_KEY:-$KEY}"

dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
if [[ -z "$LOG" ]]; then
  LOG="$dir/access.jsonl"
  CP_SSH_KEY="$KEY" CP_HOST="$HOST" bash "$ROOT/ops/access-log.sh" >"$LOG" || {
    echo "customer-work: the access log could not be read. This says nothing about the customer." >&2
    exit 2
  }
  offline=0
else
  offline=1
fi
if [[ -z "$DB" ]]; then
  # readonly: true in ops/db-report.cjs; the wallet of the customer is chosen inside the container.
  DB="$dir/work.json"
  if ! timeout 120 ssh -i "$DKEY" -o BatchMode=yes -o ConnectTimeout=10 "$DHOST" \
    "docker exec -i -e CP_REPORT=customer-work -e CP_SINCE=$SINCE -e CP_UNTIL=$UNTIL -e CP_CUSTOMER=$CUSTOMER -e CP_CUSTOMER_SINCE=$NUMBERED_FROM deploy-cp-1 node -" \
    <"$ROOT/ops/db-report.cjs" >"$DB" 2>/dev/null; then
    echo "x" >"$DB"   # unparsable on purpose: the count says the JSON is not readable and exits 2
  fi
fi
CP_SSH_KEY="$KEY" CP_HOST="$HOST" count "$DB" "$LOG" "$SINCE" "$UNTIL" "$CUSTOMER" "$offline"
