#!/usr/bin/env python3
"""Everything that has to be true before the article goes out, in one run.

The checklist at the top of `.scratch/gtm/hn-post.txt` is a list of commands somebody has to
remember to run and numbers somebody has to remember to compare. On the morning of a launch that
is exactly the kind of list that gets skipped, and the numbers in that text are the ones a reader
will check first.

So this reads the article, pulls the figures out of it, and holds each one against what the
service and the daily series say today. It changes nothing and sends nothing; posting stays a
human act.

    ops/before-the-article.py

Exit code 0 means the text matches the world. Anything else names the sentences to fix.
"""
import collections
import datetime
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

# The post-ready text, and the copy a reader of the repository can actually open.
#
# Until 2026-09-22 this only knew the first one, and `.scratch/` is in `.gitignore`: in a fresh
# checkout the whole check printed "The article is not at .scratch/gtm/hn-post.txt" and exited 2.
# Meanwhile `docs/artikel-agentenoekonomie.md` carried a draft of the same piece that nothing read,
# and it still said the router "reads the nested one, not the top-level one the setup wizard
# writes" four days after that claim had been corrected on /fix, on /conway and in the post-ready
# text. Two versions, one check, and the checked one was the one nobody sees. An adversarial read
# found it (B17).
#
# So whichever exists is checked, the run says which file it read, and when both exist both are
# read: a claim that holds in one and not the other is exactly the drift that happened.
ARTICLE = Path(".scratch/gtm/hn-post.txt")
ARTICLE_REPO = Path("docs/artikel-agentenoekonomie.md")
BASE = "https://cp.hippe.eu"
findings = []


def ok(what: str, value: str = "") -> None:
    print(f"  ok      {what}{'  ' + value if value else ''}")


def change(what: str, hint: str) -> None:
    findings.append(what)
    print(f"  CHANGE  {what}\n          {hint}")


def vm(command: str) -> str:
    """Reads a file on the VM. The series lives outside the repo and outside the container."""
    try:
        return subprocess.run(
            ["ssh", "-i", str(Path.home() / ".ssh/id_ed25519_automaton"), "-o", "BatchMode=yes",
             "-o", "ConnectTimeout=8", "root@76.13.144.207", command],
            capture_output=True, text=True, timeout=25,
        ).stdout.strip()
    except Exception:
        return ""


def last_line(path: str) -> dict:
    raw = vm(f"tail -1 {path}")
    try:
        return json.loads(raw)
    except Exception:
        return {}


def fetch(path: str) -> dict:
    with urllib.request.urlopen(f"{BASE}{path}", timeout=15) as r:
        return json.load(r)


def number(text: str) -> int:
    return int(text.replace(",", "").replace(".", ""))


