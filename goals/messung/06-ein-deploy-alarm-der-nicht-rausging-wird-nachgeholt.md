# Messung Goal 06: Ein Deploy-Alarm, der nicht rausging, wird nachgeholt

## Status
ACTIVE

## Active Objective
Seit messung 02 und 05 meldet `ops/deploy-window.sh` jeden 502 an eine fremde Anfrage nach einem Rollout über
`ops/deploy-alarm.sh` an den Webhook aus der Crontab, laut und mit Titel. Scheitert genau dieser Alarm (ssh weg, keine Zeile
`CP_ALERT_WEBHOOK` in der Crontab, POST rot), schreibt `ops/deploy-window.sh` nur `ALARM NOT SENT: exit <k>` (Zeile 442) und
behält Exit 1, also denselben Exit wie nach einem gesendeten Alarm, und `deploy.yml` (Zeile 165) macht daraus eine Warnung im
Job-Log, die niemand liest. Der 502 an einen zahlenden Kunden erreicht dann wieder niemanden. Nach diesem Goal endet
`ops/deploy-window.sh` bei einem fälligen, aber nicht gesendeten Alarm mit Exit 3, `ops/deploy-alarm.sh` legt bei fehlender
Webhook-Zeile oder rotem POST auf dem Server eine Merkdatei mit Zahl und Uhrzeit an, und `ops/watchdog.sh` sendet sie beim nächsten
Lauf über den Alarmweg und löscht sie erst nach erfolgreichem POST. Widerlegt, wenn der Watchdog eine Merkdatei nach rotem POST
löscht oder `ops/deploy-window.sh` am Kopf von `dev` schon zwischen gesendetem und gescheitertem Alarm unterscheidet (der Maker
prüft das zuerst mit `grep -cE "exit 3|rc=3" ops/deploy-window.sh` und `grep -c "deploy-502" ops/watchdog.sh`, heute je `0`, und
schreibt das Ergebnis in die erste Zeile des Progress Log).
MVP: Funktion, weil der Alarm nach einem missglückten Rollout den zahlenden Kunden nur schützt, wenn auch sein eigener Ausfall
jemanden erreicht.

## Voraussetzungen
- messung Goal 05 DONE

## Kontext für den Maker
- Ziel: Wer den Alarmweg abonniert hat, erfährt von jedem 502 an einen fremden Kunden nach einem Rollout, auch wenn der Alarm im
  Moment des Rollouts nicht rausging, spätestens mit dem nächsten Lauf des Watchdogs (alle fünf Minuten).
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 06; übernimmt `goals/_vorschlaege/messung-kritik-2026-11-14-4.md`. Der Vorschlag
  empfahl, `deploy.yml` bei Exit 3 rot zu machen; `.github/**` ist für Goals gesperrt (`gate.yaml`), deshalb holt der Watchdog den
  Alarm nach, statt dass der Job rot wird. `deploy.yml` bleibt, wie es ist: Exit 3 steht dort in der Warnung (`Exit $?`).
- **Merkdatei.** Pfad `<state>.deploy-502`, wobei `<state>` der Zustandspfad des Watchdogs ist (`STATE_FILE` in
  `ops/watchdog.sh`, Standard `/var/lib/cp-watchdog.state`, überschreibbar mit `CP_WATCHDOG_STATE`). So liegen alle Zustände des
  Watchdogs nebeneinander (`.alive`, `.credit`, `.cert`), und die bestehenden Tests des Watchdogs, die `CP_WATCHDOG_STATE` auf
  einen Temp-Ordner setzen und keine solche Datei anlegen, bleiben unverändert grün. Je gescheitertem Alarm genau eine Zeile
  `<count> <HH:MM:SS>` (dieselben zwei Argumente, die `ops/deploy-alarm.sh` bekommt), angehängt, nie überschrieben. Keine Adresse,
  keine URL.
