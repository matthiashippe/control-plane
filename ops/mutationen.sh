#!/usr/bin/env bash
# Which of these tests would notice if the code under them were wrong?
#
# loop-constraints.md says a test that stays green without its fix is not a test. The suite has
# been held to that one test at a time, as each was written. It had never been held to it as a
# whole, and on 2026-09-22 that turned up two claims nothing backed: `getAvailableMc` could return
# the raw balance instead of balance minus reservations with all 513 tests green, and the
# `status = 'open'` in cancelBounty's UPDATE could go the same way.
#
# So the load-bearing lines get broken on purpose, one at a time, and the suite is asked how many
# tests notice.
#
#   ops/mutationen.sh            every mutation below
#   ops/mutationen.sh fee        only those whose name contains "fee"
#
# Exit 0 when every mutation is caught, 1 when one survives, 2 when it could not tell.
#
# One mutation is reliably "could not tell" here and is not a gap in the suite: breaking the
# publication rule in src/bounties/receipts.ts makes a run inside this loop collect 76 of the 514
# tests, reproducibly, while the identical mutation applied and run by hand collects all 514 and
# turns 10 of them red. Twice checked that way on 2026-09-22. Why the loop changes what vitest
# collects is not understood, so the script says so instead of guessing, and prints how to ask by
# hand. The rule itself is covered: ten tests across four files notice it.
#
# The guard that makes this trustworthy: a partial test run looks exactly like "not caught". A
# hand-rolled loop on 2026-09-22 reported "76 passed (76)" twice and those readings went into a
# protocol entry before being re-run one at a time. So the baseline count is taken first, and any
# run that executes a different number of tests is reported as undetermined rather than as a pass.
set -uo pipefail
cd "$(dirname "$0")/.."

FILTER="${1:-}"

# datei|name|von|nach. `von` has to appear exactly once; the script checks that.
MUTATIONEN=(
  "src/bounties/store.ts|fee rounds up instead of down|  return Math.floor((priceMc * FEE_PERCENT) / 100);|  return Math.ceil((priceMc * FEE_PERCENT) / 100);"
  "src/bounties/store.ts|fee is never taken|const fee = a.feeTo ? feeMc(bounty.price_mc) : 0;|const fee = 0;"
  "src/bounties/store.ts|winner is paid the full price|      deltaMc: bounty.price_mc - fee,|      deltaMc: bounty.price_mc,"
  "src/db.ts|cents round up|  return Math.floor(mc / MC_PER_CENT);|  return Math.ceil(mc / MC_PER_CENT);"
  "src/db.ts|available ignores the reservation|SELECT balance_mc - reserved_mc AS available FROM wallets WHERE address = ?|SELECT balance_mc AS available FROM wallets WHERE address = ?"
  "src/bounties/receipts.ts|everything is published|const published = meins || submittedMs >= PUBLICATION_FROM_MS;|const published = true;"
  "src/bounties/ours.ts|nothing counts as ours|  const found = new Set(OUR_ADDRESSES.filter((a) => wanted.includes(a)));|  const found = new Set<string>();"
  "src/credits/starter.ts|the pool has no floor|  if (left < GRANT_MC) return null;|  if (false) return null;"
)

# One run, numbers read from the JSON reporter rather than scraped off the summary line. The
# first version called vitest twice per mutation and parsed the text: with no failures `rot`
# returned two lines and the comparison broke, so every mutation was reported as surviving while
# the error messages beside it carried the true counts.
lauf() {
  local aus
  aus=$(pnpm -s vitest run --reporter=json --silent 2>/dev/null | python3 -c '
import json, sys
roh = sys.stdin.read()
i = roh.find("{")
if i < 0:
    print("none none"); raise SystemExit
try:
    d = json.loads(roh[i:])
except ValueError:
    print("none none"); raise SystemExit
print(d.get("numTotalTests", "none"), d.get("numFailedTests", "none"))
')
  echo "$aus"
}

echo "Breaking the load-bearing lines on purpose, one at a time"
echo
read -r basis basis_rot <<< "$(lauf)"
if [[ "$basis" == "none" || "${basis_rot:-1}" != "0" ]]; then
  echo "COULD NOT TELL: the baseline is not a clean green run (${basis} tests, ${basis_rot:-?} failing)." >&2
  exit 2
fi
echo "  baseline: $basis test(s), all green"
echo

ueberlebt=0
unklar=0
for eintrag in "${MUTATIONEN[@]}"; do
  datei="${eintrag%%|*}"; rest="${eintrag#*|}"
  name="${rest%%|*}"; rest="${rest#*|}"
  von="${rest%%|*}"; nach="${rest##*|}"
  [[ -n "$FILTER" && "$name" != *"$FILTER"* ]] && continue

  if ! python3 - "$datei" "$von" "$nach" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
if s.count(sys.argv[2]) != 1:
    print(f"  ----  {p}: the line to break appears {s.count(sys.argv[2])} times, not once")
    raise SystemExit(3)
p.write_text(s.replace(sys.argv[2], sys.argv[3], 1))
PY
  then
    echo "  ----  $name: could not be applied, the code moved"
    unklar=$((unklar + 1))
    git checkout -- "$datei" 2>/dev/null
    continue
  fi

  read -r gesamt gefallen <<< "$(lauf)"
  if [[ "$gesamt" != "$basis" ]]; then
    # Vitest caches under node_modules/.vite, and a file written and reverted in quick succession
    # sometimes makes it collect a subset: the receipts mutation reported 76 tests inside this
    # loop and 514 with 10 red when run on its own. One retry clears it; if it does not, the
    # result is still reported as saying nothing rather than as a pass.
    read -r gesamt gefallen <<< "$(lauf)"
  fi
  git checkout -- "$datei"

  if [[ "$gesamt" == "none" || "$gesamt" != "$basis" ]]; then
    echo "  ----  $name: the run executed ${gesamt:-no} test(s) against a baseline of $basis, so this says nothing"
    echo "        Run it by hand and read the numbers yourself:"
    echo "        python3 - <<'"'"'PY'"'"'"
    echo "        import pathlib; p = pathlib.Path(\"$datei\"); s = p.read_text()"
    echo "        p.write_text(s.replace(<the line>, <the replacement>, 1))"
    echo "        PY"
    echo "        pnpm vitest run   # then: git checkout -- $datei"
    unklar=$((unklar + 1))
  elif [[ "${gefallen:-0}" -gt 0 ]]; then
    printf '  ok    %-42s %s test(s) noticed\n' "$name" "$gefallen"
  else
    printf '  ALIVE %-42s nothing noticed\n' "$name"
    ueberlebt=$((ueberlebt + 1))
  fi
done

echo
(( unklar )) && echo "$unklar mutation(s) could not be judged."
if (( ueberlebt )); then
  echo "MUTATIONS SURVIVED: $ueberlebt. A line nobody would miss is a line nobody is checking."
  exit 1
fi
(( unklar )) && exit 2
echo "MUTATIONS OK: every one of them was noticed."
