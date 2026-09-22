#!/usr/bin/env bash
# Counts the people who reported the Conway provisioning problem, per month.
# Evidence for section F2 in ../2026-09-19-nachfrage.md.
#
# Definition: an "affected person" is a GitHub user who appears as author or commenter in one of
# the twelve provisioning issues between 17.07. and 29.08.2026. Bots and we ourselves
# (matthiashippe) do not count. BORDERLINE are issues with a related but different problem; they
# are reported separately.
set -euo pipefail
CORE="339 353 355 356 359 371 372 373 376 377 379 380"
BORDERLINE="385 390 392"
REPO="Conway-Research/automaton"

for n in $CORE $BORDERLINE; do
  gh api "repos/$REPO/issues/$n" --jq "\"$n\tISSUE\t\(.created_at[0:10])\t\(.user.login)\""
  gh api "repos/$REPO/issues/$n/comments?per_page=100" --jq ".[] | \"$n\tCOMMENT\t\(.created_at[0:10])\t\(.user.login)\""
done | python3 -c '
import sys, collections
CORE = set("339 353 355 356 359 371 372 373 376 377 379 380".split())
rows = [l.rstrip("\n").split("\t") for l in sys.stdin if l.strip()]
rows = [r for r in rows if r[3] != "matthiashippe" and not r[3].endswith("[bot]")]
def show(selection, label):
    active = collections.defaultdict(set)
    for num, kind, d, login in rows:
        if num in selection:
            active[d[0:7]].add(login)
    everyone = set().union(*active.values()) if active else set()
    print(label)
    for m in sorted(active):
        print(f"  {m}: {len(active[m])} people active")
    print(f"  total: {len(everyone)} people")
    for days, since in ((30, "2026-08-20"), (14, "2026-09-05")):
        sel = {r[3] for r in rows if r[0] in selection and r[2] >= since}
        print(f"  last {days} days (from {since}): {len(sel)}")
show(CORE, "Twelve provisioning issues:")
show(CORE | {"385","390","392"}, "\nWith the three borderline cases:")
'
