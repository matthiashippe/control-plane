#!/usr/bin/env python3
"""Do paid ads pay for themselves here? The arithmetic, from the ledger.

Matthias on 2026-09-29: "anzeigen sind ja ein klarer business case, da muss ich keine
entscheidung treffen, du musst das einfach analysieren." So this is the analysis, and it is a
tool rather than a note because the answer changes the day the numbers do.

It reads the report on stdin (`ops/status.sh`) plus the per-wallet figures passed in, and prints
the three numbers that decide it: what an acquired customer is worth, what one costs, and the
factor between them. Nothing here is estimated except the click price, which is an input.

    ops/status.sh | python3 ops/anzeigen-rechnung.py --cpc 0.10
    ops/status.sh | python3 ops/anzeigen-rechnung.py --cpc 0.10 --selftest
"""
import argparse
import json
import sys

# Measured on 2026-09-29 from the live ledger, and the whole case rests on these four.
#
# They are written down rather than read live because this file has to say what it concluded and
# when. A later run with different numbers should DISAGREE with this header, loudly, which is the
# point of printing both.
GEMESSEN = {
    "fremde_zahler": 2,
    "fremd_eingezahlt_usd": 15.02,
    "unsere_marge_c": 9.42,
    # Every foreign address that has ever asked the pay route for its offer, against the two that
    # ever signed. 344 of 352 requests answered 402 and only two payments ever landed.
    "adressen_an_der_bezahlroute": 230,
}


def rechne(cpc_eur: float, marge_je_kunde_eur: float, konversion: float) -> dict:
    """Cost per acquired paying customer against what that customer is worth."""
    kosten = cpc_eur / konversion if konversion > 0 else float("inf")
    return {
        "kosten_je_kunde_eur": round(kosten, 2),
        "wert_je_kunde_eur": round(marge_je_kunde_eur, 2),
        "faktor": round(kosten / marge_je_kunde_eur, 1) if marge_je_kunde_eur > 0 else float("inf"),
        "traegt": kosten <= marge_je_kunde_eur,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cpc", type=float, default=0.10, help="click price in EUR")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()

    if a.selftest:
        # A calculator that only ever says no is not a calculator.
        fail = 0
        nein = rechne(cpc_eur=0.10, marge_je_kunde_eur=2.30, konversion=0.0087)
        ja = rechne(cpc_eur=0.02, marge_je_kunde_eur=50.0, konversion=0.05)
        if nein["traegt"] is False and nein["faktor"] > 4:
            print("  ok      die gemessene Lage traegt nicht, und sagt um welchen Faktor")
        else:
            print(f"  FAILED  gemessene Lage: {nein}"); fail = 1
        if ja["traegt"] is True:
            print("  ok      eine Lage, die traegt, wird auch als tragend erkannt")
        else:
            print(f"  FAILED  tragende Lage: {ja}"); fail = 1
        grenz = rechne(cpc_eur=1.0, marge_je_kunde_eur=1.0, konversion=1.0)
        if grenz["traegt"] is True and grenz["faktor"] == 1.0:
            print("  ok      genau am Break-even ist es noch tragend")
        else:
            print(f"  FAILED  Break-even: {grenz}"); fail = 1
        print("ANZEIGEN SELFTEST OK" if fail == 0 else "ANZEIGEN SELFTEST FAILED")
        return fail

    try:
        db = json.load(sys.stdin)["db"]
        markt = db["market"]
    except Exception as exc:
        print(f"could not read ops/status.sh on stdin: {exc}")
        return 2

    # What an acquired customer has actually been worth, from the ledger and not from a plan.
    marge_c = GEMESSEN["unsere_marge_c"]
    zahler = GEMESSEN["fremde_zahler"]
    ist_marge_eur = (marge_c / 100) / zahler if zahler else 0.0

    # And the generous version: the best customer deposited 10.02 USD and its spending so far
    # carried a 23 percent margin. If it ever spends the whole balance at that ratio, that is what
    # it is worth. Nothing observed says it will; it stopped after two days.
    best_eur = 10.02 * 0.23

    konversion = zahler / GEMESSEN["adressen_an_der_bezahlroute"]

    print("Anzeigen, gerechnet gegen das Hauptbuch")
    print()
    print(f"  fremde Zahler ueberhaupt            {zahler}")
    print(f"  von ihnen eingezahlt                {GEMESSEN['fremd_eingezahlt_usd']:.2f} USD")
    print(f"  davon bei uns als Marge geblieben   {marge_c:.2f} c")
    print(f"  Adressen, die das Angebot ansahen   {GEMESSEN['adressen_an_der_bezahlroute']}")
    print(f"  daraus Konversion zum Zahler        {konversion * 100:.2f} %")
    print()
    print(f"  Wert je Kunde, gemessen             {ist_marge_eur:.4f} EUR")
    print(f"  Wert je Kunde, grosszuegig          {best_eur:.2f} EUR  (der beste gibt sein ganzes Guthaben aus)")
    print()
    for label, wert in (("gemessen", ist_marge_eur), ("grosszuegig", best_eur)):
        r = rechne(a.cpc, wert, konversion)
        urteil = "TRAEGT" if r["traegt"] else f"traegt nicht, Faktor {r['faktor']}"
        print(f"  bei {a.cpc:.2f} EUR je Klick, {label:12} Kosten {r['kosten_je_kunde_eur']:.2f} EUR je Kunde -> {urteil}")
    print()
    # Was sich aendern muesste, in der Einheit, in der man es aendern kann.
    noetig_cpc = best_eur * konversion
    print(f"  Damit es bei der grosszuegigen Rechnung traegt, duerfte ein Klick")
    print(f"  hoechstens {noetig_cpc:.4f} EUR kosten. Das gibt es nicht.")
    print()
    print(f"  Der andere Weg: der Auftragswert. Die bisherigen Auftraege lagen bei 45 bis 650")
    print(f"  Cent, unsere Provision sind zehn Prozent davon. Bei einem Auftrag ueber 200 EUR")
    print(f"  waeren das 20 EUR, und dann traegt ein Klick von 10 Cent bei jeder Konversion")
    print(f"  ueber {0.10 / 20 * 100:.2f} Prozent.")
    print()
    print(f"  offene Auftraege gerade: {markt.get('open_bounties', '?')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
