Schwere: 2
Goal: karte 02
Befund: Der Selftest von `ops/digistore-release.mjs` (Wächter `guarded` und `assertOwn`, die jedes Schreiben an fremde Produkte des geteilten Kontos vor dem Senden abbrechen, dazu `--submit` höchstens einmal je Stand) läuft in keinem Test unter `test/`, also prüft `check` dieses Verhalten nie.
Beleg: `git grep -n -E 'digistore(-release)?\.mjs' e423d4d -- test scripts` -> keine Ausgabe | ops/digistore-release.mjs:390
Empfehlung: In derselben Testdatei wie für `ops/digistore.mjs` auch `node ops/digistore-release.mjs --selftest` starten und Exit 0 sowie die letzte Zeile `SELFTEST OK` erwarten.

Der Selftest ist nur als Prüfbefehl in goals/karte/02-der-weg-zur-kasse.md:146 belegt. Das Werkzeug schreibt in ein Konto, das sich das Control Plane mit Personalplaner24, Bautagebuch24 und Aszendent24 teilt (ops/digistore-release.mjs:11).
