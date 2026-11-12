# Kanal Goal 02: Das Postwerkzeug postet nur den freigegebenen Text

## Status
DONE

## Active Objective
Vor dem nächsten `public_post` ist `ops/post-the-answers.py` so, dass es nie einen anderen Text sendet als den freigegebenen und dass
das nachprüfbar ist: Es liest Argumente wie `ops/before-the-answers.py` (`--folder <ordner>` und `--folder=<ordner>` gleich, jedes
unbekannte Argument bricht mit Exit 1 ab), und `--verify-posted` vergleicht je Zeile aus `ops/posted-answers.log` den Kommentar, der
live steht, mit dem Text, den das Werkzeug aus dem Entwurf senden würde, mit Exit 1 bei jeder Abweichung
(`goals/_vorschlaege/kanal-kritik-2026-11-11-1.md` und `-2.md`, je Schwere 2). Heute fällt `--folder=goals/kanal/antworten` still auf
den Standardordner `.scratch/gtm/issue-antworten/` zurück (`ops/post-the-answers.py:126` gegen `ops/before-the-answers.py:46`), und
den Abgleich der drei Kommentare vom 11.11.2026 hat der Tech Lead von Hand gemacht.
Widerlegt, wenn `--verify-posted` die drei Kommentare vom 11.11.2026 (#434, #430, #427) anders beurteilt als der Abgleich von Hand
(identisch).
MVP: Funktion, weil das Werkzeug unter Matthias' GitHub-Konto öffentlich postet und jede Freigabe am Gate `public_post` erst dann
etwas wert ist, wenn ein Befehl zeigt, dass genau dieser Text draußen steht.

## Voraussetzungen
- kanal Goal 01 DONE

## Kontext für den Maker
- Entscheidung Tech Lead (12.11.2026): eine gemeinsame Argument-Funktion für beide Skripte (etwa `ops/answers_args.py`, von beiden
  importiert), nicht zwei Kopien, weil genau die Abweichung zweier Kopien den Fehler gebaut hat. Sie kennt `--folder`, `--send`,
  `--selftest`, `--verify-posted` und Issue-Nummern; alles andere ist Exit 1 mit `REFUSED: unknown argument <arg>`. Die Prüfung, dass
  der Ordner im Repo liegt und existiert, wandert mit.
- `--verify-posted [--folder <ordner>]`: je Zeile `<zeit> <issue> <url>` aus `ops/posted-answers.log` mit einem Entwurf
  `<ordner>/<issue>.md` holt es den Kommentar über `gh api repos/Conway-Research/automaton/issues/comments/<id> --jq .body` (die `<id>`
  steht in der URL hinter `#issuecomment-`) und vergleicht ihn mit `body_to_send` des Entwurfs. Ausgabe je Zeile `same #<issue>` oder
  `DIFFERS #<issue>`, für Zeilen ohne Entwurf im Ordner `no draft #<issue>`, zuletzt `VERIFY POSTED OK: <n> same` mit Exit 0 oder
  `VERIFY POSTED FAILED: …` mit Exit 1, wenn ein Kommentar abweicht, fehlt oder nicht lesbar ist oder kein einziger verglichen wurde.
  Nur lesend: kein Kommentar wird geschrieben, geändert oder gelöscht, auch nicht bei Abweichung.
- Tests in `test/answers-folder.test.ts` mit den Fakes von dort (`gh`, `curl`, `ssh` auf dem `PATH`, kein Netz): `--folder=<ordner>
  --send 1` postet den Entwurf aus genau diesem Ordner, ein unbekanntes Argument endet mit Exit 1 und ohne POST, und `--verify-posted`
  ist mit gleichem Text grün und mit einem Zeichen Unterschied im Fake-Kommentar rot. Mit dem Skript von heute postet der erste Fall
  aus dem Standardordner; die Zeile im Progress Log nennt es.
- Der nächste kanal-Goal, der postet, nimmt `python3 ops/post-the-answers.py --verify-posted --folder <sein ordner>` als
  `Prüfung (Netz)` seines Postpunkts; das schreibt der Writer, nicht dieses Goal.
- Traction: Jede Antwort, die genau so draußen steht wie freigegeben, ist ein Betreiber, der den Weg zu `postyourprice.com` liest, ohne
  dass Matthias' Konto etwas sagt, das er nicht gesagt hat.
- Dieses Goal postet nichts (kein `--send` gegen GitHub) und braucht kein Human Gate. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout.

## Done Condition
- [x] Beide Skripte lesen Argumente über dieselbe Funktion, `--folder=<ordner>` wirkt wie `--folder <ordner>`, und ein unbekanntes
      Argument endet mit Exit 1, bevor etwas gesendet wird.
      Prüfung: `pnpm -s vitest run test/answers-folder.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(.*(folder=|unknown argument)" test/answers-folder.test.ts` muss mindestens 2 ausgeben.
      Prüfung: `python3 ops/post-the-answers.py --no-such-flag >/dev/null 2>&1; echo $?` muss `1` ausgeben.
      Prüfung: `grep -c 'if "--folder" in argv' ops/post-the-answers.py` muss 0 ausgeben.
- [x] `--verify-posted` vergleicht die Kommentare aus `ops/posted-answers.log` mit den Entwürfen und endet bei Abweichung mit Exit 1;
      gegen GitHub sind die drei Kommentare vom 11.11.2026 gleich.
      Prüfung: `grep -cE "^\s*(it|test)\(.*verify" test/answers-folder.test.ts` muss mindestens 2 ausgeben.
      Prüfung (Netz): `python3 ops/post-the-answers.py --verify-posted --folder goals/kanal/antworten | tail -1` muss `VERIFY POSTED OK: 3 same` ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Kein Kommentar in einem fremden Repo geschrieben, geändert oder gelöscht.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`
- `ops/posted-answers.log` und die Entwürfe unter `goals/kanal/antworten/`: nur lesen
- jedes `--send` gegen GitHub, jeder Kommentar in `Conway-Research/automaton` (Human Gate `public_post`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-12 Zyklus 1: Punkte 1, 2, 3 gebaut: gemeinsame Argument-Funktion `ops/answers_args.py` für Gatter und Postwerkzeug (unbekanntes Argument Exit 1 vor jedem Netzaufruf, `--folder=` wie `--folder`), dazu `--verify-posted` nur lesend; die sechs neuen Tests waren vor dem Fix rot (alte Skripte, leere `answers_args.py` nur für den Copy-Schritt): `--folder=… --send 1` postete 0 statt 1 (Rückfall auf den Standardordner), beide Unknown-Argument-Tests liefen ins Gatter statt Exit 1, die drei Verify-Tests bekamen den Gatter-Lauf statt `VERIFY POSTED`; Gegenprobe Verify: Vergleich auf `if False` gesetzt macht den Ein-Zeichen-Test rot, gegen GitHub mit einem Zeichen geändert in einer Kopie von 430.md `DIFFERS #430`, Exit 1. Prüfbefehle: `pnpm -s vitest run test/answers-folder.test.ts` Exit 0 (13 passed); grep folder=/unknown argument 3; `--no-such-flag` 1; grep `if "--folder" in argv` 0; grep verify 3; (Netz) `--verify-posted --folder goals/kanal/antworten | tail -1` `VERIFY POSTED OK: 3 same`; `node scripts/check.mjs` Exit 0 (1340 passed, erster Lauf 1 rot in `test/abort-purchase.test.ts` bei Load 161, allein 6 passed, zweiter Lauf grün).
- 2026-11-12 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, nach Merge von `origin/dev` (8d52eb9) in den Goal-Branch. Prüfbefehle: `pnpm -s vitest run test/answers-folder.test.ts` Exit 0 (13 passed); grep folder=/unknown argument 3; `--no-such-flag` 1; grep `if "--folder" in argv` 0; grep verify 3; (Netz) `--verify-posted --folder goals/kanal/antworten | tail -1` `VERIFY POSTED OK: 3 same`; `node scripts/check.mjs` Exit 0 (1340 passed, Load 161).
- 2026-11-12 Release: PASS K, B (Zyklus 2), DONE.

## Blockers
