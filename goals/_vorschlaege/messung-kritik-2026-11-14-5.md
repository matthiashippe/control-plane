Schwere: 1
Goal: messung 02
Befund: `test/deploy-window-rollout.test.ts` und `test/deploy-alarm.test.ts` legen je Fall einen Ordner unter `tmpdir()` an und löschen ihn nie, wie schon `test/claim-keyless-own-ips.test.ts` (Vorschlag messung-kritik-2026-11-14-2); jeder Lauf von `check` lässt dadurch weitere Ordner mit Kopien von Skripten aus `ops/` liegen.
Beleg: `cat test/deploy-window-rollout.test.ts test/deploy-alarm.test.ts | grep -c rmSync` -> 0
Empfehlung: Zusammen mit messung-kritik-2026-11-14-2 in einem `afterEach` mit `rmSync(root, { recursive: true, force: true })` aufräumen, ohne Assertions zu ändern.
MVP: Schönheit
