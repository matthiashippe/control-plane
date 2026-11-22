Schwere: 2
Goal: abrechnung 07
Befund: Die Regel nach außen erlaubt die Quote allein „für einen Zeitraum ohne Ausfall“, aber kein Werkzeug sagt, ob ein Zeitraum einen Ausfall hatte: `ops/answer-quote.sh` nennt nur die Zahl je Status, nicht die Stunden mit 5xx, also prüft kanal die Regel von Hand oder gar nicht.
Beleg: `grep -c "hour" ops/answer-quote.sh` -> 0 | docs/abrechnung/timeouts.md:147
Empfehlung: Erst wenn kanal oder die Seite eine Quote nach außen nennen soll: `ops/answer-quote.sh` gibt zusätzlich eine Zeile `outage hours: <n>` aus (Stunden mit mindestens einem 5xx auf `POST /v1/chat/completions` im Zeitraum, dazu erste und letzte), Selftest-Fall mit zwei 503 in derselben Stunde und einem in der nächsten (ergibt 2), rot vor dem Fix. Heute nennt keine Antwort aus kanal eine Quote, darum kein eigenes Goal vorher.
MVP: Schönheit, weil heute keine Zahl aus `docs/abrechnung/timeouts.md` nach außen geht.

Übernommen: Watch List in STATE.md, bis kanal oder die Seite eine Quote nach außen nennt (2026-11-22)
