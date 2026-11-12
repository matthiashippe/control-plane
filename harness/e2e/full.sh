#!/usr/bin/env bash
# Complete first run of the unmodified upstream runtime against the control plane:
# provisioning, registration, bootstrap topup, five turns, sleep. No Conway API error allowed.
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
out=$("${COMPOSE[@]}" run --rm --no-deps runtime provision 2>&1) || { echo "$out"; echo "E2E FAIL: provision"; exit 1; }
key=$(printf '%s\n' "$out" | grep -o '"apiKey": *"cnwy_k_[0-9a-f]*"' | head -1 | grep -o 'cnwy_k_[0-9a-f]*')
wallet=$(printf '%s\n' "$out" | grep -o '"walletAddress": *"0x[0-9a-fA-F]*"' | head -1 | grep -o '0x[0-9a-fA-F]*')
[[ -n "$key" && -n "$wallet" ]] || { echo "$out"; echo "E2E FAIL: key or wallet missing"; exit 1; }
echo "wallet=$wallet key_prefix=${key:0:15}"
"${COMPOSE[@]}" run --rm chain-tools fund "$wallet" 6 >/dev/null

echo "--- start runtime, wait for registration, topup, five turns and sleep"
"${COMPOSE[@]}" up -d --no-deps runtime
deadline=$((SECONDS + 240))
while (( SECONDS < deadline )); do
  logs=$("${COMPOSE[@]}" logs --no-color runtime 2>/dev/null)
  turns=$(printf '%s\n' "$logs" | grep -c 'Turn [0-9A-Za-z_-]*: [0-9]* tools' || true)
  if (( turns >= 5 )) && printf '%s\n' "$logs" | grep -q 'Sleeping for'; then break; fi
  sleep 3
done
logs=$("${COMPOSE[@]}" logs --no-color runtime 2>/dev/null)
"${COMPOSE[@]}" stop runtime >/dev/null
turns=$(printf '%s\n' "$logs" | grep -c 'Turn [0-9A-Za-z_-]*: [0-9]* tools' || true)
api_errors=$(printf '%s\n' "$logs" | grep -c 'Conway API error\|registration failed' || true)
registered=false
printf '%s\n' "$logs" | grep -q 'Automaton identity registered\.' && registered=true
printf '%s\n' "$logs" | grep -E "registered|registration|Bootstrap topup: \+|Turn [0-9A-Za-z_-]*:|\[SLEEP\]|Sleeping for|Conway API error|ERROR|FATAL" | head -30 || true

echo "--- balance and ledger"
balance=$("${COMPOSE[@]}" run --rm --no-deps -e KEY="$key" runtime node -e '
  fetch(process.env.CONWAY_API_URL + "/v1/credits/balance", { headers: { authorization: process.env.KEY } })
    .then(async (r) => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })' 2>&1)
