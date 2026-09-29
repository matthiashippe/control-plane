#!/usr/bin/env python3
"""Jede Zielzahl als Urteil, gemessen und nicht behauptet.

Liest zwei JSON-Dokumente von stdin, hintereinander: `/v1/status` und die Ausgabe von
`ops/status.sh`. `ops/ziele.sh` holt sie; diese Datei urteilt nur, damit das Urteilen vor
gepflanzte Zahlen gestellt werden kann, ohne das Netz zu berühren.

**Drei Zustände, nicht zwei.** Neu am 29.09.2026 mit den neuen Zielen: eine Zahl, für die es noch
keinen Messweg gibt, ist nicht 0. Sie ist unbekannt, und das steht auch so da. Der Unterschied
zählt, weil 0 eine Aussage über den Markt ist und "kein Messweg" eine über uns: das erste ist ein
Ergebnis, das zweite ist die nächste Aufgabe. Die alte Fassung hätte für jede Bestellzahl eine
saubere 0 gemeldet, obwohl es die Tabelle dafür noch gar nicht gibt.
"""
import json
import os
import sys

from katalog_pruefung import ANGEBOTE, UNTERGRENZE

GREEN, RED, GREY, UNK = "OK    ", "OFFEN ", "----  ", "?     "


def read_two(raw):
    """Zwei aneinandergehängte JSON-Objekte. Gibt beide zurück, oder wirft."""
    dec = json.JSONDecoder()
    first, idx = dec.raw_decode(raw.lstrip())
    second, _ = dec.raw_decode(raw.lstrip()[idx:].lstrip())
    return first, second


