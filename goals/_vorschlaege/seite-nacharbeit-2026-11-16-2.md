Schwere: 3
Goal: seite 03
Befund: Der Prüfbefehl `CP_FETCHER_CACHE=$(mktemp) pnpm -s vitest run test/known-ips.test.ts` aus seite 03 Punkt 4 ist schon an der Merge-Basis rot, weil `mktemp` eine leere Datei anlegt, die existiert, und der Test dann jede Zeile `(fetcher-cache)` der Adressliste gegen einen leeren Cache hält.
Beleg: `CP_FETCHER_CACHE=$(mktemp) pnpm -s vitest run test/known-ips.test.ts` am Stand origin/dev 82fd213 -> `Tests  1 failed | 6 passed (7)`, Fall "holds every (fetcher-cache) line against the cache of ops/fetchers.py", 7 Zeilen "address not in the cache" | test/known-ips.test.ts:319
Empfehlung: Der Tech Lead ersetzt im Prüfbefehl `$(mktemp)` durch einen Pfad, der nicht existiert (`$(mktemp -u)`), denn der Test überspringt den Abgleich nur ohne Cache-Datei; den Test aufzuweichen, damit eine leere Datei als fehlender Cache gilt, wäre eine Ausnahme nur für eine rote Prüfung.
Übernommen: auf dev erledigt mit seite 03 (PR #222), Punkt 4 prüft mit `$(mktemp -u)` (goals/seite/03-code-auf-englisch.md:105) (2026-11-17)