- **`ops/deploy-alarm.sh`.** Den Zustandspfad nimmt es wie den Webhook aus der Crontab: die erste aktive Zeile, die
  `CP_WATCHDOG_STATE=` setzt, sonst `/var/lib/cp-watchdog.state`. Bei Exit 1 (POST rot) und bei Exit 2 wegen fehlender
  Webhook-Zeile hängt es die Zeile an die Merkdatei und schreibt auf stderr eine Zeile ohne Pfad und ohne URL, dass der Alarm für
  den Watchdog aufbewahrt ist; bei falschen Argumenten (auch Exit 2) und bei Exit 0 legt es nichts an. Scheitert das Schreiben,
  bleibt der Exit-Code, und stderr sagt es in einer Zeile. Exit-Codes 0, 1 und 2 und der `curl`-Aufruf aus messung 05 (Titel
  `deploy-window 502`, `Priority: high`, `-m 10`) bleiben, wie sie sind. Der Kopfkommentar nennt die Merkdatei.
- **`ops/deploy-window.sh`.** Ist der Alarm fällig (ohne `--at`, `rc` 1, `BAD GATEWAY` größer 0) und endet der ssh-Aufruf von
  `ops/deploy-alarm.sh` mit einem Code ungleich 0 (255 für ssh weg, 1, 2), druckt es wie heute `ALARM NOT SENT: exit <k>` und
  endet mit Exit 3; nach `ALARM SENT` bleibt Exit 1. Kopfkommentar und Abschnitt „Did the deploy cost a stranger an answer“ in
  `ops/README.md` nennen Exit 3 und `ALARM NOT SENT`. Ist ssh weg, kann keine Merkdatei entstehen; dann ist Exit 3 mit der
  Warnung im Job-Log der einzige Beleg, und das ist gewollt, weil nur ein Weg über `.github/**` mehr könnte.
- **`ops/watchdog.sh`.** Jeder Lauf prüft vor dem Health-Check (also auch während eines Ausfalls), ob `${STATE_FILE}.deploy-502`
  existiert. Mit `CP_ALERT_WEBHOOK` sendet er genau einen POST mit den Kopfzeilen `Title: deploy-window 502` und `Priority: high`
  (wörtlich derselbe Titel wie in `ops/deploy-alarm.sh`, damit `ops/status.sh` ihn wie in `goals/messung/ANNAHMEN.md`, messung 05,
  nicht als Meldung des Watchdogs zählt) und einem Text, der je Zeile der Datei Zahl und Uhrzeit nennt, ohne Adresse und ohne URL.
  Erst nach erfolgreichem POST löscht er die Datei; scheitert der POST, bleibt sie, und das Log bekommt wie bei jedem roten POST
  `[WARN] webhook unreachable`. Ohne `CP_ALERT_WEBHOOK` bleibt die Datei, und das Log bekommt eine Zeile `[WARN]`, dass ein
  Deploy-Alarm wartet. Der Kopfkommentar und der Abschnitt „Watchdog on the VM“ in `ops/README.md` nennen die Merkdatei.
- **Test `test/deploy-alarm-pending.test.ts`**, neu, ohne Netz, mit nachgebautem `ssh` und `curl` nach dem Muster von
  `test/deploy-window-rollout.test.ts`, `test/deploy-alarm.test.ts` und `test/watchdog-webhook-fail.test.ts`, alle Zustände in
  `mkdtemp`, jede Crontab mit `CP_WATCHDOG_STATE=<Temp-Ordner>/state`:
  - `it("deploy-window ends with exit 3 for every alarm that was not sent")`: Log mit einem 502 an einen Fremden, der ssh-Aufruf
    mit `bash -s` endet nacheinander mit 255, 1 und 2; je Lauf Exit 3 und die Zeile `ALARM NOT SENT: exit <k>`;
  - `it("deploy-alarm keeps count and time for the watchdog only when the alarm failed")`: POST rot (Exit 1) und Crontab ohne
    Webhook (Exit 2) hinterlassen je die Zeile `2 12:00:00` in `<Temp-Ordner>/state.deploy-502`; POST grün (Exit 0) und falsche
    Argumente (Exit 2) hinterlassen keine Datei; keine Ausgabe nennt `planted-topic`, `alarm.invalid` oder den Pfad;
  - `it("deploy-alarm appends a second failed alarm to the first")`: zwei rote POSTs, die Datei hat danach zwei Zeilen in der
    Reihenfolge der Aufrufe;
  - `it("watchdog sends a kept deploy alarm with priority high and then removes the file")`: Datei mit zwei Zeilen, ein Lauf mit
    Webhook; genau ein POST mit `Title: deploy-window 502` und `Priority: high` hinter je einem `-H`, dessen Text beide Zahlen und
    beide Uhrzeiten nennt und nicht auf `/(\d{1,3}\.){3}\d{1,3}/` passt; danach ist die Datei weg, und ein zweiter Lauf sendet
    keinen solchen POST mehr;
  - `it("watchdog keeps the file while the POST fails and sends it on the next run")`: erster Lauf mit rotem POST, die Datei bleibt
    Zeichen für Zeichen; zweiter Lauf mit grünem POST, der Deploy-Alarm geht raus, die Datei ist weg;
  - `it("watchdog keeps the file without a webhook and sends it once a webhook is set")`: Lauf ohne `CP_ALERT_WEBHOOK`, die Datei
    bleibt, das Log hat eine Zeile `[WARN]`; Lauf mit Webhook, der Deploy-Alarm geht raus, die Datei ist weg.
  Rot vor dem Fix sind alle sechs Fälle (heute endet `ops/deploy-window.sh` mit 1, legt `ops/deploy-alarm.sh` nichts an und kennt
  `ops/watchdog.sh` die Datei nicht); die Zeile im Progress Log nennt das mit Zahl.
