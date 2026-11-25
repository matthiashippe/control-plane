# Kanal Goal 07: Der Tech Lead liest genau den Text, über den der Wert gerechnet ist

## Status
PAUSED

## Active Objective
Seit dem 22.11.2026 gibt der Tech Lead jeden Kommentar in `Conway-Research/automaton` frei, nicht mehr Matthias (`LOOP.md`,
Kommentare in fremden Repos): Sein „ok“ mit den Werten `sha12` ist die Freigabe, und `ops/post-the-answers.py --send … --approved …`
postet nur den Text, über den der Wert gerechnet ist. Der Trockenlauf druckt aber je Entwurf nur die ersten 90 Zeichen
(`opens: …`) neben dem Wert. Wer freigibt, liest den Text also aus einer anderen Quelle (Entwurfsdatei, Progress Log) als der, über die
der Wert gerechnet wurde, und ein Unterschied zwischen beiden fällt erst nach dem Post auf. Nach diesem Goal druckt der Trockenlauf je
Entwurf den vollen `body_to_send` zwischen `--- #<n> sha12 <wert> ---` und `--- end #<n> ---`, Text und Wert stehen in einer
Ausgabe, und ein Test hält fest, dass der Block Byte für Byte der gesendete Text ist und der Wert über genau ihn gerechnet ist. Dazu
hält ein zweiter Test fest, dass `--send` den freigegebenen Text aus dem Speicher postet: Ein Entwurf, der in den 90 s zwischen zwei
Posts geändert wird, geht nicht raus.
Widerlegt, wenn der Trockenlauf schon heute den vollen Text druckt.
MVP: Funktion, weil die Freigabe eines Kommentars unter Matthias' Konto sonst über einen Text erteilt wird, den der Freigebende nicht
aus derselben Ausgabe gelesen hat, aus der der Wert stammt.

## Voraussetzungen
- kanal Goal 06 DONE

## Kontext für den Maker
- Ziel: Der Tech Lead gibt einen Kommentar in Conways Tracker nur für den Text frei, den er ganz gelesen hat, und unter Matthias' Konto
  geht genau dieser Text raus.
- Startbedingung aus `ROADMAP.md`: Das Glied gilt nur, wenn kanal 06 in `goals/kanal/ertrag.md` eine neue Runde Kommentare wählt
  (`Nächste Runde: Antwortpaket` oder weitere Kommentare über `ops/post-the-answers.py`); sonst entfällt es. Deshalb steht kanal 06 unter
  Voraussetzungen. Wählt kanal 06 einen anderen Kanal, setzt die Loop-Kritik dieses Goal vor dem Start auf `PAUSED` (Zeile `Pause:`
  unter `## Blockers`).
- Herkunft: Das Glied hieß bis 21.11.2026 kanal 06 und übernimmt `goals/_vorschlaege/kanal-kritik-2026-11-13-1.md` und
  `goals/_vorschlaege/kanal-kritik-2026-11-13-2.md`. Punkt 3 übernimmt `goals/_vorschlaege/kanal-nacharbeit-2026-11-14-1.md`: Es stand bis
  21.11.2026 als Glied 07 in `ROADMAP.md` und fiel bei der Umnummerierung (249d0cc) aus der Kette, obwohl der Vorschlag `Übernommen:`
  trägt (Tech Lead, 25.11.2026). Beide Punkte sichern dieselbe Eigenschaft am selben Werkzeug und in derselben Testdatei.
- Gate `public_post`: Den Text der ROADMAP („die Schritte am Gate `public_post`“) liest dieses Goal nach `LOOP.md` vom 22.11.2026: Wer
  einen Kommentar für eine Runde vorlegt, nimmt Text und Wert aus genau einem Block dieser Ausgabe. Das steht im Docstring von
  `ops/post-the-answers.py` unter Punkt 1 (statt „the steps at the human gate `public_post` name those values“), mit dem Format
  `--- #<n> sha12 <value> ---`. `LOOP.md` selbst bleibt unverändert.
