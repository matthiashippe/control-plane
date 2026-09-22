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
# The guard below is what makes any of this trustworthy, and it earned its keep on the first run:
# one mutation collected 76 of 514 tests instead of all of them, and the guard reported that as
# saying nothing rather than as a pass. It took three wrong hypotheses to find the cause, and it
# was in this file. See the separator note above the list.
#
# The guard that makes this trustworthy: a partial test run looks exactly like "not caught". A
# hand-rolled loop on 2026-09-22 reported "76 passed (76)" twice and those readings went into a
# protocol entry before being re-run one at a time. So the baseline count is taken first, and any
# run that executes a different number of tests is reported as undetermined rather than as a pass.
set -uo pipefail
cd "$(dirname "$0")/.."

FILTER="${1:-}"

# datei :: name :: von :: nach. The separator is "::" and not "|", which was the bug that cost a
# cycle: the publication rule reads `const published = meins || submittedMs >= ...`, the split took
# everything up to the first "|", the replacement produced `const published = true;|| submittedMs
# >= ...`, and that file no longer parsed. vitest then collected 76 of 514 tests, which the guard
# below reported as "says nothing" while I looked for the cause in stdin, in caching and in timing.
# A separator that can appear in the thing being separated is not a separator.
MUTATIONEN=(
  "src/bounties/store.ts::fee rounds up instead of down::  return Math.floor((priceMc * FEE_PERCENT) / 100);::  return Math.ceil((priceMc * FEE_PERCENT) / 100);"
  "src/bounties/store.ts::fee is never taken::const fee = a.feeTo ? feeMc(bounty.price_mc) : 0;::const fee = 0;"
  "src/bounties/store.ts::winner is paid the full price::      deltaMc: bounty.price_mc - fee,::      deltaMc: bounty.price_mc,"
  "src/db.ts::cents round up::  return Math.floor(mc / MC_PER_CENT);::  return Math.ceil(mc / MC_PER_CENT);"
  "src/db.ts::available ignores the reservation::SELECT balance_mc - reserved_mc AS available FROM wallets WHERE address = ?::SELECT balance_mc AS available FROM wallets WHERE address = ?"
  "src/bounties/receipts.ts::everything is published::const published = meins || submittedMs >= PUBLICATION_FROM_MS;::const published = true;"
  "src/bounties/ours.ts::nothing counts as ours::  const found = new Set(OUR_ADDRESSES.filter((a) => wanted.includes(a)));::  const found = new Set<string>();"
  "src/credits/starter.ts::the pool has no floor::  if (left < GRANT_MC) return null;::  if (false) return null;"
  "src/check/fabrication.ts::a quote nobody wrote still counts::    if (!quote || !kind || !haystack.includes(normalise(quote))) {::    if (false) {"
  "src/check/fabrication.ts::the check finds nothing at all::  if (!Array.isArray(list)) return { findings: [], discarded: 0 };::  if (true) return { findings: [], discarded: 0 };"
  "src/inference/proxy.ts::the markup is dropped::export const MARKUP = 1.3;::export const MARKUP = 1.0;"
  "src/bounties/brief.ts::the brief check finds nothing::export function reviewBrief(brief: string, kind: \"factual\" | \"creative\"): BriefFinding[] {::export function reviewBrief(brief: string, kind: \"factual\" | \"creative\"): BriefFinding[] { if (brief) return [];"
  "src/bounties/store.ts::an expired job keeps the money::    .prepare(\"UPDATE bounties SET status = 'expired', closed_at = ? WHERE id = ? AND status = 'open'\")::    .prepare(\"UPDATE bounties SET status = 'expired', closed_at = ? WHERE id = ? AND status = 'awarded'\")"
)

# One run, numbers read from the JSON reporter rather than scraped off the summary line. The
# first version called vitest twice per mutation and parsed the text: with no failures `rot`
# returned two lines and the comparison broke, so every mutation was reported as surviving while
# the error messages beside it carried the true counts.
lauf() {
  local aus
  aus=$(pnpm -s vitest run --reporter=json --silent < /dev/null 2>/dev/null | python3 -c '
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
  datei="${eintrag%%::*}"; rest="${eintrag#*::}"
  name="${rest%%::*}"; rest="${rest#*::}"
  von="${rest%%::*}"; nach="${rest#*::}"
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
