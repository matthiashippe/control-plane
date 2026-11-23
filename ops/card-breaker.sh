#!/usr/bin/env bash
# The breaker of the card checkout (goals/wache/01, point 4). Read-only, changes nothing on the server.
#   ops/card-breaker.sh                 asks the server over ssh (CP_DEPLOY_HOST, CP_DEPLOY_KEY as for ops/card-orders.sh)
#   ops/card-breaker.sh --container     on the server itself: asks the running container deploy-cp-1 (used by ops/watchdog.sh)
#
# Prints exactly one line:
#   card_refunds_60d <n> shortfall_usd <dollars>.<cents> breaker on|off
# It does not compute anything itself: inside the container it imports cardBreaker from the compiled service
# (CARD_WAY_JS, default /app/dist/payments/card-way.js), so the rule of the breaker lives only in src/payments/card-way.ts.
# The database (CP_DB_PATH of the container, default /data/cp.db) is opened here with readonly: true and handed to cardBreaker.
# 100000 mc are 1 USD, so 1000 mc are one cent; the shortfall is cut to whole cents with BigInt, never with floating point.
# Only counts, a sum and the word on or off leave the container, so no address can come back.
#
# The clock is CP_WINDOW_NOW (ISO time in UTC) when set, else the system clock; over ssh it travels along.
# CP_CARD_WAY_JS replaces the path of the module, CP_CARD_CONTAINER the container (both for tests).
#
# Exit 0 with the line, 1 with `card_breaker unreadable` when database, table or module are missing (before the rollout, for
# example) or the container gives no readable answer, 2 with `ssh failed` when the server could not be asked.
set -uo pipefail

LINE_RE='^card_refunds_60d [0-9]+ shortfall_usd [0-9]+\.[0-9]{2} breaker (on|off)$'
NOW_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,3})?)?Z$'
NOW="${CP_WINDOW_NOW:-}"

unreadable() {
  echo "card_breaker unreadable"
  exit 1
}

case "${1:-}" in
  "" | --container) [[ $# -le 1 ]] || { echo "usage: ops/card-breaker.sh [--container]"; exit 2; } ;;
  *) echo "usage: ops/card-breaker.sh [--container]"; exit 2 ;;
esac

# A clock in another format would end up in a command line on the server, so it never gets that far.
[[ -z "$NOW" || "$NOW" =~ $NOW_RE ]] || unreadable

if [[ "${1:-}" == "--container" ]]; then
  CONTAINER="${CP_CARD_CONTAINER:-deploy-cp-1}"
  CARD_WAY_JS="${CP_CARD_WAY_JS:-/app/dist/payments/card-way.js}"
  # A quoted heredoc: the shell expands nothing inside it. Module and clock come as arguments after -e.
  QUERY=$(cat <<'JS'
const [modulePath, nowRaw] = process.argv.slice(1);
(async () => {
  try {
    const mod = await import(require("node:url").pathToFileURL(modulePath).href);
    const cardBreaker = mod.cardBreaker || (mod.default && mod.default.cardBreaker);
    if (typeof cardBreaker !== "function") throw new Error("no cardBreaker");
    const now = nowRaw ? new Date(nowRaw) : new Date();
    if (Number.isNaN(now.getTime())) throw new Error("no clock");
    const Database = require("better-sqlite3");
    const db = new Database(process.env.CP_DB_PATH || "/data/cp.db", { readonly: true, fileMustExist: true });
    let b;
    try {
      b = cardBreaker(db, now);
    } finally {
      db.close();
    }
    const refunds = BigInt(b.refunds60d);
    const mc = BigInt(b.shortfallMc);
    const cents = mc < 0n ? 0n : mc / 1000n;
    const usd = `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
    console.log(`card_refunds_60d ${refunds} shortfall_usd ${usd} breaker ${b.on === true ? "on" : "off"}`);
  } catch {
    console.log("card_breaker unreadable");
    process.exit(1);
  }
})();
JS
)
  # stdin from /dev/null: over ssh this script itself arrives on stdin, and docker would swallow the rest of it.
  out=$(docker exec "$CONTAINER" node -e "$QUERY" "$CARD_WAY_JS" "$NOW" </dev/null 2>/dev/null)
  [[ "$out" =~ $LINE_RE ]] || unreadable
  printf '%s\n' "$out"
  exit 0
fi

HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
SELF="${BASH_SOURCE[0]}"

REMOTE="bash -s -- --container"
[[ -n "$NOW" ]] && REMOTE="CP_WINDOW_NOW=$NOW $REMOTE"
out=$(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" "$REMOTE" <"$SELF" 2>/dev/null)
rc=$?
if [[ $rc -ne 0 && $rc -ne 1 ]] || [[ -z "$out" ]]; then
  echo "ssh failed"
  exit 2
fi
# Only the one line in exactly its format passes, so nothing else from the server can reach the output.
[[ $rc -eq 0 && "$out" =~ $LINE_RE ]] || unreadable
printf '%s\n' "$out"
exit 0
