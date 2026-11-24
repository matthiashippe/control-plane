# Regeln Goal 01: Grundregel 10 hält im Code

## Status
ACTIVE

## Active Objective
Grundregel 10 hält heute nur über die Konfiguration. `sendKontoTx` (`src/konto/chain.ts:52`) prüft die Kette, nicht die Art der
Transaktion, und `sendPayout` schickt `handleOps` an den EntryPoint (`src/konto/payout.ts:494`), das die Ausnahme Hauptnetz nicht
nennt. `LocalSettler` (`src/payments/settler.ts:71`) settlet selbst per `transferWithAuthorization`, und `settlerFromEnv` schaltet
ihn mit `CP_SETTLER=local` ein, ohne `CP_CHAIN_ID` auf 8453, ohne Kette oder Knoten zu prüfen. Nach diesem Goal verweigert
`sendKontoTx` auf chainId 8453 jede Transaktion, die nicht zu den Sendearten der Ausnahme Hauptnetz gehört, also heute auch
`handleOps`, und `LocalSettler` sendet nur an einen Anvil-Knoten. Auf Base Sepolia bleibt alles, wie es ist.
Leitzahl: Sendearten auf 8453 außerhalb von Grundregel 10, die der Code zulässt, Ziel 0.
Widerlegt, wenn `sendKontoTx` auf 8453 schon heute einen fremden Selektor ablehnt.
MVP: Funktion, weil eine Regel, die nur die Konfiguration hält, beim ersten falschen Wert Geld bewegt.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel: Ein falsch gesetzter Schalter oder `CP_KONTO_MAINNET=1` bewegt auf Base kein Geld auf einem Weg, den Grundregel 10 nicht
  nennt; das Geld der Kunden geht nur über die Wege, die Matthias freigegeben hat.
- Quelle der Kette: `ROADMAP.md` Zeile 27, Topic `regeln`, Glied 01 (Tech Lead 24.11.2026, PRO-28911). Übernimmt
  `goals/_vorschlaege/konto-redteam-2026-11-24-1.md` und `goals/_vorschlaege/loop-redteam-2026-11-24-1.md`.
- Sendearten auf 8453 (`loop-constraints.md` Grundregel 10, Ausnahme Hauptnetz): `approveWithSignature`, `revokeAsSpender` und
  `spend` nur an `SPEND_PERMISSION_MANAGER`; das Anlegen der Weiterleitung nur an `DEPLOY_PROXY` mit Daten, die mit `FORWARDER_SALT`
  und danach `FORWARDER_BYTECODE` beginnen; der Aufruf der Weiterleitung nur mit den Selektoren `payout` und `retire` aus
  `FORWARDER_ABI`. Die Selektoren rechnet der Code aus den ABIs (`toFunctionSelector` oder die ersten vier Bytes von
  `encodeFunctionData`), nie als abgeschriebene Hex-Zahl. Alles andere verweigert `sendKontoTx` auf 8453, bevor der Transport eine
  Anfrage sieht, auch leere Daten `0x` und `handleOps`; der Fehler nennt Ziel und Selektor, nie die Daten. Auf 84532 prüft
  `sendKontoTx` wie heute nur die Kette.
- `handleOps` bleibt in `src/konto/payout.ts`: Ob der Widerruf über den EntryPoint in Grundregel 10 kommt, entscheidet Matthias,
  bevor er `CP_KONTO_MAINNET=1` setzt; es steht auf der Watch List in `STATE.md`, kein Issue geht an ihn, weil konto 15 ruht. Bis
  dahin endet ein Widerruf auf 8453 wie ein Senden, das nie losging (`PayoutFailed("retire", null)`), und auf Base Sepolia läuft er
  unverändert.
- Entscheidung Tech Lead (24.11.2026), Abweichung von der ROADMAP-Zeile: Die ROADMAP nennt für `LocalSettler` die Anvil-Kette
  31337, doch Anvil im Harness läuft mit `--chain-id 8453` (`harness/docker-compose.yml:10`, Healthcheck auf 8453), weil die
  unveränderte Upstream-Runtime auf `base` zahlt und die EIP-3009-Unterschrift die chainId 8453 trägt. Eine Sperre nach chainId
  würde den Harness und damit `pnpm e2e` vor jedem Rollout brechen und trennt Harness und Hauptnetz nicht. Statt dessen fragt
  `LocalSettler` vor dem ersten Senden den Knoten mit `web3_clientVersion` und settlet nur, wenn die Antwort mit `anvil/` beginnt;
  sonst `{ ok: false, error }` mit einem Text, der `anvil` nennt, und keine Transaktion. Ein echter Knoten von Base meldet sich nie
  als Anvil, und eine Anvil-Kopie des Hauptnetzes bewegt kein echtes Geld. `settlerFromEnv` bleibt, wie es ist.
