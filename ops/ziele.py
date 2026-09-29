#!/usr/bin/env python3
"""Every goal and every sub-goal, as a verdict per number.

Reads two JSON documents from stdin, one after the other: `/v1/status` and the output of
`ops/status.sh`. `ops/ziele.sh` fetches them; this file only judges, so the judging can be put in
front of planted numbers without touching the network. See that file's header for why this exists.
"""
import json
import os
import sys

GREEN, RED, GREY = "OK    ", "OFFEN ", "----  "


def read_two(raw):
    """Two JSON objects concatenated. Returns both, or raises."""
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
    listed = int(os.environ.get("CP_ZIELE_LISTED_N", "0"))
    base = os.environ.get("CP_URL", "https://postyourprice.com")
    offen = 0

    def pruefe(name, ist, ziel, note=""):
        nonlocal offen
        ok = ist >= ziel
        if not ok:
            offen += 1
        print(f"  {GREEN if ok else RED}{name:<48} Ziel {str(ziel):<12} ist {ist}")
        if note and not short:
            print(f"          {note}")

    def ziel(datum, titel):
        print()
        print(f"{datum}  {titel}")

    paying = status.get("paying_wallets", {}).get("not_ours", 0)
    thinking = status.get("thinking_wallets", {}).get("not_ours", 0)
    gmv_c = market.get("foreign_gmv_30d_mc", 0) // 1000
    fee_c = market.get("foreign_fee_30d_mc", 0) // 1000

    print(f"Ziele und Teilziele, gemessen gegen {base}")

    ziel("26.09.", "Der erste fremde Kaeufer")
    pruefe("zahlende fremde Wallets", paying, 5, "paying_wallets.not_ours")
    pruefe("Auftrag, Kaeufer und Gewinner beide fremd", market.get("foreign_buyers", 0), 1,
           "foreign_buyers zaehlt erst, wenn der Kaeufer selbst eingezahlt hat")

    ziel("02.10.", "Im Verzeichnis stehen und benutzt werden")
    pruefe("Zeilen mit unserem Host im Tagesscan", listed, 1, "ops/own-x402-listing.sh")
    pruefe("fremde Wallets, die hier gerechnet haben", thinking, 25, "thinking_wallets.not_ours")

    ziel("29.10.", "5.000 USDC fremdes Auftragsvolumen im Monat")
    pruefe("foreign_gmv_30d in Cent", gmv_c, 500000, "fremd eingezahlt, geliefert, vergeben")
    pruefe("foreign_fee_30d in Cent", fee_c, 50000)

    ziel("31.12.", "250.000 USDC im Monat")
    pruefe("foreign_gmv_30d in Cent", gmv_c, 25000000,
           "ZIELE.md sagt selbst: das 568-fache des gemessenen Marktes")

    print()
    print("Teilziele, die der Loop allein bewegt")
    pruefe("Arbeit auf dem Brett", market.get("open_bounties", 0), 1,
           "ein leeres Brett bricht die Zusage auf der Startseite")
    pruefe("Startertopf traegt Neuankoemmlinge", market.get("starter_grants_left", 0), 1,
           "leer heisst: der naechste fremde Agent bekommt nichts")
    pruefe("Schluesselnamen alle klassifiziert",
           0 if market.get("unclassified_key_names") else 1, 1,
           "ein unbekannter Name faelscht jede Zahl ueber den Markt")
    pruefe("keine eigenen Einsendungen auf fremden Auftraegen",
           0 if market.get("stray_submissions_on_open", 0) else 1, 1)

    print()
    print("Sperren, die nur Matthias loesen kann (ZIELE.md)")
    for name in [
        "Issue-Antworten raus",
        "Der Name und die Domain",
        "Stripe: Gewerbe, Steuer, Vertragspartner",
        "Caddyfile-Patch",
        "21,92 USDC ohne Gas",
        "Search Console und Bing",
        "Eine Zahl fuer Anzeigen",
    ]:
        print(f"  {GREY}{name}")

    print()
    print("ALLE ZIELE ERREICHT" if offen == 0 else f"OFFEN: {offen} Zielzahl(en)")
    return 0 if offen == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