- Die bestehenden Tests `test/deploy-alarm.test.ts`, `test/deploy-window-rollout.test.ts`, `test/deploy-window.test.ts` und
  `test/watchdog-*.test.ts` bleiben unverändert und grün. Ihre Crontabs setzen kein `CP_WATCHDOG_STATE`, also versucht
  `ops/deploy-alarm.sh` dort `/var/lib/cp-watchdog.state.deploy-502`; als normaler Nutzer scheitert das Schreiben still bis auf die
  stderr-Zeile, und kein bestehender Fall prüft stderr auf Gleichheit. Läuft ein Fall trotzdem rot, ist das ein Gap dieses Goals,
  kein Grund, den alten Fall zu ändern.
- Kein Rollout. Die neuen Fassungen erreichen die VM mit dem nächsten regulären Deploy: `ops/deploy-alarm.sh` schickt
  `ops/deploy-window.sh` per `bash -s`, `ops/watchdog.sh` liegt unter `/opt/control-plane/repo/ops/` und kommt mit dem Rollout.
  Kein Test, kein Selftest und kein Prüfbefehl ruft die VM, `crontab -l`, `/var/lib` mit Schreibabsicht oder einen echten Webhook auf.
- Code, Kommentare, Log-Zeilen und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich. Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout; neue Dateien vor `check` mit `git add`
  stagen. Kein `pkill -f`. Eine Entscheidung, die dieser Text offen lässt, schreibt der Maker als Zeile `- messung 06 (Engineer CP,
  <Datum>): …` in `goals/messung/ANNAHMEN.md`.

## Done Condition
- [x] `ops/deploy-window.sh` endet mit Exit 3, wenn ein fälliger Alarm nicht gesendet wurde, und Kopfkommentar und `ops/README.md`
      nennen das.
      Prüfung: `grep -c 'Exit 3' ops/deploy-window.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -c 'ALARM NOT SENT' ops/README.md` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/deploy-window.sh --selftest` muss Exit-Code 0 haben.
- [x] `ops/deploy-alarm.sh` hängt bei rotem POST und bei fehlender Webhook-Zeile Zahl und Uhrzeit an `<state>.deploy-502`, den
      Zustandspfad nimmt es aus der Crontab, und der `curl`-Aufruf aus messung 05 bleibt.
      Prüfung: `grep -c 'deploy-502' ops/deploy-alarm.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '^[^#]*CP_WATCHDOG_STATE' ops/deploy-alarm.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '^[^#]*curl -fsS -m 10 -H "Title: deploy-window 502" -H "Priority: high" ' ops/deploy-alarm.sh` muss 1 ausgeben.
- [x] `ops/watchdog.sh` sendet eine Merkdatei mit `Title: deploy-window 502` und `Priority: high` und löscht sie erst nach
      erfolgreichem POST.
      Prüfung: `grep -c 'deploy-502' ops/watchdog.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '^[^#]*Title: deploy-window 502' ops/watchdog.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -c 'deploy-502' ops/README.md` muss mindestens 1 ausgeben.
- [x] `test/deploy-alarm-pending.test.ts` belegt Exit 3, Merkdatei und Nachholen in den sechs Fällen, und die bestehenden Tests der
      drei Werkzeuge bleiben unverändert grün.
      Prüfung: `pnpm -s vitest run test/deploy-alarm test/deploy-window test/watchdog` muss Exit-Code 0 haben.
      Prüfung: `grep -cE 'it\("(deploy-window ends with exit 3 for every alarm that was not sent|deploy-alarm keeps count and time for the watchdog only when the alarm failed|deploy-alarm appends a second failed alarm to the first|watchdog sends a kept deploy alarm with priority high and then removes the file|watchdog keeps the file while the POST fails and sends it on the next run|watchdog keeps the file without a webhook and sends it once a webhook is set)"' test/deploy-alarm-pending.test.ts` muss 6 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- test | grep -vcE '^test/deploy-alarm-pending\.test\.ts$'` muss 0 ausgeben.
