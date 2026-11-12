#!/usr/bin/env bash
# What the answers in Conway's tracker brought (kanal 03). Reads only, prints sums only.
#
#   ops/github-yield.sh --since <ISO UTC>                      production: the whole Caddy access log
#                                                              (ops/access-log.sh, rotated files included) and the
#                                                              wallets of the database, opened with readonly: true
#   ops/github-yield.sh --log <file> --since <ISO UTC>         the same count from a file; without --wallets the
#                                                              second line says `not read`
#   ops/github-yield.sh --log <file> --wallets <file> --since <ISO UTC>
#                                                              wallets from a file of JSON lines
#                                                              {"created_at": "<ISO>", "paid": 0|1}
#   ops/github-yield.sh --selftest                             no network: the planted fixture in both directions
#
# For every foreign address (not in ops/own-ips.txt, or in the file CP_OWN_IPS names) the FIRST request
# at or after --since decides how it arrived. It arrived from GitHub when its Referer starts with
# https://github.com/Conway-Research followed by `/` or nothing. It signed in when the same address
# later had `POST /v1/auth/verify` with status 200, and it paid when it later had a request on `/pay/`
# with status 200.
#
#   GITHUB YIELD since <t>: <a> arrived from github.com/Conway-Research, <b> signed in, <c> paid
#   ALL NEW since <t>: <w> new wallets, <p> paying wallets
#   BARE GITHUB REFERRER since <t>: <n> arrived from https://github.com/ without a path, <b> signed in, <c> paid
#   WINDOW since <t>: <lines> log line(s), <f> foreign address(es), up to <last> UTC
#
# The first line is the lower bound: an operator often points `conwayApiUrl` at us without opening the
# page in a browser, and the automaton then calls /v1/auth/nonce from another address without a
# Referer. The second line is the upper bound: every wallet created in the window (our own included),
# and those with at least one `topup` ledger row. The third line exists because GitHub could tighten
# its referrer policy to the bare origin, and an arrival that lost its path must not turn into a
# silent zero.
#
# Exit 2 when the log cannot be read, the own list is missing or empty, the database cannot be read,
# or the window holds not a single line: a zero from an empty window is blindness, not a measurement.
# Exit 1 on a wrong argument.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"

usage() { sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 1; }

# The counting, the same code for production and selftest. No address leaves this block.
# shellcheck disable=SC2016
COUNT_PY='
import datetime, json, re, sys

log_file, wallets_file, own_file, since_arg = sys.argv[1:5]

def fail(msg, code=2):
    print(msg, file=sys.stderr)
    raise SystemExit(code)

if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z", since_arg):
    fail(f"github-yield: --since is no ISO time in UTC: {since_arg}", 1)
since = datetime.datetime.fromisoformat(since_arg.replace("Z", "+00:00")).timestamp()

try:
    own = set()
    for line in open(own_file, encoding="utf-8"):
        line = line.split("#", 1)[0].strip()
        if line:
            own.add(line.split()[0])
except OSError:
    fail(f"github-yield: the own address list is not readable: {own_file}")
if not own:
    fail(f"github-yield: the own address list is empty: {own_file}")

try:
    raw = open(log_file, encoding="utf-8", errors="replace").read()
except OSError:
    fail("github-yield: the access log is not readable. This says nothing about traffic.")

GH = re.compile(r"^https://github\.com/Conway-Research(/|$)", re.I)
BARE = re.compile(r"^https://github\.com/?$", re.I)

lines_in_window = 0
last = None
first = {}     # address -> (ts, referer) of its first request in the window
events = {}    # address -> list of (ts, method, path, status)
for row in raw.splitlines():
    row = row.strip()
    if not row.startswith("{"):
        continue
    try:
        j = json.loads(row)
        ts = float(j["ts"])
        req = j.get("request") or {}
    except Exception:
        continue
    if ts < since:
        continue
    lines_in_window += 1
    last = ts if last is None or ts > last else last
    ip = req.get("client_ip") or req.get("remote_ip") or ""
    if not ip or ip in own:
        continue
    ref = ((req.get("headers") or {}).get("Referer") or [""])[0]
    if ip not in first or ts < first[ip][0]:
        first[ip] = (ts, ref)
    path = (req.get("uri") or "").split("?", 1)[0]
    events.setdefault(ip, []).append((ts, req.get("method") or "", path, j.get("status")))

