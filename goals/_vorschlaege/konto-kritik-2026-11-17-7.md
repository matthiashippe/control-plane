Schwere: 2
Goal: konto 07
Befund: Die Mutationen aus Punkt 3 decken nur `% 10_000n` und `> 0n` ab. Streicht jemand in `parseUsdc` die Prüfung `typeof v !== "string"`, bleibt `check` grün, obwohl dann eine JSON-Zahl angenommen wird: `/^[0-9]{1,18}$/.test(10000)` ist `true`, und `9007199254740993` kommt als Zahl schon gerundet an (`9007199254740992`), das Limit wäre dann ein anderer Betrag als gesendet. Dasselbe gilt für die Grenze `{1,18}` (19 Ziffern).
Beleg: `src/konto/usdc.ts` Zeile 8; `node -e 'console.log(/^[0-9]{1,18}$/.test(10000))'` gibt `true` aus; kein Test unter `test/` sendet `daily_limit_usdc` als Zahl.
Empfehlung: `test/konto-usdc.test.ts` mit einer Tabelle für `parseUsdc` (`10000` als Zahl, `"1" + "0".repeat(18)`, `" 10000"`, `"+10000"`, `"1e4"`, `"10000"`), dazu ein Fall an `POST /v1/konto/limit` mit der Zahl `10000`, der 400 `invalid_limit` erwartet, und die zwei Mutationen (Typprüfung gestrichen, `{1,18}` zu `{1,19}`) im Prüfbefehl eines späteren konto-Goals.
Übernommen: auf dev erledigt mit konto 10 (PR #264) (2026-11-18)
