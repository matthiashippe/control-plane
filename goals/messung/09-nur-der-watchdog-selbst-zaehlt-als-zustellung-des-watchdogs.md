# Messung Goal 09: Nur der Watchdog selbst zählt als Zustellung des Watchdogs

## Status
PLANNED

## Active Objective
`alarm_path.received` in `ops/status.sh` soll belegen, dass die Posts von `ops/watchdog.sh` wirklich auf dem Thema ankommen. Am
Kopf von `dev` (4aed44e) zählt die Schleife in Zeile 157 aber jede Meldung, deren Titel mit `control-plane ` beginnt
(`title.startswith("control-plane ")`), also auch `control-plane backup failed` aus `ops/backup.sh:27`, obwohl der Kommentar in
Zeile 138 und 139 das ausschließt. Mit einer Zustellung um 11:00 UTC im Log und auf dem Thema nur `control-plane backup failed`
und `deploy-window 502` um 11:00 UTC meldet `received` heute `{"last_alive":null,"last_message":"2026-11-13T11:00:00Z",
"status":"ok"}`, ein gescheitertes Backup meldet damit einen stummen Watchdog als gesund. Dass der Deploy-Alarm nicht mitzählt,
hängt nur an seinem Titel `deploy-window 502` (Annahme messung 05), und `test/deploy-alarm.test.ts:100` prüft von diesem Titel
nur, dass er nicht leer ist; `control-plane DEPLOY 502` in `ops/deploy-alarm.sh:75` bliebe grün. Das Fenster von 11 Stunden, in
dem `received` eine Zustellung beurteilt (`delivered_age <= 11 * 3600`, Zeile 168), prüft die Suite nur von oben: Mit 2 h bleiben
`test/status-alarm-received.test.ts`, `test/watchdog-alive-slots.test.ts` und `test/status-alarm-path.test.ts` grün (24 passed).
Nach diesem Goal zählt `received` nur die Titel, die `report` in `ops/watchdog.sh` setzt (`control-plane <severity>` mit genau den
Severities `ALIVE`, `OK`, `OUTAGE`, `WARN` und `WARNING`), der Sender-Test verlangt genau `Title: deploy-window 502`, und je ein
Fall knapp innerhalb und knapp außerhalb des Fensters wird rot, sobald jemand das Fenster auf 2 h oder 12 h ändert.
Widerlegt, wenn `ops/status.sh` am Kopf von `dev` mit nur diesen beiden Meldungen `received` schon rot meldet (der Maker prüft
das zuerst mit dem dritten Prüfbefehl von Punkt 1 an der Merge-Basis, heute rot mit Exit ungleich 0, weil `received` dort `ok`
meldet, und schreibt das Ergebnis in die erste Zeile des Progress Log).
MVP: Funktion, weil `received` die einzige Prüfung ist, die einen falschen oder stummen Alarmweg erkennt, und ein gescheitertes
Backup auf dem Thema sie heute still auf `ok` setzt; ohne Alarmweg erfährt niemand von einem Ausfall beim zahlenden Kunden.

## Voraussetzungen
- messung Goal 08 DONE

## Kontext für den Maker
- Ziel: Wer `alarm_path.received` liest, sieht `ok` nur, wenn eine Meldung des Watchdogs selbst auf dem Thema steht, nie wegen
  eines Backups oder eines Deploy-Alarms, und eine Änderung am Titel des Deploy-Alarms oder am Fenster wird in `check` rot.
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 09; übernimmt `goals/_vorschlaege/messung-kritik-2026-11-14-9.md`,
  `goals/_vorschlaege/messung-nacharbeit-2026-11-15-4.md` und `goals/_vorschlaege/fehler-nacharbeit-2026-11-15-1.md`.
- **`ops/status.sh`.** Im Python-Teil eine Zeile in Spalte 0
  `WATCHDOG_SEVERITIES = ("ALIVE", "OK", "OUTAGE", "WARN", "WARNING")`, genau in dieser Form (die Prüfbefehle lesen sie). Die
  Schleife zählt eine Meldung nur, wenn `title` einer von `"control-plane " + s` für `s` in `WATCHDOG_SEVERITIES` ist, statt
  `startswith`; `title == "control-plane ALIVE"` für `last_alive` bleibt. Alles andere bleibt Zeichen für Zeichen: das Fenster
  `delivered_age <= 11 * 3600` (die Prüfbefehle ersetzen genau diesen Text in einer Kopie), die 300 s, die Regel für eine
  unlesbare Zeile, die Ausgabe. Der Kommentar in Zeile 138 bis 140 nennt die fünf Titel statt `control-plane ...` und dass
  `ops/backup.sh` (`control-plane backup failed`) und der Deploy-Alarm (`deploy-window 502`) nicht zählen.
