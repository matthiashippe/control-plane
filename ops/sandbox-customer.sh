#!/usr/bin/env bash
# How the sandboxes of foreign customers ran and ended, and what they called after (kunden 16). Reads only,
# names no address.
#
#   ops/sandbox-customer.sh --since <ISO UTC> [--until <ISO UTC>]   production: the ledger through
#                                    ops/db-report.cjs with CP_REPORT=sandbox-customer (readonly: true, in
#                                    the container cp) and the whole Caddy access log (ops/access-log.sh)
#   ops/sandbox-customer.sh --db-json <file> --log <file> --since <ISO UTC> [--until <ISO UTC>]
#                                    the same count from files; either flag alone replaces its source
#   ops/sandbox-customer.sh --selftest                              no network, both directions
#   own addresses: own_ips from ops/own-ips.sh (CP_OWN_IPS=<file> replaces its list)
#
# A customer is a foreign address with at least one sandbox created in the window, numbered from 1 in the
# order of its first such sandbox. Its addresses in the access log come from ops/customer_match.py: each of
# its `inference` ledger rows is matched to the nearest line on the inference path with status 200 from a
# foreign address, at most 5 s away. Our own addresses are never matched and never counted.
#
# Two moments per customer: `halt` is the last step of its last sandbox stopped for credit, `last-inference`
# its last `inference` ledger row (`none` without). After a moment counts every log line of the customer's
# addresses with ts > moment + 5 s and ts < until. A path is counted without its query; the segment after
# /v1/sandboxes/ becomes {id}, a segment of 0x and 40 hex digits becomes {address}.
#
#   SANDBOX CUSTOMERS since <t> until <u>: <k> foreign customers with a sandbox
#   CUSTOMER <n>: first sandbox <ISO>, sandboxes <s>, ips <m>, balance <zero|below hold|covers hold>
#   SANDBOX <n>.<i>: tier <tier>, created <ISO>, status <status>, stop <reason|->, steps <k>, last step <ISO|->
#   LEDGER <n>: <kind> <count>[, ...], last inference <ISO|none>
#   AFTER <n> <halt|last-inference> <ISO|none>: <r> requests
#   PATH <n> <halt|last-inference> <METHOD> <path> <status> x<count>
#   LAST <n>: <ISO> <METHOD> <path> <status>          or  LAST <n>: none
#   QUIET <n>: <h> hours without a request before <u>
#   WEEK: <w> foreign payments in the 7 days before <u>
#
# Exit 1 on a wrong argument, a time that is no ISO time in UTC, or --until not after --since.
# Exit 2 when the own list is missing or empty, or the log or the JSON cannot be read.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=ops/conway-arrivals.sh
source "$ROOT/ops/conway-arrivals.sh"

usage() { sed -n '4,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 1; }

# The counting, the same code for production, files and selftest. No address leaves this block.
# shellcheck disable=SC2016
COUNT_PY='
import collections, datetime, json, os, re, sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.environ["CONWAY_ARRIVALS_DIR"])
import conway_arrivals as ca
import customer_match as cm

ISO = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z")
AFTER_S = 5.0

def fail(msg, code=2):
    print(f"sandbox-customer: {msg}", file=sys.stderr)
    raise SystemExit(code)

def parse(name, value):
    if not ISO.fullmatch(value):
        fail(f"{name} is no ISO time in UTC: {value}", 1)
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        fail(f"{name} is no ISO time in UTC: {value}", 1)

def stamp(value):
    return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()

def iso(t):
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def shape(path):
    parts = path.split("/")
    for i, p in enumerate(parts):
        if i == 3 and parts[1:3] == ["v1", "sandboxes"] and p:
            parts[i] = "{id}"
        elif re.fullmatch(r"0x[0-9a-fA-F]{40}", p):
            parts[i] = "{address}"
    return "/".join(parts)

