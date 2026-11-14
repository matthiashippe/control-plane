# Messung Goal 02: Jeder Rollout belegt selbst, dass der Neustart keine Anfrage verliert

## Status
PLANNED

## Active Objective
Dass Caddy eine Anfrage hält, während `cp` neu startet (betrieb 02, `lb_try_duration 30s`), belegt heute nur Fremdverkehr, der
zufällig in die Sekunden nach dem Start fällt; in den zwei Fenstern nach betrieb 02 kam dort keine einzige Anfrage von außen
(betrieb 04, `docs/betrieb/neustart.md`). Und der Schritt „Deploy-Fenster“ von `.github/workflows/deploy.yml` (Zeile 164 und 165)
ruft `ops/deploy-window.sh` rund 20 s nach dem Start des Containers auf, bekommt deshalb bei jedem Rollout nur `PARTIAL`, und ein
`BAD GATEWAY` größer 0 erreicht niemanden, weil der Schritt nur eine Warnung ins Log des Jobs schreibt.
Nach diesem Goal wartet `ops/deploy-window.sh`, so wie `deploy.yml` es heute ohne Argumente aufruft, selbst, bis 180 s seit dem
Start des Containers vergangen sind, misst dann das ganze Fenster und meldet `BAD GATEWAY` größer 0 über den Alarmweg der VM (den
Webhook, den die Crontab für `ops/watchdog.sh` setzt). Dazu belegt ein Fall im Selftest von `ops/caddy-retry.sh` mit dem echten
Block aus `deploy/Caddyfile` vor einem Dienst, der neu startet, dass eine Probe alle 250 ms auf `GET /health` nur 200 bekommt und
mindestens eine Antwort länger als 0,5 s gehalten wurde, und derselbe Fall ohne `lb_try_duration` ist rot.
Widerlegt, wenn der Neustart-Fall auch ohne `lb_try_duration` grün ist (dann misst er den Retry nicht).
MVP: Funktion, weil zahlende Automatons an jedem Rollout erst dann sicher keinen Fehler sehen, wenn der Rollout das selbst prüft und
ein Rückfall jemanden erreicht, statt auf eine Nachmessung von Hand zu warten.

## Voraussetzungen
- messung Goal 01 DONE

## Kontext für den Maker
- Ziel: Ein Rückfall von betrieb 02 (ein 502 an einen zahlenden Kunden beim Neustart) fällt beim nächsten Rollout von selbst auf und
  erreicht uns über den Alarm, ohne dass jemand nachmisst.
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 02; übernimmt `goals/_vorschlaege/betrieb-kritik-2026-11-13-2.md` und
  `goals/_vorschlaege/betrieb-kritik-2026-11-13-3.md`. `.github/**` bleibt unverändert (`gate.yaml`), also geschieht alles in den
  Werkzeugen, die `deploy.yml` heute schon aufruft.
- Annahme (Tech Lead, 14.11.2026): Der „Harness-Test“ aus der ROADMAP ist ein neuer Fall in `ops/caddy-retry.sh --selftest`, weil der
  Runner von `check` kein `caddy` hat (Kopfkommentar von `test/caddy-retry.test.ts`), `harness/**` auf der Deny List steht und dieser
  Selftest den Block aus `deploy/Caddyfile` schon heute mit einem echten Caddy fährt (betrieb 02). Auf dem code-host liegt `caddy`
  unter `~/.local/bin`.
- **Warten (Punkt 1).** Kommt das Fenster aus dem Start des Containers (kein `--at`), rechnet `ops/deploy-window.sh` nach dem Lesen
  von `StartedAt` und vor dem Lesen des Zugriffslogs aus, wie viele Sekunden bis zum Ende des Fensters (Start plus `TAIL_SECONDS`)
  fehlen, und wartet sie ab, plus höchstens 5 s Rand. Mit `--at` oder `--log` wartet es nie. Die Uhr vor dem Warten ist
  `CP_WINDOW_NOW` wie heute (sonst die Systemzeit); `CP_WINDOW_SLEEP` nennt einen Befehl, der statt `sleep` mit der Zahl der
  Sekunden als einzigem Argument läuft. Nach dem Warten gilt als Uhr die Uhr von vorher plus die gewartete Zeit, also meldet das
  Werkzeug dann kein `PARTIAL`. Den Kopfkommentar und die Usage-Zeilen passt der Maker an.
