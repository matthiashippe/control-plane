# Hosting Goal 05: Ein Ausfall des Sandbox-Servers meldet sich, bevor ein Kunde ihn trifft

## Status
PLANNED

## Active Objective
Der Wächter `ops/watchdog.sh` auf dem Zahlungsserver fragt in jedem Lauf den Sandbox-Server über denselben Weg wie `src/sandbox/`
(`CP_SANDBOXD_URL`, Standard `https://ctl.sbx.postyourprice.com`), ob `sandboxd` antwortet und ob das Basis-Image da und gepinnt ist,
zwei Versuche mit Pause wie `check_health`, und meldet nur den Wechsel über den bestehenden Alarmweg: `[WARN]` beim Ausfall oder bei
fehlendem oder ungepinntem Image, `[OK]` bei der Rückkehr. Dafür antwortet `sandboxd` auf die neue Route `GET /healthz/image` ohne
Signatur mit 200 `image ok` oder 503 `image missing` oder `image unpinned`, nach derselben Regel wie `pin_fact` in
`ops/sandbox/setup.sh`. Ein Test mit nachgebautem `sandboxd` deckt Ausfall, fehlendes Image, ungepinntes Image und Rückkehr ab, rot
gegen den Wächter von `dev`. `sandboxd.mjs` rollt der Maker vor dem Merge mit `setup.sh` auf den Sandbox-Server aus, der Wächter kommt
mit dem nächsten fälligen Deploy (`ROADMAP.md`, hosting 05; Quelle: Abschlusskriterium, kein Vorschlag).
MVP: Funktion, weil heute erst der erste fremde Automaton, der eine Sandbox anlegen will, einen Ausfall von `sandboxd` oder ein
weggeräumtes Basis-Image bemerkt, und zwar als 501.

## Voraussetzungen
- hosting Goal 04 DONE

## Kontext für den Maker
- Ziel in einem Satz: Der erste fremde Automaton, der bei uns eine Sandbox anlegt (Abschlusskriterium), trifft auf einen laufenden
  Sandbox-Server statt auf 501, weil wir einen Ausfall vorher hören. Was dem nicht dient, gehört nicht in dieses Goal.
