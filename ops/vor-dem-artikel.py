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
import json
import re
import subprocess
import sys
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

    # 2. The directory figures in the text against the scan of today.
    punkt = letzte_zeile("/opt/control-plane/x402/kennzahlen.ndjson")
    if not punkt:
        aendern("the x402 series could not be read", "run ops/x402-zeitreihe.sh on the VM first")
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

    # 3. The disclosure. "zero buyers who are not me" is a fact with an expiry date.
    try:
        bericht = subprocess.run(["./ops/status.sh"], capture_output=True, text=True, timeout=60)
        markt = json.loads(bericht.stdout)["db"]["market"]
    except Exception:
        markt = {}
    fremde = markt.get("foreign_buyers")
    if fremde == 0 and "zero buyers who are not me" in text:
        ok("the disclosure is still true", "foreign buyers: 0")
    elif fremde != 0:
        aendern(f"foreign buyers is {fremde}, and the text still says zero",
                "that is the best possible reason to edit a sentence; say the real number")
    else:
        aendern("the disclosure sentence is not in the text any more",
                "it said 'zero buyers who are not me' and it is what makes the piece honest")

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

    print()
    if befunde:
        print(f"NOT YET: {len(befunde)} thing(s) to settle first")
        return 1
    print("READY. Nothing left that this can check.")
    print("What it cannot check: whether today is a good day to post, and that is yours.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
