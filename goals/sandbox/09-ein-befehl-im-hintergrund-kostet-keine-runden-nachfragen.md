# Sandbox Goal 09: Ein Befehl im Hintergrund kostet keine Runden Nachfragen

## Status
ACTIVE

## Active Objective
Die Antwort auf ein langes `exec` aus sandbox 05 nennt im Feld `wait_command` und als letzte Zeile von `stdout` einen fertigen
Befehl, den das Modell mit dem Werkzeug `exec` ohne eigenes `timeout` (Standard 30000 ms) aufruft: Er wartet bis zu 25 s auf
`<tag>.exit` und druckt dann Exit-Code, Ausgabe und Fehler des Befehls oder sagt, dass der Befehl noch läuft. Jeder Aufruf bleibt unter
30 s, also ohne Abbruch der Runtime und ohne Zählung in ihrem Circuit Breaker. `harness/e2e/long-exec.mjs` holt das Ergebnis des
Befehls von 180 s mit genau diesem Befehl statt bis zum Ende zu schlafen, `judgeLongExec` verlangt es, und `ops/live.sh` prüft nach
jedem Rollout dasselbe durch Caddy und gVisor (`ROADMAP.md`, sandbox 09; übernimmt `goals/_vorschlaege/sandbox-kritik-2026-11-13-1.md`).
MVP: Funktion, weil ein Automaton, der beim Einrichten seines Dienstes `npm install` oder `apt-get install` fährt, heute nur „später
lesen“ erfährt: Liest er sofort, bekommt er für `<tag>.exit` eine fehlende Datei und fragt in einer Schleife nach, jede Runde eine
bezahlte Inferenz des Kunden; mit dem Befehl kostet das Warten höchstens eine Runde je 25 s.

## Voraussetzungen
- sandbox Goal 08 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Automaton, dessen Befehl länger als 20 s läuft, bekommt mit der Antwort einen Befehl, mit dem er auf das
  Ende wartet, und hat das Ergebnis nach höchstens einer Runde je 25 s statt nach einer Schleife aus Fehlern. Was dem nicht dient,
  gehört nicht in dieses Goal.
- Maßgeblich sind `docs/sandbox/lange-befehle.md`, `docs/errors.md` unter `## sandboxes` und `goals/sandbox/ANNAHMEN.md` unter
  `## Goal 05`. Was dieses Goal entscheidet oder misst, steht mit Grund unter `## Goal 09` in `goals/sandbox/ANNAHMEN.md`, nie nur im
  Code.
