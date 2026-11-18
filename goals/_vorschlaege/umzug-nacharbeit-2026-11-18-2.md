Schwere: 2
Goal: umzug 01
Befund: Der Selbsttest von `ops/site-dns.py` (Planer und `apply` gegen gepflanzte Zonen, Prüfbefehl von umzug 01 Punkt 4) wird von keinem Test unter `test/` aufgerufen, also findet `check` ihn nicht, und ein Merge, der das Werkzeug bricht, bleibt grün.
Beleg: `git grep -c 'site-dns' origin/dev -- test scripts package.json; echo rc=$?` -> `rc=1` | ops/site-dns.py:128 (`selftest()`), ops/site-dns.py:211 (`--selftest`), ops/prompts/verifier.md:78 bis 80
Empfehlung: Einen vitest-Test `test/site-dns-selftest.test.ts` anlegen, der `python3 ops/site-dns.py --selftest` ohne Netz startet und Exit 0, keine Zeile `FAIL ` und die letzte Zeile `SITE DNS SELFTEST OK` verlangt, nach dem Muster von `test/live-selftest.test.ts`.
MVP: Schönheit
Übernommen: PRO-24877 Glied 8 (2026-11-18)
