# Betrieb Goal 02: Keine Anfrage scheitert am Neustart

## Status
ACTIVE

## Active Objective
Eine Anfrage eines zahlenden Kunden scheitert nicht mehr daran, dass der Dienst gerade neu startet: Caddy hält eine Anfrage, deren
Verbindung zum Dienst `cp:8402` während eines Rollouts scheitert, bis der Dienst wieder antwortet, höchstens 30 Sekunden
(`lb_try_duration 30s` in `deploy/Caddyfile`), statt mit 502 zu antworten. Vorher ist gezählt, wie viele 502 fremde Adressen in den
Fenstern der Rollouts seit dem 10.11.2026 bekamen (`ops/deploy-window.sh --at`), und das Werkzeug, das jeder Rollout in die
öffentlichen Logs von `deploy.yml` schreibt, nennt keine Adresse mehr. Der Merge ändert `deploy/Caddyfile`, einen Pfad des
Laufzeitpfads, rollt deshalb über `deploy.yml` aus und bringt damit auch die Guthaben-Warnung aus fehler 01 (`check_credit` in
`ops/watchdog.sh`) auf den Server (Matthias 12.11.2026 im Feedback: alles, was die zahlenden Kunden hält, hat Vorrang, und keine
Ausfälle).
Widerlegt, wenn die Fenster der Rollouts seit dem 10.11.2026 keinen 5xx an eine fremde Adresse zeigen, oder wenn nach dem Rollout
ein Fenster eines Rollouts, der `cp` neu startet, wieder 502 an eine fremde Adresse zeigt.
MVP: Funktion, weil jeder Rollout heute einem zahlenden Automaton Antworten mit 502 abbricht und Caddy sie mit einer Zeile halten
kann, bis der neue Prozess antwortet.

## Voraussetzungen
- betrieb Goal 01 DONE

## Kontext für den Maker
- Vorab gemessen am 12.11.2026 um 22:00 UTC aus den Logs von `deploy.yml` auf `dev` (nur lesend): Seit dem 10.11.2026 lief der Job
  `deploy` in 5 von 49 Läufen. Der Schritt „Deploy-Fenster“ meldete für den Container-Start 2026-11-10 18:53:58 UTC `CLEAN`, für
  2026-11-10 20:27:07 UTC 2 mal 502 auf `POST /v1/chat/completions`, für 2026-11-12 05:57:56 UTC 4 mal 503 auf
  `POST /v1/chat/completions` (das leere Guthaben beim Anbieter aus fehler 01, kein Neustart), für 2026-11-12 16:41:02 UTC 3 mal 502
  auf `GET /v1/credits/balance` und für 2026-11-12 18:15:46 UTC 1 mal 502 auf `GET /v1/credits/balance`. Zusammen 6 mal 502 in 3 von 5
  Fenstern, das Glied ist also nicht widerlegt. Befehl: `gh run list -R matthiashippe/control-plane --workflow deploy.yml --branch dev
  --created '>=2026-11-10' --json databaseId,createdAt`, je Lauf `gh run view <id> -R matthiashippe/control-plane --json jobs` (Job
  `deploy` mit `success`) und `gh run view <id> -R matthiashippe/control-plane --log` (Zeile `deploy   <Zeit> UTC, taken from the
  container start`). Diese Zeiten sind die Werte für `--at`; die Zahlen der Doku kommen aus `ops/deploy-window.sh --at`, nicht aus
  dieser Liste.
