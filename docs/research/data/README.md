# Rohdaten zur Nachfragemessung vom 19.09.2026

## `2026-09-19-conway-payto-transfers.csv`

Alle USDC-Transfers an Conways payTo `0x21DD37E3E4eA6CCC0a5C98A4944702eDE6E7Be10` auf Base,
lückenlos vom 01.01.2026 bis 19.09.2026 14:59 UTC. 9.012 Zeilen, keine Duplikate. Der erste
Transfer im Zeitraum fällt auf den 01.02.2026 13:33:45 UTC, im Januar gab es keinen.

Spalten: `block`, `timestamp_utc`, `from` (zahlende Wallet), `usdc` (Betrag, sechs Dezimalstellen),
`tx_hash`.

Erhoben über `eth_getLogs` gegen `https://mainnet.base.org` in 5.652 Chunks à 2.000 Blöcke
(Contract `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, Topic0 der Transfer-Event-Signatur,
Topic2 die payTo-Adresse). Der Vollscan dauert rund 30 Minuten, weil der öffentliche RPC bei
schnellen Schleifen "over rate limit" wirft. Deshalb liegt das Ergebnis hier und muss für eine
Nachrechnung nicht wiederholt werden.

Die Auswertung in `../2026-09-19-nachfrage.md`, Abschnitt F1, ist aus genau dieser Datei
reproduzierbar:

```python
import csv, collections, datetime
rows = list(csv.DictReader(open("2026-09-19-conway-payto-transfers.csv")))
m = collections.defaultdict(lambda: [0.0, set(), 0])
for r in rows:
    k = r["timestamp_utc"][:7]
    m[k][0] += float(r["usdc"]); m[k][1].add(r["from"]); m[k][2] += 1
for k in sorted(m):
    print(k, round(m[k][0], 2), len(m[k][1]), m[k][2])
```

Ergibt: 2026-02 37958.65 / 1582 / 6119, 2026-03 19112.44 / 581 / 1961, 2026-04 2845.00 / 198 / 461,
2026-05 1215.00 / 90 / 198, 2026-06 420.00 / 34 / 68, 2026-07 360.00 / 24 / 60,
2026-08 415.00 / 40 / 83, 2026-09 (bis 19.) 290.01 / 30 / 62.

Für die Fenster relativ zum Scan-Ende 19.09.2026 14:59 UTC: letzte 30 Tage 430,01 USDC von
44 Wallets in 90 Transfers, letzte 7 Tage 70,00 USDC von 10 Wallets in 16 Transfers.

Grenzen des Datensatzes: Er zeigt Zuflüsse an eine einzelne Adresse. Ob hinter einer Wallet ein
Mensch, ein Automat oder ein Wiederholungsversuch steht, steht nicht drin. Die hohe Zahl von
Transfers je Wallet in den letzten Monaten (zwei im Schnitt) passt zum Retry-Verhalten aus
Issue #393 und bedeutet nicht zwei Kaufentscheidungen.

## `2026-09-20-x402-sellers-7d.csv` und `x402-sellers-scan.py`

Zuflussmessung für 19 x402-Verkäufer-Wallets auf Base über sieben Tage, Grundlage von
`../2026-09-20-x402-gateway.md`, Abschnitt G1. Erhoben am 19.09.2026 ab 19:15 UTC in zwei Läufen
(Head-Block 51.528.083 und 51.528.206, Fenster je 302.400 Blöcke, 152 Chunks à 2.000 Blöcke,
kein fehlgeschlagener Chunk, zusammen 153.705 Transfer-Events).

Spalten: `seller_address` (payTo aus dem jeweiligen Zahlungsmanifest des Dienstes),
`name`, `transfers_7d`, `usdc_7d`, `unique_payers_7d`.

Adressauswahl: Rang 1 bis 10 des on-chain erhobenen Verkäufer-Rankings von
`https://agent402.tools/api/leaderboard` (Abruf 19.09.2026 18:20 UTC), Conways payTo als Referenz
zur Vorgängermessung, dazu neun selbst geprüfte Dienste mit Prepaid- oder Bündelabrechnung, deren
payTo aus `/.well-known/x402` beziehungsweise aus der 402-Antwort stammt.

Wiederholung mit `python3 x402-sellers-scan.py 302400` (rund fünf Minuten, das Skript enthält die
Adressliste im Kopf). Der öffentliche RPC `mainnet.base.org` begrenzt `eth_getLogs` auf 2.000
Blöcke und antwortet Python-urllib ohne User-Agent nicht, deshalb der curl-UA im Header. Alle
Adressen stehen als OR-Liste in `topics[2]`, damit ein Durchlauf für alle Verkäufer reicht.

Gegenprobe zur Fremdquelle am selben Tag: AX1 Console 104.682 Zahlungen und 2.093,64 USDC
gegenüber 104.477 und 2.089,54 USD im Leaderboard, StableEnrich 10.911 und 395,57 gegenüber
10.943 und 395,82. Die Abweichung bei BlockRun.AI (248,86 gegenüber 207,30) kommt daher, dass das
Leaderboard Einzelzahlungen über 0,75 USD abschneidet.

Grenzen: Gemessen sind Zuflüsse an einzelne Adressen auf Base. Wer über mehrere Wallets oder auf
Solana abrechnet, erscheint zu klein. Sieben Tage sind kurz genug, dass ein einzelner Großkäufer
das Bild kippt.