- Stand heute: `stillRunning` in `src/sandbox/service.ts` antwortet nach `EXEC_EARLY_MS` (20 s) mit 200, `exit_code` -1, `running`,
  `output_file`, `error_file` und `exit_code_file`; `stdout` endet mit „Read these files later with read_file, or with exec and cat.
  Do not start the command again.“ Die Runtime am Pin `d8f8168` gibt dem Modell vom `exec` nur den Text
  `exit_code: X\nstdout: S\nstderr: E` (`src/agent/tools.ts:139` am Pin), die Felder der JSON-Antwort sieht es nicht; darum muss der
  Befehl im Text stehen. Ihr Werkzeug ruft `conway.exec(command, timeout || 30000)` (`src/agent/tools.ts:115` am Pin), und ein
  `exec` bis `EXEC_HOLD_MAX_MS` (90000) hält das Control Plane bis zum Ergebnis. `harness/e2e/long-exec.mjs` schläft heute nach der
  Antwort bis `seconds + SETTLE_MS` und liest dann die Dateien aus dem Text, was ein Modell nicht kann.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 09` in `goals/sandbox/ANNAHMEN.md`):
  1. **Der Befehl.** `export const EXEC_WAIT_S = 25;` und `export function waitCommand(base: string, seconds = EXEC_WAIT_S): string` in
     `src/sandbox/service.ts`. Der Befehl prüft einmal je Sekunde, ob `<base>.exit` besteht, höchstens `seconds` Mal. Besteht sie,
     druckt er als erste Zeile von stdout `The command has ended with exit code <n>.`, danach `<base>.out`, `<base>.err` auf stderr, und
     endet mit dem Exit-Code des Befehls (124 kommt so durch). Besteht sie nicht, druckt er `The command is still running. Run the same
     command again to wait up to <seconds> more seconds.` und endet mit 0. Nur Bash, `sleep`, `cat` und `[ -f ]`, nichts, was das Image
     `sandboxd-base:2` nicht hat. Ein Leerzeichen nach jeder Umleitung wie in `backgroundCommand`, weil der Nachbau `/root` nur nach
     einem Leerzeichen, einem Anführungszeichen oder einem Trenner abbildet (`mapRoot` in `harness/sandboxd/harness-run.mjs`).
     Grund für 25 s: 5 s Rand bis zum Abbruch der Runtime bei 30 s für Signatur, Caddy, `docker exec` in gVisor und den Start der Shell.
  2. **Die Antwort.** `stillRunning` setzt das Feld `wait_command` und schreibt als letzte Zeile von `stdout` genau diesen Befehl, davor
     den Satz, dass das Modell ihn mit `exec` ohne `timeout` aufruft, dass er höchstens 25 s wartet und dass es ihn wiederholt, solange
     der Befehl noch läuft. Der Satz „Read these files later …“ fällt weg, „Do not start the command again.“ bleibt. Eine Wiederholung mit
     demselben `Idempotency-Key` nennt denselben Befehl, weil `<tag>` aus Sandbox und Schlüssel kommt. Kein neuer Status, keine neue
     Route, `sandboxd` unverändert.
  3. **Der Harness folgt dem Text.** `long-exec.mjs` bekommt `waitCommandOf(text)` (die letzte Zeile von stdout aus dem Werkzeugtext)
     und ruft für einen Befehl ohne Ergebnis genau diesen Befehl über das Werkzeug `exec` ohne `timeout` auf, bis die erste Zeile von
     stdout das Ende meldet, höchstens `Math.ceil((seconds * 1000 - EXEC_EARLY_MS) / (EXEC_WAIT_S * 1000)) + 1` Mal (für 180 s: 8).
     Je Aufruf landet in `waits` ein Eintrag mit `command`, `attempts`, `duration_ms`, `status` und dem Text. Kein `SETTLE_MS` mehr, kein
     Schlafen bis zum Ende, kein `read_file` der Dateien aus dem Text; der Zähler `runs` wird danach wie bisher gelesen.
  4. **Das Urteil.** `judgeLongExec` lässt einen Befehl ohne direktes Ergebnis nur durch, wenn der Text einen Befehl nennt, jeder Eintrag
     in `waits` genau diesen Befehl trägt, genau einen Versuch mit 200 hat und unter 30000 ms blieb, die Zahl der Einträge die Grenze aus
     Entscheidung 3 nicht reißt und der letzte Eintrag Exit-Code 0 und das Label in stdout hat; `failures_after` 0 und `runs` 1 bleiben
     Pflicht. Ein Befehl mit direktem Ergebnis (`long-60`) braucht keine `waits`.
  5. **Produktion nach dem Rollout.** Die Prüfung `sandbox` in `ops/live.sh` liest nach der Hintergrund-Antwort auf `sleep 25; echo bg-ok`
     nicht mehr `exit_code_file` bis 60 s lang, sondern ruft `wait_command` aus der Antwort mit `exec` ohne `timeout` auf, höchstens
     zweimal, und erwartet 200, `exit_code` 0 und `bg-ok` in stdout, jeder Aufruf unter 30 s. Sonst eine Zeile
     `FAIL sandbox: background exec wait_command …` mit Grund; der Selbsttest beweist beide Richtungen.
- Vorher und nachher: Zuerst läuft der Gang mit neuem Harness und neuem Urteil gegen den Dienst von `dev` (lokal wie in
  `docs/sandbox/lange-befehle.md`, `## Vorher`, oder als erster Lauf des Jobs `e2e` vor der Änderung an `src/sandbox/service.ts`) und
  muss mit `LONG_EXEC_VERDICT fail` enden, weil der Text keinen Befehl nennt. Das ist der Beleg gegen die Widerlegung aus `ROADMAP.md`.
  Nachher zählt der Job `e2e` des Goal-PR. Beides steht in `docs/sandbox/lange-befehle.md` unter `## Warten` als je eine Zeile:
  `- vorher 180 s: <Ort, Commit, Uhrzeit>: LONG_EXEC_VERDICT fail <erster Grund>` und
  `- nachher 180 s: <Ort, Commit, Uhrzeit>: waits=<n> max_wait_ms=<ms> attempts=<n> failures_after=0 runs=1`.
- Der code-host hat kein Docker: Den Harness belegt der Job `e2e` des Goal-PR. Eine Unit-Prüfung des Befehls läuft in echtem Bash mit
  kleinem `seconds` (etwa 2), nie mit 25 s.
