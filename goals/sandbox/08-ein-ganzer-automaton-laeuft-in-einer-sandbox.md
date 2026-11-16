# Sandbox Goal 08: Ein ganzer Automaton läuft in einer Sandbox

## Status
ACTIVE

## Active Objective
Ein Konto, auch ein schlüsselloses aus `src/auth/keyless.ts`, startet mit einem Aufruf `POST /v1/automatons` (Name und
Genesis-Prompt) einen Automaton, der ganz bei uns läuft: Das Control Plane legt eine Sandbox an, in der die unveränderte Runtime am Pin
`d8f8168` schon im Image liegt, schreibt Genesis-Prompt und Config (`conwayApiUrl` und `socialRelayUrl` auf uns, relay 01 ist DONE)
mit einem eigenen API-Schlüssel des Kontos hinein und startet die Runtime als Dienst, der nach einem Absturz und nach einem Neustart
des Sandbox-Servers von selbst weiterläuft. Abgerechnet wird in Credits wie jede Sandbox, dazu die Inferenz der Runtime auf demselben
Konto; bei leerem Guthaben hält die Sandbox an. Die Wallet, die die Runtime in der Sandbox erzeugt, hält nie Geld: Einnahmen gehen mit
`payTo` an das Konto des Kunden (konto 03), und niemand liest ihren Schlüssel. Belegt im Harness (die Runtime denkt in der
nachgebildeten Sandbox fünf Turns, übersteht Absturz und Neustart, das Ledger stimmt) und vor dem Merge einmal in der Produktion mit
einem eigenen Automaton (Konto aus `src/bounties/ours.ts`) samt Neustart des Sandbox-Servers, ohne Wallet-Bewegung (`ROADMAP.md`,
sandbox 08; übernimmt keinen Vorschlag).
MVP: Funktion, weil ein Mensch ohne Wallet (konto) meist auch keinen Server hat: Ohne diesen Weg kann er keinen Automaton betreiben,
konto 04 (die Terminal-Tools) hat keine Route, die es aufrufen kann, und das Abschlusskriterium in `ROADMAP.md` (ein fremder Automaton
betreibt seinen Dienst bei uns, bezahlt aus Credits) bleibt für alle ohne eigenen Server unerreichbar.

## Voraussetzungen
- sandbox Goal 07 DONE
- relay Goal 01 DONE
- konto Goal 03 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Kunde ohne eigenen Server ruft einmal `POST /v1/automatons` auf, und eine Minute später denkt sein Automaton
  in einer Sandbox bei uns, bezahlt aus seinen Credits, und denkt nach einem Absturz oder einem Neustart des Servers von selbst weiter.
  Was dem nicht dient, gehört nicht in dieses Goal.
- Maßgeblich sind `docs/sandbox/plan.md` (`## Isolation`, `## Netz`, `## Grenzen`, `## Preis`), `docs/sandbox/vertrag.md`,
  `docs/sandbox/server.md` (Regeln 1 bis 5 zu wa-staging, wörtlich; Regel 5 erlaubt einen Neustart des Servers),
  `docs/konto/konto.md` (Einnahmen mit `payTo` auf `account`), `docs/relay/vertrag.md` und `goals/sandbox/ANNAHMEN.md` unter
  `## Goal 02` bis `## Goal 07`. Was dieses Goal entscheidet oder misst, steht mit Grund unter `## Goal 08` in
  `goals/sandbox/ANNAHMEN.md`, nie nur im Code.
