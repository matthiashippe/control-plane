# Sandbox Goal 04: Ende zu Ende mit der unveränderten Upstream-Runtime

## Status
ACTIVE

## Active Objective
Die unveränderte Runtime am Pin `d8f8168` legt über ihren eigenen Client und ihre eigenen Werkzeuge eine Sandbox an, führt darin aus,
schreibt und liest eine Datei, bekommt auf `expose_port` die Antwort aus sandbox 03 und läuft weiter, und das Ledger stimmt; danach ist
die Sandbox weg. Zuerst im Harness: ein nachgebauter `sandboxd` als eigener Dienst in `harness/docker-compose.yml`, der Gang in
`pnpm e2e` (Job `e2e` jedes PR und vor jedem Rollout). Dann genau einmal gegen die Produktion mit der eigenen Adresse `live-sandbox`
aus sandbox 03, bezahlt aus ihren vorhandenen Credits, ohne Wallet-Bewegung (`ROADMAP.md`, sandbox 04; `docs/kette.md`, sandbox 04;
`docs/sandbox/plan.md`, sandbox 04).
MVP: Funktion, weil erst dieser Gang zeigt, dass ein fremder Automaton mit der unveränderten Runtime bei uns eine Sandbox startet und
bezahlt (Meilenstein „Erste Sandbox“ in `ROADMAP.md`), und weil jeder spätere Rollout ohne ihn die Sandbox-API für die Runtime brechen
könnte, ohne dass ein Check rot wird.

## Voraussetzungen
- sandbox Goal 03 DONE

## Kontext für den Maker
- Maßgeblich sind `docs/sandbox/vertrag.md` (Endpunkte, Felder, Verhalten der Runtime bei Fehlern), `docs/sandbox/plan.md`
  (`## Verbindung`, `## Preis`) und `goals/sandbox/ANNAHMEN.md`, Goal 03. Was dieses Goal anders entscheidet oder misst, steht mit Grund
  unter `## Goal 04` in `goals/sandbox/ANNAHMEN.md`, nie nur im Code.
- Freigegebene Ports: `docs/kette.md` sagt „gibt einen Port frei“. Das hat sandbox 03 überholt (Vorgänger gehen `docs/kette.md` vor):
  `POST /v1/sandboxes/{id}/ports/expose` antwortet 409 `port_exposure_unavailable` und erreicht `sandboxd` nicht, bis sandbox 06 die
  eigene Domain für Ports bringt. Dieses Goal belegt, was die Runtime damit macht: Ihr Werkzeug `expose_port` gibt den Fehler als Text
  an das Modell, der nächste Aufruf derselben Runtime gelingt (409 zählt nicht für ihren Circuit Breaker, `src/types.ts:613` am Pin).
  Kein Port wird freigegeben, kein Code am 409 geändert.
- Wie die Runtime aufruft: wie im Block „domains through the runtime's own client“ in `harness/e2e/full.sh`, also mit
  `createConwayClient` aus `dist/conway/client.js` und `executeTool` mit `createBuiltinTools` aus `dist/agent/tools.js` der
  unveränderten Runtime, nicht über einen Turn des Mock-Modells. Reihenfolge: `create_sandbox` (Stufe klein, eigener `name` je Lauf,
  weil gleicher Body binnen 60 s dieselbe Sandbox ist, `ANNAHMEN.md`, Goal 03), dann ein Client mit `sandboxId` der neuen Sandbox und
  damit `exec` (`echo ok` gibt `ok`, `exit_code` 0), `write_file` und `read_file` (derselbe Text zurück), `expose_port` (Text nennt
  `port_exposure_unavailable`), `list_sandboxes` (die neue Sandbox steht drin). Danach `DELETE /v1/sandboxes/{id}` direkt über HTTP mit
  demselben Schlüssel, weil `deleteSandbox` am Pin leer ist, und noch einmal `list_sandboxes` (die Sandbox fehlt). Kein Aufruf der
  Runtime darf 429, 500, 502, 503 oder 504 bekommen.
