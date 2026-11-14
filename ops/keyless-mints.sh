#!/usr/bin/env bash
# How many keyless keys were asked for, per day, kind of caller and status, without our own addresses.
#
# From 2026-11-11 on a declared crawler took all 200 places of `POST /v1/auth/keyless` every day, and
# runtimes that came later (user agent `node`) got 429 `daily_limit` (goals/anmeldung/01). That was
# counted once by hand from the access log. This makes the count repeatable, so the fix can be checked
# against the same numbers it was built on.
#
#   ops/keyless-mints.sh                         the live access log via ops/access-log.sh (read only)
#   ops/keyless-mints.sh --file <log>            a local log in Caddy's JSON format
#   ops/keyless-mints.sh --since <YYYY-MM-DD>    first day counted, inclusive, UTC (also --until)
#   ops/keyless-mints.sh --classify              user agents on stdin, one kind per line on stdout
#   ops/keyless-mints.sh --selftest              proves the count in both directions, without network
#
# Kinds: `crawler` for a declared crawler (a link and the word crawler, bot or indexer; the same rule
# as isDeclaredCrawler in src/auth/keyless.ts, test/keyless-crawler.test.ts holds both to the same
# answer), `node` for a user agent that is `node` or starts with `node/` (what the runtime sends),
# `other` for everything else.
#
# Only sums leave this script, never an address and never a user agent in its words. Our own addresses
# come from own_ips in ops/own-ips.sh, the same answer every traffic tool gets; without a list that
# names at least one address it stops with exit 2 before it prints a number, because a missing list
# must never read as an empty one. own_ips may name the live address on stderr, so its stderr is
# dropped.
set -uo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")/.."

# The one place the tool decides the kind of a caller.
KIND_PY=$(cat <<'PY'
def kind(ua):
    low = ua.lower()
    if ("http://" in ua or "https://" in ua) and any(w in low for w in ("crawler", "bot", "indexer")):
        return "crawler"
    if ua == "node" or ua.startswith("node/"):
        return "node"
    return "other"
PY
)

CLASSIFY_PY=$(cat <<'PY'
import sys
for line in sys.stdin:
    print(kind(line.rstrip("\r\n")))
PY
)

COUNT_PY=$(cat <<'PY'
import datetime, json, os, sys
own = set(os.environ.get("KM_OWN", "").split())
since = os.environ.get("KM_SINCE") or None
until = os.environ.get("KM_UNTIL") or None
order = {"crawler": 0, "node": 1, "other": 2}
counts = {}
left_out = 0
for line in sys.stdin:
    line = line.strip()
    if not line.startswith("{"):
        continue
    try:
        d = json.loads(line)
    except Exception:
        continue
    r = d.get("request") or {}
    if r.get("method") != "POST":
        continue
    if (r.get("uri") or "").split("?", 1)[0] != "/v1/auth/keyless":
        continue
    try:
        day = datetime.datetime.fromtimestamp(float(d["ts"]), datetime.timezone.utc).strftime("%Y-%m-%d")
        status = int(d.get("status", 0))
    except Exception:
        continue
    if (since and day < since) or (until and day > until):
        continue
    ip = r.get("client_ip") or r.get("remote_ip") or ""
    if ip in own:
        left_out += 1
        continue
    agents = (r.get("headers") or {}).get("User-Agent") or [""]
    ua = agents[0] if isinstance(agents, list) and agents and isinstance(agents[0], str) else ""
    k = kind(ua)
    key = (day, order[k], k, status)
    counts[key] = counts.get(key, 0) + 1
print("| day | caller | status | requests |")
print("|---|---|---|---|")
for (day, _, k, status), n in sorted(counts.items()):
    print(f"| {day} | {k} | {status} | {n} |")
print(f"own addresses left out: {left_out}")
PY
)