mode = sys.argv[1]
if mode == "times":
    # since, until (empty: now) -> the window as two lines, or exit 1
    since = parse("--since", sys.argv[2])
    until = parse("--until", sys.argv[3]) if sys.argv[3] else float(int(datetime.datetime.now(datetime.timezone.utc).timestamp()))
    if until <= since:
        fail("--until is not after --since", 1)
    print(iso(since)); print(iso(until))
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
    hold = int(data["hold_mc"])
    week = int(data["foreign_topups_week"])
    customers_in = data["customers"]
    assert isinstance(customers_in, list)
    for c in customers_in:
        for s in c["sandboxes"]:
            s["t"] = stamp(s["created_at"])
            s["last"] = stamp(s["last_step_at"]) if s.get("last_step_at") else None
        for r in c["ledger"]:
            r["t"] = stamp(r["at"])
except Exception:
    fail("the ledger JSON is not readable. This says nothing about customers.")

def in_window(t):
    return since <= t < until

ok_lines = cm.ok_lines(cm.inference_lines(log, own))
# Every line of a foreign address in the window; our own never enter.
window_lines = [l for l in log if l.ip and l.ip not in own and in_window(l.ts)]

customers = []
for c in customers_in:
    boxes = sorted((s for s in c["sandboxes"] if in_window(s["t"])), key=lambda s: s["t"])
    if boxes:
        customers.append((boxes[0]["t"], int(c.get("n") or 0), c, boxes))
customers.sort(key=lambda x: (x[0], x[1]))

def balance(c):
    free = int(c.get("balance_mc") or 0) - int(c.get("reserved_mc") or 0)
    if free <= 0:
        return "zero"
    return "below hold" if free < hold else "covers hold"

def after(n, label, moment, lines):
    if moment is None:
        print(f"AFTER {n} {label} none: 0 requests")
        return
    later = [l for l in lines if l.ts > moment + AFTER_S and l.ts < until]
    print(f"AFTER {n} {label} {iso(moment)}: {len(later)} requests")
    counts = collections.OrderedDict()
    for l in later:
        key = (l.method, shape(l.path), l.status)
        counts[key] = counts.get(key, 0) + 1
    for (m, p, s), k in counts.items():
        print(f"PATH {n} {label} {m} {p} {s} x{k}")

print(f"SANDBOX CUSTOMERS since {iso(since)} until {iso(until)}: {len(customers)} foreign customers with a sandbox")
for n, (first, _, c, boxes) in enumerate(customers, 1):
    rows = sorted((r for r in c["ledger"] if in_window(r["t"])), key=lambda r: r["t"])
    inference = [r["t"] for r in rows if r["kind"] == "inference"]
    mine, _ = cm.match_rows(inference, ok_lines)
    print(f"CUSTOMER {n}: first sandbox {iso(first)}, sandboxes {len(boxes)}, ips {len(mine)}, balance {balance(c)}")
    for i, s in enumerate(boxes, 1):
        last = iso(s["last"]) if s["last"] is not None else "-"
        tier, created, status = s["tier"], iso(s["t"]), s["status"]
        stop, steps = s.get("stop_reason") or "-", int(s.get("steps_billed") or 0)
        print(f"SANDBOX {n}.{i}: tier {tier}, created {created}, status {status}, stop {stop}, steps {steps}, last step {last}")
    kinds = collections.Counter(str(r["kind"]) for r in rows)
    li = iso(max(inference)) if inference else "none"
    listed = ", ".join(f"{k} {v}" for k, v in sorted(kinds.items()))
    head = listed + ", " if listed else ""
    print(f"LEDGER {n}: {head}last inference {li}")
    credit = [s for s in boxes if s.get("stop_reason") == "credit"]
    halt = credit[-1]["last"] if credit else None
    lines = [l for l in window_lines if l.ip in mine]
    after(n, "halt", halt, lines)
    after(n, "last-inference", max(inference) if inference else None, lines)
    if lines:
        l = max(lines, key=lambda l: l.ts)
        print(f"LAST {n}: {iso(l.ts)} {l.method} {shape(l.path)} {l.status}")
        quiet_from = l.ts
    else:
        print(f"LAST {n}: none")
        quiet_from = first
    print(f"QUIET {n}: {int((until - quiet_from) // 3600)} hours without a request before {iso(until)}")
