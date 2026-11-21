Schwere: 2
Goal: kunden 06
Befund: `ops/starter-paths.sh` kopiert den Block, der `loop.env` liest, als vierte wörtliche Fassung und dazu `parse` und `iso` aus `ops/customer-decline.sh`, obwohl es `conway_arrivals` als gemeinsames Modul schon importiert.
Beleg: `git grep -n -F 'from_env=$( set -a' origin/dev -- ops/` -> conway-payers.sh:231, customer-decline.sh:324, github-yield.sh:251, starter-paths.sh:314 | ops/starter-paths.sh:314
Empfehlung: Den Block für `loop.env` als Funktion in ein gemeinsames Shell-Skript unter `ops/` legen und `parse`/`iso` nach `ops/conway_arrivals.py` ziehen.

Linse Q, Frage 2. Zweiter Beleg: `git grep -n -E '^def (parse|iso)\(' origin/dev -- ops/` -> customer-decline.sh:53 und :61, starter-paths.sh:60 und :68.

Verworfen: Doppelung in Werkzeugen unter `ops/` ohne Fehlerbild, MVP-Modus, keine Arbeit an Schönheit (2026-11-21)
