# Fehler Goal 09: Die Warnung kommt auch an

## Status
ACTIVE

## Active Objective
`[INFO] webhook delivered` im Log des Watchdogs belegt nur, dass ntfy den POST angenommen hat. ntfy nimmt jedes Thema an: Steht in
der crontab des Servers ein falsches oder veraltetes Thema, antwortet der Webhook mit 200, der Watchdog schreibt jeden Tag eine
Zustellung, und `alarm_path.status` in `ops/status.sh` bleibt `ok`, während keine Warnung auf einem Gerät ankommt. Danach liest
`ops/status.sh` mit `CP_ALERT_WEBHOOK` aus der lokalen Umgebung die Nachrichten des Themas, meldet `alarm_path.received` mit dem
Zeitpunkt des letzten Lebenszeichens und der letzten Nachricht des Watchdogs dort, und `alarm_path.status` wird `red`, wenn die
letzte Zustellung aus dem Log nicht auf dem Thema steht. URL und Thema stehen nie im Repo, in einer Ausgabe, einem Log oder in den
Argumenten eines Prozesses. Ändert nur `ops/status.sh`, die Tests zu `alarm_path` und `ops/README.md`; nichts auf dem Server ändert
sich, weil `ops/status.sh` lokal läuft.
Widerlegt, wenn eine Zustellung, die auf einem anderen Thema landete, schon heute `alarm_path.status` `red` ergibt. Übernimmt
`goals/_vorschlaege/fehler-kritik-2026-11-14-1.md`.
MVP: Funktion, weil die Guthaben-Warnung aus fehler 01 und jeder andere Alarm nur nützt, wenn er auf dem Telefon ankommt, und ein
falsches Thema heute in keiner Zeile von `ops/status.sh` auffällt.

## Voraussetzungen
- fehler Goal 08 DONE

## Kontext für den Maker
- Ziel: Wer `ops/status.sh` liest (die Ops-Triage, Matthias), sieht `red`, sobald eine Zustellung des Watchdogs nicht auf dem Thema
  ankommt, das er abonniert hat, statt einem `ok`, das nur die Annahme des POST misst.
- Bestand am 14.11.2026 auf `cf09ee2` (Kopf von `dev`): `ops/status.sh` holt über ssh die Zahl der Zeilen `webhook unreachable`
  (`ops/webhook-unreachable.sh`) und die Zeitpunkte der letzten gescheiterten und letzten zugestellten POSTs (`ops/webhook-last.sh`)
  und rechnet im Python-Block `alarm_path` mit den vier Feldern `unreachable_24h`, `last_unreachable`, `last_delivered`, `status`.
  Die Uhr kommt aus `CP_NOW`. `ops/watchdog.sh` postet mit `-H "Title: control-plane $severity"`, das Lebenszeichen also mit dem
  Titel `control-plane ALIVE` und Priorität `min`, einmal je UTC-Tag im ersten Lauf. `test/status-alarm-path.test.ts` vergleicht
  `alarm_path` mit `toEqual` gegen genau diese vier Felder, mit nachgebautem `ssh`, `curl` (`exit 7`) und `openssl`, ohne
  `CP_ALERT_WEBHOOK`, und kann per `STATUS_UNDER_TEST` eine andere Kopie von `ops/status.sh` prüfen.
- Entscheidung Tech Lead (14.11.2026), Fenster: Die ROADMAP nennt `since=26h`. ntfy hält Nachrichten aber nur im Cache des Servers,
  Standard `cache-duration` 12 Stunden (Doku von ntfy, Seite Konfiguration: „By default, ntfy keeps messages in-memory for 12 hours“). Das
  Lebenszeichen kommt kurz nach 00:00 UTC; ab etwa 12:00 UTC stünde es nicht mehr auf dem Thema, und ein Abgleich gegen 26 Stunden
  wäre jeden Nachmittag falsch rot. Deshalb gilt: Abfrage mit `json?poll=1&since=12h`, verglichen wird die letzte Zustellung aus
  dem Log, nicht das Lebenszeichen allein, und nur, solange sie im Cache liegen muss (jünger als 11 Stunden, eine Stunde Abstand
  zum Cache-Ende).
