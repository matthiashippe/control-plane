#!/usr/bin/env bash
# Every tier the pages publish is a tier the service actually sells.
#
# On 2026-09-29 the two came apart, for a reason no test inside the checkout can see:
# `payConfigFromEnv()` lets `CP_TOPUP_TIERS_USD` override the `TOPUP_TIERS_USD` constant, and the
# production environment pinned the old list at the moment the constant gained a 1 USD tier.
# `/openapi.json` was generated from the constant, so it documented `/pay/1` while `/pay/1`
# answered 400. Every unit test stayed green, because they build the app with a config they pass
# in themselves. This is their twin against production.
#
# It also catches the plain case: the two published lists drifting apart from each other.
#
#   ops/tiers-agree.sh              against production
#   ops/tiers-agree.sh --selftest   the counter-proof on planted lists
#
# Exit 0 when they agree and every tier answers 402, 1 when they do not, 2 when it could not look.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://postyourprice.com}"

liste() { # stdin: json, $1: python-Ausdruck auf d
  python3 -c "
import json, sys
d = json.load(sys.stdin)
print(' '.join(str(t) for t in ($1)))
" 2>/dev/null
}

if [[ "${1:-}" == "--selftest" ]]; then
  fail=0
  wk='{"accepts":[{"amounts_usd":[1,5,25]}]}'
  gleich='{"paths":{"/pay/{usd}":{"get":{"parameters":[{"schema":{"enum":[1,5,25]}}]}}}}'
  anders='{"paths":{"/pay/{usd}":{"get":{"parameters":[{"schema":{"enum":[5,25]}}]}}}}'
  a=$(printf '%s' "$wk" | liste 'd["accepts"][0]["amounts_usd"]')
  b=$(printf '%s' "$gleich" | liste 'd["paths"]["/pay/{usd}"]["get"]["parameters"][0]["schema"]["enum"]')
  c=$(printf '%s' "$anders" | liste 'd["paths"]["/pay/{usd}"]["get"]["parameters"][0]["schema"]["enum"]')
  [[ "$a" == "1 5 25" ]] && echo "  ok      die well-known-Liste wird gelesen" || { echo "  FAILED  well-known: [$a]"; fail=1; }
  [[ "$a" == "$b" ]] && echo "  ok      zwei gleiche Listen gelten als gleich" || { echo "  FAILED  [$a] vs [$b]"; fail=1; }
  [[ "$a" != "$c" ]] && echo "  ok      eine fehlende Stufe faellt auf" || { echo "  FAILED  [$a] vs [$c] nicht unterschieden"; fail=1; }
  kaputt=$(printf 'kein json' | liste 'd["accepts"]')
  [[ -z "$kaputt" ]] && echo "  ok      unlesbares JSON gibt nichts zurueck statt etwas Falsches" || { echo "  FAILED  [$kaputt]"; fail=1; }
  (( fail == 0 )) && echo "TIERS SELFTEST OK" || echo "TIERS SELFTEST FAILED"
  exit $fail
fi

wk=$(curl -s -m 20 "$BASE/.well-known/x402" | liste 'd["accepts"][0]["amounts_usd"]')
oa=$(curl -s -m 20 "$BASE/openapi.json" | liste 'd["paths"]["/pay/{usd}"]["get"]["parameters"][0]["schema"]["enum"]')

if [[ -z "$wk" || -z "$oa" ]]; then
  echo "could not read the published tiers from $BASE"
  exit 2
fi

if [[ "$wk" != "$oa" ]]; then
  echo "the two published lists disagree:"
  echo "   /.well-known/x402  [$wk]"
  echo "   /openapi.json      [$oa]"
  echo "   One of them is generated from the source and the other from the running config."
  exit 1
fi

bad=0
for t in $wk; do
  code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$BASE/pay/$t")
  if [[ "$code" != "402" ]]; then
    echo "published tier $t answers $code, not 402"
    bad=1
  fi
done
(( bad )) && exit 1

echo "tiers [$wk] are published in both files and every one answers 402"
