# Hosting Goal 02: Ein langer Befehl endet verlässlich und flutet den Kontext nicht

## Status
ACTIVE

## Active Objective
Ein Befehl, der in einer Sandbox im Hintergrund läuft, meldet sein Ende immer mit seinem Exit-Code, und seine Ausgabe kommt höchstens
mit den letzten 64 KB je Strom in den Kontext des Modells: `backgroundCommand` in `src/sandbox/service.ts` schreibt die Exit-Datei
über eine temporäre Datei und `mv`, `waitCommand` wertet nur eine Exit-Datei mit Inhalt als Ende und druckt von `<tag>.out` und
`<tag>.err` höchstens die letzten 64 KB (`tail -c`), davor eine Zeile mit Gesamtgröße und Pfad, damit das Modell den Rest mit
`read_file` holt. `ops/live.sh` hängt `bg_max_ms=<ms>` an die Ergebniszeile der Prüfung `sandbox`, und `ops/README.md` setzt die
Warnschwelle 27000 ms (`ROADMAP.md`, hosting 02; übernimmt `goals/_vorschlaege/sandbox-kritik-2026-11-16-2.md`).
MVP: Funktion, weil ein `npm install` oder `apt-get install` im Hintergrund heute mehrere MB in einen einzigen Aufruf und damit in
die bezahlte Inferenz des Kunden schreibt und ein Wartebefehl, der die Exit-Datei leer liest, mit einem Fehler der Bash statt mit dem
Exit-Code endet.

## Voraussetzungen
- hosting Goal 01 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Kunde, dessen Automaton in unserer Sandbox einen langen Befehl fährt, bezahlt keine Inferenz für Megabytes
  an Ausgabe und erfährt verlässlich, wie der Befehl endete. Was dem nicht dient, gehört nicht in dieses Goal.
- Maßgeblich sind `docs/sandbox/lange-befehle.md`, `goals/sandbox/ANNAHMEN.md` unter `## Goal 05` und `## Goal 09` und der Vorschlag
  `goals/_vorschlaege/sandbox-kritik-2026-11-16-2.md`. Was dieses Goal entscheidet oder misst, steht mit Grund unter `## Goal 02` in
  `goals/hosting/ANNAHMEN.md`, nie nur im Code.
