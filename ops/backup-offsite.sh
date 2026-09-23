#!/usr/bin/env bash
# Is there a copy of the database anywhere but on the one disk that holds it?
#
# `ops/backup.sh` runs nightly, `ops/backup-probe.sh` boots the newest and the oldest backup as a
# service and both came up clean on 2026-09-23. All of that is about whether the file is sound.
# None of it is about where the file is.
#
# Measured on 2026-09-23: seven backups, /opt/control-plane/backups, all on /dev/sda1 -- the same
# single disk as the live database, on one Hostinger VM, and nothing in the crontab copies any of
# them anywhere. So the backups cover a bad migration, a wrong DELETE and a corrupted page. They
# do not cover the failure they are named after: the disk, the machine, or the account going away.
# Behind that file are 286 wallets and a ledger of 1,258,736 mc, and there is no second copy.
#
# This pulls the newest one here, over the ssh key this machine already has, and verifies it after
# it lands rather than before it left. Nothing new runs on the VM and no credential goes onto it.
#
#   ops/backup-offsite.sh            pull the newest, verify it, prune to CP_OFFSITE_KEEP
#   ops/backup-offsite.sh --check    report only, no transfer; this is what check-all runs
#   ops/backup-offsite.sh --selftest prove the verification rejects a file it should reject
#
# A copy on the operator's laptop is not an off-site backup. It is the difference between one copy
# and two, which is the difference that matters here, and it is what can be built without asking
# anybody for an account. The real answer is a bucket the VM writes to with append-only
# credentials, and that needs Matthias: it is his Cloudflare account and his decision.
set -uo pipefail

KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
REMOTE_DIR="${CP_BACKUP_DIR:-/opt/control-plane/backups}"
DIR="${CP_OFFSITE_DIR:-$HOME/.control-plane-backups}"
KEEP="${CP_OFFSITE_KEEP:-7}"
STALE_HOURS="${CP_OFFSITE_STALE_HOURS:-36}"

# One place that decides whether a local file is a usable database, because --selftest has to run
# the same one the pull runs.
verify() { # file -> 0 when it is a sound control-plane database
  local f="$1" integrity wallets ledger balances
  [[ -s "$f" ]] || { echo "        empty file"; return 1; }
  integrity=$(sqlite3 "$f" "pragma integrity_check;" 2>/dev/null || true)
  [[ "$integrity" == "ok" ]] || { echo "        integrity_check says: ${integrity:-nothing}"; return 1; }
  wallets=$(sqlite3 "$f" "select count(*) from wallets;" 2>/dev/null || true)
  [[ "${wallets:-0}" -gt 0 ]] || { echo "        no wallets table, or no rows in it"; return 1; }
  # The same reconciliation the probe does on the VM, done again here: a transfer that truncates
  # a file leaves something that still opens.
  ledger=$(sqlite3 "$f" "select coalesce(sum(delta_mc),0) from ledger;" 2>/dev/null || true)
  balances=$(sqlite3 "$f" "select coalesce(sum(balance_mc),0) from wallets;" 2>/dev/null || true)
  [[ "$ledger" == "$balances" ]] || {
    echo "        ledger sums to $ledger and the balances to $balances"; return 1; }
  echo "        ok: $wallets wallets, ledger and balances agree at $ledger mc"
  return 0
}

