#!/usr/bin/env bash
# How many accounts (konto) exist on Base, and how much USDC is on them? Read-only, changes nothing on the server.
#   ops/konto-live.sh
#
# Prints exactly two lines: `accounts <n>`, the number of rows in konto_accounts with chain_id 8453, and
# `balance_usd <sum>`, the USDC all of them hold on Base, rounded down to the cent with two decimals. Sums are fine in
# the public repo, the address of a single account is not (loop-constraints.md, rule 8): no address, no URL and no
# error text ever leaves the server.
#
# This file is sent over ssh to `bash -s`. On the server it asks the running container `cp` with node: the database at
# CP_DB_PATH is opened with `readonly: true`, and every balance is an eth_call of balanceOf on USDC (MAINNET_USDC, read
# from dist/konto/config.js in the working directory of the container, the build of src/konto/config.ts) against
# CP_KONTO_RPC_URL, by default https://mainnet.base.org.
#
# Exit 0 when both lines are known, also with `accounts 0`; 1 with `balance_usd unknown` when a balance could not be
# read; 3 with `query failed` when the container gave no answer; 2 with `ssh failed` when the server could not be asked.
set -uo pipefail

if [[ "${1:-}" == "--on-server" ]]; then
  COMPOSE_FILE="/opt/control-plane/repo/deploy/docker-compose.prod.yml"
  QUERY=$(cat <<'EOF'
const Database = require("better-sqlite3");
const { resolve } = require("node:path");
const BALANCE_OF = "0x70a08231";
async function balanceOf(rpc, usdc, address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("bad address");
  const data = BALANCE_OF + address.slice(2).toLowerCase().padStart(64, "0");
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: usdc, data }, "latest"] }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("rpc status");
  const body = await res.json();
  if (body.error || typeof body.result !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(body.result)) throw new Error("rpc answer");
  return BigInt(body.result);
}
(async () => {
  const db = new Database(process.env.CP_DB_PATH, { readonly: true, fileMustExist: true });
  const rows = db.prepare("SELECT address FROM konto_accounts WHERE chain_id = 8453").all();
  db.close();
  console.log(`accounts ${rows.length}`);
  const rpc = process.env.CP_KONTO_RPC_URL || "https://mainnet.base.org";
  let total = 0n;
  try {
    // The token comes from the service's own build, the one source of src/konto/config.ts, never a second copy here.
    const { MAINNET_USDC } = await import(resolve("dist/konto/config.js"));
    for (const row of rows) total += await balanceOf(rpc, MAINNET_USDC, String(row.address));
  } catch {
    console.log("balance_usd unknown");
    process.exit(1);
  }
  const cents = total / 10000n;
  console.log(`balance_usd ${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`);
  process.exit(0);
})().catch(() => process.exit(3));
EOF
)
  # stdin from /dev/null: this script itself arrives on stdin, and docker would swallow the rest of it. stderr stays on
  # the server, so neither an error text nor a URL comes back.
  out=$(docker compose -f "$COMPOSE_FILE" exec -T cp node -e "$QUERY" </dev/null 2>/dev/null)
  rc=$?
  if [[ $rc -ne 0 && $rc -ne 1 ]] || ! grep -qE '^accounts [0-9]+$' <<<"$out"; then
    echo "query failed"
    exit 3
  fi
  # Only the two expected line shapes pass, whatever else the container might have printed.
  grep -E '^(accounts [0-9]+|balance_usd ([0-9]+\.[0-9]{2}|unknown))$' <<<"$out"
  exit "$rc"
fi

HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
SELF="${BASH_SOURCE[0]}"

out=$(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" 'bash -s -- --on-server' <"$SELF" 2>/dev/null)
rc=$?
if [[ $rc -ne 0 && $rc -ne 1 && $rc -ne 3 ]] || [[ -z "$out" ]]; then
  echo "ssh failed"
  exit 2
fi
printf '%s\n' "$out"
exit "$rc"