- Stand heute (`dev` am 17.11.2026, `410dc0d`): `backgroundCommand` endet mit `c=$?; echo $c > <base>.exit; cat <base>.out;
  cat <base>.err >&2; exit $c`. Zwischen dem Anlegen der Datei durch die Umleitung und dem Schreiben der Zahl ist `<base>.exit` leer.
  `waitCommand` sieht die Datei mit `-f`, liest sie, liest eine leere ein zweites Mal nach einer Sekunde und endet, wenn sie dann noch
  leer ist, mit `exit ""`, also mit einem Fehler der Bash und der Zeile „The command has ended with exit code .“. Danach druckt es
  `<base>.out` und `<base>.err` vollständig; der Wrapper selbst druckt beide am Ende ebenfalls vollständig, und diese Antwort bekommt
  die Runtime, wenn der Befehl vor `EXEC_EARLY_MS` endet oder eine Wiederholung mit demselben Idempotency-Key nach dem Ende kommt.
  `bg_live` in `ops/live.sh` misst die Dauer jedes Aufrufs von `wait_command` (`now_ms`), schreibt aber nur `bg=ok` in die
  Ergebniszeile; eine schleichende Annäherung an den Abbruch der Runtime nach 30 s fällt erst als `wait-slow-<ms>` auf.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 02` in `goals/hosting/ANNAHMEN.md`):
  1. **Exit-Datei atomar.** Der Wrapper schreibt `echo $c > <base>.exit.tmp` und danach `mv -f <base>.exit.tmp <base>.exit`, mit
     einem Leerzeichen vor jedem Pfad wie heute (`mapRoot` in `harness/sandboxd/harness-run.mjs`). `mv` ist in der Sandbox da, weil das
     Image coreutils hat (der Wrapper nutzt schon `timeout`).
  2. **Nur eine Exit-Datei mit Inhalt ist ein Ende.** `waitCommand` wartet, solange `<base>.exit` fehlt oder leer ist (`-s` statt
     `-f`), und das zweite Lesen nach einer Sekunde entfällt. Eine leere Exit-Datei am Ende der Wartezeit gibt die Antwort „still
     running“ mit Exit 0, nie `exit ""`. Die erste Zeile der Antwort nach dem Ende bleibt genau
     `The command has ended with exit code <n>.`, weil `WAIT_ANSWER_JS` in `ops/live.sh` und die Runtime sie so lesen.
  3. **Höchstens 64 KB je Strom.** `export const WAIT_TAIL_BYTES = 64 * 1024;` in `src/sandbox/service.ts`. Eine gemeinsame Funktion
     baut das Stück Shell, das `<base>.out` nach stdout und `<base>.err` nach stderr druckt; `waitCommand` und `backgroundCommand`
     nutzen beide sie, weil die Antwort des Wrappers sonst denselben Weg mit Megabytes in den Kontext bringt. Ist eine Datei größer als
     `WAIT_TAIL_BYTES` (Größe mit `wc -c <`), kommt vor ihren letzten `WAIT_TAIL_BYTES` Bytes (`tail -c`) auf demselben Strom genau
     eine Zeile, die die Gesamtgröße in Bytes, die Zahl der gezeigten Bytes und den Pfad der Datei nennt und sagt, dass der Rest mit
     `read_file` zu lesen ist. Ist sie genau `WAIT_TAIL_BYTES` groß oder kleiner, kommt sie unverändert und ohne diese Zeile. Den
     Wortlaut wählt der Maker, Englisch und in klaren Worten für das Modell. Der Text von `stillRunning` nennt die Grenze.
  4. **Die Dauer der Wartebefehle steht in der Live-Prüfung.** `bg_live` gibt die längste gemessene Dauer eines Aufrufs von
     `wait_command` mit aus, die Ergebniszeile von `sandbox_live` trägt sie als eigenes Token `bg_max_ms=<ms>` direkt nach `bg=<token>`
     (0, wenn kein Aufruf lief), und das Token `bg=ok` bleibt, wie es ist, weil fertige Goals darauf prüfen. `BG_WARN_MS=27000` steht
     als Zeile in `ops/live.sh`. Die Zeile `OK sandbox: …` nennt `bg_max_ms=<ms>` und ab `BG_WARN_MS` zusätzlich das Wort `warning`
     mit der Schwelle; sie bleibt `OK`, weil ein `FAIL` der Live-Prüfung einen Revert auslöst und 27000 ms noch unter dem Abbruch
     liegen. Der Selbsttest druckt je Fall des Hintergrundschritts
     `planted background step <name>: bg=<token> waits=<n> bg_max_ms=<ms>`.
  5. **Die Schwelle steht im Betrieb.** Eine Zeile `bg_max_ms` in der Tabelle unter `## Thresholds that call for action` in
     `ops/README.md`: Schwelle 27000 ms oder mehr in der Zeile `OK sandbox:` von `ops/live.sh`, Handlung: Der Aufruf kommt dem Abbruch
     der Runtime nach 30 s nahe, also die Startzeit von `docker exec` unter gVisor auf dem Sandbox-Server lesen und `EXEC_WAIT_S`
     senken, bevor ein Aufruf reißt.
- Die neuen Fälle stehen in einer neuen Datei `test/sandbox-background-output.test.ts`, die aus `src/sandbox/service.ts` nur
  `backgroundCommand` und `waitCommand` importiert (die gibt es schon am Kopf von `dev`, sonst zeigt die Gegenprobe aus Punkt 1 nur
  einen Importfehler statt roter Fälle) und die Shell wie `test/sandbox-wait.test.ts` in einer echten Bash mit kleinem `seconds`
  fährt. Fälle: eine leere `<base>.exit` ohne Schreiber gibt nach der Wartezeit „still running“ mit Exit 0 und keine Fehlermeldung
  der Bash auf stderr; eine leere `<base>.exit`, die nach 1,5 s den Code 3 bekommt, endet mit Exit 3 und der richtigen ersten Zeile;
  `backgroundCommand` für `echo hi; exit 3` in einer echten Bash (Basis im `mktemp`-Ordner) hinterlässt `<base>.exit` mit `3` und
  keine `<base>.exit.tmp`, und ein `mv` im `PATH` davor, das sich die Lage notiert, sah `<base>.exit` vor seinem Aufruf nicht;
  `waitCommand` mit 5 MB in `<base>.out` und 5 MB in `<base>.err` druckt je Strom höchstens 65536 Bytes plus eine Zeile, nennt
  5242880 und den Pfad der Datei und endet mit den letzten Bytes der Datei; dasselbe für die Antwort von `backgroundCommand` auf einen
  Befehl, der 5 MB schreibt; eine Datei von genau 65536 Bytes kommt unverändert, eine von 65537 Bytes bekommt die Zeile; eine kleine
  Ausgabe kommt unverändert wie heute.