- Ablauf: zuerst Befehl und Antwort mit Unit-Tests (Punkt 1), dann Harness und Urteil (Punkt 2), dann der Job `e2e` (Punkt 3), dann
  `ops/live.sh` (Punkt 4), zuletzt Doku, Annahmen und Umfang (Punkte 5 bis 7). Nach jedem grünen Punkt Commit und Push.
- Die Produktion ändert sich nur über den Merge und `deploy.yml`; kein Lauf gegen die Produktion vor dem Merge, kein `setup.sh` auf dem
  Sandbox-Server, weil `sandboxd` und das Image unverändert bleiben. Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen.
  Progress Log und Verdicts zitieren keine Suchausdrücke der Prüfbefehle wörtlich.
- Was danach schneller zu mehr zahlenden Automatons führt: sandbox 10 sichert den Bau der Runtime am Pin, konto 04 gibt Menschen ohne
  Wallet die Terminal-Tools für ihren Automaton.

## Done Condition
- [x] Die Antwort auf einen Befehl im Hintergrund nennt im Feld `wait_command` und als letzte Zeile von `stdout` einen Befehl, der bis
      zu 25 s auf das Ende wartet und dann Exit-Code, Ausgabe und Fehler druckt oder sagt, dass der Befehl noch läuft; der Test war vor
      dem Fix rot.
      MVP: Funktion, weil das Modell nur den Text der Antwort sieht und ohne den Befehl in einer Schleife aus Fehlern nachfragt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-wait.test.ts test/sandbox-long-exec.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/sandbox-wait.test.ts` muss mindestens 6 ausgeben (je ein Fall: Antwort mit `wait_command` gleich der letzten Zeile von stdout; nach dem Ende in echtem Bash Exit-Code, Ausgabe und Fehler und Ende mit dem Exit-Code des Befehls; vor dem Ende Warten höchstens `seconds` Sekunden und der Satz, dass der Befehl noch läuft; Exit-Code 124 kommt durch; `EXEC_WAIT_S` mal 1000 plus 5000 ist höchstens `EXEC_DEFAULT_MS`, und der Befehl mit `EXEC_DEFAULT_MS` wird gehalten statt im Hintergrund; eine Wiederholung mit demselben `Idempotency-Key` nennt denselben Befehl).
      Prüfung: `for w in wait_command waitCommand EXEC_WAIT_S EXEC_DEFAULT_MS "still running" 124 Idempotency-Key; do grep -qF -- "$w" test/sandbox-wait.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -cxE "export const EXEC_WAIT_S = 25;" src/sandbox/service.ts` muss 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$T/src/sandbox/service.ts; if ! grep -q "export function waitCommand(" $f; then echo "fehlt waitCommand"; else sed -i "s/export function waitCommand(/function waitCommandOrig(/" $f; echo 'export function waitCommand(..._a: unknown[]): string { return "true"; }' >> $f; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-wait.test.ts >/dev/null 2>&1) && echo "gruen ohne waitCommand"; fi; rm -rf $T` muss nichts ausgeben.
