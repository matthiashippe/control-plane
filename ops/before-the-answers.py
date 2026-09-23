#!/usr/bin/env python3
"""Check every issue answer against what we measure, before any of it goes out.

`ops/before-the-article.py` does this for the article. The issue answers had nothing, and they carry
the same kind of claim about somebody else's repository: when the last maintainer comment was, when
the last commit was, how long PR #370 has been open. Every one of those ages, and two of them were
already wrong on 2026-09-22: four drafts said "no maintainer reply since March 7" while the last
one is from 6 March 04:43 UTC. A day out, under Matthias' name, in a tracker where anybody can
check it in two clicks.

It also enforces the lesson from 20.09., paid for with a real visitor count: an answer that does
not spell out the canonical address leads nowhere. The repo link alone brought one visitor in
fourteen days, and that one came from our own site.

    ops/before-the-answers.py            all drafts
    ops/before-the-answers.py 372 376    only these

Exit 0: everything checks out. Exit 1: something in a draft is not true any more.
"""
import base64
import json
import os
import pathlib
import re
import subprocess
import sys

REPO = "Conway-Research/automaton"
FOLDER = pathlib.Path(".scratch/gtm/issue-antworten")

# The address a new answer has to carry, and every address this service has ever answered to.
# Not a literal typed once: this file enforced "cp.hippe.eu" for two days after the move, which
# turned the guard into the thing that would have sent nine permanent links to the wrong host.
CANONICAL_HOST = os.environ.get("CP_PUBLIC_HOST") or "postyourprice.com"
KNOWN_HOSTS = ("cp.hippe.eu", "postyourprice.com")

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
# Our own published figures, from the endpoint the drafts point a reader at. Unreachable is not a
# pass; the checks that need it are skipped by name.
STATUS = None
try:
    _s = subprocess.run(["curl", "-s", "-m", "15", f"https://{CANONICAL_HOST}/v1/status"],
                        capture_output=True, text=True, timeout=25).stdout
    STATUS = json.loads(_s) if _s.strip().startswith("{") else None
except Exception:
    STATUS = None
if STATUS is None:
    print("note: /v1/status was not readable, so our own figures in the drafts are NOT checked.")
    print()

# The one file of Conway's that two drafts quote. None is not a pass.
WALLET_TS = None
try:
    _b = subprocess.run(
        ["gh", "api", "repos/Conway-Research/automaton/contents/src/identity/wallet.ts",
         "--jq", ".content"], capture_output=True, text=True, timeout=30).stdout
    WALLET_TS = base64.b64decode(_b).decode("utf-8", "replace") if _b.strip() else None
except Exception:
    WALLET_TS = None
if WALLET_TS is None:
    print("note: Conway's wallet.ts was not readable, so the line #373 and #380 quote is NOT checked.")
    print()

# The other file of Conway's that the drafts quote, for the same reason.
ROUTER_TS = None
try:
    _r = subprocess.run(
        ["gh", "api", "repos/Conway-Research/automaton/contents/src/inference/router.ts",
         "--jq", ".content"], capture_output=True, text=True, timeout=30).stdout
    ROUTER_TS = base64.b64decode(_r).decode("utf-8", "replace") if _r.strip() else None
except Exception:
    ROUTER_TS = None
if ROUTER_TS is None:
    print("note: Conway's router.ts was not readable, so the free-model route is NOT checked.")
    print()

# What Conway's sign-up does right now, from ops/conway-zustand.sh, which provisions a throwaway
# wallet and costs nothing. None is not a pass: the checks that need it are skipped out loud.
CONWAY_FAIL = None
try:
    _z = subprocess.run([str(pathlib.Path(__file__).parent / "conway-zustand.sh")],
                        capture_output=True, text=True, timeout=120)
    _m = re.search(r"verify: (\d{3} \{[^}]*\})", _z.stdout)
    CONWAY_FAIL = _m.group(1) if _m else None
except Exception:
    CONWAY_FAIL = None
if CONWAY_FAIL is None:
    print("note: Conway's sign-up was not measurable, so what the drafts say about it is NOT checked.")
    print()
else:
    print(f"  Conway verify right now:  {CONWAY_FAIL}")

# The newest line of the on-chain scan, read off the VM. Absent is not a failure: this file has to
# work on a machine with no key to the server, and the checks that need it are skipped by name
# rather than passing quietly.
CHAIN = None
try:
    _raw = subprocess.run(
        ["ssh", "-i", os.environ.get("CP_SSH_KEY", os.path.expanduser("~/.ssh/id_ed25519_automaton")),
         "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
         os.environ.get("CP_HOST", "root@76.13.144.207"),
         "tail -1 /opt/control-plane/conway-money/metrics.ndjson"],
        capture_output=True, text=True, timeout=30,
    ).stdout.strip()
    CHAIN = json.loads(_raw) if _raw.startswith("{") else None
except Exception:
    CHAIN = None
if CHAIN is None:
    print("note: the on-chain scan was not readable, so the figures in #335 are NOT checked.")
    print()

