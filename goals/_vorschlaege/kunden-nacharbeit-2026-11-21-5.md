Schwere: 1
Goal: kunden 06
Befund: kunden 06 vergrößert `ops/db-report.cjs` von 901 auf 958 und `src/app.ts` von 4049 auf 4058 Zeilen, und keine Commit-Message des Goal-Branches begründet die Größe über 500 Zeilen.
Beleg: `git show 91597b5:ops/db-report.cjs | wc -l` -> 958 | ops/db-report.cjs:381
Empfehlung: Begründung im nächsten Commit an diesen Dateien nachtragen oder wie `kunden-nacharbeit-2026-11-20-3` als bewusste Ausnahme in `ANNAHMEN.md` festhalten.

Linse Q, Frage 6. Gegenprobe: `git log --format=%B 91597b5^1..91597b5^2 | grep -ci zeilen` -> 0.