- Der code-host hat kein Docker: Unit-Tests in einer echten Bash und mit dem nachgebauten `sandboxd` aus `test/sandbox-world.ts`, der
  Laufzeitpfad zusätzlich mit dem Job `e2e` des Goal-PR (Runtime am Pin `d8f8168`, Wartebefehl über den nachgebauten `sandboxd`).
- Ablauf: zuerst Exit-Datei und Wartebefehl mit Tests (Punkt 1), dann die Grenze von 64 KB (Punkt 2), dann `ops/live.sh` und
  `ops/README.md` (Punkt 3), dann Doku, Annahmen, Umfang, `check` und `e2e` (Punkte 4 bis 6). Nach jedem grünen Punkt Commit und Push.
- Die Produktion ändert sich nur über den Merge und `deploy.yml` (Rollout mit dem nächsten Deploy, `src/**`); kein Lauf gegen die
  Produktion oder den Sandbox-Server in diesem Goal, `ops/live.sh` nur mit `--selftest`. Prüfbefehle ohne Netz binden keinen festen
  Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue Dateien vor dem
  lokalen `check` stagen. Progress Log und Verdicts zitieren keine Suchausdrücke der Prüfbefehle wörtlich.
- Fertige Goals prüfen weiter auf `ops/live.sh` (etwa sandbox 05 Punkt 10 auf `bg=ok` und `FAIL sandbox: background exec`, domains 03
  auf eine Zeile `OK sandbox: `) und auf `test/sandbox-wait.test.ts`; diese Stellen bleiben, wie sie sind.
- Widerlegt, wenn die neuen Fälle aus Punkt 1 schon am Kopf von `dev` grün sind; dann endet ein langer Befehl schon verlässlich und
  knapp, und das Goal endet mit dieser Messung in den Annahmen.
- Was danach schneller zu mehr zahlenden Automatons führt: hosting 03 bringt die Selbsttests der Live-Läufe im Sandbox-Weg in
  `check`, damit ein Merge, der den gehosteten Automaton bricht, vor dem Merge rot wird.

## Done Condition
- [x] Die Exit-Datei eines Befehls im Hintergrund entsteht atomar über `<base>.exit.tmp` und `mv`, und der Wartebefehl wertet nur
      eine Exit-Datei mit Inhalt als Ende; eine leere gibt „still running“ mit Exit 0. Die Tests waren vor dem Fix rot.
      MVP: Funktion, weil ein Automaton sonst bei einem leer gelesenen Exit-Code einen Fehler der Bash statt des Ergebnisses sieht und
      den Befehl neu startet oder aufgibt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-background-output.test.ts test/sandbox-wait.test.ts test/sandbox-long-exec.test.ts test/harness-sandboxd.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/sandbox-background-output.test.ts` muss mindestens 7 ausgeben.
      Prüfung: `grep -cF 'echo $c > ${base}.exit;' src/sandbox/service.ts` muss 0 ausgeben.
      Prüfung: `grep -cF '.exit.tmp' src/sandbox/service.ts` muss mindestens 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; git show $(git merge-base origin/dev HEAD):src/sandbox/service.ts > $T/src/sandbox/service.ts; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-background-output.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 5 ausgeben.
- [x] Wartebefehl und Wrapper drucken von `<base>.out` und `<base>.err` höchstens die letzten `WAIT_TAIL_BYTES` (64 KB) je Strom,
      davor bei einer größeren Datei genau eine Zeile mit Gesamtgröße, Pfad und dem Hinweis auf `read_file`; der Test mit 5 MB war vor
      dem Fix rot.
      MVP: Funktion, weil der Kunde jede Zeile im Kontext des Modells als Inferenz bezahlt und ein `npm install` mehrere MB schreibt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-background-output.test.ts test/sandbox-api.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cxE "export const WAIT_TAIL_BYTES = 64 \* 1024;" src/sandbox/service.ts` muss 1 ausgeben.
      Prüfung: `grep -c "tail -c" src/sandbox/service.ts` muss mindestens 1 ausgeben.
      Prüfung: `for w in 65536 65537 5242880 read_file .exit.tmp; do grep -qF -- "$w" test/sandbox-background-output.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] `ops/live.sh` trägt die längste Dauer eines Wartebefehls als `bg_max_ms=<ms>` in die Ergebniszeile und die Zeile
      `OK sandbox:`, warnt ab 27000 ms ohne `FAIL`, und `ops/README.md` nennt die Schwelle mit Handlung.
      MVP: Funktion, weil ein Aufruf über 30 s in der Runtime abbricht und der Betrieb das vorher sehen muss, nicht erst als `FAIL`.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/live-selftest.test.ts` muss Exit-Code 0 haben.
      Prüfung: `out=$(PATH=/usr/bin:$PATH bash ops/live.sh --selftest 2>&1); echo "last=$(tail -n 1 <<<"$out") ok=$(grep -c 'planted background step ok: bg=ok waits=2 bg_max_ms=25000' <<<"$out")"` muss genau `last=LIVE SELFTEST OK ok=1` ausgeben.
      Prüfung: `grep -cE "^BG_WARN_MS=27000( |$)" ops/live.sh` muss 1 ausgeben.
      Prüfung: `grep -c "bg_max_ms" test/live-selftest.test.ts` muss mindestens 3 ausgeben (die Zeile des Selbsttests für den Fall `ok`, eine Zeile `OK sandbox:` mit `bg_max_ms=26999` ohne `warning` und eine mit `bg_max_ms=27000` und `warning`).
      Prüfung: `awk '/^## Thresholds that call for action/{f=1;next} /^## /{f=0} f' ops/README.md | grep "bg_max_ms" | grep -c "27000"` muss 1 ausgeben.
