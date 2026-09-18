#!/usr/bin/env bash
# Goal 1: Runtime erreicht das Control Plane über TLS und provisioniert sich einen API-Key.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.yml)

cleanup() { "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

./gen-certs.sh
"${COMPOSE[@]}" build --quiet
"${COMPOSE[@]}" up -d --wait cp

echo "--- health aus dem Runtime-Container"
health=$("${COMPOSE[@]}" run --rm --no-deps runtime health)
echo "$health"
[[ "$health" == *'"ok":true'* ]] || { echo "SMOKE FAIL: health"; exit 1; }

echo "--- provision"
out=$("${COMPOSE[@]}" run --rm --no-deps runtime provision 2>&1) || { echo "$out"; echo "SMOKE FAIL: provision"; exit 1; }
echo "$out"
key=$(printf '%s\n' "$out" | grep -o '"apiKey": *"cnwy_k_[0-9a-f]*"' | head -1 | grep -o 'cnwy_k_[0-9a-f]*')
[[ -n "$key" ]] || { echo "SMOKE FAIL: kein cnwy_k_-Key in der Ausgabe"; exit 1; }

echo "--- balance mit dem frischen Key"
balance=$("${COMPOSE[@]}" run --rm --no-deps -e KEY="$key" runtime bash -c '
  node -e "fetch(process.env.CONWAY_API_URL + \"/v1/credits/balance\", { headers: { authorization: process.env.KEY } })
    .then(async (r) => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })"' 2>&1) || { echo "$balance"; echo "SMOKE FAIL: balance"; exit 1; }
echo "$balance"
[[ "$balance" == *'{"balance_cents":0}'* ]] || { echo "SMOKE FAIL: balance body"; exit 1; }

cleanup
trap - EXIT
remaining=$("${COMPOSE[@]}" ps -q | wc -l | tr -d ' ')
[[ "$remaining" == "0" ]] || { echo "SMOKE FAIL: Container übrig"; exit 1; }
echo "SMOKE OK key_prefix=${key:0:15}"