if [[ "${1:-}" == "--selftest" ]]; then
  t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
  fail=0
  good="$t/good.db"
  sqlite3 "$good" "create table wallets(address text, balance_mc integer); create table ledger(delta_mc integer);
    insert into wallets values ('0xa', 700), ('0xb', 300); insert into ledger values (700), (300);"
  verify "$good" >/dev/null || { echo "SELFTEST FAILED: a sound database was rejected"; fail=1; }
  bad="$t/mismatch.db"
  sqlite3 "$bad" "create table wallets(address text, balance_mc integer); create table ledger(delta_mc integer);
    insert into wallets values ('0xa', 700); insert into ledger values (999);"
  verify "$bad" >/dev/null && { echo "SELFTEST FAILED: a ledger that does not reconcile was accepted"; fail=1; }
  empty_db="$t/empty.db"
  sqlite3 "$empty_db" "create table wallets(address text, balance_mc integer); create table ledger(delta_mc integer);"
  verify "$empty_db" >/dev/null && { echo "SELFTEST FAILED: a database with no wallets was accepted"; fail=1; }
  : > "$t/zero.db"
  verify "$t/zero.db" >/dev/null && { echo "SELFTEST FAILED: an empty file was accepted"; fail=1; }
  head -c 400 "$good" > "$t/cut.db"
  verify "$t/cut.db" >/dev/null && { echo "SELFTEST FAILED: a truncated transfer was accepted"; fail=1; }
  printf 'not a database at all' > "$t/text.db"
  verify "$t/text.db" >/dev/null && { echo "SELFTEST FAILED: a text file was accepted"; fail=1; }
  [[ "$fail" -eq 0 ]] && echo "SELFTEST OK: sound accepted; mismatch, empty, no-wallets, truncated and text rejected."
  exit "$fail"
fi

mkdir -p "$DIR"
newest_local=$(/bin/ls -1t "$DIR"/cp-*.db 2>/dev/null | head -1 || true)
if [[ -n "$newest_local" ]]; then
  age_h=$(( ( $(date -u +%s) - $(stat -f %m "$newest_local" 2>/dev/null || stat -c %Y "$newest_local") ) / 3600 ))
else
  age_h=""
fi

if [[ "${1:-}" == "--check" ]]; then
  if [[ -z "$newest_local" ]]; then
    echo "NO SECOND COPY  every backup is on the same disk as the database it backs up."
    echo "                $DIR holds nothing. Run ops/backup-offsite.sh."
    exit 1
  fi
  echo "second copy     $(basename "$newest_local"), pulled ${age_h} h ago, in $DIR"
  verify "$newest_local" || { echo "SECOND COPY UNUSABLE  the local copy does not verify."; exit 1; }
  if [[ "$age_h" -gt "$STALE_HOURS" ]]; then
    echo "STALE           the newest copy off the machine is ${age_h} h old, over the ${STALE_HOURS} h mark."
    echo "                The backup on the VM runs at 03:17 UTC daily; this one has to be pulled."
    exit 1
  fi
  echo "OK              a copy of the database exists somewhere other than the VM."
  exit 0
fi

name=$(timeout 30 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" \
  "/bin/ls -1 $REMOTE_DIR/cp-*.db 2>/dev/null | tail -1" 2>/dev/null | tr -d '\r')
[[ -n "$name" ]] || { echo "COULD NOT PULL: no backup found in $REMOTE_DIR on the VM" >&2; exit 2; }
base=$(basename "$name")
echo "pulling $base"
if ! timeout 120 scp -q -i "$KEY" -o BatchMode=yes "$HOST:$name" "$DIR/$base.part"; then
  rm -f "$DIR/$base.part"
  echo "COULD NOT PULL: the transfer failed. A connection problem, not a finding about the backup." >&2
  exit 2
fi
if ! verify "$DIR/$base.part"; then
  rm -f "$DIR/$base.part"
  echo "REFUSED: what arrived is not a usable database, so it is not kept." >&2
  exit 1
fi
# Renamed only after it verified: a half-written file must never look like a backup.
mv "$DIR/$base.part" "$DIR/$base"
echo "kept    $DIR/$base"
# shellcheck disable=SC2012
/bin/ls -1t "$DIR"/cp-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old"; echo "pruned  $(basename "$old")"
done
echo "$(/bin/ls -1 "$DIR"/cp-*.db 2>/dev/null | wc -l | tr -d ' ') copy(ies) off the machine, newest $base"
