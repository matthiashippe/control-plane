# Regeln Goal 03: Auf 8453 gehen `payout` und `retire` nur an eine eigene Weiterleitung

## Status
DONE

## Active Objective
`requireRule10` (`src/konto/chain.ts:138`) lässt auf chainId 8453 einen Aufruf von `payout` oder `retire` zu, sobald das Ziel gleich
dem `spender` der Erlaubnis in den Daten ist (`spenderOf(data) === to`, `src/konto/chain.ts:150`). Ein fremder Vertrag, der den
Selektor von `payout` annimmt und sich selbst als spender in die Erlaubnis schreibt, ist damit für den Gas-Schlüssel aufrufbar, obwohl
er nie über `DEPLOY_PROXY` mit den Werten entstand, die regeln 02 prüft. Nach diesem Goal verweigert `requireRule10` auf 8453 beide
Aufrufe, wenn das Ziel nicht genau die Adresse ist, die `forwarderAddress` (`src/konto/payout.ts:183`) für das Konto aus der
Erlaubnis, seine destination und die festen Werte des sendenden Schlüssels ergibt. Die destination reicht der Weg in
`src/konto/payout.ts` aus `konto_payouts` durch; fehlt sie, verweigert 8453 den Aufruf. Auf Base Sepolia bleibt alles, wie es ist.
Leitzahl: Ziele von `payout` und `retire`, die der Gas-Schlüssel auf 8453 frei wählen kann, Ziel 0 (heute jedes Ziel, das sich als
spender einträgt).
Widerlegt, wenn `requireRule10` auf 8453 schon heute `payout` an einen fremden Vertrag ablehnt, der sich als spender einträgt.
MVP: Funktion, weil die Ausnahme Hauptnetz dann nur Aufrufe an Weiterleitungen zulässt, die der Schlüssel selbst mit geprüften Werten
anlegt.

## Voraussetzungen
- regeln Goal 02 DONE

## Kontext für den Maker
- Ziel: Auf Base ruft der Gas-Schlüssel `payout` und `retire` nur an einer Weiterleitung auf, die es so nur über `DEPLOY_PROXY` mit
  `FORWARDER_BYTECODE`, dem Konto des Kunden, seiner Auszahladresse und unseren festen Werten geben kann.
