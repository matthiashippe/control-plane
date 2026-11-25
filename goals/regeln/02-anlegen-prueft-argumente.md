# Regeln Goal 02: Auf 8453 prüft das Anlegen der Weiterleitung auch die Argumente

## Status
ACTIVE

## Active Objective
`requireRule10` (`src/konto/chain.ts:81`) lässt auf chainId 8453 das Anlegen über `DEPLOY_PROXY` zu, sobald die Daten mit
`FORWARDER_SALT` und `FORWARDER_BYTECODE` beginnen (`src/konto/chain.ts:88`). Die fünf Konstruktor-Argumente, die
`forwarderInitCode` (`src/konto/payout.ts:174`) anhängt (account, destination, token, manager, caller), prüft niemand, und Bytes
hinter dem Präfix in beliebiger Länge gehen mit durch. Nach diesem Goal verweigert `requireRule10` auf 8453 das Anlegen, wenn hinter
dem Präfix nicht genau fünf ABI-kodierte Adressen stehen, wenn token nicht `MAINNET_USDC`, manager nicht `SPEND_PERMISSION_MANAGER`
oder caller nicht die Adresse des sendenden Schlüssels ist; dafür bekommt die Prüfung diese Adresse. Auf Base Sepolia bleibt alles,
wie es ist.
Leitzahl: Argumente der Weiterleitung, die der Gas-Schlüssel auf 8453 frei wählen kann, Ziel 0 (heute 5 und die Länge).
Widerlegt, wenn `requireRule10` auf 8453 schon heute ein Anlegen mit fremdem caller ablehnt.
MVP: Funktion, weil der Gas-Schlüssel dann nur Weiterleitungen anlegt, die er selbst bedienen kann und die nur USDC über den Manager
bewegen.

## Voraussetzungen
- regeln Goal 01 DONE

## Kontext für den Maker
- Ziel: Auf Base legt der Gas-Schlüssel nur Weiterleitungen an, die genau das tun, was die Ausnahme Hauptnetz erlaubt: USDC des
  Kunden über den Spend Permission Manager an seine feste Auszahladresse, bedient nur von unserem eigenen Schlüssel.
- Quelle der Kette: `ROADMAP.md` Zeile 27, Topic `regeln`, Glied 02 (Tech Lead 25.11.2026, PRO-29721 aus der Triage PRO-29717,
  Kritik an regeln 01). Übernimmt `goals/_vorschlaege/regeln-kritik-2026-11-24-1.md`.
- Aufbau der Daten beim Anlegen (`src/konto/payout.ts:532`): `FORWARDER_SALT` (32 Bytes), `FORWARDER_BYTECODE`, dann fünf ABI-kodierte
  Adressen in der Reihenfolge account, destination, token, manager, caller (`forwarderInitCode`). Die Argumente liest der Code mit
  `decodeAbiParameters` aus den Bytes hinter dem Präfix, nie über feste Hex-Offsets im Text.
- Entscheidung Tech Lead (25.11.2026), über die ROADMAP-Zeile hinaus: Der Konstruktor des `PayoutForwarder` liest seine Argumente vom
  Ende des Init-Codes (`codesize` minus Länge der Argumente, Standard bei Solidity). Ein Prüfer, der nur die ersten fünf Wörter
  hinter dem Präfix dekodiert, ließe darum ein Anlegen durch, an das jemand fünf fremde Wörter anhängt: geprüft würden die eigenen
  Werte, gebaut die fremden. Deshalb muss die Länge hinter dem Präfix genau 160 Bytes sein; kürzer oder länger wird verweigert.
- Prüfwerte auf 8453: token gleich `MAINNET_USDC`, manager gleich `SPEND_PERMISSION_MANAGER`, caller gleich der Adresse des Kontos,
  das sendet (`params.account.address` in `sendKontoTx`), alles ohne Groß- und Kleinschreibung verglichen. account und destination
  bleiben frei, weil sie je Kunde verschieden sind und der Kunde die Erlaubnis für genau diese Adresse mit dem Passkey unterschreibt.
  `forwarderFixed` (`src/konto/payout.ts:169`) liefert in Produktion genau diese Werte (token aus `net.usdc`, caller aus
  `konto.spender`, das `src/konto/setup.ts:26` auf die Adresse des Schlüssels aus `CP_KONTO_KEY_FILE` setzt), also bleibt der
  normale Weg grün.
- Signatur: `requireRule10(chainId, tx, sender)` mit `sender: Address`; `sendKontoTx` reicht `params.account.address` durch. Andere
  Aufrufer von `requireRule10` gibt es heute nicht (`git grep -n requireRule10 -- src test`). Der Fehler nennt wie bisher Ziel und
  Selektor und dazu, welches Argument abweicht (`token`, `manager`, `caller` oder `length`), nie die Daten und nie den Wert.
