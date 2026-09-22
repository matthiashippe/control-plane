#!/usr/bin/env python3
"""
Collects both public x402 directories and writes them as a CSV.

Both facilitators publish their catalogue without authentication. Coinbase additionally supplies
per-service demand data (calls and paying wallets over the last 30 days), and that is the real
value: it is the only public source for how much in the agent economy is actually bought instead
of merely offered.

    python3 x402-verzeichnis-scan.py > 2026-09-20-x402-verzeichnis.csv

Runtime about two minutes, no keys needed.
"""
import csv, json, sys, time, urllib.request

SOURCES = {
    "cdp": "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources",
    "payai": "https://facilitator.payai.network/discovery/resources",
}
PAGE_SIZE = 1000


def fetch(url: str, offset: int) -> dict:
    req = urllib.request.Request(f"{url}?limit={PAGE_SIZE}&offset={offset}", headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main() -> None:
    writer = csv.writer(sys.stdout)
    # The column names stay German: they are the header of the CC0 files in this directory, which
    # are published and documented in README.md, and x402-kennzahlen.py reads them by these names.
    # Renaming one here would make every CSV published so far unreadable for the script beside it.
    writer.writerow([
        "verzeichnis", "resource", "host", "x402_version", "netzwerk", "betrag_atomar",
        "last_updated", "last_called_at", "calls_30d", "unique_payers_30d", "hat_bazaar_block",
    ])
    for name, url in SOURCES.items():
        offset, total = 0, None
        while True:
            d = fetch(url, offset)
            items = d.get("items") or []
            if total is None:
                total = (d.get("pagination") or {}).get("total")
                print(f"# {name}: {total} entries", file=sys.stderr)
            if not items:
                break
            for p in items:
                q = p.get("quality") or {}
                a = (p.get("accepts") or [{}])[0]
                res = p.get("resource") or ""
                host = res.split("/")[2] if res.startswith("http") and len(res.split("/")) > 2 else ""
                writer.writerow([
                    name, res, host, p.get("x402Version"), a.get("network"),
                    a.get("maxAmountRequired") or a.get("amount"), p.get("lastUpdated"),
                    q.get("lastCalledAt"), q.get("l30DaysTotalCalls"), q.get("l30DaysUniquePayers"),
                    1 if (p.get("extensions") or {}).get("bazaar") else 0,
                ])
            offset += PAGE_SIZE
            if total and offset >= total:
                break
            time.sleep(0.2)


if __name__ == "__main__":
    main()
