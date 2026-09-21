#!/usr/bin/env bash
# Every check this project has, in one run.
#
# By 2026-09-21 there were six ways to ask whether the live service is still what we say it is,
# and each cycle ran a different subset of them by hand. A check that exists and does not run is
# almost as useless as one that does not exist, and picking which to run by memory is exactly how
# the gap opens.
#
# Two depths, because two of the checks leave traces. The shallow run only reads. The deep run also
# provisions throwaway agents and posts one-cent jobs that it cancels again, so it belongs in a
# cycle that has a reason to doubt the supply side, not in every one.
#
#   ops/check-all.sh           read-only: health, Conway, market, journeys, numbers
#   ops/check-all.sh --deep    also the MCP route and the skill route, end to end
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://cp.hippe.eu}"
DEEP=0
[[ "${1:-}" == "--deep" ]] && DEEP=1
declare -a PASSED=() FAILED=()

run() {
  local name="$1"; shift
  local out
  out=$("$@" 2>&1)
  local code=$?
  if (( code == 0 )); then
    PASSED+=("$name")
    printf '  ok    %-34s %s\n' "$name" "$(printf '%s' "$out" | tail -1 | cut -c1-60)"
  else
    FAILED+=("$name")
    printf '  FAIL  %-34s exit %s\n' "$name" "$code"
    printf '%s\n' "$out" | tail -4 | sed 's/^/        /'
  fi
}

echo "Handsel, all checks against $BASE"
echo

# The service itself, before anything that depends on it. If this is red nothing else means much.
run "health from outside" bash -c "code=\$(curl -s -o /dev/null -m 10 -w '%{http_code}' $BASE/health); [[ \$code == 200 ]] && echo \"\$code\" || { echo \"\$code\"; exit 1; }"

# Our own public claim about Conway. Returns 1 when their onboarding works again, which would make
# the front page untrue.
run "conway still broken" ./ops/conway-zustand.sh

run "market guards" env CP_URL="$BASE" pnpm -s tsx harness/e2e/markt.ts
run "journeys match the service" ./ops/journeys-pruefen.sh

if (( DEEP )); then
  run "MCP route end to end" env CP_URL="$BASE" OPERATOR_WALLET="${OPERATOR_WALLET:-harness/state/mainnet-wallet.json}" pnpm -s tsx ops/mcp-against-production.ts
  run "skill route end to end" env CP_URL="$BASE" OPERATOR_WALLET="${OPERATOR_WALLET:-harness/state/mainnet-wallet.json}" ./ops/skill-against-production.sh
fi

echo
# The one number the plan hangs on, printed last so it is the thing left on the screen.
open=$(curl -s -m 10 "$BASE/bounties.json" | grep -o '"id"' | wc -l | tr -d ' ')
echo "open jobs: ${open:-?}"
if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
  ./ops/status.sh 2>/dev/null | python3 -c "
import json, sys
try:
    m = json.load(sys.stdin)['db']['market']
except Exception:
    sys.exit(0)
print(f\"foreign buyers: {m['foreign_buyers']}   foreign agents: {m['foreign_agents']}   \"
      f\"awarded: {m['awarded']}   fee earned: {m['fee_earned_mc']/1000:.2f} c   \"
      f\"starter pool left: {m['starter_pool_left_mc']/1000:.0f} c\")
" || true
else
  echo "(no OPENROUTER_API_KEY, so the market numbers are skipped)"
fi

echo
if (( ${#FAILED[@]} == 0 )); then
  echo "ALL CHECKS OK (${#PASSED[@]} of ${#PASSED[@]})"
  exit 0
fi
echo "CHECKS FAILED: ${FAILED[*]}"
exit 1
