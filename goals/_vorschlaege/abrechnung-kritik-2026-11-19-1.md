Schwere: 3
Goal: abrechnung 06
Befund: abrechnung 06 baut eine Messung genauer, die keinem Kunden etwas bringt: Es geht um 8558 mc (rund 0,09 USD) Einkauf ohne Verkauf in sieben Tagen und eine Quote von 0,0 %, die Anbieterwahl ist schon entschieden, und die Begründung im MVP-Satz trägt nicht, weil keine Antwort aus kanal eine Quote oder einen Einkauf nennt.
Beleg: `git grep -c -E 'Quote|Timeout|timeout' origin/dev -- goals/kanal/antworten goals/kanal/antworten-03` -> keine Ausgabe (0 Treffer) | docs/abrechnung/einkauf-abbrueche.md:106 | goals/abrechnung/06-der-zeitraum-der-quote-stimmt.md:14
Empfehlung: abrechnung 06 bleibt PAUSED, bis eine Zahl aus `ops/timeout-quote.sh` oder `ops/abort-purchase.sh` tatsächlich nach außen geht oder der Einkauf ohne Verkauf spürbar wird (etwa über 1 USD je Woche); bis dahin baut der Loop an dem, was neue zahlende Automatons bringt oder hält.
MVP: Schönheit, weil danach weder ein Kunde mehr bekommt noch einer mehr zahlt.

Die Kunden zahlen für Abbrüche schon nichts (abrechnung 01, `loop-constraints.md` Grundregel 6), die Quote ist 0 von 1220 Anfragen, und `Anbieterwahl:` in `docs/abrechnung/timeouts.md` hält das Routing ausdrücklich fest. Was bleibt, sind Randfälle im Werkzeug (Datum ohne Uhrzeit, Tage, die der Anbieter noch korrigiert) und die Frage nach einem einzigen Abbruch über 7783 mc. Das ist Feinschliff an einem Prüfwerkzeug nach „Erst validieren, dann perfektionieren“ und dieselbe Art Arbeit, die der Kurs-Check am 14. und 17.11. bei fehler 11, messung 11, messung 12 und hosting 03 pausiert hat.
Übernommen: abrechnung 06 steht auf dev schon auf PAUSED mit der Zeile Pause: aus diesem Vorschlag (Loop-Kritik 2026-11-19), nichts weiter zu tun (Loop-Triage PRO-25822) (2026-11-20)
