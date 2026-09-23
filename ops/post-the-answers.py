#!/usr/bin/env python3
"""Post the checked issue answers, and refuse to do it any other way.

There was no tool for this. `ops/before-the-answers.py` says whether the drafts are true, and the
posting itself was nine comments typed by hand into somebody else's tracker, under Matthias' name,
with a three-a-day cap to keep in your head. That is the last friction on the only channel that
has ever delivered a reader: three answers on 2026-09-22 brought the one address that has ever
scrolled this site, and Googlebot eighteen seconds later.

Nothing here posts by itself. A dry run is the default and prints exactly what would go where.

    ops/post-the-answers.py              a dry run, always
    ops/post-the-answers.py --send 3     posts at most three, and only with all of the below true

Every one of these has to hold before a single comment goes out:

  1. Matthias said so in the conversation. No flag can establish that, and this file cannot check
     it. It is written here because the standing order says so and because the person running this
     is the person who read it.
  2. `ops/before-the-answers.py` is READY. It is run first, from here, and a single FAILED stops
     everything. No answer goes out carrying a date GitHub disagrees with or an address we have
     moved away from.
  3. The count is typed out. `--send` alone does nothing; `--send 3` sends three. Nine cannot leave
     by a slip of the hand, and the cap in the folder README is three a day.
  4. The issue is open and we have not already answered it. Both are asked of GitHub at the moment
     of sending, not taken from a list made earlier.
  5. At most three in one calendar day, counted from what GitHub says our account has posted in
     that repository today, not from a local file that can be deleted.

Exit 0: everything that was meant to go out went out, or it was a dry run. Exit 1: something
refused, and the line says which.
"""
import pathlib
import re
import subprocess
import sys
import time
import datetime

REPO = "Conway-Research/automaton"
FOLDER = pathlib.Path(".scratch/gtm/issue-antworten")
ACCOUNT = "matthiashippe"
DAILY_CAP = 3
GAP_SECONDS = 90


def body_to_send(text: str) -> str:
    """The comment, without the note that was written for us.

    Every draft opens with an HTML comment in German holding what the answer is for: the
    recipient's handle, what their issue is, and a judgement of it. "Der hat sauber gemessen",
    "Vermutlich versehentlich erstellt", "der Fragende hat sich schon bedankt und aufgegeben".
    GitHub renders an HTML comment as nothing, so it would have looked fine, and the raw markdown
    is one API call or one click on Edit away.

    The six answers already out do NOT carry it: whoever posted them stripped it by hand, checked
    against the live comments on 2026-09-23. That is the whole problem. It worked because somebody
    remembered, and the first version of this file would have been the first to forget, on nine
    comments at once, under Matthias' name, in somebody else's tracker.

    So it is stripped here and then proven gone: anything left that looks like an HTML comment
    stops the send rather than going out invisible.
    """
    out = re.sub(r"^\s*<!--.*?-->\s*", "", text, count=1, flags=re.S)
    if "<!--" in out or "-->" in out:
        raise ValueError("an HTML comment survives in the body that would be posted")
    if not out.strip():
        raise ValueError("nothing left after the internal note was stripped")
    return out.strip() + "\n"


def gh(path: str, jq: str) -> str:
    r = subprocess.run(["gh", "api", path, "--jq", jq], capture_output=True, text=True)
    return r.stdout.strip()


def die(reason: str) -> None:
    print(f"\nREFUSED: {reason}")
    raise SystemExit(1)


argv = sys.argv[1:]

if "--selftest" in argv:
    # The one function that decides what a stranger reads, proved on cases rather than on the
    # nine real drafts, which all happen to have the note in the same place.
    fail = 0
    def case(name, text, expect=None, refuse=False):
        global fail
        try:
            got = body_to_send(text)
        except ValueError as e:
            if refuse:
                print(f"  ok      {name}: refused, {e}")
            else:
                print(f"  FAILED  {name}: refused when it should not have, {e}")
                fail = 1
            return
        if refuse:
            print(f"  FAILED  {name}: went through when it should have been refused")
            fail = 1
        elif expect is not None and got.strip() != expect.strip():
            print(f"  FAILED  {name}: body is {got.strip()[:60]!r}, expected {expect.strip()[:60]!r}")
            fail = 1
        else:
            print(f"  ok      {name}")

    case("the note at the top is stripped", "<!-- An jemanden, intern -->\n\nThe answer.", "The answer.")
    case("a note spanning lines is stripped", "<!-- zeile eins\n  zeile zwei -->\nThe answer.", "The answer.")
    case("a draft without a note is untouched", "The answer.", "The answer.")
    case("a note further down stops the send", "The answer.\n\n<!-- noch eine Notiz -->", refuse=True)
    case("a second note after the first stops it", "<!-- eins -->\nThe answer.\n<!-- zwei -->", refuse=True)
    case("a stray closing marker stops it", "The answer. -->", refuse=True)
    case("a draft that is only a note stops it", "<!-- nur eine Notiz -->", refuse=True)
    print("  " + ("SELFTEST OK: the note goes, anything else that looks like one stops the send."
                  if not fail else "SELFTEST FAILED"))
    raise SystemExit(fail)