- Trockenlauf: Statt der Zeile `opens: {first[:90]}` druckt `ops/post-the-answers.py` je Entwurf eine Zeile
  `--- #<n> sha12 <wert> ---`, dann `body_to_send` unverändert (der Text endet schon mit `\n`, also `print(body, end="")`), dann eine
  Zeile `--- end #<n> ---`. Die Zeilen `  #<n>  <a> of <b> characters …`, `  #<n>  sha12 <wert>` und die Sendezeile bleiben im
  bisherigen Wortlaut, weil die Prüfungen von kanal 04 sie jede Nacht lesen. Ein Entwurf mit `WOULD REFUSE` bekommt keinen Block.
- Kommentar über der Reihenfolge: Die Zeile `#   ops/post-the-answers.py --send 3 --only 335,373,385` nennt die Sendezeile wie der
  Docstring: `#   ops/post-the-answers.py --send 3 --only 335,373,385 --approved 335:<sha12>,373:<sha12>,385:<sha12>`.
- Test Punkt 1 in `test/answers-approved.test.ts`, Testname enthält `full body`: Trockenlauf über `GOOD` und `OTHER`, je Nummer liest
  der Test den Block mit `/--- #(\d+) sha12 ([0-9a-f]{12}) ---\n([\s\S]*?)--- end #\1 ---\n/`; der Block ist Byte für Byte `GOOD_BODY`
  bzw. `OTHER_BODY`, und `sha12` aus `node:crypto` über den Block ist der Wert der Kopfzeile. In `test/answers-folder.test.ts` wird nur
  die Erwartung `opens: The 401 is the retry` auf den Block umgestellt, kein Fall entfällt.
- Test Punkt 3: Der nachgebaute `gh` in `test/answers-sandbox.ts` bekommt einen Schalter `FAKE_EDIT_ON_POST=<datei>`: Beim ersten POST
  überschreibt er diese Datei mit einem anderen Text. Ein Fall in `test/answers-approved.test.ts` (Testname enthält `from memory`)
  sendet `434` und `436` mit beiden freigegebenen Werten, ändert dabei `436.md`, und verlangt, dass der zweite POST genau
  `body=${OTHER_BODY}` trägt und beide zurückgelesen `same` sind. Die 90 s zwischen zwei Posts überspringt nur der Test: Die Sandbox legt
  bei `FAKE_NO_SLEEP` eine `sitecustomize.py` mit `time.sleep = lambda s: None` in einen eigenen Ordner und setzt ihn als `PYTHONPATH`;
  `GAP_SECONDS = 90` im Skript bleibt, und kein Schalter des Skripts verkürzt die Pause.
- Rot vor dem Fix: Der Test aus Punkt 1 gegen `ops/post-the-answers.py` am Stand `42e032f` (dev vor diesem Goal) ist rot; der Test aus
  Punkt 3 gegen ein Skript, dessen Sendeschleife den Entwurf vor dem POST neu liest, ist rot. Beides prüfen die Befehle in einer
  Wegwerfkopie; die Zeile im Progress Log nennt die Ausgabe.
- Die Sendeschleife bleibt, wie sie ist: `body = bodies[number]`, der POST mit `-f body=…`, `GAP_SECONDS`, `DAILY_CAP` und das Rücklesen.
  Punkt 3 ändert nur Tests.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein `--send`, kein Kommentar
  in `Conway-Research/automaton`.

## Done Condition
- [ ] Der Trockenlauf druckt je Entwurf den vollen `body_to_send` zwischen `--- #<n> sha12 <wert> ---` und `--- end #<n> ---`, der
      Block ist Byte für Byte der gesendete Text, und der Wert ist über genau ihn gerechnet; rot vor dem Fix.
      Prüfung: `pnpm -s vitest run test/answers-approved.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/answers-folder.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/answers-approved.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed"&&/full body/.test(a.title)).length)})'` muss mindestens 1 ausgeben.
      Prüfung: `cat test/answers-approved.test.ts test/answers-folder.test.ts | grep -cE "^\s*(it|test)\("` muss mindestens 31 ausgeben.
      Prüfung: `grep -c 'opens: {first\[:90\]}' ops/post-the-answers.py` muss 0 ausgeben.
      Prüfung: `grep -c -- '--- end #' ops/post-the-answers.py` muss mindestens 1 ausgeben.
      Prüfung: `grep -c -- '--- #<n> sha12' ops/post-the-answers.py` muss mindestens 1 ausgeben.
      Prüfung: `d=$(mktemp -d) && git archive HEAD | tar -x -C "$d" && ln -s "$PWD/node_modules" "$d/node_modules" && git show 42e032f:ops/post-the-answers.py >"$d/ops/post-the-answers.py" && (cd "$d" && pnpm -s vitest run test/answers-approved.test.ts -t "full body" >/dev/null 2>&1; echo $?)` muss `1` ausgeben.