- [x] `check` ist grün, gesperrte Pfade bleiben unverändert, und unter `ops/` ändern sich nur die drei Werkzeuge und
      `ops/README.md`.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE '^(\.github|deploy|src|harness|scripts|docs)/|^goals/kanal/'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops | grep -vcE '^ops/(deploy-window\.sh|deploy-alarm\.sh|watchdog\.sh|README\.md)$'` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die sechs neuen Fälle waren vor dem Fix rot; die Zeile im Progress Log nennt sie und womit.
- [ ] Keine Ausgabe der drei Werkzeuge und keine Merkdatei nennt eine Adresse oder die URL des Webhooks.
- [ ] Ein Deploy-Alarm, der einmal in der Merkdatei steht, geht entweder raus oder bleibt stehen; kein Weg löscht ihn ohne
      erfolgreichen POST.
- [ ] Code, Kommentare, Log-Zeilen und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/fixtures/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- jede andere Datei unter `ops/` außer `ops/deploy-window.sh`, `ops/deploy-alarm.sh`, `ops/watchdog.sh` und `ops/README.md`, vor
  allem `ops/status.sh`, `ops/backup.sh`, `ops/webhook-last.sh` und `ops/webhook-unreachable.sh`
- jeder bestehende Test unter `test/`; neu ist nur `test/deploy-alarm-pending.test.ts`
- `goals/kanal/**`
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), `/var/lib`, die Crontab und jede Datei auf dem Server;
  Produktion weder lesend noch schreibend, kein Rollout, kein POST an einen echten Webhook
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-15 Widerlegung geprüft: `grep -cE "exit 3|rc=3" ops/deploy-window.sh` -> 0, `grep -c "deploy-502" ops/watchdog.sh` -> 0 am Kopf von `dev` (19ac027), das Goal ist nicht widerlegt.
- 2026-11-15 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: `ops/deploy-window.sh` endet bei ALARM NOT SENT mit Exit 3, `ops/deploy-alarm.sh` hängt bei rotem POST und fehlender Webhook-Zeile `<count> <HH:MM:SS>` an `<state>.deploy-502` (Zustandspfad aus der Crontab), `ops/watchdog.sh` sendet die Datei vor dem Health-Check mit `Title: deploy-window 502` und `Priority: high` und löscht sie erst nach zugestelltem POST, dazu `ops/README.md` und `test/deploy-alarm-pending.test.ts`; vor dem Fix waren alle 6 neuen Fälle rot (`pnpm -s vitest run test/deploy-alarm-pending` -> 6 failed, 6 Tests). Prüfbefehle: P1 `Exit 3` 3, `ALARM NOT SENT` 1, Selftest Exit 0; P2 `deploy-502` 2, `CP_WATCHDOG_STATE` 1, `curl`-Zeile 1; P3 `deploy-502` 2, Titelzeile 1, README `deploy-502` 3; P4 vitest Exit 0 (10 Dateien, 51 Tests), sechs Testnamen 6, fremde Tests 0; P5 `check` Exit 0 (163 Dateien, 1840 Tests), gesperrte Pfade 0, fremde ops-Dateien 0, Dateien unter XDG_STATE_HOME 0.

## Blockers
- keine