- Stand heute (`dev` am 21.11.2026, `d3a8bd5`): `ops/watchdog.sh` prüft `/health` des Zahlungsdienstes, das Guthaben beim
  Inferenz-Anbieter, das Zertifikat und den liegengebliebenen Deploy-Alarm; das Wort `sandbox` kommt darin nicht vor. `sandboxd`
  (`ops/sandbox/sandboxd.mjs`, `handleApi`) beantwortet nur `GET /healthz` ohne Signatur, mit 200 `ok`, und sagt nichts über das Image.
  `ctl.sbx.postyourprice.com` lässt laut `ops/sandbox/sandbox.caddy` nur den Zahlungsserver durch, alle anderen bekommen 403; der
  Wächter läuft dort per Cron außerhalb des Containers und erreicht `sandboxd` also ohne Schlüssel. Die Watch List in `STATE.md` sagt:
  Fällt `fact image_pin` von `setup.sh --check` auf `no`, räumt der Prune-Cron des Mitbewohners das Image weg, und nach 24 Stunden
  scheitert jede Anlage einer Sandbox mit 501.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 05` in `goals/hosting/ANNAHMEN.md`):
  1. **`/healthz` bleibt Byte für Byte.** Antwort 200 `ok` wie heute, weil `test/sandboxd.test.ts` und die Healthchecks in
     `harness/docker-compose.yml` sie lesen. Neu ist `GET /healthz/image`, ebenfalls ohne Signatur: Sie verrät kein Geheimnis, und
     nur der Zahlungsserver kommt durch Caddy. `docs/sandbox/plan.md` nennt beide Routen dort, wo es heute „außer `GET /healthz`“ sagt.
  2. **Die Regel des Pins steht einmal als reine Funktion.** `sandboxd.mjs` exportiert
     `imageHealth({ imageId, pin })` mit `imageId` (ID des Basis-Images oder `null`) und `pin` (`{ image, status, label }` des
     Containers `sandboxd-base-pin` oder `null`), Rückgabe `"ok"`, `"missing"` oder `"unpinned"`: `missing` ohne Image, `ok` nur,
     wenn der Pin ein nie gestarteter Container (`status` gleich `"created"`) genau dieser Image-ID ohne Label `sandboxd=1` ist, sonst
     `unpinned`, wie `pin_fact` in `ops/sandbox/setup.sh`. Die Zeichenkette `"created"` steht genau einmal in `sandboxd.mjs`, in dieser
     Prüfung, damit die Gegenprobe in Punkt 2 sie trifft. Die Route fragt Docker mit `run` (`docker image inspect` und
     `docker container inspect` wie `pin_fact`); scheitert eine Abfrage, gilt der Teil als fehlend. Der Name des Pins kommt aus
     `SANDBOXD_PIN` mit Vorgabe `sandboxd-base-pin`; der Test prüft, dass die Vorgabe gleich `PIN=` in `setup.sh` ist.
     `sandboxd.service` ändert sich nicht.
  3. **Der Wächter entscheidet am Statuscode, nicht am Text.** Neue Funktion `check_sandboxd` in `ops/watchdog.sh`, aufgerufen nach
     `send_kept_deploy_alarm` und vor `check_health`, damit sie auch bei einem Ausfall des Zahlungsdienstes läuft. Zuerst
     `<CP_SANDBOXD_URL>/healthz`, bei 200 dann `<CP_SANDBOXD_URL>/healthz/image`, je mit `curl -m 20` und bei einer Antwort ungleich
     200 einem zweiten Versuch nach `CP_SANDBOXD_PAUSE` Sekunden (Vorgabe 20, Tests setzen 0). Zustand in `<state file>.sandboxd`:
     `ok`, `down` (`/healthz` nicht 200, oder `/healthz/image` weder 200 noch 503) oder `image` (503). Den Text der Antwort liest der
     Wächter nur für die Meldung (`image unpinned` heißt ungepinnt, alles andere fehlend). So bleiben die bestehenden Tests des
     Wächters, deren `curl` für jede URL mit `/health` nur `200` druckt, unverändert grün.
  4. **Nur der Wechsel wird gemeldet, gespeichert erst nach dem POST**, wie `check_credit` nach fehler 03: von `ok` oder `unknown`
     nach `down` `report "WARN" "sandboxd unreachable (HTTP <code>, twice in a row), every new sandbox fails with 501"`; nach `image`
     `report "WARN" "sandboxd base image missing, every new sandbox fails with 501"` oder
     `report "WARN" "sandboxd base image not pinned, the prune cron removes it within 24 h, run ops/sandbox/setup.sh"`; von `down`
     nach `image` oder umgekehrt ebenso die Meldung des neuen Zustands; von `down` oder `image` nach `ok`
     `report "OK" "sandboxd back, base image pinned"`. Von `unknown` nach `ok` keine Meldung. Scheitert der POST, bleibt der alte
     Zustand, und der nächste Lauf meldet erneut. Nur die Titel `WARN` und `OK`, weil `ops/status.sh` die Meldungen des Wächters an
     ihren Titeln erkennt. Jeder Lauf schreibt genau eine Zeile ins Log: `<TS> [INFO] sandboxd: ok` im Zustand `ok`, sonst
     `<TS> [INFO] sandboxd: still <down|image>` oder die Zeile von `report`.
  5. **Tests.** `test/sandboxd-image.test.ts` nach dem Muster von `test/sandboxd.test.ts` (`createSandboxd` mit nachgebautem `run`,
     Server auf `listen(0)`): `/healthz` unverändert `ok`; `/healthz/image` ohne Signatur 200 `image ok` bei passendem Pin, 503
     `image missing` ohne Image, 503 `image unpinned` ohne Pin, mit Pin einer älteren Image-ID, mit gestartetem Pin und mit Label
     `sandboxd=1`; Vorgabe von `SANDBOXD_PIN` gleich `PIN=` in `setup.sh`. `test/watchdog-sandboxd.test.ts` nach dem Muster von
     `test/watchdog-credit.test.ts` (`curl`, `docker`, `openssl` als Attrappen im `PATH`, der Webhook schreibt jeden POST in ein Log):
     erster Lauf `ok` ohne POST mit der Zeile `sandboxd: ok`; Ausfall genau ein `[WARN]` mit `sandboxd unreachable`, der nächste Lauf
     ohne POST; ein Versuch scheitert, der zweite gelingt, kein POST; Image fehlt und ungepinnt je eine eigene Meldung; Rückkehr genau
     ein `[OK]`; scheitert der POST beim Ausfall, meldet der nächste Lauf erneut; die Vorgabe von `CP_SANDBOXD_URL` im Wächter ist
     gleich `SANDBOXD_URL_DEFAULT` aus `src/sandbox/client.ts`. Bestehende Tests unter `test/` ändern sich nicht.
- Reihenfolge am Sandbox-Server `72.62.51.224`, nur über die Werkzeuge in `ops/sandbox/` vom code-host, nie von Hand, wie sandbox 12:
  1. `origin/dev` in den Goal-Branch mergen, damit `setup.sh` keinen älteren Stand einer anderen Datei ausrollt.
  2. `bash ops/sandbox/setup.sh --foreign-sandboxes 72.62.51.224` (liest auf dem Zahlungsserver nur) und
     `bash ops/sandbox/setup.sh --check 72.62.51.224`: Die einzige Zeile `CHANGE` darf `sandboxd.mjs` betreffen; steht eine andere
     da, nicht ausrollen, sondern den Grund klären.
  3. `bash ops/sandbox/setup.sh 72.62.51.224` rollt `sandboxd.mjs` aus und startet `sandboxd` neu (laufende Sandboxes laufen als
     Container weiter). Danach meldet `--check` die Zeile `SETUP CHECK OK changed=0`.
  4. Nachher auf dem Sandbox-Server über den Schlüssel von `setup.sh`:
     `ssh -i ~/.ssh/id_ed25519_cp_sandbox -o BatchMode=yes root@72.62.51.224 curl -s -m 10 http://127.0.0.1:8730/healthz/image`
     muss `image ok` ausgeben.
  Beide Ergebnisse stehen mit Uhrzeit unter `## Goal 05` in `goals/hosting/ANNAHMEN.md` (Zeilen in Punkt 4), dazu nur die Zahl der
  fremden laufenden Sandboxes vor dem Neustart. Die Done-Punkte prüfen diese Zeilen ohne Netz, damit kein Audit den Sandbox-Server
  anfragt. Endet das Goal ohne PASS (`BLOCKED`), rollt der Maker im selben Lauf mit `setup.sh` aus einem Worktree von `origin/dev`
  den alten Stand zurück, bis `--check` keine Zeile `CHANGE` meldet, und schreibt das ins Progress Log.