- Stand heute: `ops/sandbox/sandboxd.mjs` startet jeden Container mit `CONTAINER_CMD` (schreibt `/etc/resolv.conf`, dann
  `exec sleep infinity`), `--restart unless-stopped`, und stoppt eine Sandbox nach 24 Stunden ohne API-Aufruf und ohne Port (`IDLE_MS`)
  oder nach 30 Tagen (`MAX_RUN_MS`); `reconcile` hängt nach einem Neustart des Hosts den Datenträger wieder ein und startet die
  Container. Das Image `sandboxd-base:1` (`ops/sandbox/image/Dockerfile`, Ubuntu 24.04 mit `nodejs` aus Ubuntu) hat keine Runtime und
  kein Node 22. `harness/runtime/` baut die Runtime am Pin in `node:22-bookworm` und richtet sie mit `setup-headless.mjs` ohne Wizard
  ein; beides bleibt unverändert (Grundregel 13), darf aber gelesen und in ein Image kopiert werden. Die Runtime ruft selbst
  `POST /v1/automatons/register` auf (`src/app.ts`), darum ist `register` nie eine ID unter `/v1/automatons/`, und diese Route wird vor
  den neuen eingetragen.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 08` in `goals/sandbox/ANNAHMEN.md`):
  1. **Runtime im Image statt Installation zur Laufzeit.** `ops/sandbox/image/Dockerfile` wird `sandboxd-base:2`: Node 22, die Runtime
     als Klon von `Conway-Research/automaton` am Pin unter `/opt/automaton` mit `pnpm install --frozen-lockfile` und `pnpm build`, ohne
     Patch an `src/`, dazu `harness/runtime/setup-headless.mjs` als Kopie und zwei kleine Skripte aus `ops/sandbox/image/`:
     `automaton-start` (liest eine Setup-Datei, legt mit der Runtime Wallet und `automaton.json` an, löscht die Setup-Datei, setzt die
     Marke `/root/.automaton/autostart` und startet den Dienst) und `automaton-supervise` (startet `node /opt/automaton/dist/index.js
     --run` mit `HOME=/root`, nach jedem Ende nach 5 s neu, Ausgabe nach `/root/.automaton/run.log`, das ab 10 MB auf die letzten 5 MB
     gekürzt wird). Grund: Ein Bau in einer Sandbox mit 512 MB dauert Minuten und kann am Speicher scheitern, im Image ist die Runtime
     bei jedem Start gleich und in Sekunden da. Das Root-Dateisystem kommt aus dem Image, dauerhaft ist nur `/root`; der Zustand der
     Runtime liegt dort. `setup.sh` baut das Image auf dem Sandbox-Server, nie auf dem Zahlungsserver, und `--check` meldet genau die
     Zeile `IMAGE runtime d8f8168 clean`, wenn `git -C /opt/automaton rev-parse --short HEAD` im Image den Pin ergibt und
     `git status --porcelain` dort leer ist.
  2. **Start nach jedem Containerstart.** `CONTAINER_CMD` startet `automaton-supervise` im Hintergrund, wenn `/root/.automaton/autostart`
     besteht, und bleibt sonst wie heute. Ein Absturz der Runtime fängt der Supervisor, ein OOM der Sentry `--restart unless-stopped`,
     ein Neustart des Servers `reconcile`. Das gilt für jede Sandbox, auch eine, die ein Kunde über `POST /v1/sandboxes` anlegt: Was er
     dort selbst einrichtet, läuft in seiner eigenen Sandbox auf seine Credits.
  3. **Kein Halt nach 24 Stunden.** Ein Automaton ruft Inferenz und Credits beim Control Plane, nicht bei `sandboxd`, und würde sonst nach
     `IDLE_MS` gestoppt. `sandboxd` bekommt beim Anlegen das Feld `keep_running` (nur über den signierten Weg des Control Planes; die
     öffentliche Route `POST /v1/sandboxes` reicht es nie durch), und eine Sandbox mit `keep_running` fällt weder unter `IDLE_MS` noch
     unter `MAX_RUN_MS`. Sie endet nur durch Stopp oder Löschen des Kunden und durch leeres Guthaben. `docs/sandbox/plan.md`,
     `## Grenzen`, nennt die Ausnahme.
  4. **Ein eigener Schlüssel je Automaton.** Das Control Plane legt beim Anlegen einen API-Schlüssel des Kontos mit dem Namen
     `automaton:<id>` an (Format und Hash wie `createApiKey` in `src/auth/siwe.ts`, ohne `src/auth/` zu ändern), schreibt ihn nur in die
     Setup-Datei in der Sandbox und behält nur den Hash. Die Runtime bucht Inferenz damit auf genau das Konto, dem die Sandbox gehört.
     Ein solcher Schlüssel legt keinen Automaton an (403 `forbidden` auf `POST /v1/automatons`), damit kein Automaton sich selbst
     vervielfacht; Kind-Sandboxes über `POST /v1/sandboxes` bleiben ihm erlaubt und zählen gegen die zwei Plätze des Kontos. Löschen
     widerruft den Schlüssel (`revoked_at`).
  5. **Config.** `conwayApiUrl` und `socialRelayUrl` sind die öffentliche Basis des Control Planes (`CP_PUBLIC_URL`, in der Produktion
     `https://postyourprice.com`). `creatorAddress` ist die Smart Wallet des Kontos aus `konto_accounts` oder die SIWE-Adresse des
     Kontos; ein schlüsselloses Konto ohne Smart Wallet bekommt die Nulladresse `0x0000000000000000000000000000000000000000`, wenn die
     Runtime am Pin `creatorAddress` nur als Kennung liest (Fundstellen in `src/index.ts` am Pin prüfen und in `ANNAHMEN.md` nennen).
     `creatorMessage` sagt der Runtime in klaren Worten, dass jede Zahlung an sie mit `payTo` auf diese Adresse geht und ihre eigene
     Wallet nie Geld annimmt; ohne Smart Wallet sagt sie, dass der Automaton noch keine Zahlungen annimmt. `genesisPrompt` ist der Text
     des Kunden unverändert (1 bis 8000 Zeichen, sonst 400 `invalid_request`). Der Heartbeat `check_for_updates` ist aus, weil ein Update
     den Pin verließe (Grundregel 13); `check_social_inbox` bleibt an, weil das Relay jetzt bei uns antwortet.
  6. **Der Schlüssel der Runtime-Wallet bleibt in der Sandbox.** Keine Zeile in `src/`, `ops/` oder `harness/e2e/` liest
     `/root/.automaton/wallet.json` (am Pin `src/identity/wallet.ts:48`); die Adresse der Wallet kommt aus `automaton.json`.
