# Besucheradressen in den Logs der Actions

Bis zum 12.11.2026 schrieb `ops/deploy-window.sh` unter `AFFECTED` die Adresse jedes betroffenen Besuchers, und `deploy.yml` legte
diese Ausgabe in die Logs der Actions dieses öffentlichen Repos. GitHub hält solche Logs 90 Tage lesbar, die Datenschutzerklärung der
Seite sagt die Löschung nach 30 Tagen zu. Diese Datei hält nur Zahlen fest, nie eine Adresse. Gezählt wird mit
`ops/actions-log-addresses.sh` (Regeln in `ops/README.md`): fremd ist eine Adresse in einer Zeile einer Anfrage, die in keiner der
Listen `ops/own-ips.txt`, `ops/known-ips.txt` und `ops/crawler-ips.txt` steht und in keinem privaten Bereich liegt. Dass der Zähler
einen gepflanzten Treffer findet und eine eigene Adresse auslässt, zeigen die zweite Prüfung von Punkt 1 des Goals und
`test/actions-log-addresses.test.ts`.

## Zählung vor dem Löschen

```
bash ops/actions-log-addresses.sh --runs 42879222074,42895005251,43164473390,43260817090,43277458881,43322130930
```

Gemessen: 2026-11-14 02:18 UTC

42879222074 0
42895005251 1
43164473390 1
43260817090 1
43277458881 2
43322130930 1
total 2

Je Zeile die Lauf-ID und die Zahl verschiedener fremder Adressen in ihrem Log, `total` zählt verschiedene über alle sechs. Alle sechs
Läufe lieferten noch ein Log.

```
bash ops/actions-log-addresses.sh --workflow deploy.yml
```

Läufe von deploy.yml mit fremden Adressen: 5 von 112

Gemessen um 02:20 UTC am selben Tag. Es sind genau fünf der sechs Läufe oben; kein anderer der 112 Läufe trägt eine fremde Adresse,
einer davon (42839001716) liefert schon kein Log mehr. Die Zählung ist nicht 0, also bleibt das Löschen am Human Gate `delete_data`.