- Tests ohne Netz und ohne festen Port: ein nachgebauter Transport wie `node()` in `test/konto-mainnet.test.ts` für `sendKontoTx`,
  für `LocalSettler` ein Knoten auf `listen(0)` oder ein Transport, den `LocalSettlerConfig` optional annimmt. Testnamen:
  `refuses handleOps on 8453`, `refuses empty data on 8453`, `sends every kind of rule 10 on 8453`, `keeps 84532 unchanged` in
  `test/konto-send-guard.test.ts`; `refuses to settle on a node that is not anvil`, `settles on anvil` in
  `test/local-settler-guard.test.ts`. Jeder Fall zur Verweigerung war vor dem Fix rot; das Progress Log nennt, womit.
- Der Fall `sends on 8453 only under the setting 8453` in `test/konto-mainnet.test.ts` sendet heute `data: "0x"` und muss nach dem Fix
  eine erlaubte Sendeart schicken; Name und Erwartung (`eth_sendRawTransaction` auf 8453) bleiben.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Aufruf auf dem Server,
  kein Rollout außer dem normalen über `deploy.yml`.

## Done Condition
- [x] Auf 8453 verweigert `sendKontoTx` jede Sendeart außerhalb von Grundregel 10 vor der ersten Anfrage, auch `handleOps` und leere
      Daten, und sendet jede Art, die die Regel nennt; auf 84532 bleibt es wie heute.
      Prüfung: `pnpm -s vitest run test/konto-send-guard.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/konto-send-guard.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/refuses handleOps on 8453/,/refuses empty data on 8453/,/sends every kind of rule 10 on 8453/,/keeps 84532 unchanged/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `grep -c 'functionName: "handleOps"' src/konto/payout.ts` muss 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/konto-mainnet.test.ts test/konto-payout.test.ts test/konto-topup.test.ts test/konto-chain.test.ts` muss Exit-Code 0 haben.
- [x] `LocalSettler` settlet nur auf einem Knoten, der sich als Anvil meldet, und der Harness zahlt weiter.
      Prüfung: `pnpm -s vitest run test/local-settler-guard.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/local-settler-guard.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/refuses to settle on a node that is not anvil/,/settles on anvil/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `grep -c "web3_clientVersion" src/payments/settler.ts` muss mindestens 1 ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/regeln-01 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Fall zur Verweigerung war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Auf 84532 sendet `sendKontoTx` jede Transaktion wie auf `origin/dev`; kein Fall in `test/konto-*.test.ts` verliert eine
      Assertion.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`
- jede Datei außer `src/konto/chain.ts`, `src/payments/settler.ts`, `test/konto-send-guard.test.ts`,
  `test/local-settler-guard.test.ts`, `test/konto-mainnet.test.ts`, der Goal-Datei und `goals/regeln/ANNAHMEN.md`;
  `src/payments/settler.ts` nennt diese Datei ausdrücklich (`loop-constraints.md`, Deny List)
- `src/konto/payout.ts` und `src/konto/topup.ts`: die Sperre sitzt in `sendKontoTx`, nicht im Weg, der sendet
- jeder Aufruf auf dem Server, jedes Schreiben in der Produktion, jede Transaktion auf einem echten Netz
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-24 Zyklus 1: Punkte 1, 2, 3 gebaut: `requireRule10` in `sendKontoTx` sperrt auf 8453 alles außerhalb von Grundregel 10 (Selektoren aus den ABIs, Fehler nennt Ziel und Selektor), `LocalSettler` fragt vor dem ersten Senden `web3_clientVersion` und settlet nur bei `anvil/`; der Fall „sends on 8453 only under the setting 8453“ schickt `revokeAsSpender` statt `0x`. Rot vor dem Fix: `test/konto-send-guard.test.ts` am Stand c7d692a 3 failed | 2 passed (refuses handleOps, refuses empty data, refuses every other kind), `test/local-settler-guard.test.ts` am Stand 7f74820 2 failed (Gegenprobe des JSON-Prüfers dort: `fehlt`), der alte Fall in `test/konto-mainnet.test.ts` nach dem Fix rot mit `refused: rule 10 … selector none`. Prüfbefehle: konto-send-guard Exit 0, JSON `alle`, grep handleOps 1, konto-mainnet/payout/topup/chain Exit 0 (51 Tests mit send-guard), local-settler-guard Exit 0, JSON `alle`, grep web3_clientVersion 4, `e2e` an PR #430 `SUCCESS` (Kopf 9b1e833), `node scripts/check.mjs` Exit 0 (277 Dateien, 2854 Tests).
- 2026-11-24 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3; `origin/dev` (c7d692a) liegt schon im Branch, kein Merge nötig. Prüfbefehle: konto-send-guard Exit 0, JSON `alle`, grep handleOps 1, konto-mainnet/payout/topup/chain Exit 0, local-settler-guard Exit 0, JSON `alle`, grep web3_clientVersion 4, `e2e` an PR #430 `SUCCESS` (Kopf 94ee76f), `node scripts/check.mjs` Exit 0 (277 Dateien, 2854 Tests).

## Blockers
