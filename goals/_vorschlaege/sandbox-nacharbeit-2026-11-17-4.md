Schwere: 1
Goal: sandbox 08
Befund: `ops/automaton-live.sh` kopiert `rand_hex` und `json_field` aus `ops/live.sh`, und die beiden `json_field` laufen schon auseinander: Die neue Fassung gibt auch Booleans aus, die alte nicht.
Beleg: `git grep -n -E '^(json_field|rand_hex)\(\)' origin/dev -- ops/live.sh ops/automaton-live.sh` -> `ops/automaton-live.sh:135`, `ops/automaton-live.sh:138`, `ops/live.sh:655`, `ops/live.sh:659` | ops/automaton-live.sh:138, ops/live.sh:659
Empfehlung: Beide Helfer in eine Datei unter `ops/` legen, die beide Skripte per `source` einbinden (wie `ops/own-ips.sh`), mit einer Regel für Booleans.
MVP: Schönheit

Linse Q, Frage 2 (Logik-Duplikate), Merge 792a490.
Verworfen: MVP: Schönheit ohne belegten Fehler, und der Kurs-Check vom 17.11. (PRO-23529) sieht den Detail-Anteil über der Schwelle; die Helfer sind Testwerkzeug ohne Ledger-Bezug (2026-11-17)
