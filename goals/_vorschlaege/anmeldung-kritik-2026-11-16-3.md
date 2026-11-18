Schwere: 1
Goal: anmeldung 04
Befund: `test/openapi-keyless.test.ts` löscht `CP_AGENT_MINTS_PER_DAY` und `CP_CRAWLER_MINTS_PER_DAY` nur in `afterEach`; ist eine der beiden Variablen in der Shell oder in CI schon gesetzt, wird der Fall „names the cap for everybody and the crawler cap“ rot, obwohl der Code stimmt.
Beleg: `grep -n 'afterEach\|beforeEach' test/openapi-keyless.test.ts` -> nur `afterEach` in Zeile 34 | test/openapi-keyless.test.ts:78 (erwartet fest `200` und `5`)
Empfehlung: Beim nächsten Goal, das die Datei anfasst, dasselbe Löschen auch in `beforeEach`; Prüfung `CP_AGENT_MINTS_PER_DAY=9 pnpm -s vitest run test/openapi-keyless.test.ts` mit Exit 0.
MVP: Robustheit, weil der Test sonst an der Umgebung statt am Code scheitert.

Kritik Tech Lead an anmeldung 04 (PR #203). Nicht als Done-Punkt, weil heute weder `check` noch CI die Variablen setzen (`grep -rn CP_AGENT_MINTS_PER_DAY scripts .github ops deploy` ist leer).
Übernommen: auf dev erledigt mit anmeldung 05 (PR #259), `beforeEach` in `test/openapi-keyless.test.ts:131` (2026-11-18)
