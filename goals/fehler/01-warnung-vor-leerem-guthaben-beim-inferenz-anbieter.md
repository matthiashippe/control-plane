# Fehler Goal 01: Warnung vor leerem Guthaben beim Inferenz-Anbieter

## Status
ACTIVE

## Active Objective
Bevor das Guthaben beim Inferenz-Anbieter ausgeht, kommt eine Warnung über den Alarmweg, der heute schon Ausfälle meldet
(`ops/watchdog.sh` auf dem Server, alle 5 Minuten, Webhook aus `CP_ALERT_WEBHOOK`). Am 11.11.2026 war das Guthaben leer: Ein zahlender
fremder Automaton bekam auf `POST /v1/chat/completions` ab 02:01 UTC 503, 1001 Mal am 11.11. und 264 Mal am 12.11. bis 05:37 UTC, weil
der Anbieter 402 antwortete, und niemand wusste es (`goals/_vorschlaege/fehler-2026-11-11-1.md`, Schwere 5, Grundregel 4). Die Schwelle
steht gegen den Verbrauch je Tag: gewarnt wird, wenn das Restguthaben für weniger als `CP_CREDIT_WARN_DAYS` Tage reicht (Standard 3)
oder unter `CP_CREDIT_WARN_USD` liegt (Standard 5 USD).
Widerlegt, wenn das Guthaben in den 14 Tagen nach dem Rollout dieses Goals wieder auf 0 fällt, ohne dass das Log des Watchdogs vorher
eine Zeile `[WARN] credit` zeigt.
MVP: Funktion, weil ein leeres Guthaben jede Inferenz-Anfrage jedes Kunden mit 503 beantwortet und der Kunde, der das 28 Stunden lang
sieht, zu Conway zurück oder ganz geht.

## Voraussetzungen
- keine

## Kontext für den Maker
- Entscheidung Tech Lead (12.11.2026): Die Warnung geht über `ops/watchdog.sh`, weil das der einzige Alarmweg ist, der heute einen
  Menschen erreicht (Cron auf dem Server alle 5 Minuten mit Webhook, meldet nur Zustandswechsel). Cron-Zeile und Webhook bleiben, wie
  sie sind (`loop-constraints.md`, Produktion: nur lesen); dieses Goal ändert nur das Skript im Repo. `ops/` rollt nicht allein aus
  (`LOOP.md`, Release): Auf dem Server wirkt die Warnung mit dem nächsten Rollout des Laufzeitpfads. Bis dahin schützt die Aufladung
  mit Auto-Top-Up, die Matthias auf seinem Board hat (Human Gate `server_kauf`).
- Neues Werkzeug `ops/credit-runway.sh`, nur lesend, eine Rechnung für alle Wege:
  - Guthaben: `GET https://openrouter.ai/api/v1/credits` (`data.total_credits` minus `data.total_usage`, USD). Verbrauch je Tag:
    `GET https://openrouter.ai/api/v1/key` (`data.usage_weekly` geteilt durch 7). Beide Endpunkte beantworten den normalen Schlüssel
    `OPENROUTER_API_KEY`, gemessen am 12.11.2026 um 05:41 UTC; ein Management-Key ist nicht nötig und wird nicht gelesen.
  - Ohne Argument (code-host): Schlüssel aus der Umgebung oder `~/.config/control-plane/loop.env`, an curl über stdin, nie auf der
    Befehlszeile, nie ausgegeben. `--container` (Server): beide Abfragen per `docker exec deploy-cp-1 node -e …` mit dem Schlüssel aus
    der Umgebung des Containers, so verlässt der Schlüssel den Container nicht und der Watchdog braucht keinen. `--files CREDITS KEY`:
    dieselbe Rechnung aus zwei JSON-Dateien. `--selftest`: ohne Netz, gepflanzte Dateien in beide Richtungen.
  - Ausgabe genau eine Zeile: `CREDIT RUNWAY OK: <Rest> USD, <Tage> Tage bei <je Tag> USD je Tag` mit Exit 0, oder `CREDIT RUNWAY LOW: …`
    mit Exit 1, oder `CREDIT RUNWAY FAIL: <Grund>` mit Exit 2, wenn eine Antwort fehlt oder kein JSON ist. Ein Rest von 0 oder weniger
    ist immer LOW. Liegt der Verbrauch je Tag bei 0 (so am 12.11., weil jede Anfrage scheiterte), rechnet das Werkzeug mit
    `CP_CREDIT_MIN_DAILY_USD` (Standard 1 USD), damit ein Ausfall die Reichweite nicht unendlich macht.
- `ops/watchdog.sh` ruft `ops/credit-runway.sh --container` und meldet wie bei der Gesundheit nur den Wechsel: einmal `[WARN] credit
  …` mit der Zeile des Werkzeugs, wenn LOW beginnt, einmal `[OK] credit …`, wenn es endet, nichts dazwischen. Ein FAIL des Werkzeugs
  ist `[WARN] credit unreadable` und ändert den gespeicherten Zustand nicht. Die Meldung nennt den Weg zum Aufladen
  (`https://openrouter.ai/settings/credits`) und nie einen Schlüssel.
- Tests unter `test/`, ohne Netz: Fakes für `curl` und `docker` auf dem `PATH` wie in `test/answers-folder.test.ts`, der Webhook ein
  Fake-`curl`, das jeden POST in ein Log schreibt. Der Zustand des Watchdogs in einer Datei aus `mktemp` (`CP_WATCHDOG_STATE`).
- Traction: Ein Kunde, dessen Anfragen ankommen, bleibt; jede Stunde mit 503 ist ein Automaton, der den Umzug von Conway bereut. Ohne
  Warnung lebt jeder weitere Kunde vom Zufall, dass jemand das Guthaben ansieht.