- Vorab ausprobiert am 12.11.2026 mit `caddy` v2.11.7 auf dem code-host (`~/.local/bin/caddy`): `reverse_proxy` mit
  `lb_try_duration 30s` und `lb_try_interval 250ms`, Dienst beim Eingang der Anfrage nicht erreichbar und nach 3 s gestartet, ergab für
  einen `POST` mit Body 200 nach 3,9 s und den Body unverändert beim Dienst. Caddy wiederholt bei gescheiterter Verbindung jede
  Methode; eine Anfrage, deren Verbindung stand und deren Antwort abriss, wiederholt es nur für `GET`. Dabei bleibt es: kein
  `lb_retry_match`, weil eine abgerissene Inferenz sonst ein zweites Mal beim Anbieter eingekauft würde (Grundregel 6). Für den Fall
  der laufenden Inferenz wartet `deploy/rollout.sh` schon auf ein ruhiges Fenster.
- Punkt 1, Caddyfile: im Block `reverse_proxy cp:8402` neben `transport http` genau die Zeilen `lb_try_duration 30s` und
  `lb_try_interval 250ms`, sonst nichts an der Datei; der Block `vysyon-edge:8080` bleibt unverändert. `caddy validate` scheitert auf
  dem code-host an `/var/log/caddy` (keine Rechte), deshalb prüft der Befehl eine Kopie mit Logpfad in einem `mktemp`-Ordner; der
  Rollout prüft die echte Datei mit `caddy:2-alpine` auf dem Server (`deploy/README.md`, Ausrollen einer Caddyfile-Änderung). Der Test
  `test/caddy-retry.test.ts` liest `deploy/Caddyfile` als Text, weil der GitHub-Rechner von `check` kein `caddy` hat: Im Block
  `reverse_proxy cp:8402` steht `lb_try_duration` mit einem Wert über 0 und höchstens 30 s, und kein `lb_retry_match`. Rot vor dem Fix.
- Punkt 2, Verhalten: neues Werkzeug `ops/caddy-retry.sh --selftest`, Bash, nur lokal, ohne Netz. Es nimmt den Block
  `reverse_proxy cp:8402 { … }` aus `deploy/Caddyfile`, ersetzt nur das Ziel durch `127.0.0.1:<freier Port>` und setzt ihn in eine
  Testkonfiguration mit `admin off`, `auto_https off`, `http://127.0.0.1:<freier Port>` und ohne Logdatei. Freie Ports nur über einen
  Bind auf Port 0, nie ein fester Port, nie 3100, 8081, 8180, 8190 oder 3200. Fälle, je eine Zeile `ok   <fall>` oder `FAIL <fall>: …`:
  `held` (`POST` mit JSON-Body, Dienst startet nach 3 s, Antwort 200 und der Body kommt unverändert an), `get-held` (dasselbe mit
  `GET`), `control` (derselbe Block ohne die Zeilen `lb_try_*`, Antwort 502; die Gegenprobe, dass der Test einen Ausfall sieht). Letzte
  Zeile `CADDY RETRY SELFTEST OK` mit Exit 0, sonst `CADDY RETRY SELFTEST FAIL` mit Exit 1; fehlt `caddy` im `PATH`, `COULD NOT TELL:
  caddy not found` mit Exit 2. Eigene Prozesse beendet ein `trap` über ihre PID, kein `pkill -f`. Rot vor dem Fix: `held` und
  `get-held` mit 502 auf dem Caddyfile von `dev`.
