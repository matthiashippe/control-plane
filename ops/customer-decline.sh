#!/usr/bin/env bash
# Why a paying foreign automaton stops (kunden 01). Reads only, names no address.
#
#   ops/customer-decline.sh --since <ISO UTC> [--until <ISO UTC>]   production: the ledger through
#                                    ops/db-report.cjs with CP_REPORT=decline (readonly: true, in the
#                                    container cp) and the whole Caddy access log (ops/access-log.sh)
#   ops/customer-decline.sh --db-json <file> --log <file> --since <ISO UTC> [--until <ISO UTC>]
#                                    the same count from files; either flag alone replaces its source
#   ops/customer-decline.sh --selftest                              no network, both directions
#   own addresses: own_ips from ops/own-ips.sh (CP_OWN_IPS=<file> replaces its list)
#
# A customer is a foreign address with at least one `inference` ledger row in the window, numbered from
# 1 in the order of its first such row. Each of its rows is matched to the access log line on the
# inference path (POST /v1/chat/completions or POST /v1/check, path without query) with status 200 from
# a foreign address whose ts lies nearest to the row, at most 5 s away; every address matched that way
# belongs to the customer. Our own addresses are never matched and never counted.
#
#   DECLINE since <t> until <u>: <k> foreign customers with inference
#   CUSTOMER <n>: first <ISO>, last <ISO>, balance <usd> USD, last topup <ISO|never>, ips <m>
#   DAY <n> <YYYY-MM-DD>: <c> calls, <usd> USD, models <model>:<count>[,...]|-, http 2xx <a> 402 <b> 4xx <c> 5xx <d>
#   OTHER <YYYY-MM-DD>: http 2xx <a> 402 <b> 4xx <c> 5xx <d>      foreign addresses of no customer
#   ABORTS <YYYY-MM-DD>: <a> aborted, <b> answered after, <usd> USD bought
#   UNMATCHED: <x> inference rows without a log line within 5 s
#   WEEK: <usd> USD foreign inference in the 7 days before <u>
#
# Exit 1 on a wrong argument, a time that is no ISO time in UTC, or --until not after --since.
# Exit 2 when the own list is missing or empty, or the log or the JSON cannot be read.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=ops/conway-arrivals.sh
source "$ROOT/ops/conway-arrivals.sh"

usage() { sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 1; }

# The counting, the same code for production, files and selftest. No address leaves this block.
# shellcheck disable=SC2016
COUNT_PY='
import collections, datetime, json, os, re, sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.environ["CONWAY_ARRIVALS_DIR"])
import conway_arrivals as ca
import customer_match as cm

ISO = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z")

def fail(msg, code=2):
    print(f"customer-decline: {msg}", file=sys.stderr)
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

def usd(mc):
    mc = int(mc)
    cents = (abs(mc) + 500) // 1000
    sign = "-" if mc < 0 else ""
    return f"{sign}{cents // 100}.{cents % 100:02d}"

mode = sys.argv[1]
if mode == "times":
    # since, until (empty: now) -> the window as two lines, or exit 1
    since = parse("--since", sys.argv[2])
    until = parse("--until", sys.argv[3]) if sys.argv[3] else float(int(datetime.datetime.now(datetime.timezone.utc).timestamp()))
    if until <= since:
        fail("--until is not after --since", 1)
    print(iso(since)); print(iso(until)); print(iso(min(since, until - 7 * 86400)))
    raise SystemExit(0)

db_file, log_file, own_file, since_arg, until_arg = sys.argv[2:7]
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
    fail("the access log is not readable. This says nothing about customers.")
try:
    with open(db_file, encoding="utf-8") as f:
        data = json.load(f)
    customers_in = data["customers"]
    aborts_in = data.get("aborts") or []
    assert isinstance(customers_in, list) and isinstance(aborts_in, list)
    for c in customers_in:
        for r in c["rows"]:
            r["t"] = datetime.datetime.fromisoformat(str(r["at"]).replace("Z", "+00:00")).timestamp()
    for a in aborts_in:
        a["t"] = datetime.datetime.fromisoformat(str(a["at"]).replace("Z", "+00:00")).timestamp()
