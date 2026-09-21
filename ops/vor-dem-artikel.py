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

ARTIKEL = Path(".scratch/gtm/hn-post.txt")
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
    if not ARTIKEL.exists():
        print(f"The article is not at {ARTIKEL}.")
        return 2
    text = ARTIKEL.read_text()
    print("Before the article goes out\n")

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
            int(m.group(1).replace(",", "").replace(".", "")) if (m := re.search(muster, lauf)) else None
        )
        punkt = {
            "dienste_cdp": zahl_aus(r"Coinbase ([\d.,]+)"),
            "dienste_payai": zahl_aus(r"PayAI ([\d.,]+)"),
            "urls_eindeutig": zahl_aus(r"Eindeutige Dienst-URLs: ([\d.,]+)"),
            "anbieter": zahl_aus(r"Verschiedene Anbieter \(Host\): ([\d.,]+)"),
            "aufrufe_30d": zahl_aus(r"Aufrufe in 30 Tagen, Summe:\s+([\d.,]+)"),
            "mit_20_zahlern": zahl_aus(r"mindestens  20 Zahlern:\s+([\d.,]+)"),
            "mit_nachfrage": zahl_aus(r"Nachfragedaten: ([\d.,]+) von"),
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
            ("distinct services", r"so ([\d,]+) distinct services", "urls_eindeutig"),
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
