Schwere: 2
Goal: hosting 01
Befund: Der Fall „src/index.ts reaches the sweep only through the billing round with the delay of three minutes“ prüft kein Verhalten, sondern liest `src/index.ts` als Text und sucht die Zeichenfolgen `const billing = ` und `firstDelayMs: 3 * 60 * 1000`; die Verdrahtung des Dienstes mit dem Takt ist damit nur über Strings im Quelltext belegt.
Beleg: `git show origin/dev:test/billing-round.test.ts | sed -n '95p;97p;102p'` -> `const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");`, `l.includes("const billing = ")`, `toContain("firstDelayMs: 3 * 60 * 1000")` | test/billing-round.test.ts:94
Empfehlung: Den Block aus `src/index.ts` als Funktion (etwa `startServiceRounds({ sandbox, automatons, log })` in `src/sandbox/round.ts` mit der Verzögerung von drei Minuten als Vorgabe) ausgeben, die `src/index.ts` nur aufruft, und sie mit falscher Uhr testen: kein Tick und kein Sweep vor 180000 ms, beides danach; der Textvergleich entfällt.
MVP: Schönheit
Verworfen: MVP: Schönheit ohne belegten Fehler; die Form des Tests ändert kein Verhalten, der Sweep selbst ist am Verhalten getestet (2026-11-18)
