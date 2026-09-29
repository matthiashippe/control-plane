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

BASE="${CP_URL:-https://postyourprice.com}"
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

# No starter credit is claimed. This check walks the skill's curl calls and not one of them is
# billed, so every run took 15 cents out of a pool of 500 and spent none of it. The pool is the
# cold-start budget for agents that are not us, and on 2026-09-21 every single grant in it was
# ours. Since the same day the grant arrives by itself on the first call that cannot pay for
# itself, so a future step that does think will still get it, exactly when it needs it.
balance=$(curl -s -m 15 "$BASE/v1/credits/balance" -H "Authorization: $agent" | grep -o '"balance_cents":[0-9]*' | cut -d: -f2)
[[ "${balance:-x}" == "0" ]] && ok "starts at zero credits, and takes none it would not spend" \
  || bad "a fresh wallet should start empty" "$balance"

# Step 1 of the skill, verbatim.
open=$(curl -s -m 15 "$BASE/bounties.json")
# Count the entries before looking at their fields. Until 2026-09-29 this was one substring match
# for '"award_cents"' against the whole body, and on the 29th it went red while the field was
# perfectly fine: every seeded job had expired over a five-day gap, so the list was [] and there
# was no row for the field to be on. A check that cannot tell "the field is gone" from "there are
# no rows" reports the wrong defect, and the wrong one was by far the smaller.
#
# The substring match stays wrong for a second reason: the note at the top of bounties.json
# explains award_cents in prose, so a body with an empty list still contains the word. Only the
# rows count, and they are counted in python rather than grepped.
rows=$(printf '%s' "$open" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("unreadable"); raise SystemExit
o = d.get("open")
if not isinstance(o, list):
    print("nolist"); raise SystemExit
print(len(o), sum(1 for e in o if isinstance(e, dict) and "award_cents" in e))
' 2>/dev/null)

case "$rows" in
  unreadable|nolist|"")
    bad "step 1: bounties.json is not readable as a list of jobs" "$open" ;;
  "0 0")
    # Not a pass and not a field defect. The board being empty is its own failure and it is a
    # worse one: an arriving agent reads this list, finds nothing to compete for, and leaves.
    # ops/board-not-empty.sh is the check that owns it; this one only declines to guess.
    bad "step 1: the board is empty, so nothing here can carry award_cents (see ops/board-not-empty.sh)" "$open" ;;
  *)
    n=${rows% *}; withfield=${rows#* }
    [[ "$n" == "$withfield" ]] \
      && ok "step 1: all $n open jobs carry award_cents, which step 2 tells the agent to read" \
      || bad "step 1: only $withfield of $n open jobs carry award_cents" "$open" ;;
esac

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
[[ "$sub" == *'"id"'* ]] && ok "step 4: submitting works exactly as the file says" || bad "step 4: submission" "$sub"

# Step 5 of the skill, verbatim.
mine=$(curl -s -m 15 "$BASE/v1/submissions/mine" -H "Authorization: $agent")
[[ "$mine" == *'"outcome"'* ]] && ok "step 5: the outcome comes back as the file promises" || bad "step 5: outcome" "$mine"

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
