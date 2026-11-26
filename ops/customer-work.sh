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
#   HOUSE: <j> house jobs posted, <s> house submissions, <a> house awards (<c> to the customer)
#   HOUSE REPORT <METHOD> <path> <status>: <n>   each call named in the house reports of the window
#   HOUSE STEP: <n> step credits (<c> to the customer)
#   HOUSE STEP USE: <i> inference rows of the customer after his step credit
#   HOUSE DAY <YYYY-MM-DD>: <a> house awards, <f> to addresses without earlier inference, <s> step credits
#   AWARDS: <w> awarded to the customer, <i> inference rows after the first award
#
# board reads are GET /bounties.json and GET /v1/bounties; open bounties are not the customer's own,
# `ours` counts those that oursClause calls ours. No address, amount, id or brief is printed.
# The house lines (kunden 11) count the house job, a bounty with a house_fund row behind it: house jobs
# posted in the window, valid house reports of addresses that oursClause does not call ours, their house
# awards and those to the customer. HOUSE REPORT adds up the calls of those reports over all of them, sorted
# by method, path and status; in each path every wallet (0x and 40 hex digits) and every IPv4 address is
# replaced by <address> before it is counted, inside the container and again here.
# HOUSE STEP and HOUSE DAY (kunden 13) count the step credit, one ledger row house_step per address that the
# service writes while a house job is open: step credits in the window at addresses that oursClause does not call
# ours, and those to the customer. Per UTC day, the days of the DAY lines: the house awards of the HOUSE line by
# the day of the award, those to an address without an inference row before the award, and the step credits.
# HOUSE STEP USE (kunden 14) counts the customer's inference rows after his step credit in the window and before
# --until, 0 without one; the service writes an inference row only after a billed answer, so above 0 means his
# next inference after the step credit ended with 200.
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
HOUSE_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
WALLET = re.compile(r"0x[0-9a-fA-F]{40}")
IPV4 = re.compile(r"[0-9]{1,3}(\.[0-9]{1,3}){3}")

def house_path(path):
    # Every wallet and every IPv4 address becomes <address> before a call is counted; anything that is no
    # visible ASCII becomes ?, so a path can neither hide an address nor break a line of the output.
    path = IPV4.sub("<address>", WALLET.sub("<address>", path))
    return "".join(ch if "!" <= ch <= "~" else "?" for ch in path)

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
    house = data["house"]
    for k in ("jobs", "submissions", "awards", "awards_customer"):
        assert isinstance(house[k], int) and house[k] >= 0
    house_calls = collections.Counter()
    for c in house["calls"]:
        assert c["method"] in HOUSE_METHODS and isinstance(c["status"], int) and 100 <= c["status"] <= 599
        assert isinstance(c["path"], str) and c["path"].startswith("/") and isinstance(c["n"], int) and c["n"] > 0
        house_calls[(c["method"], house_path(c["path"]), c["status"])] += c["n"]
    for k in ("steps", "steps_customer", "steps_customer_inference"):
        assert isinstance(house[k], int) and house[k] >= 0
    assert house["steps_customer"] <= house["steps"]
    house_days = {}
    for d in house["days"]:
        assert isinstance(d["day"], str) and d["day"] not in house_days
        for k in ("awards", "awards_without_inference", "steps"):
            assert isinstance(d[k], int) and d[k] >= 0
        assert d["awards_without_inference"] <= d["awards"]
        house_days[d["day"]] = d
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
if set(days) != set(days_in) or set(days) != set(house_days):
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
hj, hs, ha, hc = (house[k] for k in ("jobs", "submissions", "awards", "awards_customer"))
print(f"HOUSE: {hj} house jobs posted, {hs} house submissions, {ha} house awards ({hc} to the customer)")
for (method, path, code), k in sorted(house_calls.items()):
    print(f"HOUSE REPORT {method} {path} {code}: {k}")
steps, steps_customer = (house[k] for k in ("steps", "steps_customer"))
print(f"HOUSE STEP: {steps} step credits ({steps_customer} to the customer)")
step_use = house["steps_customer_inference"]
print(f"HOUSE STEP USE: {step_use} inference rows of the customer after his step credit")
for d in days:
    da, df, ds = (house_days[d][k] for k in ("awards", "awards_without_inference", "steps"))
    print(f"HOUSE DAY {d}: {da} house awards, {df} to addresses without earlier inference, {ds} step credits")
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