- **Alarm (Punkt 2).** Steht am Ende `BAD GATEWAY <n>` mit `<n>` größer 0 und kam das Fenster aus dem Start des Containers, schickt
  `ops/deploy-window.sh` die neue Datei `ops/deploy-alarm.sh` per `ssh … "$HOST" "bash -s <n> <HH:MM:SS>" < ops/deploy-alarm.sh` an
  die VM (dasselbe Muster wie `ops/webhook-last.sh` in `ops/status.sh`); `<HH:MM:SS>` ist der Start des Containers in UTC. Auf der VM
  liest `ops/deploy-alarm.sh` die URL aus der Zeile von `crontab -l`, die `CP_ALERT_WEBHOOK=` setzt (für Tests aus der Datei in
  `CP_CRONTAB_FILE` statt `crontab -l`), und sendet genau eine Zeile Text ohne Adresse, etwa
  `deploy window: <n> request(s) from outside answered 502 after the rollout at <HH:MM:SS> UTC`, mit
  `curl -fsS -m 10 -d "<text>" "$url"`. Findet es keine URL, endet es mit Exit 2 und der stderr-Zeile `no webhook in the crontab`;
  scheitert der POST, mit Exit 1. Die URL steht nie in einer Ausgabe, weil `deploy.yml` die Ausgabe in die öffentlichen Logs eines
  öffentlichen Repos schreibt (`ops/README.md`, Abschnitt Watchdog). `ops/deploy-window.sh` schreibt danach `ALARM SENT` oder
  `ALARM NOT SENT: exit <k>` und behält seinen Exit 1. Mit `--at` oder `--log`, bei `BAD GATEWAY 0`, bei `MEASURED NOTHING` und bei
  Fehlern ohne 502 geht kein Alarm raus. `deploy.yml` ruft das Werkzeug weiter mit `|| echo "::warning::…"` auf; der Job bleibt also
  grün, der Alarm ist die Meldung.
- Test `test/deploy-window-rollout.test.ts`, ohne Netz, ohne festen Port, nur Dokumentationsadressen, Muster wie
  `test/claim-keyless-own-ips.test.ts`: je Fall ein `mktemp`-Ordner `<tmp>` mit Kopien von `ops/deploy-window.sh`, `ops/own-ips.sh`,
  `ops/access-log.sh` und `ops/deploy-alarm.sh` an denselben relativen Pfaden und `<tmp>/ops/own-ips.txt` mit genau
  `192.0.2.10 2026-11-01  planted own address`; Aufruf `bash <tmp>/ops/deploy-window.sh` ohne Argumente, `HOME` auf `<tmp>`,
  `CP_OWN_IPS_SEEN` auf `<tmp>/seen.txt`, `CP_WINDOW_NOW=2026-11-01T12:00:20`, `CP_WINDOW_SLEEP` auf ein nachgebautes `sleep`, das
  sein Argument an `<tmp>/slept` anhängt und sofort endet, `PATH` mit einem nachgebauten `ssh` vorn. Das `ssh` antwortet nach dem
  letzten Argument: mit `SSH_CLIENT` darin `192.0.2.10 40000 22`; mit `docker inspect` darin `2026-11-01T12:00:00.123456789Z`; mit
  `deploy-caddy-1` darin das gepflanzte Zugriffslog in der Form, die `ops/access-log.sh` liest; mit `bash -s` darin legt es seine
  Argumente und seinen stdin unter `<tmp>/alarm-args` und `<tmp>/alarm-stdin` ab und endet mit 0; sonst Exit 255. Fälle:
  - `it("waits for the end of the window before it reads the log")`: Log mit einer Zeile `198.51.100.23 GET /v1/models 200` bei
    12:00:05; `<tmp>/slept` hat genau eine Zahl zwischen 160 und 165, keine Zeile beginnt mit `PARTIAL`, eine Zeile ist
    `window   11:59:00 to 12:03:00 UTC, 60 s before and 180 s after`, eine beginnt mit `CLEAN`, Exit 0, kein `<tmp>/alarm-args`;
  - `it("does not wait when the window is already over")`: `CP_WINDOW_NOW=2026-11-01T12:05:00`, `<tmp>/slept` fehlt, kein `PARTIAL`;
  - `it("sends the alarm when a stranger got a 502")`: Log mit `198.51.100.23 POST /v1/chat/completions 502` bei 12:00:03; Exit 1,
    Zeile `BAD GATEWAY 1 of 1 request(s) from outside answered 502`, Zeile `ALARM SENT`, `<tmp>/alarm-args` enthält `bash -s 1 12:00:00`,
    `<tmp>/alarm-stdin` ist byte-gleich mit `ops/deploy-alarm.sh`, und keine Ausgabezeile nennt `198.51.100.23`;
  - `it("sends no alarm without a 502")`: Log mit `198.51.100.23 GET /v1/models 503` bei 12:00:03; Exit 1, kein `<tmp>/alarm-args`;
  - `it("never waits and never alarms for a past window")`: Aufruf mit `--at 2026-11-01T12:00:00` und dem Log aus dem Alarm-Fall;
    `<tmp>/slept` und `<tmp>/alarm-args` fehlen.
  Rot vor dem Fix sind der erste, der dritte und der fünfte Fall (heute `PARTIAL`, kein Warten, kein Alarm); die Zeile im Progress
  Log nennt das mit Zahl.
