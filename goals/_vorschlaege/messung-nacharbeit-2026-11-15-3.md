Schwere: 1
Goal: messung 04
Befund: `ops/timeout-quote.sh` wächst mit messung 04 von 478 auf 522 Zeilen, ohne dass eine Commit-Message des Goals die Größe begründet.
Beleg: `git show $(git merge-base 6ceb63d^1 6ceb63d^2):ops/timeout-quote.sh | wc -l; git show origin/dev:ops/timeout-quote.sh | wc -l; git log --format=%B 6ceb63d^1..6ceb63d^2 | grep -c 500` -> `478`, `522`, `0`
Empfehlung: `own_list` mit der Sperre aus messung-nacharbeit-2026-11-15-2 nach `ops/own-ips.sh` ziehen, dann fällt die Datei wieder unter 500 Zeilen; sonst die Größe in der nächsten Commit-Message an der Datei begründen.
MVP: Schönheit

Linse Q, Frage 6 (Datei über 500 Zeilen), Merge 6ceb63d. `ops/traffic.sh` (1415 Zeilen) lag schon vor dem Goal darüber und zählt hier nicht. Dieselbe Klasse wurde für `src/inference/proxy.ts` verworfen (abrechnung-nacharbeit-2026-11-11-2); hier hängt die Behebung an der Zusammenlegung aus Vorschlag 2.
