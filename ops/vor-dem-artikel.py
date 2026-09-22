#!/usr/bin/env python3
"""Everything that has to be true before the article goes out, in one run.

The checklist at the top of `.scratch/gtm/hn-post.txt` is a list of commands somebody has to
remember to run and numbers somebody has to remember to compare. On the morning of a launch that
is exactly the kind of list that gets skipped, and the numbers in that text are the ones a reader
will check first.

So this reads the article, pulls the figures out of it, and holds each one against what the
service and the daily series say today. It changes nothing and sends nothing; posting stays a
human act.

    ops/vor-dem-artikel.py

Exit code 0 means the text matches the world. Anything else names the sentences to fix.
"""
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
ARTIKEL = Path(".scratch/gtm/hn-post.txt")
ARTIKEL_REPO = Path("docs/artikel-agentenoekonomie.md")
BASE = "https://cp.hippe.eu"
befunde = []


def ok(was: str, wert: str = "") -> None:
    print(f"  ok      {was}{'  ' + wert if wert else ''}")


def aendern(was: str, hinweis: str) -> None:
    befunde.append(was)
    print(f"  CHANGE  {was}\n          {hinweis}")


def vm(befehl: str) -> str:
    """Reads a file on the VM. The series lives outside the repo and outside the container."""
    try:
        return subprocess.run(
            ["ssh", "-i", str(Path.home() / ".ssh/id_ed25519_automaton"), "-o", "BatchMode=yes",
             "-o", "ConnectTimeout=8", "root@76.13.144.207", befehl],
            capture_output=True, text=True, timeout=25,
        ).stdout.strip()
    except Exception:
        return ""


def letzte_zeile(pfad: str) -> dict:
    roh = vm(f"tail -1 {pfad}")
    try:
        return json.loads(roh)
    except Exception:
        return {}


def hole(pfad: str) -> dict:
    with urllib.request.urlopen(f"{BASE}{pfad}", timeout=15) as r:
        return json.load(r)


def zahl(text: str) -> int:
    return int(text.replace(",", "").replace(".", ""))


