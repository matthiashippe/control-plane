#!/usr/bin/env python3
"""
Rechnet die Kennzahlen zur x402-Nachfrage aus dem Verzeichnis-Scan.

    python3 x402-kennzahlen.py 2026-09-20-x402-verzeichnis.csv

Jede Zahl, die im Artikel steht, kommt aus diesem Skript. Wer sie anzweifelt, laesst es laufen.
"""
import csv, collections, datetime, statistics, sys

STICHTAG = datetime.datetime(2026, 9, 20, tzinfo=datetime.timezone.utc)


def zahl(s: str):
    return int(s) if s not in ("", None) else None


def main(pfad: str) -> None:
    zeilen = [r for r in csv.DictReader(open(pfad))]
    cdp = [r for r in zeilen if r["verzeichnis"] == "cdp"]
    payai = [r for r in zeilen if r["verzeichnis"] == "payai"]
    print(f"Dienste gesamt: {len(zeilen)}  (Coinbase {len(cdp)}, PayAI {len(payai)})")
    print(f"Verschiedene Anbieter (Host): {len({r['host'] for r in zeilen if r['host']})}")
    print()

    calls = [zahl(r["calls_30d"]) for r in cdp]
    payer = [zahl(r["unique_payers_30d"]) for r in cdp]
    mit = [c for c in calls if c is not None]
    print(f"Nur Coinbase liefert Nachfragedaten: {len(mit)} von {len(cdp)} Diensten")
    print(f"  Aufrufe in 30 Tagen, Summe:  {sum(mit):,}")
    print(f"  Median je Dienst:            {statistics.median(mit):g}")
    srt = sorted(mit, reverse=True)
    for n in (10, 100):
        print(f"  Anteil der groessten {n:>3}:     {sum(srt[:n])/sum(mit)*100:.1f} %")
    print()

    eimer = collections.Counter()
    for c in mit:
        eimer["0" if c == 0 else "1-9" if c < 10 else "10-99" if c < 100 else "100-999" if c < 1000 else "1000+"] += 1
    print("  Aufrufe je Dienst in 30 Tagen:")
    for k in ("0", "1-9", "10-99", "100-999", "1000+"):
        print(f"    {k:>8}: {eimer[k]:6}  {eimer[k]/len(mit)*100:5.1f} %")
    print()

    p = [x for x in payer if x is not None]
    eins = [(zahl(r["calls_30d"]) or 0) for r in cdp if zahl(r["unique_payers_30d"]) == 1]
    print(f"  Dienste mit genau EINER zahlenden Wallet: {len(eins)}  ({len(eins)/len(p)*100:.1f} %)")
    print(f"    davon mit hoechstens 3 Aufrufen:        {sum(1 for c in eins if c <= 3)}"
          f"  ({sum(1 for c in eins if c <= 3)/len(eins)*100:.1f} % dieser Gruppe)")
    for grenze in (5, 20, 100):
        n = sum(1 for x in p if x >= grenze)
        print(f"  Dienste mit mindestens {grenze:>3} Zahlern:      {n:6}  ({n/len(p)*100:.2f} %)")
    print()

    alter = collections.Counter()
    for r in cdp:
        t = r["last_called_at"]
        if not t:
            alter["nie"] += 1
            continue
        d = (STICHTAG - datetime.datetime.fromisoformat(t.replace("Z", "+00:00"))).days
        alter["heute" if d < 1 else "7 Tage" if d < 7 else "30 Tage" if d < 30 else "aelter"] += 1
    print("  Zuletzt aufgerufen:")
    for k in ("heute", "7 Tage", "30 Tage", "aelter", "nie"):
        if alter[k]:
            print(f"    {k:>8}: {alter[k]:6}  {alter[k]/len(cdp)*100:5.1f} %")
    print()
    bz = sum(1 for r in zeilen if r["hat_bazaar_block"] == "1")
    print(f"  Mit eigener bazaar-Deklaration: {bz}  ({bz/len(zeilen)*100:.1f} %)")
    conway = [r for r in zeilen if "conway" in (r["resource"] or "").lower()]
    print(f"  Mit Bezug zur Conway-Runtime:   {len(conway)}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "2026-09-20-x402-verzeichnis.csv")
