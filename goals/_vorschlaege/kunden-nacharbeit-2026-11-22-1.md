Schwere: 2
Goal: kunden 08
Befund: Der Selbsttest von `ops/customer-work.sh` läuft in keinem Test und nicht in `check`, also bleibt ein späterer Bruch am Zweig `CP_REPORT=customer-work` in `ops/db-report.cjs` (am selben Tag von hosting 07 wieder geändert) oder an `ops/customer_match.py` grün, bis jemand das Werkzeug von Hand startet.
Beleg: `git grep -c -E 'customer-work|customer_match' origin/dev -- test/ scripts/check.mjs` -> keine Ausgabe, Exit 1 | ops/customer-work.sh:177 (`--selftest`)
Empfehlung: `test/customer-work.test.ts` wie `test/runtime-sandbox-deps.test.ts` anlegen: `bash ops/customer-work.sh --selftest` starten, Exit 0, letzte Zeile `SELFTEST OK ...` und keine Zeile `FAIL` verlangen; dazu eine Kopie mit verfälschter Regel (etwa `MATCH_S = 0.0` in `ops/customer_match.py`), deren Selbsttest rot sein muss.

Linse Q, Frage 1.
