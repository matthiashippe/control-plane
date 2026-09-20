#!/usr/bin/env bash
# Goal 3: after the bootstrap topup the runtime runs five turns against the mock provider;
# every call is one ledger row and the balance matches the ledger.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.yml)

cleanup() { "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

./gen-certs.sh
"${COMPOSE[@]}" build --quiet
"${COMPOSE[@]}" up -d --wait chain cp
"${COMPOSE[@]}" run --rm chain-tools setup >/dev/null

echo "--- provision"
out=$("${COMPOSE[@]}" run --rm --no-deps runtime provision 2>&1) || { echo "$out"; echo "INFERENCE FAIL: provision"; exit 1; }
key=$(printf '%s\n' "$out" | grep -o '"apiKey": *"cnwy_k_[0-9a-f]*"' | head -1 | grep -o 'cnwy_k_[0-9a-f]*')
wallet=$(printf '%s\n' "$out" | grep -o '"walletAddress": *"0x[0-9a-fA-F]*"' | head -1 | grep -o '0x[0-9a-fA-F]*')
[[ -n "$key" && -n "$wallet" ]] || { echo "$out"; echo "INFERENCE FAIL: key or wallet missing"; exit 1; }
echo "wallet=$wallet key_prefix=${key:0:15}"
"${COMPOSE[@]}" run --rm chain-tools fund "$wallet" 6 >/dev/null

echo "--- start runtime, wait for five turns"
"${COMPOSE[@]}" up -d --no-deps runtime
deadline=$((SECONDS + 240))
turns=0
while (( SECONDS < deadline )); do
  turns=$("${COMPOSE[@]}" logs --no-color runtime 2>/dev/null | grep -c 'Turn [0-9A-Za-z_-]*: [0-9]* tools' || true)
  (( turns >= 5 )) && break
  sleep 3
done
logs=$("${COMPOSE[@]}" logs --no-color runtime 2>/dev/null)
printf '%s\n' "$logs" | grep -E "Bootstrap topup|Turn [0-9A-Za-z_-]*:|\[SLEEP\]|Sleeping|error|Error" | head -30 || true
"${COMPOSE[@]}" stop runtime >/dev/null
printf '%s\n' "$logs" | grep -q 'Bootstrap topup: +\$5' || { echo "INFERENCE FAIL: no bootstrap topup"; exit 1; }
(( turns >= 5 )) || { echo "INFERENCE FAIL: only $turns turns"; printf '%s\n' "$logs" | tail -60; exit 1; }

echo "--- balance over the API"
balance=$("${COMPOSE[@]}" run --rm --no-deps -e KEY="$key" runtime node -e '
  fetch(process.env.CONWAY_API_URL + "/v1/credits/balance", { headers: { authorization: process.env.KEY } })
    .then(async (r) => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })' 2>&1)
echo "$balance"
balance_cents=$(printf '%s\n' "$balance" | grep -o '"balance_cents":[0-9]*' | grep -o '[0-9]*$')

echo "--- ledger in the control plane database"
ledger=$("${COMPOSE[@]}" exec -T cp node -e '
  const db = require("better-sqlite3")("/data/cp.db", { readonly: true });
  const w = db.prepare("SELECT balance_mc FROM wallets ORDER BY created_at LIMIT 1").get();
  const t = db.prepare("SELECT coalesce(sum(delta_mc),0) AS s, count(*) AS n FROM ledger WHERE kind = ?").get("topup");
  const i = db.prepare("SELECT coalesce(sum(delta_mc),0) AS s, count(*) AS n FROM ledger WHERE kind = ?").get("inference");
  const consistent = (t.s + i.s) === w.balance_mc;
  console.log(JSON.stringify({ balance_mc: w.balance_mc, topup_mc: t.s, topup_rows: t.n, inference_mc: i.s, inference_rows: i.n, consistent }));' 2>&1)
echo "$ledger"
inference_rows=$(printf '%s\n' "$ledger" | grep -o '"inference_rows":[0-9]*' | grep -o '[0-9]*$')
consistent=$(printf '%s\n' "$ledger" | grep -o '"consistent":[a-z]*' | grep -o '[a-z]*$')

cleanup
trap - EXIT
remaining=$("${COMPOSE[@]}" ps -q | wc -l | tr -d ' ')
[[ "$remaining" == "0" ]] || { echo "INFERENCE FAIL: containers left behind"; exit 1; }
[[ "$consistent" == "true" && "$inference_rows" -ge 5 && "$balance_cents" -lt 500 ]] || { echo "INFERENCE FAIL: consistent=$consistent inference_rows=$inference_rows balance_cents=$balance_cents"; exit 1; }
echo "INFERENCE OK turns=$turns balance_cents=$balance_cents inference_rows=$inference_rows ledger_consistent=$consistent"
