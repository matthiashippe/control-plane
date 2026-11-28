#!/usr/bin/env bash
# How much USDC the foreign addresses with a start grant or a topup hold on Base, how many topups of the
# tier 1 USD they made, how /pay/1/ answered them, and whether production sells the tier 1 (kunden 18).
# Reads only, prints counts only.
#
#   ops/usdc-bands.sh --since <ISO UTC> --until <ISO UTC>    production: the ledger through ops/db-report.cjs
#                                    with CP_REPORT=topup-bands (readonly: true, in the container cp), the
#                                    whole Caddy access log (ops/access-log.sh), CP_TOPUP_TIERS_USD with
#                                    `docker exec deploy-cp-1 printenv`, and balanceOf of USDC on Base over
#                                    CP_USDC_RPC (default https://mainnet.base.org)
#   ops/usdc-bands.sh --db-json <f> --log <f> --tiers-json <f> --since <ISO UTC> --until <ISO UTC>
#                                    the same count from files; each flag alone replaces its source
#   ops/usdc-bands.sh --selftest     no network: planted database, log and RPC, every rule in both directions
#   own addresses: conway_own_list from ops/conway-arrivals.sh (CP_OWN_IPS=<file> replaces the list)
#
# Output, exactly in this order, nothing else on stdout (diagnostics go to stderr):
#
#   USDC BANDS since <t> until <u>: <n> foreign addresses with grant or topup, <a> under 1 USDC, <b> from 1 to under 5 USDC, <c> 5 USDC or more, <e> unreadable
#   TOPUPS 1 USD since <t> until <u>: <k> by foreign addresses
#   PAY 1 since <t> until <u>: <p> answers 402, <q> answers 200, <r> other
#   TIER 1 SOLD: <yes|no>
#
# A foreign address is one that oursClause in ops/db-report.cjs does not call ours, with a `grant` or `topup`
# ledger row at since <= created_at < until. Its USDC is read today (block latest): the public RPC gives no
# reliable older state. TOPUPS counts its `topup` rows of the tier 1 in the window: meta.usd 1 (/pay/1/, 101000 mc
# with the bonus), or 100000 mc without meta.usd (a direct transfer); see CP_REPORT=topup-bands. PAY 1 counts every
# request on /pay/1 or below /pay/1/ from an address not on the own list, since <= ts < until, by status.
# The tier 1 is sold when CP_TOPUP_TIERS_USD holds 1; empty or not set means the list TOPUP_TIERS_USD of the
# image, as payConfigFromEnv in src/payments/pay.ts reads it. The counting lives in ops/usdc_bands.py.
#
# The addresses exist on this machine only in a temp file of mode 0600 that this script deletes; no address,
# hash, IP or amount per address reaches the output. Exit 2 when the database, the log, the tiers or the RPC
# cannot be read. Exit 1 on a wrong argument or a time that is not strict ISO UTC.
set -uo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELF="$ROOT/ops/usdc-bands.sh"
# shellcheck source=ops/conway-arrivals.sh
source "$ROOT/ops/conway-arrivals.sh"
PY="$ROOT/ops/usdc_bands.py"

usage() { sed -n '5,14p' "$SELF" | sed 's/^# \{0,1\}//' >&2; exit 1; }

count() { # db-json log tiers-json since until; own addresses from own_ips with CP_HOST and CP_SSH_KEY as set
  local own rc
  own=$(mktemp)
  if ! conway_own_list "$own"; then
    rm -f "$own"
    return 2
  fi
  python3 -B "$PY" count "$1" "$2" "$own" "$3" "$4" "$5"
  rc=$?
  rm -f "$own"
  return "$rc"
}

tiers_json() { # env-value-or-empty env-set(0|1) image-list-or-empty > json
  python3 -B -c 'import json, sys
print(json.dumps({"env": sys.argv[1] if sys.argv[2] == "1" else None, "image": sys.argv[3] or None}))' "$1" "$2" "$3"
}

