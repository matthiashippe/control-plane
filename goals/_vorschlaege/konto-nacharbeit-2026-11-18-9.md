Schwere: 2
Goal: konto 06
Befund: Seit konto 06 `set_daily_limit` keinen Namen mehr schickt, ruft niemand `automatonName(key, given)` in `mcp/server.mjs` mit `given` auf; der Parameter und der Zweig `if (given) return given;` sind tot, und der Kommentar nennt `given` weiter als erste Quelle.
Beleg: `git grep -n 'automatonName(' origin/dev -- mcp/server.mjs` -> `1086` (Definition mit `given`), `1276` und `1317` je `automatonName(k.key)` | mcp/server.mjs:1085, mcp/server.mjs:1087
Empfehlung: `given` und die Zeile `if (given) return given;` streichen und den Kommentar auf „the one started here, else the newest of the account“ kürzen; `test/mcp-money.test.ts` und `test/mcp-automaton.test.ts` bleiben grün.
MVP: Schönheit
