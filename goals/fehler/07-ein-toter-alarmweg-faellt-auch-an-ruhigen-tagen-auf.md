# Fehler Goal 07: Ein toter Alarmweg fällt auch an ruhigen Tagen auf

## Status
PLANNED

## Active Objective
`ops/watchdog.sh` postet nur einen Wechsel (Ausfall, zurück, Guthaben, Zertifikat). Solange alles grün ist, gibt es keinen POST und
darum keine Zeile `[WARN] webhook unreachable`; stirbt der Webhook an einem ruhigen Tag, meldet `ops/status.sh` weiter `alarm_path`
`ok`, und der Ausfall fällt erst auf, wenn die erste echte Warnung (etwa ein leeres Guthaben) nicht ankommt. Danach postet der
Watchdog einmal am Tag ein Lebenszeichen mit Priorität `min` über denselben `report`, dessen Scheitern dieselbe Zeile schreibt, und
schreibt nach jedem zugestellten POST `[INFO] webhook delivered`. `ops/status.sh` stellt die letzte Zustellung neben die Zählung und
meldet `red` nur, wenn nach der letzten Zeile `webhook unreachable` keine Zustellung mehr kam, damit ein Ausfall von 15 Minuten nicht
24 Stunden rot hält. Auf den Server kommt es mit dem nächsten Rollout des Laufzeitpfads.
Widerlegt, wenn ein Webhook, der an einem Tag ohne Meldung stirbt, schon heute binnen 24 Stunden eine rote Zeile in `ops/status.sh`
bringt. Übernimmt `goals/_vorschlaege/fehler-kritik-2026-11-13-1.md`.
MVP: Funktion, weil die Guthaben-Warnung die einzige Vorwarnung vor einem Ausfall für jeden zahlenden Kunden ist und ein Alarmweg,
der nur im Ernstfall geprüft wird, im Ernstfall schon verloren ist.

## Voraussetzungen
- fehler Goal 06 DONE

## Kontext für den Maker
- Ziel: Wer den Dienst betreibt, erfährt binnen 24 Stunden, dass keine Warnung mehr ankommt, bevor eine echte Warnung verloren geht.
- Bestand am 13.11.2026 auf `3694a55` (Kopf von `dev`): `report` in `ops/watchdog.sh` postet mit `curl -s --fail -m 15`, Header
  `Priority` ist `default` für `OK` und sonst `high`, bei Fehler schreibt es `<TS> [WARN] webhook unreachable` und endet mit 1. Ein
  erfolgreicher POST hinterlässt keine eigene Zeile. `ops/webhook-unreachable.sh [LOG]` zählt die Zeilen `webhook unreachable` der
  letzten 24 Stunden (`CP_NOW`, `CP_WATCHDOG_LOG`, Exit 2 ohne Log), `ops/status.sh` schickt es per `ssh 'bash -s'` auf den Server
  und schreibt `alarm_path` mit `red` ab 3. Auf dem Server am 13.11.2026: 0 Zeilen `webhook unreachable` seit 19.09.2026, also nie
  ein POST-Fehler, aber auch kein Beleg, dass der Weg heute zustellt.
- Entscheidung Tech Lead (13.11.2026), Lebenszeichen: `report` bekommt die Art `ALIVE` mit Header `Priority: min` (die Zuordnung
  heißt dann `OK` `default`, `ALIVE` `min`, sonst `high`), Text `daily sign of life, the alarm path works`. `min`, weil ntfy eine
  Meldung mit `min` ohne Ton und ohne Vibration zustellt: Der POST belegt den Weg, ohne jeden Tag zu stören.
  Der Watchdog postet es im ersten Lauf eines UTC-Tags, an dem der Stempel `${STATE_FILE}.alive` nicht diesen Tag (`date -u +%F`)
  trägt, und schreibt den Stempel erst nach erfolgreichem POST, wie bei `credit unreadable` und dem Zertifikat. Scheitert der POST,
  versucht es jeder Lauf alle fünf Minuten neu, also stehen nach 15 Minuten drei Zeilen `webhook unreachable` im Log. Das
  Lebenszeichen läuft vor dem Health-Check (gleich nach `check_credit`), damit auch ein Lauf während eines Ausfalls es versucht.
