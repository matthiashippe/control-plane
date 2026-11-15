Schwere: 1
Goal: kanal 03
Befund: Der Test „does not count an arrival that came before the window“ prüft das Gegenteil seines Namens: Sein Fenster ab 21:00 UTC schließt die frühe Ankunft (21:20 UTC) ein und erwartet sie mitgezählt (4 statt 3).
Beleg: `git show origin/dev:test/github-yield.test.ts | sed -n 57,61p` -> `it("does not count an arrival that came before the window"` mit `--since 2026-11-06T21:00:00Z` und `4 arrived ... 2 signed in, 1 paid` | test/github-yield.test.ts:57
Empfehlung: Testnamen auf „counts the early arrival once the window includes it“ ändern, ohne die Assertion zu berühren; den Ausschluss belegt schon der Test „counts the planted arrival, sign-in and payment and nothing else“ (Fenster ab 22:20, 3 Ankünfte).
MVP: Schönheit

Linse Q, Frage 1. Die erste Zeile von `ops/fixtures/github-yield.log` hat `ts` 1794000000.25, also 2026-11-06T21:20:00Z, und liegt damit im Fenster ab 21:00.
Der Selftest in `ops/github-yield.sh` beschreibt denselben Fall richtig („the arrival before the window counts once the window includes it“).
Verworfen: Schwere 1, nur ein Testname, Assertion stimmt (2026-11-14)
