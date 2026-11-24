#!/usr/bin/env python3
"""Point our own comments in Conway-Research/automaton at automatonhost.com, and only the approved ones.

Our comments in the Conway issues are the one way people with a broken automaton come to us, and on 2026-11-22 29 of 30 linked
to postyourprice.com or cp.hippe.eu, which only redirect to the home page now (goals/reichweite/02). The rules of what a body
becomes are in ops/relink_rules.py; this file reads GitHub, shows the change and makes it after the Tech Lead's "ok relink".

    ops/relink-comments.py                                   the dry run: changes nothing
    ops/relink-comments.py --send <k> --approved <id>:<sha12>,...
                                                             edits exactly those k comments, each only if its new text is
                                                             still the one its value was computed over
    ops/relink-comments.py --verify                          reads every comment in ops/relinked-comments.log back and runs
                                                             the dry run; read-only

The dry run reads every thread of `search/issues` with `commenter:matthiashippe`, and in each thread the comments whose author is
matthiashippe. For each with an old link it prints `comment <id> issue <n> page <slug|home> sha12 <value>` (the first 12 hex
digits of sha256 over the new text in UTF-8), under it `  - <old>` and `  + <new>` for every link, and at the end the count and
the send line.

`--send` refuses with exit 1 and without a single PATCH when <k> is not the number of values, when a comment is not one of
matthiashippe, or when the new text of a comment has another value now (`REFUSED: <id> changed since it was approved`). A comment
whose text already has the approved value is `ALREADY <id>` and is skipped, so an interrupted run can be repeated. Every other one
is edited with PATCH to exactly the text its value was computed over, read back by its id and compared byte for byte
(`DIFFERS <id>` stops with exit 1), then logged in ops/relinked-comments.log. Between two PATCH it waits CP_RELINK_GAP_SECONDS
seconds (default 20): an edit notifies nobody, so the cap of three new comments a day does not apply, but a burst of edits is what
gets an account flagged.

`--name` (goals/reichweite/04) does the same for the name of the service: the new text of a comment is
`name(relink(body, slug))` from ops/relink_rules.py, so every comment opens with the sentence LEAD and says automatonhost.com
where it said Handsel or PostYourPrice in prose. The comments in NO_LEAD are the exception (decision 7): the sentence would be
wrong there or contradict the comment, so their new text is `rename(relink(body, slug))`, only the old names replaced.

    ops/relink-comments.py --name                            the dry run of the name: changes nothing
    ops/relink-comments.py --name --send <k> --approved <id>:<sha12>,...
                                                             edits exactly those k comments, checked the same way as --send,
                                                             and logs them in ops/named-comments.log
    ops/relink-comments.py --name --verify                   reads every comment in ops/named-comments.log back and runs the
                                                             dry run of the name; read-only

The dry run of the name prints `comment <id> issue <n> page <slug|home> sha12 <value>` for every comment it would change, under
it `  + lead` when the sentence comes in front, and `  - <old name>` and `  + automatonhost.com` for every name it replaces; a comment
of NO_LEAD never gets `  + lead`, and one that `rename` leaves alone is not listed but counted as `kept without lead`. A
comment edited by both modes is compared by `--verify` (with or without `--name`) with the value of its newest line in either
log, so a comment named after it was relinked is not a difference.

`--name --no-card` (point 8 of goals/reichweite/04) is the way out when the emergency switch of the card goes on and /llms.txt
drops the card line: in every comment that opens with LEAD and a blank line it swaps LEAD for LEAD_NO_CARD and changes nothing else;
the comments of NO_LEAD stay. `--name` alone swaps LEAD_NO_CARD back to LEAD.

    ops/relink-comments.py --name --no-card                  the dry run: `  - lead` and `  + lead without card` per comment
    ops/relink-comments.py --name --no-card --send <k> --approved <id>:<sha12>,...
                                                             edits exactly those k comments, checked the same way as --send,
                                                             and logs them in ops/named-comments.log
    ops/relink-comments.py --name --no-card --verify         reads every comment in ops/named-comments.log back and runs the
                                                             dry run of no-card; read-only

`--no-card` without `--name` stops with exit 1.

This file never creates a comment, never closes or deletes anything and never touches a comment of another account. An argument it
does not know stops it with exit 1 before GitHub is asked; GitHub not readable is exit 2.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time

# The rules sit next to this file; under `python3 -I` the script's folder is not on sys.path by itself.
OPS = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(OPS))
import relink_rules  # noqa: E402

REPO = "Conway-Research/automaton"
ACCOUNT = "matthiashippe"
LOG = OPS / "relinked-comments.log"
NAMED_LOG = OPS / "named-comments.log"
# Decision 7 (Tech Lead, 2026-11-24): comment ids where LEAD is wrong or contradicts the comment; they only get the old names replaced.
NO_LEAD = frozenset({5742781237, 5804984649, 5805000566, 5805015103})
APPROVAL = re.compile(r"(\d+):([0-9a-f]{12})")
USAGE = ("usage: ops/relink-comments.py [--name [--no-card]] [--send <k> --approved <id>:<sha12>,...] [--verify]\n"
         "  without --send or --verify a dry run that changes nothing")


def sha12(text: str) -> str:
    """The approval value of a text: the first 12 hex digits of sha256 over it in UTF-8."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def refuse(reason: str) -> None:
    print(f"REFUSED: {reason}")
    raise SystemExit(1)


