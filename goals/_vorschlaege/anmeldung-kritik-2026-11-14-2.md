Schwere: 1
Goal: anmeldung 01
Befund: `ops/keyless-mints.sh` wechselt in Zeile 27 ins Repo-Wurzelverzeichnis, bevor es `--file` liest. Ein relativer Pfad wie `--file caddy.jsonl` aus einem anderen Verzeichnis zeigt dann ins Repo und endet mit „the log file cannot be read“, obwohl die Datei da ist.
Beleg: ops/keyless-mints.sh:27, ops/keyless-mints.sh:152
Empfehlung: Beim Lesen der Argumente `--file` vor dem `cd` in einen absoluten Pfad wandeln (`realpath -m`), im nächsten Goal, das das Werkzeug ohnehin berührt.