- [x] `harness/e2e/long-exec.mjs` holt das Ergebnis eines Befehls ohne direktes Ergebnis nur mit dem Befehl aus dem Text, über das
      Werkzeug `exec` ohne `timeout`, und `judgeLongExec` verlangt es; die Tests waren vor dem Fix rot.
      MVP: Funktion, weil erst der Gang mit Client und Werkzeugen der unveränderten Runtime zeigt, dass ein Modell, das dem Text folgt,
      das Ergebnis bekommt, ohne dass die Runtime abbricht (Grundregel 13).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/long-exec.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in waitCommandOf waits duration_ms 30000 EXEC_WAIT_S; do grep -qF -- "$w" harness/e2e/long-exec.mjs || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -c "SETTLE_MS" harness/e2e/long-exec.mjs` muss 0 ausgeben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/long-exec.test.ts` muss mindestens 26 ausgeben (die 20 bestehenden Fälle, angepasst an `waits`, dazu je einer: long-180 mit einem Eintrag „still running“ und einem mit dem Ende besteht; ein Text ohne Befehl fällt durch, auch wenn die Dateien das Ergebnis tragen; ein Eintrag mit 30000 ms oder mehr oder mit `abort` fällt durch; ein Eintrag mit einem anderen Befehl als dem aus dem Text fällt durch; mehr Einträge als die Grenze fallen durch; ein letzter Eintrag ohne Label oder mit anderem Exit-Code fällt durch; long-60 mit direktem Ergebnis besteht ohne `waits`).
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$T/harness/e2e/long-exec.mjs; if ! grep -q "export function waitCommandOf(" $f; then echo "fehlt waitCommandOf"; else sed -i "s/export function waitCommandOf(/function waitCommandOfOrig(/" $f; echo 'export function waitCommandOf() { return "true"; }' >> $f; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/long-exec.test.ts >/dev/null 2>&1) && echo "gruen ohne waitCommandOf"; fi; rm -rf $T` muss nichts ausgeben.
- [x] Im Job `e2e` des Goal-PR holt der Gang mit der unveränderten Runtime das Ergebnis von 180 s über den Befehl aus dem Text, jeder
      Aufruf unter 30 s, und der Job ist grün.
      MVP: Funktion, weil nur dieser Lauf Control Plane, Nachbau `sandboxd` und Runtime am Pin zusammen zeigt.
      Prüfung: `grep -cE 'long_exec=\$long_exec' harness/e2e/full.sh` muss mindestens 2 ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-09 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-09 --state all --json number -q '.[0].number'); l=$(gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,link -q '.[] | select(.name=="e2e") | .link'); gh run view --job "${l##*/}" --log -R matthiashippe/control-plane | grep -cE "E2E OK .*long_exec=true"` muss mindestens 1 ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-09 --state all --json number -q '.[0].number'); l=$(gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,link -q '.[] | select(.name=="e2e") | .link'); gh run view --job "${l##*/}" --log -R matthiashippe/control-plane | grep -cE 'LONG_EXEC_RESULT .*"label":"long-180".*"waits":\[\{'` muss mindestens 1 ausgeben.
- [x] Nach jedem Rollout prüft `ops/live.sh` den Befehl aus `wait_command` in der eigenen Sandbox durch Caddy und gVisor und meldet
      einen Fehlschlag mit eigener Zeile; der Selbsttest war vor dem Fix rot.
      MVP: Funktion, weil der Harness weder Caddy noch gVisor hat und ein Befehl, der dort länger als 30 s braucht oder nicht läuft,
      sonst erst beim nächsten Automaton auffällt.
      Prüfung: `for w in wait_command 'FAIL sandbox: background exec wait_command'; do grep -qF -- "$w" ops/live.sh || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/live.sh --selftest | grep -c "FAIL sandbox: background exec wait_command"` muss mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/live-selftest.test.ts` muss Exit-Code 0 haben.
- [x] Die Doku sagt Runtime und Betrieb, wie ein Automaton auf einen Befehl im Hintergrund wartet, mit Messung vorher und nachher, und
      die Entscheidungen stehen mit Grund in den Annahmen.
      MVP: Funktion, weil ein Automaton die Fehlerreferenz liest, auf die jede Fehlerantwort verlinkt, und der Betrieb die Zahlen braucht,
      um eine Regression zu erkennen.
      Prüfung: `awk '/^## sandboxes/{f=1;next} /^## /{f=0} f' docs/errors.md | grep -c "wait_command"` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^## Warten/{f=1;next} /^## /{f=0} f' docs/sandbox/lange-befehle.md | grep -cE "^- vorher 180 s: .*LONG_EXEC_VERDICT fail "` muss 1 ausgeben.
      Prüfung: `awk '/^## Warten/{f=1;next} /^## /{f=0} f' docs/sandbox/lange-befehle.md | grep -cE "^- nachher 180 s: .*waits=[1-9][0-9]* max_wait_ms=[0-9]+ attempts=[1-9][0-9]* failures_after=0 runs=1$"` muss 1 ausgeben.
      Prüfung: `awk '/^## Warten/{f=1;next} /^## /{f=0} f' docs/sandbox/lange-befehle.md | grep -oE "max_wait_ms=[0-9]+" | awk -F= '$2 >= 30000' | wc -l` muss 0 ausgeben.
      Prüfung: `awk '/^## Goal 09/{f=1} f' goals/sandbox/ANNAHMEN.md | grep -ciE "wait_command|EXEC_WAIT_S|25 s|still running|vorher|live.sh"` muss mindestens 5 ausgeben.
