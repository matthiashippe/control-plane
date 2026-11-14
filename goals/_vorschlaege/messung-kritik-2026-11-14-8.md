Schwere: 2
Goal: messung 04
Befund: `adressen_an_der_bezahlroute` in `ops/anzeigen-rechnung.py` gibt still 0 zurück, wenn `./ops/access-log.sh` scheitert oder mit Fehler und leerer Ausgabe endet. Der Nenner der Konversion ist dann 0 statt „nicht messbar“; dieselbe Klasse Fehler, die messung 04 für die leere eigene Liste abstellt.
Beleg: `grep -n 'return 0' ops/anzeigen-rechnung.py` und `subprocess.run(["./ops/access-log.sh"] ...)` ohne Prüfung von `returncode`.
Empfehlung: In einem späteren Glied messung: Exit 2 mit stderr-Zeile, wenn `access-log.sh` mit Fehler endet; Test mit nachgebautem `access-log.sh`, das mit 1 endet, rot vor dem Fix.
MVP: Funktion, weil die Konversion der Anzeigen sonst bei einem Lesefehler stillschweigend falsch wird.
