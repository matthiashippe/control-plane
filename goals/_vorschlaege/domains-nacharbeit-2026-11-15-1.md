Schwere: 1
Goal: domains 05
Befund: `ops/sandbox/setup.sh` wächst mit domains 05 von 564 auf 814 Zeilen und mit domains 06 auf 901, ohne dass eine Commit-Message der beiden Goals die Größe begründet.
Beleg: `git show 8eab58d^1:ops/sandbox/setup.sh | wc -l; git show 8eab58d:ops/sandbox/setup.sh | wc -l; git show origin/dev:ops/sandbox/setup.sh | wc -l; git log --format=%B 8eab58d^1..8eab58d^2 b685b77^1..b685b77^2 | grep -c -E '500|Zeilen|Größe'` -> `564`, `814`, `901`, `0` | ops/sandbox/setup.sh:364 und :382 (zwei eingebettete Node-Skripte), :578 bis :784 (Selbsttest des Schlüssel-Resets)
Empfehlung: Den Schlüssel-Reset mit seinem Selbsttest (`client_key_reset`, `foreign_sandboxes`, `CP_PUB_TIMER`, `selftest_client_key_reset`) in eine eigene Datei `ops/sandbox/client-key-reset.sh` ziehen, die `setup.sh` einbindet; sonst die Größe in der nächsten Commit-Message an der Datei begründen.
MVP: Schönheit

Linse Q, Frage 6 (Datei über 500 Zeilen), Merge 8eab58d, dazu b685b77 (domains 06) an derselben Datei. Die Datei lag vorher schon knapp über 500, die beiden Goals fügen zusammen 337 Zeilen hinzu, fast alles für den Reset. Dieselbe Klasse wurde für `src/inference/proxy.ts` verworfen (abrechnung-nacharbeit-2026-11-11-2).