- [x] Das Goal ändert weder `sandboxd`, Image und Server noch Runtime, Zahlung, Anmeldung, Deploy oder CI und bringt keinen Schlüssel
      ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8), die Runtime am Pin die Referenz bleibt (Grundregel 13) und ein Wechsel
      des Textes keinen Rollout auf dem Sandbox-Server braucht.
      Prüfung: `git diff --name-only origin/dev...HEAD -- ops/sandbox harness/runtime src/payments src/auth deploy .github scripts/check.mjs | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5})'` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Nach jedem Rollout beweist `ops/live.sh` einen vollen Aufruf des Wartebefehls von 25 s durch Caddy und gVisor: Die Prüfung
      `sandbox` startet im Hintergrund `sleep 50; echo bg-ok` (Antwort nach 20 s, der erste Aufruf wartet die vollen 25 s, der zweite
      bekommt das Ende), ruft `wait_command` höchstens dreimal auf, verlangt, dass der erste Aufruf „still running“ meldet, und jeder
      Aufruf bleibt unter 30000 ms; meldet schon der erste Aufruf das Ende, steht dort
      `FAIL sandbox: background exec wait_command ended on the first call`. Der Selbsttest war vor dem Fix rot.
      MVP: Funktion, weil mit `sleep 25` der einzige Aufruf in Produktion rund 5 s wartet: Ob ein voller Aufruf mit `bash -lc` in
      gVisor, `docker exec`, Caddy und Signatur unter den 30 s der Runtime bleibt, misst sonst nur der Harness ohne all das
      (`max_wait_ms=25046` bei 5 s Rand), und ein Automaton mit `npm install` fände es als Erster heraus.
      Prüfung: `grep -oE 'sleep [0-9]+; echo bg-ok' ops/live.sh | awk '$2+0 < 50' | wc -l` muss 0 ausgeben.
      Prüfung: `grep -oE '"command":"sleep [0-9]+; echo bg-ok"' ops/live.sh | grep -c '"command":"sleep 50; echo bg-ok"'` muss mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/live.sh --selftest | grep -c "FAIL sandbox: background exec wait_command ended on the first call"` muss mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/live-selftest.test.ts` muss Exit-Code 0 haben.
