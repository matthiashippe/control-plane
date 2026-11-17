Schwere: 2
Goal: sandbox 08
Befund: Der Selbsttest von `ops/automaton-live.sh` (Fall für Fall der ganze Lauf gegen Stellvertreter, Prüfbefehl von sandbox 08) wird von keinem Test unter `test/` aufgerufen, also findet `check` ihn nicht, und ein Merge, der das Werkzeug bricht, bleibt grün.
Beleg: `git grep -c 'automaton-live.sh' origin/dev -- test scripts package.json; echo rc=$?` -> `rc=1` | ops/automaton-live.sh:414 (`selftest()`), ops/automaton-live.sh:702 (`--selftest`), ops/prompts/verifier.md:78 bis 80, goals/sandbox/08-ein-ganzer-automaton-laeuft-in-einer-sandbox.md:183
Empfehlung: Einen vitest-Test `test/automaton-live-selftest.test.ts` anlegen, der `bash ops/automaton-live.sh --selftest` ohne Netz startet und Exit 0 und die letzte Zeile `AUTOMATON LIVE SELFTEST OK` verlangt, so wie `test/live-selftest.test.ts` und `test/sandbox-setup-selftest.test.ts` es für `ops/live.sh` und `ops/sandbox/setup.sh` tun.
MVP: Funktion, weil die Live-Prüfung des gehosteten Automatons sonst erst im nächsten Audit nach dem Merge rot wird, nicht vor ihm.

Linse Q, Frage 1, Merge 792a490. Dieselbe Klasse wurde für `ops/sandbox/setup.sh` übernommen (domains-nacharbeit-2026-11-14-1, umgesetzt in domains 06).
Übernommen: PRO-23679 Glied 5 (2026-11-17)
