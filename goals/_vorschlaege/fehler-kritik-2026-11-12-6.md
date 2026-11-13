Schwere: 1
Goal: fehler 04
Befund: Der fünfte Prüfbefehl von Punkt 1 (`awk '$2=="erfunden"{print $1}' ops/known-ips.txt`) nimmt auch die Kopfzeile `#   erfunden …` der Liste und sucht dann nach `#`, das in fast jeder Datei steht; für diese Zeile ist der Befehl immer grün.
Beleg: `awk '$2=="erfunden"{print $1}' ops/known-ips.txt | grep -c '^#$'` -> 1
Empfehlung: In künftigen Goals Listen-Prüfbefehle mit `grep -vE '^(#|$)'` vorfiltern wie die übrigen Befehle von Punkt 1; die Regel selbst hält ab diesem Goal der Test (Kritik-Punkt 5).