- Entscheidung Tech Lead (14.11.2026), Form von `alarm_path.received`: ein Objekt mit genau drei Feldern
  `{"last_alive": <ts|null>, "last_message": <ts|null>, "status": "ok"|"red"|"unknown"}`, Zeitpunkte im Format
  `%Y-%m-%dT%H:%M:%SZ` wie `last_delivered`, gerechnet aus dem Feld `time` (Sekunden seit 1970) der ntfy-Nachricht.
  - Gezählt werden nur Zeilen mit `"event": "message"`, deren `title` mit `control-plane ` beginnt (die Posts des Watchdogs).
    `last_message` ist die jüngste davon, `last_alive` die jüngste mit Titel genau `control-plane ALIVE`. Posts anderer Skripte
    ohne diesen Titel (`ops/backup.sh`, `ops/x402-series.sh`) zählen nicht.
  - `unknown`, wenn `CP_ALERT_WEBHOOK` fehlt oder leer ist (dann ruft `ops/status.sh` ntfy gar nicht auf), wenn `curl` nicht mit 0
    endet (`--fail`, also auch bei 4xx und 5xx) oder eine nicht leere Zeile der Antwort kein JSON-Objekt ist, und wenn
    `last_delivered` `null` oder älter als 11 Stunden ist (nichts, was noch auf dem Thema stehen müsste).
  - `red`, wenn `last_delivered` jünger als 11 Stunden ist und keine gezählte Nachricht ein `time` hat, das höchstens 300 Sekunden
    vor `last_delivered` liegt oder später (300 Sekunden für die Uhren von Server und ntfy).
  - sonst `ok`.
  - `alarm_path.status` wird zusätzlich `red`, wenn `received.status` `red` ist; `unknown` in `received` lässt `alarm_path.status`
    unverändert, damit ein Lauf ohne `CP_ALERT_WEBHOOK` nichts an der heutigen Meldung ändert.
- Entscheidung Tech Lead (14.11.2026), keine URL nach außen: `ops/status.sh` gibt die URL an `curl` über die Standardeingabe
  (`-K -`, Zeile `url = "…/json?poll=1&since=12h"`), nie als Argument, weil Argumente auf dem geteilten code-host in `ps` stehen.
  Fehlerausgaben von `curl` gehen nach `/dev/null`, keine Datei unter `/tmp` trägt URL oder Antwort länger als den Lauf, und keine
  Meldung von `ops/status.sh` nennt URL oder Thema.
- Tests: ein neuer Test `test/status-alarm-received.test.ts` mit eigenem nachgebautem `curl`, das seine Argumente in eine Datei
  schreibt, die Konfiguration aus der Standardeingabe liest und nur bei `json?poll=1` die geplanten JSON-Zeilen ausgibt (alle
  anderen Aufrufe `exit 7` wie bisher), `ssh` wie im bestehenden Test mit geplantem Log, `CP_NOW` 2026-11-13T12:00:00Z,
  `CP_ALERT_WEBHOOK` auf eine Adresse unter `.invalid` mit einem erfundenen Thema. Fälle mit genau diesen Namen, weil die
  Prüfbefehle sie per `-t` wählen:
  - „a sign of life on the topic is ok“ (Zustellung im Log 11:00:00Z, Nachricht `control-plane ALIVE` mit `time` derselben Sekunde)
  - „a delivery that never reached the topic is red“ (Zustellung 11:00:00Z, Thema lesbar, nur eine fremde Nachricht und ein
    Lebenszeichen vom Vortag 00:01:00Z; `alarm_path.status` `red`)
  - „an unreadable topic is unknown and leaves the status alone“ (`curl` endet für die Abfrage mit 22)
  - „a line that is no JSON makes the topic unreadable“
  - „without CP_ALERT_WEBHOOK it is unknown and asks nobody“ (die Argumentdatei zeigt keinen Aufruf mit `poll`)
  - „a delivery older than the cache of the topic is unknown“ (Zustellung 00:30:00Z, keine Nachricht)
  - „never shows URL or topic, in the output or in the arguments of curl“ (stdout, stderr und Argumentdatei enthalten weder Host
    noch Thema, für den roten und den unlesbaren Fall)
