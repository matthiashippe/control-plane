#!/usr/bin/env bash
# Walk the way in, the way somebody who is not us walks it.
#
# Three faults found on 2026-09-22 all had the same root: nobody had ever gone through the front
# door as a stranger. One address in Helsinki did, with an OpenAI-compatible client, and spent 32
# hours on it. Their eight requests are in the log: /v1/status/v1/models, /v1/auth/verify/v1/models,
# /v1/submissions/v1/models, /v1/auth/api-keys/v1/models, /v1/auth/nonce/v1/models. Every answer
# they got was correct and none of them was any use.
#
#   - the 308 that redirects a joined path carried no body, and httpx does not follow redirects by
#     default, so they saw an empty response three times;
#   - the 401 on /v1/models told them to drop a Bearer prefix that has always been accepted, which
#     is a sentence about the one thing that was not wrong;
#   - /v1/models needed a key to show a catalogue that /v1/status hands to anybody.
#
# This walks that path and requires every answer to either be the destination or name the next
# step. It is not a smoke test: ops/smoke.sh proves the service runs. This proves it can be
# entered without reading the source.
#
#   ops/stranger-client.sh [base]
set -uo pipefail
BASE="${1:-${CP_URL:-https://cp.hippe.eu}}"
failures=0
ok()  { echo "  ok      $1"; }
bad() { failures=$((failures+1)); echo "  FAILED  $1"; [[ -n "${2:-}" ]] && echo "          ${2:0:160}"; }

fetch() { curl -s -m 15 -w '\n%{http_code}' "$@"; }
status() { printf '%s' "$1" | tail -1; }
body_of()  { printf '%s' "$1" | sed '$d'; }

echo "Can somebody who is not us get in? ($BASE)"
echo
echo "-- the base URL they guessed wrong, all six shapes from the log --"
for path in /v1/status/v1/models /v1/auth/verify/v1/models /v1/submissions/v1/models \
            /v1/auth/api-keys/v1/models /v1/auth/nonce/v1/models /v1/credits/balance/v1/models; do
  a=$(fetch "$BASE$path"); code=$(status "$a"); body=$(body_of "$a")
  target=$(curl -s -m 15 -o /dev/null -w '%{redirect_url}' "$BASE$path")
  if [[ "$code" != "308" ]]; then
    bad "$path answers $code, not a redirect"; continue
  fi
  # The body is the whole point: a client that does not follow the redirect sees only this.
  if ! printf '%s' "$body" | grep -q "base_url_contains_a_path"; then
    bad "$path redirects with nothing in the body" "$body"
  elif ! printf '%s' "$body" | grep -q "bare origin"; then
    bad "$path has a body that does not say what to set" "$body"
  elif [[ "$target" != *"/v1/models" ]]; then
    bad "$path redirects to $target"
  else
    ok "$path: 308 to /v1/models, and the body names the base URL"
  fi
done

echo
echo "-- the first call every OpenAI-compatible client makes --"
a=$(fetch "$BASE/v1/models"); code=$(status "$a"); body=$(body_of "$a")
if [[ "$code" == "200" ]] && printf '%s' "$body" | grep -q '"data"'; then
  count=$(printf '%s' "$body" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["data"]))' 2>/dev/null || echo "?")
  ok "/v1/models without a key: 200, $count model(s), so the URL can be checked before the key"
else
  bad "/v1/models without a key answers $code" "$body"
fi
a=$(fetch -H "Authorization: Bearer cnwy_k_definitelynotakey" "$BASE/v1/models")
code=$(status "$a"); body=$(body_of "$a")
if [[ "$code" != "401" ]]; then
  bad "a wrong key on /v1/models answers $code, it has to stay 401" "$body"
elif printf '%s' "$body" | grep -qi "without the Bearer"; then
  bad "the 401 blames the Bearer prefix, which has always been accepted" "$body"
elif ! printf '%s' "$body" | grep -q "docs"; then
  bad "the 401 carries no link to the documentation" "$body"
else
  ok "a wrong key is still a wrong key, and the message does not blame the prefix"
fi

echo
echo "-- what the file for machines tells them --"
llms=$(curl -s -m 15 "$BASE/llms.txt")
for sentence in "bare origin with no path" "GET /v1/models answers without a key" "raw or with the Bearer prefix"; do
  printf '%s' "$llms" | grep -q "$sentence" && ok "llms.txt says: $sentence" || bad "llms.txt does not say: $sentence"
done

echo
echo "-- and the way to a key, for somebody with no runtime --"
a=$(fetch "$BASE/v1/credits/balance"); code=$(status "$a"); body=$(body_of "$a")
if [[ "$code" == "401" ]] && printf '%s' "$body" | grep -q "v1/auth/nonce"; then
  ok "a protected path is shut and names the three auth calls"
else
  bad "/v1/credits/balance answers $code without naming the way to a key" "$body"
fi

echo
if (( failures == 0 )); then echo "THE WAY IN IS WALKABLE"; else echo "THE WAY IN IS BLOCKED: $failures"; fi
exit $(( failures == 0 ? 0 : 1 ))