print(f"WEEK: {week} foreign payments in the 7 days before {iso(until)}")
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
  db="$fx/sandbox-customer-db.json"; log="$fx/sandbox-customer.log"
  export CP_OWN_IPS="$fx/sandbox-customer-own-ips.txt"
  [[ -f "$db" && -f "$log" && -f "$CP_OWN_IPS" ]] || { echo "SELFTEST FAILED: fixture missing in $fx"; exit 1; }
  S=2026-11-21T00:00:00Z; U=2026-11-22T00:00:00Z
  fail=0
  want() { # actual, expected, reason
    if [[ "$1" == "$2" ]]; then echo "ok   $3"; else echo "FAIL $3"; echo "     want: $2"; echo "     got:  $1"; fail=1; fi
  }
  line() { grep -E "$1" <<<"$2" | head -1; }
  out=$(count "$db" "$log" "$S" "$U" 1); rc=$?
  want "$rc" "0" "the planned window exits 0"
  want "$(sed -n 1p <<<"$out")" "SANDBOX CUSTOMERS since $S until $U: 1 foreign customers with a sandbox" \
    "one foreign customer with a sandbox; the foreign address without one counts nowhere"
  want "$(line '^CUSTOMER 1:' "$out")" \
    "CUSTOMER 1: first sandbox 2026-11-21T02:27:00Z, sandboxes 1, ips 1, balance below hold" \
    "ours: our own address, nearer to the first inference row, is never matched, so the customer has one address"
  want "$(line '^SANDBOX 1.1:' "$out")" \
    "SANDBOX 1.1: tier medium, created 2026-11-21T02:27:00Z, status stopped, stop credit, steps 3, last step 2026-11-21T02:45:00Z" \
    "the sandbox with its stop for credit and its last step"
  want "$(line '^LEDGER 1:' "$out")" "LEDGER 1: grant 1, inference 3, sandbox 3, topup 1, last inference 2026-11-21T03:10:00Z" \
    "the ledger kinds in alphabetical order and the last inference"
  want "$(grep -E '^(AFTER|PATH) 1 halt' <<<"$out" | tr '\n' '|')" \
    "AFTER 1 halt 2026-11-21T02:45:00Z: 6 requests|PATH 1 halt POST /v1/chat/completions 200 x2|PATH 1 halt POST /v1/sandboxes/{id}/exec 402 x2|PATH 1 halt POST /v1/chat/completions 402 x1|PATH 1 halt GET /v1/credits/balance 200 x1|" \
    "halt: six requests after the halt by path and status, query cut, sandbox id as {id}, ours not counted"
  want "$(grep -E '^(AFTER|PATH) 1 last-inference' <<<"$out" | tr '\n' '|')" \
    "AFTER 1 last-inference 2026-11-21T03:10:00Z: 3 requests|PATH 1 last-inference POST /v1/sandboxes/{id}/exec 402 x1|PATH 1 last-inference POST /v1/chat/completions 402 x1|PATH 1 last-inference GET /v1/credits/balance 200 x1|" \
    "last-inference: the answer to the last inference row itself lies within 5 s and is not counted after it"
  want "$(line '^LAST 1:' "$out")" "LAST 1: 2026-11-21T03:31:00Z GET /v1/credits/balance 200" "the last request of the customer"
  want "$(line '^QUIET 1:' "$out")" "QUIET 1: 20 hours without a request before $U" "full hours from the last request to until"
  want "$(line '^WEEK' "$out")" "WEEK: 1 foreign payments in the 7 days before $U" "the foreign payments of the week"
  want "$(wc -l <<<"$out" | tr -d ' ') $(grep -cE '([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}|sbx-|[0-9]+\.[0-9]{2} USD' <<<"$out")" "16 0" \
    "no address, no wallet, no sandbox id and no amount in the sixteen output lines"
  # The other direction: without our address on the list it is matched and counted.
  other="$stub/other-own.txt"
  echo "192.0.2.254 2026-11-26  not in the fixture" >"$other"
  out2=$(CP_OWN_IPS="$other" count "$db" "$log" "$S" "$U" 1)
  want "$(line '^CUSTOMER 1:' "$out2" | sed 's/.*, ips \([0-9]*\),.*/ips \1/')" "ips 2" \
    "ours counter-proof: off the list, our own address is the nearest line and joins the customer"
  want "$(line '^AFTER 1 halt' "$out2")" "AFTER 1 halt 2026-11-21T02:45:00Z: 7 requests" \
    "ours counter-proof: off the list, its 402 after the halt is counted for the customer"
  # halt counter-proof: without the stop for credit there is no halt and nothing is counted after it.
  python3 -c '
