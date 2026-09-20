#!/usr/bin/env python3
"""
Erhebt beide oeffentlichen x402-Verzeichnisse und schreibt sie als CSV.

Beide Facilitatoren veroeffentlichen ihren Katalog ohne Authentifizierung. Coinbase liefert
zusaetzlich Nachfragedaten je Dienst (Aufrufe und zahlende Wallets der letzten 30 Tage), und das
ist der eigentliche Wert: Es ist die einzige oeffentliche Quelle dafuer, wie viel in der
Agenten-Oekonomie tatsaechlich gekauft statt nur angeboten wird.

    python3 x402-verzeichnis-scan.py > 2026-09-20-x402-verzeichnis.csv

Laufzeit rund zwei Minuten, keine Schluessel noetig.
"""
import csv, json, sys, time, urllib.request

QUELLEN = {
    "cdp": "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources",
    "payai": "https://facilitator.payai.network/discovery/resources",
}
SEITE = 1000


def hole(url: str, offset: int) -> dict:
    req = urllib.request.Request(f"{url}?limit={SEITE}&offset={offset}", headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main() -> None:
    schreiber = csv.writer(sys.stdout)
    schreiber.writerow([
        "verzeichnis", "resource", "host", "x402_version", "netzwerk", "betrag_atomar",
        "last_updated", "last_called_at", "calls_30d", "unique_payers_30d", "hat_bazaar_block",
    ])
    for name, url in QUELLEN.items():
        offset, gesamt = 0, None
        while True:
            d = hole(url, offset)
            posten = d.get("items") or []
            if gesamt is None:
                gesamt = (d.get("pagination") or {}).get("total")
                print(f"# {name}: {gesamt} Eintraege", file=sys.stderr)
            if not posten:
                break
            for p in posten:
                q = p.get("quality") or {}
                a = (p.get("accepts") or [{}])[0]
                res = p.get("resource") or ""
                host = res.split("/")[2] if res.startswith("http") and len(res.split("/")) > 2 else ""
                schreiber.writerow([
                    name, res, host, p.get("x402Version"), a.get("network"),
                    a.get("maxAmountRequired") or a.get("amount"), p.get("lastUpdated"),
                    q.get("lastCalledAt"), q.get("l30DaysTotalCalls"), q.get("l30DaysUniquePayers"),
                    1 if (p.get("extensions") or {}).get("bazaar") else 0,
                ])
            offset += SEITE
            if gesamt and offset >= gesamt:
                break
            time.sleep(0.2)


if __name__ == "__main__":
    main()
