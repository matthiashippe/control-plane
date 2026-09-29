#!/usr/bin/env python3
"""Do paid ads pay for themselves here? The arithmetic, recomputed every time.

Matthias on 2026-09-29: "anzeigen sind ja ein klarer business case, da muss ich keine
entscheidung treffen, du musst das einfach analysieren." And, after the first answer came back
no: "jetzt geht es vielleicht noch nicht, aber in der produkt und gtm roadmap koennte es ja in der
naechsten oder uebernaechsten woche eine rolle spielen, daher einfach regelmaessig mal challengen."

That second sentence is why this file was rewritten within the hour. The first version carried the
figures of 29.09. as constants, and a calculation with its numbers walled in does not ask a
question, it repeats an answer. Everything now comes from the ledger and the access log, so the
day a customer spends more or a job is worth more, this says so by itself.

    ops/status.sh | python3 ops/anzeigen-rechnung.py
    ops/status.sh | python3 ops/anzeigen-rechnung.py --cpc 0.25
    python3 ops/anzeigen-rechnung.py --selftest

Exit 0 when the case carries at the given click price, 1 when it does not, 2 when it could not
look. An open question with a clear no is exit 1, which is the normal state and not a failure.
"""
import argparse
import json
import subprocess
import sys

MC_PER_CENT = 1000
# What the operator keeps of a job, in percent. src/bounties/store.ts FEE_PERCENT.
FEE_PERCENT = 10


def adressen_an_der_bezahlroute() -> int:
    """Foreign addresses that have ever been handed the payment offer.

    The denominator of the conversion, and it has to come from the log because a wallet that
    looked and left never appears in the database at all.
    """
    try:
        log = subprocess.run(["./ops/access-log.sh"], capture_output=True, text=True, timeout=180).stdout
    except Exception:
        return 0
    try:
        own = set(open("ops/own-ips.txt").read().split())
    except OSError:
        own = set()
    adressen = set()
    for line in log.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            d = json.loads(line)
        except Exception:
            continue
        r = d.get("request", {})
        if not (r.get("uri") or "").startswith("/pay/"):
            continue
        ip = r.get("client_ip", "")
        if ip in own or ip == "76.13.144.207":
            continue
        adressen.add(ip)
    return len(adressen)


def rechne(cpc_eur: float, wert_eur: float, konversion: float) -> dict:
    kosten = cpc_eur / konversion if konversion > 0 else float("inf")
    return {
        "kosten": kosten,
        "wert": wert_eur,
        "faktor": (kosten / wert_eur) if wert_eur > 0 else float("inf"),
        "traegt": wert_eur > 0 and kosten <= wert_eur,
    }


