# Trichter neuer Conway-Runtimes

Erste Messung des Blocks `runtime_funnel` aus `ops/db-report.cjs` (kunden 03). Eine neue Runtime ist eine fremde Adresse mit einem
Schlüssel `conway-automaton`; sie zählt in der Woche ihres ersten solchen Schlüssels, und je Stufe zählt, ob es bis zum Ende des
Fensters eine Startgutschrift (Ledger `grant`), Inferenz (Ledger `inference`) oder eine Zahlung (`payments`, `settled`) gab. Im Repo
stehen nur Zählungen, keine Adresse.

Gemessen: 2026-11-19T20:46:11Z

Befehl auf dem code-host nach `set -a; . ~/.config/control-plane/loop.env; set +a`, nur lesend:

bash ops/status.sh | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["db"]["runtime_funnel"]))'

```
{"until": "2026-11-19T20:00:00.000Z", "weeks": [{"from": "2026-11-12T20:00:00.000Z", "to": "2026-11-19T20:00:00.000Z", "keys": 3, "starter_credit": 2, "inference": 2, "paid": 1}, {"from": "2026-11-05T20:00:00.000Z", "to": "2026-11-12T20:00:00.000Z", "keys": 4, "starter_credit": 3, "inference": 3, "paid": 2}, {"from": "2026-10-29T20:00:00.000Z", "to": "2026-11-05T20:00:00.000Z", "keys": 1, "starter_credit": 1, "inference": 1, "paid": 0}, {"from": "2026-10-22T20:00:00.000Z", "to": "2026-10-29T20:00:00.000Z", "keys": 1, "starter_credit": 0, "inference": 0, "paid": 0}], "total": {"keys": 9, "starter_credit": 6, "inference": 6, "paid": 3}, "largest_drop": {"stage": "starter_credit", "lost": 3}}
```

## Wochen

- Woche 2026-11-12T20:00:00.000Z bis 2026-11-19T20:00:00.000Z: 3 neue Runtimes, 2 mit Startgutschrift, 2 mit Inferenz, 1 mit Zahlung
- Woche 2026-11-05T20:00:00.000Z bis 2026-11-12T20:00:00.000Z: 4 neue Runtimes, 3 mit Startgutschrift, 3 mit Inferenz, 2 mit Zahlung
- Woche 2026-10-29T20:00:00.000Z bis 2026-11-05T20:00:00.000Z: 1 neue Runtimes, 1 mit Startgutschrift, 1 mit Inferenz, 0 mit Zahlung
- Woche 2026-10-22T20:00:00.000Z bis 2026-10-29T20:00:00.000Z: 1 neue Runtimes, 0 mit Startgutschrift, 0 mit Inferenz, 0 mit Zahlung

Leitzahl: 3 von 9 neuen Runtimes der letzten vier Wochen haben gezahlt

Verlust je Stufe über die vier Wochen: Startgutschrift 3 (9 auf 6), Inferenz 0 (6 auf 6), Zahlung 3 (6 auf 3). Bei Gleichstand nennt
der Block die frühere Stufe. Wer eine Startgutschrift bekommt, denkt auch; der Bruch liegt davor und danach.

## Abgleich mit dem Richtungs-Check

Der Richtungs-Check vom 19.11. nannte für die Woche ab 12.11. zehn neue Runtimes, der Trichter drei. Nachgezählt am 2026-11-19 um
20:47 UTC mit einer nur lesenden Abfrage im Container (nur Zählungen): In dieser Woche entstanden 9 Schlüssel `conway-automaton` an
4 Adressen, 3 dieser Adressen hatten dort ihren ersten solchen Schlüssel, und keine trägt einen Schlüsselnamen aus `OUR_KEY_NAMES`.
Der Richtungs-Check hat Schlüssel gezählt, der Trichter zählt Runtimes; eine Runtime, die sich neu anmeldet, bekommt jedes Mal einen
neuen Schlüssel. Die 3 stimmen unabhängig mit Woche 1 überein.

## Die Stufe mit dem größten Verlust

Nachgezählt in derselben Abfrage über die 9 Runtimes: Die 3 ohne Startgutschrift haben keine einzige Ledger-Zeile, eine hat den
Saldo gelesen, aber nicht dreimal über mehr als eine Minute, zwei nie. Der Pool hatte noch Platz für 71 Gutschriften. Laut Code
(`src/credits/starter.ts`, `grantOnFirstUse` und `grantToWaitingRuntime`) gibt es die Gutschrift erst beim ersten Inferenz-Aufruf
ohne Guthaben oder beim dritten Lesen eines leeren Saldos nach mehr als einer Minute. Diese drei Runtimes sind also gegangen, bevor
einer der beiden Auslöser griff, nicht wegen eines leeren Pools.

Ergebnis: größter Verlust bei starter_credit (3 verloren), Vorschlag goals/_vorschlaege/kunden-trichter-2026-11-19-1.md