- Test `test/deploy-alarm.test.ts`, ohne Netz: `ops/deploy-alarm.sh` mit `CP_CRONTAB_FILE` auf eine gepflanzte Crontab und einem
  nachgebauten `curl` vorn im `PATH`, das seine Argumente in eine Datei schreibt und mit 0 endet (im Fall „POST scheitert“ mit 22).
  Fälle: Crontab mit `*/5 * * * * CP_ALERT_WEBHOOK=https://alarm.invalid/planted-topic /opt/control-plane/repo/ops/watchdog.sh >> /var/log/cp-watchdog.log 2>&1`
  und Argumenten `2 12:00:00`: `curl` genau einmal, mit `https://alarm.invalid/planted-topic` und einem Text, der `2` und `502` und
  `12:00:00` nennt, Exit 0; Crontab ohne `CP_ALERT_WEBHOOK`: Exit 2, `curl` nicht gerufen, stderr `no webhook in the crontab`;
  POST scheitert: Exit 1; in keinem Fall nennen stdout oder stderr `planted-topic`.
- **Neustart-Fall (Punkt 3).** Zwei neue Fälle in `ops/caddy-retry.sh --selftest`, gefahren mit demselben Block aus `CP_CADDYFILE`
  (Standard `deploy/Caddyfile`) wie die Fälle `held`, `get-held` und `control`: `restart` startet den nachgebauten Dienst, schickt
  durch Caddy alle 250 ms ein `GET /health`, stoppt den Dienst nach der vierten Antwort per PID, startet ihn 2 s später auf demselben
  Port neu und probt weiter, bis mindestens vier Antworten nach dem Neustart kamen; `ok   restart` nur, wenn jede Antwort 200 war
  und mindestens eine länger als 0,5 s dauerte, sonst `FAIL restart: <Zahl der Antworten>, <Zahl ungleich 200>, längste <s> s`.
  `restart-control` fährt dasselbe mit dem Block ohne die Zeilen `lb_try_*` und ist `ok`, wenn mindestens eine Antwort 502 war. Jeder
  `curl` mit `--noproxy '*'` (Test in `test/caddy-retry.test.ts`), Ports nur aus einem Bind auf Port 0, eigene Prozesse nur per PID
  beendet. Kopfkommentar mit den neuen Fällen.
- Kein Test und kein Prüfbefehl ruft die VM, `ops/deploy-window.sh` ohne nachgebautes `ssh` oder einen echten Webhook auf. Produktion
  bleibt unberührt: kein Lauf gegen den Server, kein Rollout, kein Neustart von Hand.
- Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout; neue Dateien vor `check` mit `git add` stagen. Kein `pkill -f`.

