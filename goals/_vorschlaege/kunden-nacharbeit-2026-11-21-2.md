Schwere: 2
Goal: kunden 06
Befund: Der neue Block `CP_REPORT=starter-paths` in `ops/db-report.cjs` kopiert den Helfer `iso` und die `writeSync`-Schleife wörtlich aus dem Block `decline`; die Schleife steht damit dreimal in der Datei.
Beleg: `git grep -n -E "is no ISO time|writeSync\(1, out" origin/dev -- ops/db-report.cjs` -> `iso` an :268 und :389, Schleife an :316, :373, :430 | ops/db-report.cjs:389
Empfehlung: `iso` und die Ausgabe auf stdout einmal oben in `ops/db-report.cjs` definieren und in allen drei Blöcken aufrufen.

Linse Q, Frage 2 (Logik-Duplikat).
