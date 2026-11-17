Schwere: 3
Goal: messung 08
Befund: `ops/access-log.sh` endet mit 0 und einem halben Log, wenn eine rotierte Datei kaputt oder abgeschnitten ist, weil `gzip -dc "$f" 2>/dev/null` in der Schleife von `INNER` scheitern darf und der Exit der entfernten Pipe der von `gzip -c` ist; messung 08 fängt nur einen Exit ungleich 0, also zählt die Anzeigen-Rechnung diesen Teil weiter als ganzes Log.
Beleg: ops/access-log.sh:37-39 (`for f in ...; do gzip -dc "$f" 2>/dev/null; done;`) und ops/access-log.sh:79 (`sh -c '$INNER' | gzip -c`)
Empfehlung: In einem späteren Glied messung: `INNER` merkt sich einen gescheiterten `gzip -dc` und endet dann mit 4, die entfernte Pipe gibt diesen Exit weiter (etwa `set -o pipefail` im entfernten `sh` oder ein Marker am Ende des Stroms, den `access-log.sh` prüft und abschneidet); Test mit nachgebautem `ssh`, das eine abgeschnittene `.gz` liefert, Erwartung Exit 2.
MVP: Funktion, weil jedes Werkzeug auf `access-log.sh` sonst eine Rotation mit kaputter Datei still als kürzere Historie liest.
Übernommen: ROADMAP.md, Glied messung 13 (PR #227) (2026-11-17)
