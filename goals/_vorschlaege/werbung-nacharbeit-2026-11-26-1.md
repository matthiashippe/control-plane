Schwere: 1
Goal: werbung 04
Befund: `test/agent-probe-week.test.ts` kopiert die Hilfen `scratch`, `probe`, `week` und `lastLine` fast Zeile für Zeile aus `test/agent-probe.test.ts`, und `weekCounts` weicht schon ab: Die alte nimmt den ganzen Text und sucht in dessen letzter Zeile, die neue nimmt eine einzelne Zeile.
Beleg: `git grep -n -E '^function (scratch|probe|week|lastLine|weekCounts)\(' origin/dev -- test/agent-probe.test.ts test/agent-probe-week.test.ts` -> je fünf Treffer (`test/agent-probe.test.ts:40`, `:49`, `:76`, `:308`, `:312`; `test/agent-probe-week.test.ts:53`, `:62`, `:90`, `:94`, `:104`); `diff <(git show origin/dev:test/agent-probe.test.ts | sed -n 49,74p) <(git show origin/dev:test/agent-probe-week.test.ts | sed -n 61,86p)` -> nur Signatur, Name `answers`/`fixture` und `CP_NOW: NOW`/`CP_NOW: W47` | test/agent-probe-week.test.ts:62
Empfehlung: Die Hilfen nach `test/agent-probe-helpers.ts` ziehen (wie `test/money-helpers.ts`), mit `CP_NOW` als Parameter und einem `weekCounts(line)`, und beide Testdateien importieren sie; dabei die Fälle von `--week` aus `test/agent-probe.test.ts` nach `test/agent-probe-week.test.ts` holen, was werbung-nacharbeit-2026-11-25-1 schon empfiehlt.
MVP: Schönheit

Linse Q, Frage 2. Eine neue Umgebungsvariable des Skripts (wie `CP_PROBE_STATE_DIR` in werbung 03) müsste sonst in zwei Kopien von `probe` landen, und eine vergessene Kopie läuft still gegen den echten Zustand unter `HOME`.