- Der Gang steht genau einmal im Repo, in `harness/e2e/sandbox-walk.mjs`: Er nimmt URL, Schlüssel und den Ort von `dist/` der Runtime
  aus der Umgebung, druckt eine Zeile `SANDBOX_RESULT <JSON>` mit jedem Schritt, Status und Text, und exportiert eine reine Funktion
  `judgeSandboxWalk(result)`, die `ok` oder die Liste der Gründe liefert. `full.sh` und `ops/runtime-sandbox.sh` rufen beide dieselbe
  Datei auf; der Container `runtime` bekommt sie über einen Bind-Mount in `harness/docker-compose.yml`, nicht über `harness/runtime/`.
- Nachgebauter `sandboxd` unter `harness/sandboxd/` (Dockerfile auf `node:22-bookworm` und ein Startskript): der echte `createSandboxd`
  aus `ops/sandbox/sandboxd.mjs` mit einem eigenen `run` statt Docker, der `docker exec <name> …` als Prozess im Container des Nachbaus
  ausführt und Netz, Image und Container der Sandbox nur im Zustand führt; kein Docker im Docker. Die Signaturprüfung bleibt echt:
  `cp` legt beim ersten Start `/data/sandbox-client.pub` an, der Nachbau liest den Schlüssel aus dem Volume `cp-data` (nur lesend) in
  sein `keysDir` (`keys` ist dort eine Funktion, die je Anfrage neu lädt). `cp` bekommt `CP_SANDBOXD_URL` auf den Nachbau; nimmt der
  Client nur `https`, dann mit einem Zertifikat aus `harness/gen-certs.sh` und der eigenen CA, ohne den Client für den Harness zu ändern.
  Der Nachbau bindet keinen Port außerhalb des Compose-Netzes.
- `full.sh`: Der Gang läuft nach dem Block der Domains mit dem Schlüssel, den die Runtime provisioniert hat. Danach liest der Lauf aus
  `cp.db` mit `readonly: true`: genau eine Zeile `sandbox` mit `ref` `sandbox:<id>:…` für diese Sandbox (Anlegen und gleich Löschen ist
  ein begonnener Schritt, 100 mc für klein, `docs/sandbox/plan.md`, `## Preis`), `hold_mc` dieser Sandbox 0, Ledger weiter konsistent;
  und aus dem Zustand des Nachbaus: keine Sandbox mehr. Die Schlusszeile bekommt `sandbox=<true|false>`, und `sandbox=false` macht
  `E2E FAIL`. Die bestehenden Bedingungen (fünf Turns, Domains, `balance_cents`) bleiben unverändert.
- Produktion, genau einmal: `ops/runtime-sandbox.sh` baut die Runtime am Pin auf dem code-host (kein Docker dort) in
  `${RUNTIME_DIR:-$HOME/.cache/control-plane/automaton-d8f8168}`: Klon von `Conway-Research/automaton`, `git checkout d8f8168`,
  `pnpm install --frozen-lockfile`, `pnpm build`; vor dem Gang prüft es, dass `git rev-parse HEAD` mit `d8f8168` beginnt und
  `git status --porcelain` leer ist (unverändert). Dann der Gang gegen `https://postyourprice.com` mit `LIVE_SANDBOX_KEY` aus
  `~/.config/control-plane/live-sandbox.env`, danach das Ledger über `CP_SSH_KEY` mit `readonly: true` (wie `ops/live.sh`, Ausgabe
  nur Zahlen): genau eine Zeile `sandbox` für diese Sandbox. Letzte Zeile `RUNTIME SANDBOX OK …` oder `RUNTIME SANDBOX FAIL <Grund>`.
  Kein Topup: Antwortet das Anlegen 402, endet das Skript mit `FAIL credits`, statt das Topup der Runtime auszulösen
  (`loop-constraints.md`, Grundregel 10). Das ist dieselbe Nutzung des eigenen, bezahlten Servers wie die Prüfung `sandbox` in
  `ops/live.sh`; die Produktion ändert sich nur über ihre öffentliche API, kein Rollout, kein Eingriff. Schlüssel, Adresse und
  Wallet-Schlüssel stehen nie in Ausgabe, Datei oder Kommentar.