- `test/status-alarm-path.test.ts`: Die bestehenden Fälle bekommen nur das neue Feld in ihrer Erwartung
  (`received: { last_alive: null, last_message: null, status: "unknown" }` oder eine Konstante dafür), keine Zeile wird gelöscht
  oder geändert, keine Erwartung schwächer.
- `ops/README.md`: eine Zeile `alarm_path.received.status` in der Tabelle der Schwellen (rot heißt: die letzte Zustellung steht nicht
  auf dem Thema; URL und Thema in der crontab des Servers mit `CP_ALERT_WEBHOOK` aus `~/brain/connectors/secrets.env` abgleichen,
  nie in eine Datei des Repos schreiben), dazu im Absatz zum Lebenszeichen das Fenster von 11 Stunden und warum (Cache von ntfy).
  Englisch wie die ganze Datei.
- Rollout: keiner. `ops/status.sh` läuft auf dem code-host oder am Mac, nicht auf dem Server; `ops/watchdog.sh` und die crontab
  ändern sich nicht. Der Merge berührt `ops/**`, der Release-Auftrag danach hat auf dem Server nichts auszurollen.
- Keine Abfrage an das echte Thema, auch nicht zum Ausprobieren: `CP_ALERT_WEBHOOK` steht in keinem Prüfbefehl, keinem Test und
  keinem Log des Goals, und der Wert aus `~/brain/connectors/secrets.env` wird in diesem Goal nicht gelesen.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout.

## Done Condition
- [x] `ops/status.sh` meldet `alarm_path.received` mit `last_alive`, `last_message` und `status` nach den Regeln oben und setzt
      `alarm_path.status` auf `red`, wenn eine Zustellung der letzten 11 Stunden nicht auf dem Thema steht.
      MVP: Funktion, weil ein falsches Thema heute als `ok` durchgeht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-received.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"] >= 7, r["numFailedTests"], r["numPendingTests"])'` muss `True 0 0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-received.test.ts -t 'a sign of life on the topic is ok|a delivery that never reached the topic is red|an unreadable topic is unknown and leaves the status alone|a line that is no JSON makes the topic unreadable|without CP_ALERT_WEBHOOK it is unknown and asks nobody|a delivery older than the cache of the topic is unknown|never shows URL or topic' --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"], r["numFailedTests"])'` muss `7 0` ausgeben.
      Prüfung: `grep -c 'since=12h' ops/status.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '\.skip|skipIf|\.only|\.todo' test/status-alarm-received.test.ts` muss `0` ausgeben.
- [x] Gegenprobe: Der rote Fall ist mit dem `ops/status.sh` von `cf09ee2` rot und mit dem neuen grün.
      MVP: Funktion, weil erst die Gegenprobe zeigt, dass der Test genau die Lücke des Vorschlags misst.
      Prüfung: `d=$(mktemp -d); git show cf09ee2:ops/status.sh > "$d/status.sh"; STATUS_UNDER_TEST="$d/status.sh" PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-received.test.ts -t 'a delivery that never reached the topic is red' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-received.test.ts -t 'a delivery that never reached the topic is red' >/dev/null 2>&1 && echo gruen || echo rot` muss `gruen` ausgeben.
