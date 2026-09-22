#!/usr/bin/env python3
"""
Every published figure re-derived from the published data.

`docs/research/data/README.md` promises it in its first paragraph: the numbers in the article and
on /x402 come out of the scripts in that directory, and anybody who doubts them runs the scripts.
Nothing enforced that. `2026-09-21-x402-kennzahlen.json` was built by hand, so when the CSV beside
it was replaced on 2026-09-22 the JSON kept the seven head figures of a different run: 15,189
against 15,192, 20,783 against 20,789, 867,827 against 867,813. Two sections further down the same
README described exactly that discrepancy as the mistake, and still recommended the file. An
adversarial read found it (B2).

So the file is generated now, and this checks that it still matches its own CSV:

    ops/daten-pruefen.py

Exit 0 when every published dataset reproduces, 1 when one of them does not, 2 when the check
could not look (a missing file, an unreadable CSV). The third case is not a finding about the
data, the same distinction ops/conway-zustand.sh makes about somebody else's service.
"""
import json
import subprocess
import sys
from pathlib import Path

DATEN = Path(__file__).resolve().parent.parent / "docs/research/data"

# Each published dataset, and the command that has to reproduce it byte for byte.
PAARE = [
    ("2026-09-21-x402-kennzahlen.json", ["x402-kennzahlen.py", "2026-09-21-x402-verzeichnis.csv", "--dataset"]),
]


