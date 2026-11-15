# Fehler Goal 10: Die Ops-Triage sieht, ob die Warnung ankommt

## Status
DONE

## Active Objective
Seit fehler 09 meldet `ops/status.sh` mit `alarm_path.received`, ob die Zustellungen des Watchdogs auf dem Thema stehen. Zwei Lücken
lassen diese Prüfung heute ins Leere laufen: Die Ops-Triage ruft `ops/status.sh` in Schritt 2 nur mit `OPENROUTER_API_KEY` auf, also
ist `received` dort immer `unknown`, und an einem ruhigen Tag ist die letzte Zustellung das Lebenszeichen kurz nach 00:00 UTC, also
prüft `received` das Thema nur bis etwa 11:05 UTC. Danach setzt Schritt 2 von `.claude/skills/ops-triage/SKILL.md` auch
`CP_ALERT_WEBHOOK` aus `~/brain/connectors/secrets.env`, nur als Umgebung des Aufrufs, die Triage führt
`alarm_path.received.status` `red` als Befund und zweimal `unknown` in Folge als Hinweis, und `ops/watchdog.sh` sendet je UTC-Tag drei
Lebenszeichen (ab 00:00, 08:00 und 16:00 UTC), sodass `received` zu jeder Stunde eine Zustellung jünger als 11 Stunden sieht.
Ändert nur `ops/watchdog.sh`, den Skill der Ops-Triage, zwei neue Tests und `ops/README.md`; der Watchdog kommt mit dem nächsten
Rollout des Laufzeitpfads auf den Server.
Widerlegt, wenn die Triage mit einem falschen Thema schon heute einen Befund schreibt. Übernimmt
`goals/_vorschlaege/fehler-kritik-2026-11-14-2.md` und `goals/_vorschlaege/fehler-kritik-2026-11-14-3.md`.
MVP: Funktion, weil die Prüfung aus fehler 09 erst wirkt, wenn der regelmäßige Leser von `ops/status.sh` sie auch bekommt, und zwar zu
jeder Uhrzeit, zu der er läuft.

## Voraussetzungen
- fehler Goal 09 DONE

## Kontext für den Maker
- Ziel: Steht in der crontab des Servers ein falsches oder veraltetes Thema, schreibt die nächste Ops-Triage einen Befund in
  `STATE.md`, egal zu welcher Stunde sie läuft, statt eines `unknown`, das niemand liest.
- Bestand am 14.11.2026 auf `eef3eb2` (Kopf von `dev`):
  - `.claude/skills/ops-triage/SKILL.md` Schritt 2:
    `OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' ~/brain/connectors/secrets.env | cut -d= -f2) ops/status.sh`. Die Regeln des
    Skills kennen `alarm_path.received` nicht.
  - `ops/watchdog.sh`, `sign_of_life`: postet `report "ALIVE" …` mit Priorität `min`, wenn `<state file>.alive` nicht den heutigen
    Tag aus `date -u +%F` trägt, und schreibt den Tag erst nach erfolgreichem POST. Der Watchdog läuft per cron alle fünf Minuten.
  - `ops/status.sh`: `alarm_path.received.status` ist nur dann `ok` oder `red`, wenn `last_delivered` jünger als 11 Stunden ist
    (Cache von ntfy 12 Stunden, Entscheidung in fehler 09); sonst `unknown`. Diese Regel bleibt.
  - `test/watchdog-alive.test.ts` hat einen nachgebauten `date`, der für `+%F` den Tag aus einer Datei und sonst immer
    `<Tag>T11:00:00Z` ausgibt; `test/status-alarm-received.test.ts` hat nachgebaute `ssh` und `curl` für die Abfrage des Themas.
- Entscheidung Tech Lead (14.11.2026), drei statt zwei Lebenszeichen: Die ROADMAP nennt ein zweites Lebenszeichen ab 12:00 UTC. Mit
  Abständen von 12 Stunden ist die letzte Zustellung zwischen etwa 11:05 und 12:05 UTC und zwischen 23:05 und 00:05 UTC älter als
  11 Stunden, `received` wäre dort jeden Tag `unknown`, und eine Triage in dieser Stunde sähe nichts. Deshalb drei Fenster je UTC-Tag
  mit Beginn 00:00, 08:00 und 16:00 UTC; der erste Lauf in jedem Fenster postet das Lebenszeichen. Die längste Lücke ist dann 8 Stunden
  plus ein Lauf, Priorität `min` bleibt (ntfy stellt ohne Ton und Vibration zu).
