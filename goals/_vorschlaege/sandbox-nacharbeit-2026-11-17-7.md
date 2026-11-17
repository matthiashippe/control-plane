Schwere: 1
Goal: sandbox 09
Befund: Den Satz „The command has ended with exit code <n>.“, den `waitCommand` in `src/sandbox/service.ts` druckt, lesen zwei eigene Ausdrücke (`ENDED_RE` in `harness/e2e/long-exec.mjs`, `WAIT_ANSWER_JS` in `ops/live.sh`), und kein Test schickt die echte Ausgabe von `waitCommand` durch einen der beiden Leser.
Beleg: `git grep -n -E 'has ended with exit code|ENDED_RE' origin/dev -- src harness ops` -> `src/sandbox/service.ts:84`, `harness/e2e/long-exec.mjs:48`, `ops/live.sh:492` und Fixtures in `ops/live.sh:1160` bis `:1162` | src/sandbox/service.ts:84, harness/e2e/long-exec.mjs:48, ops/live.sh:492
Empfehlung: In `test/sandbox-wait.test.ts` die echte Ausgabe von `waitCommand` (beendet und laufend) durch `ENDED_RE` und durch `WAIT_ANSWER_JS` schicken, oder den Satz als Konstante führen, gegen die ein Test beide Leser abgleicht.
MVP: Schönheit

Linse Q, Frage 2 (Logik-Duplikate), Merge 82719fd. Ein Bruch fällt im Harness-E2E und in der Live-Prüfung laut auf, deshalb nur Schwere 1. Bekannt und nicht hier: die nicht atomare Exit-Datei (sandbox-kritik-2026-11-16-2).