- `--selftest` von `ops/runtime-sandbox.sh` läuft ohne Netz gegen gepflanzte Zeilen `SANDBOX_RESULT` und gepflanzte Ledger-Zahlen und
  ist in beide Richtungen bewiesen: Der gute Gang ist `OK`; falscher `exec`-Text, 200 statt 409 bei `expose_port`, ein Status aus der
  Liste der wiederholten, eine Sandbox, die nach dem Löschen noch gelistet ist, null oder zwei Ledger-Zeilen, ein Runtime-Klon mit
  Änderung oder anderem Commit und 402 beim Anlegen sind je `FAIL`. Beim Bau ist jede Selftest-Zeile einmal rot gewesen, die Zeile im
  Progress Log nennt, womit.
- Das Ergebnis des Laufs gegen die Produktion steht in `docs/sandbox/e2e.md`: Datum und Uhrzeit in UTC, der Befehl, die letzte Zeile
  und die Zahl der Ledger-Zeilen, ohne ID der Sandbox, Adresse oder Schlüssel. Dort auch, was der Harness abdeckt und was nicht (die
  Isolation prüft sandbox 02 gegen den echten Server, nicht der Nachbau).
- `src/` ändert dieses Goal nur, wenn der Gang einen Fehler der Sandbox-API zeigt, dann mit einem Test, der vor dem Fix rot war; ein
  solcher Fehler steht mit Grund unter `## Goal 04` in `ANNAHMEN.md`. Lange Befehle (ein `exec` über rund 125 s) misst sandbox 05, nicht
  dieses Goal.
- Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit
  eigenem Timeout, neue Dateien vor dem lokalen `check` stagen (er liest nur getrackte Dateien). Der code-host hat kein Docker: Den
  Harness belegt der Job `e2e` des Goal-PR.
- Was danach schneller zu mehr zahlenden Automatons führt: sandbox 05 macht lange Befehle für die Runtime fehlerfrei, sandbox 06 gibt
  Ports unter einer eigenen Domain frei; mit beiden kann ein fremder Automaton seinen Dienst bei uns betreiben (Abschlusskriterium in
  `ROADMAP.md`).

## Done Condition
- [x] Der nachgebaute `sandboxd` unter `harness/sandboxd/` nimmt nur signierte Anfragen des Schlüssels aus `cp` an, legt an, führt
      `echo ok` wirklich aus, schreibt und liest eine Datei und hat nach dem Löschen keine Sandbox mehr; der Test startet ihn im Prozess
      auf Port 0 mit dem echten signierten Client aus `src/sandbox/client.ts`.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/harness-sandboxd.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in createSandboxd sandbox-client.pub 401 "echo ok" files/read DELETE; do grep -qF -- "$w" test/harness-sandboxd.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -cE "^  sandboxd:" harness/docker-compose.yml` muss 1 ausgeben, und `grep -c "CP_SANDBOXD_URL" harness/docker-compose.yml` mindestens 1.
- [x] `harness/e2e/sandbox-walk.mjs` geht den Weg aus dem Kontext mit dem Client und den Werkzeugen der Runtime, und
      `judgeSandboxWalk` ist in beide Richtungen bewiesen.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-walk.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in createConwayClient executeTool create_sandbox exec write_file read_file expose_port list_sandboxes port_exposure_unavailable SANDBOX_RESULT judgeSandboxWalk; do grep -qF -- "$w" harness/e2e/sandbox-walk.mjs || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `for w in "echo ok" 409 200 503 "still listed" ledger; do grep -qF -- "$w" test/sandbox-walk.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] `pnpm e2e` geht den Weg mit der Runtime im Harness, prüft Ledger und Zustand des Nachbaus und wird bei `sandbox=false` rot; die
      bestehenden Bedingungen bleiben.
      Prüfung: `grep -c "sandbox-walk.mjs" harness/e2e/full.sh` muss mindestens 1 ausgeben, und `grep -cE 'sandbox=\$' harness/e2e/full.sh` mindestens 2 (Zeile `E2E FAIL` und Zeile `E2E OK`).
      Prüfung: `grep -cE "readonly: *true" harness/e2e/full.sh` muss mindestens 2 ausgeben.
      Prüfung: `for w in 'turns" -lt 5' 'domains_ok" != "true"' 'balance_cents" -ge 500'; do grep -qF -- "$w" harness/e2e/full.sh || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Der Job `e2e` des Goal-PR ist grün und hat den Gang mit der Runtime wirklich gemacht.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-04 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-04 --state all --json number -q '.[0].number'); l=$(gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,link -q '.[] | select(.name=="e2e") | .link'); gh run view --job "${l##*/}" --log -R matthiashippe/control-plane | grep -c "E2E OK .*sandbox=true"` muss mindestens 1 ausgeben.