def selftest() -> int:
    fail = 0

    def pruefe(name, got, want):
        nonlocal fail
        if got == want:
            print(f"  ok      {name}")
        else:
            print(f"  FAILED  {name}: {got}, erwartet {want}")
            fail = 1

    # Ein Rechner, der nur Nein sagen kann, ist kein Rechner.
    pruefe("die Lage vom 29.09. traegt nicht", rechne(0.10, 0.036, 0.0087)["traegt"], False)
    pruefe("ein 200-Euro-Auftrag traegt", rechne(0.10, 20.0, 0.01)["traegt"], True)
    pruefe("genau am Break-even traegt es", rechne(1.0, 1.0, 1.0)["traegt"], True)
    pruefe("einen Schritt darueber nicht mehr", rechne(1.01, 1.0, 1.0)["traegt"], False)
    pruefe("ohne Konversion ist nichts zu holen", rechne(0.10, 5.0, 0.0)["traegt"], False)
    pruefe("ohne Wert auch nicht", rechne(0.10, 0.0, 0.5)["traegt"], False)
    print("ANZEIGEN SELFTEST OK" if fail == 0 else "ANZEIGEN SELFTEST FAILED")
    return fail


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cpc", type=float, default=0.10, help="Klickpreis in EUR")
    # EZB-Referenzkurs vom 29.09.2026. Als Schalter, damit ein anderer Tag nicht still
    # mit dem Kurs von heute rechnet.
    ap.add_argument("--fx", type=float, default=1.1355, help="USD je EUR")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()

    try:
        markt = json.load(sys.stdin)["db"]["market"]
    except Exception as exc:
        print(f"ops/status.sh gehoert auf stdin: {exc}")
        return 2

    zahler = markt.get("foreign_payers", 0)
    eingezahlt_c = markt.get("foreign_topup_mc", 0) / MC_PER_CENT
    marge_c = markt.get("foreign_margin_mc", 0) / MC_PER_CENT
    verbraucht_c = markt.get("foreign_inference_mc", 0) / MC_PER_CENT
    gesehen = adressen_an_der_bezahlroute()

    print("Anzeigen, gerechnet gegen das Hauptbuch und das Zugriffslog")
    print()
    print(f"  fremde Zahler                       {zahler}")
    print(f"  von ihnen eingezahlt                {eingezahlt_c / 100:.2f} USD")
    print(f"  davon als Marge bei uns geblieben   {marge_c:.2f} c")
    print(f"  Adressen, die das Angebot ansahen   {gesehen}")

    if zahler == 0 or gesehen == 0:
        print()
        print("  Ohne Zahler oder ohne Betrachter ist die Konversion nicht definiert.")
        print("  Das ist kein Nein, sondern ein Noch-nicht-messbar.")
        return 2

    konversion = zahler / gesehen

    # Was ein Kunde wert ist, und warum das ein Band ist und keine Zahl.
    #
    # Bis zum 29.09. stand hier `marge_c / zahler`, also nur die Marge auf dem, was schon
    # VERBRAUCHT ist. Das ist die Untergrenze und nicht der Wert: von 15,02 USD Einzahlungen sind
    # 0,41 USD verbraucht. Die restlichen 14,61 USD liegen als Guthaben bei uns, und Guthaben ist
    # nach /terms und /v1/credits/pricing nicht auszahlbar. Es ist also nicht null wert.
    #
    # Die Spanne ist ehrlich und nicht zu vermeiden: wird das Guthaben ganz verbraucht, bleibt uns
    # die gemessene Margenquote davon; wird es nie verbraucht, bleibt uns alles. Beide Enden sind
    # real, und welches gilt, weiss heute niemand. Also stehen beide da.
    margenquote = (marge_c / verbraucht_c) if verbraucht_c > 0 else 0.0
    offen_c = max(0.0, eingezahlt_c - verbraucht_c)
    tief_c = marge_c + margenquote * offen_c
    hoch_c = marge_c + offen_c

    # Und die Einheit. Das Hauptbuch rechnet in US-Cent, weil Einzahlungen in USDC kommen; der
    # Klickpreis steht in Euro. Bis zum 29.09. wurden beide direkt verglichen.
    usd_je_eur = a.fx
    tief_eur = (tief_c / 100) / usd_je_eur / zahler
    hoch_eur = (hoch_c / 100) / usd_je_eur / zahler

    print(f"  davon schon verbraucht              {verbraucht_c:.2f} c, Margenquote {margenquote * 100:.1f} %")
    print(f"  Konversion Betrachter zu Zahler     {konversion * 100:.2f} %")
    print()
    print(f"  Wert je Kunde                       {tief_eur:.2f} bis {hoch_eur:.2f} EUR")
    print(f"     untere Grenze: nur das, was vom Guthaben noch Marge wird")
    print(f"     obere Grenze:  das Guthaben wird nie verbraucht und bleibt ganz bei uns")
    print(f"     Kurs {usd_je_eur} USD je EUR")

    r_tief = rechne(a.cpc, tief_eur, konversion)
    r_hoch = rechne(a.cpc, hoch_eur, konversion)
    print(f"  Kosten je Kunde bei {a.cpc:.2f} EUR/Klick   {r_tief['kosten']:.2f} EUR")
    print()
    if r_hoch["traegt"]:
        print(f"  TRAEGT am oberen Ende des Bands.")
        return 0
    print(f"  TRAEGT NICHT, Faktor {r_hoch['faktor']:.1f} bis {r_tief['faktor']:.1f}.")
    print(f"  Ein Klick duerfte zwischen {tief_eur * konversion:.4f} und {hoch_eur * konversion:.4f} EUR kosten.")
    print()
    # Die andere Stellschraube, und die einzige, die dieses Projekt selbst drehen kann.
    noetig_eur = a.cpc / konversion
    auftrag_eur = noetig_eur / (FEE_PERCENT / 100)
    # Und die Gegenrechnung seit der Umkehrung vom 29.09.: liefern wir selbst, ist der Wert je
    # Kunde nicht die Provision, sondern fast der ganze Preis. Siehe ROADMAP.md, "Die Umkehrung".
    print(f"  Liefern wir selbst, ist der Wert je Kunde fast der ganze Auftragspreis, und ein")
    print(f"  Auftrag muesste nur rund {noetig_eur:.2f} EUR kosten statt {auftrag_eur:.0f}.")
    print(f"  Der andere Weg ist der Auftragswert. Bei {FEE_PERCENT} Prozent Provision muesste ein")
    print(f"  Auftrag rund {auftrag_eur:.0f} EUR wert sein, damit ein Klick zu {a.cpc:.2f} EUR sich")
    print(f"  bei der heutigen Konversion traegt. Offene Auftraege gerade: {markt.get('open_bounties', '?')}.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