- Entscheidung Tech Lead (13.11.2026), Zustellung: Nach jedem erfolgreichen POST in `report` schreibt der Watchdog genau
  `<TS> [INFO] webhook delivered`, ohne `CP_ALERT_WEBHOOK` nicht. `ops/webhook-unreachable.sh` bleibt unverändert, weil die
  Prüfbefehle von fehler 05 seine Ausgabe als eine Zahl lesen. Neues Skript `ops/webhook-last.sh [LOG]` (gleiche Variablen, gleiche
  Regex-Schreibweise ohne `{4}` wegen mawk auf dem Server, Exit 2 ohne Ausgabe bei fehlendem Log) gibt eine Zeile
  `<letzte unreachable> <letzte delivered>` aus, je Zeitstempel oder `-`, über das ganze Log, nicht nur 24 Stunden. `ops/status.sh`
  schickt es wie das andere Skript über `"${SSH[@]}" 'bash -s'` und schreibt `"alarm_path": {"unreachable_24h": <Zahl oder null>,
  "last_unreachable": <TS oder null>, "last_delivered": <TS oder null>, "status": …}`. Regel: `unknown`, wenn die Zahl fehlt; `red`,
  wenn die Zahl mindestens 3 ist und `last_delivered` fehlt oder älter ist als `last_unreachable`; sonst `ok`. Liefert
  `ops/webhook-last.sh` nichts Lesbares, sind beide Felder `null` und es gilt die Regel von fehler 05 (`red` ab 3), damit ein Fehler
  im neuen Skript nie einen roten Alarmweg grün macht.
- Abschalter für Tests: `CP_WATCHDOG_ALIVE=0` schaltet nur das Lebenszeichen ab, ohne die Variable ist es an. Die vier bestehenden
  Tests, die `ops/watchdog.sh` mit Webhook laufen lassen (`test/watchdog-credit.test.ts`, `test/watchdog-credit-kritik.test.ts`,
  `test/watchdog-webhook-fail.test.ts`, `test/watchdog-webhook-fail-daily.test.ts`), zählen alle POSTs und setzen deshalb
  `CP_WATCHDOG_ALIVE: "0"` in ihrer Umgebung; sonst ändert sich an ihnen nichts. Liegt beim Start schon ein weiterer Test auf `dev`,
  der `ops/watchdog.sh` laufen lässt (etwa `test/watchdog-topup.test.ts` aus betrieb 05), bekommt er dieselbe Zeile. Alte Watchdogs
  kennen die Variable nicht, deshalb bleiben die Gegenproben von fehler 03 und 05 rot.
- Neuer Test `test/watchdog-alive.test.ts` mit dem Aufbau von `test/watchdog-webhook-fail-daily.test.ts` (Fakes für `curl`,
  `docker`, `openssl`, `sleep`, `date`; Health 200, Guthaben ok, `WATCHDOG_UNDER_TEST` für die Gegenprobe). Der Fake für `date` liest
  den Tag aus einer Datei der Sandbox, damit ein Fall den nächsten Tag fahren kann. Fälle, je ein `it`, die Namen enthalten die
  Wörter in Anführung, weil die Prüfbefehle sie mit `-t` wählen: „quiet day posts one sign of life“ (erster Lauf genau ein POST mit
  `Priority: min`, Log mit `[INFO] webhook delivered`, zweiter Lauf am selben Tag kein POST, erster Lauf am nächsten Tag wieder genau
  einer), „dead webhook on a quiet day“ (jeder POST scheitert mit Exit 22, drei Läufe schreiben genau drei Zeilen
  `[WARN] webhook unreachable`, und `ops/webhook-unreachable.sh` mit `CP_NOW` auf dem Tag des Fakes zählt aus der Ausgabe der drei
  Läufe 3), „CP_WATCHDOG_ALIVE=0 posts no sign of life“ (kein POST, keine Zeile `webhook unreachable` bei totem Webhook).
- `test/status-alarm-path.test.ts`: Die fünf bestehenden Fälle behalten Zahl und Status und erwarten dazu die beiden neuen Felder.
  Neue Fälle: „delivered after the last failure is ok“ (drei Zeilen `webhook unreachable` 11:00, 11:05, 11:10 und
  `[INFO] webhook delivered` 11:15 am 13.11.2026 ergeben `ok`), „delivered before the failures is red“ (Zustellung 10:55, dann
  drei Fehler ergeben `red`). Der Fake für `ssh` führt jeden Aufruf mit `bash -s` lokal aus, also auch das neue Skript.
- `ops/README.md`: Abschnitt „Watchdog on the VM“ nennt das Lebenszeichen (einmal am Tag, Priorität `min`, Zeile
  `[INFO] webhook delivered`, Abschalter `CP_WATCHDOG_ALIVE=0` nur für Tests), die Zeile `alarm_path.status` der Schwellentabelle
  nennt die neue Regel (rot nur ohne Zustellung nach dem letzten Fehler). Die URL des Webhooks steht nie im Repo, in keinem Test,
  keiner Fixture, keinem Log, keinem Commit und keinem Verdict; Tests nutzen `.invalid`-Namen, keine öffentliche IPv4-Adresse.