- Entscheidung Tech Lead (14.11.2026), Stempel: `<state file>.alive` trägt `JJJJ-MM-TTTHH` mit `HH` aus `00`, `08`, `16` (Beginn des
  Fensters), berechnet aus der Stunde von `TS` (`${TS:11:2}`) und dem Tag von `TS` (`${TS:0:10}`), nicht aus einem weiteren Aufruf
  von `date`, damit der nachgebaute `date` von `test/watchdog-alive.test.ts` unverändert gilt (dort ist es immer 11:00, also Fenster
  `08`, und der Fall „once per day“ bleibt grün). Gespeichert wird weiter erst nach erfolgreichem POST; bei totem Webhook versucht
  jeder Lauf im Fenster es erneut. Ein Stempel im alten Format (`JJJJ-MM-TT`) gilt als fehlendes Fenster: Nach dem Rollout kommt
  einmal ein Lebenszeichen mehr, sonst nichts. `CP_WATCHDOG_ALIVE=0` schaltet weiter nur das Lebenszeichen ab.
- Entscheidung Tech Lead (14.11.2026), Schritt 2 der Triage, genau diese Zeile im Codeblock:
  `OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' ~/brain/connectors/secrets.env | cut -d= -f2) CP_ALERT_WEBHOOK=$(grep '^CP_ALERT_WEBHOOK=' ~/brain/connectors/secrets.env | cut -d= -f2-) ops/status.sh`
  Beide Werte stehen nur in der Umgebung von `ops/status.sh`, kein `export`, kein Argument, keine Ausgabe des Werts. Der Schlüssel
  `CP_ALERT_WEBHOOK` steht in `secrets.env` (am 14.11.2026 per `grep -c` gezählt, Wert nicht gelesen). Dazu in Schritt 3 oder unter
  Regeln, auf Deutsch wie der Skill:
  - `alarm_path.received.status` `red` ist ein Befund in `STATE.md` mit den Zahlen `last_delivered`, `last_message` und `last_alive`
    und dem Handgriff aus `ops/README.md` (Thema der crontab gegen `CP_ALERT_WEBHOOK` abgleichen); es zählt als Meldung an Matthias
    nach Schritt 6, weil keine Warnung mehr ankommt.
  - `unknown` in zwei Läufen in Folge ist ein Hinweis in `STATE.md`; die Zeile in `loop-run-log.md` (Schritt 5) nennt dafür jedes Mal
    `received <status>`, damit der nächste Lauf den vorigen Wert findet.
  - URL und Thema stehen nie in `STATE.md`, `loop-run-log.md` oder einer Chat-Ausgabe.