- Routen (Englisch im Code, Fehler mit Link auf `docs/errors.md` wie überall): `POST /v1/automatons` mit `name` und `genesis_prompt`
  (201 mit `id`, `status`, `sandbox_id`), `GET /v1/automatons` (nur eigene), `GET /v1/automatons/{id}` (`status` ist `starting`,
  `running`, `stopped` oder `failed`, dazu `reason` bei `stopped` und `failed`, `wallet_address` der Runtime, `turns` aus dem Log),
  `GET /v1/automatons/{id}/logs` (die letzten 200 Zeilen von `run.log`, der API-Schlüssel und jede 64-stellige Hex-Folge durch
  `[redacted]` ersetzt), `POST /v1/automatons/{id}/stop`, `POST /v1/automatons/{id}/start` (nach einem Halt bei leerem Guthaben, mit
  der Reservierung wie beim Anlegen) und `DELETE /v1/automatons/{id}`. Eine fremde ID gibt 404, nie 403. Konto 04 ruft genau diese
  Routen; darum stehen Log und Stopp schon hier. Gebaut unter `src/automaton/` auf `createSandboxService` (gleiche Reservierung, gleiche
  6-Minuten-Schritte, gleiche 402 mit `details`), keine zweite Abrechnung. Stufe klein, wenn die gemessene Spitze in der Produktion
  (Punkt 7) unter 400 MB liegt, sonst mittel; die Entscheidung mit der Zahl in `docs/sandbox/automaton.md`.
- Harness: Der Nachbau von `sandboxd` (`harness/sandboxd/`) bekommt die Runtime am Pin im Image (etwa als Stufe aus demselben Klon wie
  `harness/runtime/Dockerfile`, ohne diese Datei zu ändern) und `harness-run.mjs` führt `CONTAINER_CMD` beim Start eines Containers
  aus, so dass der Supervisor als Prozess im Nachbau läuft. `harness/e2e/automaton-walk.mjs` legt über `POST /v1/automatons` einen
  Automaton für ein Konto mit Credits aus dem bestehenden Topup des Harness an, wartet auf fünf Zeilen
  `Turn <id>: <n> tools` im Log, beendet den Prozess der Runtime in der Sandbox (über `exec`), wartet auf einen neuen Turn, startet den
  Container `sandboxd` des Harness neu, wartet auf einen weiteren Turn, prüft das Ledger (Zeilen `sandbox` und Inferenz auf demselben
  Konto, Saldo gleich Summe), die Wallet der Runtime auf der Kette des Harness (0) und löscht dann. `harness/e2e/full.sh` bekommt die
  Bedingung `automaton` in der Schlusszeile; die bestehenden Bedingungen bleiben unverändert. Das schlüssellose Konto prüfen die
  Unit-Tests. Der code-host hat kein Docker: Den Harness belegt der Job `e2e` des Goal-PR.
