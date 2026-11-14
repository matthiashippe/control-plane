Schwere: 2
Goal: domains 04
Befund: Die neuen Prüfungen für `--client-key-reset` und den Pin des Basis-Images stehen nur in `bash ops/sandbox/setup.sh --selftest`, das kein Test unter `test/` aufruft, also findet `check` (Required Check auf `dev`) sie nicht und ein Merge, der den Pin oder den Reset bricht, bleibt grün.
Beleg: `git grep -n "setup.sh" origin/dev -- test scripts .github package.json; echo rc=$?` -> `rc=1` (kein Treffer) | ops/sandbox/setup.sh:550 und :552 (Aufruf von `selftest_client_key_reset` und `selftest_image_pin` nur in `selftest`), scripts/check.mjs:144 (Unit-Tests nur über vitest)
Empfehlung: Einen vitest-Test `test/sandbox-setup-selftest.test.ts` anlegen, der `bash ops/sandbox/setup.sh --selftest` ohne Netz startet und Exit 0, die letzte Zeile `SETUP SELFTEST OK` und je eine Zeile `selftest image-pin: ok (fresh|rebuild|again|desired)` und `selftest client-key-reset: ok (moved|again|reinstall)` verlangt, so wie `test/live-selftest.test.ts` den Selbsttest von `ops/live.sh` hält; rot vorher mit einem gepflanzten Label `sandboxd=1` in `pin_image`.
MVP: Funktion, weil danach `check` vor dem Merge rot wird, wenn ein Goal den Pin bricht, statt dass ein Maker den kaputten Stand mit `setup.sh` auf den Sandbox-Server bringt und der nächste Prune um 00:26 UTC das Image löscht, worauf jede Anlage einer Sandbox mit 501 antwortet.

Linse Q, Frage 1. `ops/prompts/verifier.md`, Abschnitt „Für diesen Loop“: ein Done-Punkt, dessen Test `check` nicht findet, ist ein Gap; die Punkte 2 und 6 von domains 04 prüfen nur über diesen Selbsttest.
Am Merge 479f6dfd ist der Selbsttest grün (`SETUP SELFTEST OK`, Exit 0). Ihn fährt heute nur der nächtliche Loop-Audit als Regression von sandbox 02 und 03 (docs/audit/2026-11-13.md:252), also erst nach dem Merge.
Der offene PR #100 (sandbox 07) ändert `setup.sh` erneut, ohne einen solchen Test.