- Tests, Fälle mit genau diesen Namen, weil die Prüfbefehle sie per `-t` wählen:
  - neu `test/watchdog-alive-slots.test.ts`, Aufbau wie `test/watchdog-alive.test.ts` (nachgebaute `curl`, `docker`, `openssl`,
    `sleep`, `date`, Gesundheit 200, Guthaben in Ordnung), aber `date` liest den ganzen Zeitpunkt aus einer Datei, damit ein Fall die
    Uhr in Schritten von 30 Minuten über einen Tag schieben kann. `WATCHDOG_UNDER_TEST` zeigt auf eine andere Kopie; sie läuft in
    einem eigenen `ops/` neben Kopien der Hilfsskripte aus `ops/`, damit die Gegenprobe nur am Lebenszeichen scheitert:
    - „posts a sign of life at 00:00, 08:00 and 16:00 UTC, once per window“ (Läufe 00:00 bis 23:30 alle 30 Minuten: genau drei
      Posts mit Titel `control-plane ALIVE`, zu 00:00, 08:00 und 16:00)
    - „at every run of a quiet day the last sign of life is younger than 11 hours“ (für jeden Lauf 00:00 bis 23:30 und 00:00 des
      Folgetags: Abstand zum letzten zugestellten Lebenszeichen höchstens 8 Stunden 30 Minuten)
    - „a dead webhook is tried again on every run of the window“ (Webhook tot von 08:00 bis 09:00, ab 09:30 lebt er: je Lauf eine
      Zeile `webhook unreachable`, das Lebenszeichen kommt um 09:30 und danach in diesem Fenster nicht noch einmal)
    - „a stamp of the old format counts as a missing window“ (`<state file>.alive` mit `2026-11-13`, Lauf am 2026-11-13 um 11:00:
      ein Lebenszeichen, Exit 0)
    - „ops/status.sh at 18:00 UTC after a quiet day is never unknown“ (der Watchdog läuft von 00:00 bis 18:00; sein Log geht über
      den nachgebauten `ssh` aus `test/status-alarm-received.test.ts` an `ops/status.sh`, das nachgebaute `curl` antwortet auf
      `json?poll=1` mit den zugestellten Posts als ntfy-Zeilen `{"event":"message","time":…,"title":…}`, `CP_NOW` 18:00:00Z,
      `CP_ALERT_WEBHOOK` unter `.invalid` mit erfundenem Thema: `received.status` `ok`; mit leerer Antwort des Themas `red`; beide
      Male nie `unknown`)
  - neu `test/ops-triage-skill.test.ts`, liest `.claude/skills/ops-triage/SKILL.md` (oder die Datei aus `TRIAGE_SKILL_UNDER_TEST`):
    - „step 2 hands CP_ALERT_WEBHOOK to ops/status.sh in its environment, not as an argument“ (zieht den Befehl aus dem Codeblock
      von Schritt 2 und führt ihn mit `bash -c` aus: `HOME` auf ein Verzeichnis aus `mktemp` mit `brain/connectors/secrets.env`, darin
      `OPENROUTER_API_KEY=test-key` und `CP_ALERT_WEBHOOK=https://alerts.invalid/made-up-topic`, Arbeitsverzeichnis mit einem
      nachgebauten `ops/status.sh`, das die Zahl seiner Argumente und den Wert von `CP_ALERT_WEBHOOK` in eine Datei schreibt;
      erwartet 0 Argumente und genau den erfundenen Wert, `OPENROUTER_API_KEY` ebenso)
    - „step 2 never exports the webhook“ (der Text des Skills enthält kein `export CP_ALERT_WEBHOOK` und kein `ops/status.sh`, dem
      `CP_ALERT_WEBHOOK` oder `$` folgt)
    - „a red received is a finding and two unknown in a row a hint“ (der Text nennt `alarm_path.received.status`, `red` mit Befund
      und `unknown` mit zwei Läufen in Folge und Hinweis)
    - „the run log line names received and nothing names URL or topic“ (der Text verlangt `received <status>` in der Zeile von
      Schritt 5 und verbietet URL und Thema in `STATE.md` und `loop-run-log.md`)
- `ops/README.md`: Der Absatz zum Lebenszeichen sagt drei Fenster je UTC-Tag (00:00, 08:00, 16:00 UTC) und warum (Fenster von
  `received` 11 h), der Stempel `<state file>.alive` mit dem Fenster; die Zeile `alarm_path.received.status` der Tabelle nennt, dass
  die Ops-Triage `CP_ALERT_WEBHOOK` aus `secrets.env` mitgibt. Englisch wie die ganze Datei.
- Gate: `.claude/**` steht nicht in `merge_allowlist`, das Gate lehnt den PR mit `allowlist` ab, und der Merge-Auftrag geht an den
  Tech Lead. Nur `.claude/skills/ops-triage/SKILL.md` ändert sich unter `.claude/`.
- Rollout: Das Goal ändert `ops/watchdog.sh`, nicht `src/`; der Watchdog auf dem Server kommt mit dem nächsten Rollout des
  Laufzeitpfads mit (LOOP.md, Release, Grundregel 5). Die crontab des Servers ändert sich nicht, kein Schritt auf dem Server, kein POST
  an den echten Webhook und keine Abfrage des echten Themas.
- Keine echten Werte: `CP_ALERT_WEBHOOK` und `OPENROUTER_API_KEY` stehen in keinem Prüfbefehl, keinem Test und keinem Log mit ihrem
  echten Wert, `~/brain/connectors/secrets.env` wird in diesem Goal nicht gelesen und nicht ausgeführt, die Tests nehmen ein eigenes
  `HOME`.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout.

## Done Condition
- [x] `ops/watchdog.sh` postet je UTC-Tag ein Lebenszeichen in jedem der Fenster ab 00:00, 08:00 und 16:00 UTC, mit Stempel nach
      erfolgreichem POST, und `ops/status.sh` sieht damit um 18:00 UTC nach einem ruhigen Tag `ok` oder `red`, nie `unknown`.
      MVP: Funktion, weil `received` heute ab etwa 11:05 UTC nichts mehr prüft.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-alive-slots.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"] >= 5, r["numFailedTests"], r["numPendingTests"])'` muss `True 0 0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-alive-slots.test.ts -t 'posts a sign of life at 00:00, 08:00 and 16:00 UTC, once per window|at every run of a quiet day the last sign of life is younger than 11 hours|a dead webhook is tried again on every run of the window|a stamp of the old format counts as a missing window|ops/status.sh at 18:00 UTC after a quiet day is never unknown' --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"], r["numFailedTests"])'` muss `5 0` ausgeben.
      Prüfung: `grep -cE '\.skip|skipIf|\.only|\.todo' test/watchdog-alive-slots.test.ts` muss `0` ausgeben.
