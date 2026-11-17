Schwere: 2
Goal: sandbox 10
Befund: Die Fälle, mit denen sandbox 10 den Stempel über `dist/` belegt (`dist-changed`, `dist-added`, `dist-unstamped`, `dist-other-commit`, `rebuild-changed-dist`, `reuse-stamped-dist`, `rebuild-drops-stale`), stehen nur im Selbsttest von `ops/runtime-sandbox.sh`, den kein Test unter `test/` aufruft, also findet `check` sie nicht.
Beleg: `git grep -c 'runtime-sandbox.sh' origin/dev -- test scripts package.json; echo rc=$?` -> `rc=1` | ops/runtime-sandbox.sh:189 (`selftest()`), ops/runtime-sandbox.sh:318 (`--selftest`), ops/prompts/verifier.md:78 bis 80, goals/sandbox/10-die-runtime-am-pin-ist-auch-am-pin-gebaut.md:70 bis 73
Empfehlung: Einen vitest-Test `test/runtime-sandbox-selftest.test.ts` anlegen, der `bash ops/runtime-sandbox.sh --selftest` ohne Netz startet und Exit 0, die letzte Zeile `RUNTIME SANDBOX SELFTEST OK` und die Zeilen `ok   <fall>: ` der Fälle aus sandbox 10 verlangt.
MVP: Funktion, weil sonst ein Merge, der den Stempel bricht, grün bleibt und der Gang eine Runtime meldet, die nicht am Pin gebaut ist.

Linse Q, Frage 1, Merge 4551d43. Vor dem Goal hatte der Selbsttest 18 Fälle und schon keinen Aufrufer unter `test/`; sandbox 10 macht ihn zum einzigen Beleg seiner Done-Punkte.
