#!/usr/bin/env bash
# Zaehlt die Personen, die sich zum Provisionierungsproblem von Conway gemeldet haben,
# je Monat. Beleg zu Abschnitt F2 in ../2026-09-19-nachfrage.md.
#
# Definition: "Betroffene Person" ist ein GitHub-Nutzer, der in einem der zwoelf
# Provisionierungs-Issues zwischen 17.07. und 29.08.2026 als Autor oder Kommentator auftaucht.
# Bots und wir selbst (matthiashippe) zaehlen nicht. GRENZFAELLE sind Issues mit verwandtem,
# aber anderem Problem; sie werden getrennt ausgewiesen.
set -euo pipefail
KERN="339 353 355 356 359 371 372 373 376 377 379 380"
GRENZFAELLE="385 390 392"
REPO="Conway-Research/automaton"

for n in $KERN $GRENZFAELLE; do
  gh api "repos/$REPO/issues/$n" --jq "\"$n\tISSUE\t\(.created_at[0:10])\t\(.user.login)\""
  gh api "repos/$REPO/issues/$n/comments?per_page=100" --jq ".[] | \"$n\tCOMMENT\t\(.created_at[0:10])\t\(.user.login)\""
done | python3 -c '
import sys, collections
KERN = set("339 353 355 356 359 371 372 373 376 377 379 380".split())
rows = [l.rstrip("\n").split("\t") for l in sys.stdin if l.strip()]
rows = [r for r in rows if r[3] != "matthiashippe" and not r[3].endswith("[bot]")]
def zeig(auswahl, label):
    aktiv = collections.defaultdict(set)
    for num, kind, d, login in rows:
        if num in auswahl:
            aktiv[d[0:7]].add(login)
    alle = set().union(*aktiv.values()) if aktiv else set()
    print(label)
    for m in sorted(aktiv):
        print(f"  {m}: {len(aktiv[m])} Personen aktiv")
    print(f"  gesamt: {len(alle)} Personen")
    for tage, ab in ((30, "2026-08-20"), (14, "2026-09-05")):
        sel = {r[3] for r in rows if r[0] in auswahl and r[2] >= ab}
        print(f"  letzte {tage} Tage (ab {ab}): {len(sel)}")
zeig(KERN, "Zwoelf Provisionierungs-Issues:")
zeig(KERN | {"385","390","392"}, "\nMit den drei Grenzfaellen:")
'
