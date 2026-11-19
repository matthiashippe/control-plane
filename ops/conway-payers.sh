#!/usr/bin/env bash
# Who still pays Conway, and whether they know us (kunden 02). Reads only, names no address and no hash.
#
#   ops/conway-payers.sh                       production: the transfers to Conway from the base file in
#                                              the repo and /opt/control-plane/conway-money/delta.csv on
#                                              the server (ssh cat), our wallets through ops/db-report.cjs
#                                              with CP_REPORT=wallets (readonly: true, in the container cp)
#   ops/conway-payers.sh --transfers <csv> [--transfers <csv> ...] --db-json <file>
#                                              the same count from files; either flag alone replaces its source
#   ops/conway-payers.sh --selftest            no network, both directions
#   CP_PAYERS_LIST=<file>                      also writes the topped-up payers of the window to <file>
#                                              (mode 0600, for ops/conway-reach.py); stdout stays the same
#
# Window and threshold as docs/research/data/conway-money-metrics.py: the 30 days before the newest
# transfer in the data, a topup is a transfer of at least 5 USDC, duplicate rows (tx_hash, from, usdc)
# count once, addresses in lowercase. A wallet whose SHA-256 is in `ours` counts nowhere and only shows
# up in `ours left out`.
#
#   PAYERS window <from> to <to>: <w> wallets, <t> topped up, <usdc> USDC, <o> ours left out
#   OVERLAP topped up: <t> wallets, <a> known here, <b> with inference here, <c> paid here, <d> paid Conway after their last payment here
#   OVERLAP all: <w> wallets, <a> known here, <b> with inference here, <c> paid here, <d> paid Conway after their last payment here
#
# Exit 1 on a wrong argument, exit 2 when a transfer file or the JSON cannot be read or holds no transfer.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_CSV="$ROOT/docs/research/data/2026-09-19-conway-payto-transfers.csv"
DELTA_REMOTE="/opt/control-plane/conway-money/delta.csv"

usage() { sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 1; }

# The counting, the same code for production, files and selftest. No address and no hash leaves it.
# shellcheck disable=SC2016
COUNT_PY='
import csv, datetime, decimal, hashlib, json, os, sys

FIELDS = ["block", "timestamp_utc", "from", "usdc", "tx_hash"]
TOPUP_MIN_USDC = decimal.Decimal("5")

def fail(msg):
    print(f"conway-payers: {msg}", file=sys.stderr)
    raise SystemExit(2)

def when(value):
    return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))

db_file, paths = sys.argv[1], sys.argv[2:]
rows = {}
for path in paths:
    try:
        with open(path, encoding="utf-8") as handle:
            has_header = handle.readline().startswith("block,")
            handle.seek(0)
            reader = csv.DictReader(handle) if has_header else csv.DictReader(handle, FIELDS)
            for row in reader:
                if not row.get("tx_hash"):
                    continue
                # The key of conway-money-metrics.py, so a delta that overlaps the base counts once.
                rows[row["tx_hash"] + ":" + row["from"] + ":" + row["usdc"]] = {
                    "at": row["timestamp_utc"],
                    "from": row["from"].lower(),
                    "usdc": decimal.Decimal(row["usdc"]),
                }
    except (OSError, UnicodeDecodeError, KeyError, decimal.InvalidOperation, csv.Error):
        fail("a transfer file is not readable. This says nothing about payers.")
if not rows:
    fail("no transfers in the given files. This says nothing about payers.")
try:
    with open(db_file, encoding="utf-8") as handle:
        data = json.load(handle)
    ours = {str(h) for h in data["ours"]}
    here = {}
    for w in data["wallets"]:
        here[str(w["h"])] = {
            "wallet": bool(w["wallet"]),
            "inference": int(w["inference_rows"]) > 0,
            "paid": int(w["paid"]) > 0,
            "last": when(w["last_paid_at"]) if w.get("last_paid_at") else None,
        }
except Exception:
    fail("the wallet JSON is not readable. This says nothing about payers.")