except Exception:
    fail("the ledger JSON is not readable. This says nothing about customers.")

def in_window(t):
    return since <= t < until

# Inference lines from foreign addresses; our own never enter, not even as a candidate for a match.
foreign = cm.inference_lines(log, own)
ok_lines = cm.ok_lines(foreign)

# Customers of the window, numbered again here: the JSON may reach back further for WEEK.
customers = []
for c in customers_in:
    rows = [r for r in c["rows"] if in_window(r["t"])]
    if rows:
        customers.append((min(r["t"] for r in rows), int(c.get("n") or 0), c, rows))
customers.sort(key=lambda x: (x[0], x[1]))

unmatched = 0
owner = collections.defaultdict(set)   # address -> customer numbers; never printed
ips = {}
for n, (_, _, c, rows) in enumerate(customers, 1):
    mine, missed = cm.match_rows([r["t"] for r in rows], ok_lines)
    unmatched += missed
    ips[n] = mine
    for ip in mine:
        owner[ip].add(n)

days = []
t = datetime.datetime.fromtimestamp(since, datetime.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
while t.timestamp() < until:
    days.append(t.strftime("%Y-%m-%d"))
    t += datetime.timedelta(days=1)

def http(lines):
    a = b = c = d = 0
    for l in lines:
        s = l.status if isinstance(l.status, int) else -1
        if 200 <= s < 300: a += 1
        elif s == 402: b += 1
        elif 400 <= s < 500: c += 1
        elif 500 <= s < 600: d += 1
    return f"http 2xx {a} 402 {b} 4xx {c} 5xx {d}"

window_lines = [l for l in foreign if in_window(l.ts)]
print(f"DECLINE since {iso(since)} until {iso(until)}: {len(customers)} foreign customers with inference")
for n, (_, _, c, rows) in enumerate(customers, 1):
    last_topup = c.get("last_topup")
    lt = "never"
    if last_topup:
        lt = iso(datetime.datetime.fromisoformat(str(last_topup).replace("Z", "+00:00")).timestamp())
    times = [r["t"] for r in rows]
    balance = usd(c.get("balance_mc") or 0)
    print(f"CUSTOMER {n}: first {iso(min(times))}, last {iso(max(times))}, balance {balance} USD, last topup {lt}, ips {len(ips[n])}")
    for d in days:
        dr = [r for r in rows if day(r["t"]) == d]
        models = collections.Counter(str(r.get("model") or "unknown") for r in dr)
        m = ",".join(f"{k}:{v}" for k, v in sorted(models.items(), key=lambda kv: (-kv[1], kv[0]))) or "-"
        dl = [l for l in window_lines if l.ip in ips[n] and day(l.ts) == d]
        spent = usd(sum(int(r["charged_mc"]) for r in dr))
        print(f"DAY {n} {d}: {len(dr)} calls, {spent} USD, models {m}, {http(dl)}")
for d in days:
    print(f"OTHER {d}: {http([l for l in window_lines if l.ip not in owner and day(l.ts) == d])}")
for d in days:
    da = [a for a in aborts_in if in_window(a["t"]) and day(a["t"]) == d]
    if da:
        answered = sum(1 for a in da if a.get("answered"))
        bought = sum(int(a.get("purchase_mc") or 0) for a in da)
        print(f"ABORTS {d}: {len(da)} aborted, {answered} answered after, {usd(bought)} USD bought")
print(f"UNMATCHED: {unmatched} inference rows without a log line within 5 s")
week = sum(int(r["charged_mc"]) for c in customers_in for r in c["rows"] if until - 7 * 86400 <= r["t"] < until)
print(f"WEEK: {usd(week)} USD foreign inference in the 7 days before {iso(until)}")
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

count() { # db-json log since until offline(0|1)
  local own rc ownarg
  own=$(mktemp)
  ownarg="$own"
  own_list "$own" "$5" || ownarg="-"
  py count "$1" "$2" "$ownarg" "$3" "$4"
  rc=$?
  rm -f "$own"
  return "$rc"
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
  db="$fx/customer-decline-db.json"; log="$fx/customer-decline.log"
  own_fixture="$fx/customer-decline-own-ips"
  export CP_OWN_IPS="$own_fixture.txt"
  [[ -f "$db" && -f "$log" && -f "$CP_OWN_IPS" ]] || { echo "SELFTEST FAILED: fixture missing in $fx"; exit 1; }
  S=2026-11-12T00:00:00Z; U=2026-11-15T00:00:00Z
  fail=0
  want() { # actual, expected, reason
    if [[ "$1" == "$2" ]]; then echo "ok   $3"; else echo "FAIL $3"; echo "     want: $2"; echo "     got:  $1"; fail=1; fi
  }
  line() { grep -E "$1" <<<"$2" | head -1; }
  out=$(count "$db" "$log" "$S" "$U" 1); rc=$?
  want "$rc" "0" "the planned window exits 0"
  want "$(sed -n 1p <<<"$out")" "DECLINE since $S until $U: 1 foreign customers with inference" "one foreign customer"
  want "$(line '^CUSTOMER 1:' "$out")" \
    "CUSTOMER 1: first 2026-11-12T10:00:00Z, last 2026-11-13T09:00:00Z, balance 0.00 USD, last topup 2026-11-10T08:00:00Z, ips 1" \
    "ours: our own address, nearer to the first row, is never matched, so the customer has one address"
  want "$(line '^DAY 1 2026-11-12:' "$out")" "DAY 1 2026-11-12: 3 calls, 3.00 USD, models m-a:3, http 2xx 3 402 0 4xx 0 5xx 0" \
    "ours: our own 200 is not counted for the customer; the query string and /v1/check are the inference path"
  want "$(line '^DAY 1 2026-11-13:' "$out")" "DAY 1 2026-11-13: 1 calls, 0.50 USD, models m-a:1, http 2xx 1 402 0 4xx 0 5xx 0" \
    "the second day counts its one call"
  want "$(line '^DAY 1 2026-11-14:' "$out")" "DAY 1 2026-11-14: 0 calls, 0.00 USD, models -, http 2xx 0 402 2 4xx 0 5xx 0" \
    "402: the two 402 of the customer's address count for the customer on a day without calls"
  want "$(line '^OTHER 2026-11-14:' "$out")" "OTHER 2026-11-14: http 2xx 0 402 0 4xx 0 5xx 1" \
    "402: no 402 lands under OTHER; the 500 of another address does, its GET on the path does not"
  want "$(line '^ABORTS' "$out")" "ABORTS 2026-11-13: 1 aborted, 1 answered after, 0.20 USD bought" "the abort is counted"
  want "$(line '^UNMATCHED' "$out")" "UNMATCHED: 0 inference rows without a log line within 5 s" \
    "unmatched: every planned row has its log line within 5 s"
  want "$(line '^WEEK' "$out")" "WEEK: 3.50 USD foreign inference in the 7 days before $U" "the week sums every row"
  want "$(wc -l <<<"$out" | tr -d ' ') $(grep -cE '([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}' <<<"$out")" "11 0" \
    "no address and no wallet in the eleven output lines"
  # The other direction: without our address on the list it is matched and counted.
  other="$stub/other-own.txt"
  echo "192.0.2.254 2026-11-19  not in the fixture" >"$other"
  out2=$(CP_OWN_IPS="$other" count "$db" "$log" "$S" "$U" 1)
  want "$(line '^CUSTOMER 1:' "$out2" | sed 's/.*, ips /ips /')" "ips 2" \
    "ours counter-proof: off the list, our own address is the nearest line and joins the customer"
  want "$(line '^DAY 1 2026-11-12:' "$out2")" "DAY 1 2026-11-12: 3 calls, 3.00 USD, models m-a:3, http 2xx 4 402 0 4xx 0 5xx 0" \
    "ours counter-proof: off the list, its 200 is counted for the customer"
  # 402 counter-proof: without the customer's 200 lines its address is nobody's, so its 402 go to OTHER.
  grep -v '"status": 200' "$log" >"$stub/no-200.log"
  out3=$(count "$db" "$stub/no-200.log" "$S" "$U" 1)
  want "$(line '^OTHER 2026-11-14:' "$out3")" "OTHER 2026-11-14: http 2xx 0 402 2 4xx 0 5xx 1" \
    "402 counter-proof: an address matched to no row is no customer's, its 402 count under OTHER"
  want "$(line '^UNMATCHED' "$out3")" "UNMATCHED: 4 inference rows without a log line within 5 s" \
    "unmatched counter-proof: without the 200 lines every row is unmatched"
  # One row moved 6 s away from its log line: just outside the window of a match.
  python3 -c '
import json, sys
d = json.load(open(sys.argv[1])); d["customers"][0]["rows"][1]["at"] = "2026-11-12T10:04:55.000Z"
json.dump(d, open(sys.argv[2], "w"))' "$db" "$stub/far.json"
  want "$(line '^UNMATCHED' "$(count "$stub/far.json" "$log" "$S" "$U" 1)")" "UNMATCHED: 1 inference rows without a log line within 5 s" \
    "unmatched: a row 6 s from its line is counted as unmatched"
  count "$db" "$log" "$S" "$S" 1 >/dev/null 2>&1; rc=$?
  want "$rc" "1" "--until not after --since exits 1"
  count "$db" "$log" "2026-11-12" "$U" 1 >/dev/null 2>&1; rc=$?
  want "$rc" "1" "a time without clock and zone exits 1"
  count "$db" "$fx/no-such.log" "$S" "$U" 1 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an unreadable log exits 2"
  echo "{" >"$stub/broken.json"
  count "$stub/broken.json" "$log" "$S" "$U" 1 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an unreadable ledger JSON exits 2"
  CP_OWN_IPS="$fx/no-such-list.txt" count "$db" "$log" "$S" "$U" 1 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "a missing own list exits 2"
  echo "# nothing" >"$stub/empty-own.txt"
  CP_OWN_IPS="$stub/empty-own.txt" count "$db" "$log" "$S" "$U" 1 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an own list without an address exits 2"
  if [[ "$fail" -eq 0 ]]; then
    echo "planned customer, its days, its 402, our own address and the unmatched rows counted, both directions"
    echo "SELFTEST OK"
  else echo "SELFTEST FAILED"; fi
  exit "$fail"
fi

DB=""; LOG=""; SINCE=""; UNTIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-json) [[ $# -ge 2 ]] || usage; DB="$2"; shift 2 ;;
    --log) [[ $# -ge 2 ]] || usage; LOG="$2"; shift 2 ;;
    --since) [[ $# -ge 2 ]] || usage; SINCE="$2"; shift 2 ;;
    --until) [[ $# -ge 2 ]] || usage; UNTIL="$2"; shift 2 ;;
    *) echo "customer-decline: unknown argument $1" >&2; usage ;;
  esac
done
[[ -n "$SINCE" ]] || usage
win=$(py times "$SINCE" "$UNTIL") || exit 1
SINCE=$(sed -n 1p <<<"$win"); UNTIL=$(sed -n 2p <<<"$win"); FETCH_SINCE=$(sed -n 3p <<<"$win")

if [[ -n "$DB" && -n "$LOG" ]]; then
  count "$DB" "$LOG" "$SINCE" "$UNTIL" 1
  exit $?
fi

# Production needs hosts and keys. Like ops/github-yield.sh the script reads loop.env itself when the
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
    echo "customer-decline: the access log could not be read. This says nothing about customers." >&2
    exit 2
  }
  offline=0
else
  offline=1
fi
if [[ -z "$DB" ]]; then
  # The JSON reaches back 7 days before --until whatever --since says, so WEEK is never cut short.
  DB="$dir/ledger.json"
  if ! timeout 120 ssh -i "$DKEY" -o BatchMode=yes -o ConnectTimeout=10 "$DHOST" \
    "cd /opt/control-plane/repo/deploy && docker compose -f docker-compose.prod.yml exec -T -e CP_REPORT=decline -e CP_SINCE=$FETCH_SINCE -e CP_UNTIL=$UNTIL cp node -" \
    <"$ROOT/ops/db-report.cjs" >"$DB" 2>/dev/null; then
    echo "x" >"$DB"   # unparsable on purpose: the count says the JSON is not readable and exits 2
  fi
fi
CP_SSH_KEY="$KEY" CP_HOST="$HOST" count "$DB" "$LOG" "$SINCE" "$UNTIL" "$offline"