- Der Wächter rollt nicht vor dem Merge aus: `ops/` kommt mit dem nächsten fälligen Deploy auf den Zahlungsserver (`LOOP.md`,
  Release). Weil `sandboxd` dann schon `/healthz/image` kennt, meldet der Wächter dort nach dem Rollout `sandboxd: ok`. Diese Zeile
  liest der Release Manager im Release-Auftrag aus `/var/log/cp-watchdog.log` mit; sie ist kein Done-Punkt, weil sie erst nach dem
  Merge entsteht.
- `ops/README.md` bekommt im Abschnitt `## Watchdog on the VM` einen Absatz zur neuen Prüfung: was sie fragt, welche Meldung was
  heißt, was bei `image` zu tun ist (`bash ops/sandbox/setup.sh 72.62.51.224` vom code-host stellt Image und Pin wieder her).
- Zugang für den Rollout: `set -a; . ~/.config/control-plane/loop.env; set +a`, Werte nie ausgeben. Prüfbefehle ohne Netz binden
  keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Progress Log und Verdicts zitieren keine Suchausdrücke der Prüfbefehle wörtlich.
- Ablauf: zuerst `imageHealth`, Route und Test (Punkt 1), dann der Wächter mit Test (Punkt 2) und die Gegenproben (Punkt 3), dann
  Doku (Punkt 5) und Umfang (Punkt 6), `check` lokal und die Jobs am PR (Punkt 7), zuletzt Rollout auf den Sandbox-Server und
  Annahmen (Punkt 4). Nach jedem grünen Punkt Commit und Push.
- Widerlegt, wenn `ops/watchdog.sh` am Kopf von `dev` den Sandbox-Server schon fragt; dann endet das Goal mit dieser Messung in den
  Annahmen.
- Was danach schneller zu mehr zahlenden Automatons führt: hosting 06, damit ein grüner Harness heißt, dass die unveränderte Runtime
  eines Kunden bei uns läuft.