- Kein Wort zu den Bedingungen des Anbieters in Code oder Doku (`check` prüft es), nur Guthaben und Verbrauch. Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout.

## Done Condition
- [x] `ops/credit-runway.sh` rechnet Reichweite und Schwelle aus Guthaben und Verbrauch je Tag, und der Selftest zeigt beide Richtungen:
      20 USD gekauft und 20,16 USD verbraucht ist LOW mit Exit 1, 40 USD Rest bei 7 USD Verbrauch in der Woche ist OK mit Exit 0,
      4 USD Rest bei 0 Verbrauch ist LOW (Mindestverbrauch und Mindestbetrag), eine leere Antwort ist FAIL mit Exit 2.
      Prüfung: `bash ops/credit-runway.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `CREDIT RUNWAY SELFTEST OK` ausgeben.
      Prüfung: `bash ops/credit-runway.sh --selftest | grep -cE "^ok   (low|ok|fail) "` muss mindestens 4 ausgeben.
      Prüfung: `pnpm -s vitest run test/credit-runway.test.ts` muss Exit-Code 0 haben.
- [x] `ops/watchdog.sh` warnt einmal, wenn die Reichweite unter die Schwelle fällt, und einmal, wenn sie zurückkommt. Der Test fährt
      den Watchdog dreimal mit gepflanztem niedrigem Guthaben und dann einmal mit ausreichendem und verlangt genau einen POST mit
      `credit` und `LOW` und danach genau einen mit `credit` und `OK`; mit dem Watchdog von heute gibt es keinen solchen POST, die
      Zeile im Progress Log nennt es. Kein POST und keine Zeile enthält den gepflanzten Schlüssel.
      Prüfung: `pnpm -s vitest run test/watchdog-credit.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "credit-runway.sh --container" ops/watchdog.sh` muss mindestens 1 ausgeben.
- [x] Die Reichweite von heute ist gemessen und steht mit Befehl in `docs/betrieb/guthaben.md`: Rest, Verbrauch je Tag, Reichweite,
      Schwelle, Uhrzeit in UTC, ohne Schlüssel.
      Prüfung (Netz): `bash ops/credit-runway.sh` muss eine Zeile ausgeben, die mit `CREDIT RUNWAY OK: ` oder `CREDIT RUNWAY LOW: ` beginnt.
      Prüfung: `grep -c "bash ops/credit-runway.sh" docs/betrieb/guthaben.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "sk-or-[A-Za-z0-9-]{8,}" docs/betrieb/guthaben.md ops/credit-runway.sh ops/watchdog.sh` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jede neue Selftest-Zeile war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Zahl in `docs/betrieb/guthaben.md` mit dem Befehl, aus dem sie stammt; keine Adresse und kein Name eines Kunden.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- Crontab, `/opt/control-plane/.env` und jede Datei auf dem Server; Produktion nur lesend
- jede Aufladung und jeder Kauf beim Anbieter (Human Gate `server_kauf`); der Management-Key
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-12 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: `ops/credit-runway.sh` (Rechnung, `--container`, `--files`, `--selftest`), `ops/watchdog.sh` meldet den Wechsel LOW und OK, Messung in `docs/betrieb/guthaben.md` (9,37 USD Rest, 2,49 USD je Tag, 3,7 Tage, Schwelle 7,46 USD, 10:51:33 UTC). Rot vor dem Fix: beide Testdateien liefen vor dem Bau rot, `test/credit-runway.test.ts` mit Exit 127 (Skript fehlte), `test/watchdog-credit.test.ts` gegen den Watchdog von heute mit `expected +0 to be 1` (kein POST mit `credit` und `LOW`); der Selftest wird rot (`CREDIT RUNWAY SELFTEST FAILED`, Zeile `FAIL low`), wenn der Mindestverbrauch aus dem Skript fällt (Fall im Test). Prüfbefehle: `bash ops/credit-runway.sh --selftest` Exit 0, letzte Zeile `CREDIT RUNWAY SELFTEST OK`; grep `^ok   (low|ok|fail) ` 10; `pnpm -s vitest run test/credit-runway.test.ts` Exit 0 (13 passed); `pnpm -s vitest run test/watchdog-credit.test.ts` Exit 0 (4 passed); grep `credit-runway.sh --container` in `ops/watchdog.sh` 1; `bash ops/credit-runway.sh` (Netz) `CREDIT RUNWAY OK: 9.37 USD, 3.7 days at 2.49 USD per day, threshold 7.46 USD`; grep `bash ops/credit-runway.sh` in der Doku 2; grep Schlüsselmuster 0 in allen drei Dateien; `node scripts/check.mjs` Exit 0 (1317 Tests, 85 s).
- 2026-11-12 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4; `dev` ohne neue Commits, nichts zu mergen. Prüfbefehle: `bash ops/credit-runway.sh --selftest` Exit 0, letzte Zeile `CREDIT RUNWAY SELFTEST OK`; grep `^ok   (low|ok|fail) ` 10; `pnpm -s vitest run test/credit-runway.test.ts` Exit 0 (13 passed); `pnpm -s vitest run test/watchdog-credit.test.ts` Exit 0 (4 passed); grep `credit-runway.sh --container` in `ops/watchdog.sh` 1; `bash ops/credit-runway.sh` (Netz, 11:03:13 UTC) `CREDIT RUNWAY OK: 9.34 USD, 3.7 days at 2.49 USD per day, threshold 7.47 USD`; grep `bash ops/credit-runway.sh` in der Doku 2; grep Schlüsselmuster 0 in allen drei Dateien; `node scripts/check.mjs` Exit 0 (105 Testdateien, 34 s); Jobs `check` und `e2e` am PR #31 grün für `adf926c`.

## Blockers