if lines_in_window == 0:
    fail(f"github-yield: not a single log line since {since_arg}; a zero here would be blindness.")

def funnel(match):
    a = b = c = 0
    for ip, (t0, ref) in first.items():
        if not match.search(ref):
            continue
        a += 1
        later = [e for e in events[ip] if e[0] >= t0]
        if any(m == "POST" and p == "/v1/auth/verify" and s == 200 for _, m, p, s in later):
            b += 1
        if any(p.startswith("/pay/") and s == 200 for _, m, p, s in later):
            c += 1
    return a, b, c

a, b, c = funnel(GH)
print(f"GITHUB YIELD since {since_arg}: {a} arrived from github.com/Conway-Research, {b} signed in, {c} paid")

wallet_failed = False
if wallets_file == "-":
    print(f"ALL NEW since {since_arg}: not read")
else:
    try:
        w = p = 0
        for row in open(wallets_file, encoding="utf-8"):
            row = row.strip()
            if not row:
                continue
            x = json.loads(row)
            created = datetime.datetime.fromisoformat(str(x["created_at"]).replace("Z", "+00:00"))
            if created.tzinfo is None:
                created = created.replace(tzinfo=datetime.timezone.utc)
            if created.timestamp() >= since:
                w += 1
                if int(x.get("paid") or 0) > 0:
                    p += 1
        print(f"ALL NEW since {since_arg}: {w} new wallets, {p} paying wallets")
    except Exception:
        print(f"ALL NEW since {since_arg}: not read")
        wallet_failed = True

