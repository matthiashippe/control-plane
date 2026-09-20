# Rohdaten zur Nachfragemessung vom 19.09.2026

## `2026-09-19-conway-payto-transfers.csv`

Alle USDC-Transfers an Conways payTo `0x21DD37E3E4eA6CCC0a5C98A4944702eDE6E7Be10` auf Base,
lückenlos vom 01.01.2026 bis 20.09.2026 03:55 UTC. 9.027 Zeilen, keine Duplikate.

Nachgezogen am 19.09.2026 um 21:45 (Blöcke 51.518.686 bis 51.528.050): 14 weitere Transfers über
zusammen **0,04 USDC**, alle von derselben Wallet `0x7f0376c6…d7b82`, die in hoher Frequenz
Kleinstbeträge schickt. In fünf Stunden kam also von niemand anderem Geld. Falle dabei: Der
öffentliche RPC antwortet auf Pythons Standard-User-Agent mit 403, ein eigener `User-Agent`-Header
behebt das. Der erste
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

## Lizenz

CC0 1.0 Universal, siehe `LICENSE.md` in diesem Verzeichnis. Das weicht bewusst von der
PolyForm-Noncommercial-Lizenz des Repositorys ab: Ein Beleg, den kommerzielle Leser nicht
verwenden dürfen, ist als Beleg wertlos.

## `2026-09-20-betroffene-accounts-90-tage.csv`

Jede einzelne Wortmeldung, aus der die Zahl in `../2026-09-20-wo-die-betroffenen-sind.md` besteht.
57 Zeilen, 46 eindeutige Accounts, Fenster 22.06.2026 bis 20.09.2026.

Spalten: `ring` (Kern, Rand, Handelnd), `account`, `datum`, `beleg` (Art des Beitrags), `url`
(direkter Link auf Issue, Kommentar oder Commit).

`Kern` sind die 27 Accounts, die über die kaputte Anmeldung geschrieben haben; `Rand` die 9 zu
anderen Ausfällen derselben Plattform; `Handelnd` die 10, die keine Frage gestellt, sondern Code
gegen das Problem committet haben. Bots mit Bot-Kennung und unsere eigenen Beiträge sind nicht
enthalten. Abzuziehen sind `babu234-del` und `mesikewisdom19-source` als Rauschen, womit 25
belastbare Accounts im Kern bleiben.

Nachzählen:

```
awk -F, 'NR>1 {print $2}' 2026-09-20-betroffene-accounts-90-tage.csv | sort -u | wc -l   # 46
awk -F, 'NR>1 && $1=="Kern" {print $2}' 2026-09-20-betroffene-accounts-90-tage.csv | sort -u | wc -l  # 27
```
