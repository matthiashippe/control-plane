# Kanal Goal 08: Gepostet wird der freigegebene Text aus dem Speicher

## Status
PLANNED

## Active Objective
Seit kanal 04 postet `ops/post-the-answers.py --send … --approved …` nur Entwürfe, deren `sha12` gleich dem freigegebenen Wert ist,
und hält die geprüften Texte danach im Speicher (`bodies[number]`): Ein Entwurf, der in den 90 s zwischen zwei Posts geändert wird, geht
nicht raus. Der Code am Stand dev ist richtig, aber kein Test hält das fest. Liest die Sendeschleife den Entwurf vor dem POST wieder aus
der Datei, bleiben alle Fälle in `check` grün, und der zweite Kommentar eines Pakets stünde unter Matthias' Konto, ohne an die Freigabe
des Tech Leads gebunden zu sein; das Rücklesen nach dem POST fängt es nicht, weil es mit dem gesendeten Text vergleicht. Nach diesem Goal
ändert der nachgebaute `gh` beim ersten POST den zweiten Entwurf, ein Test verlangt, dass der zweite POST genau den freigegebenen Text
trägt, und derselbe Test wird rot, sobald die Sendeschleife die Datei neu liest.
Widerlegt, wenn dieses Nachlesen schon heute einen Fall in `check` rot macht.
MVP: Funktion, weil danach ein Rückfall auf das zweite Lesen der Datei in `check` rot wird; vorher ginge er grün durch und der zweite
Kommentar eines Pakets wäre nicht mehr an die Freigabe gebunden.

## Voraussetzungen
- kanal Goal 06 DONE

## Kontext für den Maker
- Ziel: Unter Matthias' Konto geht in Conways Tracker nur der Text raus, den der Tech Lead freigegeben hat, auch beim zweiten und
  dritten Kommentar eines Pakets.
- Startbedingung aus `ROADMAP.md`: Das Glied gilt nur, wenn kanal 06 in `goals/kanal/ertrag.md` eine neue Runde Kommentare wählt
  (`Nächste Runde: Antwortpaket` oder weitere Kommentare über `ops/post-the-answers.py`); sonst entfällt es. Deshalb steht kanal 06 unter
  Voraussetzungen. Wählt kanal 06 einen anderen Kanal, setzt die Loop-Kritik dieses Goal vor dem Start auf `PAUSED` (Zeile `Pause:`
  unter `## Blockers`).
- Herkunft: Das Glied hieß bis 21.11.2026 kanal 07 und übernimmt `goals/_vorschlaege/kanal-nacharbeit-2026-11-14-1.md` (Linse Q, Mutation
  M4 der Linse K in kanal 04). kanal 07 trägt denselben Test als Punkt 3 und steht seit dem Kurs-Check vom 25.11.2026 auf `PAUSED`. Es ist
  keine Voraussetzung, weil dieser Test den Trockenlauf aus kanal 07 nicht braucht. Namen, Schalter und Testname sind dieselben wie dort
  (`FAKE_EDIT_ON_POST`, `FAKE_NO_SLEEP`, `from memory`), damit kanal 07 Punkt 3 nach diesem Goal schon grün ist. Steht der Test beim
  Start schon auf dem Integrationszweig, baut der Maker nichts neu, sondern führt die Prüfbefehle aus und nennt das im Progress Log.
- Schalter `FAKE_EDIT_ON_POST=<datei>` im nachgebauten `gh` in `test/answers-sandbox.ts`: Beim ersten POST (der Ordner `<log>.posted` ist
  noch leer) überschreibt er diese Datei mit einem anderen, gültigen Entwurf, bevor er die URL ausgibt. Der Kopfkommentar der Datei nennt
  den Schalter neben `FAKE_READBACK` und `FAKE_COMMENTS`.
- Die 90 s zwischen zwei Posts überspringt nur der Test: Die Sandbox legt bei `FAKE_NO_SLEEP` eine `sitecustomize.py` mit
  `import time; time.sleep = lambda s: None` in einen eigenen Ordner und setzt ihn als `PYTHONPATH` (der Lauf ist dann nicht `-I`).
  `GAP_SECONDS = 90` im Skript bleibt, und kein Schalter des Skripts verkürzt die Pause. Ohne das bricht `spawnSync` nach 60 s ab.
- Test in `test/answers-approved.test.ts`, Testname enthält `from memory`: Sandbox mit `434.md` = `GOOD` und `436.md` = `OTHER`,
  `--send 2 --approved 434:<sha12 GOOD_BODY>,436:<sha12 OTHER_BODY>` mit `FAKE_EDIT_ON_POST=<Pfad von 436.md>` und `FAKE_NO_SLEEP=1`.
  Erwartet: Exit 0, genau zwei POSTs, der erste mit `body=${GOOD_BODY}`, der zweite mit genau `body=${OTHER_BODY}`, beide `read back:
  same`, und `436.md` trägt nach dem Lauf den geänderten Text (Beleg, dass der Schalter griff).