- [x] Die Doku sagt, wie ein Befehl im Hintergrund endet und wie viel Ausgabe zurückkommt, und die Entscheidungen stehen mit Grund in
      den Annahmen.
      MVP: Funktion, weil ein Kunde, dessen Automaton nur das Ende einer langen Ausgabe sieht, wissen muss, wo der Rest liegt.
      Prüfung: `grep -cE "WAIT_TAIL_BYTES|tail -c|64 KB" docs/sandbox/lange-befehle.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "bg_max_ms" docs/sandbox/lange-befehle.md` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^## Goal 02/{f=1} f' goals/hosting/ANNAHMEN.md | grep -ciE "exit.tmp|mv -f|WAIT_TAIL_BYTES|read_file|bg_max_ms|27000|Wrapper"` muss mindestens 5 ausgeben.
- [x] Das Goal ändert nur Control Plane, Live-Prüfung, Doku und Tests, weder `sandboxd`, Image und Server noch Runtime, Zahlung,
      Anmeldung, Automaton, Deploy oder CI, und bringt keinen Schlüssel ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8), die Runtime am Pin die Referenz bleibt (Grundregel 13) und beide
      Änderungen im Control Plane liegen.
      Prüfung: `git diff --name-only origin/dev...HEAD -- ops/sandbox harness/runtime src/payments src/auth src/automaton deploy .github scripts/check.mjs | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vcE '^(src/sandbox/service\.ts|ops/live\.sh|ops/README\.md|docs/sandbox/lange-befehle\.md|harness/sandboxd/|test/|goals/hosting/)'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5})'` muss 0 ausgeben.