newest = max(r["at"] for r in rows.values())
end = datetime.datetime.strptime(newest, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
cutoff = (end - datetime.timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")

def sha(address):
    return hashlib.sha256(address.encode()).hexdigest()

window = [r for r in rows.values() if r["at"] >= cutoff]
in_window = {r["from"] for r in window}
left_out = {a for a in in_window if sha(a) in ours}
payers = in_window - left_out
topped = {r["from"] for r in window if r["from"] in payers and r["usdc"] >= TOPUP_MIN_USDC}
usdc = sum((r["usdc"] for r in window if r["from"] in payers), decimal.Decimal(0))
last_conway = {}
for r in rows.values():
    if r["from"] in payers and (r["from"] not in last_conway or r["at"] > last_conway[r["from"]]):
        last_conway[r["from"]] = r["at"]

def overlap(wallets):
    known = inference = paid = after = 0
    for a in wallets:
        w = here.get(sha(a))
        if not w:
            continue
        known += 1 if w["wallet"] else 0
        inference += 1 if w["inference"] else 0
        paid += 1 if w["paid"] else 0
        if w["last"] is not None and when(last_conway[a]) > w["last"]:
            after += 1
    return (f"{len(wallets)} wallets, {known} known here, {inference} with inference here, "
            f"{paid} paid here, {after} paid Conway after their last payment here")

# CP_PAYERS_LIST=<file>: the topped-up payers of the window, one lowercase address per line, for
# ops/conway-reach.py on this machine. Never printed; the file is a temp file of the caller, mode 0600.
target = os.environ.get("CP_PAYERS_LIST")
if target:
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write("".join(a + "\n" for a in sorted(topped)))

total = usdc.quantize(decimal.Decimal("0.01"), rounding=decimal.ROUND_HALF_UP)
print(f"PAYERS window {cutoff} to {newest}: {len(payers)} wallets, {len(topped)} topped up, {total} USDC, {len(left_out)} ours left out")
print(f"OVERLAP topped up: {overlap(topped)}")
print(f"OVERLAP all: {overlap(payers)}")
'

count() { # db-json transfers...
  python3 -c "$COUNT_PY" "$@"
}

if [[ "${1:-}" == "--selftest" ]]; then
  [[ $# -eq 1 ]] || usage
  # No network: a fake ssh answers nothing, so a slip into the production path fails instead of reading.
  stub=$(mktemp -d); trap 'rm -rf "$stub"' EXIT
  printf '#!/bin/sh\nexit 255\n' >"$stub/ssh"
  chmod +x "$stub/ssh"
  export PATH="$stub:$PATH"
  fx="$ROOT/ops/fixtures"
  db="$fx/conway-payers-db.json"; tr="$fx/conway-payers-transfers.csv"
  [[ -f "$db" && -f "$tr" ]] || { echo "SELFTEST FAILED: fixture missing in $fx"; exit 1; }
  W="PAYERS window 2026-10-19T12:00:00Z to 2026-11-18T12:00:00Z"
  fail=0
  want() { # actual, expected, reason
    if [[ "$1" == "$2" ]]; then echo "ok   $3"; else echo "FAIL $3"; echo "     want: $2"; echo "     got:  $1"; fail=1; fi
  }
  edit_json() { # python expression on j, out file
    python3 -c 'import json,sys; j=json.load(open(sys.argv[1])); exec(sys.argv[2]); json.dump(j,open(sys.argv[3],"w"))' "$db" "$1" "$2"
  }
  out=$(count "$db" "$tr"); rc=$?
  want "$rc" "0" "the planned fixtures exit 0"
  want "$(sed -n 1p <<<"$out")" "$W: 4 wallets, 3 topped up, 40.01 USDC, 1 ours left out" \
    "ours: our own wallet is left out of wallets, topups and USDC; window: the transfer before it is not counted, the duplicate row once"
  want "$(sed -n 2p <<<"$out")" \
    "OVERLAP topped up: 3 wallets, 2 known here, 1 with inference here, 1 paid here, 1 paid Conway after their last payment here" \
    "overlap topped up: two known here, one with inference, one paying, it paid Conway after its last payment here"
  want "$(sed -n 3p <<<"$out")" \
    "OVERLAP all: 4 wallets, 3 known here, 2 with inference here, 1 paid here, 1 paid Conway after their last payment here" \
    "overlap all: the dust wallet is known here with inference, our payer who never paid Conway is not counted"
  want "$(wc -l <<<"$out" | tr -d ' ') $(grep -cE '0x[0-9a-fA-F]{40}|[0-9a-f]{64}' <<<"$out")" "3 0" \
    "no address and no hash in the three output lines"
  # The other direction for ours: with an empty list our wallet counts like any other.
  edit_json 'j["ours"]=[]' "$stub/no-ours.json"
  want "$(count "$stub/no-ours.json" "$tr" | sed -n 1p)" "$W: 5 wallets, 4 topped up, 45.01 USDC, 0 ours left out" \
    "ours counter-proof: off the list, our wallet is counted and nothing is left out"
  m=$(python3 "$ROOT/docs/research/data/conway-money-metrics.py" "$tr" --json |
    python3 -c 'import json,sys; j=json.load(sys.stdin); print("%d wallets, %d topped up" % (j["wallets_30d"], j["topup_wallets_30d"]))')
  want "$(count "$stub/no-ours.json" "$tr" | sed -n 1p | sed -E 's/.*: ([0-9]+ wallets, [0-9]+ topped up),.*/\1/')" "$m" \
    "window: without ours the same wallets and topped up as conway-money-metrics.py"
  # The other direction for overlap: nothing known here, and a payment here after the last one to Conway.
  edit_json 'j["wallets"]=[]' "$stub/none-here.json"
  want "$(count "$stub/none-here.json" "$tr" | sed -n 3p)" \
    "OVERLAP all: 4 wallets, 0 known here, 0 with inference here, 0 paid here, 0 paid Conway after their last payment here" \
    "overlap counter-proof: with no wallet here nothing overlaps"
  edit_json 'j["wallets"][0]["last_paid_at"]="2026-11-18T12:00:01.000Z"' "$stub/paid-later.json"
  want "$(count "$stub/paid-later.json" "$tr" | sed -n 2p)" \
    "OVERLAP topped up: 3 wallets, 2 known here, 1 with inference here, 1 paid here, 0 paid Conway after their last payment here" \
    "overlap counter-proof: a payment here after the last transfer to Conway is not counted as paid Conway after"
  # The other direction for the window: the early transfer moved to the first second of the window counts.
  sed 's/^100,2026-09-01T00:00:00Z,/100,2026-10-19T12:00:00Z,/' "$tr" >"$stub/edge-in.csv"
  sed 's/^100,2026-09-01T00:00:00Z,/100,2026-10-19T11:59:59Z,/' "$tr" >"$stub/edge-out.csv"
  want "$(count "$db" "$stub/edge-in.csv" | sed -n 1p)" "$W: 5 wallets, 4 topped up, 45.01 USDC, 1 ours left out" \
    "window counter-proof: a transfer at the first second of the window counts"
  want "$(count "$db" "$stub/edge-out.csv" | sed -n 1p)" "$W: 4 wallets, 3 topped up, 40.01 USDC, 1 ours left out" \
    "window: a transfer one second before the window does not"
  sed 's/^550,\(.*\),tx-a1-1$/550,\1,tx-a1-9/' "$tr" >"$stub/no-dup.csv"
  want "$(count "$db" "$stub/no-dup.csv" | sed -n 1p)" "$W: 4 wallets, 3 topped up, 45.01 USDC, 1 ours left out" \
    "window: the duplicate row with its own tx hash counts as a second transfer"
  tail -n +2 "$tr" >"$stub/no-header.csv"
  want "$(count "$db" "$stub/no-header.csv" | sed -n 1p)" "$W: 4 wallets, 3 topped up, 40.01 USDC, 1 ours left out" \
    "window: a file without header row counts the same"
  count "$db" "$fx/no-such.csv" >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an unreadable transfer file exits 2"
  echo "{" >"$stub/broken.json"
  count "$stub/broken.json" "$tr" >/dev/null 2>&1; rc=$?
  want "$rc" "2" "an unreadable wallet JSON exits 2"
  head -1 "$tr" >"$stub/empty.csv"
  count "$db" "$stub/empty.csv" >/dev/null 2>&1; rc=$?
  want "$rc" "2" "a transfer file without a transfer exits 2"
  CP_PAYERS_LIST="$stub/list.txt" count "$db" "$tr" >"$stub/with-list.out"
  want "$(cat "$stub/list.txt" | tr '\n' ' ')" "0x00000000000000000000000000000000000000a1 0x00000000000000000000000000000000000000a2 0x00000000000000000000000000000000000000a3 " \
    "ours: the list of topped-up payers holds the three, never our own"
  want "$(cat "$stub/with-list.out")" "$out" "the list changes nothing on stdout"
  if [[ "$fail" -eq 0 ]]; then
    echo "planned payers, our own wallet, the overlap and the window counted, both directions"
    echo "SELFTEST OK"
  else echo "SELFTEST FAILED"; fi
  exit "$fail"
fi

DB=""; TRANSFERS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-json) [[ $# -ge 2 ]] || usage; DB="$2"; shift 2 ;;
    --transfers) [[ $# -ge 2 ]] || usage; TRANSFERS+=("$2"); shift 2 ;;
    *) echo "conway-payers: unknown argument $1" >&2; usage ;;
  esac
done

if [[ -n "$DB" && ${#TRANSFERS[@]} -gt 0 ]]; then
  count "$DB" "${TRANSFERS[@]}"
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
if [[ ${#TRANSFERS[@]} -eq 0 ]]; then
  TRANSFERS=("$BASE_CSV" "$dir/delta.csv")
  if ! timeout 120 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" "cat $DELTA_REMOTE" >"$dir/delta.csv" 2>/dev/null; then
    rm -f "$dir/delta.csv"   # unreadable on purpose: the count says a transfer file is not readable and exits 2
  fi
fi
if [[ -z "$DB" ]]; then
  DB="$dir/wallets.json"
  if ! timeout 120 ssh -i "$DKEY" -o BatchMode=yes -o ConnectTimeout=10 "$DHOST" \
    "cd /opt/control-plane/repo/deploy && docker compose -f docker-compose.prod.yml exec -T -e CP_REPORT=wallets cp node -" \
    <"$ROOT/ops/db-report.cjs" >"$DB" 2>/dev/null; then
    echo "x" >"$DB"   # unparsable on purpose: the count says the JSON is not readable and exits 2
  fi
fi
count "$DB" "${TRANSFERS[@]}"