- **`ops/README.md`**, Zeilen 124 und 134: `control-plane ...` wird zu den fünf Titeln des Watchdogs (`control-plane ALIVE`,
  `OK`, `OUTAGE`, `WARN`, `WARNING`); sonst bleibt die Datei gleich. `ops/watchdog.sh` und `ops/deploy-alarm.sh` bleiben
  unverändert, auch ihre Kommentare, die vom Präfix sprechen.
- **`test/status-alarm-received.test.ts`**, drei bis vier neue Fälle im bestehenden `describe`, mit `run`, `delivered` und
  `message` der Datei, `CP_NOW` ist dort `2026-11-13T12:00:00Z`:
  - `it("a message of ops/backup.sh or of the deploy alarm is no delivery of the watchdog")`: Zustellung `2026-11-13T11:00:00Z`,
    auf dem Thema `control-plane backup failed` und `deploy-window 502` um `2026-11-13T11:00:00Z`, keine Meldung des Watchdogs;
    erwartet `received` gleich `{ last_alive: null, last_message: null, status: "red" }` und `alarm_path.status` `red`. Rot vor
    dem Fix (heute `ok`).
  - `it("every severity that ops/watchdog.sh reports counts as its delivery")`: liest aus `ops/watchdog.sh` die Severities der
    Aufrufe `report "<SEVERITY>"` (Regex auf `report "([A-Z]+)"`, leere ausgeschlossen), verlangt mindestens fünf, und je
    Severity ergibt eine Zustellung `2026-11-13T11:00:00Z` mit der Meldung `control-plane <SEVERITY>` um dieselbe Zeit `received`
    `ok`. Damit kommt eine neue Severity im Watchdog nicht als falsches Rot an, ohne dass `check` es zeigt.
  - `it("a delivery 10 h 59 min old without a message of the watchdog is red")`: Zustellung `2026-11-13T01:01:00Z`, leeres
    Thema; erwartet `received.status` `red`. Rot mit Fenster 2 h.
  - `it("a delivery 11 h 1 min old is unknown")`: Zustellung `2026-11-13T00:59:00Z`, leeres Thema; erwartet `received` gleich
    `UNKNOWN`. Rot mit Fenster 12 h.
  Alle bestehenden Fälle der Datei bleiben unverändert und grün; `control-plane WARN` in Zeile 157 ist ein Titel des Watchdogs.
- **`test/deploy-alarm.test.ts`.** `SCRIPT` liest wie `STATUS_UNDER_TEST` in `test/status-alarm-received.test.ts` eine
  Überschreibung `DEPLOY_ALARM_UNDER_TEST` (Pfad einer Kopie von `ops/deploy-alarm.sh`), sonst bleibt der Pfad. Im Fall
  `it("sends a title and priority high like the watchdog")` (Name bleibt) ist der Titel genau `Title: deploy-window 502`, und
  ein zweiter Vergleich verlangt, dass er nicht mit `Title: control-plane ` beginnt; die Prüfung auf `Priority: high` bleibt.
  Rot mit `Title: control-plane DEPLOY 502` in einer Kopie. Alle anderen Fälle bleiben unverändert.
- Kein Rollout. `ops/status.sh` läuft am code-host aus dem Checkout (Ops-Triage). Kein Test und kein Prüfbefehl ruft die VM, ssh,
  ntfy oder das echte Thema auf; `CP_ALERT_WEBHOOK` aus `secrets.env` wird nicht gelesen.
- Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich. Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein `pkill -f`. Eine Entscheidung, die
  dieser Text offen lässt, schreibt der Maker als Zeile `- messung 09 (Engineer CP, <Datum>): …` in `goals/messung/ANNAHMEN.md`.