- Produktion vor dem Merge, genau einmal mit Neustart: Wie bei sandbox 07 kommen Image und `sandboxd` mit `ops/sandbox/setup.sh
  72.62.51.224` vom Goal-Branch auf den Sandbox-Server, nachdem `dev` in den Goal-Branch gemergt ist (sonst dreht der Lauf einen Stand
  von `dev` auf dem Server zurück), vorher `setup.sh --foreign-sandboxes 72.62.51.224`. `ops/automaton-live.sh` fährt dann über die
  öffentliche Sandbox-API mit `LIVE_SANDBOX_KEY` (eigenes Konto, `src/bounties/ours.ts`) dieselben Schritte wie das Control Plane:
  Sandbox anlegen, Setup-Datei hochladen, `automaton-start`, auf den ersten Turn warten (höchstens 5 Minuten), mit `--reboot` den
  Sandbox-Server neu starten (`ssh … systemctl reboot` mit `~/.ssh/id_ed25519_cp_sandbox`, nur wenn `--foreign-sandboxes` keine
  laufende fremde Sandbox meldet, sonst `AUTOMATON LIVE FAIL foreign sandboxes running, no reboot`), auf einen Turn nach dem Neustart
  warten, die Spitze des Speichers aus `memory.peak` der Cgroup des Containers lesen (nur lesend über SSH), löschen, dann das Ledger der
  Produktion nur lesend wie `ops/runtime-sandbox.sh` (`readonly: true`, nur Zahlen) und das USDC-Guthaben der Runtime-Wallet auf Base
  über einen öffentlichen RPC (`eth_call` `balanceOf`, nur lesend). Letzte Zeile
  `AUTOMATON LIVE OK turns=<n> reboot=<ok|skipped> turns_after_reboot=<n> mem_peak_mb=<n> ledger_sandbox_rows=<n> ledger_inference_rows=<n> hold_mc=0 wallet_usdc=0`.
  Ohne `--reboot` dieselben Schritte ohne Neustart (`reboot=skipped`). Das Skript druckt nie Schlüssel, Adresse oder Sandbox-ID.
  Inferenz mit dem günstigsten Modell aus `/v1/models`, Genesis-Prompt wie `harness/runtime/setup.prod.json` (kurze Turns, nur
  lesende Tools, danach schlafen). Kein Topup: Ein 402 endet mit `AUTOMATON LIVE FAIL credits`.
- Nach dem Merge prüft `ops/live.sh` nach jedem Rollout die Route selbst: Prüfung `automaton` legt mit `LIVE_SANDBOX_KEY` über
  `POST /v1/automatons` einen Automaton an, wartet höchstens 180 s auf `running` und einen Turn, liest das Log (kein Schlüssel darin),
  löscht und prüft, dass der Schlüssel `automaton:<id>` danach 401 bekommt; Ergebnis `automaton=<ok|…>`, Fehlschlag als eigene Zeile
  `FAIL automaton: …`, der Selbsttest beweist beide Richtungen. Bis zum Rollout zeigt das 404. Weil jeder Rollout so einen Lauf kostet,
  bekommt das eigene Konto ein internes Guthaben nach dem Muster von `src/sandbox/grant.ts` mit `ref` `grant:live-automaton`, Höhe aus
  den gemessenen Kosten eines Laufs ohne Neustart mal 300 (rund ein Monat Rollouts), aufgerundet auf 10000 mc, höchstens 500000 mc;
  Rechnung und Befehl der Messung in `docs/sandbox/automaton.md`.
- Ablauf: zuerst Image, `sandboxd` und Unit-Tests (Punkte 1 bis 5), dann Harness (Punkt 6), dann die Umstellung des Servers und der
  Lauf gegen die Produktion (Punkt 7), dann `ops/live.sh` und Guthaben (Punkt 8), zuletzt Doku, Annahmen und Umfang (Punkte 9 bis 11).
  Nach jedem grünen Punkt Commit und Push.