- [x] `ops/runtime-sandbox.sh` prüft, dass die Runtime am Pin unverändert ist, löst kein Topup aus, und sein Selbsttest ist in beide
      Richtungen bewiesen.
      Prüfung: `bash ops/runtime-sandbox.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `RUNTIME SANDBOX SELFTEST OK` ausgeben.
      Prüfung: `for w in d8f8168 "status --porcelain" sandbox-walk.mjs LIVE_SANDBOX_KEY "readonly: true" "FAIL credits"; do grep -qF -- "$w" ops/runtime-sandbox.sh || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Die unveränderte Runtime hat in der Produktion mit der eigenen Adresse eine Sandbox angelegt, darin ausgeführt, ist dafür mit genau
      einer Ledger-Zeile abgerechnet, und die Sandbox ist weg; das Ergebnis steht ohne ID, Adresse oder Schlüssel in `docs/sandbox/e2e.md`.
      Prüfung (Netz): `bash ops/runtime-sandbox.sh` muss Exit-Code 0 haben und als letzte Zeile `RUNTIME SANDBOX OK` mit `ledger_rows=1` ausgeben.
      Prüfung: `grep -c "RUNTIME SANDBOX OK" docs/sandbox/e2e.md` muss mindestens 1 ausgeben, und `grep -cE "0x[0-9a-fA-F]{40}|cnwy_k_" docs/sandbox/e2e.md` muss 0 ausgeben.
- [x] Die Entscheidungen dieses Goals (409 statt Port, Gang über Client und Werkzeuge statt Turn, Lauf gegen die Produktion ohne Topup)
      stehen in `goals/sandbox/ANNAHMEN.md`.
      Prüfung: `awk '/^## Goal 04/{f=1} f' goals/sandbox/ANNAHMEN.md | grep -c "port_exposure_unavailable"` muss mindestens 1 ausgeben, und `awk '/^## Goal 04/{f=1} f' goals/sandbox/ANNAHMEN.md | grep -ci "topup"` mindestens 1.