## Done Condition
- [ ] `received` zählt nur die fünf Titel des Watchdogs: Eine Meldung von `ops/backup.sh` oder des Deploy-Alarms setzt es nie auf
      `ok`, jede Severity aus `report` in `ops/watchdog.sh` zählt.
      Prüfung: `grep -c 'startswith("control-plane ")' ops/status.sh` muss 0 ausgeben.
      Prüfung: `grep -cE '^WATCHDOG_SEVERITIES = \("ALIVE", "OK", "OUTAGE", "WARN", "WARNING"\)$' ops/status.sh` muss 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git show $(git merge-base origin/dev HEAD):ops/status.sh > $T/status.sh; PATH=/usr/bin:$PATH STATUS_UNDER_TEST=$T/status.sh timeout 300 pnpm -s vitest run test/status-alarm-received.test.ts -t "a message of ops/backup.sh or of the deploy alarm is no delivery of the watchdog" > $T/out 2>&1; echo "exit $? failed $(grep -cE 'Tests +1 failed' $T/out)"` muss genau `exit 1 failed 1` ausgeben.
      Prüfung: `T=$(mktemp -d); sed 's/, "WARNING")/)/' ops/status.sh > $T/status.sh; PATH=/usr/bin:$PATH STATUS_UNDER_TEST=$T/status.sh timeout 300 pnpm -s vitest run test/status-alarm-received.test.ts -t "every severity that ops/watchdog.sh reports counts as its delivery" > $T/out 2>&1; echo "exit $? failed $(grep -cE 'Tests +1 failed' $T/out)"` muss genau `exit 1 failed 1` ausgeben.
- [ ] Der Sender-Test verlangt genau `Title: deploy-window 502` und keinen Titel des Watchdogs.
      Prüfung: `grep -c 'DEPLOY_ALARM_UNDER_TEST' test/deploy-alarm.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `T=$(mktemp -d); cp ops/deploy-alarm.sh $T/same.sh; sed 's/Title: deploy-window 502/Title: control-plane DEPLOY 502/' ops/deploy-alarm.sh > $T/mut.sh; for s in same mut; do PATH=/usr/bin:$PATH DEPLOY_ALARM_UNDER_TEST=$T/$s.sh timeout 300 pnpm -s vitest run test/deploy-alarm.test.ts -t "sends a title and priority high like the watchdog" > $T/$s.out 2>&1; echo "$s $?"; done | tr '\n' ' '` muss genau `same 0 mut 1 ` ausgeben.
- [ ] Das Fenster von 11 h ist an beiden Rändern geprüft: Mit 2 h wird der Fall bei 10 h 59 min rot, mit 12 h der Fall bei
      11 h 1 min.
      Prüfung: `grep -c 'delivered_age <= 11 \* 3600' ops/status.sh` muss 1 ausgeben.
      Prüfung: `T=$(mktemp -d); for w in 11 2 12; do sed "s/delivered_age <= 11 \* 3600/delivered_age <= $w * 3600/" ops/status.sh > $T/s$w.sh; for c in "a delivery 10 h 59 min old without a message of the watchdog is red" "a delivery 11 h 1 min old is unknown"; do PATH=/usr/bin:$PATH STATUS_UNDER_TEST=$T/s$w.sh timeout 300 pnpm -s vitest run test/status-alarm-received.test.ts -t "$c" > $T/out 2>&1; printf '%s:%s ' $w $?; done; done` muss genau `11:0 11:0 2:1 2:0 12:0 12:1 ` ausgeben.
- [ ] Die bestehenden Tests rund um den Alarmweg bleiben grün, und unter `test/` ändern sich nur die beiden genannten Dateien.
      Prüfung: `PATH=/usr/bin:$PATH timeout 600 pnpm -s vitest run test/status test/watchdog test/deploy-alarm test/deploy-window test/error-counter test/db-report test/ops-triage-skill` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- test | grep -vcE '^test/(status-alarm-received|deploy-alarm)\.test\.ts$'` muss 0 ausgeben.
- [ ] `check` ist grün, gesperrte Pfade bleiben unverändert, und unter `ops/` ändern sich nur `ops/status.sh` und
      `ops/README.md`.
      Prüfung: `PATH=/usr/bin:$PATH timeout 900 node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE '^(\.github|deploy|src|harness|scripts|docs)/|^goals/kanal/'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops | grep -vcE '^ops/(status\.sh|README\.md)$'` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der Fall „a message of ops/backup.sh or of the deploy alarm is no delivery of the watchdog“ war vor dem Fix rot; die Zeile
      im Progress Log nennt das mit dem Wert von `received` an der Merge-Basis.
- [ ] Außer der Auswahl der gezählten Titel ändert sich am Verhalten von `ops/status.sh` nichts; jeder bestehende Fall der
      Suite bleibt unverändert grün.
- [ ] Keine Ausgabe und kein Argument eines Tests nennt Webhook-URL oder Thema.
- [ ] Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/fixtures/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- jede andere Datei unter `ops/` außer `ops/status.sh` und `ops/README.md`, vor allem `ops/watchdog.sh`, `ops/deploy-alarm.sh`,
  `ops/backup.sh`, `ops/webhook-last.sh` und `ops/check-all.sh`
- jeder Test unter `test/` außer `test/status-alarm-received.test.ts` und `test/deploy-alarm.test.ts`, vor allem
  `test/watchdog-alive-slots.test.ts`, `test/status-alarm-path.test.ts` und `test/deploy-alarm-pending.test.ts`
- `goals/kanal/**`
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), die VM, ssh, ntfy und das echte Thema; Produktion weder
  lesend noch schreibend, kein Rollout
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- (leer)

## Blockers
- keine
