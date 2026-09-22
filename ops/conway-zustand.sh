#!/usr/bin/env bash
# Is what we claim about Conway on our landing page still true?
#
# The landing page says Conway's sign-up has been broken since July 2026 and backs that up with a
# provisioning attempt. That is a statement about somebody else's service and can become false at
# any time: if Conway fixes the path, our page carries an untruth and we would be the last to find
# out. So it gets checked, not believed.
#
# Costs nothing: a throwaway wallet, no money, exactly the route the twelve reporters in the issues
# took.
#
#   ops/conway-zustand.sh
#
# Exit 0: sign-up still broken, our statement holds.
# Exit 1: sign-up works again. Then the landing page has to change.
# Exit 2: could not tell. Not an alarm, and deliberately not exit 1.
#
# The third case was missing until 2026-09-23 and cost a false alarm of the loudest kind. The check
# decided by looking for "PROVISIONIERUNG FAIL" in the output and treating anything else as
# success, so a run that timed out, lost the network or died before it reached Conway at all
# announced that provisioning there works again, which is the single sentence that would force the
# landing page and the README to change. It happened on a run that exceeded its own two minute
# budget while api.conway.tech reported 2 of 8 healthy workers.
#
# So a verdict now needs its own evidence: FAIL for broken, OK for working, and anything else is
# "I could not tell", which is a state a check about somebody else's infrastructure will be in
# regularly and which must never read as news.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CONWAY_URL:-https://api.conway.tech}"

echo "-- What $BASE says about itself"
root=$(curl -s -m 15 "$BASE/" || echo '{}')
echo "   $root"

echo "-- Provisioning attempt with a fresh wallet"
# The budget is a variable so the third exit can be proven rather than argued:
# `CONWAY_PROBE_TIMEOUT=1 ./ops/conway-zustand.sh` kills the probe before it prints anything,
# which is exactly the run that used to announce that Conway had fixed their sign-up.
out=$(CP_URL="$BASE" timeout "${CONWAY_PROBE_TIMEOUT:-120}" pnpm -s tsx harness/e2e/provisionierung.ts 2>&1)
echo "$out" | sed 's/^/   /'

if printf '%s' "$out" | grep -q "PROVISIONIERUNG FAIL"; then
  reason=$(printf '%s' "$out" | grep -o 'PROVISIONIERUNG FAIL:.*' | head -1)
  echo
  echo "BROKEN: $reason"
  echo "Our statement on the landing page holds. As of: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  exit 0
fi

if printf '%s' "$out" | grep -q "PROVISIONIERUNG OK"; then
  echo
  echo "WARNING: provisioning at Conway went through."
  echo "That makes the statement on src/public/index.html and in the README false."
  echo "Change both before somebody checks it. As of: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  exit 1
fi

echo
echo "COULD NOT TELL: the attempt produced neither a failure nor a success."
echo "That is not news about Conway, it is a run that did not finish: a timeout, a network"
echo "error, or a crash before the first call. Nothing on our pages changes on this."
echo "As of: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
exit 2