- Punkt 3, `ops/deploy-window.sh`: zwei neue Argumente. `--at <JJJJ-MM-TTTHH:MM:SS>` (UTC) setzt die Mitte des Fensters statt des
  Container-Starts, sonst gleiche Rechnung (60 s davor, 180 s danach oder das Positionsargument). `--log <datei>` liest das
  Zugriffslog aus einer Datei statt über ssh und fragt dann auch die eigenen Adressen nicht über ssh ab, sondern liest nur
  `CP_OWN_IPS_FILE`; `--log` geht nur zusammen mit `--at`, damit es ohne ssh läuft. Neue Zeile
  `BAD GATEWAY <n> of <m> request(s) from outside answered 502`, sobald eine Anfrage von außen im Fenster lag. Keine Ausgabezeile nennt
  eine Adresse: Statt `remote_ip` stehen Uhrzeit, Methode, Pfad ohne Query und Status, denn `deploy.yml` druckt die Ausgabe in die
  öffentlichen Logs eines öffentlichen Repos (Grundregel 8), und heute trägt jede Zeile unter `AFFECTED` und `NO KEY` die Adresse eines
  Besuchers. Exit-Codes, `CP_WINDOW_NOW`, `PARTIAL`, `MEASURED NOTHING`, die Regel für 402 auf `/pay/…` und für 401 bleiben. Dazu
  `--selftest` mit gepflanzten Zeilen in `mktemp`-Dateien, Adressen nur aus `192.0.2.0/24`, `198.51.100.0/24` und `203.0.113.0/24`,
  der fremde Besucher ist `198.51.100.23`: ein 502 einer fremden Adresse im Fenster (`AFFECTED`, `BAD GATEWAY 1`, Exit 1), derselbe
  außerhalb des Fensters (nicht gezählt), ein 502 einer eigenen Adresse (nicht gezählt), ein leeres Fenster (`MEASURED NOTHING`,
  Exit 0) und keine Ausgabe nennt `198.51.100.23`; je Fall `ok   <fall>`, letzte Zeile `DEPLOY WINDOW SELFTEST OK`. Dieselben Fälle
  in `test/deploy-window.test.ts` über `--log`, rot vor dem Fix, weil das Werkzeug von heute `--log` nicht kennt und ohne ssh Exit 2
  meldet.
- Punkt 4, Doku `docs/betrieb/neustart.md` (Deutsch): Abschnitt `## Vorher` mit je Rollout seit 2026-11-10 00:00 UTC, dessen Job
  `deploy` grün lief, genau einer Zeile ab Spalte 0 `- <JJJJ-MM-TT HH:MM:SS> UTC: <n> mal 502 an fremde Adressen, <m> Anfragen von
  außen`, `<n>` und `<m>` aus `bash ops/deploy-window.sh --at <Zeit>`, darunter `Summe vorher: <n> mal 502 in <k> Fenstern` (`<k>` ist die Zahl der Zeilen des Abschnitts), der
  Befehl je Fenster, die Uhrzeit der Messung in UTC und ein Satz, dass 503 aus dem Dienst (leeres Guthaben beim Anbieter) kein Neustart
  ist und mit diesem Goal nicht verschwindet. Abschnitt `## Nachher` mit einem Satz: Eine reine Änderung am Caddyfile startet `cp` nicht
  neu, nur Caddy (`deploy/README.md`, Was rollout.sh tut, Schritt 4); gemessen wird deshalb im Fenster des nächsten Rollouts, der `cp`
  neu startet, über die Zeile `BAD GATEWAY` im Schritt „Deploy-Fenster“ von `deploy.yml`. Keine Adresse, kein Name eines Kunden.
- Für den Release Manager nach dem Merge, in seiner Live-Prüfung: Lief der Job `deploy`, dann
  `ssh -i "$CP_SSH_KEY" -o BatchMode=yes "$CP_HOST" 'grep -c check_credit /opt/control-plane/repo/ops/watchdog.sh'` mindestens 1 (die
  Guthaben-Warnung aus fehler 01 liegt auf dem Server) und `ssh … 'docker exec deploy-caddy-1 grep -c lb_try_duration
  /etc/caddy/Caddyfile'` gleich 1 (Caddy liest die neue Fassung). Beides liest nur.
- Traction: Jeder Rollout kostet heute rund 16 Sekunden ohne Antwort (Grundregel 5), und seit dem 10.11.2026 rollt `dev` mehrmals am
  Tag aus. Danach wartet ein Automaton diese Sekunden, statt einen Fehler zu zählen, und die Kette darf schneller ausrollen, ohne den
  zahlenden Kunden etwas zu kosten.
