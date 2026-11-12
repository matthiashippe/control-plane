Schwere: 1
Goal: abrechnung 01
Befund: `src/inference/proxy.ts` wächst mit abrechnung 01 von 454 auf 534 Zeilen (mit abrechnung 02 auf 540), ohne dass eine Commit-Message der beiden Goals die Größe begründet.
Beleg: `git show 56829052f50e28e3fcc8c086cd398466c2ad942b^1:src/inference/proxy.ts | wc -l; git show origin/dev:src/inference/proxy.ts | wc -l; git log --format=%B 56829052f50e28e3fcc8c086cd398466c2ad942b^1..56829052f50e28e3fcc8c086cd398466c2ad942b^2 | grep -c -i -E "500|proxy\.ts"` -> `454`, `540`, `0`
Empfehlung: Die Abbruch-Behandlung (`CLIENT_CLOSED`, `abandon`) in ein eigenes Modul neben `dedupe.ts` ziehen oder die Größe in der nächsten Commit-Message an `proxy.ts` begründen.
MVP: Schönheit

Linse Q, Frage 6. Für abrechnung 02 (Merge 39d4549e) gibt derselbe grep ebenfalls 0.
`src/app.ts` und `src/db.ts` lagen schon vor dem Goal über 500 Zeilen und zählen hier nicht.

Verworfen: MVP Schönheit, Schwere 1, Größe von proxy.ts ohne Folge für Kunden (2026-11-12)
