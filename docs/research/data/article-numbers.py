#!/usr/bin/env python3
"""The numbers from ../../artikel-agentenoekonomie.md, computed from the data set.

Call from this directory: python3 article-numbers.py
Every number that stands in the article and not in ../2026-09-19-nachfrage.md comes out here.
"""
import csv, collections, datetime

rows = list(csv.DictReader(open("2026-09-19-conway-payto-transfers.csv")))
total = sum(float(r["usdc"]) for r in rows)
wallets = {r["from"] for r in rows}
print(f"Total volume:             {total:,.2f} USDC")
print(f"Wallets in total:         {len(wallets)}")
print(f"Transfers in total:       {len(rows)}")

feb = [r for r in rows if r["timestamp_utc"][:7] == "2026-02"]
print(f"February share of volume: {sum(float(r['usdc']) for r in feb) / total * 100:.1f} %")

values = sorted(float(r["usdc"]) for r in rows)
print(f"Median transfer:          {values[len(values) // 2]:.2f} USDC")

counts = collections.Counter(r["from"] for r in rows)
print(f"Wallets with exactly one payment: {sum(1 for v in counts.values() if v == 1)}")

feb_wallets = {r["from"] for r in feb}
late_wallets = {r["from"] for r in rows if r["timestamp_utc"][:7] >= "2026-06"}
print(f"February wallets that still paid from June on: {len(feb_wallets & late_wallets)} of {len(feb_wallets)}")

last_ts = max(r["timestamp_utc"] for r in rows)
cut = (datetime.datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
       - datetime.timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
recent = [r for r in rows if r["timestamp_utc"] >= cut]
print(f"Last 30 days:             {sum(float(r['usdc']) for r in recent):.2f} USDC, "
      f"{len({r['from'] for r in recent})} wallets, {len(recent)} transfers "
      f"({len(recent) / len({r['from'] for r in recent}):.2f} payments per wallet)")
