#!/usr/bin/env python3
"""Prueft das Protokoll der Org gegen die Wirklichkeit und sagt, was jede Rolle bewegt hat.

Liest auf stdin zwei Dinge, durch eine Zeile `---` getrennt:

  1. den Report von ops/status.sh (JSON), aus dem die eine Zahl und ihre Glieder kommen
  2. das Protokoll org-log.tsv, eine Zeile je Lauf

Und aus dem Aufrufer, ueber Umgebungsvariablen:

  CP_ORG_COMMITS   die Commit-Hashes, die es wirklich gibt, einer je Zeile
  CP_ORG_HEUTE     das heutige Datum als YYYY-MM-DD

Ein Protokoll, das sich selbst misst, ist wertlos. Deshalb prueft dieses Skript jede Zeile gegen
zwei Dinge ausserhalb des Protokolls: den Commit, den sie behauptet, und die Zahl, die sie meldet.
Eine Zeile, die einen Deploy behauptet, zu dem es keinen Commit gibt, ist ein Befund und kein
Eintrag.

Exit 0, wenn das Protokoll haelt. 1, wenn mindestens eine Zeile nicht haelt. 2, wenn nicht lesbar.
"""
import json, os, sys
from datetime import date, timedelta

SPALTEN = ["datum", "glied", "rolle", "was", "commit", "zahl_danach"]
ROLLEN = ["org-messer", "org-nachfrage", "org-angebot", "org-produkt", "org-skeptiker", "org-wirt", "org-schreiber"]
# Ab wann eine Rolle auffaellt: vierzehn Tage ohne eine einzige Zeile.
STILL_TAGE = 14


def lies():
    roh = sys.stdin.read()
    if "---" not in roh:
        print("keine Trennzeile --- in der Eingabe", file=sys.stderr)
        sys.exit(2)
    kopf, rest = roh.split("---", 1)
    try:
        report = json.loads(kopf.strip())
    except Exception as e:
        print(f"Report nicht lesbar: {e}", file=sys.stderr)
        sys.exit(2)
    zeilen = []
    for i, z in enumerate(rest.strip().splitlines(), 1):
        z = z.strip()
        if not z or z.startswith("#"):
            continue
        teile = z.split("\t")
        if len(teile) != len(SPALTEN):
            print(f"Zeile {i} hat {len(teile)} Felder, erwartet {len(SPALTEN)}", file=sys.stderr)
            sys.exit(2)
        zeilen.append(dict(zip(SPALTEN, teile)))
    return report, zeilen


def main():
    report, zeilen = lies()
    markt = report.get("db", {}).get("market", {})
    heute = date.fromisoformat(os.environ.get("CP_ORG_HEUTE") or date.today().isoformat())
    commits = {c.strip() for c in os.environ.get("CP_ORG_COMMITS", "").splitlines() if c.strip()}

    zahl = markt.get("fiverr_orders_30d")
    print("DIE ZAHL")
    print(f"  fiverr_orders_30d = {zahl}")
    print("  Glieder:")
    print(f"    Nachfrage  fremde Auftraggeber:      {markt.get('foreign_buyers')}")
    print(f"    Angebot    fremde Lieferungen:       {markt.get('foreign_submissions_30d', 0)}")
    print(f"    Abschluss  Provision aus fremd (mc): {markt.get('foreign_fee_30d_mc')}")
    print()

    fehler = 0
    print("DAS PROTOKOLL")
    if not zeilen:
        print("  leer. Kein Lauf hat bisher eine Zeile geschrieben.")
    for z in zeilen:
        # Ein behaupteter Commit muss existieren. Das ist die Pruefung gegen etwas, das die Org
        # nicht selbst geschrieben hat.
        if z["commit"] not in ("-", ""):
            if z["commit"] not in commits:
                print(f"  FEHLT   {z['datum']} {z['rolle']}: Commit {z['commit']} gibt es nicht")
                fehler += 1
                continue
        if z["rolle"] not in ROLLEN:
            print(f"  FREMD   {z['datum']}: Rolle {z['rolle']} steht nicht in ORG.md")
            fehler += 1
            continue
        print(f"  ok      {z['datum']} {z['rolle']:<14} {z['was'][:52]}")

    # Die zuletzt protokollierte Zahl muss zur gemessenen passen, sonst schreibt das Protokoll
    # eine eigene Wirklichkeit fort.
    letzte = [z for z in zeilen if z["zahl_danach"] not in ("-", "")]
    if letzte and zahl is not None:
        gemeldet = letzte[-1]["zahl_danach"]
        if str(zahl) != gemeldet:
            print(f"  ABWEICHUNG  zuletzt protokolliert {gemeldet}, gemessen {zahl}")
            fehler += 1

    print()
    print("DIE ROLLEN")
    grenze = heute - timedelta(days=STILL_TAGE)
    for r in ROLLEN:
        meine = [z for z in zeilen if z["rolle"] == r]
        if not meine:
            print(f"  STILL   {r}: keine einzige Zeile")
            continue
        zuletzt = max(date.fromisoformat(z["datum"]) for z in meine)
        wie = "STILL  " if zuletzt < grenze else "ok     "
        print(f"  {wie} {r}: {len(meine)} Zeilen, zuletzt {zuletzt}")

    print()
    print("ORG OK" if fehler == 0 else f"ORG {fehler} BEFUND(E)")
    sys.exit(0 if fehler == 0 else 1)


main()
