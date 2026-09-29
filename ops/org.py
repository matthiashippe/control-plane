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
# Die neunzehn Rollen der Firma, wie sie in Paperclip stehen (ORG.md).
#
# Die Liste hiess bis zum 29.09.2026 org-messer, org-nachfrage und so weiter, also nach einer
# flachen Org, die es seit dem Umbau auf CEO, CFO, CMO und CTO nicht mehr gibt. Gefunden hat das
# der Schreiber-Agent im ersten Lauf der Firma: ein Werkzeug, das gegen eine Liste prueft, prueft
# gegen nichts, sobald die Liste veraltet ist, und meldet trotzdem OK.
ROLLEN = ["CEO", "CFO", "CMO", "CTO",
          "Stabschef", "Skeptiker", "Schreiber",
          "Preise", "Kosten", "Recht",
          "Kanal", "Katalog", "Copy", "Kunde",
          "Gestalt", "Produkt", "Lieferkette", "Betrieb", "Maschinenmarkt"]
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

    # Die eine Zahl seit dem 29.09.2026: was Menschen bezahlt haben. Fehlt das Feld, gibt es den
    # Messweg noch nicht, und das ist etwas anderes als eine Null.
    zahl = markt.get("human_revenue_30d_cents")
    fehlt = "human_revenue_30d_cents" not in markt
    print("DIE ZAHL")
    print(f"  human_revenue_30d_cents = {'kein Messweg' if fehlt else zahl}")
    print("  Glieder:")
    for name, key in (
        ("Sehen      Besucher im Katalog:     ", "catalog_views_30d"),
        ("Sagen      Gespraeche zur Bestellung:", "order_chats_30d"),
        ("Bezahlen   bezahlte Bestellungen:   ", "human_orders_paid_30d"),
        ("Bekommen   Fassungen je Bestellung: ", "versions_per_order_median"),
    ):
        print(f"    {name} {markt.get(key, 'kein Messweg')}")
    print(f"    (alt) fremde Lieferungen:      {markt.get('foreign_submissions_30d', 'kein Messweg')}")
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
    if letzte and zahl is not None and not fehlt:
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