def main() -> int:
    sources = [p for p in (ARTICLE, ARTICLE_REPO) if p.exists()]
    if not sources:
        print(f"Neither {ARTICLE} nor {ARTICLE_REPO} is there.")
        return 2
    # Two kinds of check need two kinds of text.
    #
    # A check of the shape "the text must not say Y" is satisfiable only by every copy, so the
    # joined text is right for it. A check of the shape "if it mentions X it has to say Y" is
    # satisfied by ANY copy once the texts are joined, which is the opposite of what is wanted:
    # the counter-proof put the old wrong inferenceModel sentence back into the repo copy and this
    # stayed green, because the post-ready copy still carried the corrected one. So those run per
    # source, through `je_quelle`.
    versions = [(p, p.read_text()) for p in sources]
    text = "\n".join(t for _, t in versions)
    # Flattened copies for the prose searches. The distribution table is checked row by row and
    # needs its line breaks, so `text` stays raw and only the sentence-level checks use these.
    def flatten(t: str) -> str:
        return " ".join(t.split())

    flat = flatten(text)
    versions_flat = [(p, flatten(t)) for p, t in versions]
    print("Before the article goes out\n")
    print(f"  Reading: {', '.join(str(p) for p in sources)}\n")

    # 1. Is the service the reader will land on actually healthy and complete?
    checks = subprocess.run(["./ops/check-all.sh"], capture_output=True, text=True, timeout=400)
    if "ALL CHECKS OK" in checks.stdout:
        ok("the service, the market, the journeys and the pages", checks.stdout.strip().splitlines()[-1])
    else:
        change("ops/check-all.sh is not green",
               "the article sends people to a service that is not answering for itself")

    # 2. The directory figures in the text against the file a reader can re-run.
    #
    # This compared the article against `/opt/control-plane/x402/kennzahlen.ndjson` until
    # 2026-09-22, which is the same series `/x402` renders, so it was green by construction: two
    # readings of one source agreeing with each other. The file the article actually sends people
    # to, the CC0 CSV in `docs/research/data/`, appeared in no comparison at all.
    #
    # It mattered. The CSV in the repository came from a local run at 03:22 UTC and the article's
    # figures from the VM scan at 04:40, 78 minutes apart. Seven of the headline numbers differed,
    # and "every number here can be re-run" was an invitation to find that out. The adversarial
    # read on 2026-09-21 found it in one command.
    #
    # So the numbers are now checked against the CSV, by running the published script on the
    # published data, which is exactly what a hostile reader does first.
    csv = sorted(Path("docs/research/data").glob("*-x402-verzeichnis.csv"))
    if not csv:
        change("no x402 CSV in docs/research/data", "the article links to it as the way to re-run")
        figures = {}
    else:
        metrics = subprocess.run(
            ["python3", "docs/research/data/x402-metrics.py", str(csv[-1])],
            capture_output=True, text=True, timeout=180,
        ).stdout
        number_from = lambda pattern: (
            int(m.group(1).replace(",", "").replace(".", "")) if (m := re.search(pattern, metrics, re.MULTILINE)) else None
        )
        figures = {
            "services_cdp": number_from(r"Coinbase ([\d.,]+)"),
            "services_payai": number_from(r"PayAI ([\d.,]+)"),
            "urls_distinct": number_from(r"Eindeutige Dienst-URLs: ([\d.,]+)"),
            "providers": number_from(r"Verschiedene Anbieter \(Host\): ([\d.,]+)"),
            "calls_30d": number_from(r"Aufrufe in 30 Tagen, Summe:\s+([\d.,]+)"),
            "with_20_payers": number_from(r"mindestens  20 Zahlern:\s+([\d.,]+)"),
            "with_demand": number_from(r"Nachfragedaten: ([\d.,]+) von"),
            "with_one_payer": number_from(r"genau EINER zahlenden Wallet: ([\d.,]+)"),
            "with_5_payers": number_from(r"mindestens   5 Zahlern:\s+([\d.,]+)"),
            "with_100_payers": number_from(r"mindestens 100 Zahlern:\s+([\d.,]+)"),
            "buckets": {
                name: number_from(pattern)
                for name, pattern in [
                    ("none", r"^\s+0:\s+([\d.,]+)"),
                    ("1 to 9", r"1-9:\s+([\d.,]+)"),
                    ("10 to 99", r"10-99:\s+([\d.,]+)"),
                    ("100 to 999", r"100-999:\s+([\d.,]+)"),
                    ("1,000 or more", r"1000\+:\s+([\d.,]+)"),
                ]
            },
        }
        figures["without_demand_data"] = (
            figures["services_cdp"] - figures["with_demand"]
            if figures["services_cdp"] and figures["with_demand"] else None
        )
        print(f"  (the figures below come from {csv[-1].name}, re-run with the published script)")
    if not figures or figures.get("services_cdp") is None:
        change("the CSV could not be re-run", "without it the article's figures are unchecked")
    else:
        pairs = [
            # Reworded on 2026-09-22 when the first paragraph started showing its subtraction.
            # The check noticed, which is what it is for.
            ("distinct services", r"leaves ([\d,]+) distinct service URLs", "urls_distinct"),
            ("providers", r"behind ([\d,]+) providers", "providers"),
            ("calls in 30 days", r"were paid for ([\d,]+) calls", "calls_30d"),
            ("services with 20+ payers", r"([\d,]+) have twenty or more", "with_20_payers"),
            ("Coinbase entries", r"([\d,]+) services from Coinbase", "services_cdp"),
            ("PayAI entries", r"and ([\d,]+) entries from the PayAI", "services_payai"),
            ("entries without demand data", r"([\d,]+) of the Coinbase entries carry no demand", "without_demand_data"),
        ]
        for name, pattern, field in pairs:
            m = re.search(pattern, text)
            if not m:
                change(f"the sentence about {name} is not in the text any more",
                       f"the check looked for /{pattern}/")
                continue
            in_text, today = number(m.group(1)), figures.get(field)
            if in_text == today:
                ok(f"{name}", f"{in_text:,}")
            else:
                change(f"{name}: the text says {in_text:,}, today it is {today:,}",
                       f"replace it, and remember the totals are a floor: "
                       f"{figures.get('without_demand_data', 0)} entries still carry no demand data")


    # 4. Conway's present tense. A maintainer coming back changes the argument, not a number.
    c = last_line("/opt/control-plane/conway/repo.ndjson")
    if not c:
        change("the conway series could not be read", "run ops/conway-series.sh on the VM first")
    else:
        if c.get("last_write_access_comment", "").startswith("2026-03-06"):
            ok("no maintainer has come back", "last write-access comment 2026-03-06")
        else:
            change(f"a maintainer commented on {c.get('last_write_access_comment')}",
                   "the wall the article describes is being taken down; say so before posting")
        if c.get("pr370_state") == "open":
            ok("PR #370 is still open")
        else:
            change(f"PR #370 is {c.get('pr370_state')}",
                   "nine issue answers call it open")
        if c.get("last_push") == "2026-08-26T16:28:14Z":
            ok("the last commit is still 26 August")
        else:
            change(f"the repository was pushed on {c.get('last_push')}",
                   "the article and five issue answers say the last commit is 26 August")

    # 4b. The two present-tense claims about Conway's money, which are new in the text since
    # 21.09. and are the only ones that can go stale between writing and posting. The window
    # figures in the article ("From August 21 to the end of the scan") are a closed period and are
    # deliberately not compared against anything; only the claims about now are.
    if "Money still moves into it every week" in text:
        money = last_line("/opt/control-plane/conway-money/metrics.ndjson")
        if not money:
            change("the conway money series could not be read",
                   "run ops/conway-money-series.sh on the VM first")
        else:
            last_at = money.get("data_through", "")
            try:
                age_days = (datetime.datetime.now(datetime.timezone.utc)
                         - datetime.datetime.strptime(last_at, "%Y-%m-%dT%H:%M:%SZ")
                         .replace(tzinfo=datetime.timezone.utc)).days
            except Exception:
                age_days = 999
            if age_days <= 7:
                ok("money still moves into Conway", f"last transfer {last_at}, {age_days} day(s) ago")
            else:
                change(f"the last transfer into Conway was {last_at}, {age_days} days ago",
                       "the article says money still moves in every week; either the flow stopped "
                       "or the series has not run")

    if "still returned a valid x402 demand" in text:
        try:
            urllib.request.urlopen(
                urllib.request.Request(
                    "https://api.conway.tech/pay/5/0x0000000000000000000000000000000000000001",
                    headers={"User-Agent": "control-plane-check/1.0 (+https://cp.hippe.eu)"}),
                timeout=15)
            change("api.conway.tech/pay no longer answers 402", "it answered 200; nothing is signed "
                   "by this check, but the sentence about the payment endpoint has to change")
        except urllib.error.HTTPError as err:
            if err.code == 402:
                ok("Conway still asks for money", "GET /pay/5/<address> answers 402")
            else:
                change(f"api.conway.tech/pay answers {err.code}, not 402",
                       "the article says the payment endpoint still demands 5 USDC")
        except Exception as err:
            change(f"api.conway.tech/pay could not be reached ({err})",
                   "without it the sentence about the live payment endpoint is unchecked")

    # 4c. The one claim about upstream code that two of three surfaces got wrong.
    #
    # The article and /fix both said the router reads the nested inferenceModel "not the top-level
    # one the setup wizard writes", which reads as the wizard writing a field the router ignores.
    # It does not: src/setup/configure.ts assigns the chosen model to both. The trap is a
    # hand-edited automaton.json. docs/without-control-plane.md had it right since 21.09. and
    # nothing held the short version against the long one until an adversarial read did.
    # 4c-bis-bis. The monthly table, row by row, per version.
    #
    # Eight rows with three figures each, in both copies, and the only thing that had ever checked
    # them was an adversarial reader doing it by hand once. The thirty-day window two paragraphs
    # below this one was wrong in one copy for four hours on 2026-09-22 for exactly that reason, so
    # the table gets the same treatment: recomputed from the published CSV, and asked of each
    # version separately.
    import csv as _csv

    # One read for both blocks below: the monthly table and the thirty-day window are two
    # questions about the same file.
    rows = list(_csv.DictReader(open("docs/research/data/2026-09-19-conway-payto-transfers.csv")))

    months = collections.defaultdict(lambda: [0.0, set(), 0])
    for z in rows:
        k = z["timestamp_utc"][:7]
        months[k][0] += float(z["usdc"])
        months[k][1].add(z["from"])
        months[k][2] += 1
    NAME = {"01": "January", "02": "February", "03": "March", "04": "April", "05": "May",
            "06": "June", "07": "July", "08": "August", "09": "September"}
    for source, version in versions:
        bad = []
        found = 0
        for key, (usdc, wallets, transfers) in sorted(months.items()):
            name = NAME.get(key[5:7])
            if not name:
                continue
            # Both layouts, one pattern: a Markdown row with pipes and the plain columns of the
            # post-ready copy. The label is matched non-greedily and may contain digits, because
            # September is "September (to the 20th)" in one copy and "Sep 1-20" in the other. The
            # first pattern forbade digits in the label, found neither, and said nothing: it
            # counted seven of eight rows and called that a pass.
            short = name[:3] if name == "September" else name
            m = re.search(
                rf"^\s*\|?\s*(?:{name}|{short})[^\n]*?([\d,]+\.\d\d)\s*\|?\s+([\d,]+)\s*\|?\s+([\d,]+)",
                version, re.M,
            )
            if not m:
                bad.append(f"{name}: no row for it in this version, and the CSV has one")
                continue
            found += 1
            said = (m.group(1), number(m.group(2)), number(m.group(3)))
            actual = (f"{usdc:,.2f}", len(wallets), transfers)
            if said != actual:
                bad.append(f"{name}: says {said}, the CSV gives {actual}")
        if not found:
            continue
        if bad:
            change(f"the monthly table in {source.name} does not come out of the transfer CSV",
                   "; ".join(bad))
        else:
            ok(f"the monthly table in {source.name} reproduces from the CSV", f"{found} row(s)")

    # 4c-ter. The thirty-day window, per version.
    #
    # This is the sentence B4 was about, and on 2026-09-22 fixing it caught only half the house:
    # the post-ready copy got the right figures, article-numbers.py stopped using a stale cut, the
    # data README was corrected, and docs/artikel-agentenoekonomie.md kept saying "45 wallets sent
    # 435 USDC in 105 transfers" for another four hours. Every check here searched the joined text,
    # and one correct copy is enough to satisfy a search. So this one runs per version, and it
    # recomputes rather than comparing to a number written here.
    end = max(z["timestamp_utc"] for z in rows)
    cutoff = (
        datetime.datetime.fromisoformat(end.replace("Z", "+00:00")) - datetime.timedelta(days=30)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    window = [z for z in rows if z["timestamp_utc"] >= cutoff]
    window_usdc = sum(float(z["usdc"]) for z in window)
    window_wallets = len({z["from"] for z in window})
    for source, version in versions_flat:
        m = re.search(r"(\d+) wallets sent ([\d.]+) USDC in (\d+) transfers", version)
        if not m:
            continue
        said = (number(m.group(1)), float(m.group(2)), number(m.group(3)))
        actual = (window_wallets, round(window_usdc, 2), len(window))
        if said == actual or (said[0], round(said[1]), said[2]) == (actual[0], round(actual[1]), actual[2]):
            ok(f"the 30-day window in {source.name} matches the transfer list",
               f"{actual[0]} wallets, {actual[1]} USDC, {actual[2]} transfers")
        else:
            change(f"{source.name} says {said[0]} wallets, {said[1]} USDC, {said[2]} transfers "
                   f"in the last 30 days, and the published CSV gives {actual[0]}, {actual[1]}, {actual[2]}",
                   "the window runs from the last row of the file; a hardcoded cut ages into the "
                   "wrong day, which is what B4 was")

    # 4c-quater. Which model the sentence names, and whether it says when.
    #
    # "then the runtime keeps routing to gpt-5-mini" was right for the Ollama route and wrong for
    # the other one this piece offers: the nested default is gpt-5.2, and gpt-5-mini is what the
    # router puts first only at tier critical or dead. Claim 8 in ops/upstream-claims.py checks
    # both constants and both candidate orders; this checks that the sentence carries them.
    for source, version in versions_flat:
        if "gpt-5-mini" not in version:
            continue
        if "gpt-5.2" in version and re.search(r"critical", version):
            ok(f"{source.name} names both default models and the tier that picks each")
        else:
            change(f"{source.name} names gpt-5-mini without gpt-5.2 or without the tier",
                   "the nested default is gpt-5.2; gpt-5-mini goes first only at tier critical or "
                   "dead, so naming it alone is right for the Ollama route and wrong for the "
                   "route that writes a balance into the SQLite file")

    for source, version in versions_flat:
        if "inferenceModel" not in version:
            continue
        if re.search(r"wizard copies the top-level value down", version):
            ok(f"the inferenceModel trap is described the way the code behaves in {source.name}",
               "the wizard copies it down; a hand-edited file does not")
        else:
            change(f"{source.name} describes the inferenceModel trap without saying the wizard copies",
                   "ops/upstream-claims.py checks that it does, and blaming the wizard is a wrong "
                   "claim about somebody else's code inside a piece about somebody else's code")

    # 4c-bis. The distribution table, line by line.
    #
    # The head figures and the table came from two different scans 78 minutes apart, and nobody
    # noticed because only the head figures were ever compared. The table said 13,618 and 1,207
    # where the published CSV says 13,616 and 1,206, so it summed to 15,130 while the sentence
    # above it said 15,127. An adversarial read found that subtraction in one pass. The
    # distribution is the part the whole argument rests on, so it is checked line by line and then
    # added up.
    if figures and figures.get("buckets") and all(v is not None for v in figures["buckets"].values()):
        off = []
        # The sum is taken from the rows AS PRINTED, not from the CSV. Summing the CSV and
        # comparing that to the sentence compares two things that are both right by construction,
        # which is the mistake this whole cycle was about. The original finding was that the
        # table in the text added up to 15,130 while the sentence above it said 15,127.
        from_table = 0
        complete = True
        for name, expected in figures["buckets"].items():
            m = re.search(rf"^  {re.escape(name)}\s+([\d,]+)\s", text, re.MULTILINE)
            if not m:
                off.append(f"the row '{name}' is not in the table")
                complete = False
                continue
            from_table += number(m.group(1))
            if number(m.group(1)) != expected:
                off.append(f"'{name}': the table says {number(m.group(1)):,}, the CSV says {expected:,}")
        m = re.search(r"the remaining ([\d,]+) were paid for", text)
        if complete and m and number(m.group(1)) != from_table:
            off.append(
                f"the rows in the table add up to {from_table:,} and the sentence above them says "
                f"{number(m.group(1)):,}")
        total = from_table
        if off:
            for line in off:
                change(line, "the distribution is the part the argument rests on, and a reader "
                               "adds up five numbers before they trust any of it")
        else:
            ok("the distribution table matches the published CSV and adds up", f"{total:,} services")

    # The number words are here because the text uses them: "Forty have a hundred or more". A
    # pattern that only matches digits skips that line in silence, which is a check that cannot
    # fail dressed as a check that passed.
    WORDS = {"ten": 10, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
            "seventy": 70, "eighty": 80, "ninety": 90, "one hundred": 100}

    def as_number(raw: str) -> int:
        return WORDS[raw.lower()] if raw.lower() in WORDS else number(raw)

    for name, pattern, field in [
        ("services with 5+ payers", r"([\d,]+|[A-Za-z]+) services have five or more", "with_5_payers"),
        ("services with 100+ payers", r"([\d,]+|[A-Za-z]+) have a hundred or more", "with_100_payers"),
    ]:
        m = re.search(pattern, text)
        if not m:
            change(f"the sentence about {name} is not in the text any more",
                   f"the check looked for /{pattern}/")
            continue
        if figures.get(field) is None:
            continue
        try:
            in_text = as_number(m.group(1))
        except (KeyError, ValueError):
            change(f"{name}: cannot read '{m.group(1)}' as a number",
                   "the check has to be taught the word before it can compare it, and until then "
                   "it is not checking this line at all")
            continue
        if in_text != figures[field]:
            change(f"{name}: the text says {in_text:,}, the CSV says {figures[field]:,}",
                   "same file, same script")
        else:
            ok(name, f"{in_text:,}")

    # 4d. Where the piece puts itself, against the same data it puts everybody else against.
    #
    # It used to say Handsel "sits in the same bucket as most of the 15,192 entries", while four
    # paragraphs earlier it sorts 10,564 services with exactly one paying wallet into "somebody
    # testing their own deployment". Handsel has exactly one paying wallet. The sentence was
    # flattering by being vague, in the one place where the piece has to apply its own measure to
    # itself, and an adversarial read found it in a minute.
    #
    # So the group it names is checked against the CSV like every other figure, and the number of
    # paying wallets against the live service.
    m = re.search(r"it is one of the ([\d,]+):", text)
    if not m:
        change("the article no longer says which group it puts itself in",
               "four paragraphs earlier it sorts that group into people testing their own "
               "deployment, and leaving itself out of it is the objection a reader reaches for")
    elif figures and figures.get("with_one_payer") is not None and number(m.group(1)) != figures["with_one_payer"]:
        change(f"the article puts itself among {number(m.group(1)):,} services, the CSV says "
               f"{figures['with_one_payer']:,}",
               "same file, same script, and this is the number a reader checks first because the "
               "sentence is about the author")
    else:
        ok("the article applies its own measure to itself", f"one of {m.group(1)}")

    # 4e. The Conway transfer window, against the CSV the article publishes.
    #
    # Four sentences in this piece were wrong against our own data on 2026-09-21, and all four in
    # the same direction: the text claimed more than the file behind it. The transfer window said
    # "2.4 payments per wallet" and then explained that number with a runtime path that only ever
    # buys the $5 minimum, while 18 of the 104 transfers are dust worth five cents together. And
    # the September first-time buyers included our own automaton without saying so, in the
    # paragraph that exists to show demand from strangers.
    #
    # Both are arithmetic on a committed CSV, so both are checked here rather than remembered.
    transfer_csv = Path("docs/research/data/2026-09-19-conway-payto-transfers.csv")
    if "in 104 transfers" in text and transfer_csv.exists():
        import csv as _csv

        rows = list(_csv.DictReader(transfer_csv.open()))
        window = [r for r in rows if r["timestamp_utc"] >= "2026-08-21"]
        purchases = [r for r in window if abs(float(r["usdc"]) - 5.0) < 1e-9]
        dust = [r for r in window if float(r["usdc"]) < 5.0]
        expected = {
            "transfers": len(window),
            "wallets": len({r["from"].lower() for r in window}),
            "purchases": len(purchases),
            "purchase_wallets": len({r["from"].lower() for r in purchases}),
            "dust": len(dust),
        }
        pairs = [
            (r"([\d,]+) wallets sent", "wallets"),
            (r"in ([\d,]+) transfers", "transfers"),
            (r"([\d,]+) of those are exactly the \$5 minimum", "purchases"),
            (r"from ([\d,]+) wallets, so two purchases", "purchase_wallets"),
            (r"the other ([\d,]+) are dust", "dust"),
        ]
        off = []
        for pattern, field in pairs:
            m = re.search(pattern, text)
            if not m:
                off.append(f"the transfer window no longer says {field}")
            elif number(m.group(1)) != expected[field]:
                off.append(f"{field}: the text says {number(m.group(1)):,}, the CSV says {expected[field]:,}")
        if off:
            for line in off:
                change(line, "the sentence carries a causal claim about a runtime that only buys "
                               "the 5 USDC tier, so the dust has to be outside the number it explains")
        else:
            ok("the transfer window separates purchases from dust",
               f"{expected['purchases']} purchases, {expected['dust']} dust")

        # And whether our own first start is named among the September first-time buyers.
        first_seen = {}
        for r in sorted(rows, key=lambda r: r["timestamp_utc"]):
            first_seen.setdefault(r["from"].lower(), r["timestamp_utc"])
        ours = "0x56de77800de59baf92ccb2ccc32c4cf11f58e93b"
        if first_seen.get(ours, "") >= "2026-09-01":
            if re.search(r"my own automaton on its first start", text):
                ok("our own wallet is named among the September first-time buyers")
            else:
                change("our own automaton is one of the September first-time buyers and the "
                       "article does not say so",
                       "that paragraph exists to show demand from strangers, and /conway already "
                       "marks the same transfer as ours")

    # 4e-bis. The scan totals and the one arithmetic a reader does in the first paragraph.
    #
    # Six sentences were checked by nobody until an adversarial read did them by hand: the reader's
    # own sum in paragraph one came out 19 too high because duplicates inside PayAI were never
    # mentioned, "over nine months" covered eight months with money in them, and the transfer
    # totals belong to a scan that ends at 03:55 while /conway keeps counting.
    if transfer_csv.exists():
        import csv as _csv2

        all_rows = list(_csv2.DictReader(transfer_csv.open()))
        conway = {
            "transfers": len(all_rows),
            "wallets": len({r["from"].lower() for r in all_rows}),
            "usdc": round(sum(float(r["usdc"]) for r in all_rows)),
            "months": len({r["timestamp_utc"][:7] for r in all_rows}),
        }
        for name, pattern, expected in [
            ("transfer events", r"([\d,]+) transfer events", conway["transfers"]),
            ("distinct wallets", r"from ([\d,]+) distinct wallets", conway["wallets"]),
            ("USDC in total", r"([\d,]+) USDC from", conway["usdc"]),
        ]:
            m = re.search(pattern, text)
            if not m:
                change(f"the sentence about {name} is gone", f"the check looked for /{pattern}/")
            elif number(m.group(1)) != expected:
                change(f"{name}: the text says {number(m.group(1)):,}, the CSV says {expected:,}",
                       "the article invites the reader to re-run this against that file")
            else:
                ok(name, f"{expected:,}")
        m = re.search(r"over the ([a-z]+) months that carry any", text)
        word_number = {"seven": 7, "eight": 8, "nine": 9, "ten": 10}
        if m and word_number.get(m.group(1)) != conway["months"]:
            change(f"the text says {m.group(1)} months with money, the CSV has {conway['months']}",
                   "January is in the scan and empty, which is why this is not the span of the scan")
        elif m:
            ok("months that carry money", str(conway["months"]))

    # The reader's own subtraction in the first paragraph.
    m = re.search(r"([\d,]+) services from Coinbase and ([\d,]+) entries from the PayAI", text)
    m2 = re.search(r"([\d,]+) of those are\s+the same service listed in both directories and another ([\d,]+) are listed twice", text)
    m3 = re.search(r"leaves ([\d,]+) distinct service URLs", text)
    if m and m2 and m3:
        computed = number(m.group(1)) + number(m.group(2)) - number(m2.group(1)) - number(m2.group(2))
        if computed != number(m3.group(1)):
            change(f"the first paragraph adds up to {computed:,} and then says {number(m3.group(1)):,}",
                   "it is the only sum a reader can do in their head, and it sits in the opening")
        else:
            ok("the first paragraph adds up", f"{computed:,}")
    else:
        change("the first paragraph no longer shows its subtraction",
               "without the duplicates named, a reader's sum comes out 19 too high")

    # 4e-ter. The three claims that lean on somebody else's numbers.
    #
    # Each of these was found by an adversarial read holding the text against our own notes, and
    # each is a case of the text sounding firmer than the evidence: a download count attributed to
    # a repository it is not linked to, "all from outside" over a sample of 100 out of 103, and an
    # issue from March used to illustrate a wall that went up in July.
    for name, pattern, hint in [
        ("the npm package's weak link to the repository",
         r"bugs\.url at a repository that does not exist",
         "docs/research/2026-09-20-wo-die-betroffenen-sind.md checked that repository and got a "
         "404; leaning on the download count without saying so attributes traffic we cannot "
         "attribute"),
        ("the comment sample",
         r"the 100 most recent, which is as many as the API hands over",
         "2026-09-21-conway-repo.json says recent_issue_comments_checked is 100 while "
         "issue_comments_since_then is 103, so 'all' was a claim about three comments nobody read"),
        ("the date on issue 293",
         r"filed on 27 March, four months before the wall went up",
         "the piece puts the wall at 17 July and says people were still getting in before it, so "
         "an issue from March illustrates the spending path and not the wall"),
    ]:
        if re.search(pattern, text):
            ok(name)
        else:
            change(f"the hedge on {name} is gone", hint)

    # 4f. Discussions and issue trackers are two different figures, and the fork count is a third.
    #
    # This checked only that the sentence still began with "Discussions are off on the main
    # repository" and then printed two numbers that were hardcoded right here, held against
    # nothing. The text could have claimed nine thousand forks and this stayed green. An
    # adversarial read found it (B12), and the number really is wrong in a way worth naming: 1,438
    # is what the fork listing returns, while docs/research/data/2026-09-21-conway-repo.json, the
    # file this article publishes as its own evidence, says 1,444, and GitHub says more today.
    # Deleted and private forks are the difference. "Every one of its 1,438 forks" presents the
    # listable subset as the whole.
    m_forks = re.search(r"([\d,]+) forks[^.]*?and ([\d,]+) of those forks", flat)
    if m_forks:
        behauptet, tracker = number(m_forks.group(1)), number(m_forks.group(2))
        gemessen = json.loads(Path("docs/research/data/2026-09-21-conway-repo.json").read_text()).get("forks")
        if gemessen is None:
            change("the fork count cannot be checked",
                   "docs/research/data/2026-09-21-conway-repo.json carries no `forks` field any more")
        elif behauptet > gemessen:
            change(f"the article claims {behauptet:,} forks and the published measurement says {gemessen:,}",
                   "a number above the measured one cannot be defended with the file the article ships")
        elif behauptet < gemessen and "listable" not in flat and "the fork listing" not in flat:
            change(f"the article says \"every one of its {behauptet:,} forks\" while the measurement says {gemessen:,}",
                   "1,438 is what the fork listing returns; deleted and private forks are the "
                   "difference, and calling the subset the whole is what an adversarial read "
                   "picked up. Say which of the two numbers it is.")
        else:
            ok("the fork count matches the published measurement", f"{behauptet:,} of {gemessen:,}")
        if tracker > behauptet:
            change(f"{tracker:,} forks have the tracker off out of {behauptet:,}",
                   "the subset cannot be larger than the set it is drawn from")
    elif "Discussions" in text:
        change("the sentence about Discussions and the forks changed",
               "docs/research/2026-09-20-wo-die-betroffenen-sind.md says no fork has Discussions "
               "at all, and the three exceptions belong to the issue tracker figure. The two "
               "figures and the fork count are checked by their shape, so keep the sentence "
               "readable as \"every one of its N forks, and M of those forks\".")

    # 5. Nobody should arrive at an empty market.
    try:
        open_jobs = fetch("/bounties.json")["open"]
    except Exception:
        open_jobs = []
    if open_jobs:
        ok(f"{len(open_jobs)} job(s) open when readers arrive",
           ", ".join(f"{b['award_cents']} c" for b in open_jobs))
    else:
        change("no job is open", "an empty market convinces nobody, and this is the one thing "
                                  "that can be fixed in five minutes before posting")

    # 6. The disclosure has to cover what the market looks like on the day it is read.
    #
    # The article's whole force comes from being hard on numbers, including its own, and it calls
    # 10,564 services with one paying wallet each evidence of people testing their own deployment.
    # Since 2026-09-21 the jobs on our own market are competed for by our own agents. A reader who
    # checks /jobs sees a submission count and has no way to know whose it is, and an article that
    # applied that argument to everybody else while leaving this out is refutable in one click.
    #
    # Checked against the live market rather than a note somebody has to remember: while the report
    # counts our own submissions on open jobs, the article has to say so.
    own = 0
    try:
        own = subprocess.run(
            ["./ops/status.sh"], capture_output=True, text=True, timeout=120,
        ).stdout
        own = json.loads(own)["db"]["market"].get("seed_submissions_on_open", 0)
    except Exception:
        own = -1
    if own < 0:
        change("could not read how many submissions on open jobs are ours",
               "without it the disclosure is unchecked; run ops/status.sh by hand")
    elif own == 0:
        ok("no agent of ours sits on an open job", "the disclosure needs no sentence about it")
    elif "my own agents on the other side" in text:
        ok(f"{own} submission(s) of ours are disclosed", "the article says the agents are mine")
    else:
        change(f"{own} submission(s) on open jobs are ours and the article does not say so",
               "the piece argues that one-payer services are people testing their own deployment. "
               "Publishing that while our own market is both sides without saying it is the one "
               "thing a reader can refute in a single click")

    print()
    if findings:
        print(f"NOT YET: {len(findings)} thing(s) to settle first")
        return 1
    print("READY. Nothing left that this can check.")
    print("What it cannot check: whether today is a good day to post, and that is yours.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
