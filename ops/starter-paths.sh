#!/usr/bin/env bash
# What a new foreign runtime without starter credit asked for after it got its key (kunden 06). Reads only,
# names no address.
#
#   ops/starter-paths.sh --since <ISO UTC> [--until <ISO UTC>] [--own-check]   production: the runtimes through
#                                    ops/db-report.cjs with CP_REPORT=starter-paths (readonly: true, in the
#                                    container cp) and the whole Caddy access log (ops/access-log.sh)
#   ops/starter-paths.sh --db-json <file> --log <file> --since <ISO UTC> [--until <ISO UTC>] [--own-check]
#                                    the same count from files; either flag alone replaces its source
#   ops/starter-paths.sh --selftest                                             no network, both directions
#   own addresses: own_ips from ops/own-ips.sh (CP_OWN_IPS=<file> replaces its list)
#
# A new runtime is the first `conway-automaton` key of an address that is not ours (runtime_funnel), numbered
# from 1 in the order of that key. It is matched to the access log line POST /v1/auth/verify or
# POST /v1/auth/api-keys with status 200 or 201 from a foreign address whose ts lies nearest to the key, at most
# 5 s away; that address belongs to the runtime. Our own addresses are never matched and never counted.
#
#   STARTER since <t> until <u>: <k> new runtimes, <g> granted
#   RUNTIME <n>: key <ISO>, granted yes|no, ips <m>
#   PATH <n> <METHOD> <path>: <count>      per runtime without a grant, its requests in the 24 h after its key;
#                                          path without query, a segment holding an address becomes :address
#   UNMATCHED: <x> runtimes without a log line within 5 s
#   OWN WOULD GRANT: <n>                   only with --own-check: runtimes of the 14 days before <u> whose sign-in
#                                          lines within 5 s all came from our own addresses and that read GET /v1/credits/balance
#                                          from there in the 24 h after the key while still unfunded and ungranted
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

ISO = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z")
SIGN_IN = {("POST", "/v1/auth/verify"), ("POST", "/v1/auth/api-keys")}
SIGN_IN_STATUS = {200, 201}
TRIGGER = ("GET", "/v1/credits/balance")
MATCH_S = 5.0
AFTER_S = 24 * 3600.0
OWN_DAYS = 14
# A segment that holds a wallet, a keyless handle or an IPv4 address is replaced, so no address leaves.
ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}|key:[0-9a-fA-F]{8,}|(?:\d{1,3}\.){3}\d{1,3}")

def fail(msg, code=2):
    print(f"starter-paths: {msg}", file=sys.stderr)
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

def ts(v):
    return datetime.datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp() if v else None

def clean(path):
    return "/".join(":address" if ADDRESS.search(s) else s for s in path.split("/"))

