Schwere: 2
Goal: konto 05
Befund: konto 05 legt in `mcp/server.mjs` mit `parseMoneyUsd` einen zweiten Parser für Dollarbeträge neben das vorhandene `parseUsd` derselben Datei, mit eigener Regel (bis 7 statt bis 9 Ziffern vor dem Punkt, Null nur mit `allowZero`), sodass die beiden getrennt auseinanderlaufen können.
Beleg: `git grep -n -E 'export function (parseUsd|parseMoneyUsd)' origin/dev -- mcp/server.mjs` -> `mcp/server.mjs:362:export function parseUsd(value) {`, `mcp/server.mjs:499:export function parseMoneyUsd(value, { allowZero = false } = {}) {` | mcp/server.mjs:357, mcp/server.mjs:490
Empfehlung: Eine Funktion behalten, etwa `parseUsd(value, { maxDigits, allowZero })`, die `set_daily_limit`, `start_automaton` und die drei Geld-Tools aufrufen; `test/mcp-automaton.test.ts` und `test/mcp-money.test.ts` belegen, dass sich nichts ändert.
MVP: Schönheit
Übernommen: PRO-24877 Glied 6 (2026-11-18)