- [x] Gegenprobe Watchdog: Mit dem `ops/watchdog.sh` von `eef3eb2` sind die Fälle zu drei Fenstern und 18:00 UTC rot, mit dem neuen
      grün.
      MVP: Funktion, weil erst die Gegenprobe zeigt, dass der Test genau die Lücke des Vorschlags misst.
      Prüfung: `d=$(mktemp -d); git show eef3eb2:ops/watchdog.sh > "$d/watchdog.sh"; WATCHDOG_UNDER_TEST="$d/watchdog.sh" PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-alive-slots.test.ts -t 'ops/status.sh at 18:00 UTC after a quiet day is never unknown' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); git show eef3eb2:ops/watchdog.sh > "$d/watchdog.sh"; WATCHDOG_UNDER_TEST="$d/watchdog.sh" PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-alive-slots.test.ts -t 'posts a sign of life at 00:00, 08:00 and 16:00 UTC, once per window' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-alive-slots.test.ts -t 'ops/status.sh at 18:00 UTC after a quiet day is never unknown' >/dev/null 2>&1 && echo gruen || echo rot` muss `gruen` ausgeben.
- [x] Schritt 2 der Ops-Triage gibt `CP_ALERT_WEBHOOK` aus `secrets.env` nur in der Umgebung an `ops/status.sh`, und der Skill führt
      `received` `red` als Befund und zweimal `unknown` als Hinweis.
      MVP: Funktion, weil `received` in der Triage heute immer `unknown` ist.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/ops-triage-skill.test.ts -t 'step 2 hands CP_ALERT_WEBHOOK to ops/status.sh in its environment, not as an argument|step 2 never exports the webhook|a red received is a finding and two unknown in a row a hint|the run log line names received and nothing names URL or topic' --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"], r["numFailedTests"], r["numPendingTests"])'` muss `4 0 0` ausgeben.
      Prüfung: `grep -cF "CP_ALERT_WEBHOOK=\$(grep '^CP_ALERT_WEBHOOK=' ~/brain/connectors/secrets.env | cut -d= -f2-) ops/status.sh" .claude/skills/ops-triage/SKILL.md` muss `1` ausgeben.
      Prüfung: `grep -cE '\.skip|skipIf|\.only|\.todo' test/ops-triage-skill.test.ts` muss `0` ausgeben.
- [x] Gegenprobe Skill: Mit dem Skill von `eef3eb2` ist der Fall zu Schritt 2 rot, mit dem neuen grün.
      MVP: Funktion, weil der Test sonst nur Text bestätigt, den er selbst mitbringt.
      Prüfung: `d=$(mktemp -d); git show eef3eb2:.claude/skills/ops-triage/SKILL.md > "$d/SKILL.md"; TRIAGE_SKILL_UNDER_TEST="$d/SKILL.md" PATH=/usr/bin:$PATH pnpm -s vitest run test/ops-triage-skill.test.ts -t 'step 2 hands CP_ALERT_WEBHOOK to ops/status.sh in its environment, not as an argument' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/ops-triage-skill.test.ts -t 'step 2 hands CP_ALERT_WEBHOOK to ops/status.sh in its environment, not as an argument' >/dev/null 2>&1 && echo gruen || echo rot` muss `gruen` ausgeben.
- [x] Die bestehenden Tests des Lebenszeichens und von `received` bleiben, wie sie sind, und sind grün.
      MVP: Funktion, weil die Regeln aus fehler 07 und 09 weiter gelten müssen.
      Prüfung: `git diff --name-only origin/dev...HEAD -- test/watchdog-alive.test.ts test/status-alarm-received.test.ts test/status-alarm-path.test.ts ops/status.sh | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-alive.test.ts test/status-alarm-received.test.ts test/status-alarm-path.test.ts test/watchdog-webhook-fail-daily.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numFailedTests"], r["numPendingTests"])'` muss `0 0` ausgeben.
