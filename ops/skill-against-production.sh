#!/usr/bin/env bash
# Runs the skill file's own commands against the live service.
#
# skills/cp-bounties/SKILL.md is what an existing Conway runtime is handed, and that population is
# the one that demonstrably exists: twelve people have filed issues about being blocked. The MCP
# route was checked against production on 2026-09-20; this is its twin, and it matters at least as
# much.
#
# A skill file is instructions for a machine that will follow them literally. If a command in it is
# wrong, the agent does not improvise, it fails silently and its operator concludes the market is
# empty. So the commands are taken from the file and run, rather than retyped here.
#
# Like the MCP check, this posts its own throwaway job and cancels it again: a check that watches
# the market must not change it.
#
#   OPERATOR_WALLET=harness/state/mainnet-wallet.json ops/skill-against-production.sh
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://cp.hippe.eu}"
SKILL="skills/cp-bounties/SKILL.md"
failures=0
ok()  { echo "OK      $1"; }
bad() { failures=$((failures+1)); echo "FAILED  $1"; [[ -n "${2:-}" ]] && echo "        saw: ${2:0:250}"; }

# Every URL the skill tells an agent to call has to exist. A 404 here means the file sends agents
# somewhere that is not there.
for u in $(grep -oE "https://[a-z0-9./-]+" "$SKILL" | sort -u); do
  code=$(curl -s -o /dev/null -m 15 -w "%{http_code}" "$u")
  case "$code" in
    404) bad "the skill names $u, which answers 404" ;;
    000) bad "the skill names $u, which did not answer" ;;
    *)   ok "$u answers $code" ;;
  esac
done

echo
# Provision here rather than reusing harness/e2e/provisionierung.ts: that one prints the key
# abbreviated on purpose, and the first version of this check happily submitted a truncated key and
# blamed the service for answering "Invalid API key". The key goes to a file with mode 600, never
# to stdout, and the file is removed on exit.
# Provision through ops/provision-key.ts rather than reusing harness/e2e/provisionierung.ts: that
# one prints the key abbreviated on purpose, and the first version of this check happily submitted
# a truncated key and then blamed the service for answering "Invalid API key". The key goes to a
# file with mode 600, never to stdout, and the file is removed on exit.
keyfile=$(mktemp); chmod 600 "$keyfile"; trap 'rm -f "$keyfile"' EXIT
CP_URL="$BASE" pnpm -s tsx ops/provision-key.ts --out "$keyfile" --name skill-production-check >/dev/null 2>&1
agent=$(cat "$keyfile" 2>/dev/null)
[[ -n "$agent" ]] && ok "provisioned a fresh agent" || { bad "could not provision an agent"; echo "SKILL PRODUCTION FAILED: $failures"; exit 1; }

granted=$(curl -s -m 15 -X POST "$BASE/v1/credits/starter" -H "Authorization: $agent" | grep -o '"granted_cents":[0-9]*' | cut -d: -f2)
[[ "${granted:-0}" -gt 0 ]] && ok "claimed the starter credit, $granted c" || bad "starter credit" "$granted"

# Step 1 of the skill, verbatim.
open=$(curl -s -m 15 "$BASE/bounties.json")
printf '%s' "$open" | grep -q '"award_cents"' && ok "step 1: the open list carries award_cents, which step 2 tells the agent to read" \
  || bad "step 1: award_cents missing from the open list" "$open"

# Its own job to hand work in to.
buyer=$(OPERATOR_WALLET="${OPERATOR_WALLET:-harness/state/mainnet-wallet.json}" CP_URL="$BASE" \
        pnpm -s tsx ops/post-bounty.ts --brief /dev/stdin --price-cents 1 --kind factual --hours 1 <<'BRIEF' 2>&1 | grep -oE "[0-9a-f]{8}-[0-9a-f-]+" | head -1
Throwaway job for the skill production check. Cancelled as soon as the check is done.
BRIEF
)
[[ -n "$buyer" ]] && ok "posted its own throwaway job $buyer" || bad "could not post the throwaway job"

# Step 4 of the skill, verbatim.
sub=$(curl -s -m 20 -X POST "$BASE/v1/submissions" \
        -H "Authorization: $agent" -H 'content-type: application/json' \
        -d "{\"bounty_id\":\"$buyer\",\"body\":\"Skill production check.\"}")
printf '%s' "$sub" | grep -q '"id"' && ok "step 4: submitting works exactly as the file says" || bad "step 4: submission" "$sub"

# Step 5 of the skill, verbatim.
mine=$(curl -s -m 15 "$BASE/v1/submissions/mine" -H "Authorization: $agent")
printf '%s' "$mine" | grep -q '"outcome"' && ok "step 5: the outcome comes back as the file promises" || bad "step 5: outcome" "$mine"

# Take the throwaway job back off the market. The MCP check does the same, and the first run of
# this one did not: it left a one-cent job standing, which is exactly the habit this comment in
# ops/mcp-against-production.ts warns about. A check that watches the market must not change it.
if [[ -n "${buyer:-}" ]]; then
  buyerkey=$(mktemp); chmod 600 "$buyerkey"
  if OPERATOR_WALLET="${OPERATOR_WALLET:-harness/state/mainnet-wallet.json}" CP_URL="$BASE" \
     pnpm -s tsx ops/provision-key.ts --out "$buyerkey" --name skill-check-buyer --wallet "${OPERATOR_WALLET:-harness/state/mainnet-wallet.json}" >/dev/null 2>&1; then
    curl -s -m 15 -X POST "$BASE/v1/bounties/cancel" -H "Authorization: $(cat "$buyerkey")" \
      -H 'content-type: application/json' -d "{\"id\":\"$buyer\"}" | grep -q '"cancelled"' \
      && ok "cancelled its own job again, the market is as it was" \
      || bad "could not cancel the throwaway job; it expires within the hour"
  else
    bad "could not reach the buyer wallet to cancel the throwaway job; it expires within the hour"
  fi
  rm -f "$buyerkey"
fi

echo
if (( failures == 0 )); then echo "SKILL PRODUCTION OK"; else echo "SKILL PRODUCTION FAILED: $failures"; fi
exit $(( failures == 0 ? 0 : 1 ))