# The step credits of kunden 13 for the selftest, planted on a copy of a house database of
# ops/fixtures/customer-work-plant.mts as grantForHouseJob and a house award write their rows: a step credit to
# the customer (the runtime with a key conway-automaton and inference rows), one to our own address (the agent
# of our own report, ours by its key ops-% only in the variant house), one to a fresh wallet and one after the
# window; a house award to the fresh wallet before its first inference and one to a wallet that thought the day
# before. The two new wallets are one hex digit repeated, so no address is written out in this file.
# shellcheck disable=SC2016
PLANT_STEPS_JS='
const db = require("better-sqlite3")(process.argv[1]);
const one = (sql, ...a) => db.prepare(sql).get(...a).a;
const customer = one(`select k.address a from api_keys k where k.name = ?
  and exists (select 1 from ledger l where l.address = k.address and l.kind = ?)`, "conway-automaton", "inference");
const own = one("select agent a from submissions where created_at = ?", "2026-11-14T09:00:00.000Z");
const poster = one("select address a from ledger where kind = ? order by id limit 1", "house_fund");
const job = one("select substr(ref, 12) a from ledger where kind = ? order by id limit 1", "house_fund");
const fresh = "0x" + "a".repeat(40);
const prior = "0x" + "b".repeat(40);
for (const a of [fresh, prior]) {
  db.prepare("insert or ignore into wallets (address, balance_mc, created_at) values (?, 0, ?)").run(a, "2026-11-01T00:00:00.000Z");
}
const row = (address, kind, deltaMc, ref, meta, at) =>
  db.prepare("insert into ledger (address, kind, delta_mc, ref, meta, created_at) values (?, ?, ?, ?, ?, ?)")
    .run(address, kind, deltaMc, ref, JSON.stringify(meta), at);
const step = (address, at) =>
  row(address, "house_step", 10000, `house-step:${address}`, { trigger: "house job open", bounty_id: job }, at);
