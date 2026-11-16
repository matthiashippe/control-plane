Schwere: 2
Goal: seite 01
Befund: Die Gegenproben mit gepflanztem Mangel aus seite 01 Punkt 6, konto 02 Punkt 4 und konto 03 Punkt 4 rufen `--pruefen` und enden nach seite 03 weiter mit `exit=1`, jetzt aber wegen `unknown argument: --pruefen` und nicht mehr wegen des gepflanzten Mangels; das Audit führt sie deshalb GRÜN, obwohl sie den Mangel nicht mehr beweisen.
Beleg: `T=$(mktemp -d); sed 's/tops up \$5 of credit/tops up $9 of credit/' docs/soll/src/startseite.html > $T/s.html; node ops/soll.mjs --pruefen --source $T/s.html; echo "exit=$?"` -> `unknown argument: --pruefen` und `exit=1` | goals/seite/01-soll-bilder-der-startseite-fuer-conway-umsteiger.md (Punkt 6)
Empfehlung: Im nächsten Goal der Seite je Werkzeug eine Gegenprobe mit `--check` und gepflanztem Mangel als Done-Punkt, der neben `exit=1` die Zeile des Mangels verlangt; die alten Gegenproben trägt der Tech Lead danach als abgelöst ein.