## Done Condition
- [x] `sandboxd` beantwortet `GET /healthz/image` ohne Signatur nach der Regel von `pin_fact`, und `/healthz` bleibt `ok`.
      MVP: Funktion, weil der Wächter ohne diese Antwort ein weggeräumtes Basis-Image erst sieht, wenn eine Anlage mit 501 scheitert.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandboxd-image.test.ts test/sandboxd.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "export function imageHealth(" ops/sandbox/sandboxd.mjs` muss 1 ausgeben.
      Prüfung: `grep -c '"/healthz/image"' ops/sandbox/sandboxd.mjs` muss mindestens 1 ausgeben.
      Prüfung: `grep -c '"created"' ops/sandbox/sandboxd.mjs` muss 1 ausgeben.
      Prüfung: `for w in imageHealth "image ok" "image missing" "image unpinned" sandboxd-base-pin setup.sh 'listen(0'; do grep -qF -- "$w" test/sandboxd-image.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -cE 'listen\([1-9]|port: *[1-9]' test/sandboxd-image.test.ts` muss 0 ausgeben.
- [x] Der Wächter fragt in jedem Lauf `sandboxd` und sein Image und meldet nur den Wechsel über den bestehenden Alarmweg.
      MVP: Funktion, weil ein Alarm bei jedem Lauf abgeschaltet wird und einer, der nach gescheitertem POST verloren geht, nie ankommt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-sandboxd.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c '^check_sandboxd$' ops/watchdog.sh` muss 1 ausgeben.
      Prüfung: `for w in "sandboxd unreachable" "base image missing" "base image not pinned" "sandboxd back" "sandboxd: ok" CP_SANDBOXD_URL CP_SANDBOXD_PAUSE /healthz/image; do grep -qF -- "$w" ops/watchdog.sh || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `for w in "sandboxd unreachable" "base image missing" "base image not pinned" "sandboxd back" "sandboxd: ok" SANDBOXD_URL_DEFAULT CP_SANDBOXD_PAUSE; do grep -qF -- "$w" test/watchdog-sandboxd.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-credit.test.ts test/watchdog-credit-kritik.test.ts test/watchdog-alive.test.ts test/watchdog-alive-slots.test.ts test/watchdog-webhook-fail.test.ts test/watchdog-webhook-fail-daily.test.ts` muss Exit-Code 0 haben.
- [x] Beide neuen Tests sind rot gegen den Stand vor dem Fix: der Test des Wächters gegen `ops/watchdog.sh` der Merge-Basis, der Test
      von `sandboxd` gegen eine Kopie, in der ein gestarteter Pin als nie gestartet gilt.
      MVP: Funktion, weil ein Test, der ohne die Prüfung grün bleibt, den Alarm nicht schützt, den dieses Goal einführt.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; git show $(git merge-base origin/dev HEAD):ops/watchdog.sh > $T/ops/watchdog.sh; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-sandboxd.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 3 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/"created"/"exited"/' $T/ops/sandbox/sandboxd.mjs; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/sandboxd-image.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 1 ausgeben.
- [x] `sandboxd` läuft auf dem Sandbox-Server mit diesem Stand und meldet `image ok`; Messung und Entscheidungen stehen mit Grund
      unter `## Goal 05` in `goals/hosting/ANNAHMEN.md`, mit den zwei Zeilen ab Spalte 0
      `Nachher: SETUP CHECK OK changed=0, <JJJJ-MM-TT HH:MM> UTC` und `Nachher: image ok, <JJJJ-MM-TT HH:MM> UTC`.
      MVP: Funktion, weil der Wächter nach dem Deploy sonst eine Route fragt, die der Sandbox-Server nicht kennt, und Fehlalarm gibt.
      Prüfung: `awk '/^## Goal 05/{f=1;next} /^## /{f=0} f' goals/hosting/ANNAHMEN.md | grep -cE '^Nachher: (SETUP CHECK OK changed=0|image ok), 20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC$'` muss 2 ausgeben.
      Prüfung: `for w in /healthz/image imageHealth pin_fact created CP_SANDBOXD_PAUSE foreign-sandboxes Statuscode; do awk '/^## Goal 05/{f=1;next} /^## /{f=0} f' goals/hosting/ANNAHMEN.md | grep -qF -- "$w" || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Goal 05/{f=1;next} /^## /{f=0} f' goals/hosting/ANNAHMEN.md | grep -cE 'sbx-[a-z0-9]{10}|0x[0-9a-fA-F]{40}'` muss 0 ausgeben.
- [x] `ops/README.md` und `docs/sandbox/plan.md` nennen die neue Prüfung und die neue Route.
      MVP: Funktion, weil wer nachts die Meldung bekommt, ohne Suche wissen muss, was er tun kann.
      Prüfung: `for w in check_sandboxd /healthz/image "base image not pinned" "ops/sandbox/setup.sh"; do awk '/^## Watchdog on the VM/{f=1;next} /^## /{f=0} f' ops/README.md | grep -qF -- "$w" || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -c '/healthz/image' docs/sandbox/plan.md` muss mindestens 1 ausgeben.