const award = (id, address, at) => {
  row(poster, "house_fund", 25000, `house-fund:${id}`, { bounty_id: id }, at);
  row(address, "bounty_award", 22500, `bounty-award:${id}`, {}, at);
};
row(prior, "inference", -100, "planted-prior", {}, "2026-11-12T12:00:00.000Z");
award("planted-fresh", fresh, "2026-11-13T12:00:00.000Z");
row(fresh, "inference", -100, "planted-fresh-after", {}, "2026-11-13T13:00:00.000Z");
row(customer, "inference", -100, "planted-before-step", {}, "2026-11-14T06:30:00.000Z");
step(customer, "2026-11-14T07:00:00.000Z");
row(prior, "inference", -100, "planted-other-after-step", {}, "2026-11-14T10:00:00.000Z");
row(customer, "inference", -100, "planted-after-until", {}, "2026-11-16T03:00:00.000Z");
step(own, "2026-11-14T07:30:00.000Z");
step(fresh, "2026-11-15T08:00:00.000Z");
award("planted-prior", prior, "2026-11-15T11:00:00.000Z");
step(prior, "2026-11-16T01:00:00.000Z");
db.close();
'

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
  S=2026-11-13T00:00:00Z; U=2026-11-16T00:00:00Z; U3=2026-11-17T00:00:00Z; F=$NUMBERED_FROM_DEFAULT
  fail=0
  want() { # actual, expected, reason
    if [[ "$1" == "$2" ]]; then echo "ok   $3"; else echo "FAIL $3"; echo "     want: $2"; echo "     got:  $1"; fail=1; fi
  }
  line() { grep -E "$1" <<<"$2" | head -1; }
  plant_db() { # file variant
    (cd "$ROOT" && node --import tsx "$plant" "$1" "$2") >/dev/null 2>&1
  }
  plant_steps() { # from to: a copy of a house database with the rows of PLANT_STEPS_JS
    cp "$1" "$2" && (cd "$ROOT" && node -e "$PLANT_STEPS_JS" "$2") >/dev/null 2>&1
  }
  if ! plant_db "$stub/plain.db" plain || ! plant_db "$stub/foreign.db" foreign-operator \
    || ! plant_db "$stub/house.db" house || ! plant_db "$stub/house-foreign.db" house-foreign; then
    echo "SELFTEST FAILED: the planted database could not be built (node, tsx, better-sqlite3)"; exit 1
  fi
  if ! plant_steps "$stub/house.db" "$stub/step.db" || ! plant_steps "$stub/house-foreign.db" "$stub/step-foreign.db"; then
    echo "SELFTEST FAILED: the step credits could not be planted (node, better-sqlite3)"; exit 1
  fi
  report_local "$stub/plain.db" "$S" "$U" 1 "$F" >"$stub/c1.json"
  report_local "$stub/plain.db" "$S" "$U" 2 "$F" >"$stub/c2.json"
  report_local "$stub/foreign.db" "$S" "$U" 1 "$F" >"$stub/c1-foreign.json"
  report_local "$stub/plain.db" "$S" "$U" 3 "$F" >"$stub/c3.json"
  report_local "$stub/house.db" "$S" "$U" 1 "$F" >"$stub/h1.json"
  report_local "$stub/house.db" "$S" "$U" 2 "$F" >"$stub/h2.json"
  report_local "$stub/house-foreign.db" "$S" "$U" 1 "$F" >"$stub/h1-foreign.json"
  report_local "$stub/step.db" "$S" "$U" 1 "$F" >"$stub/s1.json"
  report_local "$stub/step.db" "$S" "$U" 2 "$F" >"$stub/s2.json"
  report_local "$stub/step-foreign.db" "$S" "$U" 1 "$F" >"$stub/s1-foreign.json"
  report_local "$stub/step.db" "$S" "$U3" 1 "$F" >"$stub/s1-later.json"

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

  # The house job (kunden 11), planted by the real functions of src/bounties/house.ts.
  want "$(grep -E '^HOUSE(:| REPORT )' <<<"$out" | tr '\n' '|')" "HOUSE: 0 house jobs posted, 0 house submissions, 0 house awards (0 to the customer)|" \
    "house: without a house job every house count is 0 and no call is reported"
  want "$(grep -E '^HOUSE (STEP:|DAY) ' <<<"$out" | tr '\n' '|')" \
    "HOUSE STEP: 0 step credits (0 to the customer)|HOUSE DAY 2026-11-13: 0 house awards, 0 to addresses without earlier inference, 0 step credits|HOUSE DAY 2026-11-14: 0 house awards, 0 to addresses without earlier inference, 0 step credits|HOUSE DAY 2026-11-15: 0 house awards, 0 to addresses without earlier inference, 0 step credits|" \
    "house step: without a house job no step credit and one HOUSE DAY line per day of the window, all 0"
  hout=$(count "$stub/h1.json" "$log" "$S" "$U" 1 1); rc=$?
  want "$rc" "0" "house: the planted window with house jobs exits 0"
  want "$(line '^HOUSE:' "$hout")" "HOUSE: 3 house jobs posted, 2 house submissions, 2 house awards (1 to the customer)" \
    "house: jobs posted after each award, the reports of two foreign runtimes and their awards, one to the customer; ours, the invalid one and the one after the window not counted"
  want "$(line '^HOUSE REPORT GET /pay/5/' "$hout")" "HOUSE REPORT GET /pay/5/<address> 404: 1" \
    "house report of the customer counted, address replaced"
  want "$(grep -cE '^HOUSE REPORT .*/v1/ours-only' <<<"$hout")" "0" \
    "house report of our own address not counted, neither its own call nor its call the customer also made"
  want "$(line '^HOUSE REPORT GET /v1/node/' "$hout")" "HOUSE REPORT GET /v1/node/<address>/status 502: 1" \
    "house report with an IPv4 address in its path counted, address replaced"
  want "$(grep -cE '^HOUSE REPORT .*(invalid-report|after-window)' <<<"$hout")" "0" \
    "house: an invalid report and one after the window are not counted"
  want "$(grep -E '^HOUSE REPORT' <<<"$hout" | tr '\n' '|')" \
    "HOUSE REPORT GET /pay/5/<address> 404: 1|HOUSE REPORT GET /v1/node/<address>/status 502: 1|HOUSE REPORT POST /v1/chat/completions 402: 2|" \
    "house report lines: the same call of two runtimes adds up, sorted by method, path and status"
  want "$(tail -1 <<<"$hout" | cut -c1-7)" "AWARDS:" "house lines come before AWARDS, which stays the last line"
  want "$(grep -cE '([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}' <<<"$hout")" "0" "house: no address and no wallet in the output"
  want "$(grep -cE '([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}' "$stub/h1.json")" "0" \
    "house: the database report replaces the address in each path itself, so none leaves the container"
  hout2=$(count "$stub/h1-foreign.json" "$log" "$S" "$U" 1 1)
  want "$(grep -E '^HOUSE' <<<"$hout2" | grep -E 'HOUSE:|/pay/5/|ours-only' | tr '\n' '|')" \
    "HOUSE: 3 house jobs posted, 3 house submissions, 2 house awards (1 to the customer)|HOUSE REPORT GET /pay/5/<address> 404: 2|HOUSE REPORT POST /v1/ours-only 500: 1|" \
    "house counter-proof: the same report from an address that is not ours is counted, both of its calls"
  hout3=$(count "$stub/h2.json" "$log" "$S" "$U" 2 1)
  want "$(line '^HOUSE:' "$hout3")" "HOUSE: 3 house jobs posted, 2 house submissions, 2 house awards (0 to the customer)" \
    "house counter-proof: for the other customer the award of customer 1 is not its own"

  # The step credit and the awards without earlier inference (kunden 13).
  want "$(line '^HOUSE DAY 2026-11-14:' "$hout")" "HOUSE DAY 2026-11-14: 1 house awards, 0 to addresses without earlier inference, 0 step credits" \
    "house award to the customer, who thought before, not counted as without earlier inference"
  want "$(line '^HOUSE DAY 2026-11-15:' "$hout")" "HOUSE DAY 2026-11-15: 1 house awards, 1 to addresses without earlier inference, 0 step credits" \
    "house award to a runtime that never thought counted as without earlier inference"
  sout=$(count "$stub/s1.json" "$log" "$S" "$U" 1 1); rc=$?
  want "$rc" "0" "house step: the planted window with step credits exits 0"
  want "$(line '^HOUSE:' "$sout")" "HOUSE: 3 house jobs posted, 2 house submissions, 4 house awards (1 to the customer)" \
    "house step: the two planted awards join the HOUSE line, whose format stays"
  want "$(line '^HOUSE STEP:' "$sout")" "HOUSE STEP: 2 step credits (1 to the customer)" \
    "step credit of the customer counted, with the one of a fresh wallet; ours and the one after the window not counted"
  want "$(line '^HOUSE DAY 2026-11-14:' "$sout" | sed 's/.*inference, //')" "1 step credits" \
    "step credit of our own address not counted, the customer's on the same day is"
  want "$(line '^HOUSE DAY 2026-11-15:' "$sout" | sed 's/.*inference, //')" "1 step credits" \
    "step credit of a fresh wallet counted on its day"
  want "$(line '^HOUSE DAY 2026-11-13:' "$sout")" "HOUSE DAY 2026-11-13: 1 house awards, 1 to addresses without earlier inference, 0 step credits" \
    "house award to a fresh wallet counted as without earlier inference, its inference after the award does not count"
  want "$(line '^HOUSE DAY 2026-11-15:' "$sout" | cut -d, -f1-2)" "HOUSE DAY 2026-11-15: 2 house awards, 1 to addresses without earlier inference" \
    "house award after an earlier inference not counted as without earlier inference, the fresh one that day is"
  want "$(grep -cE '^HOUSE DAY ' <<<"$sout")" "3" "house step: one HOUSE DAY line per day of the window"
  want "$(tail -1 <<<"$sout" | cut -c1-7)" "AWARDS:" "house step lines come before AWARDS, which stays the last line"
  want "$(grep -cE '([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}' <<<"$sout")" "0" "house step: no address and no wallet in the output"
  want "$(grep -cE '([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}' "$stub/s1.json")" "0" \
    "house step: no address leaves the database report"
  sout2=$(count "$stub/s1-foreign.json" "$log" "$S" "$U" 1 1)
  want "$(line '^HOUSE STEP:' "$sout2")" "HOUSE STEP: 3 step credits (1 to the customer)" \
    "step credit counter-proof: the same step credit at an address that is not ours is counted"
  want "$(line '^HOUSE DAY 2026-11-14:' "$sout2" | sed 's/.*inference, //')" "2 step credits" \
    "step credit counter-proof: off our list, that address counts on its day"
  sout3=$(count "$stub/s2.json" "$log" "$S" "$U" 2 1)
  want "$(line '^HOUSE STEP:' "$sout3")" "HOUSE STEP: 2 step credits (0 to the customer)" \
    "step credit counter-proof: for the other customer the step credit of customer 1 is not its own"

  # The inference rows of the customer after his step credit (kunden 14).
  want "$(line '^HOUSE STEP USE:' "$sout")" "HOUSE STEP USE: 2 inference rows of the customer after his step credit" \
    "step use: the customer's inference rows after his step credit and before --until counted; the one before it, the one after --until and those of another address not"
  want "$(grep -A1 -E '^HOUSE STEP:' <<<"$sout" | sed -n 2p | cut -d: -f1)" "HOUSE STEP USE" \
    "step use line comes right after HOUSE STEP"
  want "$(line '^HOUSE STEP USE:' "$(count "$stub/s1-later.json" "$log" "$S" "$U3" 1 1)")" \
    "HOUSE STEP USE: 3 inference rows of the customer after his step credit" \
    "step use counter-proof: with --until after his later inference row that row is counted too"
  want "$(line '^HOUSE STEP USE:' "$hout")" "HOUSE STEP USE: 0 inference rows of the customer after his step credit" \
    "step use counter-proof: without a step credit his inference rows in the window are not counted"
  want "$(line '^HOUSE STEP USE:' "$sout3")" "HOUSE STEP USE: 0 inference rows of the customer after his step credit" \
    "step use counter-proof: the other customer has no step credit, so the rows after the step credit of customer 1 are not its own"

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
