Schwere: 2
Goal: karte 01
Befund: Der Selftest von `ops/digistore.mjs` (Schreibsperre für die Produkte der anderen Projekte im geteilten Konto, Anlegen, Bericht) läuft in keinem Test unter `test/`, deshalb fängt `check` eine Regression nicht, obwohl karte 02 die Datei und ihren Selftest schon wieder geändert hat (`REFUND_DAYS` 30 auf 60).
Beleg: `git grep -n -E 'digistore(-release)?\.mjs' e423d4d -- test scripts` -> keine Ausgabe | ops/digistore.mjs:290
Empfehlung: Eine Testdatei `test/digistore-tool.test.ts` startet `node ops/digistore.mjs --selftest` per `spawnSync` und erwartet Exit 0 und als letzte Zeile `SELFTEST OK`, nach dem Muster von `test/abort-purchase.test.ts:93`.

`verifier.md` (Für diesen Loop) nennt einen Prüfbefehl, den `check` nicht findet, eine Lücke; hier belegt den Selftest nur der Prüfbefehl der Goal-Datei (goals/karte/01-guthaben-per-karte.md:160), der nach dem Merge niemand mehr ausführt.
