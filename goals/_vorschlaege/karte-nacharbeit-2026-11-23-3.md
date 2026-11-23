Schwere: 2
Goal: karte 02
Befund: karte 02 legt `ops/digistore-release.mjs` neu mit 565 Zeilen an, und keine Commit-Message des Goal-Branches begründet die Größe über 500 Zeilen.
Beleg: `git show d3732691c:ops/digistore-release.mjs | wc -l; git log --format=%B d3732691c^1..d3732691c^2 | grep -ciE '500|zeilen'` -> `565`, `0` | ops/digistore-release.mjs:390
Empfehlung: Den Selftest mit Fake-Konto und Beispielen (ab Zeile 335, rund 200 Zeilen) in eine eigene Datei `ops/digistore-release-selftest.mjs` legen oder die Größe in der nächsten Commit-Message an der Datei begründen.

Linse Q, Frage 6.

Verworfen: Größe einer Datei ohne Fehlerbild, kein Gewinn für Kunden (2026-11-23)