- Die Produktion ändert sich nur über den Merge und `deploy.yml` und über die öffentliche API; der Zahlungsserver `76.13.144.207` wird
  nur gelesen (Ledger, Caddy-Log). Kein Kauf, keine Aufladung, keine Wallet-Bewegung durch den Loop, auch kein Topup der Runtime-Wallet.
  Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit
  eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Progress Log und Verdicts zitieren keine Suchausdrücke der Prüfbefehle
  wörtlich, weil das bei sandbox 07 einen Prüfbefehl rot machte.
- Was danach schneller zu mehr zahlenden Automatons führt: konto 04 baut auf genau diese Routen die Terminal-Tools, mit denen ein Mensch
  ohne Wallet aus Claude Code einen Automaton startet; sandbox 09 und 10 machen lange Befehle und den Bau am Pin sicherer.

## Done Condition
- [x] Das Image jeder Sandbox trägt die unveränderte Runtime am Pin mit Node 22 und die beiden Skripte, und der Sandbox-Server läuft
      mit diesem Image.
      MVP: Funktion, weil ohne Runtime im Image keine Sandbox in Sekunden einen Automaton starten kann.
      Prüfung: `grep -cxE "ARG AUTOMATON_REV=d8f8168" ops/sandbox/image/Dockerfile` muss 1 ausgeben.
      Prüfung: `grep -cE "pnpm install --frozen-lockfile|pnpm build|automaton-start|automaton-supervise|setup-headless.mjs" ops/sandbox/image/Dockerfile` muss mindestens 5 ausgeben.
      Prüfung: `cat ops/sandbox/sandboxd.service ops/sandbox/setup.sh | grep -c "sandboxd-base:1"` muss 0 ausgeben.
      Prüfung: `grep -c "sandboxd-base:2" ops/sandbox/sandboxd.service` muss mindestens 1 ausgeben.
      Prüfung: `for f in ops/sandbox/image/automaton-start ops/sandbox/image/automaton-supervise; do [ -f "$f" ] || echo "fehlt $f"; done` muss nichts ausgeben.
      Prüfung (Netz): `bash ops/sandbox/setup.sh --check 72.62.51.224` muss Exit-Code 0 haben und keine Zeile `CHANGE` ausgeben.
      Prüfung (Netz): `bash ops/sandbox/setup.sh --check 72.62.51.224 | grep -cx "IMAGE runtime d8f8168 clean"` muss 1 ausgeben.
- [x] `sandboxd` startet die Runtime nach jedem Containerstart, wenn die Marke besteht, und hält eine Sandbox mit `keep_running` weder
      nach 24 Stunden noch nach 30 Tagen an; der Test war vor dem Fix rot.
      MVP: Funktion, weil ein Automaton sonst nach einem Neustart des Servers stumm bleibt und nach einem Tag ohne Aufruf an `sandboxd`
      gestoppt wird.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandboxd-automaton.test.ts test/sandboxd.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in keep_running autostart automaton-supervise idle max-runtime reconcile; do grep -qF -- "$w" test/sandboxd-automaton.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$T/ops/sandbox/sandboxd.mjs; if ! grep -q "s\.keep_running" $f; then echo "fehlt s.keep_running"; else sed -i "s/s\.keep_running/false/g" $f; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/sandboxd-automaton.test.ts >/dev/null 2>&1) && echo "gruen ohne keep_running"; fi; rm -rf $T` muss nichts ausgeben.
- [x] Das Control Plane beantwortet die Routen unter `/v1/automatons` für jedes Konto, auch ein schlüsselloses, legt je Automaton
      einen eigenen Schlüssel an, den ein Automaton nicht für einen weiteren Automaton nutzen kann, und gibt einem fremden Konto 404; der
      Test war vor dem Fix rot.
      MVP: Funktion, weil das die Schnittstelle ist, über die ein Kunde und konto 04 einen Automaton starten, beobachten und stoppen.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-api.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/automaton-api.test.ts` muss mindestens 12 ausgeben (je ein Fall: Anlegen mit Name und Genesis-Prompt gibt 201 und genau einen Aufruf an den nachgebauten sandboxd mit keep_running; Anlegen für ein schlüsselloses Konto; POST /v1/sandboxes reicht keep_running nie durch; Genesis-Prompt leer oder über 8000 Zeichen gibt 400 invalid_request; ein Schlüssel automaton:<id> bekommt 403 auf POST /v1/automatons; fremde ID gibt 404 auf Zustand, Log, Stopp, Start und Löschen; GET /v1/automatons nennt nur eigene; Zustand starting ohne Turn und running mit Turn im Log; Log ohne Schlüssel und ohne 64-stellige Hex-Folge; Stopp und Start; Löschen widerruft den Schlüssel, danach 401; POST /v1/automatons/register antwortet wie vorher).
      Prüfung: `for w in /v1/automatons genesis_prompt keep_running automaton: 403 404 401 redacted; do grep -qF -- "$w" test/automaton-api.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$(grep -rlE "export function isAutomatonKey\(" $T/src/automaton | head -1); if [ -z "$f" ]; then echo "fehlt isAutomatonKey"; else sed -i "s/export function isAutomatonKey(/function isAutomatonKeyOrig(/" $f; echo "export function isAutomatonKey(..._a: unknown[]): boolean { return false; }" >> $f; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-api.test.ts >/dev/null 2>&1) && echo "gruen ohne isAutomatonKey"; fi; rm -rf $T` muss nichts ausgeben.