## Done Condition
- [ ] `ops/deploy-window.sh` ohne `--at` wartet selbst bis zum Ende des Fensters, 180 s nach dem Start des Containers, und misst
      dann das ganze Fenster statt `PARTIAL`; mit `--at` oder `--log` wartet es nie.
      Prüfung: `pnpm -s vitest run test/deploy-window-rollout.test.ts -t "wait"` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "waits for the end of the window before it reads the log|does not wait when the window is already over|never waits and never alarms for a past window" test/deploy-window-rollout.test.ts` muss mindestens 3 ausgeben.
      Prüfung: `grep -c "CP_WINDOW_SLEEP" ops/deploy-window.sh` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/deploy-window.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `DEPLOY WINDOW SELFTEST OK` ausgeben.
      Prüfung: `pnpm -s vitest run test/deploy-window.test.ts` muss Exit-Code 0 haben.
- [ ] `BAD GATEWAY` größer 0 nach einem Rollout geht über den Webhook aus der Crontab der VM raus, ohne Adresse und ohne die URL in
      einer Ausgabe; ohne 502 und bei einem vergangenen Fenster geht kein Alarm raus.
      Prüfung: `pnpm -s vitest run test/deploy-window-rollout.test.ts test/deploy-alarm.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "sends the alarm when a stranger got a 502|sends no alarm without a 502" test/deploy-window-rollout.test.ts` muss 2 ausgeben.
      Prüfung: `grep -c "planted-topic" test/deploy-alarm.test.ts` muss mindestens 2 ausgeben.
      Prüfung: `grep -cE "deploy-alarm\.sh" ops/deploy-window.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "https?://[A-Za-z0-9.-]*ntfy" ops/deploy-alarm.sh ops/deploy-window.sh | awk -F: '{s+=$2} END{print s}'` muss 0 ausgeben.
- [ ] Der Block `reverse_proxy cp:8402` aus `deploy/Caddyfile` hält im lokalen Versuch jede Probe alle 250 ms auf `GET /health` über
      einen Neustart des Dienstes mit 200, mindestens eine länger als 0,5 s, und derselbe Versuch ohne `lb_try_duration` ist rot.
      Prüfung: `PATH=$HOME/.local/bin:$PATH bash ops/caddy-retry.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `CADDY RETRY SELFTEST OK` ausgeben.
      Prüfung: `PATH=$HOME/.local/bin:$PATH bash ops/caddy-retry.sh --selftest | grep -cE "^ok   (held|get-held|control|restart|restart-control)$"` muss 5 ausgeben.
      Prüfung: `T=$(mktemp -d); grep -v "lb_try_duration" deploy/Caddyfile > $T/Caddyfile; CP_CADDYFILE=$T/Caddyfile PATH=$HOME/.local/bin:$PATH bash ops/caddy-retry.sh --selftest | grep -c "^FAIL restart:"` muss 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/caddy-retry.test.ts` muss Exit-Code 0 haben.
- [ ] `check` ist grün, `.github/**` und `deploy/**` bleiben unverändert, und `check` lässt die Liste der eigenen Adressen unberührt.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE "^(\.github|deploy)/"` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jeder neue Selftest-Fall war vor dem Fix rot; die Zeile im Progress Log nennt, welche Fälle und womit.
- [ ] Keine Ausgabe von `ops/deploy-window.sh` oder `ops/deploy-alarm.sh` nennt eine Adresse oder die URL des Webhooks.
- [ ] `deploy/Caddyfile`, `.github/workflows/deploy.yml` und `ops/watchdog.sh` ändern sich im Goal-PR nicht.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/own-ips.txt`, `ops/own-ips.sh`, `ops/access-log.sh`, `ops/watchdog.sh`, `ops/conway-series.sh`,
  `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- jede andere Datei unter `ops/` außer `ops/deploy-window.sh`, `ops/caddy-retry.sh` und der neuen `ops/deploy-alarm.sh`
- die URL des Webhooks in jeder Datei, jedem Commit, Kommentar und Log
- Crontab, `/opt/control-plane/.env` und jede Datei auf dem Server; Produktion weder lesend noch schreibend, kein Rollout und kein
  Neustart von Hand
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
- keine