- Kein Wort zu den Bedingungen des Anbieters in Code oder Doku (`check` prüft es). Code, Kommentare und Testnamen Englisch, Doku und
  Goal-Datei Deutsch, kein Gedankenstrich. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `caddy` aus `~/.local/bin`, `check` und
  vitest im Vordergrund mit eigenem Timeout.

## Done Condition
- [x] Caddy hält eine Anfrage an `cp:8402`, deren Verbindung scheitert, höchstens 30 Sekunden statt 502: `lb_try_duration 30s` und
      `lb_try_interval 250ms` im Block `reverse_proxy cp:8402` von `deploy/Caddyfile`, kein `lb_retry_match`, die Datei ist gültig.
      Prüfung: `T=$(mktemp -d); sed "s#/var/log/caddy/access.log#$T/access.log#" deploy/Caddyfile > $T/Caddyfile && PATH=$HOME/.local/bin:$PATH caddy validate --config $T/Caddyfile --adapter caddyfile 2>&1 | tail -1` muss eine Zeile ausgeben, die `Valid configuration` enthält.
      Prüfung: `PATH=$HOME/.local/bin:$PATH caddy adapt --config deploy/Caddyfile --adapter caddyfile 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const f=[];const w=o=>{if(Array.isArray(o))o.forEach(w);else if(o&&typeof o==="object"){if(o.handler==="reverse_proxy")f.push(o.upstreams.map(u=>u.dial).join(",")+" "+(o.load_balancing&&o.load_balancing.try_duration));Object.values(o).forEach(w)}};w(JSON.parse(s));console.log(f.join("\n"))})' | grep -cx "cp:8402 30000000000"` muss 1 ausgeben.
      Prüfung: `grep -c lb_retry_match deploy/Caddyfile` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/caddy-retry.test.ts` muss Exit-Code 0 haben.
- [x] Der Block aus `deploy/Caddyfile` hält im lokalen Versuch einen `POST` mit Body und ein `GET`, bis der Dienst nach 3 Sekunden
      startet, und derselbe Block ohne `lb_try_*` antwortet 502.
      Prüfung: `PATH=$HOME/.local/bin:$PATH bash ops/caddy-retry.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `CADDY RETRY SELFTEST OK` ausgeben.
      Prüfung: `PATH=$HOME/.local/bin:$PATH bash ops/caddy-retry.sh --selftest | grep -cE "^ok   (held|get-held|control)$"` muss 3 ausgeben.
- [x] `ops/deploy-window.sh` misst ein vergangenes Fenster mit `--at`, liest mit `--log` ohne ssh, zählt 502 in der Zeile
      `BAD GATEWAY` und nennt in keiner Ausgabezeile eine Adresse.
      Prüfung: `bash ops/deploy-window.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `DEPLOY WINDOW SELFTEST OK` ausgeben.
      Prüfung: `bash ops/deploy-window.sh --selftest | grep -cE "^ok   "` muss mindestens 5 ausgeben.
      Prüfung: `bash ops/deploy-window.sh --selftest | grep -c "198\.51\.100\.23"` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/deploy-window.test.ts` muss Exit-Code 0 haben.