- Quelle der Kette: `ROADMAP.md`, Topic `regeln`, Glied 03 (Tech Lead 26.11.2026, PRO-30347 aus der Triage PRO-30316; Kritik an
  regeln 02, PR #444). Übernimmt `goals/_vorschlaege/regeln-kritik-2026-11-25-1.md`.
- Warum das reicht: CREATE2 bindet die Adresse an Proxy, Salt und Init-Code. Ist das Ziel gleich
  `forwarderAddress(account, destination, fixed)` mit den festen Werten von 8453, dann steht dort, wenn überhaupt Code, genau unser
  Bytecode mit genau diesen fünf Argumenten. Welche destination der Aufrufer nennt, ändert daran nichts; sie dient nur dazu, die Adresse
  zu rechnen.
- Entscheidung Tech Lead (26.11.2026): Die Prüfung bleibt in `requireRule10` und bleibt ohne Datenbank. `KontoTx`
  (`src/konto/chain.ts:167`) bekommt ein optionales Feld `forwarder?: { destination: Address }`. Auf 8453 gilt für die Selektoren von
  `payout` und `retire`: Das Feld fehlt, das Konto der Erlaubnis lässt sich nicht dekodieren oder `to` ist nicht
  `forwarderAddress(permission.account, tx.forwarder.destination, { token: MAINNET_USDC, manager: SPEND_PERMISSION_MANAGER, caller: sender })`,
  dann wirft die Prüfung vor der ersten Anfrage. Der bisherige Vergleich `spenderOf(data) === to` bleibt zusätzlich stehen. Vergleich
  ohne Groß- und Kleinschreibung. Der Fehler nennt wie bisher Ziel und Selektor, dazu `forwarder destination missing` oder
  `not our forwarder`, nie die Daten und nie eine destination.
- `forwarderAddress` liegt in `src/konto/payout.ts`, das `src/konto/chain.ts` schon importiert (`DEPLOY_PROXY`, `FORWARDER_SALT`) und
  selbst `src/konto/chain.ts` importiert. Der Kreis ist harmlos, solange beide Seiten die Funktionen erst zur Laufzeit rufen; wer lieber
  die Rechnung nach `src/konto/forwarder.ts` zieht und aus beiden importiert, darf das, `forwarderAddress` bleibt aus `payout.ts`
  exportiert mit derselben Signatur.
- Der Weg in `src/konto/payout.ts`: Beim Aufruf von `payout` (`src/konto/payout.ts:553`) setzt der Weg `forwarder: { destination:
  row.destination }`. Für `retire` an der alten Weiterleitung (`src/konto/payout.ts:523`) kennt die Zeile heute nur `retire_forwarder`
  und `retire_permission`; die alte destination steht nach dem Wechsel nirgends mehr. Deshalb bekommt `konto_payouts` eine Spalte
  `retire_destination` (`src/db.ts`, wie `retire_revoke` per `ALTER TABLE … ADD COLUMN` für bestehende Zeilen), die das Update in
  `src/konto/payout.ts:357` mit der destination der ersetzten Zeile setzt und die Zeile `src/konto/payout.ts:525` mit den anderen
  `retire_*` leert. Fehlt `retire_destination` bei einer bestehenden Zeile, geht `retire` ohne das Feld hinaus: auf 84532 wie heute, auf
  8453 verweigert. Dort gibt es noch keine Zeile, weil das Hauptnetz erst mit `CP_KONTO_MAINNET=1` an ist; das steht als Zeile in
  `goals/regeln/ANNAHMEN.md`. Der Weg über `handleOps` am EntryPoint (`src/konto/payout.ts:494`) bleibt unverändert, er steht auf der
  Watch List aus regeln 01.
- Auf 84532 prüft `sendKontoTx` weiter nur die Kette: Kein Fall in `test/konto-send-guard.test.ts` „keeps 84532 unchanged“ verliert
  einen Eintrag, und ein `payout` ohne das Feld geht dort hinaus. Der Harness zahlt auf `chain-konto` mit 84532
  (`harness/docker-compose.yml`), `pnpm e2e` berührt die neue Prüfung also nicht.
- Tests ohne Netz und ohne festen Port mit dem nachgebauten Transport `node()` aus `test/konto-send-guard.test.ts`, in derselben
  Datei. Neue Testnamen: `refuses payout and retire on 8453 at a foreign contract that names itself as spender`, `refuses payout and
  retire on 8453 without the forwarder destination`, `refuses payout and retire on 8453 at the forwarder of another destination`,
  `keeps 84532 unchanged for payout and retire that 8453 refuses`. Jeder Fall prüft, dass der Transport keine Anfrage sah, bei 84532,
  dass `eth_sendRawTransaction` kam. Die Einträge `payout` und `retire` in `RULE_10` bekommen die destination, aus der
  `forwarder` gerechnet ist, und der Fall `sends every kind of rule 10 on 8453, also with the target in mixed case` bleibt grün. Jeder
  neue Fall zur Verweigerung war vor dem Fix rot; das Progress Log nennt Commit und Ausgabe.
- In `test/konto-payout.test.ts` oder `test/konto-payout-guard.test.ts` ein Fall, der zeigt, dass der Weg `payout` mit der
  destination der Zeile und `retire` mit `retire_destination` schickt (Testname enthält `passes the forwarder destination`).
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Aufruf auf dem Server,
  kein Rollout außer dem normalen über `deploy.yml`.

## Done Condition
- [x] Auf 8453 verweigert `sendKontoTx` `payout` und `retire` an einem fremden Vertrag, der sich als spender einträgt, ohne
      destination und an der Weiterleitung einer anderen destination vor der ersten Anfrage, und sendet beide an der eigenen.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-send-guard.test.ts` muss Exit-Code 0 haben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-send-guard.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/refuses payout and retire on 8453 at a foreign contract that names itself as spender/,/refuses payout and retire on 8453 without the forwarder destination/,/refuses payout and retire on 8453 at the forwarder of another destination/,/keeps 84532 unchanged for payout and retire that 8453 refuses/,/sends every kind of rule 10 on 8453/,/keeps 84532 unchanged: every transaction/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `grep -c "forwarderAddress" src/konto/chain.ts` muss mindestens 1 ausgeben.
- [x] Der Weg in `src/konto/payout.ts` reicht die destination durch, für `retire` aus `retire_destination`.
      Prüfung: `grep -c "retire_destination" src/db.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "retire_destination" src/konto/payout.ts` muss mindestens 2 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts test/konto-payout-guard.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log(t.some(x=>/passes the forwarder destination/.test(x))?"ja":"nein")})'` muss `ja` ausgeben.
- [x] Die Wege, die heute auf 8453 und 84532 senden, bleiben grün.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-mainnet.test.ts test/konto-payout.test.ts test/konto-payout-guard.test.ts test/konto-forwarder.test.ts test/konto-topup.test.ts test/konto-chain.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/konto/chain\.ts|src/konto/payout\.ts|src/konto/forwarder\.ts|src/db\.ts|test/konto-[a-z-]+\.test\.ts|goals/regeln/.*)$' | wc -l` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Fall zur Verweigerung war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Auf 84532 sendet `sendKontoTx` jede Transaktion wie auf `origin/dev`; kein Fall in `test/konto-*.test.ts` verliert eine
      Assertion.