- Rollout: Das Goal ändert `ops/watchdog.sh` und `ops/status.sh`, nicht `src/`. `deploy.yml` rollt dafür nicht aus; der Watchdog auf
  dem Server kommt mit dem nächsten Rollout des Laufzeitpfads mit (LOOP.md, Release, Grundregel 5). Die crontab des Servers ändert
  sich nicht, kein Schritt auf dem Server, kein POST an den echten Webhook.
- Traction: Seit 19.09.2026 hängt jede Warnung an diesem einen Weg; ein Lebenszeichen am Tag ist die billigste Probe, dass er trägt.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Neue Dateien vor dem lokalen
  `check` stagen, weil die Regeln nur `git ls-files` lesen.

## Done Condition
- [x] `ops/watchdog.sh` postet einmal am Tag ein Lebenszeichen mit Priorität `min`, schreibt nach jedem zugestellten POST
      `[INFO] webhook delivered`, und ein toter Webhook an einem Tag ohne Meldung hinterlässt nach drei Läufen drei Zeilen
      `[WARN] webhook unreachable`; vor dem Fix blieb dieser Fall stumm.
      MVP: Funktion, weil genau dieser Fall heute niemandem auffällt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-alive.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"] >= 3, r["numFailedTests"], r["numPendingTests"])'` muss `True 0 0` ausgeben.
      Prüfung: `d=$(mktemp -d); git show 3694a55:ops/watchdog.sh > "$d/watchdog.sh"; cp ops/credit-runway.sh "$d/"; WATCHDOG_UNDER_TEST="$d/watchdog.sh" PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-alive.test.ts -t 'dead webhook on a quiet day' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); git show 3694a55:ops/watchdog.sh > "$d/watchdog.sh"; cp ops/credit-runway.sh "$d/"; WATCHDOG_UNDER_TEST="$d/watchdog.sh" PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-alive.test.ts -t 'quiet day posts one sign of life' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `grep -c 'curl -s --fail ' ops/watchdog.sh` muss 1 ausgeben.
      Prüfung: `grep -cE '\.skip|skipIf|\.only|\.todo' test/watchdog-alive.test.ts` muss 0 ausgeben.
- [x] `ops/webhook-last.sh` nennt die letzte Zeile `webhook unreachable` und die letzte Zustellung eines Logs, mit `-` für keine, und
      endet ohne Log mit Exit 2 ohne Ausgabe.
      MVP: Funktion, weil `ops/status.sh` ohne diese beiden Zeitpunkte einen behobenen Ausfall nicht von einem laufenden trennt.
      Prüfung: `d=$(mktemp -d); printf '%s [WARN] webhook unreachable\n' 2026-11-13T11:00:00Z 2026-11-13T11:05:00Z 2026-11-13T11:10:00Z > "$d/w.log"; printf '2026-11-13T11:15:00Z [INFO] webhook delivered\n2026-11-13T11:20:00Z [WARN] webhook unreachable again\n' >> "$d/w.log"; bash ops/webhook-last.sh "$d/w.log"` muss genau `2026-11-13T11:10:00Z 2026-11-13T11:15:00Z` ausgeben.
      Prüfung: `d=$(mktemp -d); printf '%s [WARN] webhook unreachable\n' 2026-11-13T11:00:00Z 2026-11-13T11:05:00Z > "$d/w.log"; bash ops/webhook-last.sh "$d/w.log"` muss genau `2026-11-13T11:05:00Z -` ausgeben.
      Prüfung: `d=$(mktemp -d); bash ops/webhook-last.sh "$d/fehlt.log"; echo "exit=$?"` muss genau `exit=2` ausgeben.
      Prüfung: `d=$(mktemp -d); printf '%s [WARN] webhook unreachable\n' 2026-11-13T11:50:00Z 2026-11-13T11:40:00Z 2026-11-12T12:01:00Z 2026-11-12T11:59:00Z > "$d/w.log"; printf '2026-11-13T11:55:00Z [INFO] webhook delivered\n' >> "$d/w.log"; CP_NOW=1794571200 bash ops/webhook-unreachable.sh "$d/w.log"` muss `3` ausgeben.
- [x] `ops/status.sh` meldet `alarm_path` mit `last_unreachable` und `last_delivered` und `red` nur, wenn nach dem letzten Fehler keine
      Zustellung kam; `test/status-alarm-path.test.ts` belegt es ohne Netz, und der Fall mit Zustellung danach war vor dem Fix rot.
      MVP: Funktion, weil ein Ausfall von 15 Minuten sonst 24 Stunden lang rot meldet und die rote Zeile ihren Wert verliert.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-path.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"] >= 7, r["numFailedTests"], r["numPendingTests"])'` muss `True 0 0` ausgeben.
      Prüfung: `d=$(mktemp -d); git show 3694a55:ops/status.sh > "$d/status.sh"; cp ops/db-report.cjs ops/webhook-unreachable.sh ops/webhook-last.sh "$d/"; STATUS_UNDER_TEST="$d/status.sh" PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-path.test.ts -t 'delivered after the last failure is ok' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); git show de06752:ops/status.sh > "$d/status.sh"; cp ops/db-report.cjs "$d/"; STATUS_UNDER_TEST="$d/status.sh" PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-path.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `grep -cE '\.skip|skipIf|\.only|\.todo' test/status-alarm-path.test.ts` muss 0 ausgeben.
- [x] Jeder andere Test, der `ops/watchdog.sh` laufen lässt, schaltet das Lebenszeichen ab und bleibt grün, und die Gegenproben von
      fehler 03 und 05 bleiben rot.
      MVP: Funktion, weil diese Tests jeden POST zählen und ein zusätzlicher POST sie rot machen würde, ohne dass etwas kaputt ist.
      Prüfung: `for f in $(git grep -l '"watchdog.sh"' -- test/ | grep -v '^test/watchdog-alive\.test\.ts$'); do grep -q 'CP_WATCHDOG_ALIVE: "0"' "$f" || echo "$f"; done | wc -l` muss 0 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-credit.test.ts test/watchdog-credit-kritik.test.ts test/watchdog-webhook-fail.test.ts test/watchdog-webhook-fail-daily.test.ts` muss Exit-Code 0 haben.
      Prüfung: `d=$(mktemp -d); git show 5458fa3:ops/watchdog.sh > "$d/watchdog.sh"; cp ops/credit-runway.sh "$d/"; WATCHDOG_UNDER_TEST="$d/watchdog.sh" PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-webhook-fail.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); sed 's/curl -s --fail /curl -s /' ops/watchdog.sh > "$d/watchdog.sh"; cp ops/credit-runway.sh "$d/"; WATCHDOG_UNDER_TEST="$d/watchdog.sh" PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-webhook-fail.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
- [x] `ops/README.md` nennt das Lebenszeichen und die neue Regel für `alarm_path.status`.
      MVP: Funktion, weil die Ops-Triage nach der Schwellentabelle urteilt und wer die Meldung mit `min` sieht, wissen muss, was sie heißt.
      Prüfung: `grep -c 'webhook delivered' ops/README.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -c 'CP_WATCHDOG_ALIVE' ops/README.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -c '^| .alarm_path\.status. |' ops/README.md` muss 1 ausgeben.
      Prüfung: `grep '^| .alarm_path\.status. |' ops/README.md | grep -c 'delivered'` muss 1 ausgeben.
- [x] Nur Watchdog, Status, das neue Skript, `ops/README.md`, die genannten Tests und Dateien des Goals ändern sich, `src/` nicht,
      und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(ops/watchdog\.sh|ops/status\.sh|ops/webhook-last\.sh|ops/README\.md|test/watchdog-alive\.test\.ts|test/status-alarm-path\.test\.ts|test/watchdog-credit\.test\.ts|test/watchdog-credit-kritik\.test\.ts|test/watchdog-webhook-fail\.test\.ts|test/watchdog-webhook-fail-daily\.test\.ts|test/watchdog-topup\.test\.ts|goals/fehler/)' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src ops/webhook-unreachable.sh | wc -l` muss 0 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] Ein Watchdog, der nicht mehr postet, fällt auf: `ops/status.sh` meldet `alarm_path` `red`, wenn `last_delivered` gesetzt und
      älter als 26 Stunden ist, auch bei 0 Zeilen `webhook unreachable`; ist `last_delivered` `null` (vor dem Rollout, Log rotiert,
      Antwort unlesbar), gilt die Regel von oben unverändert. Die Uhr ist `CP_NOW` (Sekunden seit 1970), ohne die Variable die
      Systemzeit; `test/status-alarm-path.test.ts` setzt `CP_NOW` auch für `ops/status.sh`. `ops/README.md` nennt die 26 Stunden in
      der Zeile `alarm_path.status`.
      MVP: Funktion, weil das Lebenszeichen nur Zeilen schreibt, solange der Watchdog läuft: Fällt die crontab weg, bricht das
      Skript vor `sign_of_life` ab oder steht `CP_WATCHDOG_ALIVE=0` auf dem Server, entsteht keine einzige Zeile, und `alarm_path`
      bleibt `ok`, obwohl keine Warnung mehr rausgeht. 26 Stunden, weil das Lebenszeichen im ersten Lauf jedes UTC-Tags kommt, also
      höchstens 24 Stunden und ein paar Läufe auseinanderliegt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-path.test.ts -t 'a delivery older than 26 hours is red' --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"] >= 1, r["numFailedTests"])'` muss `True 0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-path.test.ts -t 'a delivery within 26 hours is ok' --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"] >= 1, r["numFailedTests"])'` muss `True 0` ausgeben.
      Prüfung: `d=$(mktemp -d); git show 2f8e0a8:ops/status.sh > "$d/status.sh"; cp ops/db-report.cjs ops/webhook-unreachable.sh ops/webhook-last.sh "$d/"; STATUS_UNDER_TEST="$d/status.sh" PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-path.test.ts -t 'a delivery older than 26 hours is red' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/status-alarm-path.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"] >= 10, r["numFailedTests"], r["numPendingTests"])'` muss `True 0 0` ausgeben.
      Prüfung: `grep '^| .alarm_path\.status. |' ops/README.md | grep -c '26 h'` muss 1 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Zeile im Progress Log nennt die Gegenprobe: alter Watchdog mit totem Webhook an einem ruhigen Tag ohne Zeile
      `webhook unreachable`, neuer mit dreien.