- [x] Das Goal ändert nur seine eigenen Dateien, weder `src/`, die übrigen Dateien in `ops/sandbox/` noch bestehende Tests, bringt
      keinen Schlüssel ins Repo, und seine Texte sind ohne Gedankenstrich.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8) und jede weitere Datei auf dem Laufzeitpfad einen Rollout ohne Nutzen
      für den Kunden auslöst (Grundregel 5).
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(ops/watchdog\.sh|ops/sandbox/sandboxd\.mjs|ops/README\.md|docs/sandbox/plan\.md|test/watchdog-sandboxd\.test\.ts|test/sandboxd-image\.test\.ts|goals/hosting/.+)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only --diff-filter=MD $(git merge-base origin/dev HEAD) HEAD -- test/ | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}|ntfy\.sh/[A-Za-z0-9_-]+)'` muss 0 ausgeben.
      Prüfung: `cat ops/watchdog.sh ops/sandbox/sandboxd.mjs ops/README.md test/watchdog-sandboxd.test.ts test/sandboxd-image.test.ts goals/hosting/ANNAHMEN.md | grep -c $'\xe2\x80\x93\|\xe2\x80\x94'` muss 0 ausgeben.
- [x] `check` ist lokal grün, und die Jobs `check` und `e2e` des Goal-PR sind auf dem GitHub-Rechner grün.
      MVP: Funktion, weil `sandboxd` im Harness des Jobs `e2e` läuft und erst dieser Gang zeigt, dass die neue Route ihn nicht bricht.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/hosting-05 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="check") | .state'` muss `SUCCESS` ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/hosting-05 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Gegenproben waren rot, wie sie sollen; die Zeile im Progress Log nennt, womit.
- [ ] `GET /healthz` von `sandboxd` antwortet Byte für Byte wie am Kopf von `dev`.
- [ ] Code, Kommentare, Testnamen und Meldungen des Wächters Englisch, Goal-Datei und Annahmen Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/**`, `ops/sandbox/setup.sh`, `ops/sandbox/probe.sh`, `ops/sandbox/sandbox.caddy`, `ops/sandbox/sandboxd.service`,
  `ops/sandbox/image/**`, `ops/status.sh`, `ops/credit-runway.sh`, `ops/deploy-alarm.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- der Zahlungsserver `76.13.144.207`: kein Rollout, kein Neustart, keine Änderung am Cron; nur `setup.sh --foreign-sandboxes` liest dort
- der Sandbox-Server `72.62.51.224`: nur über `ops/sandbox/setup.sh` (`--foreign-sandboxes`, `--check`, Lauf ohne Option) und den
  einen lesenden `curl` auf `127.0.0.1:8730/healthz/image`; keine fremde Sandbox anfassen, kein `docker image prune`, kein Löschen des
  Pins zum Testen
- die URL des Webhooks steht in keiner Datei des Repos (`ops/README.md`, Alarmweg)
- Kauf, Aufladung, Wallet-Bewegung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-21 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7 gebaut: sandboxd beantwortet die neue Bildroute nach der Regel von pin_fact, der Wächter fragt sandboxd nach dem Health-Urteil und meldet nur den Wechsel (Abweichung von der Reihenfolge des Kontexts mit Grund in ANNAHMEN.md), Doku in ops/README.md und docs/sandbox/plan.md, Rollout mit setup.sh auf den Sandbox-Server vor dem Merge. Prüfbefehle: Punkt 1 vitest 52 grün, Zähler 1, 1, 1, nichts fehlt, 0; Punkt 2 vitest 13 grün, Zähler 1, nichts fehlt, nichts fehlt, sechs bestehende Wächter-Tests 25 grün; Punkt 3 Gegenprobe Wächter der Merge-Basis 13 rot, Gegenprobe Pin gestartet statt nie gestartet 3 rot, dazu sandboxd.mjs der Merge-Basis 9 von 11 rot; Punkt 4 zwei Nachher-Zeilen, nichts fehlt, 0; Punkt 5 nichts fehlt, 1; Punkt 6 0, 0, 0, 0, 0; Punkt 7 check lokal grün (242 Dateien, 2534 Tests, 261 s), Jobs check und e2e am PR siehe Kommentar.

## Blockers
Keine.
