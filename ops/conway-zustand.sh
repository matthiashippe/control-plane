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
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CONWAY_URL:-https://api.conway.tech}"

echo "-- What $BASE says about itself"
root=$(curl -s -m 15 "$BASE/" || echo '{}')
echo "   $root"

echo "-- Provisioning attempt with a fresh wallet"
out=$(CP_URL="$BASE" timeout 120 pnpm -s tsx harness/e2e/provisionierung.ts 2>&1)
echo "$out" | sed 's/^/   /'

if printf '%s' "$out" | grep -q "PROVISIONIERUNG FAIL"; then
  reason=$(printf '%s' "$out" | grep -o 'PROVISIONIERUNG FAIL:.*' | head -1)
  echo
  echo "BROKEN: $reason"
  echo "Our statement on the landing page holds. As of: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  exit 0
fi

echo
echo "WARNING: provisioning at Conway went through."
echo "That makes the statement on src/public/index.html and in the README false."
echo "Change both before somebody checks it. As of: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
exit 1