- [x] Was das Control Plane in die Sandbox schreibt, stimmt: `conwayApiUrl` und `socialRelayUrl` auf uns, `creatorAddress` und
      `payTo` auf das Konto des Kunden, der Genesis-Prompt unverändert, `check_for_updates` aus, und kein Code liest den Schlüssel der
      Runtime-Wallet; der Test war vor dem Fix rot.
      MVP: Funktion, weil die Runtime nur mit dieser Config bei uns denkt, schreibt und Einnahmen auf das Konto des Kunden lenkt statt in
      eine Wallet auf unserem Server.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-setup.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in conwayApiUrl socialRelayUrl creatorAddress payTo genesisPrompt check_for_updates konto_accounts 0x0000000000000000000000000000000000000000; do grep -qF -- "$w" test/automaton-setup.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- src ops harness/e2e harness/sandboxd | grep -cE '^\+.*\.automaton/wallet\.json'` muss 0 ausgeben.
- [x] Ein Automaton kostet genau die Sandbox-Schritte und seine Inferenz auf dem Konto, dem die Sandbox gehört, hält bei leerem
      Guthaben an und lässt beim Löschen keine Reservierung zurück; der Test war vor dem Fix rot.
      MVP: Funktion, weil jede Stunde und jede Antwort genau einmal berechnet werden muss und ein Automaton ohne Guthaben nicht auf
      unsere Kosten weiterlaufen darf.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-billing.test.ts test/sandbox-billing.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in ledger "kind" sandbox: hold_mc stop_reason credit revoked_at; do grep -qF -- "$w" test/automaton-billing.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Im Harness denkt die unveränderte Runtime in der nachgebildeten Sandbox fünf Turns, denkt nach einem Absturz und nach einem
      Neustart des nachgebauten `sandboxd` weiter, die Runtime-Wallet hält nichts, das Ledger stimmt, und der Job `e2e` des Goal-PR ist
      grün.
      MVP: Funktion, weil erst dieser Lauf zeigt, dass die unveränderte Runtime den ganzen Weg von der Route bis zum Denken übersteht
      (Grundregel 13).
      Prüfung: `for w in /v1/automatons "Turn " exec restart ledger wallet_usdc AUTOMATON_RESULT; do grep -qF -- "$w" harness/e2e/automaton-walk.mjs || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -cE 'automaton=\$automaton' harness/e2e/full.sh` muss mindestens 2 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-walk.test.ts test/harness-sandboxd.test.ts test/e2e-sandbox-gate.test.ts` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-08 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-08 --state all --json number -q '.[0].number'); l=$(gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,link -q '.[] | select(.name=="e2e") | .link'); gh run view --job "${l##*/}" --log -R matthiashippe/control-plane | grep -cE "E2E OK .*sandbox=true.*automaton=true"` muss mindestens 1 ausgeben.
- [ ] Ein eigener Automaton hat in der Produktion vor dem Merge gedacht, nach einem Neustart des Sandbox-Servers von selbst weiter
      gedacht, ist aus Credits bezahlt und hat keine Wallet bewegt; die Spitze des Speichers und die Stufe stehen in der Doku.
      MVP: Funktion, weil nur der echte Server mit gVisor, nftables und `reconcile` zeigt, dass ein Automaton einen Neustart übersteht.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/automaton-live.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `AUTOMATON LIVE SELFTEST OK` ausgeben.
      Prüfung: `awk '/^## Lauf gegen die Produktion/{f=1;next} /^## /{f=0} f' docs/sandbox/automaton.md | grep -cE "^- 20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC: AUTOMATON LIVE OK turns=[1-9][0-9]* reboot=ok turns_after_reboot=[1-9][0-9]* mem_peak_mb=[0-9]+ ledger_sandbox_rows=[1-9][0-9]* ledger_inference_rows=[1-9][0-9]* hold_mc=0 wallet_usdc=0$"` muss 1 ausgeben.
      Prüfung: `grep -cE "^Speicher Spitze: [0-9]+ MB, Stufe: (klein|mittel)$" docs/sandbox/automaton.md` muss 1 ausgeben.
      Prüfung: `grep -ciE "cnwy_k_[0-9a-f]{8}|sbx-[a-z0-9]+-[0-9]+\." docs/sandbox/automaton.md` muss 0 ausgeben.
      Prüfung: `grep -oiE "0x[0-9a-f]{40}" docs/sandbox/automaton.md | grep -cvx "0x0\{40\}"` muss 0 ausgeben.
      Prüfung (Netz): `bash ops/automaton-live.sh | tail -1 | grep -cE "^AUTOMATON LIVE OK turns=[1-9][0-9]* reboot=skipped .*hold_mc=0 wallet_usdc=0$"` muss 1 ausgeben.
- [x] Nach jedem Rollout prüft `ops/live.sh` die Route `/v1/automatons` mit dem eigenen Konto und meldet einen Fehlschlag mit eigener
      Zeile, und das eigene Konto hat das Guthaben dafür.
      MVP: Funktion, weil ein Rollout, der den Start eines Automatons bricht, sonst erst beim nächsten Kunden auffällt.
      Prüfung: `for w in /v1/automatons 'automaton=ok' 'FAIL automaton:' 401; do grep -qF -- "$w" ops/live.sh || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/live.sh --selftest | grep -c "FAIL automaton:"` muss mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/live-selftest.test.ts test/automaton-grant.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git grep -c "grant:live-automaton" -- src | wc -l` muss mindestens 1 ausgeben.