def parse(argv: list[str]) -> dict:
    """Every argument, read before anything else runs; anything unknown ends with exit 1."""
    out: dict = {"send": None, "approved": None, "verify": False, "name": False, "no_card": False}
    i = 0
    while i < len(argv):
        name, eq, inline = argv[i].partition("=")
        if name in ("--send", "--approved"):
            key = name[2:]
            if out[key] is not None:
                refuse(f"{name} is given twice")
            if eq:
                value, i = inline, i + 1
            else:
                value, i = (argv[i + 1] if i + 1 < len(argv) else ""), i + 2
            if not value or value.startswith("--"):
                refuse(f"{name} needs a value\n{USAGE}")
            out[key] = value
        elif argv[i] == "--verify":
            out["verify"] = True
            i += 1
        elif argv[i] == "--name":
            if out["name"]:
                refuse("--name is given twice")
            out["name"] = True
            i += 1
        elif argv[i] == "--no-card":
            if out["no_card"]:
                refuse("--no-card is given twice")
            out["no_card"] = True
            i += 1
        else:
            refuse(f"unknown argument {argv[i]}\n{USAGE}")
    if out["no_card"] and not out["name"]:
        refuse("--no-card goes with --name: ops/relink-comments.py --name --no-card")
    if out["verify"] and (out["send"] is not None or out["approved"] is not None):
        refuse("--verify only reads; it does not take --send or --approved")
    if out["send"] is not None:
        if not re.fullmatch(r"[1-9][0-9]*", out["send"]):
            refuse("--send needs the number of comments to edit, e.g. --send 29")
        out["send"] = int(out["send"])
        if out["approved"] is None:
            refuse("--send needs --approved <id>:<sha12>,... with the values the dry run printed")
    elif out["approved"] is not None:
        refuse("--approved goes with --send; a dry run prints the values itself")
    if out["approved"] is not None:
        approved: dict[str, str] = {}
        for item in out["approved"].split(","):
            m = APPROVAL.fullmatch(item)
            if not m:
                refuse(f"--approved needs <id>:<12 hex digits>, not {item}")
            if m.group(1) in approved:
                refuse(f"{m.group(1)} is approved twice")
            approved[m.group(1)] = m.group(2)
        out["approved"] = approved
        if out["send"] != len(approved):
            refuse(f"--send {out['send']} but {len(approved)} approved values; the count has to be the number of values")
    return out