mode = sys.argv[1]
if mode == "times":
    # since, until (empty: the start of this minute), own-check (0|1) -> since, until, fetch-since; or exit 1
    since = parse("--since", sys.argv[2])
    until = parse("--until", sys.argv[3]) if sys.argv[3] else float(int(datetime.datetime.now(datetime.timezone.utc).timestamp()) // 60 * 60)
    if until <= since:
        fail("--until is not after --since", 1)
    fetch = min(since, until - OWN_DAYS * 86400) if sys.argv[4] == "1" else since
    print(iso(since)); print(iso(until)); print(iso(fetch))
    raise SystemExit(0)

db_file, log_file, own_file, since_arg, until_arg, own_check = sys.argv[2:8]
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
    fail("the access log is not readable. This says nothing about runtimes.")
try:
    with open(db_file, encoding="utf-8") as f:
        data = json.load(f)
    runtimes_in = data["runtimes"]
    assert isinstance(runtimes_in, list)
    for r in runtimes_in:
        r["t"] = ts(r["key_at"])
        r["granted_t"] = ts(r.get("granted_at"))
        r["funded_t"] = ts(r.get("funded_at"))
        assert r["t"] is not None and isinstance(r.get("granted"), bool)
except Exception:
    fail("the runtime JSON is not readable. This says nothing about runtimes.")

sign_ins = [l for l in log if l.ip and (l.method, l.path) in SIGN_IN and l.status in SIGN_IN_STATUS]
by_ip = collections.defaultdict(list)
for l in log:
    if l.ip:
        by_ip[l.ip].append(l)

def nearest(t, lines):
    best = None
    for l in lines:
        d = abs(l.ts - t)
        if d <= MATCH_S and (best is None or d < best[0]):
            best = (d, l.ip)
    return best[1] if best else None

foreign_sign_ins = [l for l in sign_ins if l.ip not in own]
runtimes = sorted((r for r in runtimes_in if since <= r["t"] < until), key=lambda r: (r["t"], int(r.get("n") or 0)))
granted = sum(1 for r in runtimes if r["granted"])
print(f"STARTER since {iso(since)} until {iso(until)}: {len(runtimes)} new runtimes, {granted} granted")
unmatched = 0
for n, r in enumerate(runtimes, 1):
    ip = nearest(r["t"], foreign_sign_ins)
    if ip is None:
        unmatched += 1
    key_at, yes = iso(r["t"]), "yes" if r["granted"] else "no"
    print(f"RUNTIME {n}: key {key_at}, granted {yes}, ips {0 if ip is None else 1}")
    if r["granted"] or ip is None:
        continue
    paths = collections.Counter(
        (l.method, clean(l.path)) for l in by_ip[ip] if r["t"] <= l.ts < r["t"] + AFTER_S
    )
    for (m, p), c in sorted(paths.items(), key=lambda kv: (-kv[1], kv[0][1], kv[0][0])):
        print(f"PATH {n} {m} {p}: {c}")
print(f"UNMATCHED: {unmatched} runtimes without a log line within 5 s")

if own_check == "1":
    # A run of ours: every sign-in line within 5 s of its key came from one of our own addresses.
    would = 0
    for r in runtimes_in:
        if not (until - OWN_DAYS * 86400 <= r["t"] < until):
            continue
        near = {l.ip for l in sign_ins if abs(l.ts - r["t"]) <= MATCH_S}
        if not near or not near <= own:
            continue
        calls = [l.ts for ip in near for l in by_ip[ip]
                 if (l.method, l.path) == TRIGGER and l.status == 200 and r["t"] <= l.ts < r["t"] + AFTER_S]
        if not calls:
            continue
        first = min(calls)
        if r["granted_t"] is not None and r["granted_t"] <= first:
            continue
        if r["funded_t"] is not None and r["funded_t"] <= first:
            continue
        would += 1
    print(f"OWN WOULD GRANT: {would}")
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

count() { # db-json log since until offline(0|1) own-check(0|1)
  local own rc ownarg
  own=$(mktemp)
  ownarg="$own"
  own_list "$own" "$5" || ownarg="-"
  py count "$1" "$2" "$ownarg" "$3" "$4" "$6"
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
  db="$fx/starter-paths-db.json"; log="$fx/starter-paths.log"
  export CP_OWN_IPS="$fx/starter-paths-own-ips.txt"
  [[ -f "$db" && -f "$log" && -f "$CP_OWN_IPS" ]] || { echo "SELFTEST FAILED: fixture missing in $fx"; exit 1; }
  S=2026-11-10T00:00:00Z; U=2026-11-17T00:00:00Z
  fail=0
  want() { # actual, expected, reason
    if [[ "$1" == "$2" ]]; then echo "ok   $3"; else echo "FAIL $3"; echo "     want: $2"; echo "     got:  $1"; fail=1; fi
  }
  line() { grep -E "$1" <<<"$2" | head -1; }
  paths() { grep -E "^PATH $1 " <<<"$2" | tr '\n' '|'; }
  out=$(count "$db" "$log" "$S" "$U" 1 1); rc=$?
  want "$rc" "0" "the planned window exits 0"
  want "$(sed -n 1p <<<"$out")" "STARTER since $S until $U: 4 new runtimes, 1 granted" "four new runtimes, one of them granted"
  want "$(line '^RUNTIME 1:' "$out")" "RUNTIME 1: key 2026-11-12T10:00:00Z, granted no, ips 1" \
    "ours: our own sign-in, nearer to the key, is never matched, so the runtime has the foreign one"
  want "$(paths 1 "$out")" \
    "PATH 1 GET /v1/credits/balance: 2|PATH 1 GET /pay/5/:address: 1|PATH 1 POST /v1/auth/api-keys: 1|PATH 1 POST /v1/automatons/register: 1|" \
    "path: its requests in the 24 h after the key, query cut, the wallet segment as :address, ours and later ones left out"
  want "$(line '^RUNTIME 2:' "$out")" "RUNTIME 2: key 2026-11-13T08:00:00Z, granted yes, ips 1" "a granted runtime is matched"
  want "$(paths 2 "$out")" "" "path: a granted runtime gets no PATH lines"
  want "$(line '^RUNTIME 3:' "$out")" "RUNTIME 3: key 2026-11-14T09:00:00Z, granted no, ips 0" \
    "unmatched: a sign-in 6 s from the key is no match"
  want "$(line '^UNMATCHED' "$out")" "UNMATCHED: 2 runtimes without a log line within 5 s" \
    "unmatched: the runtime 6 s away and the one that signed in only from our own address"
  want "$(line '^OWN WOULD GRANT' "$out")" "OWN WOULD GRANT: 1" \
    "ours: the run that signed in from our own address and read an empty balance would have drawn a grant"
  want "$(wc -l <<<"$out" | tr -d ' ') $(grep -cE '([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}|key:[0-9a-f]{8}' <<<"$out")" "11 0" \
    "no address, no wallet and no handle in the eleven output lines"
  # The other direction: without our address on the list it is matched and counted.
  other="$stub/other-own.txt"
  echo "192.0.2.254 2026-11-20  not in the fixture" >"$other"
  out2=$(CP_OWN_IPS="$other" count "$db" "$log" "$S" "$U" 1 1)
  want "$(paths 1 "$out2")" "PATH 1 POST /v1/auth/api-keys: 1|PATH 1 GET /v1/credits/balance: 1|" \
    "ours counter-proof: off the list, our own sign-in is the nearest and its requests become the runtime's"
  want "$(line '^UNMATCHED' "$out2")" "UNMATCHED: 1 runtimes without a log line within 5 s" \
    "ours counter-proof: off the list, our own run is matched like a stranger"
  want "$(line '^OWN WOULD GRANT' "$out2")" "OWN WOULD GRANT: 0" \
    "ours counter-proof: off the list, no run counts as ours"
  # path counter-proof: a window of 25 h instead of 24 h would have counted the late request; here it is planted
  # 23 h after the key and must then count.
  sed 's/"ts": 1794567600.0/"ts": 1794560400.0/' "$log" >"$stub/late-in.log"
  want "$(line '^PATH 1 GET /v1/credits/balance' "$(count "$db" "$stub/late-in.log" "$S" "$U" 1 0)")" \
    "PATH 1 GET /v1/credits/balance: 3" "path counter-proof: the late request moved inside the 24 h counts"
  # unmatched counter-proof: the far sign-in moved to 2 s after its key.
  sed 's/"ts": 1794646806.0/"ts": 1794646802.0/' "$log" >"$stub/near.log"
  out3=$(count "$db" "$stub/near.log" "$S" "$U" 1 0)
  want "$(line '^UNMATCHED' "$out3")" "UNMATCHED: 1 runtimes without a log line within 5 s" \
    "unmatched counter-proof: a sign-in 2 s from the key is a match"
  want "$(line '^RUNTIME 3:' "$out3")" "RUNTIME 3: key 2026-11-14T09:00:00Z, granted no, ips 1" \
    "unmatched counter-proof: the runtime has its address"
  # own counter-proof: funded before its first balance read, the own run would not have drawn.
  python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
for r in d["runtimes"]:
    if r["key_at"].startswith("2026-11-15"):
        r["funded_at"] = "2026-11-15T07:00:03.000Z"
json.dump(d, open(sys.argv[2], "w"))' "$db" "$stub/funded.json"
  want "$(line '^OWN WOULD GRANT' "$(count "$stub/funded.json" "$log" "$S" "$U" 1 1)")" "OWN WOULD GRANT: 0" \
    "ours: a run of ours that was funded before its first balance read would not have drawn"
  want "$(count "$db" "$log" "$S" "$U" 1 0 | grep -c '^OWN')" "0" "without --own-check there is no OWN line"
  count "$db" "$log" "$S" "$S" 1 0 >/dev/null 2>&1; rc=$?
  want "$rc" "1" "--until not after --since exits 1"
  count "$db" "$log" "2026-11-12" "$U" 1 0 >/dev/null 2>&1; rc=$?
  want "$rc" "1" "a time without clock and zone exits 1"
  count "$db" "$fx/no-such.log" "$S" "$U" 1 0 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an unreadable log exits 2"
  echo "{" >"$stub/broken.json"
  count "$stub/broken.json" "$log" "$S" "$U" 1 0 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an unreadable runtime JSON exits 2"
  CP_OWN_IPS="$fx/no-such-list.txt" count "$db" "$log" "$S" "$U" 1 0 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "a missing own list exits 2"
  echo "# nothing" >"$stub/empty-own.txt"
  CP_OWN_IPS="$stub/empty-own.txt" count "$db" "$log" "$S" "$U" 1 0 >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an own list without an address exits 2"
  if [[ "$fail" -eq 0 ]]; then
    echo "planned runtimes, their paths, our own address, our own runs and the unmatched ones counted, both directions"
    echo "SELFTEST OK"
  else echo "SELFTEST FAILED"; fi
  exit "$fail"
fi

DB=""; LOG=""; SINCE=""; UNTIL=""; OWN_CHECK=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-json) [[ $# -ge 2 ]] || usage; DB="$2"; shift 2 ;;
    --log) [[ $# -ge 2 ]] || usage; LOG="$2"; shift 2 ;;
    --since) [[ $# -ge 2 ]] || usage; SINCE="$2"; shift 2 ;;
    --until) [[ $# -ge 2 ]] || usage; UNTIL="$2"; shift 2 ;;
    --own-check) OWN_CHECK=1; shift ;;
    *) echo "starter-paths: unknown argument $1" >&2; usage ;;
  esac
done
[[ -n "$SINCE" ]] || usage
win=$(py times "$SINCE" "$UNTIL" "$OWN_CHECK") || exit 1
SINCE=$(sed -n 1p <<<"$win"); UNTIL=$(sed -n 2p <<<"$win"); FETCH_SINCE=$(sed -n 3p <<<"$win")

if [[ -n "$DB" && -n "$LOG" ]]; then
  count "$DB" "$LOG" "$SINCE" "$UNTIL" 1 "$OWN_CHECK"
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
    echo "starter-paths: the access log could not be read. This says nothing about runtimes." >&2
    exit 2
  }
  offline=0
else
  offline=1
fi
if [[ -z "$DB" ]]; then
  # The JSON reaches back 14 days before --until with --own-check, whatever --since says.
  DB="$dir/runtimes.json"
  if ! timeout 120 ssh -i "$DKEY" -o BatchMode=yes -o ConnectTimeout=10 "$DHOST" \
    "docker exec -i -e CP_REPORT=starter-paths -e CP_SINCE=$FETCH_SINCE -e CP_UNTIL=$UNTIL deploy-cp-1 node -" \
    <"$ROOT/ops/db-report.cjs" >"$DB" 2>/dev/null; then
    echo "x" >"$DB"   # unparsable on purpose: the count says the JSON is not readable and exits 2
  fi
fi
CP_SSH_KEY="$KEY" CP_HOST="$HOST" count "$DB" "$LOG" "$SINCE" "$UNTIL" "$offline" "$OWN_CHECK"