drafts = sorted(FOLDER.glob("*.md"))
drafts = [d for d in drafts if d.stem != "README" and (not wanted or d.stem in wanted)]
if not drafts:
    print("No drafts to check.")
    raise SystemExit(0)

for draft in drafts:
    number = draft.stem
    text = draft.read_text()
    print(f"#{number}")

    # Status first, checks after, and the order is the point.
    #
    # It used to run every check and ask about the issue last. Checks 1 to 5 all judge what is
    # about to go OUT: whether a date is still right, whether the address is the canonical one.
    # For an answer that is already posted, that file is not a draft any more, it is the record
    # of what was actually said, and the README says so in as many words. Judged as a draft it is
    # permanently red, and on 2026-09-23 that was exactly the result: the six posted answers name
    # cp.hippe.eu because that is the address that is out there, so the gate reported 14 problems
    # that no edit may fix and could never say READY again. A gate that cannot go green is not a
    # gate.
    state = gh(f"repos/{REPO}/issues/{number}", ".state")
    if state != "open":
        print(f"  --      issue #{number} is {state}, so this draft has no occasion left")
        no_occasion.append(number)
        print()
        continue
    authors = gh(f"repos/{REPO}/issues/{number}/comments", "[.[].user.login] | join(\",\")")
    if "matthiashippe" in authors:
        print("  ok      already posted; this file records what was said and is not judged as a draft")
        posted.append(number)
        print()
        continue
    print(f"  ok      issue #{number} is open, and we have not answered yet")

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
    names_service = any(h in text for h in KNOWN_HOSTS)
    disclosure = bool(re.search(r"^Disclosure:", text, re.M))
    if names_service or disclosure:
        report(f"https://{CANONICAL_HOST}" in text,
               f"spells out https://{CANONICAL_HOST}, not just the repo",
               "the drafts of 20.09. named only the repo and brought nobody: the repo had one "
               "visitor in fourteen days, and that one came from our own site")
        # A comment on a public issue is permanent. The address in it is the only backlink this
        # project will ever have from that thread, and on 2026-09-22 the canonical address moved to
        # postyourprice.com. Nine unsent drafts still named cp.hippe.eu, and this check REQUIRED
        # them to: it compared against a literal host typed on 20.09. So the one channel that has
        # ever delivered a reader would have anchored nine permanent links on the address we had
        # just moved away from, and the gate built to protect that channel would have passed every
        # one of them.
        stale = sorted({h for h in KNOWN_HOSTS if h != CANONICAL_HOST and h in text})
        report(not stale,
               f"names no address other than {CANONICAL_HOST}",
               f"this draft still names {', '.join(stale)}; a comment is permanent and the link "
               f"in it is the backlink" if stale else "")
        report(disclosure, "carries a disclosure line, because it names the service")
    else:
        print("  ok      names no service and carries no disclosure, deliberately")

    # 6. On-chain figures, against the newest scan rather than against the scan that was open when
    # the draft was written.
    #
    # #335 is the evidence question, and the answer to it is nothing but numbers: transfers, USDC,
    # wallets, and the tier distribution that carries the whole argument. Everything above checks
    # what GitHub says. Nothing checked what the chain says, and a figure in a GitHub comment is
    # permanent, which is the exact shape of failure this file exists to prevent one category over.
    #
    # The numbers come from ops/conway-money-series.sh, which runs daily on the VM and only ever
    # scans forward. A draft written on Tuesday and posted on Thursday carries Tuesday's window.
    if CHAIN and re.search(r"\d[\d,]* transfers", text):
        for label, value, pattern in (
            ("transfers, all time", f"{CHAIN['transfers_total']:,}", r"([\d,]+) transfers"),
            ("wallets, all time", f"{CHAIN['wallets_total']:,}", r"([\d,]+) distinct wallets"),
            ("top-ups, 30 days", str(CHAIN["topups_30d"]), r"(\d+) top-ups"),
            ("wallets, 30 days", str(CHAIN["topup_wallets_30d"]), r"(\d+) wallets, "),
        ):
            found = re.search(pattern, text)
            report(bool(found) and found.group(1) == value,
                   f"{label} matches today's scan ({value})",
                   f"the draft says {found.group(1) if found else 'nothing'}, the scan of "
                   f"{CHAIN['measured_at'][:10]} says {value}")
        tiers = "{" + ", ".join(f'"{k}": {v}' for k, v in sorted(CHAIN["topup_tiers_30d"].items(), key=lambda kv: int(kv[0]))) + "}"
        report(tiers in text,
               f"the 30-day tier distribution matches today's scan ({tiers})",
               "that distribution is the argument of the whole comment; a stale one is a wrong "
               "claim in a permanent place")

    # 7. What we say Conway's sign-up does, against what it does right now.
    #
    # Three drafts tell people their client is fine because the server does not complete. That is a
    # statement about somebody else's service in a permanent comment, and on 2026-09-23 it was
    # already drifting: the drafts described the 401 `Invalid or expired nonce` the reporters saw,
    # and a fresh provisioning attempt that day got `500 {"error":"Database error"}`. Same endpoint,
    # same outcome for the user, different surface, and we would have posted the old one to three
    # threads that people reach by searching for the exact wording.
    #
    # If Conway ever starts working, this is the check that stops all three.
    if CONWAY_FAIL is not None and re.search(r"Database error|Invalid or expired nonce", text):
        report(CONWAY_FAIL in text,
               f"quotes what Conway answers right now ({CONWAY_FAIL})",
               f"the draft does not carry today's failure; ops/conway-zustand.sh got {CONWAY_FAIL}")

    # 8. Our own figures, against the endpoint that serves them.
    #
    # #335 quotes a block of /v1/status verbatim, which is the whole point of quoting it: a reader
    # can call the same path and compare. That only holds while the two agree, and the numbers move
    # the moment anybody awards anything. A comment is permanent and the endpoint is not.
    if STATUS and '"market"' in text:
        for field, value in (
            ("awarded_30d", STATUS["market"]["awarded_30d"]),
            ("volume_30d_cents", STATUS["market"]["volume_30d_cents"]),
            ("commission_30d_cents", STATUS["market"]["commission_30d_cents"]),
            ("buyers", STATUS["market"]["buyers"]),
            ("agents", STATUS["market"]["agents"]),
            ("paying_wallets", STATUS["paying_wallets"]),
            ("thinking_wallets", STATUS["thinking_wallets"]),
        ):
            # The braces only. The first version matched the whole `"awarded_30d": {...}` and then
            # read every number out of it, so the 30 in the field name counted as a figure and
            # three checks failed against numbers that were in fact identical.
            quoted = re.search(rf'"{field}":\s*(\{{[^}}]*\}})', text)
            live = {int(n) for n in re.findall(r"-?\d+", json.dumps(value))}
            shown = {int(n) for n in re.findall(r"-?\d+", quoted.group(1))} if quoted else set()
            report(shown == live,
                   f"{field} matches the live endpoint ({value['total']}/{value['not_ours']})",
                   f"the draft shows {sorted(shown) or 'nothing'}, /v1/status serves {sorted(live)}")

    # 9. The line of somebody else's code that two drafts hang on entirely.
    #
    # #373 and #380 both say the fix is to replace `process.env.HOME || "/root"` in
    # src/identity/wallet.ts with os.homedir(). Those are the two most credible answers in the set,
    # because neither mentions this service at all, and both are worthless the moment that line
    # changes. Conway has not pushed since 2026-08-26, which makes it likely and not measured, and
    # likely is what the rest of this file exists to replace.
    #
    # Asked of the file and not of the draft's wording. The first version only checked drafts that
    # quote the expression verbatim, which is #380; #373 describes the same line in prose and got
    # no check at all, and #373 is the longer and more technical of the two. What has to be true is
    # a property of Conway's file, so that is what is asked.
    if WALLET_TS is not None and "wallet.ts" in text:
        report('process.env.HOME || "/root"' in WALLET_TS,
               "the /root fall-through is still in Conway's src/identity/wallet.ts",
               "that expression is gone from the file; the fix in this draft may be stale")

    # 10. The other line of Conway's, and the one nearly every draft rests on.
    #
    # Ten of the twelve drafts tell somebody a local model still runs when the survival tier is
    # `dead`, because `isFree || tierOk` in src/inference/router.ts exempts free models from the
    # tier check. That is the whole free route, the thing offered before anything we sell, and if
    # it stops being true then ten permanent comments are sending people down a path that does not
    # work. It is at line 224 today.
    if ROUTER_TS is not None and "isFree || tierOk" in text:
        report("isFree || tierOk" in ROUTER_TS,
               "the free-model exemption is still in Conway's src/inference/router.ts",
               "that condition is gone; the free route these drafts offer may no longer work")

    # 11. Words that are true when written and false when read.
    #
    # A GitHub comment is permanent and nobody edits it again. On 2026-09-23 the draft for #335
    # said a wallet "had not spent a cent 92 hours later", measured that morning and due to post
    # after midnight UTC, and "that block went up today". Both would have been wrong on arrival,
    # and neither is a fact the checks above can reach: they compare numbers against live sources,
    # and these are sentences about when the reader is standing.
    #
    # Nothing here is forbidden in the internal German header, which body_to_send() strips; this
    # looks only at what actually goes out.
    outgoing = re.sub(r"^<!--.*?-->\s*", "", text, flags=re.S)
    relative = sorted({
        w for w in re.findall(
            r"\b(?:today|yesterday|tomorrow|this (?:morning|afternoon|evening|week)|"
            r"\d+\s+(?:hours?|days?|weeks?)\s+(?:later|ago)|just now|right now|currently)\b",
            outgoing, re.I,
        )
    })
    report(not relative,
           "says when, not how long ago",
           f"this draft carries {', '.join(repr(r) for r in relative)}; a comment is read on a day "
           f"nobody picks, so a relative time in it is a sentence that goes false by itself"
           if relative else "")

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
