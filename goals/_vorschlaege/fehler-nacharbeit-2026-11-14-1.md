Schwere: 2
Goal: fehler 06
Befund: Der Abgleich einer Zeile `(fetcher-cache)` mit dem Cache (Adresse vorhanden, Art `datacenter`, gleicher Betreiber) hat keinen Fall mit gepflanzter Eingabe in der Suite, er läuft nur in `it.skipIf(!existsSync(CACHE))` gegen die echte Liste, also in CI nie und auf dem code-host nur, solange die echte Liste passt.
Beleg: `git grep -n -E "cacheFinding\(|skipIf" origin/dev -- test/known-ips.test.ts` -> nur Definition :158 und Aufruf :279 im Fall :272 mit `skipIf`; `git grep -c CP_FETCHER_CACHE origin/dev -- scripts/check.mjs .github package.json` -> keine Treffer | test/known-ips.test.ts:165, :167, :272
Empfehlung: Einen Fall ohne Cache-Datei ergänzen, der `cacheFinding` direkt mit einer gepflanzten Map aus Dokumentationsadressen aufruft (fehlende Adresse, Art `unknown`, anderer Betreiber, Text nach dem Beleg je rot, passende Zeile `null`), wie der Fall für `isPublic` in derselben Datei; passt in das laufende fehler 08 (PR #120), das dieselbe Datei ändert.
MVP: Funktion, weil danach ein Umbau, der den Betreibervergleich oder die Prüfung „Adresse im Cache“ verliert, in `check` rot wird, auch in CI; heute bleibt er überall grün, und eine Besucheradresse mit Beleg `(fetcher-cache)` käme wieder durch (Grundregel 8).

Linse Q, Frage 1. Die vier roten Fälle aus Punkt 1 des Goals existieren nur als Prüfbefehle der Goal-Datei (Umgebung `CP_KNOWN_IPS`, `CP_FETCHER_CACHE`) und laufen nach dem Merge nirgends mehr.
Gegenprobe am Merge 7020272 auf dem code-host mit vorhandenem Cache: `r.owner === m[2]` aus Zeile 167 entfernt und Zeile 165 auf `return null` gesetzt, dann `pnpm -s vitest run test/known-ips.test.ts` -> 6 bestanden, 0 übersprungen, 0 rot.
fehler 08 (PR #120) lässt den Fall mit dem Cache laut Goal-Datei „wie er ist“ und deckt nur die Schreibweise ab; fehler-kritik-2026-11-13-2 betrifft die Schreibweise, nicht diese Lücke.