import json, sys
d = json.load(open(sys.argv[1])); d["customers"][0]["sandboxes"][0]["stop_reason"] = "sandboxd"
json.dump(d, open(sys.argv[2], "w"))' "$db" "$stub/no-halt.json"
  out3=$(count "$stub/no-halt.json" "$log" "$S" "$U" 1)
  want "$(line '^AFTER 1 halt' "$out3") $(grep -c '^PATH 1 halt ' <<<"$out3")" "AFTER 1 halt none: 0 requests 0" \
    "halt counter-proof: a sandbox stopped by sandboxd has no halt for credit"
  # hold: the balance decides the word, both directions.
  for pair in "1000 covers hold" "999 below hold" "0 zero"; do
    python3 -c '
import json, sys
d = json.load(open(sys.argv[1])); d["customers"][0]["balance_mc"] = int(sys.argv[3])
json.dump(d, open(sys.argv[2], "w"))' "$db" "$stub/hold.json" "${pair%% *}"
    want "$(line '^CUSTOMER 1:' "$(count "$stub/hold.json" "$log" "$S" "$U" 1)" | sed 's/.*, balance //')" "${pair#* }" \
      "hold: balance ${pair%% *} mc against a hold of 1000 mc is ${pair#* }"
  done
  count "$db" "$log" "$S" "$S" 1 >/dev/null 2>&1; rc=$?
  want "$rc" "1" "--until not after --since exits 1"
  count "$db" "$log" "2026-11-21" "$U" 1 >/dev/null 2>&1; rc=$?
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
    echo "SELFTEST OK: planned customer, its sandbox, its requests after halt and last inference, ours and the hold, both directions"
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
    *) echo "sandbox-customer: unknown argument $1" >&2; usage ;;
  esac
done
[[ -n "$SINCE" ]] || usage
win=$(py times "$SINCE" "$UNTIL") || exit 1
SINCE=$(sed -n 1p <<<"$win"); UNTIL=$(sed -n 2p <<<"$win")

if [[ -n "$DB" && -n "$LOG" ]]; then
  count "$DB" "$LOG" "$SINCE" "$UNTIL" 1
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
    echo "sandbox-customer: the access log could not be read. This says nothing about customers." >&2
    exit 2
  }
  offline=0
else
  offline=1
fi
if [[ -z "$DB" ]]; then
  # Read only: the report opens the database with readonly: true; `docker exec` into the running container
  # starts nothing and changes nothing.
  DB="$dir/ledger.json"
  if ! timeout 120 ssh -i "$DKEY" -o BatchMode=yes -o ConnectTimeout=10 "$DHOST" \
    "docker exec -i -e CP_REPORT=sandbox-customer -e CP_SINCE=$SINCE -e CP_UNTIL=$UNTIL deploy-cp-1 node -" \
    <"$ROOT/ops/db-report.cjs" >"$DB" 2>/dev/null; then
    echo "x" >"$DB"   # unparsable on purpose: the count says the JSON is not readable and exits 2
  fi
fi
CP_SSH_KEY="$KEY" CP_HOST="$HOST" count "$DB" "$LOG" "$SINCE" "$UNTIL" "$offline"