def main():
    raw = sys.stdin.read()
    try:
        status, report = read_two(raw)
        market = report["db"]["market"]
    except Exception as exc:
        print(f"could not read the two documents: {exc}")
        return 2

    short = os.environ.get("CP_ZIELE_SHORT") == "1"
    base = os.environ.get("CP_URL", "https://postyourprice.com")
    # Was ops/ziele.sh per HTTP gemessen hat, weil es nicht in der Datenbank steht.
    def http(name):
        v = os.environ.get(name)
        return None if v in (None, "") else int(v)

    offen = 0
    unbekannt = 0

    def pruefe(name, ist, ziel, note=""):
        """Ein Urteil. `ist` darf None sein: dann gibt es keinen Messweg, und das ist kein Nullwert."""
        nonlocal offen, unbekannt
        if ist is None:
            unbekannt += 1
            offen += 1
            print(f"  {UNK}{name:<48} Ziel {str(ziel):<10} kein Messweg")
            if note and not short:
                print(f"          {note}")
            return
        ok = ist >= ziel
        if not ok:
            offen += 1
        print(f"  {GREEN if ok else RED}{name:<48} Ziel {str(ziel):<10} ist {ist}")
        if note and not short:
            print(f"          {note}")

    def neben(name, wert):
        """Eine Zahl ohne Urteil: sie sagt, woran es liegt, und ist selbst kein Ziel."""
        print(f"  {GREY}{name:<48} {'kein Messweg' if wert is None else wert}")

    def ziel(datum, titel):
        print()
        print(f"{datum}  {titel}")

    def feld(key):
        """Ein Feld aus dem Report, oder None, wenn es den Messweg noch nicht gibt."""
        return market.get(key) if key in market else None

    print(f"Ziele, gemessen gegen {base}")

    ziel("02.10.", "Ein Mensch kann hier kaufen, ohne Wallet")
    # Die Beschriftung liest die Grenzen aus der Pruefung selbst. Bis zum 29.09.2026 stand hier
    # "mindestens einen Preis ueber 11 EUR", waehrend die Pruefung schon drei ab 11,13 EUR und den
    # Liefersatz verlangte (HAN-20).
    untergrenze = f"{UNTERGRENZE:.2f}".replace(".", ",")
    pruefe(f"Katalog mit {ANGEBOTE} Angeboten ab {untergrenze} EUR", http("CP_ZIELE_KATALOG"), 1,
           f"GET /katalog nennt mindestens {ANGEBOTE} Preise ab {untergrenze} EUR und den Liefersatz")
    pruefe("Gespraech, das eine Bestellung erzeugt", http("CP_ZIELE_CHAT"), 1,
           "ein Gespraech nimmt Anforderungen auf und macht daraus eine Bestellung")
    pruefe("Bezahlweg ohne Wallet", http("CP_ZIELE_KARTE"), 1,
           "POST /katalog/kaufen antwortet 303 auf Stripes Kasse, ohne Wallet und ohne USDC")

    ziel("10.10.", "Der erste zahlende Mensch")
    pruefe("bezahlte Bestellungen von Menschen (30 Tage)", feld("human_orders_paid_30d"), 1,
           "eine Bestellung, die ein Mensch bezahlt hat, nicht eine Wallet")
    neben("  davon ueber 11 EUR", feld("human_orders_above_floor_30d"))

    ziel("31.10.", "Zehn Menschen, 500 EUR im Monat")
    pruefe("zahlende Menschen (30 Tage)", feld("human_buyers_30d"), 10)
    pruefe("Umsatz in Cent (30 Tage)", feld("human_revenue_30d_cents"), 50000)

    ziel("31.12.", "5.000 EUR im Monat, und ein fremder Agent liefert")
    pruefe("Umsatz in Cent (30 Tage)", feld("human_revenue_30d_cents"), 500000)
    pruefe("fremde Lieferungen (30 Tage)", feld("foreign_submissions_30d"), 1,
           "bisher 0 von 37 Einsendungen, alle von unseren eigenen Adressen")

    print()
    print("Die drei Versprechen, je Bestellung gemessen")
    pruefe("Fassungen je Bestellung (Median)", feld("versions_per_order_median"), 3,
           "Auswahl ist das halbe Versprechen: eine Fassung ist keine Auswahl")
    pruefe("Bestellungen mit mindestens einer Runde", feld("orders_with_a_round_30d"), 1,
           "Rueckmeldung als Text, bis zu vier Runden, der Preis steigt nicht")
    # Schnell ist die einzige Zahl, bei der klein besser ist, also steht sie ohne Urteil da und
    # bekommt ihre Schwelle erst, wenn es ueberhaupt eine Bestellung gibt, an der man sie misst.
    neben("Minuten bis zur ersten Fassung (Median)", feld("minutes_to_first_version_median"))

    print()
    print("Die Angebotsseite, die schon zahlt")
    pruefe("abgerechnete Zahlungen von Nicht-Conway-Clients",
           feld("settled_payments_non_conway"), 1,
           "@x402/core verwirft jedes Angebot ueber einem Dollar vor dem Signieren")
    neben("  abgerechnete fremde Zahlungen insgesamt", feld("settled_payments_foreign"))
    neben("  fremde Wallets, die hier gerechnet haben",
          status.get("thinking_wallets", {}).get("not_ours"))

    print()
    print("Teilziele, die der Loop allein bewegt")
    pruefe("Arbeit auf dem Brett", feld("open_bounties"), 1,
           "ein leeres Brett bricht die Zusage auf der Startseite")
    pruefe("Startertopf traegt Neuankoemmlinge", feld("starter_grants_left"), 1)
    pruefe("Schluesselnamen alle klassifiziert",
           None if "unclassified_key_names" not in market
           else (0 if market["unclassified_key_names"] else 1), 1,
           "ein unbekannter Name faelscht jede Zahl ueber den Markt")
    pruefe("keine eigenen Einsendungen auf fremden Auftraegen",
           None if "stray_submissions_on_open" not in market
           else (0 if market["stray_submissions_on_open"] else 1), 1)

    print()
    if offen == 0:
        print("ALLE ZIELE ERREICHT")
    elif unbekannt:
        print(f"OFFEN: {offen} Zielzahl(en), davon {unbekannt} ohne Messweg")
    else:
        print(f"OFFEN: {offen} Zielzahl(en)")
    return 0 if offen == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