- [x] URL und Thema stehen nirgends: nicht im Diff, nicht als Argument, nicht in einer Ausgabe des Skills.
      MVP: Funktion, weil wer das Thema kennt, auf das Telefon von Matthias schreiben kann und das Repo öffentlich ist.
      Prüfung: `git diff origin/dev...HEAD | grep -cE 'ntfy\.sh/[A-Za-z0-9_-]'` muss `0` ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- test/ | grep -E '^\+' | grep -oE 'https?://[A-Za-z0-9.-]+' | grep -vcE '\.invalid$'` muss `0` ausgeben.
- [x] `ops/README.md` erklärt die drei Fenster des Lebenszeichens und dass die Ops-Triage `CP_ALERT_WEBHOOK` mitgibt.
      MVP: Funktion, weil die Ops-Triage ihre Schwellen aus dieser Datei liest.
      Prüfung: `grep -c '08:00' ops/README.md` muss mindestens 1 ausgeben.
      Prüfung: `grep '^| `alarm_path.received.status` |' ops/README.md | grep -ci 'ops.triage'` muss `1` ausgeben.
- [x] Nur `ops/watchdog.sh`, `ops/README.md`, `.claude/skills/ops-triage/SKILL.md`, die beiden neuen Tests und Dateien des Goals ändern
      sich, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(ops/watchdog\.sh|ops/README\.md|\.claude/skills/ops-triage/SKILL\.md|test/watchdog-alive-slots\.test\.ts|test/ops-triage-skill\.test\.ts|goals/fehler/)' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src deploy ops/status.sh ops/webhook-last.sh ops/webhook-unreachable.sh | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Zeile im Progress Log nennt beide Gegenproben: alter Watchdog in den Fällen zu drei Fenstern und 18:00 UTC rot, alter Skill
      im Fall zu Schritt 2 rot, neu jeweils grün.
- [ ] Kein Aufruf an das echte Thema, kein POST an den echten Webhook, kein Wert aus `~/brain/connectors/secrets.env` in Test, Fixture,
      Commit, PR, Kommentar, Log oder Verdict; Tests nur mit Adressen unter `.invalid`, erfundenen Themen und eigenem `HOME`.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Skill Deutsch, `ops/README.md` Englisch wie die ganze Datei, kein
      Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.key`, `*.pem`
- `.claude/**` außer `.claude/skills/ops-triage/SKILL.md`
- `src/**`, `ops/status.sh`, `ops/webhook-last.sh`, `ops/webhook-unreachable.sh`, jede andere Datei `ops/*.sh` außer
  `ops/watchdog.sh`, die bestehenden Tests unter `test/`, die crontab des Servers
- `~/brain/connectors/secrets.env` und jede echte Adresse des Alarmwegs: nie lesen, nie abfragen, nie ins Repo
- jede Goal-Datei außer dieser, jedes Verdict, jeder Vorschlag unter `goals/_vorschlaege/`, jedes `ANNAHMEN.md` eines anderen Topics,
  `docs/audit/**`, `loop-dauerauftrag.md`, `STATE.md`, `loop-run-log.md`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7, 8 gebaut: `ops/watchdog.sh` postet das Lebenszeichen in drei Fenstern (00:00, 08:00, 16:00 UTC, Stempel `JJJJ-MM-TTTHH`), Schritt 2 der Ops-Triage gibt `CP_ALERT_WEBHOOK` nur in der Umgebung mit, `received` `red` ist Befund und zweimal `unknown` Hinweis, `ops/README.md` nennt beides; neue Tests `test/watchdog-alive-slots.test.ts` (gegen den Watchdog von `eef3eb2` 5 von 5 rot, darunter drei Fenster und 18:00 UTC, neu 5 von 5 grün) und `test/ops-triage-skill.test.ts` (gegen den Skill von `eef3eb2` 4 von 4 rot, Schritt 2 mit `webhook=<unset>`, neu 4 von 4 grün). Prüfbefehle: P1 `True 0 0`, `5 0`, `0`; P2 `rot`, `rot`, `gruen`; P3 `4 0 0`, `1`, `0`; P4 `rot`, `gruen`; P5 `0`, `0 0`; P6 `0`, `0`; P7 `1`, `1`; P8 `0`, `0`, `check` Exit 0 (1789 Tests).
- 2026-11-14 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8, nach Merge von `dev` (`6b08671`) in den Goal-Branch. Prüfbefehle: P1 `True 0 0`, `5 0`, `0`; P2 alter Watchdog `rot` (18:00 UTC), `rot` (drei Fenster), neu `gruen`; P3 `4 0 0`, `1`, `0`; P4 alter Skill `rot`, neu `gruen`; P5 `0`, `0 0`; P6 `0`, `0`; P7 `1`, `1`; P8 `0`, `0`, `check` Exit 0 (1789 Tests).
- 2026-11-14 Release: PASS K und B (Zyklus 2), DONE.

## Blockers
