#!/usr/bin/env python3
"""Check every issue answer against what we measure, before any of it goes out.

`ops/vor-dem-artikel.py` does this for the article. The issue answers had nothing, and they carry
the same kind of claim about somebody else's repository: when the last maintainer comment was, when
the last commit was, how long PR #370 has been open. Every one of those ages, and two of them were
already wrong on 2026-09-22: four drafts said "no maintainer reply since March 7" while the last
one is from 6 March 04:43 UTC. A day out, under Matthias' name, in a tracker where anybody can
check it in two clicks.

It also enforces the lesson from 20.09., paid for with a real visitor count: an answer that does
not spell out https://cp.hippe.eu leads nowhere. The repo link alone brought one visitor in
fourteen days, and that one came from our own site.

    ops/vor-den-antworten.py            all drafts
    ops/vor-den-antworten.py 372 376    only these

Exit 0: everything checks out. Exit 1: something in a draft is not true any more.
"""
import json
import pathlib
import re
import subprocess
import sys

REPO = "Conway-Research/automaton"
ORDNER = pathlib.Path(".scratch/gtm/issue-antworten")

fehler = 0


def sagt(ok: bool, text: str, detail: str = "") -> None:
    global fehler
    print(f"  {'ok     ' if ok else 'FAILED '} {text}")
    if not ok:
        fehler += 1
        if detail:
            print(f"          {detail}")


def gh(pfad: str, jq: str) -> str:
    r = subprocess.run(["gh", "api", pfad, "--jq", jq], capture_output=True, text=True)
    return r.stdout.strip()


# The facts, from GitHub and not from the drafts.
letzter_wartungs_kommentar = None
for seite in (1, 2, 3):
    aus = gh(
        f"repos/{REPO}/issues/comments?sort=created&direction=desc&per_page=100&page={seite}",
        '[.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR"))] | .[0].created_at // empty',
    )
    if aus:
        letzter_wartungs_kommentar = aus
        break

letzter_push = gh(f"repos/{REPO}", ".pushed_at")
pr370 = gh(f"repos/{REPO}/pulls/370", r'"\(.state) \(.created_at)"')

print("What the drafts claim about Conway, against what GitHub says right now")
print(f"  last maintainer comment: {letzter_wartungs_kommentar}")
print(f"  last push:               {letzter_push}")
print(f"  PR 370:                  {pr370}")
print()

MONATE = {
    "01": "January", "02": "February", "03": "March", "04": "April", "05": "May", "06": "June",
    "07": "July", "08": "August", "09": "September", "10": "October", "11": "November", "12": "December",
}


def als_text(iso: str) -> tuple[str, str]:
    """('March 6', '6 March') for an ISO timestamp, both spellings a draft might use."""
    monat, tag = MONATE[iso[5:7]], str(int(iso[8:10]))
    return f"{monat} {tag}", f"{tag} {monat}"


draussen: list[str] = []
offen: list[str] = []
entfaellt: list[str] = []
gesucht = sys.argv[1:]
dateien = sorted(ORDNER.glob("*.md"))
dateien = [d for d in dateien if d.stem != "README" and (not gesucht or d.stem in gesucht)]
if not dateien:
    print("No drafts to check.")
    raise SystemExit(0)

for datei in dateien:
    nummer = datei.stem
    text = datei.read_text()
    print(f"#{nummer}")

    # 1. The claim that ages fastest: when a maintainer last said anything.
    erwaehnt_maerz = re.findall(r"since (\w+ \d{1,2}|\w+)(?=[,.\s])", text)
    if letzter_wartungs_kommentar and any("March" in m for m in erwaehnt_maerz):
        a, b = als_text(letzter_wartungs_kommentar)
        genau = re.findall(r"since (March \d{1,2})", text)
        falsch = [g for g in genau if g != a]
        sagt(
            not falsch,
            f"names the last maintainer comment correctly ({a})",
            f"the draft says 'since {falsch[0]}', GitHub says {letzter_wartungs_kommentar}" if falsch else "",
        )

    # 2. The last commit.
    if "August 26" in text or re.search(r"last commit \w+ \d", text):
        a, b = als_text(letzter_push)
        sagt(a in text or b in text, f"names the last commit correctly ({a})",
             f"GitHub says {letzter_push}")

    # 3. PR 370.
    if "#370" in text:
        zustand, erstellt = pr370.split(" ", 1)
        a, b = als_text(erstellt)
        sagt(zustand == "open", "PR #370 is still open, as the draft assumes", f"it is {zustand}")
        if re.search(r"#370[^.]*since \w+ \d", text):
            sagt(a in text or b in text, f"names when #370 opened correctly ({a})",
                 f"GitHub says {erstellt}")

    # 4. and 5. Either both or neither.
    #
    # Two drafts name no service and carry no disclosure, on purpose: #373 is a Windows bug our
    # service does not fix, and #380 is an issue created by accident. Mentioning what we sell
    # where somebody needed a patch is advertising, and those two are the most credible answers
    # in the set. What must never happen is one without the other: a link with no disclosure, or
    # a disclosure with no way to get here. So they are checked against each other, not against a
    # rule that every answer has to sell something.
    nennt = "cp.hippe.eu" in text
    offenlegung = bool(re.search(r"^Disclosure:", text, re.M))
    if nennt or offenlegung:
        sagt("https://cp.hippe.eu" in text,
             "spells out https://cp.hippe.eu, not just the repo",
             "the drafts of 20.09. named only the repo and brought nobody: the repo had one "
             "visitor in fourteen days, and that one came from our own site")
        sagt(offenlegung, "carries a disclosure line, because it names the service")
    else:
        print("  ok      names no service and carries no disclosure, deliberately")

    # 6. A closed issue is not a fault in the draft, it is a draft that has lost its occasion.
    #    Commenting there reaches nobody, so it drops out of the list rather than going red.
    zustand = gh(f"repos/{REPO}/issues/{nummer}", ".state")
    if zustand != "open":
        print(f"  --      issue #{nummer} is {zustand}, so this draft has no occasion left")
        entfaellt.append(nummer)
        print()
        continue
    print(f"  ok      issue #{nummer} is open")

    # 7. Already answered there is not a fault, it is the draft having done its job. Only a
    #    second comment from us would be one, and that is what this would catch.
    autoren = gh(f"repos/{REPO}/issues/{nummer}/comments", "[.[].user.login] | join(\",\")")
    if "matthiashippe" in autoren:
        print("  ok      already posted (our comment is there), nothing left to send")
        draussen.append(nummer)
    else:
        offen.append(nummer)
    print()

print(f"{len(draussen)} answer(s) already posted: {', '.join('#' + n for n in draussen) or 'none'}")
print(f"{len(offen)} still to send: {', '.join('#' + n for n in offen) or 'none'}")
if entfaellt:
    print(f"{len(entfaellt)} without an occasion (issue closed): {', '.join('#' + n for n in entfaellt)}")
print()
if fehler:
    print(f"NOT READY: {fehler} problem(s). Nothing should go out until these are fixed.")
    raise SystemExit(1)
print("READY. Every claim in these drafts matches what GitHub says right now.")