ba, bb, bc = funnel(BARE)
print(f"BARE GITHUB REFERRER since {since_arg}: {ba} arrived from https://github.com/ without a path, {bb} signed in, {bc} paid")
end = datetime.datetime.fromtimestamp(last, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
print(f"WINDOW since {since_arg}: {lines_in_window} log line(s), {len(first)} foreign address(es), up to {end} UTC")
raise SystemExit(2 if wallet_failed else 0)
'

# Wallets without address: when each was created, and whether it ever topped up.
# shellcheck disable=SC2016
WALLETS_JS='const db = require("better-sqlite3")(process.argv[1] || "/data/cp.db", { readonly: true }); const rows = db.prepare("SELECT w.created_at AS created_at, EXISTS (SELECT 1 FROM ledger l WHERE l.address = w.address AND l.kind = ?) AS paid FROM wallets w").all("topup"); if (rows.length) console.log(rows.map((r) => JSON.stringify(r)).join("\n"));'

own_list() {
  local own="${CP_OWN_IPS:-$ROOT/ops/own-ips.txt}"
  echo "$own"
}

count() { # log wallets(or -) since
  python3 -c "$COUNT_PY" "$1" "$2" "$(own_list)" "$3"
}

if [[ "${1:-}" == "--selftest" ]]; then
  [[ $# -eq 1 ]] || usage
  ssh() { echo "selftest must not reach the network (ssh)" >&2; return 99; }
  export -f ssh
  fx="$ROOT/ops/fixtures"
  log="$fx/github-yield.log"; wallets="$fx/github-yield-wallets.jsonl"
  export CP_OWN_IPS="$fx/github-yield-own-ips.txt"
  [[ -f "$log" && -f "$wallets" && -f "$CP_OWN_IPS" ]] || { echo "SELFTEST FAILED: fixture missing in $fx"; exit 1; }
  # The window is computed from the fixture: one hour after its first line, which leaves exactly one
  # planted arrival before it.
  since=$(python3 -c '
import datetime, json, sys
t = min(json.loads(l)["ts"] for l in open(sys.argv[1]) if l.strip())
print(datetime.datetime.fromtimestamp(int(t) + 3600, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
' "$log")
  fail=0
  want() { # actual, expected, reason
    if [[ "$1" == "$2" ]]; then echo "ok   $3"; else echo "FAIL $3"; echo "     want: $2"; echo "     got:  $1"; fail=1; fi
  }
  out=$(count "$log" "$wallets" "$since"); rc=$?
  want "$rc" "0" "a full window exits 0"
  want "$(sed -n 1p <<<"$out")" \
    "GITHUB YIELD since $since: 3 arrived from github.com/Conway-Research, 1 signed in, 1 paid" \
    "three GitHub arrivals; one signed in and paid; no referrer, our own address, a 500, a 402, another org and an arrival before the window count nowhere"
  want "$(sed -n 2p <<<"$out")" "ALL NEW since $since: 3 new wallets, 1 paying wallets" \
    "wallets created before the window do not count, the topped up one inside does"
  want "$(sed -n 3p <<<"$out")" \
    "BARE GITHUB REFERRER since $since: 1 arrived from https://github.com/ without a path, 0 signed in, 0 paid" \
    "a referrer cut to the bare origin is reported on its own line"
  leak=$(grep -cE '([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}' <<<"$out")
  want "$leak" "0" "no address and no wallet in the output"
  # The other direction: our own address leaves the list and has to be counted.
  other=$(mktemp); trap 'rm -f "$other"' EXIT
  echo "192.0.2.254 2026-11-12  not in the fixture" >"$other"
  want "$(CP_OWN_IPS="$other" count "$log" - "$since" | sed -n 1p)" \
    "GITHUB YIELD since $since: 4 arrived from github.com/Conway-Research, 2 signed in, 2 paid" \
    "without the own list our planted own address counts, so the filter is what keeps it out"
  # The window moved back before the early arrival: now it counts and signs in.
  early=$(python3 -c '
import datetime, sys
t = datetime.datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00")) - datetime.timedelta(hours=2)
print(t.strftime("%Y-%m-%dT%H:%M:%SZ"))
' "$since")
  want "$(count "$log" - "$early" | sed -n 1p)" \
    "GITHUB YIELD since $early: 4 arrived from github.com/Conway-Research, 2 signed in, 1 paid" \
    "the arrival before the window counts once the window includes it"
  count "$log" - "2099-01-01T00:00:00Z" >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an empty window exits 2 instead of printing zeros"
  CP_OWN_IPS="$fx/no-such-list.txt" count "$log" - "$since" >/dev/null 2>&1; rc=$?
  want "$rc" "2" "a missing own list exits 2"
  if [[ "$fail" -eq 0 ]]; then echo "SELFTEST OK: planted GitHub arrival, sign-in and payment counted, every decoy left out, both directions"; else echo "SELFTEST FAILED"; fi
  exit "$fail"
fi

LOG=""; WALLETS=""; SINCE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --log) [[ $# -ge 2 ]] || usage; LOG="$2"; shift 2 ;;
    --wallets) [[ $# -ge 2 ]] || usage; WALLETS="$2"; shift 2 ;;
    --since) [[ $# -ge 2 ]] || usage; SINCE="$2"; shift 2 ;;
    *) echo "github-yield: unknown argument $1" >&2; usage ;;
  esac
done
[[ -n "$SINCE" ]] || usage

if [[ -n "$LOG" ]]; then
  count "$LOG" "${WALLETS:--}" "$SINCE"
  exit $?
fi
[[ -z "$WALLETS" ]] || { echo "github-yield: --wallets needs --log; production reads the database" >&2; exit 1; }

dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
CP_SSH_KEY="$KEY" CP_HOST="$HOST" bash "$ROOT/ops/access-log.sh" >"$dir/access.jsonl" || {
  echo "github-yield: the access log could not be read. This says nothing about traffic." >&2
  exit 2
}
if ! timeout 60 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" \
  "docker exec deploy-cp-1 node -e $(printf %q "$WALLETS_JS") /data/cp.db" >"$dir/wallets.jsonl" 2>/dev/null; then
  echo "x" >"$dir/wallets.jsonl"   # unparsable on purpose: the second line says `not read` and the exit is 2
fi
count "$dir/access.jsonl" "$dir/wallets.jsonl" "$SINCE"