- Auf 84532 prüft `sendKontoTx` weiter nur die Kette: kein Fall in `test/konto-send-guard.test.ts` „keeps 84532 unchanged“ verliert
  einen Eintrag. Der Harness zahlt auf `chain-konto` mit 84532 (`harness/docker-compose.yml:128`), `pnpm e2e` berührt die neue
  Prüfung also nicht.
- Tests ohne Netz und ohne festen Port mit dem nachgebauten Transport `node()` aus `test/konto-send-guard.test.ts`, in derselben
  Datei. Neue Testnamen: `refuses a forwarder deploy with a foreign token on 8453`, `refuses a forwarder deploy with a foreign manager
  on 8453`, `refuses a forwarder deploy with a foreign caller on 8453`, `refuses a forwarder deploy whose arguments are not exactly
  five addresses on 8453` (je ein Fall mit einem Wort weniger und mit fünf angehängten fremden Wörtern). Jeder Fall prüft, dass der
  Transport keine Anfrage sah. Jeder dieser Fälle war vor dem Fix rot; das Progress Log nennt Commit und Ausgabe. Der bestehende
  Fall `sends every kind of rule 10 on 8453, also with the target in mixed case` bleibt grün und sendet das Anlegen mit den Werten aus
  `forwarderFixed` des sendenden Kontos.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Aufruf auf dem Server,
  kein Rollout außer dem normalen über `deploy.yml`.

## Done Condition
- [x] Auf 8453 verweigert `sendKontoTx` das Anlegen einer Weiterleitung mit fremdem token, fremdem manager, fremdem caller oder einer
      Länge hinter dem Präfix ungleich fünf Adressen vor der ersten Anfrage, und sendet das Anlegen mit den eigenen Werten.
      Prüfung: `pnpm -s vitest run test/konto-send-guard.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/konto-send-guard.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/refuses a forwarder deploy with a foreign token on 8453/,/refuses a forwarder deploy with a foreign manager on 8453/,/refuses a forwarder deploy with a foreign caller on 8453/,/refuses a forwarder deploy whose arguments are not exactly five addresses on 8453/,/sends every kind of rule 10 on 8453/,/keeps 84532 unchanged/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `grep -c "decodeAbiParameters" src/konto/chain.ts` muss mindestens 1 ausgeben.
- [x] Die Wege, die heute auf 8453 und 84532 senden, bleiben grün.
      Prüfung: `pnpm -s vitest run test/konto-mainnet.test.ts test/konto-payout.test.ts test/konto-payout-guard.test.ts test/konto-forwarder.test.ts test/konto-topup.test.ts test/konto-chain.test.ts` muss Exit-Code 0 haben.
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
- jede Datei außer `src/konto/chain.ts`, `test/konto-send-guard.test.ts`, der Goal-Datei und `goals/regeln/ANNAHMEN.md`
- `src/konto/payout.ts`, `src/konto/topup.ts` und `src/konto/forwarder.ts`: die Sperre sitzt in `sendKontoTx`, nicht im Weg, der
  sendet, und der Bytecode der Weiterleitung bleibt
- jeder Aufruf auf dem Server, jedes Schreiben in der Produktion, jede Transaktion auf einem echten Netz
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-25 Zyklus 1: Punkte 1, 2, 3 gebaut: `requireRule10` bekommt die Adresse des sendenden Schlüssels und prüft beim Anlegen auf 8453 mit `decodeAbiParameters` genau fünf saubere Adressen hinter dem Präfix, token, manager und caller (Commit aa42958); die fünf neuen Verweigerungsfälle waren am Stand 5a279bb rot (`pnpm -s vitest run test/konto-send-guard.test.ts` -> 5 failed, 7 passed), der JSON-Prüfer gab dort `fehlt`. Prüfbefehle: `pnpm -s vitest run test/konto-send-guard.test.ts` Exit 0 (12 passed); JSON-Prüfer `alle`; `grep -c "decodeAbiParameters" src/konto/chain.ts` 2; die sechs Dateien aus Punkt 2 Exit 0 (55 passed); `node scripts/check.mjs` Exit 0 (2887 Tests).
- 2026-11-25 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3; `origin/dev` (5a279bb) ist im Branch enthalten, nichts hereinzuholen. Prüfbefehle: `pnpm -s vitest run test/konto-send-guard.test.ts` Exit 0 (12 passed); JSON-Prüfer `alle`; `grep -c "decodeAbiParameters" src/konto/chain.ts` 2; die sechs Dateien aus Punkt 2 Exit 0 (55 passed); `node scripts/check.mjs` Exit 0 (2887 Tests); am PR #444 Jobs `check` und `e2e` grün an e04b123 (Run 45603101109).

## Blockers