- [x] Die Doku sagt Kunde, Runtime und Betrieb, wie ein Automaton bei uns läuft, und die Entscheidungen stehen mit Grund in den
      Annahmen.
      MVP: Funktion, weil ein Automaton und konto 04 die Felder und Fehler aus der Fehlerreferenz lesen, auf die jede Fehlerantwort
      verlinkt.
      Prüfung: `for h in "## Routen" "## Was in der Sandbox liegt" "## Grenzen" "## Lauf gegen die Produktion"; do grep -qx -- "$h" docs/sandbox/automaton.md || echo "fehlt $h"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## automatons/{f=1;next} /^## /{f=0} f' docs/errors.md | grep -cE "genesis_prompt|invalid_request|forbidden|automaton_not_found"` muss mindestens 3 ausgeben.
      Prüfung: `awk '/^## Grenzen/{f=1;next} /^## /{f=0} f' docs/sandbox/plan.md | grep -c "keep_running"` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^## Goal 08/{f=1} f' goals/sandbox/ANNAHMEN.md | grep -ciE "image|keep_running|creatorAddress|automaton:|wallet.json|neustart"` muss mindestens 6 ausgeben.
- [x] Das Goal ändert weder Runtime noch Zahlung, Anmeldung, Deploy oder CI und bringt keinen Schlüssel und kein Zertifikat ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8) und die Runtime am Pin die Referenz bleibt (Grundregel 13).
      Prüfung: `git diff --name-only origin/dev...HEAD -- harness/runtime src/payments src/auth deploy .github scripts/check.mjs | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5})'` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei, jede neue Selftest-Zeile und jede neue Bedingung war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Zahl in `docs/sandbox/automaton.md` mit dem Befehl und der Uhrzeit, aus denen sie stammt; keine Adresse, kein Name, keine
      Sandbox-ID und kein Schlüssel, auch nicht die des eigenen Automatons.
