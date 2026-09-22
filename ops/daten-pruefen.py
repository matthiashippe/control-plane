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
import os
import pathlib
import subprocess
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "docs/research/data"

# Each published dataset, and the command that has to reproduce it byte for byte.
PAIRS = [
    ("2026-09-21-x402-kennzahlen.json", ["x402-kennzahlen.py", "2026-09-21-x402-verzeichnis.csv", "--dataset"]),
]


def transfers_readme() -> tuple[int, list[str]]:
    """The figures the data README states about the transfer CSV, recomputed from that CSV.

    The README hands a reader a Python block and states what that block yields. Until 2026-09-22 the
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

    readme = DATA / "README.md"
    csv_file = DATA / "2026-09-19-conway-payto-transfers.csv"
    if not readme.exists() or not csv_file.exists():
        return 2, [f"COULD NOT TELL: {readme.name} or {csv_file.name} is missing."]
    rows = list(csv.DictReader(csv_file.open()))
    if not rows:
        return 2, [f"COULD NOT TELL: {csv_file.name} is empty."]
    text = readme.read_text()

    missing = []
    months = collections.defaultdict(lambda: [0.0, set(), 0])
    for r in rows:
        k = r["timestamp_utc"][:7]
        months[k][0] += float(r["usdc"])
        months[k][1].add(r["from"])
        months[k][2] += 1
    for k in sorted(months):
        expected = f"{k} {round(months[k][0], 2)} / {len(months[k][1])} / {months[k][2]}"
        if expected not in text:
            missing.append(f"the monthly line for {k} should read {expected}")

    end = max(r["timestamp_utc"] for r in rows)
    if f"{end[8:10]}.{end[5:7]}.{end[0:4]} {end[11:19]} UTC" not in text:
        missing.append(f"the stated scan end should be the last row of the file, {end}")
    for window_days in (30, 7):
        cutoff = (
            datetime.datetime.fromisoformat(end.replace("Z", "+00:00")) - datetime.timedelta(days=window_days)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        f = [r for r in rows if r["timestamp_utc"] >= cutoff]
        amount = f"{sum(float(r['usdc']) for r in f):.2f}".replace(".", ",")
        claim = f"letzte {window_days} Tage\n{amount} USDC von {len({r['from'] for r in f})} Wallets in {len(f)} Transfers"
        # The needle stays German because README.md is German. The README wraps its lines, so the
        # claim is checked without the line breaks.
        if " ".join(claim.split()) not in " ".join(text.split()):
            missing.append(f"the {window_days}-day window should read {' '.join(claim.split())}")
    return (1 if missing else 0), missing


def series_against_csv() -> tuple[int, list[str]]:
    """The daily series and the published CSV, for the day both describe.

    /x402 renders the time series that a cron on the VM appends to every morning. The repository
    publishes the raw scan of 21 September as a CSV and invites a reader to re-run the script on
    it. Two artefacts, one day, and nothing held them against each other: the series could drift
    from the file that is supposed to prove it, in either direction, in silence.

    This pair has already gone wrong twice. On 2026-09-22 the published CSV came from a different
    scan than the article's figures, and the kennzahlen JSON beside it kept the numbers of a third.
    Both times the mismatch was found by a reader doing arithmetic, not by us.

    Needs the VM, so it returns 2 rather than 1 when the series cannot be fetched: not being able
    to look is not a finding about the data.
    """
    import subprocess

    csvs = sorted(DATA.glob("*-x402-verzeichnis.csv"))
    if not csvs:
        return 2, ["COULD NOT TELL: no x402 directory scan is published here."]

    key = os.environ.get("CP_SSH_KEY", str(pathlib.Path.home() / ".ssh/id_ed25519_automaton"))
    host = os.environ.get("CP_HOST", "root@76.13.144.207")
    fetch = subprocess.run(
        ["ssh", "-i", key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host,
         "cat /opt/control-plane/x402/kennzahlen.ndjson"],
        capture_output=True, text=True, timeout=60,
    )
    if fetch.returncode != 0 or not fetch.stdout.strip():
        return 2, ["COULD NOT TELL: the daily series was not readable from the VM."]
    series = {}
    for line in fetch.stdout.splitlines():
        try:
            point = json.loads(line)
        except json.JSONDecodeError:
            continue
        series[point["stichtag"][:10]] = point

    missing = []
    compared = 0
    for csv_file in csvs:
        day = csv_file.name[:10]
        point = series.get(day)
        if point is None:
            continue  # A published scan from before the series existed is not a mismatch.
        proc = subprocess.run(
            [sys.executable, "x402-kennzahlen.py", csv_file.name, "--json"],
            cwd=DATA, capture_output=True, text=True, timeout=300,
        )
        if proc.returncode != 0:
            return 2, [f"COULD NOT TELL: x402-kennzahlen.py on {csv_file.name} exited {proc.returncode}."]
        from_csv = json.loads(proc.stdout)
        # `stichtag` is when the script ran, not what it measured, so it is the one field that
        # differs by design.
        for field, value in from_csv.items():
            if field == "stichtag":
                continue
            compared += 1
            if point.get(field) != value:
                missing.append(f"{day} {field}: the series says {point.get(field)!r}, the CSV gives {value!r}")
    if not compared:
        return 0, []
    return (1 if missing else 0), missing


def main() -> int:
    if not DATA.is_dir():
        print(f"COULD NOT TELL: {DATA} is not there.")
        return 2
    bad = 0
    checked = 0
    for name, command in PAIRS:
        target = DATA / name
        source = DATA / command[1]
        if not target.exists() or not source.exists():
            print(f"COULD NOT TELL: {name} or {command[1]} is missing.")
            return 2
        proc = subprocess.run([sys.executable, *command], cwd=DATA, capture_output=True, text=True, timeout=300)
        if proc.returncode != 0:
            print(f"COULD NOT TELL: {' '.join(command)} exited {proc.returncode}: {proc.stderr.strip()[:160]}")
            return 2
        try:
            recomputed = json.loads(proc.stdout)
            published = json.loads(target.read_text())
        except json.JSONDecodeError as e:
            print(f"COULD NOT TELL: {name} or the script output is not JSON: {e}")
            return 2
        # Field by field, because "the files differ" is not something a reader can act on.
        differences = [
            f"{k}: published {published.get(k)!r}, recomputed {v!r}"
            for k, v in recomputed.items()
            if published.get(k) != v
        ]
        missing = [k for k in published if k not in recomputed]
        if differences or missing:
            bad += 1
            print(f"WRONG   {name} does not come out of {command[1]} any more.")
            for a in differences:
                print(f"        {a}")
            for k in missing:
                print(f"        {k}: published but not produced by the script")
            print(f"        Reproduce: cd docs/research/data && python3 {' '.join(command)}")
        else:
            print(f"ok      {name} reproduces from {command[1]} ({len(recomputed)} fields)")
            checked += 1
    # And the script the article invites a reader to run, against the same figures.
    #
    # artikel-zahlen.py carried a hardcoded `cut = "2026-08-20T14:59:00Z"`, annotated as 30 days
    # before the scan end, and that constant was thirteen hours early, from an older scan end.
    # It pulled one transfer of 5 USDC from 20 August into the window and printed
    # 435.05 / 45 / 105 where the article says
    # 430.05 / 44 / 104. The article was right and its own evidence script was not, on a command
    # the article names in its last paragraph (B4). It computes the cut from the data now, and
    # this holds its output against what the README states.
    proc = subprocess.run([sys.executable, "artikel-zahlen.py"], cwd=DATA, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0:
        print(f"COULD NOT TELL: artikel-zahlen.py exited {proc.returncode}: {proc.stderr.strip()[:160]}")
        return 2
    line = next((z for z in proc.stdout.splitlines() if z.startswith("Letzte 30 Tage")), "")
    readme_text = " ".join((DATA / "README.md").read_text().split())
    numbers = line.replace("Letzte 30 Tage:", "").strip().split(" USDC, ")
    if len(numbers) != 2:
        print(f"COULD NOT TELL: artikel-zahlen.py printed no 30-day line: {line[:80]!r}")
        return 2
    expected = f"{numbers[0].replace('.', ',')} USDC von {numbers[1].split(' Wallets')[0]} Wallets"
    if expected not in readme_text:
        bad += 1
        print("WRONG   artikel-zahlen.py and README.md disagree about the 30-day window.")
        print(f"        the script prints {line.strip()}")
        print(f"        the README should therefore contain {expected}")
    else:
        print(f"ok      artikel-zahlen.py agrees with README.md ({expected})")
        checked += 1

    code, missing = series_against_csv()
    if code == 2:
        print(missing[0])
        return 2
    if missing:
        bad += 1
        print("WRONG   the daily series and the published CSV disagree about the same day.")
        for f in missing:
            print(f"        {f}")
        print("        One of them is what /x402 renders and the other is what a reader re-runs.")
    elif code == 0:
        print("ok      the daily series matches the published CSV on every day both describe")
        checked += 1

    code, missing = transfers_readme()
    if code == 2:
        print(missing[0])
        return 2
    if missing:
        bad += 1
        print("WRONG   README.md states figures its own transfer CSV does not produce.")
        for f in missing:
            print(f"        {f}")
        print("        Reproduce: the Python block in that section, on the CSV beside it.")
    else:
        print("ok      README.md reproduces the transfer CSV (months, scan end, both windows)")
        checked += 1

    if bad:
        print(f"\nDATA FAILED: {bad} of {checked + bad} published artefact(s) no longer match their own source.")
        return 1
    print(f"\nDATA OK ({checked} published artefact(s) held against the data beside them)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