- [ ] Der Kommentar über der Reihenfolge nennt die Sendezeile mit `--approved` wie der Docstring.
      Prüfung: `grep -cxF "#   ops/post-the-answers.py --send 3 --only 335,373,385 --approved 335:<sha12>,373:<sha12>,385:<sha12>" ops/post-the-answers.py` muss 1 ausgeben.
      Prüfung: `grep -cE "^#   ops/post-the-answers.py --send [0-9]+ --only [0-9,]+$" ops/post-the-answers.py` muss 0 ausgeben.
- [ ] `--send` postet den freigegebenen Text aus dem Speicher: Ein Entwurf, der beim ersten POST geändert wird, geht als zweiter
      Kommentar mit dem freigegebenen Text raus; rot, wenn die Sendeschleife den Entwurf vor dem POST neu aus der Datei liest.
      Prüfung: `pnpm -s vitest run test/answers-approved.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed"&&/from memory/.test(a.title)).length)})'` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "FAKE_EDIT_ON_POST" test/answers-sandbox.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "^GAP_SECONDS = 90$" ops/post-the-answers.py` muss 1 ausgeben.
      Prüfung: `d=$(mktemp -d) && git archive HEAD | tar -x -C "$d" && ln -s "$PWD/node_modules" "$d/node_modules" && sed -i 's|body = bodies\[number\]|body = body_to_send((FOLDER / f"{number}.md").read_text())|' "$d/ops/post-the-answers.py" && (cd "$d" && pnpm -s vitest run test/answers-approved.test.ts -t "from memory" >/dev/null 2>&1; echo $?)` muss `1` ausgeben.
      Prüfung: `git diff 42e032f HEAD -- ops/post-the-answers.py | grep -cE '^[-+].*(bodies\[number\]|GAP_SECONDS|DAILY_CAP|body=\{body\}|live_differs\(url, body)'` muss 0 ausgeben.
- [ ] Die Annahmen des Goals stehen in `goals/kanal/ANNAHMEN.md`.
      Prüfung: `grep -cE "^- [0-9-]+, kanal 07: " goals/kanal/ANNAHMEN.md` muss mindestens 1 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Die Ausgabe des Trockenlaufs nennt weiter je Entwurf `  #<n>  sha12 <wert>` und die Sendezeile im bisherigen Wortlaut.
- [ ] Code, Kommentare und Testnamen Englisch, `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `.env*`
- `ops/before-the-answers.py`, `ops/answers_args.py`, `ops/relink_rules.py`: unverändert
- `ops/post-the-answers.py`: nur der Trockenlauf, der Docstring und der Kommentar über der Reihenfolge; Sendeschleife, Freigabeprüfung,
  `--verify-posted` und `--selftest` unverändert
- `ops/posted-answers.log`, `ops/relinked-comments.log`, `goals/kanal/antworten/**`, `goals/kanal/antworten-03/**`,
  `goals/kanal/issues*.md`, `goals/kanal/ertrag.md` und die Goal-Dateien kanal 01 bis 06: nur lesen
- jedes `--send` gegen GitHub, jeder Kommentar in `Conway-Research/automaton`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
Pause: Kurs-Check 2026-11-25, Detail-Goal am Freigabeweg für Kommentare in Conway-Research/automaton, wo seit dem 11.11.2026 kein neues Issue kommt und Antworten niemanden erreichen (ROADMAP.md, Zeile paket); bringt weder Nutzer noch Käufe