- [ ] `goals/regeln/ANNAHMEN.md` trägt eine Zeile `- <Datum>, regeln 03: …` zu bestehenden Zeilen ohne `retire_destination`.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`
- jede Datei außer `src/konto/chain.ts`, `src/konto/payout.ts`, `src/konto/forwarder.ts`, `src/db.ts`, `test/konto-*.test.ts`, der
  Goal-Datei und `goals/regeln/ANNAHMEN.md`
- `FORWARDER_BYTECODE` und die ABI in `src/konto/forwarder.ts`: unverändert, der Vertrag bleibt
- der Weg über `handleOps` (`src/konto/payout.ts:494`) und `src/konto/topup.ts`: unverändert
- jeder Aufruf auf dem Server, jedes Schreiben in der Produktion, jede Transaktion auf einem echten Netz
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-26 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: `requireRule10` lässt `payout` und `retire` auf 8453 nur an `forwarderAddress(Konto der Erlaubnis, tx.forwarder.destination, feste Werte mit dem sendenden Schlüssel)` zu, `konto_payouts.retire_destination` neu, `sendPayout` reicht die destination durch (f02ebd9, c425ffe); die neuen Fälle waren rot auf 6eb1531 (send-guard 4 failed | 15 passed, Transaktion ging hinaus) und vor dem Weg (konto-payout 3 failed | 27 passed). Prüfbefehle: send-guard Exit 0; Titel `alle`; forwarderAddress in chain.ts 3; retire_destination in db.ts 3, in payout.ts 7; `passes the forwarder destination` `ja`; sechs konto-Dateien Exit 0; Dateien außerhalb des Umfangs 0; check Exit 0 (281 Dateien, 2903 Tests, 587 s unter Last).
- 2026-11-26 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4; `dev` (6eb1531) lag schon im Branch, alle Prüfbefehle am Kopf 11827b0 neu gefahren. Prüfbefehle: send-guard Exit 0; Titel `alle`; forwarderAddress in chain.ts 3; retire_destination in db.ts 3, in payout.ts 7; `passes the forwarder destination` `ja`; sechs konto-Dateien Exit 0 (58 Tests); Dateien außerhalb des Umfangs 0; check Exit 0 (2903 Tests, 192 s); Job check am PR #455 pass.
- 2026-11-26 Release: PASS K und B (Zyklus 2), DONE.

## Blockers