send = 0
if "--send" in argv:
    i = argv.index("--send")
    if i + 1 >= len(argv) or not argv[i + 1].isdigit():
        die("--send needs a number. `--send 3` sends three; `--send` alone sends nothing.")
    send = int(argv[i + 1])

print("The gate first, because nothing goes out that it has not passed.\n")
gate = subprocess.run([sys.executable, "ops/before-the-answers.py"], capture_output=True, text=True)
tail = [l for l in gate.stdout.splitlines() if l.strip()][-4:]
print("\n".join("  " + l for l in tail))
if gate.returncode != 0:
    die("ops/before-the-answers.py is not READY. Fix the drafts it names, then come back.")

pending = []
for line in gate.stdout.splitlines():
    if "still to send:" in line:
        pending = [n.strip().lstrip("#") for n in line.split(":", 1)[1].split(",")]
if not pending:
    print("\nNothing pending. Every draft is posted or has lost its occasion.")
    raise SystemExit(0)

# What our account has already said in this repository today, asked of GitHub. A local stamp file
# would be the obvious way and the wrong one: it can be deleted, and the thing it protects is an
# account that gets flagged for posting thirteen comments in a day.
today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
mine_today = gh(
    f"repos/{REPO}/issues/comments?sort=created&direction=desc&per_page=100",
    f'[.[] | select(.user.login == "{ACCOUNT}") | select(.created_at | startswith("{today}"))] | length',
)
already = int(mine_today) if mine_today.isdigit() else 0
room = max(0, DAILY_CAP - already)
print(f"\n{len(pending)} draft(s) pending: {', '.join('#' + n for n in pending)}")
print(f"posted by {ACCOUNT} in {REPO} today ({today} UTC): {already}, so room for {room} more")

if send == 0:
    print("\nDRY RUN. Nothing was sent. What would go, in this order:")
    for number in pending[:room]:
        raw = (FOLDER / f"{number}.md").read_text()
        try:
            body = body_to_send(raw)
        except ValueError as e:
            print(f"  #{number}  WOULD REFUSE: {e}")
            continue
        first = next((l for l in body.splitlines() if l.strip()), "")
        print(f"  #{number}  {len(body)} of {len(raw)} characters after the internal note is stripped")
        print(f"            opens: {first[:90]}")
    if room < len(pending):
        print(f"  ({len(pending) - room} would wait for tomorrow: the cap is {DAILY_CAP} a day)")
    print("\nTo send, and only after Matthias has said so in the conversation:")
    print(f"  ops/post-the-answers.py --send {min(room, len(pending))}")
    raise SystemExit(0)

if send > room:
    die(f"--send {send} would exceed the cap: {already} already posted today, room for {room}.")

print(f"\nSending {send}, {GAP_SECONDS} s apart.\n")
sent = 0
for number in pending[:send]:
    state = gh(f"repos/{REPO}/issues/{number}", ".state")
    if state != "open":
        print(f"  #{number} skipped: the issue is {state} now")
        continue
    authors = gh(f"repos/{REPO}/issues/{number}/comments", "[.[].user.login] | join(\",\")")
    if ACCOUNT in authors:
        print(f"  #{number} skipped: we have already answered there")
        continue
    try:
        body = body_to_send((FOLDER / f"{number}.md").read_text())
    except ValueError as e:
        print(f"  #{number} skipped: {e}")
        continue
    r = subprocess.run(
        ["gh", "api", f"repos/{REPO}/issues/{number}/comments", "-f", f"body={body}", "--jq", ".html_url"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(f"  #{number} FAILED: {r.stderr.strip()[:200]}")
        continue
    sent += 1
    url = r.stdout.strip()
    print(f"  #{number} posted: {url}")
    # The record of the outward action, and the input ops/traffic.sh needs. A public link triggers
    # a fetch fleet within seconds, and without the timestamp a cycle reading the log a day later
    # counts that fleet as arrivals. Appended after the post succeeded, never before.
    with open("ops/posted-answers.log", "a", encoding="utf-8") as fh:
        fh.write(f"{datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {number} {url}\n")
    if sent < send:
        time.sleep(GAP_SECONDS)

print(f"\n{sent} posted.")
print("Now watch the referrer on the FIRST request of every new address: ops/traffic.sh.")
print("That is the whole evidence for whether this channel is the channel.")