- [ ] Keine URL eines Webhooks, kein Thema von ntfy und keine öffentliche IPv4-Adresse in Test, Fixture, Commit, PR, Kommentar, Log
      oder Verdict; Tests nur mit `.invalid`-Namen.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, `ops/README.md` Englisch wie die ganze Datei, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.claude/**`, `.env*`, `*.key`, `*.pem`
- `src/**`, `ops/webhook-unreachable.sh`, `ops/credit-runway.sh`, `ops/fetchers.py`, `ops/known-ips.txt`, `ops/own-ips.txt`,
  `ops/crawler-ips.txt`
- jede Goal-Datei außer dieser, jedes Verdict, jeder Vorschlag unter `goals/_vorschlaege/`, jedes `ANNAHMEN.md` eines anderen Topics,
  `docs/audit/**`, `loop-dauerauftrag.md`
- der Server: keine Änderung an crontab, Watchdog-Log oder Zustand dort, kein POST an den echten Webhook
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut: `ops/watchdog.sh` postet einmal am UTC-Tag ein Lebenszeichen mit `Priority: min` und schreibt nach jeder Zustellung `[INFO] webhook delivered`, neues `ops/webhook-last.sh`, `ops/status.sh` meldet `last_unreachable` und `last_delivered` und `red` nur ohne Zustellung danach, die vier Watchdog-Tests setzen `CP_WATCHDOG_ALIVE: "0"`, `ops/README.md` nennt Lebenszeichen und Regel. Gegenprobe: alter Watchdog (3694a55) mit totem Webhook an einem ruhigen Tag ohne Zeile `webhook unreachable` (Test rot), neuer mit dreien; die vier alten Tests ohne Abschalter rot (13 failed), mit grün; neuer Fall „unreadable answer“ gegen einen Status, der ein unlesbares `webhook-last.sh` als Zustellung nimmt, rot. Prüfbefehle: P1 `True 0 0`, rot, rot, 1, 0; P2 `2026-11-13T11:10:00Z 2026-11-13T11:15:00Z`, `2026-11-13T11:05:00Z -`, `exit=2`, 3; P3 `True 0 0` (8 Tests), rot, rot, 0; P4 0, Exit 0, rot, rot; P5 2, 1, 1, 1; P6 0, 0, `check` Exit 0 (1703 Tests grün).
- 2026-11-14 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, `dev` ohne neue Commits seit Zyklus 1 (Merge-Basis 54db0e0). Prüfbefehle: P1 `True 0 0`, rot, rot, 1, 0; P2 `2026-11-13T11:10:00Z 2026-11-13T11:15:00Z`, `2026-11-13T11:05:00Z -`, `exit=2`, 3; P3 `True 0 0`, rot, rot, 0; P4 0, Exit 0, rot, rot; P5 2, 1, 1, 1; P6 0, 0, `check` Exit 0 (1703 Tests grün).

## Blockers