- [x] Die 502 an fremde Adressen in den Fenstern der Rollouts seit dem 10.11.2026 sind gezählt und stehen je Fenster mit Befehl und
      Uhrzeit in `docs/betrieb/neustart.md`, ohne eine Adresse.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; bash ops/deploy-window.sh --at 2026-11-12T16:41:02` muss eine Zeile ausgeben, die mit `BAD GATEWAY ` beginnt.
      Prüfung: `awk '/^## Vorher/{f=1;next} /^## /{f=0} f' docs/betrieb/neustart.md | grep -cE "^- 20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} UTC: [0-9]+ mal 502 an fremde Adressen, [0-9]+ Anfragen von außen$"` muss mindestens 5 ausgeben.
      Prüfung: `awk '/^## Vorher/{f=1;next} /^## /{f=0} f && /^- 20.* mal 502 an fremde Adressen/{s+=$5; k++} /^Summe vorher: /{t=$3; w=$7} END{exit !(k>0 && s==t && w==k)}' docs/betrieb/neustart.md` muss Exit-Code 0 haben.
      Prüfung: `grep -c "ops/deploy-window.sh --at " docs/betrieb/neustart.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "^## Nachher" docs/betrieb/neustart.md` muss 1 ausgeben.
      Prüfung: `grep -cE "(^|[^0-9.])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9.]|$)" docs/betrieb/neustart.md` muss 0 ausgeben.
- [x] `check` ist grün, und keine Datei des Goals trägt einen Schlüssel.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `cat deploy/Caddyfile ops/caddy-retry.sh ops/deploy-window.sh docs/betrieb/neustart.md test/caddy-retry.test.ts test/deploy-window.test.ts | grep -cE "sk-or-[A-Za-z0-9-]{8,}"` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jede neue Selftest-Zeile war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Zahl in `docs/betrieb/neustart.md` mit dem Befehl, aus dem sie stammt; keine Adresse und kein Name eines Kunden.
- [ ] `deploy/Caddyfile` ändert sich nur um die zwei Zeilen `lb_try_*` im Block `reverse_proxy cp:8402`.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `src/**`,
  `harness/**`, `deploy/**` außer `deploy/Caddyfile`, `ops/watchdog.sh`, `ops/own-ips.txt`, `ops/access-log.sh`,
  `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- Crontab, `/opt/control-plane/.env` und jede Datei auf dem Server; Produktion nur lesend, kein Rollout und kein Neustart von Hand
- `lb_retry_match` und jede Wiederholung einer Anfrage, deren Verbindung zum Dienst schon stand
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-12 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: `lb_try_duration 30s` und `lb_try_interval 250ms` im Block `reverse_proxy cp:8402`, neues `ops/caddy-retry.sh --selftest`, `ops/deploy-window.sh` mit `--at`, `--log`, `--selftest`, Zeile `BAD GATEWAY` und ohne Adresse in jeder Zeile, `docs/betrieb/neustart.md` mit 7 mal 502 in 6 Fenstern (ein sechster Rollout um 22:43:42 UTC kam nach der Vorabmessung dazu). Rot vor dem Fix: `test/caddy-retry.test.ts` 2 von 5 rot auf dem Caddyfile von `dev`, `ops/caddy-retry.sh --selftest` `FAIL held` und `FAIL get-held` mit 502 auf dem Caddyfile von `dev`, `test/deploy-window.test.ts` 7 von 7 rot gegen das Werkzeug von `dev`; Gegenprobe des Selftests von `deploy-window.sh` mit zwei Mutationen (Adresse wieder in der Zeile: `FAIL affected`, `FAIL no-address`; Zeile `BAD GATEWAY` umbenannt: 5 mal FAIL), Gegenprobe der Summenprüfung mit falscher Summe Exit 1. Prüfbefehle: P1 `caddy validate` -> `Valid configuration`, `caddy adapt` -> 1, `grep -c lb_retry_match` -> 0, vitest caddy-retry 5 passed; P2 Selftest Exit 0 `CADDY RETRY SELFTEST OK`, `grep -cE` -> 3; P3 Selftest Exit 0 `DEPLOY WINDOW SELFTEST OK`, `^ok   ` -> 7, gepflanzte fremde Adresse -> 0, vitest deploy-window 7 passed; P4 (Netz) `--at 2026-11-12T16:41:02` -> `BAD GATEWAY 3 of 67 request(s) from outside answered 502`, Zeilen -> 6, Summe Exit 0, `--at ` -> 6, `## Nachher` -> 1, Adressen -> 0; P5 `node scripts/check.mjs` Exit 0 (121 Dateien, 1483 Tests), `sk-or-` -> 0.

## Blockers
- keine
