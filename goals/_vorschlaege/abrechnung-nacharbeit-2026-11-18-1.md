Schwere: 1
Goal: abrechnung 05
Befund: `ops/timeout-quote.sh` wächst mit abrechnung 05 von 497 auf 637 Zeilen, ohne dass eine Commit-Message des Goals die Größe über 500 Zeilen begründet.
Beleg: `git show $(git merge-base f076a93^1 f076a93^2):ops/timeout-quote.sh | wc -l; git show origin/dev:ops/timeout-quote.sh | wc -l; git log --format=%B f076a93^1..f076a93^2 | grep -c -i -E '500 zeilen|über 500|timeout-quote\.sh'` -> `497`, `637`, `0` | ops/timeout-quote.sh:580 (`selftest_scale`, neu)
Empfehlung: Den Selbsttest mit 200000 gepflanzten Zeilen (`selftest_scale`) und das JS in `COUNT_JS` in eigene Dateien unter `ops/` ziehen oder die Größe in der nächsten Commit-Message an `ops/timeout-quote.sh` begründen.
MVP: Schönheit
