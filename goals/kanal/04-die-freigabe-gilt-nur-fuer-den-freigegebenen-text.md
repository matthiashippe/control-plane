# Kanal Goal 04: Die Freigabe gilt nur für den freigegebenen Text

## Status
PLANNED

## Active Objective
Matthias gibt am Human Gate `public_post` einen Text frei, aber `ops/post-the-answers.py --send` liest den Entwurf erst beim Senden
aus der Datei. Wird `goals/kanal/antworten*/<n>.md` zwischen seinem „ok“ und dem Lauf geändert, geht der geänderte Text unter seinem
Namen in ein fremdes Repo, und `--verify-posted` meldet danach `same`, weil es gegen denselben geänderten Entwurf vergleicht. Nach
diesem Goal bindet ein Hash die Freigabe an den Text: Der Trockenlauf druckt je Entwurf die ersten 12 Zeichen von `sha256` über
`body_to_send`, die Schritte für Matthias am Gate nennen sie, und `--send` postet nur mit `--approved <n>:<sha12>,…` bei gleichem
Wert, sonst Exit 1 ohne POST. Nach jedem POST liest das Werkzeug genau diesen Kommentar zurück und endet mit `DIFFERS` und Exit 1, wenn
er nicht der gesendete Text ist. Beide Skripte laden `answers_args` auch unter `python3 -I`. Läuft vor dem nächsten `public_post`.
Widerlegt, wenn ein nach dem Trockenlauf geänderter Entwurf schon heute nicht gesendet wird.
MVP: Funktion, weil „postet nur den freigegebenen Text“ erst dann stimmt, wenn der Text selbst das Senden erlaubt und nicht der
Dateiname; jeder Kommentar steht öffentlich unter Matthias' Konto und lässt sich nicht zurückholen.

## Voraussetzungen
- kanal Goal 03 DONE

## Kontext für den Maker
- Übernimmt `goals/_vorschlaege/kanal-kritik-2026-11-12-1.md` (Freigabe an den Text binden) und
  `goals/_vorschlaege/kanal-kritik-2026-11-12-2.md` (Import unter `python3 -I`, Rücklesen nach dem POST). Heute liest die
  Sendeschleife `body = body_to_send((FOLDER / f"{number}.md").read_text())` ohne Vergleich mit einem Wert aus der Freigabe, und
  `python3 -I ops/post-the-answers.py --selftest` endet mit `ModuleNotFoundError: No module named 'answers_args'`.
- Der Wert: `hashlib.sha256(body.encode("utf-8")).hexdigest()[:12]`, klein geschrieben, über genau den String, den `body_to_send`
  liefert. Der Trockenlauf druckt ihn je Entwurf in einer eigenen Zeile `  #<n>  sha12 <wert>` und am Ende die fertige Sendezeile mit
  `--only` in der Reihenfolge des Trockenlaufs und `--approved <n>:<wert>,…` für genau diese Nummern, damit der Tech Lead sie in die
  Schritte für Matthias übernimmt.
- `--approved` liest `ops/answers_args.py` (Wert wie `--folder`, als `--approved x` und `--approved=x`); nur das Postwerkzeug nimmt
  es an, das Gatter `ops/before-the-answers.py` lehnt es wie jedes unbekannte Argument mit `REFUSED: unknown argument` ab. Ein Wert,
  der nicht `<nummer>:<12 Hexziffern>` ist, eine Nummer zweimal oder eine Nummer, die nicht unter den zu sendenden steht, ist
  `REFUSED` mit Exit 1, bevor GitHub gefragt wird.
- `--send <k>` ohne `--approved` ist `REFUSED: --send needs --approved …` mit Exit 1, ebenfalls bevor das Gatter oder GitHub gefragt
  wird. Mit `--approved` prüft das Werkzeug vor dem ersten POST jede Nummer, die gesendet würde: Sie braucht genau einen Wert, und der
  muss zum aktuellen Entwurf passen; fehlt einer oder weicht einer ab, geht gar nichts raus (`REFUSED: #<n> changed since it was
  approved` oder `REFUSED: #<n> is not approved`), damit kein halbes Paket unter Matthias' Namen steht. Gesendet wird der String, über
  den der Wert gerechnet wurde, aus dem Speicher, nicht ein zweites Mal aus der Datei gelesen, denn zwischen zwei POSTs liegen 90 s.
- Rücklesen: Nach jedem POST mit Exit 0 schreibt das Werkzeug wie heute die Zeile nach `ops/posted-answers.log` (der Kommentar steht
  ja), dann liest es den Kommentar über die ID aus der URL wie `verify_posted` (`gh api repos/<repo>/issues/comments/<id> --jq .body`,
  genau ein angehängtes `\n` weg, sonst Byte für Byte) und vergleicht mit dem gesendeten String. Weicht er ab oder ist er nicht
  lesbar, druckt es `DIFFERS #<n>: …`, sendet nichts mehr und endet mit Exit 1. Die Vergleichsregel gibt es danach genau einmal im Code
  (eine Funktion für `verify_posted` und das Rücklesen). `verify_posted` bleibt in Verhalten und Ausgabe, wie es ist.
- Import unter `python3 -I`: In beiden Skripten vor `import answers_args` das Verzeichnis des Skripts selbst in `sys.path`
  (`pathlib.Path(__file__).resolve().parent`), nie das Arbeitsverzeichnis. Im Gatter ändert sich sonst nichts.