def main() -> int:
    quellen = [p for p in (ARTIKEL, ARTIKEL_REPO) if p.exists()]
    if not quellen:
        print(f"Neither {ARTIKEL} nor {ARTIKEL_REPO} is there.")
        return 2
    # Two kinds of check need two kinds of text.
    #
    # A check of the shape "the text must not say Y" is satisfiable only by every copy, so the
    # joined text is right for it. A check of the shape "if it mentions X it has to say Y" is
    # satisfied by ANY copy once the texts are joined, which is the opposite of what is wanted:
    # the counter-proof put the old wrong inferenceModel sentence back into the repo copy and this
    # stayed green, because the post-ready copy still carried the corrected one. So those run per
    # source, through `je_quelle`.
    fassungen = [(p, p.read_text()) for p in quellen]
    text = "\n".join(t for _, t in fassungen)
    # Flattened copies for the prose searches. The distribution table is checked row by row and
    # needs its line breaks, so `text` stays raw and only the sentence-level checks use these.
    def glatt(t: str) -> str:
        return " ".join(t.split())

    fliess = glatt(text)
    fassungen_fliess = [(p, glatt(t)) for p, t in fassungen]
    print("Before the article goes out\n")
    print(f"  Reading: {', '.join(str(p) for p in quellen)}\n")

    # 1. Is the service the reader will land on actually healthy and complete?
    lauf = subprocess.run(["./ops/check-all.sh"], capture_output=True, text=True, timeout=400)
    if "ALL CHECKS OK" in lauf.stdout:
        ok("the service, the market, the journeys and the pages", lauf.stdout.strip().splitlines()[-1])
    else:
        aendern("ops/check-all.sh is not green",
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
        aendern("no x402 CSV in docs/research/data", "the article links to it as the way to re-run")
        punkt = {}
    else:
        lauf = subprocess.run(
            ["python3", "docs/research/data/x402-kennzahlen.py", str(csv[-1])],
            capture_output=True, text=True, timeout=180,
        ).stdout
        zahl_aus = lambda muster: (
            int(m.group(1).replace(",", "").replace(".", "")) if (m := re.search(muster, lauf, re.MULTILINE)) else None
        )
        punkt = {
            "dienste_cdp": zahl_aus(r"Coinbase ([\d.,]+)"),
            "dienste_payai": zahl_aus(r"PayAI ([\d.,]+)"),
            "urls_eindeutig": zahl_aus(r"Eindeutige Dienst-URLs: ([\d.,]+)"),
            "anbieter": zahl_aus(r"Verschiedene Anbieter \(Host\): ([\d.,]+)"),
            "aufrufe_30d": zahl_aus(r"Aufrufe in 30 Tagen, Summe:\s+([\d.,]+)"),
            "mit_20_zahlern": zahl_aus(r"mindestens  20 Zahlern:\s+([\d.,]+)"),
            "mit_nachfrage": zahl_aus(r"Nachfragedaten: ([\d.,]+) von"),
            "mit_einem_zahler": zahl_aus(r"genau EINER zahlenden Wallet: ([\d.,]+)"),
            "mit_5_zahlern": zahl_aus(r"mindestens   5 Zahlern:\s+([\d.,]+)"),
            "mit_100_zahlern": zahl_aus(r"mindestens 100 Zahlern:\s+([\d.,]+)"),
            "eimer": {
                name: zahl_aus(muster)
                for name, muster in [
                    ("none", r"^\s+0:\s+([\d.,]+)"),
                    ("1 to 9", r"1-9:\s+([\d.,]+)"),
                    ("10 to 99", r"10-99:\s+([\d.,]+)"),
                    ("100 to 999", r"100-999:\s+([\d.,]+)"),
                    ("1,000 or more", r"1000\+:\s+([\d.,]+)"),
                ]
            },
        }
        punkt["ohne_nachfragedaten"] = (
            punkt["dienste_cdp"] - punkt["mit_nachfrage"]
            if punkt["dienste_cdp"] and punkt["mit_nachfrage"] else None
        )
        print(f"  (the figures below come from {csv[-1].name}, re-run with the published script)")
    if not punkt or punkt.get("dienste_cdp") is None:
        aendern("the CSV could not be re-run", "without it the article's figures are unchecked")
    else:
        paare = [
            # Reworded on 2026-09-22 when the first paragraph started showing its subtraction.
            # The check noticed, which is what it is for.
            ("distinct services", r"leaves ([\d,]+) distinct service URLs", "urls_eindeutig"),
            ("providers", r"behind ([\d,]+) providers", "anbieter"),
            ("calls in 30 days", r"were paid for ([\d,]+) calls", "aufrufe_30d"),
            ("services with 20+ payers", r"([\d,]+) have twenty or more", "mit_20_zahlern"),
            ("Coinbase entries", r"([\d,]+) services from Coinbase", "dienste_cdp"),
            ("PayAI entries", r"and ([\d,]+) entries from the PayAI", "dienste_payai"),
            ("entries without demand data", r"([\d,]+) of the Coinbase entries carry no demand", "ohne_nachfragedaten"),
        ]
        for name, muster, feld in paare:
            m = re.search(muster, text)
            if not m:
                aendern(f"the sentence about {name} is not in the text any more",
                        f"the check looked for /{muster}/")
                continue
            im_text, heute = zahl(m.group(1)), punkt.get(feld)
            if im_text == heute:
                ok(f"{name}", f"{im_text:,}")
            else:
                aendern(f"{name}: the text says {im_text:,}, today it is {heute:,}",
                        f"replace it, and remember the totals are a floor: "
                        f"{punkt.get('ohne_nachfragedaten', 0)} entries still carry no demand data")


    # 4. Conway's present tense. A maintainer coming back changes the argument, not a number.
    c = letzte_zeile("/opt/control-plane/conway/repo.ndjson")
    if not c:
        aendern("the conway series could not be read", "run ops/conway-zeitreihe.sh on the VM first")
    else:
        if c.get("last_write_access_comment", "").startswith("2026-03-06"):
            ok("no maintainer has come back", "last write-access comment 2026-03-06")
        else:
            aendern(f"a maintainer commented on {c.get('last_write_access_comment')}",
                    "the wall the article describes is being taken down; say so before posting")
        if c.get("pr370_state") == "open":
            ok("PR #370 is still open")
        else:
            aendern(f"PR #370 is {c.get('pr370_state')}",
                    "nine issue answers call it open")
        if c.get("last_push") == "2026-08-26T16:28:14Z":
            ok("the last commit is still 26 August")
        else:
            aendern(f"the repository was pushed on {c.get('last_push')}",
                    "the article and five issue answers say the last commit is 26 August")

    # 4b. The two present-tense claims about Conway's money, which are new in the text since
    # 21.09. and are the only ones that can go stale between writing and posting. The window
    # figures in the article ("From August 21 to the end of the scan") are a closed period and are
    # deliberately not compared against anything; only the claims about now are.
    if "Money still moves into it every week" in text:
        geld = letzte_zeile("/opt/control-plane/conway-money/metrics.ndjson")
        if not geld:
            aendern("the conway money series could not be read",
                    "run ops/conway-money-series.sh on the VM first")
        else:
            zuletzt = geld.get("data_through", "")
            try:
                alter = (datetime.datetime.now(datetime.timezone.utc)
                         - datetime.datetime.strptime(zuletzt, "%Y-%m-%dT%H:%M:%SZ")
                         .replace(tzinfo=datetime.timezone.utc)).days
            except Exception:
                alter = 999
            if alter <= 7:
                ok("money still moves into Conway", f"last transfer {zuletzt}, {alter} day(s) ago")
            else:
                aendern(f"the last transfer into Conway was {zuletzt}, {alter} days ago",
                        "the article says money still moves in every week; either the flow stopped "
                        "or the series has not run")

    if "still returned a valid x402 demand" in text:
        try:
            urllib.request.urlopen(
                urllib.request.Request(
                    "https://api.conway.tech/pay/5/0x0000000000000000000000000000000000000001",
                    headers={"User-Agent": "control-plane-check/1.0 (+https://cp.hippe.eu)"}),
                timeout=15)
            aendern("api.conway.tech/pay no longer answers 402", "it answered 200; nothing is signed "
                    "by this check, but the sentence about the payment endpoint has to change")
        except urllib.error.HTTPError as fehler:
            if fehler.code == 402:
                ok("Conway still asks for money", "GET /pay/5/<address> answers 402")
            else:
                aendern(f"api.conway.tech/pay answers {fehler.code}, not 402",
                        "the article says the payment endpoint still demands 5 USDC")
        except Exception as fehler:
            aendern(f"api.conway.tech/pay could not be reached ({fehler})",
                    "without it the sentence about the live payment endpoint is unchecked")

    # 4c. The one claim about upstream code that two of three surfaces got wrong.
    #
    # The article and /fix both said the router reads the nested inferenceModel "not the top-level
    # one the setup wizard writes", which reads as the wizard writing a field the router ignores.
    # It does not: src/setup/configure.ts assigns the chosen model to both. The trap is a
    # hand-edited automaton.json. docs/without-control-plane.md had it right since 21.09. and
    # nothing held the short version against the long one until an adversarial read did.
    # 4c-ter. The thirty-day window, per version.
    #
    # This is the sentence B4 was about, and on 2026-09-22 fixing it caught only half the house:
    # the post-ready copy got the right figures, artikel-zahlen.py stopped using a stale cut, the
    # data README was corrected, and docs/artikel-agentenoekonomie.md kept saying "45 wallets sent
    # 435 USDC in 105 transfers" for another four hours. Every check here searched the joined text,
    # and one correct copy is enough to satisfy a search. So this one runs per version, and it
    # recomputes rather than comparing to a number written here.
    import csv as _csv

    zeilen = list(_csv.DictReader(open("docs/research/data/2026-09-19-conway-payto-transfers.csv")))
    ende = max(z["timestamp_utc"] for z in zeilen)
    grenze = (
        datetime.datetime.fromisoformat(ende.replace("Z", "+00:00")) - datetime.timedelta(days=30)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    fenster = [z for z in zeilen if z["timestamp_utc"] >= grenze]
    w_usdc = sum(float(z["usdc"]) for z in fenster)
    w_wallets = len({z["from"] for z in fenster})
    for quelle, fassung in fassungen_fliess:
        m = re.search(r"(\d+) wallets sent ([\d.]+) USDC in (\d+) transfers", fassung)
        if not m:
            continue
        gesagt = (zahl(m.group(1)), float(m.group(2)), zahl(m.group(3)))
        echt = (w_wallets, round(w_usdc, 2), len(fenster))
        if gesagt == echt or (gesagt[0], round(gesagt[1]), gesagt[2]) == (echt[0], round(echt[1]), echt[2]):
            ok(f"the 30-day window in {quelle.name} matches the transfer list",
               f"{echt[0]} wallets, {echt[1]} USDC, {echt[2]} transfers")
        else:
            aendern(f"{quelle.name} says {gesagt[0]} wallets, {gesagt[1]} USDC, {gesagt[2]} transfers "
                    f"in the last 30 days, and the published CSV gives {echt[0]}, {echt[1]}, {echt[2]}",
                    "the window runs from the last row of the file; a hardcoded cut ages into the "
                    "wrong day, which is what B4 was")

    # 4c-quater. Which model the sentence names, and whether it says when.
    #
    # "then the runtime keeps routing to gpt-5-mini" was right for the Ollama route and wrong for
    # the other one this piece offers: the nested default is gpt-5.2, and gpt-5-mini is what the
    # router puts first only at tier critical or dead. Claim 8 in ops/upstream-claims.py checks
    # both constants and both candidate orders; this checks that the sentence carries them.
    for quelle, fassung in fassungen_fliess:
        if "gpt-5-mini" not in fassung:
            continue
        if "gpt-5.2" in fassung and re.search(r"critical", fassung):
            ok(f"{quelle.name} names both default models and the tier that picks each")
        else:
            aendern(f"{quelle.name} names gpt-5-mini without gpt-5.2 or without the tier",
                    "the nested default is gpt-5.2; gpt-5-mini goes first only at tier critical or "
                    "dead, so naming it alone is right for the Ollama route and wrong for the "
                    "route that writes a balance into the SQLite file")

    for quelle, fassung in fassungen_fliess:
        if "inferenceModel" not in fassung:
            continue
        if re.search(r"wizard copies the top-level value down", fassung):
            ok(f"the inferenceModel trap is described the way the code behaves in {quelle.name}",
               "the wizard copies it down; a hand-edited file does not")
        else:
            aendern(f"{quelle.name} describes the inferenceModel trap without saying the wizard copies",
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
    if punkt and punkt.get("eimer") and all(v is not None for v in punkt["eimer"].values()):
        schief = []
        # The sum is taken from the rows AS PRINTED, not from the CSV. Summing the CSV and
        # comparing that to the sentence compares two things that are both right by construction,
        # which is the mistake this whole cycle was about. The original finding was that the
        # table in the text added up to 15,130 while the sentence above it said 15,127.
        aus_tabelle = 0
        vollstaendig = True
        for name, soll in punkt["eimer"].items():
            m = re.search(rf"^  {re.escape(name)}\s+([\d,]+)\s", text, re.MULTILINE)
            if not m:
                schief.append(f"the row '{name}' is not in the table")
                vollstaendig = False
                continue
            aus_tabelle += zahl(m.group(1))
            if zahl(m.group(1)) != soll:
                schief.append(f"'{name}': the table says {zahl(m.group(1)):,}, the CSV says {soll:,}")
        m = re.search(r"the remaining ([\d,]+) were paid for", text)
        if vollstaendig and m and zahl(m.group(1)) != aus_tabelle:
            schief.append(
                f"the rows in the table add up to {aus_tabelle:,} and the sentence above them says "
                f"{zahl(m.group(1)):,}")
        summe = aus_tabelle
        if schief:
            for zeile in schief:
                aendern(zeile, "the distribution is the part the argument rests on, and a reader "
                               "adds up five numbers before they trust any of it")
        else:
            ok("the distribution table matches the published CSV and adds up", f"{summe:,} services")

    # The number words are here because the text uses them: "Forty have a hundred or more". A
    # pattern that only matches digits skips that line in silence, which is a check that cannot
    # fail dressed as a check that passed.
    WORT = {"ten": 10, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
            "seventy": 70, "eighty": 80, "ninety": 90, "one hundred": 100}

    def als_zahl(roh: str) -> int:
        return WORT[roh.lower()] if roh.lower() in WORT else zahl(roh)

    for name, muster, feld in [
        ("services with 5+ payers", r"([\d,]+|[A-Za-z]+) services have five or more", "mit_5_zahlern"),
        ("services with 100+ payers", r"([\d,]+|[A-Za-z]+) have a hundred or more", "mit_100_zahlern"),
    ]:
        m = re.search(muster, text)
        if not m:
            aendern(f"the sentence about {name} is not in the text any more",
                    f"the check looked for /{muster}/")
            continue
        if punkt.get(feld) is None:
            continue
        try:
            im_text = als_zahl(m.group(1))
        except (KeyError, ValueError):
            aendern(f"{name}: cannot read '{m.group(1)}' as a number",
                    "the check has to be taught the word before it can compare it, and until then "
                    "it is not checking this line at all")
            continue
        if im_text != punkt[feld]:
            aendern(f"{name}: the text says {im_text:,}, the CSV says {punkt[feld]:,}",
                    "same file, same script")
        else:
            ok(name, f"{im_text:,}")

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
        aendern("the article no longer says which group it puts itself in",
                "four paragraphs earlier it sorts that group into people testing their own "
                "deployment, and leaving itself out of it is the objection a reader reaches for")
    elif punkt and punkt.get("mit_einem_zahler") is not None and zahl(m.group(1)) != punkt["mit_einem_zahler"]:
        aendern(f"the article puts itself among {zahl(m.group(1)):,} services, the CSV says "
                f"{punkt['mit_einem_zahler']:,}",
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
    kurve = Path("docs/research/data/2026-09-19-conway-payto-transfers.csv")
    if "in 104 transfers" in text and kurve.exists():
        import csv as _csv

        zeilen = list(_csv.DictReader(kurve.open()))
        fenster = [r for r in zeilen if r["timestamp_utc"] >= "2026-08-21"]
        kaeufe = [r for r in fenster if abs(float(r["usdc"]) - 5.0) < 1e-9]
        staub = [r for r in fenster if float(r["usdc"]) < 5.0]
        soll = {
            "transfers": len(fenster),
            "wallets": len({r["from"].lower() for r in fenster}),
            "kaeufe": len(kaeufe),
            "kaufwallets": len({r["from"].lower() for r in kaeufe}),
            "staub": len(staub),
        }
        paare = [
            (r"([\d,]+) wallets sent", "wallets"),
            (r"in ([\d,]+) transfers", "transfers"),
            (r"([\d,]+) of those are exactly the \$5 minimum", "kaeufe"),
            (r"from ([\d,]+) wallets, so two purchases", "kaufwallets"),
            (r"the other ([\d,]+) are dust", "staub"),
        ]
        schief = []
        for muster, feld in paare:
            m = re.search(muster, text)
            if not m:
                schief.append(f"the transfer window no longer says {feld}")
            elif zahl(m.group(1)) != soll[feld]:
                schief.append(f"{feld}: the text says {zahl(m.group(1)):,}, the CSV says {soll[feld]:,}")
        if schief:
            for zeile in schief:
                aendern(zeile, "the sentence carries a causal claim about a runtime that only buys "
                               "the 5 USDC tier, so the dust has to be outside the number it explains")
        else:
            ok("the transfer window separates purchases from dust",
               f"{soll['kaeufe']} purchases, {soll['staub']} dust")

        # And whether our own first start is named among the September first-time buyers.
        erst = {}
        for r in sorted(zeilen, key=lambda r: r["timestamp_utc"]):
            erst.setdefault(r["from"].lower(), r["timestamp_utc"])
        unsere = "0x56de77800de59baf92ccb2ccc32c4cf11f58e93b"
        if erst.get(unsere, "") >= "2026-09-01":
            if re.search(r"my own automaton on its first start", text):
                ok("our own wallet is named among the September first-time buyers")
            else:
                aendern("our own automaton is one of the September first-time buyers and the "
                        "article does not say so",
                        "that paragraph exists to show demand from strangers, and /conway already "
                        "marks the same transfer as ours")

    # 4e-bis. The scan totals and the one arithmetic a reader does in the first paragraph.
    #
    # Six sentences were checked by nobody until an adversarial read did them by hand: the reader's
    # own sum in paragraph one came out 19 too high because duplicates inside PayAI were never
    # mentioned, "over nine months" covered eight months with money in them, and the transfer
    # totals belong to a scan that ends at 03:55 while /conway keeps counting.
    if kurve.exists():
        import csv as _csv2

        alle = list(_csv2.DictReader(kurve.open()))
        conway = {
            "transfers": len(alle),
            "wallets": len({r["from"].lower() for r in alle}),
            "usdc": round(sum(float(r["usdc"]) for r in alle)),
            "monate": len({r["timestamp_utc"][:7] for r in alle}),
        }
        for name, muster, soll in [
            ("transfer events", r"([\d,]+) transfer events", conway["transfers"]),
            ("distinct wallets", r"from ([\d,]+) distinct wallets", conway["wallets"]),
            ("USDC in total", r"([\d,]+) USDC from", conway["usdc"]),
        ]:
            m = re.search(muster, text)
            if not m:
                aendern(f"the sentence about {name} is gone", f"the check looked for /{muster}/")
            elif zahl(m.group(1)) != soll:
                aendern(f"{name}: the text says {zahl(m.group(1)):,}, the CSV says {soll:,}",
                        "the article invites the reader to re-run this against that file")
            else:
                ok(name, f"{soll:,}")
        m = re.search(r"over the ([a-z]+) months that carry any", text)
        wortzahl = {"seven": 7, "eight": 8, "nine": 9, "ten": 10}
        if m and wortzahl.get(m.group(1)) != conway["monate"]:
            aendern(f"the text says {m.group(1)} months with money, the CSV has {conway['monate']}",
                    "January is in the scan and empty, which is why this is not the span of the scan")
        elif m:
            ok("months that carry money", str(conway["monate"]))

    # The reader's own subtraction in the first paragraph.
    m = re.search(r"([\d,]+) services from Coinbase and ([\d,]+) entries from the PayAI", text)
    m2 = re.search(r"([\d,]+) of those are\s+the same service listed in both directories and another ([\d,]+) are listed twice", text)
    m3 = re.search(r"leaves ([\d,]+) distinct service URLs", text)
    if m and m2 and m3:
        gerechnet = zahl(m.group(1)) + zahl(m.group(2)) - zahl(m2.group(1)) - zahl(m2.group(2))
        if gerechnet != zahl(m3.group(1)):
            aendern(f"the first paragraph adds up to {gerechnet:,} and then says {zahl(m3.group(1)):,}",
                    "it is the only sum a reader can do in their head, and it sits in the opening")
        else:
            ok("the first paragraph adds up", f"{gerechnet:,}")
    else:
        aendern("the first paragraph no longer shows its subtraction",
                "without the duplicates named, a reader's sum comes out 19 too high")

    # 4e-ter. The three claims that lean on somebody else's numbers.
    #
    # Each of these was found by an adversarial read holding the text against our own notes, and
    # each is a case of the text sounding firmer than the evidence: a download count attributed to
    # a repository it is not linked to, "all from outside" over a sample of 100 out of 103, and an
    # issue from March used to illustrate a wall that went up in July.
    for name, muster, hinweis in [
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
        if re.search(muster, text):
            ok(name)
        else:
            aendern(f"the hedge on {name} is gone", hinweis)

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
    m_forks = re.search(r"([\d,]+) forks[^.]*?and ([\d,]+) of those forks", fliess)
    if m_forks:
        behauptet, tracker = zahl(m_forks.group(1)), zahl(m_forks.group(2))
        gemessen = json.loads(Path("docs/research/data/2026-09-21-conway-repo.json").read_text()).get("forks")
        if gemessen is None:
            aendern("the fork count cannot be checked",
                    "docs/research/data/2026-09-21-conway-repo.json carries no `forks` field any more")
        elif behauptet > gemessen:
            aendern(f"the article claims {behauptet:,} forks and the published measurement says {gemessen:,}",
                    "a number above the measured one cannot be defended with the file the article ships")
        elif behauptet < gemessen and "listable" not in fliess and "the fork listing" not in fliess:
            aendern(f"the article says \"every one of its {behauptet:,} forks\" while the measurement says {gemessen:,}",
                    "1,438 is what the fork listing returns; deleted and private forks are the "
                    "difference, and calling the subset the whole is what an adversarial read "
                    "picked up. Say which of the two numbers it is.")
        else:
            ok("the fork count matches the published measurement", f"{behauptet:,} of {gemessen:,}")
        if tracker > behauptet:
            aendern(f"{tracker:,} forks have the tracker off out of {behauptet:,}",
                    "the subset cannot be larger than the set it is drawn from")
    elif "Discussions" in text:
        aendern("the sentence about Discussions and the forks changed",
                "docs/research/2026-09-20-wo-die-betroffenen-sind.md says no fork has Discussions "
                "at all, and the three exceptions belong to the issue tracker figure. The two "
                "figures and the fork count are checked by their shape, so keep the sentence "
                "readable as \"every one of its N forks, and M of those forks\".")

    # 5. Nobody should arrive at an empty market.
    try:
        offen = hole("/bounties.json")["open"]
    except Exception:
        offen = []
    if offen:
        ok(f"{len(offen)} job(s) open when readers arrive",
           ", ".join(f"{b['award_cents']} c" for b in offen))
    else:
        aendern("no job is open", "an empty market convinces nobody, and this is the one thing "
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
    eigene = 0
    try:
        eigene = subprocess.run(
            ["./ops/status.sh"], capture_output=True, text=True, timeout=120,
        ).stdout
        eigene = json.loads(eigene)["db"]["market"].get("seed_submissions_on_open", 0)
    except Exception:
        eigene = -1
    if eigene < 0:
        aendern("could not read how many submissions on open jobs are ours",
                "without it the disclosure is unchecked; run ops/status.sh by hand")
    elif eigene == 0:
        ok("no agent of ours sits on an open job", "the disclosure needs no sentence about it")
    elif "my own agents on the other side" in text:
        ok(f"{eigene} submission(s) of ours are disclosed", "the article says the agents are mine")
    else:
        aendern(f"{eigene} submission(s) on open jobs are ours and the article does not say so",
                "the piece argues that one-payer services are people testing their own deployment. "
                "Publishing that while our own market is both sides without saying it is the one "
                "thing a reader can refute in a single click")

    print()
    if befunde:
        print(f"NOT YET: {len(befunde)} thing(s) to settle first")
        return 1
    print("READY. Nothing left that this can check.")
    print("What it cannot check: whether today is a good day to post, and that is yours.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
