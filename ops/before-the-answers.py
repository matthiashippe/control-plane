#!/usr/bin/env python3
"""Check every issue answer against what we measure, before any of it goes out.

`ops/before-the-article.py` does this for the article. The issue answers had nothing, and they carry
the same kind of claim about somebody else's repository: when the last maintainer comment was, when
the last commit was, how long PR #370 has been open. Every one of those ages, and two of them were
already wrong on 2026-09-22: four drafts said "no maintainer reply since March 7" while the last
one is from 6 March 04:43 UTC. A day out, under Matthias' name, in a tracker where anybody can
check it in two clicks.

It also enforces the lesson from 20.09., paid for with a real visitor count: an answer that does
not spell out https://cp.hippe.eu leads nowhere. The repo link alone brought one visitor in
fourteen days, and that one came from our own site.

    ops/before-the-answers.py            all drafts
    ops/before-the-answers.py 372 376    only these

Exit 0: everything checks out. Exit 1: something in a draft is not true any more.
"""
import json
import pathlib
import re
import subprocess
import sys

REPO = "Conway-Research/automaton"
FOLDER = pathlib.Path(".scratch/gtm/issue-antworten")

failures = 0


def report(ok: bool, text: str, detail: str = "") -> None:
    global failures
    print(f"  {'ok     ' if ok else 'FAILED '} {text}")
    if not ok:
        failures += 1
        if detail:
            print(f"          {detail}")


def gh(path: str, jq: str) -> str:
    r = subprocess.run(["gh", "api", path, "--jq", jq], capture_output=True, text=True)
    return r.stdout.strip()


# The facts, from GitHub and not from the drafts.
last_maintainer_comment = None
for page in (1, 2, 3):
    out = gh(
        f"repos/{REPO}/issues/comments?sort=created&direction=desc&per_page=100&page={page}",
        '[.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR"))] | .[0].created_at // empty',
    )
    if out:
        last_maintainer_comment = out
        break

last_push = gh(f"repos/{REPO}", ".pushed_at")
pr370 = gh(f"repos/{REPO}/pulls/370", r'"\(.state) \(.created_at)"')

print("What the drafts claim about Conway, against what GitHub says right now")
print(f"  last maintainer comment: {last_maintainer_comment}")
print(f"  last push:               {last_push}")
print(f"  PR 370:                  {pr370}")
print()

MONTHS = {
    "01": "January", "02": "February", "03": "March", "04": "April", "05": "May", "06": "June",
    "07": "July", "08": "August", "09": "September", "10": "October", "11": "November", "12": "December",
}


def as_text(iso: str) -> tuple[str, str]:
    """('March 6', '6 March') for an ISO timestamp, both spellings a draft might use."""
    month, day = MONTHS[iso[5:7]], str(int(iso[8:10]))
    return f"{month} {day}", f"{day} {month}"


posted: list[str] = []
pending: list[str] = []
no_occasion: list[str] = []
wanted = sys.argv[1:]
drafts = sorted(FOLDER.glob("*.md"))
drafts = [d for d in drafts if d.stem != "README" and (not wanted or d.stem in wanted)]
if not drafts:
    print("No drafts to check.")
    raise SystemExit(0)

for draft in drafts:
    number = draft.stem
    text = draft.read_text()
    print(f"#{number}")

    # 1. The claim that ages fastest: when a maintainer last said anything.
    mentions_march = re.findall(r"since (\w+ \d{1,2}|\w+)(?=[,.\s])", text)
    if last_maintainer_comment and any("March" in m for m in mentions_march):
        a, b = as_text(last_maintainer_comment)
        exact = re.findall(r"since (March \d{1,2})", text)
        wrong = [g for g in exact if g != a]
        report(
            not wrong,
            f"names the last maintainer comment correctly ({a})",
            f"the draft says 'since {wrong[0]}', GitHub says {last_maintainer_comment}" if wrong else "",
        )

    # 2. The last commit.
    if "August 26" in text or re.search(r"last commit \w+ \d", text):
        a, b = as_text(last_push)
        report(a in text or b in text, f"names the last commit correctly ({a})",
               f"GitHub says {last_push}")

    # 3. PR 370.
    if "#370" in text:
        state, created = pr370.split(" ", 1)
        a, b = as_text(created)
        report(state == "open", "PR #370 is still open, as the draft assumes", f"it is {state}")
        if re.search(r"#370[^.]*since \w+ \d", text):
            report(a in text or b in text, f"names when #370 opened correctly ({a})",
                   f"GitHub says {created}")

    # 4. and 5. Either both or neither.
    #
    # Two drafts name no service and carry no disclosure, on purpose: #373 is a Windows bug our
    # service does not fix, and #380 is an issue created by accident. Mentioning what we sell
    # where somebody needed a patch is advertising, and those two are the most credible answers
    # in the set. What must never happen is one without the other: a link with no disclosure, or
    # a disclosure with no way to get here. So they are checked against each other, not against a
    # rule that every answer has to sell something.
    names_service = "cp.hippe.eu" in text
    disclosure = bool(re.search(r"^Disclosure:", text, re.M))
    if names_service or disclosure:
        report("https://cp.hippe.eu" in text,
               "spells out https://cp.hippe.eu, not just the repo",
               "the drafts of 20.09. named only the repo and brought nobody: the repo had one "
               "visitor in fourteen days, and that one came from our own site")
        report(disclosure, "carries a disclosure line, because it names the service")
    else:
        print("  ok      names no service and carries no disclosure, deliberately")

    # 6. A closed issue is not a fault in the draft, it is a draft that has lost its occasion.
    #    Commenting there reaches nobody, so it drops out of the list rather than going red.
    state = gh(f"repos/{REPO}/issues/{number}", ".state")
    if state != "open":
        print(f"  --      issue #{number} is {state}, so this draft has no occasion left")
        no_occasion.append(number)
        print()
        continue
    print(f"  ok      issue #{number} is open")

    # 7. Already answered there is not a fault, it is the draft having done its job. Only a
    #    second comment from us would be one, and that is what this would catch.
    authors = gh(f"repos/{REPO}/issues/{number}/comments", "[.[].user.login] | join(\",\")")
    if "matthiashippe" in authors:
        print("  ok      already posted (our comment is there), nothing left to send")
        posted.append(number)
    else:
        pending.append(number)
    print()

print(f"{len(posted)} answer(s) already posted: {', '.join('#' + n for n in posted) or 'none'}")
print(f"{len(pending)} still to send: {', '.join('#' + n for n in pending) or 'none'}")
if no_occasion:
    print(f"{len(no_occasion)} without an occasion (issue closed): {', '.join('#' + n for n in no_occasion)}")
print()
if failures:
    print(f"NOT READY: {failures} problem(s). Nothing should go out until these are fixed.")
    raise SystemExit(1)
print("READY. Every claim in these drafts matches what GitHub says right now.")