def transfers_readme() -> tuple[int, list[str]]:
    """The figures the data README states about the transfer CSV, recomputed from that CSV.

    The README hands a reader a Python block and prints what it "ergibt". Until 2026-09-22 the
    block on the file beside it produced something else: the monthly line for September read
    290.01 / 30 / 62 against an actual 295.05 / 31 / 77, and the two window figures were the state
    before the backfill of 19 September 21:45 that the same README describes three paragraphs
    higher. The stated scan end was thirteen hours early as well, which is where
    artikel-zahlen.py got its hardcoded cut from. An adversarial read found it (B5, B4).

    Recomputed and then searched for as text: a number that moves on either side turns this red,
    which is the only arrangement in which the README and its data cannot drift apart again.
    """
    import collections
    import csv
    import datetime

    readme = DATEN / "README.md"
    csv_datei = DATEN / "2026-09-19-conway-payto-transfers.csv"
    if not readme.exists() or not csv_datei.exists():
        return 2, [f"COULD NOT TELL: {readme.name} or {csv_datei.name} is missing."]
    zeilen = list(csv.DictReader(csv_datei.open()))
    if not zeilen:
        return 2, [f"COULD NOT TELL: {csv_datei.name} is empty."]
    text = readme.read_text()

    fehlend = []
    monate = collections.defaultdict(lambda: [0.0, set(), 0])
    for r in zeilen:
        k = r["timestamp_utc"][:7]
        monate[k][0] += float(r["usdc"])
        monate[k][1].add(r["from"])
        monate[k][2] += 1
    for k in sorted(monate):
        erwartet = f"{k} {round(monate[k][0], 2)} / {len(monate[k][1])} / {monate[k][2]}"
        if erwartet not in text:
            fehlend.append(f"the monthly line for {k} should read {erwartet}")

    ende = max(r["timestamp_utc"] for r in zeilen)
    if f"{ende[8:10]}.{ende[5:7]}.{ende[0:4]} {ende[11:19]} UTC" not in text:
        fehlend.append(f"the stated scan end should be the last row of the file, {ende}")
    for tage in (30, 7):
        grenze = (
            datetime.datetime.fromisoformat(ende.replace("Z", "+00:00")) - datetime.timedelta(days=tage)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        f = [r for r in zeilen if r["timestamp_utc"] >= grenze]
        betrag = f"{sum(float(r['usdc']) for r in f):.2f}".replace(".", ",")
        satz = f"letzte {tage} Tage\n{betrag} USDC von {len({r['from'] for r in f})} Wallets in {len(f)} Transfers"
        # The README wraps its lines, so the claim is checked without the line breaks.
        if " ".join(satz.split()) not in " ".join(text.split()):
            fehlend.append(f"the {tage}-day window should read {' '.join(satz.split())}")
    return (1 if fehlend else 0), fehlend


def main() -> int:
    if not DATEN.is_dir():
        print(f"COULD NOT TELL: {DATEN} is not there.")
        return 2
    schlecht = 0
    for name, befehl in PAARE:
        ziel = DATEN / name
        quelle = DATEN / befehl[1]
        if not ziel.exists() or not quelle.exists():
            print(f"COULD NOT TELL: {name} or {befehl[1]} is missing.")
            return 2
        lauf = subprocess.run([sys.executable, *befehl], cwd=DATEN, capture_output=True, text=True, timeout=300)
        if lauf.returncode != 0:
            print(f"COULD NOT TELL: {' '.join(befehl)} exited {lauf.returncode}: {lauf.stderr.strip()[:160]}")
            return 2
        try:
            gerechnet = json.loads(lauf.stdout)
            veroeffentlicht = json.loads(ziel.read_text())
        except json.JSONDecodeError as e:
            print(f"COULD NOT TELL: {name} or the script output is not JSON: {e}")
            return 2
        # Field by field, because "the files differ" is not something a reader can act on.
        abweichungen = [
            f"{k}: published {veroeffentlicht.get(k)!r}, recomputed {v!r}"
            for k, v in gerechnet.items()
            if veroeffentlicht.get(k) != v
        ]
        fehlend = [k for k in veroeffentlicht if k not in gerechnet]
        if abweichungen or fehlend:
            schlecht += 1
            print(f"WRONG   {name} does not come out of {befehl[1]} any more.")
            for a in abweichungen:
                print(f"        {a}")
            for k in fehlend:
                print(f"        {k}: published but not produced by the script")
            print(f"        Reproduce: cd docs/research/data && python3 {' '.join(befehl)}")
        else:
            print(f"ok      {name} reproduces from {befehl[1]} ({len(gerechnet)} fields)")
    # And the script the article invites a reader to run, against the same figures.
    #
    # artikel-zahlen.py carried `cut = "2026-08-20T14:59:00Z"  # 30 Tage vor dem Scan-Ende` and
    # that constant was thirteen hours early, from an older scan end. It pulled one transfer of
    # 5 USDC from 20 August into the window and printed 435.05 / 45 / 105 where the article says
    # 430.05 / 44 / 104. The article was right and its own evidence script was not, on a command
    # the article names in its last paragraph (B4). It computes the cut from the data now, and
    # this holds its output against what the README states.
    lauf = subprocess.run([sys.executable, "artikel-zahlen.py"], cwd=DATEN, capture_output=True, text=True, timeout=300)
    if lauf.returncode != 0:
        print(f"COULD NOT TELL: artikel-zahlen.py exited {lauf.returncode}: {lauf.stderr.strip()[:160]}")
        return 2
    zeile = next((z for z in lauf.stdout.splitlines() if z.startswith("Letzte 30 Tage")), "")
    readme_text = " ".join((DATEN / "README.md").read_text().split())
    zahlen = zeile.replace("Letzte 30 Tage:", "").strip().split(" USDC, ")
    if len(zahlen) != 2:
        print(f"COULD NOT TELL: artikel-zahlen.py printed no 30-day line: {zeile[:80]!r}")
        return 2
    erwartet = f"{zahlen[0].replace('.', ',')} USDC von {zahlen[1].split(' Wallets')[0]} Wallets"
    if erwartet not in readme_text:
        schlecht += 1
        print("WRONG   artikel-zahlen.py and README.md disagree about the 30-day window.")
        print(f"        the script prints {zeile.strip()}")
        print(f"        the README should therefore contain {erwartet}")
    else:
        print(f"ok      artikel-zahlen.py agrees with README.md ({erwartet})")

    code, fehlend = transfers_readme()
    if code == 2:
        print(fehlend[0])
        return 2
    if fehlend:
        schlecht += 1
        print("WRONG   README.md states figures its own transfer CSV does not produce.")
        for f in fehlend:
            print(f"        {f}")
        print("        Reproduce: the Python block in that section, on the CSV beside it.")
    else:
        print("ok      README.md reproduces the transfer CSV (months, scan end, both windows)")

    if schlecht:
        print(f"\nDATA FAILED: {schlecht} published file(s) no longer match their own source.")
        return 1
    print(f"\nDATA OK ({len(PAARE) + 2} published file(s) reproduced from the data beside them)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
