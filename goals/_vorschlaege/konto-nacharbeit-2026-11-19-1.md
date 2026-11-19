Schwere: 1
Goal: konto 12
Befund: Dass `launch` keine `exit`-Listener ansammelt (Done-Punkt 3), prüft nur ein Prüfbefehl der Goal-Datei und kein Test unter `test/`, deshalb bleibt `check` grün, wenn `process.off("exit", killRunning)` wegfällt.
Beleg: `sed -i '/process.off("exit", killRunning)/d' ops/browser.mjs && pnpm -s vitest run test/browser.test.ts` (in einer Kopie von 6c21c6e) -> `Tests  12 passed (12)`; `git show 6c21c6e:test/browser.test.ts | grep -c 'listenerCount\|process.off'` -> 0 | ops/browser.mjs:86
Empfehlung: In `test/browser.test.ts` einen Fall ergänzen, der wie der Prüfbefehl zwölf Browser mit dem nachgebauten Chrome startet, ihr Ende abwartet und `process.listenerCount("exit")` gegen den Ausgangswert prüft, und einmal belegen, dass er ohne `process.off` rot wird.

Übernommen: Watch List in STATE.md, Testlücke ohne Fehler im Verhalten, der Prüfbefehl von konto 12 Punkt 3 läuft im Audit weiter (Loop-Triage PRO-25197) (2026-11-19)