- Tests ohne Netz mit den Fakes aus `test/answers-folder.test.ts` (`gh`, `curl`, `ssh` auf `PATH`, Aufrufe im Log). Der Fake `gh`
  merkt sich den gesendeten Body und gibt ihn beim Rücklesen zurück; eine Umgebungsvariable lässt ihn einen anderen Text oder 404
  liefern. Die gemeinsame Sandbox darf dafür in eine Hilfsdatei unter `test/` wandern. Die neuen Fälle stehen in
  `test/answers-approved.test.ts`, mindestens: Trockenlauf druckt den Wert, der zu `sha256` des Bodys passt (im Test unabhängig mit
  `node:crypto` gerechnet); `--send` mit passendem Wert postet; ein Entwurf, der nach dem Trockenlauf um ein Zeichen geändert wird,
  ergibt Exit 1 und keinen POST (Testname enthält `changed after the dry run`); `--send` ohne `--approved` ergibt Exit 1 und keinen
  Aufruf von `gh`; ein Wert für die eine von zwei Nummern ergibt Exit 1 und keinen POST; Rücklesen mit anderem Text ergibt `DIFFERS` (Testname enthält `DIFFERS`),
  Exit 1 und keinen zweiten POST; das Gatter lehnt `--approved` ab. Die bestehenden Fälle in `test/answers-folder.test.ts` bleiben
  mit ihren Erwartungen stehen und bekommen nur das nötige `--approved`; keiner wird gestrichen, keine Erwartung gelockert.
- Rot vor dem Fix: Jeder neue Test lief einmal gegen den Stand von `origin/dev` und war rot; die Zeile im Progress Log nennt, womit.
  Der Fall `changed after the dry run` ist die Widerlegung oben: Ist er schon vor dem Fix grün, endet das Goal mit `BLOCKED fachlich`
  und dieser Begründung unter `## Ehrliche Lücken`.
- Docstring des Postwerkzeugs: Die Beispielzeilen oben nennen `--approved`, und Punkt 1 der Liste „Every one of these has to hold“
  sagt, dass die Freigabe der Wert ist und nicht das Gespräch.
- `goals/kanal/ANNAHMEN.md`: eine Zeile `- <Datum>, kanal 04: …`, dass die Schritte am Gate `public_post` je Kommentar den Wert aus
  dem Trockenlauf nennen und die Sendezeile mit `--approved` enthalten, und wie die Freigabe am Topic dann aussieht.
- Kein `--send` gegen GitHub in diesem Goal, kein Human Gate: Alles hier ist mit Fakes prüfbar. Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout.

## Done Condition
- [ ] Der Trockenlauf druckt je Entwurf die ersten 12 Zeichen von `sha256` über `body_to_send` und die Sendezeile mit `--approved`,
      und `--send` postet nur bei gleichem Wert für jede Nummer, sonst Exit 1 ohne einen einzigen POST; ein nach dem Trockenlauf
      geänderter Entwurf geht nicht raus.
      Prüfung: `pnpm -s vitest run test/answers-approved.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/answers-approved.test.ts` muss mindestens 6 ausgeben.
      Prüfung: `pnpm -s vitest run test/answers-approved.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed"&&/changed after the dry run/.test(a.title)).length)})'` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "node:crypto" test/answers-approved.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `d=$(mktemp -d); printf '#!/bin/sh\nexit 9\n' >"$d/gh"; chmod +x "$d/gh"; PATH="$d:/usr/bin:/bin" python3 -I ops/post-the-answers.py --folder goals/kanal/antworten-03 --send 1 2>&1 | grep -c "REFUSED: .*--approved"` muss 1 ausgeben.
      Prüfung: `python3 ops/before-the-answers.py --approved 1:abcdefabcdef 2>&1 | tail -1` muss `REFUSED: unknown argument --approved` ausgeben.
- [ ] Nach jedem POST liest das Werkzeug genau diesen Kommentar zurück und endet mit `DIFFERS` und Exit 1, wenn er nicht der gesendete
      Text ist; `--verify-posted` bleibt, wie es ist.
      Prüfung: `pnpm -s vitest run test/answers-approved.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed"&&/DIFFERS/.test(a.title)).length)})'` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/answers-folder.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/answers-folder.test.ts` muss mindestens 13 ausgeben.
- [ ] Beide Skripte laden `answers_args` unter `python3 -I` und aus jedem Arbeitsverzeichnis.
      Prüfung: `r=$(pwd); cd "$(mktemp -d)" && python3 -I "$r/ops/post-the-answers.py" --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `r=$(pwd); cd "$(mktemp -d)" && python3 -I "$r/ops/before-the-answers.py" --bogus 2>&1 | tail -1` muss `REFUSED: unknown argument --bogus` ausgeben.
- [ ] Die Schritte am Gate `public_post` nennen den Wert: Docstring und `goals/kanal/ANNAHMEN.md` beschreiben `--approved`.
      Prüfung: `grep -c -- "--approved" ops/post-the-answers.py` muss mindestens 3 ausgeben.
      Prüfung: `grep -cE "kanal 04.*--approved|--approved.*kanal 04" goals/kanal/ANNAHMEN.md` muss mindestens 1 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Kein Pfad, auf dem ein Text ohne passenden Wert gesendet wird, auch nicht mit `--only` oder `--folder=<ordner>`.
- [ ] Die Prüflogik des Gatters `ops/before-the-answers.py` ist unverändert, nur die Importzeile kommt dazu.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`
- `ops/before-the-answers.py`: nur der Pfad für den Import, die Prüfungen des Gatters bleiben unverändert
- `ops/posted-answers.log`, `goals/kanal/antworten/**`, `goals/kanal/antworten-03/**`, `goals/kanal/issues*.md`,
  `goals/kanal/ertrag.md` und die Goal-Dateien kanal 01 bis 03: nur lesen
- jedes `--send` gegen GitHub, jeder Kommentar in `Conway-Research/automaton` (Human Gate `public_post`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