if [[ "${1:-}" == "--selftest" ]]; then
  [[ $# -eq 1 ]] || usage
  # No network: a fake ssh first on PATH answers nothing, CP_OWN_IPS_SEEN points into the temp dir, and the
  # RPC is ops/usdc_bands.py fake-rpc on 127.0.0.1 with a port the system picks. No fixture files: the
  # database, the log, the balances and the own list are written into the temp dir here.
  stub=$(mktemp -d)
  rpc_pid=""
  cleanup() { [[ -n "$rpc_pid" ]] && kill "$rpc_pid" 2>/dev/null; rm -rf "$stub"; }
  trap cleanup EXIT
  printf '#!/bin/sh\nexit 255\n' >"$stub/ssh"
  chmod +x "$stub/ssh"
  export PATH="$stub:$PATH" CP_OWN_IPS_SEEN="$stub/seen.txt"
  unset CP_OWN_IPS_WRITE
  own_ip="192.0.2.254"
  printf '%s 2026-11-27  planted own address\n' "$own_ip" >"$stub/own.txt"
  printf '192.0.2.253 2026-11-27  not in any planted line\n' >"$stub/other.txt"
  export CP_OWN_IPS="$stub/own.txt"
  S="2026-11-06T00:00:00Z"; U="2026-11-28T00:00:00Z"
  T0=1793923200; T1=1795824000   # S and U as unix seconds

  # Planted wallets, one per rule. OURS is the first address of OURS in ops/db-report.cjs, so the report
  # itself has to leave it out; it holds 2 USDC, which would count in the band.
  a099="0x$(printf '11%.0s' {1..20})"; a100="0x$(printf '22%.0s' {1..20})"; a499="0x$(printf '33%.0s' {1..20})"
  a500="0x$(printf '44%.0s' {1..20})"; abad="0x$(printf '55%.0s' {1..20})"; aold="0x$(printf '66%.0s' {1..20})"
  ours=$(grep -m1 -oE '"0x[0-9a-f]{40}"' <(sed -n '/^const OURS = \[/,/^\];/p' "$ROOT/ops/db-report.cjs") | tr -d '"')
  [[ -n "$ours" ]] || { echo "SELFTEST FAILED: no address in OURS of ops/db-report.cjs"; exit 1; }

  # A database with the tables the report reads before its blocks, and the planted ledger rows.
  python3 -B - "$stub/cp.db" "$a099" "$a100" "$a499" "$a500" "$abad" "$aold" "$ours" <<'PYEOF'
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
a099, a100, a499, a500, abad, aold, ours = sys.argv[2:9]
db.executescript("""
create table wallets (address text primary key, balance_mc integer not null default 0, reserved_mc integer not null default 0);
create table api_keys (id integer primary key, address text, name text, revoked_at text);
create table automatons (id integer primary key);
create table payments (id integer primary key, status text, created_at text);
create table ledger (id integer primary key, address text, kind text, delta_mc integer, ref text, meta text, created_at text);
""")
# The meta as the service books it (kunden 19): /pay/1/ credits 1 USD plus the bonus of one cent, 101000 mc,
# with meta.usd 1; a direct transfer of 1 USDC books 100000 mc without meta.usd.
pay = lambda usd: json.dumps({"tx_hash": "0x" + "ab" * 32, "value_atomic": str(usd * 1000000), "usd": usd, "bonus_cents": 1})
direct = json.dumps({"source": "spend_permission", "chain_id": 8453, "usdc": "1000000"})
rows = [
    (a099, "grant", 15000, "2026-11-06T00:00:00.000Z", "{}"),   # exactly at --since: counts
    (a100, "topup", 101000, "2026-11-10T12:00:00.000Z", pay(1)),  # 1 USD over /pay/1/ with the bonus
    (a100, "grant", 15000, "2026-11-10T11:00:00.000Z", "{}"),   # the same address twice: one address
    (a499, "topup", 100000, "2026-11-12T12:00:00.000Z", direct),  # 1 USDC by direct transfer
    (a500, "topup", 505000, "2026-11-14T12:00:00.000Z", pay(5)),  # 5 USD: no topup of the tier 1
    (a500, "topup", 501000, "2026-11-14T13:00:00.000Z", pay(5)),  # 5 USD as /pay/5/ books it: no
    (a500, "topup", 100000, "2026-11-14T14:00:00.000Z", pay(5)),  # 100000 mc, but meta.usd 5: no
    (abad, "grant", 15000, "2026-11-20T12:00:00.000Z", "{}"),
    (aold, "topup", 101000, "2026-11-05T23:59:59.999Z", pay(1)),  # before --since: neither address nor topup
    (aold, "inference", -500, "2026-11-20T12:00:00.000Z", "{}"),  # a row of another kind does not count
    (ours, "topup", 101000, "2026-11-15T12:00:00.000Z", pay(1)),  # ours: neither address nor topup
    (ours, "grant", 15000, "2026-11-15T11:00:00.000Z", "{}"),
]
db.executemany("insert into ledger (address, kind, delta_mc, ref, meta, created_at) values (?, ?, ?, '', ?, ?)",
               [(a, k, d, m, t) for a, k, d, t, m in rows])
db.commit()
PYEOF
  report() { # since until > the JSON of CP_REPORT=topup-bands against the planted database
    (cd "$ROOT" && CP_DB_PATH="$stub/cp.db" CP_REPORT=topup-bands CP_SINCE="$1" CP_UNTIL="$2" node - <"$ROOT/ops/db-report.cjs")
  }
  report "$S" "$U" >"$stub/db.json" 2>"$stub/db.err" || { echo "SELFTEST FAILED: the report did not run"; sed -E 's/0x[0-9a-fA-F]{40}/<masked>/g' "$stub/db.err" >&2; exit 1; }

  balances() { # json of the planted balances, first argument the balance of a499 and a100 in atomic USDC
    printf '{"%s": 990000, "%s": %s, "%s": %s, "%s": 5000000, "%s": "error", "%s": 2000000, "%s": 2000000}\n' \
      "$a099" "$a100" "$1" "$a499" "$2" "$a500" "$abad" "$aold" "$ours"
  }
  start_rpc() { # balances-json: starts the fake RPC and sets CP_USDC_RPC
    [[ -n "$rpc_pid" ]] && { kill "$rpc_pid" 2>/dev/null; wait "$rpc_pid" 2>/dev/null; }
    rm -f "$stub/port"
    python3 -B "$PY" fake-rpc "$1" "$stub/port" &
    rpc_pid=$!
    for _ in $(seq 1 100); do [[ -s "$stub/port" ]] && break; sleep 0.05; done
    export CP_USDC_RPC="http://127.0.0.1:$(cat "$stub/port")"
  }
  balances 1000000 4990000 >"$stub/bal.json"
  balances 900000 5100000 >"$stub/bal-none.json"
  start_rpc "$stub/bal.json"

  line() { # ts ip method uri status: one Caddy JSON access line
    printf '{"ts": %s, "status": %s, "request": {"client_ip": "%s", "remote_ip": "%s", "method": "%s", "uri": "%s", "headers": {"User-Agent": ["node"], "Referer": [""]}}}\n' \
      "$1" "$5" "$2" "$2" "$3" "$4"
  }
  {
    line "$T0" 203.0.113.10 GET "/pay/1/$a100" 402             # at --since: counts, 402
    line $((T0 + 60)) 203.0.113.10 GET "/pay/1/$a100" 200      # 200
    line $((T0 + 61)) 203.0.113.11 GET "/pay/1/$a499?x=1" 402  # the query does not change the path
    line $((T0 + 62)) 203.0.113.12 GET "/pay/1" 400            # other
    line $((T0 + 63)) "$own_ip" GET "/pay/1/$a100" 402         # own: not counted
    line $((T0 + 64)) 203.0.113.13 GET "/pay/10/$a100" 402     # another tier
    line $((T0 + 65)) 203.0.113.13 GET "/pay/5/$a100" 402      # another tier
    line $((T0 - 1)) 203.0.113.14 GET "/pay/1/$a100" 402       # one second before --since
    line "$T1" 203.0.113.15 GET "/pay/1/$a100" 402             # exactly at --until
  } >"$stub/access.log"
  tiers_json "" 0 "1,5,25,100,500,1000,2500" >"$stub/tiers-unset.json"
  tiers_json "" 1 "1,5,25,100,500,1000,2500" >"$stub/tiers-empty.json"
  tiers_json "5,25,100,500,1000,2500" 1 "1,5,25,100,500,1000,2500" >"$stub/tiers-no-one.json"
  tiers_json "1, 5,25" 1 "5,25" >"$stub/tiers-one.json"
  tiers_json "" 0 "" >"$stub/tiers-none.json"

  fail=0
  # Never echo the planted addresses: on a mismatch the output goes to stderr with every address masked.
  want() { # actual, expected, reason
    if [[ "$1" == "$2" ]]; then echo "ok $3"; else
      echo "FAIL $3"
      sed -E 's/([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}/<masked>/g; s/^/     got: /' <<<"$1" >&2
      fail=1
    fi
  }
  run() { count "${1:-$stub/db.json}" "$stub/access.log" "${2:-$stub/tiers-unset.json}" "$S" "$U" 2>/dev/null; }
  field() { # line-number field-number of the USDC BANDS line etc.
    sed -n "${1}p" | awk -v f="$2" '{print $f}'
  }
  bands="$(run | sed -n 1p)"
  b() { awk -v f="$1" '{print $f}' <<<"$bands"; }
  want "$(b 18)" "2" "1.00 and 4.99 USDC count in the band from 1 to under 5 USDC"
  want "$(b 14)" "1" "0.99 USDC counts under 1 USDC, not in the band"
  want "$(b 25)" "1" "5.00 USDC counts as 5 USDC or more, not in the band"
  want "$(b 30)" "1" "an address the RPC gives no balance for counts as unreadable, nowhere else"
  want "$(b 7)" "5" "five foreign addresses: the address twice in the ledger is one, ours and the one before --since are none"
  want "$bands" "USDC BANDS since $S until $U: 5 foreign addresses with grant or topup, 1 under 1 USDC, 2 from 1 to under 5 USDC, 1 5 USDC or more, 1 unreadable" \
    "the whole band line, so our own address with 2 USDC counts nowhere"
  # The other direction of the own rule: the same 2 USDC on a foreign address in the window do count.
  python3 -B -c 'import json, sys
d = json.load(open(sys.argv[1])); d["addresses"].append(sys.argv[2]); json.dump(d, open(sys.argv[3], "w"))' \
    "$stub/db.json" "$ours" "$stub/db-with-ours.json"
  want "$(run "$stub/db-with-ours.json" | field 1 18)" "3" \
    "the same 2 USDC count in the band once the report lets the address through, so the report is what keeps ours out"
  start_rpc "$stub/bal-none.json"
  want "$(run | field 1 18)" "0" "without a planted address between 1 and 5 USDC the band is 0"
  want "$(run | field 1 25)" "2" "the two moved out of the band count as 5 USDC or more and under 1 USDC instead"
  start_rpc "$stub/bal.json"

  want "$(run | sed -n 2p)" "TOPUPS 1 USD since $S until $U: 2 by foreign addresses" \
    "two foreign topups of 1 USD count; ours, the one before --since and the one of 5 USD do not"
  report "2026-11-05T00:00:00Z" "$U" >"$stub/db-early.json" 2>/dev/null
  want "$(python3 -B -c 'import json, sys; print(json.load(open(sys.argv[1]))["topups_1usd"])' "$stub/db-early.json")" "3" \
    "moving --since back by a day takes the early topup of 1 USD in, so the window is what keeps it out"
  topups() { # since until > topups_1usd of the report against the planted database
    report "$1" "$2" | python3 -B -c 'import json, sys; print(json.load(sys.stdin)["topups_1usd"])'
  }
  want "$(topups 2026-11-10T00:00:00Z 2026-11-11T00:00:00Z 2>/dev/null)" "1" \
    "a topup over /pay/1/ with its bonus of 101000 mc and meta.usd 1 counts as the tier 1"
  want "$(topups 2026-11-12T00:00:00Z 2026-11-13T00:00:00Z 2>/dev/null)" "1" \
    "a direct transfer of 100000 mc without meta.usd counts as the tier 1"
  want "$(topups 2026-11-14T00:00:00Z 2026-11-15T00:00:00Z 2>/dev/null)" "0" \
    "505000 and 501000 mc with meta.usd 5 and 100000 mc with meta.usd 5 never count as the tier 1"

  want "$(run | sed -n 3p)" "PAY 1 since $S until $U: 2 answers 402, 1 answers 200, 1 other" \
    "PAY 1 counts the foreign answers on /pay/1 by status; own, other tiers and lines outside the window do not count"
  want "$(CP_OWN_IPS="$stub/other.txt" run | field 3 7)" "3" \
    "without its own list entry the 402 to our own address counts, so the filter is what keeps it out"

  want "$(run "" "$stub/tiers-unset.json" | sed -n 4p)" "TIER 1 SOLD: yes" "CP_TOPUP_TIERS_USD not set means the list of the image, which holds 1"
  want "$(run "" "$stub/tiers-empty.json" | sed -n 4p)" "TIER 1 SOLD: yes" "an empty CP_TOPUP_TIERS_USD means the list of the image, so yes"
  want "$(run "" "$stub/tiers-no-one.json" | sed -n 4p)" "TIER 1 SOLD: no" "a CP_TOPUP_TIERS_USD without 1 means no"
  want "$(run "" "$stub/tiers-one.json" | sed -n 4p)" "TIER 1 SOLD: yes" "a CP_TOPUP_TIERS_USD with 1 means yes, even when the image lacks it"

  out=$(run); rc=$?
  want "$rc" "0" "a readable database, log, tiers and RPC exit 0"
  want "$(wc -l <<<"$out" | tr -d ' ')" "4" "exactly four lines of output"
  leak=$(grep -ciE '([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}' <<<"$out")
  want "$leak" "0" "no address, no wallet and no IP in the output"

  run "" "$stub/tiers-none.json" >/dev/null; rc=$?
  want "$rc" "2" "no readable tiers exit 2"
  count "$stub/no-such.json" "$stub/access.log" "$stub/tiers-unset.json" "$S" "$U" >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an unreadable ledger report exits 2"
  count "$stub/db.json" "$stub/no-such.log" "$stub/tiers-unset.json" "$S" "$U" >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an unreadable log exits 2"
  kill "$rpc_pid" 2>/dev/null; wait "$rpc_pid" 2>/dev/null; rpc_pid=""
  run >/dev/null; rc=$?
  want "$rc" "2" "an RPC that gives no answer exits 2"
  bash "$SELF" --db-json "$stub/db.json" --log "$stub/access.log" --tiers-json "$stub/tiers-unset.json" \
    --since yesterday --until "$U" >/dev/null 2>&1; rc=$?
  want "$rc" "1" "a time that is not strict ISO UTC exits 1"
  bash "$SELF" --since "$U" --until "$S" >/dev/null 2>&1; rc=$?
  want "$rc" "1" "--since after --until exits 1"

  if [[ "$fail" -eq 0 ]]; then
    echo "SELFTEST OK: every planted case counted or left out as planted, in both directions"
  else echo "SELFTEST FAILED"; fi
  exit "$fail"
fi

DB=""; LOG=""; TIERS=""; SINCE=""; UNTIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-json) [[ $# -ge 2 ]] || usage; DB="$2"; shift 2 ;;
    --log) [[ $# -ge 2 ]] || usage; LOG="$2"; shift 2 ;;
    --tiers-json) [[ $# -ge 2 ]] || usage; TIERS="$2"; shift 2 ;;
    --since) [[ $# -ge 2 ]] || usage; SINCE="$2"; shift 2 ;;
    --until) [[ $# -ge 2 ]] || usage; UNTIL="$2"; shift 2 ;;
    *) echo "usdc-bands: unknown argument $1" >&2; usage ;;
  esac
done
[[ -n "$SINCE" && -n "$UNTIL" ]] || usage
# The window is checked before anything is read, so a wrong time is exit 1 and never an ssh call.
python3 -B "$PY" window "$SINCE" "$UNTIL" || exit 1

# Production needs hosts and keys. Read from loop.env when the environment has none, in a subshell: only
# these four values come out, the other secrets in that file never reach ssh or python.
env_file="$HOME/.config/control-plane/loop.env"
if [[ ( -z "${CP_HOST:-}" || -z "${CP_SSH_KEY:-}" || -z "${CP_DEPLOY_HOST:-}" || -z "${CP_DEPLOY_KEY:-}" ) && -f "$env_file" ]]; then
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
chmod 700 "$dir"
if [[ -z "$LOG" ]]; then
  LOG="$dir/access.jsonl"
  CP_SSH_KEY="$KEY" CP_HOST="$HOST" bash "$ROOT/ops/access-log.sh" >"$LOG" || {
    echo "usdc-bands: the access log could not be read. This says nothing about traffic." >&2
    exit 2
  }
fi
if [[ -z "$DB" ]]; then
  # Read only: the report opens the database with readonly: true; `docker exec` into the running container
  # starts nothing and changes nothing. The file holds addresses: mode 0600, deleted with the temp dir.
  DB=$(mktemp "$dir/ledger.XXXXXX"); chmod 600 "$DB"
  if ! timeout 120 ssh -i "$DKEY" -o BatchMode=yes -o ConnectTimeout=10 "$DHOST" \
    "docker exec -i -e CP_REPORT=topup-bands -e CP_SINCE=$SINCE -e CP_UNTIL=$UNTIL deploy-cp-1 node -" \
    <"$ROOT/ops/db-report.cjs" >"$DB" 2>/dev/null; then
    echo "x" >"$DB"   # unparsable on purpose: the count says the report is not readable and exits 2
  fi
fi
if [[ -z "$TIERS" ]]; then
  # The value of CP_TOPUP_TIERS_USD in the running container (printenv exits 1 when it is not set) and the
  # list TOPUP_TIERS_USD of the image, read from its build with grep. Both read only.
  TIERS="$dir/tiers.json"
  remote=$(timeout 60 ssh -i "$DKEY" -o BatchMode=yes -o ConnectTimeout=10 "$DHOST" bash -s <<'REMOTE' 2>/dev/null
image=$(docker exec deploy-cp-1 grep -oE 'TOPUP_TIERS_USD = \[[0-9, ]*\]' /app/dist/payments/pay.js | head -1)
printf 'image=%s\n' "$image"
value=$(docker exec deploy-cp-1 printenv CP_TOPUP_TIERS_USD); rc=$?
printf 'rc=%s\n' "$rc"
printf 'env=%s\n' "$value"
REMOTE
  )
  image=$(sed -n 's/^image=TOPUP_TIERS_USD = \[\([0-9, ]*\)\]$/\1/p' <<<"$remote")
  rc=$(sed -n 's/^rc=//p' <<<"$remote"); value=$(sed -n 's/^env=//p' <<<"$remote")
  case "$rc" in
    0) tiers_json "$value" 1 "$image" >"$TIERS" ;;
    1) tiers_json "" 0 "$image" >"$TIERS" ;;
    *) echo "x" >"$TIERS" ;;   # unparsable on purpose: exit 2
  esac
fi
CP_SSH_KEY="$KEY" CP_HOST="$HOST" count "$DB" "$LOG" "$TIERS" "$SINCE" "$UNTIL"
