Schwere: 2
Goal: domains 01
Befund: Die Live-Prüfung in `ops/live.sh` belegt nach dem Rollout nur, dass `/v1/domains/search` hinter der Schlüsselprüfung steht (401 ohne Schlüssel), nicht dass der Handler antwortet.
Beleg: `grep -c "/v1/domains" ops/live.sh` -> 3 | goals/domains/ANNAHMEN.md:23
Empfehlung: Sobald es einen festen Prüfschlüssel für die Live-Prüfung gibt (etwa aus sandbox 03), ruft `ops/live.sh` die Suche mit Schlüssel und prüft Status und Antworttext.
Übernommen: domains 02, DONE und gemergt (PR #58) (2026-11-13)