selftest() {
  local t out err rc fail=0
  t=$(mktemp -d) || exit 1
  trap 'rm -rf "$t"' EXIT
  mkdir "$t/bin"
  printf '#!/bin/sh\necho called >> "%s/ssh-calls"\nexit 255\n' "$t" > "$t/bin/ssh"
  chmod +x "$t/bin/ssh"
  printf '203.0.113.99 2026-11-01  planted own address\n' > "$t/own.txt"
  # 2026-11-11 12:00 UTC. A 429 of a runtime that must show up, a crawler key, a key from our own
  # address that must not, and a GET that is not a mint.
  cat > "$t/caddy.jsonl" <<'LOG'
{"ts":1794398400,"request":{"client_ip":"192.0.2.50","method":"POST","uri":"/v1/auth/keyless","headers":{"User-Agent":["node"]}},"status":429}
{"ts":1794398401,"request":{"client_ip":"198.51.100.10","method":"POST","uri":"/v1/auth/keyless","headers":{"User-Agent":["ExampleCrawler/1.0 (+https://crawler.example/about)"]}},"status":201}
{"ts":1794398402,"request":{"client_ip":"203.0.113.99","method":"POST","uri":"/v1/auth/keyless","headers":{"User-Agent":["node"]}},"status":201}
{"ts":1794398403,"request":{"client_ip":"192.0.2.51","method":"GET","uri":"/v1/auth/keyless","headers":{"User-Agent":["node"]}},"status":405}
LOG
  run() {
    env -u CP_OWN_IPS -u CP_OWN_IPS_WRITE PATH="$t/bin:$PATH" HOME="$t" CP_OWN_IPS_FILE="$1" \
      CP_OWN_IPS_SEEN="$t/seen.txt" bash "$SELF" --file "$t/caddy.jsonl" > "$t/out" 2> "$t/err"
  }
  check() {
    if eval "$2"; then echo "ok: $1"; else echo "FAIL: $1"; fail=1; fi
  }

  run "$t/own.txt"; rc=$?
  out=$(cat "$t/out"); err=$(cat "$t/err")
  check "exit 0 with a list of own addresses" '[[ $rc -eq 0 ]]'
  check "the planted 429 of a runtime is counted, so a zero is not blindness" \
    'grep -Fxq "| 2026-11-11 | node | 429 | 1 |" <<<"$out"'
  check "the crawler key is counted as a crawler" 'grep -Fxq "| 2026-11-11 | crawler | 201 | 1 |" <<<"$out"'
  check "the key from our own address is not counted" '! grep -Fq "| node | 201 |" <<<"$out"'
  check "and is reported as left out" 'grep -Fxq "own addresses left out: 1" <<<"$out"'
  check "the GET is not a mint" '! grep -Fq "| 405 |" <<<"$out"'
  check "no planted address on stdout or stderr" \
    '! grep -Eq "192\.0\.2\.5[01]|198\.51\.100\.10|203\.0\.113\.99" <<<"$out$err"'
  check "no planted user agent on stdout or stderr" '! grep -Fq "ExampleCrawler" <<<"$out$err"'

  printf '# no own address\n' > "$t/empty.txt"
  run "$t/empty.txt"; rc=$?
  out=$(cat "$t/out"); err=$(cat "$t/err")
  check "exit 2 when the own list names no address" '[[ $rc -eq 2 ]]'
  check "and no count is printed then" '! grep -q "^|" <<<"$out"'
  check "and stderr names own_ips" 'grep -Fq "own_ips" <<<"$err"'

  if [[ $fail -ne 0 ]]; then
    echo "KEYLESS MINTS SELFTEST FAILED"
    exit 1
  fi
  echo "KEYLESS MINTS SELFTEST OK"
  exit 0
}

FILE=""
SINCE=""
UNTIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --classify) python3 -c "$KIND_PY"$'\n'"$CLASSIFY_PY"; exit $? ;;
    --selftest) selftest ;;
    --file) FILE="${2:-}"; shift 2 ;;
    --since) SINCE="${2:-}"; shift 2 ;;
    --until) UNTIL="${2:-}"; shift 2 ;;
    *) echo "usage: ops/keyless-mints.sh [--file <log>] [--since YYYY-MM-DD] [--until YYYY-MM-DD] | --classify | --selftest" >&2; exit 2 ;;
  esac
done
for d in "$SINCE" "$UNTIL"; do
  if [[ -n "$d" && ! "$d" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "keyless-mints: --since and --until take a day as YYYY-MM-DD." >&2
    exit 2
  fi
done

# Our own addresses, before any number. The list has to name at least one address in its own lines:
# own_ips alone would still answer with the live address when the list is empty.
source ops/own-ips.sh
if ! grep -v '^#' "$CP_OWN_IPS_FILE" 2>/dev/null | awk 'NF { found = 1 } END { exit !found }'; then
  echo "keyless-mints: own_ips has no list that names our own addresses, so nothing is counted." >&2
  exit 2
fi
if ! own=$(own_ips 2>/dev/null) || [[ -z "$own" ]]; then
  echo "keyless-mints: own_ips could not name our own addresses, so nothing is counted." >&2
  exit 2
fi

if [[ -n "$FILE" ]]; then
  if [[ ! -r "$FILE" ]]; then
    echo "keyless-mints: the log file cannot be read." >&2
    exit 2
  fi
  read_log() { cat -- "$FILE"; }
else
  read_log() { ./ops/access-log.sh 2>/dev/null; }
fi

if ! table=$(read_log | KM_OWN="$own" KM_SINCE="$SINCE" KM_UNTIL="$UNTIL" python3 -c "$KIND_PY"$'\n'"$COUNT_PY"); then
  echo "keyless-mints: the access log could not be read, which is not a finding about traffic." >&2
  exit 2
fi
printf '%s\n' "$table"