def gh_lines(args: list[str]) -> list[str]:
    """The lines `gh api` prints for a read; GitHub not readable ends the run with exit 2."""
    r = subprocess.run(["gh", "api", *args], capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        print(f"GitHub not readable: gh api {args[0] if args[0] != '-X' else args[2]}: {r.stderr.strip()[:200]}")
        raise SystemExit(2)
    return [line for line in r.stdout.splitlines() if line.strip()]


def threads() -> list[tuple[int, str]]:
    """Every issue of the repository with a comment of our account, as (number, title), highest number first."""
    lines = gh_lines(["-X", "GET", "search/issues", "-f", f"q=repo:{REPO} commenter:{ACCOUNT}", "-f", "per_page=100",
                      "--paginate", "--jq", ".items[] | {number, title} | tojson"])
    found = {}
    for line in lines:
        d = json.loads(line)
        found[int(d["number"])] = d["title"]
    return sorted(found.items(), reverse=True)


def own_comments(number: int) -> list[dict]:
    """The comments of our account in one issue, oldest first."""
    lines = gh_lines([f"repos/{REPO}/issues/{number}/comments", "--paginate",
                      "--jq", ".[] | {id, user: .user.login, body} | tojson"])
    return [d for d in map(json.loads, lines) if d["user"] == ACCOUNT]


def comment(cid: str) -> dict:
    """One comment by its id: author, body and the number of its issue."""
    d = json.loads(gh_lines([f"repos/{REPO}/issues/comments/{cid}",
                             "--jq", "{id, user: .user.login, body, issue_url} | tojson"])[0])
    d["issue"] = int(d["issue_url"].rstrip("/").rsplit("/", 1)[1])
    return d


def title(number: int) -> str:
    return json.loads(gh_lines([f"repos/{REPO}/issues/{number}", "--jq", "{title} | tojson"])[0])["title"]


def plan(body: str, issue_title: str, cid: str | int | None = None) -> tuple[str, str, list[tuple[str, str]]]:
    """The page, the new text and the changed links of one comment; the id only matters under --name."""
    slug = relink_rules.page_for_title(issue_title)
    return slug or "home", relink_rules.relink(body, slug), relink_rules.changes(body, slug)


def plan_name(body: str, issue_title: str, cid: str | int | None = None) -> tuple[str, str, list[tuple[str, str]]]:
    """The page, the new text and every change of one comment under --name: links, the lead and the old names.

    A comment in NO_LEAD gets no lead, only the old names replaced.
    """
    page, relinked, links = plan(body, issue_title)
    keep = cid is not None and int(cid) in NO_LEAD
    lines = [*links]
    if not keep and relinked.startswith(relink_rules.LEAD_NO_CARD + "\n\n"):
        lines.append(("lead without card", "lead"))
    elif not keep and relink_rules.leads(relinked):
        lines.append(("", "lead"))
    lines += [(old, relink_rules.NAME) for old in relink_rules.renames(relinked)]
    return page, (relink_rules.rename if keep else relink_rules.name)(relinked), lines


def plan_no_card(body: str, issue_title: str, cid: str | int | None = None) -> tuple[str, str, list[tuple[str, str]]]:
    """The page, the new text and the change of one comment under --name --no-card: LEAD becomes LEAD_NO_CARD, nothing else."""
    slug = relink_rules.page_for_title(issue_title)
    if cid is not None and int(cid) in NO_LEAD:
        return slug or "home", body, []
    new = relink_rules.no_card(body)
    return slug or "home", new, [("lead", "lead without card")] if new != body else []


def dry_run_no_card() -> tuple[int, int, int, list[tuple[str, str]]]:
    """Prints what --name --no-card would change and returns (to change, unchanged, comments of the account, values)."""
    to_change, unchanged, values = 0, 0, []
    for number, issue_title in threads():
        for c in own_comments(number):
            page, new, lines = plan_no_card(c["body"], issue_title, c["id"])
            if new == c["body"]:
                unchanged += 1
                continue
            to_change += 1
            values.append((str(c["id"]), sha12(new)))
            print(f"comment {c['id']} issue {number} page {page} sha12 {values[-1][1]}")
            for old, now in lines:
                print(f"  - {old}")
                print(f"  + {now}")
    return to_change, unchanged, to_change + unchanged, values


def dry_run_name() -> tuple[int, int, int, int, list[tuple[str, str]]]:
    """Prints what --name would change and returns (to change, already named, kept without lead, comments, values)."""
    to_change, already, kept, values = 0, 0, 0, []
    for number, issue_title in threads():
        for c in own_comments(number):
            page, new, lines = plan_name(c["body"], issue_title, c["id"])
            if new == c["body"]:
                if int(c["id"]) in NO_LEAD:
                    kept += 1
                else:
                    already += 1
                continue
            to_change += 1
            values.append((str(c["id"]), sha12(new)))
            print(f"comment {c['id']} issue {number} page {page} sha12 {values[-1][1]}")
            for old, now in lines:
                if old:
                    print(f"  - {old}")
                print(f"  + {now}")
    return to_change, already, kept, to_change + already + kept, values


def dry_run() -> tuple[int, int, int, list[tuple[str, str]]]:
    """Prints what would change and returns (to change, unchanged, comments of the account, values)."""
    to_change, unchanged, values = 0, 0, []
    for number, issue_title in threads():
        for c in own_comments(number):
            page, new, links = plan(c["body"], issue_title)
            if not links:
                unchanged += 1
                continue
            to_change += 1
            values.append((str(c["id"]), sha12(new)))
            print(f"comment {c['id']} issue {number} page {page} sha12 {values[-1][1]}")
            for old, link in links:
                print(f"  - {old}")
                print(f"  + {link}")
    return to_change, unchanged, to_change + unchanged, values


def differs(cid: str, expected: str) -> str | None:
    """Why the comment `cid` is not `expected` now, or None when it is the same text, byte for byte."""
    live = comment(cid)["body"]
    if live == expected:
        return None
    at = next((k for k, (x, y) in enumerate(zip(live, expected)) if x != y), min(len(live), len(expected)))
    return f"live {len(live)} characters, sent {len(expected)}, first difference at {at}"


def send(approved: dict[str, str], naming: bool = False, no_card: bool = False) -> int:
    planner, log, label = ((plan_no_card, NAMED_LOG, "no-card") if no_card else (plan_name, NAMED_LOG, "name") if naming
                           else (plan, LOG, "relink"))
    # Every approved comment, checked before the first PATCH: ours, and its new text still has the approved value.
    todo = []
    for cid, value in approved.items():
        c = comment(cid)
        if c["user"] != ACCOUNT:
            refuse(f"{cid} is not a comment of {ACCOUNT}. Nothing was changed.")
        if sha12(c["body"]) == value:
            print(f"ALREADY {cid}")
            continue
        page, new, _ = planner(c["body"], title(c["issue"]), cid)
        if sha12(new) != value:
            refuse(f"{cid} changed since it was approved: its new text is sha12 {sha12(new)} now, approved was {value}. "
                   "Nothing was changed.")
        todo.append((cid, c["issue"], page, c["body"], new))
    gap = float(os.environ.get("CP_RELINK_GAP_SECONDS", "20"))
    for k, (cid, issue, page, old, new) in enumerate(todo):
        if k:
            time.sleep(gap)
        r = subprocess.run(["gh", "api", "-X", "PATCH", f"repos/{REPO}/issues/comments/{cid}", "--input", "-",
                            "--jq", ".id"], input=json.dumps({"body": new}), capture_output=True, text=True,
                           encoding="utf-8")
        if r.returncode != 0:
            print(f"FAILED {cid}: {r.stderr.strip()[:200]}")
            print(f"{label} send: {k} edited, then stopped")
            return 1
        why = differs(cid, new)
        if why:
            print(f"DIFFERS {cid}: {why}")
            print(f"{label} send: {k} edited, then stopped: {cid} does not read back as the text that was sent")
            return 1
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(log, "a", encoding="utf-8") as fh:
            fh.write(f"{stamp} comment {cid} issue {issue} page {page} old {sha12(old)} new {sha12(new)}\n")
        print(f"edited {cid} issue {issue} page {page}: read back same")
    print(f"{label} send: {len(todo)} edited, {len(approved) - len(todo)} already")
    return 0


def log_lines(path: pathlib.Path) -> list[tuple[str, list[str]]]:
    """Every line of a log that is not a header, as (line, parts); a log that does not exist yet has none."""
    if not path.exists():
        return []
    return [(line, line.split()) for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")]


def readable(parts: list[str]) -> bool:
    return len(parts) == 11 and parts[1] == "comment" and parts[9] == "new"


def newest() -> dict[str, str]:
    """Per comment the value `new` of its newest line in both logs; at the same second the line of the name wins, it comes later."""
    best: dict[str, tuple[str, int, str]] = {}
    for rank, path in enumerate((LOG, NAMED_LOG)):
        for _, parts in log_lines(path):
            if readable(parts) and (parts[2] not in best or (parts[0], rank) >= best[parts[2]][:2]):
                best[parts[2]] = (parts[0], rank, parts[10])
    return {cid: value for cid, (_, _, value) in best.items()}


def compare(path: pathlib.Path) -> tuple[int, int]:
    """(same, differ) over the lines of one log, each comment against the newest value either log has for it."""
    same, differ = 0, 0
    latest = newest()
    for line, parts in log_lines(path):
        if not readable(parts):
            print(f"  unreadable log line: {line}")
            differ += 1
            continue
        cid, value = parts[2], latest[parts[2]]
        live = comment(cid)
        if live["user"] == ACCOUNT and sha12(live["body"]) == value:
            same += 1
        else:
            print(f"  DIFFERS {cid}: live sha12 {sha12(live['body'])}, logged {value}")
            differ += 1
    return same, differ


def verify() -> int:
    same, differ = compare(LOG)
    to_change, *_ = dry_run()
    print(f"relink verify: {same} same, {differ} differ, {to_change} with old links")
    return 0 if same and not differ and not to_change else 1


def verify_name() -> int:
    same, differ = compare(NAMED_LOG)
    to_change, *_ = dry_run_name()
    print(f"name verify: {same} same, {differ} differ, {to_change} to change")
    return 0 if same and not differ and not to_change else 1


def verify_no_card() -> int:
    same, differ = compare(NAMED_LOG)
    to_change, *_ = dry_run_no_card()
    print(f"no-card verify: {same} same, {differ} differ, {to_change} to change")
    return 0 if same and not differ and not to_change else 1


def main(argv: list[str]) -> int:
    args = parse(argv)
    if args["verify"]:
        return verify_no_card() if args["no_card"] else verify_name() if args["name"] else verify()
    if args["send"] is not None:
        return send(args["approved"], args["name"], args["no_card"])
    if args["no_card"]:
        to_change, unchanged, total, values = dry_run_no_card()
        print(f"no-card: {to_change} to change, {unchanged} unchanged, {total} comments of {ACCOUNT}")
        print(f"send: ops/relink-comments.py --name --no-card --send {to_change} --approved "
              f"{','.join(f'{c}:{v}' for c, v in values)}")
        return 0
    if args["name"]:
        to_change, already, kept, total, values = dry_run_name()
        print(f"name: {to_change} to change, {already} already named, {kept} kept without lead, {total} comments of {ACCOUNT}")
        print(f"send: ops/relink-comments.py --name --send {to_change} --approved "
              f"{','.join(f'{c}:{v}' for c, v in values)}")
        return 0
    to_change, unchanged, total, values = dry_run()
    print(f"relink: {to_change} to change, {unchanged} unchanged, {total} comments of {ACCOUNT}")
    print(f"send: ops/relink-comments.py --send {to_change} --approved {','.join(f'{c}:{v}' for c, v in values)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