- [x] `check` ist grün, und der Job `e2e` des Goal-PR ist grün.
      MVP: Funktion, weil Wrapper und Wartebefehl auf dem Laufzeitpfad liegen und erst der Gang mit der unveränderten Runtime zeigt,
      dass ein langer Befehl weiter endet und gelesen wird (Grundregel 13).
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/hosting-02 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [x] Die Zeile vor einer gekürzten Ausgabe schickt das Modell nicht zum Lesen der ganzen Datei: Sie sagt, dass `read_file` die
      ganze Datei mit allen Bytes in den Kontext bringt, und nennt für `exec` einen Befehl, der nur einen Teil liest, `grep -n` zum
      Suchen und `sed -n '<von>,<bis>p'` für einen Zeilenbereich, je mit dem Pfad der Datei. Doku und Annahmen sagen dasselbe. Der
      Test war vor dem Fix rot.
      MVP: Funktion, weil `read` in `src/sandbox/service.ts` die Datei ungekürzt durchreicht und ein Modell, das dem heutigen Hinweis
      folgt, die 5 MB eines `npm install` im nächsten Aufruf doch in den bezahlten Kontext holt (Kritik Tech Lead 17.11.2026).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-background-output.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "sed -n" src/sandbox/service.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -cF "grep -n" src/sandbox/service.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "sed -n" test/sandbox-background-output.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "sed -n" docs/sandbox/lange-befehle.md` muss mindestens 1 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jeder neue Fall, der ein neues Verhalten verlangt, war vor dem Fix rot; die Zeile im Progress Log
      nennt, womit.
- [ ] Die erste Zeile der Antwort nach dem Ende bleibt `The command has ended with exit code <n>.`, und eine kleine Ausgabe kommt
      Byte für Byte wie heute.
- [ ] Der Text, den das Modell vor einer gekürzten Ausgabe liest, sagt in klaren Worten, wie groß sie ist, wo sie liegt und wie es
      den Rest liest.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei, Doku und Annahmen Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `ops/sandbox/**`, `src/payments/**`, `src/auth/**`, `src/automaton/**`, `ops/conway-series.sh`,
  `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `/root/.automaton/wallet.json` in jeder Sandbox: nie lesen, kopieren oder ausgeben
- der Zahlungsserver `76.13.144.207` und der Sandbox-Server `srv1327036`: kein Zugriff in diesem Goal, kein Rollout, kein Neustart;
  `ops/live.sh` läuft nur mit `--selftest`
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-17 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut (Hülle schreibt den Exit-Code über eine temporäre Datei und `mv -f`, Wartebefehl endet nur bei einer Exit-Datei mit Inhalt, Wartebefehl und Hülle drucken je Strom höchstens die letzten 64 KB nach einer Zeile mit Größe, Pfad und `read_file`, `bg_max_ms` mit Warnung ab 27000 ms in `ops/live.sh` und `ops/README.md`, Doku und Annahmen); rot vor dem Fix: 6 von 8 Fällen in `test/sandbox-background-output.test.ts` mit `service.ts` der Merge-Basis (die zwei Fälle für unverändertes Verhalten grün), die neuen Assertions in `test/live-selftest.test.ts` mit `ops/live.sh` von `dev`, der Selbsttest mit Messung ohne Maximum und mit verschobener Schwelle (`LIVE SELFTEST FAIL`). Prüfbefehle: Punkt 1 vitest Exit 0, 8 Fälle, 0, 2, Gegenprobe 6; Punkt 2 vitest Exit 0, 1, 2, nichts; Punkt 3 vitest Exit 0, `last=LIVE SELFTEST OK ok=1`, 1, 10, 1; Punkt 4 1, 1, 11; Punkt 5 0, 0, 0, 0; Punkt 6 `check` grün in 78 s, `e2e` an PR #240 SUCCESS.
- 2026-11-17 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6 (`dev` war schon im Branch, kein neuer Code). Prüfbefehle: Punkt 1 vitest Exit 0, 8, 0, 2, Gegenprobe 6; Punkt 2 vitest Exit 0, 1, 2, nichts; Punkt 3 vitest Exit 0, `last=LIVE SELFTEST OK ok=1`, 1, 10, 1; Punkt 4 1, 1, 11; Punkt 5 0, 0, 0, 0; Punkt 6 `check` grün in 57 s, `e2e` an PR #240 am Kopf `ccaa707` SUCCESS.
- 2026-11-17 Zyklus 3: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7 (Punkt 7 aus der Kritik gebaut: die Zeile vor einer gekürzten Ausgabe warnt vor `read_file` und nennt für `exec` `grep -n` und `sed -n` mit Pfad, `stillRunning` sagt dasselbe kurz, Doku und Annahmen nachgezogen; die Zeile steht einmal in der Shell-Funktion `cut_out`, weil `e2e` am Zwischenstand `e824ecf` rot war: der Prüfer der Harness liest die Antwort mit dem Wartebefehl auf 2000 Zeichen gekürzt, sie hatte 2433, jetzt 1925); rot vor dem Fix: 3 von 8 Fällen in `test/sandbox-background-output.test.ts` und die neue Assertion in `test/sandbox-long-exec.test.ts` mit `service.ts` von `15466cd`, die Assertion auf 2000 Zeichen auch mit `service.ts` von `d06f2e4`. Prüfbefehle: Punkt 1 vitest Exit 0, 8, 0, 2, Gegenprobe 6; Punkt 2 vitest Exit 0, 1, 2, nichts; Punkt 3 vitest Exit 0, `last=LIVE SELFTEST OK ok=1`, 1, 10, 1; Punkt 4 1, 1, 14; Punkt 5 0, 1, 0, 0 (die eine Datei ist der Vorschlag `goals/_vorschlaege/hosting-kritik-2026-11-17-2.md` aus dem Kritik-Commit `15466cd`, keine Änderung des Goals); Punkt 6 `check` grün in 53 s, `e2e` am Kopf dieses Commits im Kommentar am Topic; Punkt 7 vitest Exit 0, 3, 3, 2, 2.

## Blockers
Keine.