- [x] Das Goal ändert weder Runtime, Zahlung, Anmeldung noch Betrieb und bringt keinen Schlüssel ins Repo.
      Prüfung: `git diff --name-only origin/dev...HEAD -- harness/runtime src/payments src/auth deploy .github scripts/check.mjs | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|env)$|live-sandbox\.env"` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jede neue Selftest-Zeile war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Zahl in `docs/sandbox/` mit dem Befehl, aus dem sie stammt; keine Adresse und kein Name eines Kunden, kein API-Key.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `src/payments/**`, `src/auth/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- der Zahlungsserver `76.13.144.207`: nur lesen nach `loop-constraints.md` (Produktion: nur lesen), kein Rollout, kein Neustart, keine
  Änderung an Datenbank, Volume, Compose oder `.env`; der Lauf gegen die Produktion geht nur über die öffentliche API
- `srv1327036`: nichts ändern, auch nicht `/etc/sandboxd/keys/`; der Schlüssel steht seit sandbox 03
- DNS der Zone `postyourprice.com`; kein freigegebener Port eines Kunden unter `*.postyourprice.com`
- Wallet-Bewegung, Topup, Überweisung (`loop-constraints.md`, Grundregel 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-13 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9 gebaut (Nachbau `sandboxd` mit echtem `createSandboxd`, Gang über Client und Werkzeuge der Runtime am Pin, Bedingung `sandbox` in `pnpm e2e`, `ops/runtime-sandbox.sh`, Lauf gegen die Produktion 01:10 UTC, Doku und Annahmen); rot gesehen: `test/harness-sandboxd.test.ts` alle 5 Tests mit exec ohne Prozess, ohne Schlüssel, Schlüssel nur einmal geladen, `umount` ohne Leeren und `mapRoot` ohne Lookahead, Kopie statt echtem `createSandboxd`; `test/sandbox-walk.test.ts` alle 10 Tests mit je einer abgeschalteten Prüfung in `judgeSandboxWalk` (exec-Text, 200 bei `expose_port`, wiederholte Status, noch gelistet, Ledger-Zeilen, 402, Rückfall von `read_file`, erste statt letzter Zeile, immer ok); `--selftest` alle 18 Zeilen mit je einem Defekt in `runtime_state`, Urteil oder Ledger-Abfrage (ohne Pin, ohne `status --porcelain`, ohne Build-Prüfung, fehlend als ok, `hold_mc` ignoriert, 402 ohne eigenen Text, Urteil immer OK und immer FAIL, fehlendes Ergebnis, jede Sandbox-Zeile gezählt, ID ohne Prüfung). Prüfbefehle: P1 vitest Exit 0, Wortprüfung leer, `sandboxd:` 1 und `CP_SANDBOXD_URL` 1; P2 vitest Exit 0, beide Wortprüfungen leer; P3 `sandbox-walk.mjs` 2, `sandbox=$` 2, `readonly: true` 2, Wortprüfung leer; P4 `SUCCESS` und 1 (PR #57, Job e2e an f94fdb8: `E2E OK turns=5 ... balance_cents=490 domains=true sandbox=true`); P5 Exit 0 mit `RUNTIME SANDBOX SELFTEST OK`, Wortprüfung leer; P6 `bash ops/runtime-sandbox.sh` Exit 0 mit `RUNTIME SANDBOX OK ... ledger_rows=1 hold_mc=0`, `RUNTIME SANDBOX OK` in e2e.md 1, Adressen und Schlüssel 0; P7 2 und 3; P8 0 und 0; P9 `check` Exit 0 (124 Testdateien, 1506 Tests).
- 2026-11-13 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9, alle Prüfbefehle am Kopf `2cb50bf` neu gefahren, `dev` brachte nichts Neues; den Lauf von P6 gegen die Produktion habe ich nicht wiederholt, weil das Goal ihn genau einmal vorsieht (Zyklus 1, 01:10 UTC, `docs/sandbox/e2e.md`). Prüfbefehle: P1 vitest Exit 0 (5 Tests), Wortprüfung leer, `sandboxd:` 1, `CP_SANDBOXD_URL` 1; P2 vitest Exit 0 (10 Tests), beide Wortprüfungen leer; P3 `sandbox-walk.mjs` 2, `sandbox=$` 2, `readonly: true` 2, Wortprüfung leer; P4 `e2e` SUCCESS an 2cb50bf, Log 1 Treffer `E2E OK .*sandbox=true`; P5 Exit 0 mit `RUNTIME SANDBOX SELFTEST OK`, Wortprüfung leer; P6 `RUNTIME SANDBOX OK` in e2e.md 1, Adressen und Schlüssel 0; P7 2 und 3; P8 0 und 0; P9 `check` Exit 0 (1506 Tests, grün in 61 s).
- 2026-11-13 Zyklus 3: Gap der Linse K zu Punkt 3 abgearbeitet: `test/e2e-sandbox-gate.test.ts` führt den Urteilsblock von `harness/e2e/full.sh` (nach der Zeile mit dem Zustand des Nachbaus bis zur Schlusszeile) in bash mit gepflanzten `walk`, `sandbox_id`, `sandbox_ledger` und `sandbox_left` aus, Compose und `cleanup` als leere Stubs; der gute Gang ergibt `E2E OK … sandbox=true`, `SANDBOX_VERDICT fail`, kein Urteil, keine ID, sieben falsche Ledger-Zeilen, fünf Reste des Nachbaus je `E2E FAIL … sandbox=false`, und fehlgeschlagene Domains, vier Turns oder 500 Cent bleiben trotz gutem Gang `E2E FAIL`; rot gesehen mit (a) `sandbox=false` zu `sandbox=true` 15 von 17 rot, (b) `|| "$sandbox" != "true"` entfernt 15 rot, (c) Ledger-Bedingung entfernt 7 rot, dazu ohne ID-Bedingung 1 rot, je zurückgenommen. Prüfbefehle: `pnpm -s vitest run test/e2e-sandbox-gate.test.ts` Exit 0 (17 Tests); P1 bis P3, P5, P7, P8 unverändert grün; `check` Exit 0 (125 Testdateien, 1523 Tests).

## Blockers
