Schwere: 3
Goal: messung 08
Befund: `ops/check-all.sh` verwirft die `stderr` von `ops/anzeigen-rechnung.py` und filtert `stdout` mit `grep`, deshalb steht unter „tragen Anzeigen schon?“ bei einem unlesbaren Zugriffslog seit messung 08 gar nichts: weder eine Zahl noch „nicht messbar“, und das Ziel des Goals erreicht den Leser des Zyklus nicht.
Beleg: ops/check-all.sh:294 (`python3 ./ops/anzeigen-rechnung.py 2>/dev/null | grep -E ... || true`)
Empfehlung: In einem späteren Glied messung: bei Exit 2 die Zeile `anzeigen-rechnung: …` aus `stderr` unter der Überschrift ausgeben (sie nennt weder Host noch Adresse), Test mit nachgebautem `access-log.sh`, das mit 1 endet, und der Erwartung, dass die Zeile im Abschnitt steht.
MVP: Funktion, weil die Anzeigenfrage jeden Zyklus über check-all gestellt wird und ein leerer Abschnitt wie „nichts zu melden“ aussieht.
