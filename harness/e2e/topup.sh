#!/usr/bin/env bash
# Goal 2: Die Runtime kauft beim Start 5 USD Credits über /pay (x402) mit USDC auf Anvil.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.yml)

cleanup() { "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

./gen-certs.sh
"${COMPOSE[@]}" build --quiet
"${COMPOSE[@]}" up -d --wait chain cp

echo "--- USDC-Mock auf die Chain"
"${COMPOSE[@]}" run --rm chain-tools setup

echo "--- provision"
out=$("${COMPOSE[@]}" run --rm --no-deps runtime provision 2>&1) || { echo "$out"; echo "TOPUP FAIL: provision"; exit 1; }
key=$(printf '%s\n' "$out" | grep -o '"apiKey": *"cnwy_k_[0-9a-f]*"' | head -1 | grep -o 'cnwy_k_[0-9a-f]*')
wallet=$(printf '%s\n' "$out" | grep -o '"walletAddress": *"0x[0-9a-fA-F]*"' | head -1 | grep -o '0x[0-9a-fA-F]*')
[[ -n "$key" && -n "$wallet" ]] || { echo "$out"; echo "TOPUP FAIL: Key oder Wallet fehlt"; exit 1; }
echo "wallet=$wallet key_prefix=${key:0:15}"

echo "--- 6 USDC auf die Wallet"
"${COMPOSE[@]}" run --rm chain-tools fund "$wallet" 6

echo "--- Runtime starten, auf Bootstrap-Topup warten"
"${COMPOSE[@]}" up -d --no-deps runtime
deadline=$((SECONDS + 120))
while (( SECONDS < deadline )); do
  if "${COMPOSE[@]}" logs --no-color runtime 2>/dev/null | grep -q 'Bootstrap topup: +\$5'; then break; fi
  sleep 2
done
logs=$("${COMPOSE[@]}" logs --no-color runtime 2>/dev/null)
printf '%s\n' "$logs" | grep -E "topup|Topup|402|pay" | head -20 || true
printf '%s\n' "$logs" | grep -q 'Bootstrap topup: +\$5' || { echo "TOPUP FAIL: kein 'Bootstrap topup: +\$5' im Runtime-Log"; printf '%s\n' "$logs" | tail -40; exit 1; }
"${COMPOSE[@]}" stop runtime >/dev/null

echo "--- balance über die API"
balance=$("${COMPOSE[@]}" run --rm --no-deps -e KEY="$key" runtime node -e '
  fetch(process.env.CONWAY_API_URL + "/v1/credits/balance", { headers: { authorization: process.env.KEY } })
    .then(async (r) => { const t = await r.text(); console.log(r.status, t); process.exit(r.ok ? 0 : 1); })' 2>&1)
echo "$balance"
balance_cents=$(printf '%s\n' "$balance" | grep -o '"balance_cents":[0-9]*' | grep -o '[0-9]*$')

echo "--- ledger in der Control-Plane-DB"
ledger_rows=$("${COMPOSE[@]}" exec -T cp node -e '
  const db = require("better-sqlite3")("/data/cp.db", { readonly: true });
  const r = db.prepare("SELECT count(*) AS n, coalesce(sum(delta_mc),0) AS sum_mc FROM ledger WHERE kind = ?").get("topup");
  const p = db.prepare("SELECT status, tx_hash FROM payments").all();
  console.log(JSON.stringify({ rows: r.n, sum_mc: r.sum_mc, payments: p }));' 2>&1)
echo "$ledger_rows"
rows=$(printf '%s\n' "$ledger_rows" | grep -o '"rows":[0-9]*' | grep -o '[0-9]*$')
sum_mc=$(printf '%s\n' "$ledger_rows" | grep -o '"sum_mc":[0-9]*' | grep -o '[0-9]*$')

echo "--- USDC-Salden auf der Chain"
"${COMPOSE[@]}" run --rm chain-tools balance "$wallet"
"${COMPOSE[@]}" run --rm chain-tools balance 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

cleanup
trap - EXIT
remaining=$("${COMPOSE[@]}" ps -q | wc -l | tr -d ' ')
[[ "$remaining" == "0" ]] || { echo "TOPUP FAIL: Container übrig"; exit 1; }
# Seit Goal 3 fährt die Runtime nach dem Topup sofort Turns; der Saldo liegt dann knapp unter 500.
# Die Topup-Gutschrift selbst muss exakt 500 000 mc in genau einer Ledger-Zeile sein.
[[ "$sum_mc" == "500000" && "$rows" == "1" && "$balance_cents" -le 500 && "$balance_cents" -gt 400 ]] \
  || { echo "TOPUP FAIL: balance_cents=$balance_cents ledger_rows=$rows topup_sum_mc=$sum_mc"; exit 1; }
echo "TOPUP OK balance_cents=$balance_cents ledger_rows=$rows topup_mc=$sum_mc"