- [x] Der Wartebefehl begrenzt sein Warten nach der Uhr (`$SECONDS` der Bash), nicht nach der Zahl der Runden: Er endet spätestens
      eine Runde nach `seconds` Sekunden seit seinem Start, auch wenn jedes `sleep 1` in gVisor länger dauert. Der Test war vor dem Fix
      rot.
      MVP: Funktion, weil heute 25 Runden aus `sleep 1` und Prüfung je Runde Zeit für den Start eines Prozesses kosten, die in gVisor
      ein Vielfaches beträgt; das zählt gegen dieselben 5 s Rand bis zum Abbruch der Runtime.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-wait.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/sandbox-wait.test.ts` muss mindestens 9 ausgeben (neu: mit einem `sleep` im `PATH`, das je Aufruf 2 s braucht, endet `waitCommand(base, 3)` ohne Exit-Datei in echtem Bash in weniger als 4500 ms; nach der Zahl der Runden wären es 6 s).
      Prüfung: `awk '/export function waitCommand\(/,/^}/' src/sandbox/service.ts | grep -c 'SECONDS'` muss mindestens 1 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei, jeder neue Fall und jede neue Selbsttest-Zeile war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Der Text, den die Runtime liest, sagt in klaren Worten, was das Modell als Nächstes tut (diesen Befehl mit `exec` ohne `timeout`
      aufrufen, wiederholen, solange der Befehl läuft, den Befehl nicht neu starten).
- [ ] Jede Zahl in `docs/sandbox/lange-befehle.md` mit Ort, Commit und Uhrzeit, aus denen sie stammt; keine Sandbox-ID und kein
      Schlüssel.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `ops/sandbox/**`, `src/payments/**`, `src/auth/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`,
  `.env*`, `*.key`, `*.pem`, `*.crt`
- `/root/.automaton/wallet.json` in jeder Sandbox: nie lesen, kopieren oder ausgeben
- der Zahlungsserver `76.13.144.207` und der Sandbox-Server `srv1327036`: kein Zugriff in diesem Goal, kein Rollout, kein Neustart
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung (`loop-constraints.md`, Grundregeln 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7 gebaut: Wartebefehl mit 25 s in `src/sandbox/service.ts` als Feld und letzte Zeile von stdout, Harness und Urteil folgen dem Befehl aus dem Text, `ops/live.sh` prüft ihn nach dem Rollout, Doku und Annahmen mit Messung vorher (lokal, Commit `08164a6`) und nachher (Job e2e von PR #210, Commit `b37f852`). Rot vor dem Fix: die vier neuen oder geänderten Testdateien gegen den Code von `origin/dev` (`08164a6`) mit 4 von 4 Dateien und 11 Fällen rot, der Selbsttest von `ops/live.sh` auf `dev` ohne die neue Fehlzeile, die Ersatzproben aus Punkt 1 und 2 (Funktion durch eine leere ersetzt) rot. Prüfbefehle: Punkt 1 vitest Exit 0, 8 Fälle, keine Zeichenfolge fehlt, Konstante 1, Ersatzprobe leer; Punkt 2 vitest Exit 0, keine Zeichenfolge fehlt, alte Konstante 0, 28 Fälle, Ersatzprobe leer; Punkt 3 full.sh 2, Job e2e grün, Erfolgszeile 1, Ergebnis long-180 mit Wartezeilen 1 (7 Aufrufe, längster 25046 ms); Punkt 4 keine Zeichenfolge fehlt, Selbsttest 15 Fehlzeilen, vitest Exit 0; Punkt 5 errors.md 2, vorher 1, nachher 1, ab 30000 ms 0 (Gegenprobe mit gepflanztem Wert 1), Annahmen 11; Punkt 6 0, 0, 0; Punkt 7 check Exit 0.
- 2026-11-16 Zyklus 2: Abschluss gemeldet, Punkte 1 bis 7, dev ohne neuen Commit seit dem Start (`08164a6` ist Vorfahr des Kopfs), kein Code geändert. Prüfbefehle: jeder einzeln am Kopf `d2ae82c`, 2026-11-16 12:54 bis 12:57 UTC; dieser Commit ändert danach nur diese Zeile. P1 vitest Exit 0; 8 Fälle; keine Zeichenfolge fehlt; Konstante 1; Ersatzprobe leer. P2 vitest Exit 0; keine Zeichenfolge fehlt; alte Konstante 0; 28 Fälle; Ersatzprobe leer. P3 full.sh 2; e2e SUCCESS (Run 43869061515); Erfolgszeile 1; Ergebnis long-180 mit Wartezeilen 1. P4 keine Zeichenfolge fehlt; Selbsttest 15 Fehlzeilen; vitest live-selftest Exit 0. P5 errors.md 2; vorher 1; nachher 1; ab 30000 ms 0; Annahmen 11. P6 Deny-Pfade 0; Schlüsseldateien 0; Schlüssel im Diff ohne goals/ 0. P7 check Exit 0 (184 Dateien, 2063 Tests); check auf GitHub SUCCESS.
- 2026-11-16 Zyklus 3: Punkt 8 gebaut: Die Prüfung `sandbox` in `ops/live.sh` startet nach der Kritik den Befehl von 50 s, ruft den Wartebefehl höchstens dreimal auf und verlangt, dass der erste die vollen 25 s wartet und „still running“ meldet, sonst die neue Fehlzeile; Doku und Annahmen nachgezogen. Rot vor dem Fix am Kopf `c346ce6`: Zähler der kurzen Befehle 3, Zähler des Befehls von 50 s 0, neue Fehlzeile im Selbsttest 0, vitest live-selftest 1 von 7 Fällen rot. Prüfbefehle: kurze Befehle 0; Befehl von 50 s 1; Selbsttest mit der neuen Fehlzeile 2; vitest live-selftest Exit 0; dazu Punkt 4 unverändert grün (keine Zeichenfolge fehlt, Selbsttest 18 Fehlzeilen).
- 2026-11-16 Zyklus 4: Punkt 9 gebaut: `waitCommand` merkt sich `$SECONDS` beim Start und wartet nach der Uhr statt nach der Zahl der Runden; ein neuer Test fährt ihn in echtem Bash mit einem `sleep` von 2 s je Aufruf, die Untergrenze des Tests vor dem Ende ist wegen ganzer Sekunden `(seconds - 1) * 1000` ms statt 1900 ms, Grund in den Annahmen. Rot vor dem Fix am Kopf `c0ecab6`: der neue Fall mit 6013 ms statt unter 4500 ms, Zähler der Uhr in `waitCommand` 0. Prüfbefehle: vitest sandbox-wait Exit 0 (dreimal hintereinander); 9 Fälle; Uhr in `waitCommand` 1; check Exit 0 (184 Dateien, 2064 Tests).

## Blockers
Keine.