- [ ] Der Text, den die Runtime als `creatorMessage` liest, und jede Fehlermeldung der neuen Routen sagen in klaren Worten, was passiert
      und was der Automaton oder der Kunde tun kann.
- [ ] Der Neustart des Sandbox-Servers trifft keine laufende fremde Sandbox; die Zeile im Progress Log nennt die Ausgabe von
      `setup.sh --foreign-sandboxes` davor.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `src/payments/**`, `src/auth/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`,
  `*.pem`, `*.crt`
- `/root/.automaton/wallet.json` in jeder Sandbox: nie lesen, kopieren oder ausgeben
- der Zahlungsserver `76.13.144.207`: nur lesen nach `loop-constraints.md` (Produktion: nur lesen), kein Rollout, kein Neustart, keine
  Änderung an Datenbank, Volume, Compose oder `.env`
- `srv1327036`: nur über `ops/sandbox/setup.sh`, dazu genau ein Neustart über `ops/automaton-live.sh --reboot`, nur ohne laufende
  fremde Sandbox; wa-staging nach `docs/sandbox/server.md`, Regeln 1 bis 5, unberührt
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung (`loop-constraints.md`, Grundregeln 9 und 10), auch kein Geld an die
  Runtime-Wallet in der Sandbox
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 8, 9, 10, 11 gebaut (Image sandboxd-base:2 mit Runtime am Pin, Autostart und keep_running in sandboxd, Routen unter /v1/automatons auf createSandboxService, Setup-Datei, Harness-Walk, ops/automaton-live.sh, Prüfung automaton in ops/live.sh, Guthaben grant:live-automaton 500000 mc, Doku und Annahmen); Punkt 7 offen, weil der Zahlungsserver den lesenden Schlüssel des code-host seit 01:31 UTC abweist (Permission denied (publickey), auch der Job deploy von deploy.yml), und automaton-live.sh mit --reboot ihn für --foreign-sandboxes und das Ledger braucht; ohne ihn kein Neustart. Vor der Umstellung lag auf dem Sandbox-Server keine Sandbox und kein Container (Zustand von sandboxd und docker ps, 02:33 UTC), setup.sh --foreign-sandboxes endete mit FAIL, weil der Zahlungsserver nicht lesbar war. Rot vor dem Fix: sandboxd-automaton 8 von 16 vor der Änderung an sandboxd.mjs, mit der Mutation keep_running 2 rot; automaton-api, -setup, -billing, -grant, -walk ohne die Module rot, Mutation isAutomatonKey 1 rot, Wächter auf die Schlüsseldatei der Wallet rot am eigenen Kommentar; harness-sandboxd Neustart als eigener Prozess rot mit unref; Selbsttests von automaton-live.sh und live.sh je per Mutation rot; erster e2e-Lauf rot (automaton=false, sandboxd kam nach dem Neustart nicht zurück). Prüfbefehle: Punkt 1 lokal 1, 6, 0, 1, nichts, Netz Exit 0 ohne CHANGE und 1 (02:34 UTC); Punkt 2 Exit 0, nichts, nichts; Punkt 3 Exit 0, 14, nichts, nichts; Punkt 4 Exit 0, nichts, 0; Punkt 5 Exit 0, nichts; Punkt 6 nichts, 2, Exit 0, e2e SUCCESS, 1 am Kopf 4fecf05; Punkt 7 Selbsttest OK, Doku 0 und 0 (offen), 0, 0, Netz nicht gelaufen; Punkt 8 nichts, 11, Exit 0, 1; Punkt 9 nichts, 5, 2, 17; Punkt 10 0, 0, 0; Punkt 11 check grün in 193 s.

## Blockers
Keine.
