#!/usr/bin/env bash
# Abnahme Stufe 2: die unveränderte Upstream-Runtime als Container AUF DER VM gegen das
# öffentliche Control Plane (https://cp.hippe.eu), mit der Wegwerf-Wallet aus Stufe 1 als
# Runtime-Wallet. Erstlauf: Provisionierung, Registrierung, Bootstrap-Topup 5 USD über PayAI,
# Turns über OpenRouter, Schlaf. Braucht 5 USDC auf der Wegwerf-Wallet (Base). Läuft nichts lokal.
#   pnpm e2e:prod
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
CP_URL="${CP_URL:-https://cp.hippe.eu}"
WALLET_FILE="state/mainnet-wallet.json"
[[ -f "$WALLET_FILE" ]] || { echo "PROD FAIL: $WALLET_FILE fehlt (erst pnpm e2e:mainnet)"; exit 2; }
SSH=(ssh -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$HOST")

pk=$(python3 -c "import json;print(json.load(open('$WALLET_FILE'))['privateKey'])")
addr=$(npx tsx -e "import {privateKeyToAccount} from 'viem/accounts'; console.log(privateKeyToAccount('$pk').address)")
usdc=$(curl -s -X POST https://mainnet.base.org -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\",\"data\":\"0x70a08231000000000000000000000000${addr#0x}\"},\"latest\"]}" | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'],16)/1e6)")
echo "Wegwerf-Wallet $addr, USDC auf Base: $usdc"
python3 -c "import sys; sys.exit(0 if float('$usdc') >= 5 else 1)" || { echo "PROD FAIL: mindestens 5 USDC nötig (Bootstrap-Topup der Runtime kauft 5 USD)"; exit 1; }

echo "--- Runtime-Image auf der VM bauen"
rsync -az -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" runtime/ "$HOST:/opt/control-plane/abnahme/runtime/"
"${SSH[@]}" 'cd /opt/control-plane/abnahme/runtime && docker build -q -t abnahme-runtime . >/dev/null && echo image ok'

echo "--- Wallet und Setup in ein frisches Volume, Erstlauf starten"
"${SSH[@]}" bash -s "$pk" "$CP_URL" <<'REMOTE'
set -euo pipefail
PK="$1"; CPURL="$2"
docker rm -f abnahme >/dev/null 2>&1 || true
docker volume rm -f abnahme-home >/dev/null 2>&1 || true
docker volume create abnahme-home >/dev/null
# Wallet-Datei im Format der Runtime (identity/wallet.ts), Besitzer = User automaton (uid 1000).
docker run --rm -v abnahme-home:/home/automaton -e PK="$PK" alpine sh -c '
  mkdir -p /home/automaton/.automaton && chmod 700 /home/automaton/.automaton &&
  printf "{\n  \"chainType\": \"evm\",\n  \"privateKey\": \"%s\",\n  \"createdAt\": \"%s\"\n}\n" "$PK" "$(date -u +%FT%TZ)" > /home/automaton/.automaton/wallet.json &&
  chmod 600 /home/automaton/.automaton/wallet.json && chown -R 1000:1000 /home/automaton'
docker run --rm -v abnahme-home:/home/automaton -v /opt/control-plane/abnahme/runtime/setup.prod.json:/setup.json:ro \
  -e CONWAY_API_URL="$CPURL" abnahme-runtime provision 2>&1 | grep -v privateKey | tail -3
docker run -d --name abnahme -v abnahme-home:/home/automaton -e CONWAY_API_URL="$CPURL" abnahme-runtime run >/dev/null
echo "runtime gestartet"
REMOTE

echo "--- warten auf Registrierung, Topup, Turns und Schlaf (max 6 Minuten)"
deadline=$((SECONDS + 360))
while (( SECONDS < deadline )); do
  logs=$("${SSH[@]}" 'docker logs abnahme 2>&1' || true)
  if printf '%s\n' "$logs" | grep -q 'Sleeping for\|LOOP END\|\[FATAL\]'; then break; fi
  sleep 10
done
logs=$("${SSH[@]}" 'docker logs abnahme 2>&1' || true)
turns=$(printf '%s\n' "$logs" | grep -c 'Turn [0-9A-Za-z_-]*: [0-9]* tools' || true)
api_errors=$(printf '%s\n' "$logs" | grep -c 'Conway API error\|registration failed\|Inference error\|topup failed' || true)
topup=false; printf '%s\n' "$logs" | grep -q 'Bootstrap topup: +\$5' && topup=true
registered=false; printf '%s\n' "$logs" | grep -q 'Automaton identity registered\.' && registered=true
printf '%s\n' "$logs" | grep -E "registered|registration|topup|Topup|Turn [0-9A-Za-z_-]*:|\[TOOL\]|\[SLEEP\]|Sleeping for|error|Error|FATAL" | head -40 || true

echo "--- Ledger auf der VM"
ledger=$("${SSH[@]}" 'cd /opt/control-plane/repo/deploy && docker compose -f docker-compose.prod.yml exec -T cp node -e "
  const db=require(\"better-sqlite3\")(\"/data/cp.db\",{readonly:true});
  const addr=process.argv[1].toLowerCase();
  const w=db.prepare(\"select balance_mc from wallets where address=?\").get(addr);
  const rows=db.prepare(\"select kind,delta_mc,meta from ledger where address=? order by id\").all(addr);
  const sum=rows.reduce((a,r)=>a+r.delta_mc,0);
  const inf=rows.filter(r=>r.kind===\"inference\").map(r=>JSON.parse(r.meta||\"{}\"));
  const pay=db.prepare(\"select status,credits_mc,tx_hash from payments where to_address=? order by created_at\").all(addr);
  console.log(JSON.stringify({balance_mc:w&&w.balance_mc,consistent:w&&sum===w.balance_mc,topups:rows.filter(r=>r.kind===\"topup\").length,inference_rows:inf.length,cost_usd:Number(inf.reduce((a,m)=>a+(m.cost_usd||0),0).toFixed(6)),uncollected_mc:inf.reduce((a,m)=>a+(m.uncollected_mc||0),0),payments:pay}));
" '"$addr")
echo "$ledger"
consistent=$(printf '%s\n' "$ledger" | grep -o '"consistent":[a-z]*' | grep -o '[a-z]*$')
uncollected=$(printf '%s\n' "$ledger" | grep -o '"uncollected_mc":[0-9]*' | grep -o '[0-9]*$')
tx=$(printf '%s\n' "$ledger" | grep -o '"tx_hash":"0x[0-9a-f]*"' | tail -1 | grep -o '0x[0-9a-f]*')

echo "--- abräumen"
"${SSH[@]}" 'docker rm -f abnahme >/dev/null 2>&1; docker volume rm -f abnahme-home >/dev/null 2>&1; docker rmi -f abnahme-runtime >/dev/null 2>&1; rm -rf /opt/control-plane/abnahme; echo clean'

if [[ "$topup" != "true" || "$registered" != "true" || "$turns" -lt 3 || "$api_errors" != "0" || "$consistent" != "true" || "$uncollected" != "0" ]]; then
  echo "PROD FAIL topup=$topup registered=$registered turns=$turns api_errors=$api_errors ledger_consistent=$consistent uncollected_mc=$uncollected"
  exit 1
fi
echo "PROD OK topup=$topup registered=$registered turns=$turns api_errors=$api_errors ledger_consistent=$consistent uncollected_mc=$uncollected tx=$tx basescan=https://basescan.org/tx/$tx"
