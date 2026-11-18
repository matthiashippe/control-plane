Schwere: 2
Goal: abrechnung 05
Befund: Die Quote nach außen zählt nur Timeouts unter Status 200 und 0; im selben Zeitraum antwortete der Dienst 1393 Mal mit 503 (Guthaben beim Anbieter leer, 11.11. 02:01 bis 12.11.2026 08:22 UTC), gegen 1220 gezählte Anfragen. kanal 01 soll mit der Zahl sagen, dass Anfragen bei uns ankommen; „0,0 % Timeouts“ trägt diesen Satz nicht, solange mehr als die Hälfte der Inferenz-Anfragen im Fenster abgewiesen wurde.
Beleg: `grep -n "1393 Mal mit 503" docs/abrechnung/timeouts.md` | docs/abrechnung/timeouts.md, Abschnitt `## Nach sieben Tagen`
Empfehlung: Eine zweite Zeile `Antwortquote nach außen:` über denselben Zeitraum (Anteil `POST /v1/chat/completions` mit 200 an allen außer 4xx des Clients, aus `ops/access-log.sh`), und kanal nennt eine Zahl nur mit beiden Zeilen oder nur über einen Zeitraum ohne Ausfall. Dazu prüfen, ob ein leeres Guthaben beim Anbieter heute einen Alarm auslöst, bevor Kunden 503 sehen.