- Rot vor dem Fix: Gegen ein Skript, dessen Zeile `body = bodies[number]` durch
  `body = body_to_send((FOLDER / f"{number}.md").read_text())` ersetzt ist, ist der Test rot. Das prüft der Befehl in einer Wegwerfkopie;
  die Zeile im Progress Log nennt die Ausgabe.
- `ops/post-the-answers.py` bleibt, wie es ist: Sendeschleife, `bodies`, der POST mit `-f body=…`, `GAP_SECONDS`, `DAILY_CAP`, das
  Rücklesen. Das Goal ändert nur Tests und `goals/kanal/ANNAHMEN.md`.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein `--send` gegen GitHub,
  kein Kommentar in `Conway-Research/automaton`.

## Done Condition
- [ ] `--send` postet den freigegebenen Text aus dem Speicher: Ein Entwurf, der beim ersten POST geändert wird, geht als zweiter
      Kommentar mit dem freigegebenen Text raus, und beide lesen sich als `same` zurück.
      Prüfung: `pnpm -s vitest run test/answers-approved.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/answers-folder.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/answers-approved.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed"&&/from memory/.test(a.title)).length)})'` muss mindestens 1 ausgeben.
      Prüfung: `cat test/answers-approved.test.ts test/answers-folder.test.ts | grep -cE "^\s*(it|test)\("` muss mindestens 30 ausgeben.
- [ ] Der nachgebaute `gh` ändert auf Wunsch beim ersten POST einen Entwurf, und die Pause zwischen zwei Posts entfällt nur im Test.
      Prüfung: `grep -c "FAKE_EDIT_ON_POST" test/answers-sandbox.ts` muss mindestens 2 ausgeben.
      Prüfung: `grep -c "FAKE_NO_SLEEP" test/answers-sandbox.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "sitecustomize" test/answers-sandbox.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "^GAP_SECONDS = 90$" ops/post-the-answers.py` muss 1 ausgeben.
      Prüfung: `grep -c "time.sleep(GAP_SECONDS)" ops/post-the-answers.py` muss 1 ausgeben.
- [ ] Der Test wird rot, wenn die Sendeschleife den Entwurf vor dem POST neu aus der Datei liest.
      Prüfung: `d=$(mktemp -d) && git archive HEAD | tar -x -C "$d" && ln -s "$PWD/node_modules" "$d/node_modules" && sed -i 's|body = bodies\[number\]|body = body_to_send((FOLDER / f"{number}.md").read_text())|' "$d/ops/post-the-answers.py" && grep -c 'body = bodies\[number\]' "$d/ops/post-the-answers.py"` muss 0 ausgeben.
      Prüfung: `d=$(mktemp -d) && git archive HEAD | tar -x -C "$d" && ln -s "$PWD/node_modules" "$d/node_modules" && sed -i 's|body = bodies\[number\]|body = body_to_send((FOLDER / f"{number}.md").read_text())|' "$d/ops/post-the-answers.py" && (cd "$d" && pnpm -s vitest run test/answers-approved.test.ts -t "from memory" >/dev/null 2>&1; echo $?)` muss `1` ausgeben.
- [ ] Das Goal ändert nur Tests, seine Annahmen und die eigene Goal-Datei.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(test/answers-(sandbox\.ts|approved\.test\.ts)|goals/kanal/(ANNAHMEN\.md|08-gepostet-wird-der-freigegebene-text-aus-dem-speicher\.md|verdicts/08-z[0-9]+-[A-Z]\.md))$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops/ src/ | grep -c .` muss 0 ausgeben.
- [ ] Die Annahmen des Goals stehen in `goals/kanal/ANNAHMEN.md`.
      Prüfung: `grep -cE "^- [0-9-]+, kanal 08: " goals/kanal/ANNAHMEN.md` muss mindestens 1 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der neue Test war gegen die nachlesende Sendeschleife rot; die Zeile im Progress Log nennt die Ausgabe.
- [ ] Kein bestehender Fall in `test/answers-approved.test.ts` oder `test/answers-folder.test.ts` entfällt oder wird gelockert.
- [ ] Code, Kommentare und Testnamen Englisch, `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `.env*`
- `ops/**`: unverändert, auch `ops/post-the-answers.py`, `ops/before-the-answers.py`, `ops/answers_args.py`, `ops/relink_rules.py`
- `test/answers-folder.test.ts`: unverändert
- `ops/posted-answers.log`, `ops/relinked-comments.log`, `goals/kanal/antworten/**`, `goals/kanal/antworten-03/**`,
  `goals/kanal/issues*.md`, `goals/kanal/ertrag.md` und die Goal-Dateien kanal 01 bis 07: nur lesen
- jedes `--send` gegen GitHub, jeder Kommentar in `Conway-Research/automaton`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
