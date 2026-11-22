Schwere: 2
Goal: paket 01
Befund: Der Installationsbefehl mit dem Tag steht in `README.md` und `docs/paket/anleitung.md` je von Hand, und keine Prüfung hält beide gleich der Zeile `Release:`; beim nächsten Release kann das README einen alten Tag nennen, ohne dass `check` rot wird.
Beleg: `grep -c 'github:matthiashippe/automaton#' docs/paket/anleitung.md README.md` prüft nur, dass der Befehl vorkommt, nicht welcher Tag | goals/paket/01-die-runtime-kommt-mit-unserer-adresse.md, Done-Punkt 5
Empfehlung: Ein Test unter `test/` (neue Datei) liest den Tag aus der Zeile `Release:` und verlangt, dass jeder `github:matthiashippe/automaton#<tag>` in `README.md` und `docs/paket/anleitung.md` genau diesen Tag nennt; mitnehmen im nächsten Goal, das ein neues Release baut.
MVP: Funktion, weil ein veralteter Tag einen Betreiber auf ein Release ohne die letzten Fixes schickt.
