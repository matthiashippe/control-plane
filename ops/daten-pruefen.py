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
    if schlecht:
        print(f"\nDATA FAILED: {schlecht} published dataset(s) no longer match their own source.")
        return 1
    print(f"\nDATA OK ({len(PAARE)} dataset(s) reproduced from the CSVs beside them)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
