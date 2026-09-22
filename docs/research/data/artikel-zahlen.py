#!/usr/bin/env python3
"""Die Zahlen aus ../../artikel-agentenoekonomie.md, gerechnet aus dem Datensatz.

Aufruf aus diesem Verzeichnis: python3 artikel-zahlen.py
Jede Zahl, die im Artikel steht und nicht in ../2026-09-19-nachfrage.md, kommt hier heraus.
"""
import csv, collections, datetime

rows = list(csv.DictReader(open("2026-09-19-conway-payto-transfers.csv")))
gesamt = sum(float(r["usdc"]) for r in rows)
wallets = {r["from"] for r in rows}
print(f"Gesamtvolumen:            {gesamt:,.2f} USDC")
print(f"Wallets gesamt:           {len(wallets)}")
print(f"Transfers gesamt:         {len(rows)}")

feb = [r for r in rows if r["timestamp_utc"][:7] == "2026-02"]
print(f"Februar-Anteil am Volumen: {sum(float(r['usdc']) for r in feb) / gesamt * 100:.1f} %")

werte = sorted(float(r["usdc"]) for r in rows)
print(f"Median-Transfer:          {werte[len(werte) // 2]:.2f} USDC")

zaehler = collections.Counter(r["from"] for r in rows)
print(f"Wallets mit genau einer Zahlung: {sum(1 for v in zaehler.values() if v == 1)}")

feb_wallets = {r["from"] for r in feb}
spaet_wallets = {r["from"] for r in rows if r["timestamp_utc"][:7] >= "2026-06"}
print(f"Februar-Wallets, die ab Juni noch zahlten: {len(feb_wallets & spaet_wallets)} von {len(feb_wallets)}")

ende = max(r["timestamp_utc"] for r in rows)
cut = (datetime.datetime.fromisoformat(ende.replace("Z", "+00:00"))
       - datetime.timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
letzte = [r for r in rows if r["timestamp_utc"] >= cut]
print(f"Letzte 30 Tage:           {sum(float(r['usdc']) for r in letzte):.2f} USDC, "
      f"{len({r['from'] for r in letzte})} Wallets, {len(letzte)} Transfers "
      f"({len(letzte) / len({r['from'] for r in letzte}):.2f} Zahlungen je Wallet)")
