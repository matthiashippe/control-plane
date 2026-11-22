#!/usr/bin/env bash
# Card purchases (goals/karte/01, point 5). Read-only, changes nothing on the server.
#   ops/card-orders.sh
#
# Prints exactly three lines:
#   card_orders live <n> test <n> booked <n> unassigned <n> pending_rate <n> reversed <n>
#   card_shortfall_usd <sum of shortfall_mc, rounded down to the cent>
#   ipn_passphrase set|missing
# `live` and `test` count rows by mode, the other fields count rows by status. Before the rollout the table card_orders does
# not exist yet; then every number is 0. 100000 mc are 1 USD, so 1000 mc are one cent; the sum is cut to whole cents with
# BigInt, never with floating point. `ipn_passphrase` says whether CP_DIGISTORE_IPN_PASSPHRASE is non-empty inside the running
# container; its value never leaves the container. The column address is never read, so no address can come back.
#
# The query runs in the running container `cp` with node and better-sqlite3 on CP_DB_PATH, opened with readonly: true.
#
# Exit 0 with the three lines, 1 when the container or the database could not be read (the lines then say so), 2 with
# `ssh failed` when the server could not be asked.
set -uo pipefail

if [[ "${1:-}" == "--on-server" ]]; then
  COMPOSE_FILE="/opt/control-plane/repo/deploy/docker-compose.prod.yml"
  # A quoted heredoc: the shell expands nothing inside it.
  QUERY=$(cat <<'JS'
const ipn = process.env.CP_DIGISTORE_IPN_PASSPHRASE ? "set" : "missing";
const counts = { live: 0n, test: 0n, booked: 0n, unassigned: 0n, pending_rate: 0n, reversed: 0n };
let shortfall = 0n;
try {
  const db = require("better-sqlite3")(process.env.CP_DB_PATH || "/data/cp.db", { readonly: true, fileMustExist: true });
  const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'card_orders'").get();
  if (table) {
    const modes = db.prepare("SELECT mode AS k, COUNT(*) AS n FROM card_orders GROUP BY mode").safeIntegers(true).all();
    for (const r of modes) if (r.k === "live" || r.k === "test") counts[r.k] = r.n;
    const states = db.prepare("SELECT status AS k, COUNT(*) AS n FROM card_orders GROUP BY status").safeIntegers(true).all();
    for (const r of states) if (["booked", "unassigned", "pending_rate", "reversed"].includes(r.k)) counts[r.k] = r.n;
    const sum = db.prepare("SELECT COALESCE(SUM(shortfall_mc), 0) AS s FROM card_orders").safeIntegers(true).get();
    shortfall = BigInt(sum.s);
  }
  db.close();
} catch {
  console.log("card_orders unreadable");
  console.log("ipn_passphrase " + ipn);
  process.exit(1);
}
const cents = shortfall < 0n ? 0n : shortfall / 1000n;
const c = counts;
console.log(`card_orders live ${c.live} test ${c.test} booked ${c.booked} unassigned ${c.unassigned} pending_rate ${c.pending_rate} reversed ${c.reversed}`);
console.log(`card_shortfall_usd ${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`);
console.log("ipn_passphrase " + ipn);
JS
)
  # stdin from /dev/null: this script itself arrives on stdin, and docker would swallow the rest of it.
  out=$(docker compose -f "$COMPOSE_FILE" exec -T cp node -e "$QUERY" </dev/null 2>/dev/null)
  rc=$?
  if [[ -z "$out" ]]; then
    echo "container unreachable"
    exit 1
  fi
  printf '%s\n' "$out"
  if [[ $rc -ne 0 ]]; then exit 1; fi
  exit 0
fi

HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
SELF="${BASH_SOURCE[0]}"

out=$(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" 'bash -s -- --on-server' <"$SELF" 2>/dev/null)
rc=$?
if [[ $rc -ne 0 && $rc -ne 1 ]] || [[ -z "$out" ]]; then
  echo "ssh failed"
  exit 2
fi
printf '%s\n' "$out"
exit "$rc"
