#!/usr/bin/env python3
"""
Vergleicht zwei Verzeichnis-Scans und zeigt, was sich bewegt hat.

    python3 x402-vergleich.py alt.csv neu.csv

Eine Momentaufnahme sagt, wie der Markt aussieht. Erst der Vergleich sagt, ob er waechst, und er
beantwortet nebenbei eine Frage, die aus einem einzelnen Scan nicht zu klaeren war: Ein frisches
`last_updated` heisst nur, dass ein alter Eintrag Geschaeft gemacht hat, nicht dass er neu ist. Wer
wissen will, ob ein Facilitator ueberhaupt noch neue Verkaeufer aufnimmt, braucht zwei Punkte.
"""
import csv, collections, sys


def lies(pfad: str) -> dict:
    # Schluessel ist Verzeichnis plus URL: 983 Dienste stehen in beiden Verzeichnissen, und mit
    # der URL allein ueberschreibt der eine Eintrag den anderen. Der erste Entwurf zaehlte so
    # 20.543 statt 21.545 Zeilen, ohne dass es auffiel.
    with open(pfad) as f:
        return {(r["verzeichnis"], r["resource"]): r for r in csv.DictReader(f) if r.get("resource")}


def zahl(s) -> int:
    try:
        return int(s)
    except (TypeError, ValueError):
        return 0


def main(a_pfad: str, b_pfad: str) -> None:
    a, b = lies(a_pfad), lies(b_pfad)
    neu = [r for k, r in b.items() if k not in a]
    weg = [r for k, r in a.items() if k not in b]
    print(f"vorher {len(a)} Dienste, nachher {len(b)}  ({len(b) - len(a):+d})")
    print(f"  neu hinzugekommen: {len(neu)}")
    print(f"  verschwunden:      {len(weg)}")

    if neu:
        print("\n  Die neuen nach Verzeichnis und Protokollversion:")
        for (v, ver), n in sorted(collections.Counter((r["verzeichnis"], r["x402_version"]) for r in neu).items()):
            print(f"    {v:6} x402Version {ver}: {n}")
        print("\n  Beispiele:")
        for r in neu[:5]:
            print(f"    {r['resource'][:78]}")

    eigene = [r for r in b.values() if "hippe" in (r.get("host") or "")]
    print(f"\n  Eintraege mit unserem Host: {len(eigene)}")
    for r in eigene:
        print(f"    {r['resource']}  (x402Version {r['x402_version']}, last_updated {r['last_updated']})")

    # Nachfrage: nur Coinbase liefert sie, und nur fuer Dienste, die in beiden Scans stehen.
    beide = [(a[k], b[k]) for k in a.keys() & b.keys() if a[k]["verzeichnis"] == "cdp"]
    gestiegen = [(x, y) for x, y in beide if zahl(y["calls_30d"]) > zahl(x["calls_30d"])]
    summe_a = sum(zahl(x["calls_30d"]) for x, _ in beide)
    summe_b = sum(zahl(y["calls_30d"]) for _, y in beide)
    print(f"\n  Nachfrage ueber die {len(beide)} Dienste in beiden Scans:")
    print(f"    Aufrufe 30 Tage: {summe_a:,} -> {summe_b:,}  ({summe_b - summe_a:+,})")
    print(f"    davon mit mehr Aufrufen als vorher: {len(gestiegen)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        raise SystemExit(2)
    main(sys.argv[1], sys.argv[2])
