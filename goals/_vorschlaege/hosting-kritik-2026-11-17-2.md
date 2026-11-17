Schwere: 2
Goal: hosting 02
Befund: `tail -c` schneidet die gekürzte Ausgabe an einer Byte-Grenze, also mitten in einem UTF-8-Zeichen und mitten in einer Zeile; das Modell sieht als erstes ein Ersatzzeichen und eine halbe Zeile, und der Hinweis nennt keine Zeilennummer, ab der der gezeigte Teil beginnt.
Beleg: `src/sandbox/service.ts:65` (`tail -c ${WAIT_TAIL_BYTES} ${file}` in `printOutputs`)
Empfehlung: Den gezeigten Teil an der nächsten Zeilengrenze beginnen lassen (`tail -c 65536 <datei> | sed 1d`, wenn das erste Byte kein Zeilenanfang ist) und in der Zeile davor die Nummer der ersten gezeigten Zeile nennen (`wc -l`), damit `sed -n '<von>,<bis>p'` aus Punkt 7 direkt davor ansetzen kann. Test mit einer Datei aus mehrbyteigen Zeichen über 65536 Bytes, rot vor dem Fix.
