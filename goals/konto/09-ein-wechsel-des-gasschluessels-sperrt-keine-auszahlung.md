# Konto Goal 09: Ein Wechsel des Gasschlüssels sperrt keine Auszahlung, und keine freigeschaltete alte Erlaubnis bleibt stehen

## Status
ACTIVE

## Active Objective
Ein Kunde, der Geld auf sein Bankkonto holt, bekommt es auch nach einem Wechsel unseres Gasschlüssels, und jede Erlaubnis, die er
abgelöst hat und die unser Schlüssel noch widerrufen kann, wird widerrufen. Heute gibt es zwei Fehler in `src/konto/payout.ts`
(beim Schreiben am 2026-11-17 am Code von `dev` 664866d gelesen):

1. `finishPayout` merkt die alte zweite Erlaubnis nur dann als `retire_*` vor, wenn `permission_approved` 1 ist. Bricht in
   `sendPayout` das Warten auf die Quittung von `approveWithSignature` ab, ist die Erlaubnis on-chain freigeschaltet, die Zeile bleibt
   aber auf 0; nach einer neuen IBAN verwirft `finishPayout` sie, und die alte Weiterleitung kann weiter an das alte Ziel zahlen.
2. Nach einem Wechsel des Gasschlüssels (`caller` der Weiterleitung, `src/konto/contracts/PayoutForwarder.sol`) antwortet jede
   Auszahlung `payout_needs_phone`, der Kunde legt auf dem Handy eine neue Erlaubnis an, `finishPayout` merkt die alte Weiterleitung
   zum Widerruf vor, und `sendPayout` schickt `retire` vor allem anderen (`src/konto/payout.ts:323`). `retire` verlangt
   `msg.sender == caller()` (`PayoutForwarder.sol:82`), mit dem neuen Schlüssel also `only the fixed caller`: Jede Auszahlung endet
   mit `PayoutFailed` in der Stufe `retire`, und das Konto zahlt nie wieder aus.

Danach merkt `finishPayout` jede alte Erlaubnis mit Weiterleitung als `retire_*` vor; `sendPayout` fragt vor dem `retire` mit
`isApproved`, ob es etwas zu widerrufen gibt, und liest `caller()` der alten Weiterleitung. Nicht freigeschaltet oder ein anderer
`caller` als der heutige Gasschlüssel heißt verwerfen ohne Transaktion, mit einer Log-Zeile, die die Weiterleitung nennt
(`ROADMAP.md`, konto 09; Grundsatz in `docs/kette.md`, Abschnitt konto).
Widerlegt, wenn `sendPayout` am Kopf von `dev` nach einem Schlüsselwechsel und einer neuen IBAN schon auszahlt (beim Schreiben am
Code geprüft: `retire` geht zuerst raus und scheitert am `caller`, danach wird nichts gesendet).
Übernimmt goals/_vorschlaege/konto-kritik-2026-11-17-1.md und goals/_vorschlaege/konto-kritik-2026-11-17-2.md.
MVP: Funktion, weil ein Schlüsselwechsel (Leck, neuer Server) sonst die Auszahlung jedes zahlenden Kontos dauerhaft sperrt und eine
abgelöste Erlaubnis nach einer abgebrochenen Quittung freigeschaltet bleibt.