echo "$balance"
balance_cents=$(printf '%s\n' "$balance" | grep -o '"balance_cents":[0-9]*' | grep -o '[0-9]*$')
ledger=$("${COMPOSE[@]}" exec -T cp node -e '
  const db = require("better-sqlite3")("/data/cp.db", { readonly: true });
  const w = db.prepare("SELECT balance_mc FROM wallets ORDER BY created_at LIMIT 1").get();
  const sum = db.prepare("SELECT coalesce(sum(delta_mc),0) AS s FROM ledger").get().s;
  const kinds = db.prepare("SELECT kind, count(*) AS n FROM ledger GROUP BY kind").all();
  const automatons = db.prepare("SELECT automaton_id, address, name FROM automatons").all();
  console.log(JSON.stringify({ balance_mc: w.balance_mc, ledger_sum_mc: sum, consistent: sum === w.balance_mc, kinds, automatons }));' 2>&1)
echo "$ledger"
consistent=$(printf '%s\n' "$ledger" | grep -o '"consistent":[a-z]*' | grep -o '[a-z]*$')
db_registered=$(printf '%s\n' "$ledger" | grep -c "\"address\":\"$(printf '%s' "$wallet" | tr 'A-F' 'a-f')\"" || true)

# The five domain calls of docs/sandbox/vertrag.md, made by the runtime's own client
# (dist/conway/client.js of the unmodified runtime at the pin), with the key it provisioned. All five
# answer with the error the client hands to its tool (search and register 501, DNS 403); none may be a
# 404 (retried three times) or open the circuit breaker. Then the runtime's own tool search_domains
# (dist/agent/tools.js) runs once, and the text it hands the model must not call a name taken and must
# say that no domain can be registered here.
echo "--- domains through the runtime's own client"
domains=$("${COMPOSE[@]}" run --rm --no-deps -e KEY="$key" runtime node --input-type=module -e '
  const { createConwayClient } = await import("/opt/automaton/dist/conway/client.js");
  const c = createConwayClient({ apiUrl: process.env.CONWAY_API_URL, apiKey: process.env.KEY, sandboxId: "" });
  const status = async (label, f) => {
    try { const r = await f(); console.log(`DOMAIN ${label} -> ok ${JSON.stringify(r)}`); return "ok"; }
    catch (e) { const s = e.status ?? "none"; console.log(`DOMAIN ${label} -> ${s} ${String(e.message).slice(0, 160)}`); return String(s); }
  };
  const got = {
    search: await status("GET /v1/domains/search", () => c.searchDomains("e2eagent", "com,io")),
    register: await status("POST /v1/domains/register", () => c.registerDomain("e2eagent.com")),
    list: await status("GET /v1/domains/{domain}/dns", () => c.listDnsRecords("e2eagent.com")),
    add: await status("POST /v1/domains/{domain}/dns", () => c.addDnsRecord("e2eagent.com", "A", "@", "192.0.2.1")),
    del: await status("DELETE /v1/domains/{domain}/dns/{record}", () => c.deleteDnsRecord("e2eagent.com", "rec-1")),
  };
  console.log("DOMAINS_RESULT " + JSON.stringify(got));
  try {
    const { createBuiltinTools, executeTool } = await import("/opt/automaton/dist/agent/tools.js");
    const r = await executeTool("search_domains", { query: "e2eagent", tlds: "com,io" }, createBuiltinTools(""), { conway: c });
    console.log("DOMAIN_TOOL search_domains " + JSON.stringify(r.error || r.result));
  } catch (e) { console.log("DOMAIN_TOOL_FAILED " + String(e && e.message).slice(0, 200)); }' 2>&1) || true
printf '%s\n' "$domains" | grep -E '^DOMAIN' || true
domains_ok=false
printf '%s\n' "$domains" | grep -q '^DOMAINS_RESULT {"search":"501","register":"501","list":"403","add":"403","del":"403"}$' && domains_ok=true
tool_text=$(printf '%s\n' "$domains" | grep '^DOMAIN_TOOL search_domains ' || true)
[[ -n "$tool_text" ]] || domains_ok=false
printf '%s\n' "$tool_text" | grep -qi 'taken' && domains_ok=false
printf '%s\n' "$tool_text" | grep -q 'No domain can be registered here' || domains_ok=false

cleanup
trap - EXIT
remaining=$("${COMPOSE[@]}" ps -q | wc -l | tr -d ' ')
[[ "$remaining" == "0" ]] || { echo "E2E FAIL: containers left behind"; exit 1; }
if [[ "$turns" -lt 5 || "$registered" != "true" || "$api_errors" != "0" || "$consistent" != "true" || "$db_registered" != "1" || "$balance_cents" -ge 500 || "$domains_ok" != "true" ]]; then
  echo "E2E FAIL turns=$turns registered=$registered api_errors=$api_errors ledger_consistent=$consistent db_registered=$db_registered balance_cents=$balance_cents domains=$domains_ok"
  exit 1
fi
echo "E2E OK turns=$turns registered=$registered api_errors=$api_errors ledger_consistent=$consistent balance_cents=$balance_cents domains=$domains_ok"
