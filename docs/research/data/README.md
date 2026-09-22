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

Ergibt: 2026-02 37958.65 / 1582 / 6119, 2026-03 19112.44 / 581 / 1961, 2026-04 2845.0 / 198 / 461,
2026-05 1215.0 / 90 / 198, 2026-06 420.0 / 34 / 68, 2026-07 360.0 / 24 / 60,
2026-08 415.0 / 40 / 83, 2026-09 295.05 / 31 / 77.

Für die Fenster relativ zur letzten Zeile der Datei, 20.09.2026 03:55:15 UTC: letzte 30 Tage
430,05 USDC von 44 Wallets in 104 Transfers, letzte 7 Tage 70,04 USDC von 10 Wallets in 30
Transfers.

Diese drei Zeilen standen bis zum 22.09.2026 auf dem Stand **vor** dem Nachziehen von 21:45, das
drei Absätze weiter oben beschrieben ist, und das Scan-Ende war mit 19.09. 14:59 UTC um dreizehn
Stunden zu früh angesetzt. Wer den Block darüber laufen ließ, bekam andere Zahlen als die Datei,
die ihn anbietet. `ops/check-data.py` rechnet sie seither aus der CSV nach und läuft in
`ops/check-all.sh` mit.

Grenzen des Datensatzes: Er zeigt Zuflüsse an eine einzelne Adresse. Ob hinter einer Wallet ein
Mensch, ein Automat oder ein Wiederholungsversuch steht, steht nicht drin. Die hohe Zahl von
Transfers je Wallet in den letzten Monaten (zwei im Schnitt) passt zum Retry-Verhalten aus
Issue #393 und bedeutet nicht zwei Kaufentscheidungen.

## `2026-09-21-x402-verzeichnis.csv`

Beide oeffentlichen x402-Verzeichnisse, Coinbase und der PayAI-Facilitator, vollstaendig gescannt
am **21.09.2026 um 04:40:36 UTC**. 21.789 Zeilen: 15.192 aus dem Coinbase-Verzeichnis, 6.597 von
PayAI, davon 981 derselbe Dienst in beiden, also 20.789 eindeutige Dienst-URLs hinter 2.639
Anbietern.

Spalten: `verzeichnis` (cdp oder payai), `resource` (die bezahlte URL), `host`, `x402_version`,
`netzwerk`, `betrag_atomar`, `last_updated`, `last_called_at`, `calls_30d`, `unique_payers_30d`,
`hat_bazaar_block`. Die letzten drei liefert nur Coinbase, und auch dort nicht ueberall: 65 der
15.192 Eintraege tragen keine Nachfragedaten.

Reproduzierbar mit den Skripten daneben, ohne Schluessel:

```bash
python3 x402-directory-scan.py > 2026-09-21-x402-verzeichnis.csv   # neuer Scan von heute
python3 x402-metrics.py 2026-09-21-x402-verzeichnis.csv           # die Kennzahlen dieser Datei
```

**Welcher Lauf hier liegt, und warum das wichtig ist.** Bis zum 22.09.2026 lag hier die CSV eines
lokalen Laufs von 03:22 UTC, waehrend jede veroeffentlichte Zahl aus dem Cron-Scan von 04:40 kam.
78 Minuten Unterschied, und sieben der Kopfzahlen gingen auseinander: 15.189 statt 15.192, 6.594
statt 6.597, 20.783 statt 20.789, 2.636 statt 2.639, 59 statt 65 ohne Nachfragedaten und 867.827
statt 867.813 Aufrufe. Die Verteilung war in beiden identisch, bis auf die letzte Stelle. Wer
nachrechnete, bekam also andere Kopfzahlen als jeder Text, der auf diese Datei verweist, und genau
dazu laedt der Text ein. Seither liegt hier der Lauf, aus dem die veroeffentlichten Zahlen stammen,
und `ops/before-the-article.py` prueft den Text gegen diese Datei statt gegen die Zeitreihe, die er
ohnehin selbst speist.

Grenzen: Coinbase fuellt die Nachfragefelder spaet. Am 20.09. stand der groesste Dienst des ganzen
Verzeichnisses mit leeren Feldern darin und erschien einen Tag spaeter mit 346.869 Aufrufen, also
40 Prozent des Gesamtvolumens. Jede Summe aus dieser Datei ist deshalb eine Untergrenze und keine
Zaehlung. Die Verteilung ist der belastbare Teil.

## `2026-09-21-x402-kennzahlen.json`

Die Kennzahlen desselben Laufs als JSON, also das Ergebnis von `x402-metrics.py` in
maschinenlesbar. Wer nur die Verteilung braucht, nimmt diese Datei und nicht die 3,2 MB CSV.

Sie wird erzeugt, nicht getippt:

```
cd docs/research/data
python3 x402-metrics.py 2026-09-21-x402-verzeichnis.csv --dataset > 2026-09-21-x402-kennzahlen.json
```

Bis zum 22.09.2026 war sie von Hand gebaut, und genau deshalb hat sie die Korrektur der CSV nicht
ueberlebt: sie trug weiter die sieben Kopfzahlen des lokalen Laufs von 03:22 UTC, die der Abschnitt
oben als den Fehler beschreibt, waehrend dieser Abschnitt sie empfahl. `ops/check-data.py` haelt
sie seither gegen ihre eigene CSV und laeuft in `ops/check-all.sh` mit.

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