## Voraussetzungen
- konto Goal 08 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer `payout` tippt, bekommt sein Geld auch nach einem Wechsel unseres Gasschlüssels nach einmal Handy, und keine
  abgelöste Erlaubnis, die wir widerrufen können, bleibt freigeschaltet.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte): zuerst die vier Fälle in `test/konto-payout.test.ts` und der
  nachgebaute Knoten in `test/money-helpers.ts` gegen den heutigen Stand (Punkt 2, drei Fälle rot), dann `src/konto/payout.ts`
  (Punkt 1), dann Doku (Punkt 3), Annahmen (Punkt 4), zuletzt Punkt 5. Je Punkt Commit und Push.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 09` in `goals/konto/ANNAHMEN.md`):
  1. `caller` bleibt ein fester Wert im Vertrag und wird keine änderbare Liste, weil eine Liste einen Verwalter braucht und genau der
     die Zusage bricht, dass selbst unser Schlüssel nur an das Ziel des Kunden zahlt. `PayoutForwarder.sol` und
     `src/konto/forwarder.ts` ändern sich nicht; jede Änderung daran verschöbe die Adresse jeder Weiterleitung.
  2. `finishPayout`: Steht schon ein `retire_*`, bleibt es, und die Erlaubnis davor wird verworfen; sonst wird jede alte Erlaubnis mit
     Weiterleitung (`before.permission` und `before.forwarder` gesetzt) zu `retire_*`, egal was `permission_approved` sagt. Grund für
     den ersten Fall: `sendPayout` sendet `approveWithSignature` erst nach einem gelungenen `retire`, eine Erlaubnis hinter einem
     wartenden `retire_*` war also nie on-chain. Ohne diese Regel überschriebe eine zweite neue IBAN vor der nächsten Auszahlung das
     wartende `retire_*` einer freigeschalteten Erlaubnis (Fall 4 in Punkt 2 hält das fest).
  3. `PayoutChain` bekommt genau eine neue Methode `callerOf(forwarder: Address): Promise<Address>`, in `createPayoutChain` ein
     `readContract` von `caller` aus `FORWARDER_ABI`. Der Wrapper in `test/konto-payout-pending.test.ts` reicht sie durch.
  4. In `sendPayout` wird der Block mit `retire` zu: `isApproved(alte Erlaubnis)` falsch heißt verwerfen mit Grund `not_approved`;
     sonst `callerOf(alte Weiterleitung)` ungleich `deps.fixed.caller` (ohne Groß- und Kleinschreibung) heißt verwerfen mit Grund
     `other_caller`; sonst `retire` wie heute. Verwerfen setzt `retire_forwarder` und `retire_permission` auf `NULL` und schreibt über
     `deps.log` genau eine Zeile `` `[payout] retire skipped for ${forwarder}: ${reason}` `` mit der Adresse der alten Weiterleitung in
     Kleinbuchstaben. Wirft `isApproved` oder `callerOf`, endet die Auszahlung mit `PayoutFailed("retire", null)`, und `retire_*` bleibt
     für den nächsten Versuch. Ein `retire`, dessen Quittung abbrach, findet beim nächsten Versuch `isApproved` falsch und wird
     verworfen; das ist gewollt.
  5. Der nachgebaute Knoten `payoutNode` in `test/money-helpers.ts` verhält sich wie der Vertrag: Er merkt sich je angelegter
     Weiterleitung das fünfte Argument des Konstruktors als `caller`, beantwortet ein `eth_call` von `caller()` an eine Weiterleitung
     mit Code mit dieser Adresse und lässt `retire` und `payout` scheitern (Quittung `0x0`), wenn der Absender der Transaktion
     (`recoverTransactionAddress`) nicht dieser `caller` ist. `test/money-helpers.ts` importiert dafür nichts aus `src/`, was es am Kopf
     von `dev` noch nicht gibt, weil Punkt 2 ihn gegen die Merge-Basis fährt. Für den Schlüsselwechsel bekommt `moneySetup` eine
     zweite App mit neuem Gasschlüssel auf derselben Datenbank, demselben Knoten, derselben Bridge und derselben Wallet-Kette; die Form
     wählt der Maker.
  6. Die vier neuen Fälle stehen in genau einem `describe("after a new gas key or a lost receipt", …)` in `test/konto-payout.test.ts`,
     je Erlaubnis mit eigenem `salt`:
     Fall 1: Die Quittung von `approveWithSignature` wirft (die Freigabe ging on-chain durch), neue IBAN, die nächste Auszahlung sendet
     zuerst `retire` an die alte Weiterleitung, dann `deploy`, `approveWithSignature` und `payout` über die neue.
     Fall 2: Erste Auszahlung mit Schlüssel A, Wechsel auf Schlüssel B, `POST /v1/konto/payout` antwortet 409 `payout_needs_phone`,
     neue IBAN über den Handoff mit B, die nächste Auszahlung sendet kein `retire`, zahlt über die neue Weiterleitung aus, und das Log
     hat die Zeile mit der alten Weiterleitung und `other_caller`.
     Fall 3: `approveWithSignature` erreicht den Knoten nie (`send` wirft), neue IBAN, die nächste Auszahlung sendet kein `retire`, und
     das Log hat die Zeile mit der alten Weiterleitung und `not_approved`.
     Fall 4 (Wächter, grün vor und nach dem Fix): erste Auszahlung über IBAN 1, neue IBAN 2 ohne Auszahlung, neue IBAN 3, die nächste
     Auszahlung sendet `retire` an die Weiterleitung von IBAN 1 und zahlt über die von IBAN 3.
     Die Fälle importieren aus `src/` nur, was es am Kopf von `dev` schon gibt.
- Die Doku beschreibt, was der Code tut, ohne neues Verhalten in `mcp/`: Das Tool `payout` öffnet bei 409 `payout_needs_phone` schon
  heute den Handoff mit QR-Code, und `automaton_status` zeigt unter `payout` den Stand mit Link und Zahl; eine fällige Regel aus
  `set_payout_rule` zahlt bis dahin nichts und schreibt `payout_needs_phone` ins Log.
- Kein Netz, kein fester Port: alle Fälle laufen gegen den nachgebauten Knoten, nie gegen Base Sepolia oder das Hauptnetz. Node 22
  vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen.
- Rollout: `src/**` rollt mit dem nächsten fälligen Deploy aus, der Merge bekommt den üblichen Release-Auftrag. Eine Live-Prüfung
  über `check` hinaus gibt es nicht, weil kein Gasschlüssel gewechselt wird.
- Nicht in diesem Goal: ein Werkzeug, das einen Schlüsselwechsel auslöst oder alle Konten anschreibt, eine Änderung an Vertrag,
  Bytecode oder Tabelle `konto_payouts`, und der Widerruf einer alten Erlaubnis durch den Passkey des Kunden (das bleibt sein Weg).
- Was danach kommt: konto 10 (was das Terminal ans Konto schickt, wird streng gelesen).

## Done Condition
- [x] `finishPayout` merkt jede alte Erlaubnis mit Weiterleitung zum Widerruf vor, und `sendPayout` verwirft vor dem `retire` ohne
      Transaktion, was nicht freigeschaltet ist oder einen anderen `caller` hat, mit einer Log-Zeile.
      MVP: Funktion, weil nach einem Schlüsselwechsel sonst kein Konto mehr auszahlt und eine abgelöste Erlaubnis nach einer
      abgebrochenen Quittung freigeschaltet bleibt (Vorschläge konto-kritik-2026-11-17-1 und -2).
      Prüfung: `awk '/^export function finishPayout/,/^}/' src/konto/payout.ts | grep -c 'before.permission_approved'` muss genau `0` ausgeben.
      Prüfung: `awk '/^export async function sendPayout/,/^}/' src/konto/payout.ts | grep -cE 'callerOf\(|isApproved\('` muss mindestens `3` ausgeben.
      Prüfung: `grep -c 'retire skipped for' src/konto/payout.ts` muss mindestens `1` ausgeben.
      Prüfung: `grep -cE 'callerOf\(forwarder: Address\): Promise<Address>' src/konto/payout.ts` muss genau `1` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts test/konto-payout-pending.test.ts test/konto-payout-guard.test.ts` muss Exit-Code 0 haben.
- [x] Vier Fälle in `test/konto-payout.test.ts` decken abgebrochene Quittung, anderen `caller`, nie freigeschaltete Erlaubnis und ein
      wartendes `retire_*` ab; gegen den Stand der Merge-Basis sind genau die ersten drei rot.
      MVP: Funktion, weil erst der rote Lauf am alten Code zeigt, dass die Fälle den Fehler treffen, und der Wächter die Regel für ein
      wartendes `retire_*` festhält.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("after a new gas key or a lost receipt"));console.log(a.length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `exit=0` und `4 4` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp test/konto-payout.test.ts test/money-helpers.ts $T/test/; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("after a new gas key or a lost receipt"));console.log(a.filter(x=>x.status!=="passed").length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `3 1` ausgeben.
- [x] `docs/konto/euro.md` hat einen Abschnitt `## Wechsel des Gasschlüssels` mit dem Ablauf für Kunde und Betrieb.
      MVP: Funktion, weil wer den Schlüssel wechselt, wissen muss, dass jedes Konto einmal aufs Handy muss und was mit den alten
      Erlaubnissen geschieht.
      Prüfung: `grep -c '^## Wechsel des Gasschlüssels$' docs/konto/euro.md` muss genau `1` ausgeben.
      Prüfung: `awk '/^## Wechsel des Gasschlüssels$/{f=1;next} /^## /{f=0} f' docs/konto/euro.md | grep -oE 'payout_needs_phone|automaton_status|Passkey|Bridge|not_approved|other_caller|isApproved' | sort -u | wc -l` muss genau `7` ausgeben.
- [x] Die Entscheidungen stehen mit Grund in `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil die Linsen und die nächsten Goals der Kette gegen diese Annahmen prüfen.
      Prüfung: `awk '/^## Goal 09/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens `4` ausgeben.
      Prüfung: `awk '/^## Goal 09/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE 'caller.+Liste.+Verwalter'` muss mindestens `1` ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, Vertrag und Bytecode bleiben gleich, kein Test wird schwächer, kein neues Paket,
      kein Schlüssel im Diff, keine andere Goal-Datei geändert, und `check` ist grün.
      MVP: Funktion, weil `src/**` mit dem Merge ausrollt und eine Änderung am Vertrag jede Weiterleitung jedes Kunden verschöbe.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/konto/payout\.ts|test/(konto-payout|konto-payout-pending|konto-payout-guard)\.test\.ts|test/money-helpers\.ts|docs/konto/euro\.md|goals/konto/09-ein-wechsel-des-gasschluessels-sperrt-keine-auszahlung\.md|goals/konto/verdicts/09-[A-Za-z0-9._-]+\.md|goals/konto/ANNAHMEN\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- src/konto/contracts src/konto/forwarder.ts && echo vertrag gleich` muss `vertrag gleich` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- package.json pnpm-lock.yaml && echo pakete gleich` muss `pakete gleich` ausgeben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' ':!goals/konto/09-ein-wechsel-des-gasschluessels-sperrt-keine-auszahlung.md' && echo goals gleich` muss `goals gleich` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-09 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [x] Ein Lesefehler vor dem `retire` (`isApproved` der alten Erlaubnis oder `callerOf` der alten Weiterleitung wirft) beendet die
      Auszahlung mit 502 `payout_failed` in der Stufe `retire`, sendet keine Transaktion und lässt `retire_*` stehen; geht das Lesen
      wieder, sendet die nächste Auszahlung zuerst `retire` an die alte Weiterleitung, dann `deploy`, `approveWithSignature` und
      `payout` über die neue. Zwei Fälle (einer je Lesezugriff) in genau einem `describe("when the chain cannot be read before the retire", …)`
      in `test/konto-payout.test.ts`, erste Auszahlung über IBAN 1, neue IBAN 2, dann der Lesefehler; den Fehler wirft ein Wrapper um
      die Kette nur für die alte Erlaubnis oder Weiterleitung (Form wählt der Maker, etwa wie `lossySetup`). `src/` ändert sich dafür nicht.
      MVP: Funktion, weil Entscheidung 4 die abgelöste Erlaubnis bei einem Lesefehler stehen lässt, kein Fall das festhält und ein
      `catch`, das statt abzubrechen verwirft, alle vier Fälle grün ließe, während eine freigeschaltete alte Erlaubnis stehen bliebe
      (Kritik Tech Lead 2026-11-17).
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("when the chain cannot be read before the retire"));console.log(a.length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `exit=0` und `2 2` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; n=$(grep -c 'throw new PayoutFailed("retire", null);' $T/src/konto/payout.ts); sed -i 's/throw new PayoutFailed("retire", null);/skip = "not_approved";/' $T/src/konto/payout.ts; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); echo "$n $(node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("when the chain cannot be read before the retire"));console.log(a.filter(x=>x.status!=="passed").length)' $T/r.json)"` muss genau `1 2` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Nach einem Wechsel des Gasschlüssels zahlt ein Konto nach einmal Handy wieder aus, ohne an der alten Weiterleitung zu scheitern.
- [ ] Eine abgelöste Erlaubnis, die freigeschaltet ist und unseren heutigen Schlüssel als `caller` hat, wird vor der nächsten
      Auszahlung widerrufen, auch wenn die Quittung der Freigabe nie ankam.
- [ ] Vertrag, Bytecode und Adressen der Weiterleitungen bleiben unverändert.
- [ ] Kein Gedankenstrich, kein deutscher Bezeichner im Code.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.key`, `*.pem`
- `src/**` außer `src/konto/payout.ts`, insbesondere `src/konto/contracts/**`, `src/konto/forwarder.ts`, `src/db.ts` und jede
  Migration; `mcp/**`, `ops/**`, `docs/**` außer `docs/konto/euro.md`
- jede Änderung an Vertrag, Bytecode, Salt, Konstruktor oder Tabelle `konto_payouts`
- jede Transaktion, jeder Aufruf bei Turnkey, Bridge oder einem RPC, jeder Lauf von `ops/konto/*.mjs`
- `ROADMAP.md`, `docs/kette.md`, alle Goal-Dateien außer dieser (eingefroren), jede Zeile einer `ANNAHMEN.md` außer `## Goal 09`
- ein neues Paket, ein Test, der gestrichen, übersprungen oder schwächer wird
- ein API-Schlüssel, ein privater Schlüssel, ein Testschlüssel als Literal, eine IBAN außer `EXAMPLE_IBAN` oder ein Name eines Kunden
  in Repo, Log, Ausgabe, Kommentar oder Fixture
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

- 2026-11-17 Zyklus 1: Punkte 1 bis 5 gebaut, `finishPayout` merkt jede alte Erlaubnis mit Weiterleitung vor, `sendPayout` verwirft vor dem `retire` mit `isApproved` und `callerOf` ohne Transaktion, Knoten mit `caller` und `withNewGasKey` im Test, Doku und Annahmen. Prüfbefehle: Punkt 1 `0`, `3`, `1`, `1`, vitest Exit 0 (26 Tests); Punkt 2 `exit=0` und `4 4`, gegen die Merge-Basis `3 1`; Punkt 3 `1`, `7`; Punkt 4 `8`, `1`; Punkt 5 `0`, `vertrag gleich`, `0`, `pakete gleich`, `goals gleich`, `0`, `check` Exit 0 (219 Dateien, 2347 Tests), Netz-Prüfung am PR nach dem Lauf des Jobs `check`.
- 2026-11-17 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5; `dev` ist im Branch (Merge-Basis gleich `origin/dev` `d493086`, kein Merge nötig), alle Prüfbefehle am Kopf `185af3b` neu gelaufen. Prüfbefehle: Punkt 1 `0`, `3`, `1`, `1`, vitest Exit 0 (26 passed); Punkt 2 `exit=0` und `4 4`, gegen die Merge-Basis `3 1`; Punkt 3 `1`, `7`; Punkt 4 `8`, `1`; Punkt 5 `0`, `vertrag gleich`, `0`, `pakete gleich`, `goals gleich`, `0`, `node scripts/check.mjs` Exit 0 (grün in 231 s, 2347 Tests), am PR #261 `check` pass und `e2e` pass am Kopf `185af3b`.
- 2026-11-17 Zyklus 3: Punkt 6 aus der Kritik gebaut, zwei Fälle in `describe("when the chain cannot be read before the retire")` mit einem Wrapper, der `isApproved` der alten Erlaubnis oder `callerOf` der alten Weiterleitung werfen lässt (502 `retire`, keine Transaktion, `retire_*` bleibt, danach `retire`, `deploy`, `approveWithSignature`, `payout`), `src/` unverändert; Abschluss gemeldet, Punkte 1 bis 6, `dev` ist im Branch. Prüfbefehle am Kopf `990831e`: Punkt 6 `exit=0` und `2 2`, Mutation `1 2` (beide Fälle rot mit `expected 200 to be 502`); Punkt 1 `0`, `3`, `1`, `1`, vitest Exit 0 (28 passed); Punkt 2 `exit=0` und `4 4`, gegen die Merge-Basis `3 1`; Punkt 3 `1`, `7`; Punkt 4 `8`, `1`; Punkt 5 `0`, `vertrag gleich`, `0`, `pakete gleich`, `goals gleich`, `0`, `node scripts/check.mjs` Exit 0 (grün in 92 s, 2349 Tests), Netz-Prüfung am PR #261 nach dem Lauf des Jobs `check`.
- 2026-11-17 Zyklus 4: Gap aus dem Verdict K Zyklus 3 behoben, Fall 2 und Fall 3 von „after a new gas key or a lost receipt“ halten nach der Auszahlung fest, dass `retire_*` leer ist, Fall 2 dazu mit dritter IBAN (salt 101) und `retire` an die Weiterleitung mit salt 100; mit der Mutation `if (!skip)` vor dem Leeren beide Fälle rot (`expected { …(2) } to deeply equal { retire_forwarder: null, …(1) }`), `src/` unverändert, Abschluss gemeldet, Punkte 1 bis 6. Prüfbefehle am Kopf `ca53d65`: Punkt 6 `exit=0` und `2 2`, Mutation `1 2`; Punkt 1 `0`, `3`, `1`, `1`, vitest Exit 0 (28 passed); Punkt 2 `exit=0` und `4 4`, gegen die Merge-Basis `3 1`; Punkt 3 `1`, `7`; Punkt 4 `8`, `1`; Punkt 5 `0`, `vertrag gleich`, `0`, `pakete gleich`, `goals gleich`, `0`, `node scripts/check.mjs` Exit 0 (grün in 58 s, 2349 Tests), Netz-Prüfung am PR #261 nach dem Lauf des Jobs `check`.

## Blockers