- [x] Die bestehenden Fälle von `test/status-alarm-path.test.ts` bleiben, wie sie sind, und bekommen nur das neue Feld.
      MVP: Funktion, weil die Regeln aus fehler 05 und 07 weiter gelten müssen.
      Prüfung: `git diff -U0 origin/dev...HEAD -- test/status-alarm-path.test.ts | grep -c '^-[^-]'` muss `0` ausgeben.
      Prüfung: `test "$(grep -c '^  it(' test/status-alarm-path.test.ts)" = "$(git show cf09ee2:test/status-alarm-path.test.ts | grep -c '^  it(')" && echo gleich || echo anders` muss `gleich` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-path.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numFailedTests"], r["numPendingTests"])'` muss `0 0` ausgeben.
- [x] URL und Thema stehen nirgends: nicht als Argument von `curl`, nicht im Diff, nicht in einer Ausgabe.
      MVP: Funktion, weil wer das Thema kennt, auf das Telefon von Matthias schreiben kann und das Repo öffentlich ist.
      Prüfung: `grep -c -- '-K -' ops/status.sh` muss mindestens 1 ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -cE 'ntfy\.sh/[A-Za-z0-9_-]'` muss `0` ausgeben.
- [x] `ops/README.md` erklärt `alarm_path.received` mit Schwelle, Handgriff und dem Fenster von 11 Stunden.
      MVP: Funktion, weil die Ops-Triage ihre Schwellen aus dieser Tabelle liest.
      Prüfung: `grep -c '^| `alarm_path.received.status` |' ops/README.md` muss `1` ausgeben.
      Prüfung: `grep -c '11 h' ops/README.md` muss mindestens 1 ausgeben.
- [x] Nur `ops/status.sh`, die beiden Tests, `ops/README.md` und Dateien des Goals ändern sich, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(ops/status\.sh|ops/README\.md|test/status-alarm-path\.test\.ts|test/status-alarm-received\.test\.ts|goals/fehler/)' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src deploy ops/watchdog.sh ops/webhook-last.sh ops/webhook-unreachable.sh | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Zeile im Progress Log nennt die Gegenprobe: alter `ops/status.sh` im roten Fall rot, neuer grün.
- [ ] Kein Aufruf an das echte Thema und kein Wert von `CP_ALERT_WEBHOOK` in Test, Fixture, Commit, PR, Kommentar, Log oder Verdict;
      Tests nur mit Adressen unter `.invalid` und erfundenen Themen.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, `ops/README.md` Englisch wie die ganze Datei, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.claude/**`, `.env*`, `*.key`, `*.pem`
- `src/**`, `ops/watchdog.sh`, `ops/webhook-last.sh`, `ops/webhook-unreachable.sh`, jede andere Datei `ops/*.sh` außer
  `ops/status.sh`, die crontab des Servers
- `~/brain/connectors/secrets.env` und jede echte Adresse des Alarmwegs: nie lesen, nie abfragen, nie ins Repo
- jede Goal-Datei außer dieser, jedes Verdict, jeder Vorschlag unter `goals/_vorschlaege/`, jedes `ANNAHMEN.md` eines anderen Topics,
  `docs/audit/**`, `loop-dauerauftrag.md`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut: ops/status.sh liest mit CP_ALERT_WEBHOOK das Thema zurück (json?poll=1&since=12h, URL per -K - auf stdin) und meldet alarm_path.received, neuer Test test/status-alarm-received.test.ts mit 9 Fällen (alle 9 gegen den alten Stand rot gesehen), bestehende 10 Fälle nur um `received: NOT_ASKED` ergänzt, Schwelle und Fenster 11 h in ops/README.md. Gegenprobe: alter ops/status.sh (cf09ee2) im roten Fall rot (`alarm_path.status` `ok` ohne `received`), neuer grün; eine Kopie aus STATUS_UNDER_TEST läuft im Test neben den Hilfsskripten aus ops/, sonst wäre der alte Stand nur an fehlendem ops/webhook-last.sh gescheitert. Prüfbefehle: P1 `True 0 0`, `7 0`, `2`, `0`; P2 `rot`, `gruen`; P3 `0`, `gleich`, `0 0`; P4 `2`, `0`; P5 `1`, `3`; P6 `0`, `0`, check Exit 0 (1756 Tests grün).

## Blockers
