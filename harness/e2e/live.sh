#!/usr/bin/env bash
# Upstream runtime against the control plane with OpenRouter as the real provider. Costs money
# (budget below 0.50 USD per run): maxTurnsPerCycle 6, the genesis prompt asks for cheap tools.
#   OPENROUTER_API_KEY=... pnpm e2e:live
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -n "${OPENROUTER_API_KEY:-}" ]] || { echo "LIVE FAIL: OPENROUTER_API_KEY missing from the environment"; exit 2; }
export CP_PROVIDER=openrouter
export CP_MODEL_ALIASES=""
export SETUP_JSON=./runtime/setup.live.json
COMPOSE=(docker compose -f docker-compose.yml)

cleanup() { "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

./gen-certs.sh
"${COMPOSE[@]}" build --quiet
"${COMPOSE[@]}" up -d --wait chain cp
"${COMPOSE[@]}" run --rm chain-tools setup >/dev/null
"${COMPOSE[@]}" logs --no-color cp 2>/dev/null | grep -o 'providers=[^ ]* aliases=[^ ]*' | tail -1

echo "--- provision"
out=$("${COMPOSE[@]}" run --rm --no-deps runtime provision 2>&1) || { echo "$out"; echo "LIVE FAIL: provision"; exit 1; }
key=$(printf '%s\n' "$out" | grep -o '"apiKey": *"cnwy_k_[0-9a-f]*"' | head -1 | grep -o 'cnwy_k_[0-9a-f]*')
wallet=$(printf '%s\n' "$out" | grep -o '"walletAddress": *"0x[0-9a-fA-F]*"' | head -1 | grep -o '0x[0-9a-fA-F]*')
[[ -n "$key" && -n "$wallet" ]] || { echo "$out"; echo "LIVE FAIL: key or wallet missing"; exit 1; }
"${COMPOSE[@]}" run --rm chain-tools fund "$wallet" 6 >/dev/null

echo "--- runtime against OpenRouter, wait for turns and sleep (at most 6 turns per cycle)"
"${COMPOSE[@]}" up -d --no-deps runtime
deadline=$((SECONDS + 300))
while (( SECONDS < deadline )); do
  logs=$("${COMPOSE[@]}" logs --no-color runtime 2>/dev/null)
  turns=$(printf '%s\n' "$logs" | grep -c 'Turn [0-9A-Za-z_-]*: [0-9]* tools' || true)
  if printf '%s\n' "$logs" | grep -q 'Sleeping for\|LOOP END'; then break; fi
  (( turns >= 6 )) && break
  sleep 5
done
logs=$("${COMPOSE[@]}" logs --no-color runtime 2>/dev/null)
"${COMPOSE[@]}" stop runtime >/dev/null
turns=$(printf '%s\n' "$logs" | grep -c 'Turn [0-9A-Za-z_-]*: [0-9]* tools' || true)
api_errors=$(printf '%s\n' "$logs" | grep -c 'Conway API error\|registration failed\|Inference error' || true)
printf '%s\n' "$logs" | grep -E "registered|Bootstrap topup: \+|Turn [0-9A-Za-z_-]*:|\[TOOL\]|\[SLEEP\]|Sleeping for|Inference error|ERROR|FATAL" | head -40 || true

echo "--- ledger"
ledger=$("${COMPOSE[@]}" exec -T cp node -e '
  const db = require("better-sqlite3")("/data/cp.db", { readonly: true });
  const w = db.prepare("SELECT balance_mc FROM wallets ORDER BY created_at LIMIT 1").get();
  const sum = db.prepare("SELECT coalesce(sum(delta_mc),0) AS s FROM ledger").get().s;
  const inf = db.prepare("SELECT meta FROM ledger WHERE kind = ?").all("inference").map((r) => JSON.parse(r.meta));
  const cost_usd = inf.reduce((a, m) => a + (m.cost_usd || 0), 0);
  const uncollected = inf.reduce((a, m) => a + (m.uncollected_mc || 0), 0);
  const margin = inf.reduce((a, m) => a + (m.margin_mc || 0), 0);
  const models = [...new Set(inf.map((m) => m.model))];
  console.log(JSON.stringify({ balance_mc: w.balance_mc, consistent: sum === w.balance_mc, inference_rows: inf.length, cost_usd: Number(cost_usd.toFixed(6)), margin_mc: margin, uncollected_mc: uncollected, models }));' 2>&1)
echo "$ledger"
consistent=$(printf '%s\n' "$ledger" | grep -o '"consistent":[a-z]*' | grep -o '[a-z]*$')
uncollected=$(printf '%s\n' "$ledger" | grep -o '"uncollected_mc":[0-9]*' | grep -o '[0-9]*$')
cost_usd=$(printf '%s\n' "$ledger" | grep -o '"cost_usd":[0-9.]*' | grep -o '[0-9.]*$')

cleanup
trap - EXIT
remaining=$("${COMPOSE[@]}" ps -q | wc -l | tr -d ' ')
[[ "$remaining" == "0" ]] || { echo "LIVE FAIL: containers left behind"; exit 1; }
if [[ "$turns" -lt 3 || "$api_errors" != "0" || "$consistent" != "true" || "$uncollected" != "0" ]]; then
  echo "LIVE FAIL turns=$turns api_errors=$api_errors ledger_consistent=$consistent uncollected_mc=$uncollected cost_usd=$cost_usd"
  exit 1
fi
echo "LIVE OK turns=$turns api_errors=$api_errors ledger_consistent=$consistent uncollected_mc=$uncollected cost_usd=$cost_usd"
