#!/usr/bin/env python3
"""Post the checked issue answers, and refuse to do it any other way.

There was no tool for this. `ops/before-the-answers.py` says whether the drafts are true, and the
posting itself was nine comments typed by hand into somebody else's tracker, under Matthias' name,
with a three-a-day cap to keep in your head. That is the last friction on the only channel that
has ever delivered a reader: three answers on 2026-09-22 brought the one address that has ever
scrolled this site, and Googlebot eighteen seconds later.

Nothing here posts by itself. A dry run is the default and prints exactly what would go where.

    ops/post-the-answers.py                          a dry run, always; prints `sha12 <value>` for every
                                                     draft and the send line with --only and --approved
    ops/post-the-answers.py --send 3 --only 335,373,385 --approved 335:<sha12>,373:<sha12>,385:<sha12>
                                                     posts those three, in that order, and only if each
                                                     draft is still the text its value was computed over
    ops/post-the-answers.py --folder goals/kanal/antworten   a dry run over the drafts in that folder
                                                          of the repo; the gate checks the same folder
    ops/post-the-answers.py --verify-posted --folder goals/kanal/antworten
                                                          reads every comment in ops/posted-answers.log
                                                          that has a draft in the folder and compares it
                                                          with what this file would send; read-only

`--folder=<dir>` is the same as `--folder <dir>`, and an argument this file does not know stops it
with exit 1 before anything is asked of GitHub (ops/answers_args.py, shared with the gate).

Every one of these has to hold before a single comment goes out:

  1. Matthias approved exactly this text, and the approval is the value, not the conversation. The
     dry run prints, for every draft, the first 12 hex digits of sha256 over the body that would be
     posted (`sha12 <value>`) and the send line with `--approved <n>:<value>,...`; the steps at the
     human gate `public_post` name those values, and his "ok" is an "ok" to them. `--send` without
     `--approved` refuses, and before the first POST every number that would go out needs exactly
     one value equal to the sha12 of its draft right now. One missing or different value and
     nothing goes out (`REFUSED: #<n> changed since it was approved`), so a draft edited after the
     approval cannot leave under his name, and no half of a package does either. What is posted is
     the string the value was computed over, held in memory, not the file read a second time.
     After every POST the comment is read back by its id and compared byte for byte with what was
     sent; when it is not the same text or cannot be read, `DIFFERS #<n>` ends the run with exit 1.
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
import hashlib
import pathlib
import re
import subprocess
import sys
import time
import datetime

# The reader sits next to this file; under `python3 -I` the script's folder is not on sys.path by itself.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import answers_args

REPO = "Conway-Research/automaton"
OPS = pathlib.Path(__file__).resolve().parent
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


def sha12(body: str) -> str:
    """The approval value of a body: the first 12 hex digits of sha256 over exactly what is posted."""
    return hashlib.sha256(body.encode("utf-8")).hexdigest()[:12]


def live_differs(url: str, expected: str, called: str) -> str | None:
    """Why the comment at `url` is not `expected`, or None when it is the same text.

    The one comparison of a comment under our name with a body, for --verify-posted and for the read
    back after every POST. The comment is fetched by the id in the URL; `gh api --jq .body` prints
    the body and one newline of its own, that one newline is removed and nothing else is normalised.
    `called` names `expected` in the line: "draft" for --verify-posted, "sent" for the read back.
    """
    m = re.search(r"#issuecomment-(\d+)$", url)
    if not m:
        return f"no comment id in {url}"
    r = subprocess.run(["gh", "api", f"repos/{REPO}/issues/comments/{m.group(1)}", "--jq", ".body"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return f"comment {m.group(1)} not readable, {r.stderr.strip()[:200]}"
    live = r.stdout[:-1] if r.stdout.endswith("\n") else r.stdout
    if live != expected:
        at = next((k for k, (x, y) in enumerate(zip(live, expected)) if x != y), min(len(live), len(expected)))
        return f"live {len(live)} characters, {called} {len(expected)}, first difference at {at}"
    return None


def gh(path: str, jq: str) -> str:
    r = subprocess.run(["gh", "api", path, "--jq", jq], capture_output=True, text=True)
    return r.stdout.strip()


def die(reason: str) -> None:
    print(f"\nREFUSED: {reason}")
    raise SystemExit(1)


def verify_posted(folder: pathlib.Path) -> int:
    """Whether what stands under our name is exactly what this file would send from the draft.

    Every line `<time> <issue> <url>` of ops/posted-answers.log whose issue has a draft in `folder`
    is fetched from GitHub by the comment id in the URL and compared with `body_to_send` of that
    draft, byte for byte. `gh api --jq .body` prints the body and one newline of its own; that one
    newline is removed and nothing else is normalised. Read-only: nothing is written, edited or
    deleted, also not when a comment differs.

    Exit 1 when a comment differs, is missing or cannot be read, when a draft would refuse, or when
    not a single comment was compared, because "nothing differed" over nothing is no evidence.
    """
    log = OPS / "posted-answers.log"
    same, bad = 0, []
    for line in log.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 3:
            print(f"  unreadable log line: {line}")
            bad.append(line)
            continue
        number, url = parts[1], parts[2]
        draft = folder / f"{number}.md"
        if not draft.is_file():
            print(f"  no draft #{number}")
            continue
        if not re.search(r"#issuecomment-(\d+)$", url):
            print(f"  DIFFERS #{number}: no comment id in {url}")
            bad.append(number)
            continue
        try:
            expected = body_to_send(draft.read_text(encoding="utf-8"))
        except ValueError as e:
            print(f"  DIFFERS #{number}: the draft would refuse, {e}")
            bad.append(number)
            continue
        why = live_differs(url, expected, "draft")
        if why:
            print(f"  DIFFERS #{number}: {why}")
            bad.append(number)
            continue
        print(f"  same #{number}")
        same += 1
    if bad:
        print(f"VERIFY POSTED FAILED: {len(bad)} differ or unreadable, {same} same")
        return 1
    if same == 0:
        print(f"VERIFY POSTED FAILED: no comment in {log.name} has a draft in {folder}, nothing compared")
        return 1
    print(f"VERIFY POSTED OK: {same} same")
    return 0


# Every argument is read here, before anything else runs, by the reader the gate uses too. An
# argument it does not know stops the run with exit 1, so a typo cannot post from another folder.
ARGS = answers_args.parse(sys.argv[1:], accepts={"--folder", "--send", "--only", "--approved", "--selftest", "--verify-posted"})
FOLDER = ARGS.folder

if ARGS.selftest:
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
    print("SELFTEST OK: the note goes, anything else that looks like one stops the send."
          if not fail else "SELFTEST FAILED")
    raise SystemExit(fail)

if ARGS.verify_posted:
    if ARGS.send or ARGS.only:
        die("--verify-posted only reads; it does not take --send or --only.")
    if ARGS.approved:
        die("--verify-posted only reads; it does not take --approved.")
    print(f"Comparing what stands under our name with the drafts in {FOLDER}.\n")
    raise SystemExit(verify_posted(FOLDER))

# The folder, passed to the gate as resolved here, so the gate judges the drafts this file posts and
# not some other folder. A missing folder or one outside the repository has already refused.
folder_args = ARGS.folder_args()
send = ARGS.send
approved = ARGS.approved

# The approval, checked as far as it can be before the gate or GitHub is asked: a send needs it, a dry
# run computes it itself, and every approved number has a draft and, with --only, is one of those.
if send and not approved:
    die("--send needs --approved <n>:<sha12>,... with the values the dry run printed for the approved drafts.")
if approved and not send:
    die("--approved goes with --send; a dry run prints the values itself.")
for number in approved:
    if not (FOLDER / f"{number}.md").is_file():
        die(f"#{number} has no draft in {FOLDER}.")
    if ARGS.only and number not in ARGS.only:
        die(f"#{number} is approved but not in --only.")

print("The gate first, because nothing goes out that it has not passed.\n")
gate = subprocess.run([sys.executable, str(OPS / "before-the-answers.py"), *folder_args],
                      capture_output=True, text=True)
tail = [l for l in gate.stdout.splitlines() if l.strip()][-4:]
print("\n".join("  " + l for l in tail))
if gate.returncode != 0:
    die("ops/before-the-answers.py is not READY. Fix the drafts it names, then come back.")

pending = []
for line in gate.stdout.splitlines():
    if "still to send:" in line:
        # The gate prints "0 still to send: none" when every draft is answered; "none" is not an issue.
        pending = [n.strip().lstrip("#") for n in line.split(":", 1)[1].split(",")]
        pending = [n for n in pending if n.isdigit()]
if not pending:
    print("\nNothing pending. Every draft is posted or has lost its occasion.")
    raise SystemExit(0)

# The order, which is a decision and not the sort order of a folder.
#
# Written down in the folder README on 2026-09-23 with two measured reasons. First, #353, #356 and
# #359 are the same bug, rank for the same search and read as a pattern if they go out together,
# and the account belongs to a person. Second, Googlebot arrives WITH the comment: it fetched four
# URLs here in the whole log, seven seconds after the answer under #392 went up, so a day with a
# comment is a day with a crawler and spreading beats batching.
#
# Without this the tool took the drafts in numeric order and would have sent #335, #353, #356 on
# day one, which is the block the order exists to avoid. A decision that lives only in a README is
# a decision that does not run.
#
#   ops/post-the-answers.py --send 3 --only 335,373,385
only = ARGS.only
if only:
    unknown = [n for n in only if n not in pending]
    if unknown:
        die(f"--only names {', '.join('#' + n for n in unknown)}, which is not pending. "
            f"Pending right now: {', '.join('#' + n for n in pending)}.")
    pending = only
    print(f"\norder given on the command line: {', '.join('#' + n for n in pending)}")

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
    values = []
    for number in pending[:room]:
        raw = (FOLDER / f"{number}.md").read_text()
        try:
            body = body_to_send(raw)
        except ValueError as e:
            print(f"  #{number}  WOULD REFUSE: {e}")
            continue
        first = next((l for l in body.splitlines() if l.strip()), "")
        values.append((number, sha12(body)))
        print(f"  #{number}  {len(body)} of {len(raw)} characters after the internal note is stripped")
        print(f"            opens: {first[:90]}")
        print(f"  #{number}  sha12 {values[-1][1]}")
    if room < len(pending):
        print(f"  ({len(pending) - room} would wait for tomorrow: the cap is {DAILY_CAP} a day)")
    print("\nTo send, and only after Matthias has approved these values at the gate public_post:")
    line = [f"--send {len(values)}"]
    if values:
        line.append(f"--only {','.join(n for n, _ in values)}")
        line.append(f"--approved {','.join(f'{n}:{v}' for n, v in values)}")
    if ARGS.folder_given is not None:
        line.append(f"--folder {ARGS.folder_given}")
    print(f"  ops/post-the-answers.py {' '.join(line)}")
    raise SystemExit(0)

if send > room:
    die(f"--send {send} would exceed the cap: {already} already posted today, room for {room}.")

# Every number that would go out, checked before the first POST: exactly one value, equal to the sha12 of
# its draft now. One missing or different and nothing goes, so no half of a package stands under his name.
# The bodies are kept here and posted from memory; the file is not read again in the 90 s between posts.
to_send = pending[:send]
for number in approved:
    if number not in to_send:
        die(f"#{number} is approved but would not be sent: sending {', '.join('#' + n for n in to_send)}.")
bodies = {}
for number in to_send:
    if number not in approved:
        die(f"#{number} is not approved: --approved has no value for it. Nothing was sent.")
    try:
        body = body_to_send((FOLDER / f"{number}.md").read_text())
    except ValueError as e:
        die(f"#{number} would refuse, {e}. Nothing was sent.")
    if sha12(body) != approved[number]:
        die(f"#{number} changed since it was approved: the draft is sha12 {sha12(body)} now, "
            f"approved was {approved[number]}. Nothing was sent.")
    bodies[number] = body

print(f"\nSending {send}, {GAP_SECONDS} s apart.\n")
sent = 0
for number in to_send:
    state = gh(f"repos/{REPO}/issues/{number}", ".state")
    if state != "open":
        print(f"  #{number} skipped: the issue is {state} now")
        continue
    authors = gh(f"repos/{REPO}/issues/{number}/comments", "[.[].user.login] | join(\",\")")
    if ACCOUNT in authors:
        print(f"  #{number} skipped: we have already answered there")
        continue
    body = bodies[number]
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
    with open(OPS / "posted-answers.log", "a", encoding="utf-8") as fh:
        fh.write(f"{datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {number} {url}\n")
    # Read back what now stands under his name, by the id GitHub returned, before anything else goes.
    why = live_differs(url, body, "sent")
    if why:
        print(f"  DIFFERS #{number}: {why}")
        print(f"\n{sent} posted, then stopped: #{number} does not read back as the text that was sent.")
        raise SystemExit(1)
    print(f"  #{number} read back: same")
    if sent < send:
        time.sleep(GAP_SECONDS)

print(f"\n{sent} posted.")
print("Now watch the referrer on the FIRST request of every new address: ops/traffic.sh.")
print("That is the whole evidence for whether this channel is the channel.")
