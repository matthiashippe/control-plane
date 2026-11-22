# Konto Goal 16: Ausgezahlt wird erst nach der Freigabe für SEPA

## Status
ACTIVE

## Active Objective
Ein Kunde gibt seine IBAN erst ein, wenn Bridge ihm per SEPA auszahlen darf. Heute (beim Schreiben am 2026-11-22 am Code von `dev`
8b4d123 gelesen):

1. Die Entscheidung in `docs/konto/euro.md`, Abschnitt `## Entscheidung`, Zeile „Auszahlung:“, verlangt vor der Auszahlung
   `kyc_status` `approved` und Endorsement `sepa` `approved` aus `GET /v0/customers/{customerID}`.
2. `payoutStep` in `src/handoff/routes.ts` prüft nur `kycStatus` aus `getKycLink` oder `createKycLink`, merkt sich das als
   `kyc_approved` in `konto_payouts` und zeigt danach immer `payout-bank`; `POST /h/{code}/payout-bank` legt bei `kyc_approved` sofort
   `external_account` und `liquidation_address` bei Bridge an.
3. `getCustomer` in `src/konto/bridge.ts` liest `endorsements` schon, hat aber außer `test/konto-bridge.test.ts` keinen Aufrufer
   (`git grep -c getCustomer origin/dev -- src/handoff` gibt nichts aus, Exit 1).

Danach fragt `payoutStep` nach bestandener Identitätsprüfung `getCustomer` und geht erst bei Endorsement `sepa` `approved` zu
`payout-bank` weiter; bis dahin bleibt die Seite im bestehenden Zustand `payout-verify`, und auch ein direkter `POST` an
`/h/{code}/payout-bank` legt ohne diese Freigabe nichts bei Bridge an. Ein Fehler bei Bridge antwortet wie heute mit 502.
Widerlegt, wenn `git grep -c getCustomer -- src/handoff` am Kopf von `dev` schon eine Stelle zählt; dann prüft das schon jemand, und
dieses Goal schreibt nur den Test.
Übernimmt goals/_vorschlaege/konto-nacharbeit-2026-11-18-2.md (erste Empfehlung: prüfen statt die Funktion zu streichen).
MVP: Funktion, weil sonst ein Kunde mit bestandener Identitätsprüfung, aber ohne Freigabe für SEPA seine IBAN eingibt und eine
Auszahlung an eine Adresse geht, von der Bridge nicht in Euro auszahlen darf.

## Voraussetzungen
- konto Goal 13 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Kunde gibt seine IBAN erst ein, wenn Bridge ihm per SEPA auszahlen darf, und keine Auszahlung landet bei
  einem Kunden ohne Freigabe.
- Quelle der Kette: `ROADMAP.md`, Topic `konto`, Glied 16. konto 15 (Human Gate zum Einschalten in der Produktion) ist keine
  Voraussetzung: konto 16 ändert nur Code, den konto 05 bis 13 gebaut haben, und konto 15 lässt `CP_BRIDGE_*` leer, bis dieses Goal
  gemergt ist. Deshalb steht unter `## Voraussetzungen` das letzte Goal, das `src/handoff/routes.ts` an dieser Stelle geändert hat.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte): zuerst der nachgebaute Bridge (Punkt 3) und die vier neuen Fälle
  (Punkt 2) gegen den heutigen Stand, Fälle 1, 2 und 4 rot; dann der Fix (Punkt 1), danach Punkt 4, Punkt 5 und zuletzt Punkt 6. Je
  Punkt Commit und Push.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 16` in `goals/konto/ANNAHMEN.md`):
  1. Ein reiner Helfer `sepaApproved(customer: BridgeCustomer): boolean` in `src/handoff/routes.ts` gibt nur dann `true`, wenn ein
     Eintrag in `customer.endorsements` den `name` `sepa` und den `status` `approved` trägt; fehlt der Eintrag oder steht dort
     `incomplete`, `revoked` oder etwas anderes, `false`. Er liegt in der Route und nicht in `src/konto/bridge.ts`, weil der Client
     von Bridge nur abbildet, was Bridge meldet, und die Regel zur Auszahlung gehört.
  2. Keine neue Spalte und keine Migration: `payoutStep` fragt `bridge.getCustomer(payout.bridge_customer_id)` bei jedem Aufruf ohne
     wartende Bankdaten, sobald `kyc_approved` gilt (gleich ob schon gespeichert oder in diesem Aufruf gesetzt; die Zeile danach neu
     lesen). Grund: Bridge kann ein Endorsement auch wieder entziehen (`revoked`), und der Schritt läuft nur, solange ein Mensch die
     Seite offen hat, also ein Aufruf je Seitenaufruf. `kyc_approved` bleibt, wie es ist.
  3. Gilt `sepaApproved` nicht oder fehlt `bridge_customer_id`, zeigt `payoutStep` `payout-verify` mit dem Link zur Prüfung bei
     Bridge: dem Link aus diesem Aufruf, sonst aus `bridge.getKycLink(payout.kyc_link_id)`; `showedVerify.set(h.code, nowMs())` wie
     heute. Kein neuer Zustand, kein neuer Text, weil Bridge auf derselben Seite auch die Freigabe für SEPA einholt und die SOLL-Bilder
     von `payout-verify` weiter gelten.
  4. `POST /h/{code}/payout-bank` fragt vor `createExternalAccount` ebenfalls `bridge.getCustomer` und gibt ohne `sepaApproved`
     `return payoutStep(c, h)` zurück, ohne `createExternalAccount` oder `createLiquidationAddress` zu rufen. Grund: Die Seite allein
     schützt nicht, ein Formular aus einem älteren Seitenstand oder ein direkter `POST` käme sonst durch.
  5. Ein `BridgeError` aus `getCustomer` antwortet in beiden Routen mit 502 und dem heutigen Satz von `payoutStep` („Bridge could not
     be reached just now. Reload this page in a minute.“); jeder andere Fehler wird wie heute weitergeworfen.
  6. Der Zweig mit wartenden Bankdaten (`payout-passkey`), `finishPayout`, `sendPayout`, der Auszahl-Lauf, `POST /v1/konto/payout`
     und `mcp/**` bleiben unverändert: Bankdaten entstehen nach diesem Goal nur noch mit Freigabe, und in der Produktion gibt es
     keinen Kunden mit Bankdaten von vorher, weil `CP_BRIDGE_*` dort leer ist (konto 15).
- `bridgeFake` in `test/money-helpers.ts` bekommt in `state` die Felder `sepaStatus` (Vorgabe `"approved"`, damit alle heutigen
  Fälle unverändert grün bleiben) und `customerFails` (Vorgabe `false`) und beantwortet `GET /v0/customers/cus_1` mit
  `{ id: "cus_1", status: "active", endorsements: [{ name: "sepa", status: state.sepaStatus }] }`, bei `customerFails` mit 500.
- In `test/konto-payout.test.ts` kommt genau ein neuer `describe("the payout waits for the SEPA approval of Bridge", …)` mit vier
  Fällen über die echte Route (`moneySetup` und die Helfer aus `test/money-helpers.ts`), der aus `src/` nur importiert, was es an der
  Merge-Basis schon gibt, weil Punkt 2 ihn gegen die Merge-Basis fährt:
  Fall 1 `it("stays on payout-verify while Bridge has not approved SEPA", …)`: `kycStatus` `approved`, `sepaStatus` `incomplete`;
  `/h/{code}` und `POST /h/{code}/payout-verify` zeigen `data-soll="verify"` mit dem Link von Bridge, nie `data-soll="bank"`, und
  mindestens ein `GET /v0/customers/cus_1` steht in `calls`.
  Fall 2 `it("makes no bank account at Bridge while SEPA is not approved", …)`: wie Fall 1, dann `POST /h/{code}/payout-bank` mit
  `EXAMPLE_IBAN` und Namen; die Antwort zeigt `data-soll="verify"`, in `calls` steht kein `POST` auf `external_accounts` oder
  `liquidation_addresses`, und `payout_handoffs` hat keine Zeile für den Code.
  Fall 3 `it("moves on to the bank step once KYC and SEPA are approved", …)`: erst `sepaStatus` `incomplete` (Seite `verify`), dann
  `approved`; `/h/{code}` zeigt `data-soll="bank"` mit dem Feld `iban`. Wächter, grün davor und danach.
  Fall 4 `it("answers 502 when Bridge cannot report the customer", …)`: `kycStatus` `approved`, `customerFails` `true`; `/h/{code}`
  antwortet 502, und `POST /h/{code}/payout-bank` antwortet 502 ohne `POST` auf `external_accounts`.
- `docs/konto/euro.md`, Absatz „Der Weg: Das MCP-Tool `payout` …“: ein Satz, dass die Seite auf `payout-verify` bleibt, bis
  `getCustomer` neben `kyc_status` `approved` auch Endorsement `sepa` `approved` meldet, und dass `POST /h/{code}/payout-bank` das
  vor dem Anlegen bei Bridge noch einmal fragt. Sonst nichts in `docs/`.
- Kein Netz, kein fester Port. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check`, vitest und die SOLL-Werkzeuge im Vordergrund
  mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen.
- Rollout: `src/**` rollt mit dem nächsten fälligen Deploy aus, der Merge bekommt den üblichen Release-Auftrag. In der Produktion
  ändert sich nichts Sichtbares, solange `CP_BRIDGE_*` leer ist; die Route antwortet dann wie heute 503.
- Nicht in diesem Goal: der Ersatzweg über `POST /v0/customers` und `GET /v0/customers/{customerID}/kyc_link?endorsement=sepa`,
  `drains` (der zweite Teil des Vorschlags), `src/konto/bridge.ts`, `src/db.ts`, jede Seite und jedes SOLL-Bild.

## Done Condition
- [x] `payoutStep` und `POST /h/{code}/payout-bank` fragen nach bestandener Identitätsprüfung `getCustomer` und gehen erst bei
      Endorsement `sepa` `approved` zur IBAN weiter; ein Fehler bei Bridge antwortet mit 502.
      MVP: Funktion, weil an dieser Stelle die Widerlegung hängt: Ohne Freigabe für SEPA darf keine IBAN bei Bridge landen.
      Prüfung: `grep -c 'bridge.getCustomer(' src/handoff/routes.ts` muss mindestens `2` ausgeben.
      Prüfung: `awk '/app\.post\("\/h\/:code\/payout-bank"/{f=1} f{print} f&&/^  \}\);/{exit}' src/handoff/routes.ts | grep -c 'getCustomer'` muss mindestens `1` ausgeben.
      Prüfung: `grep -cE 'function sepaApproved|const sepaApproved' src/handoff/routes.ts` muss genau `1` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts test/konto-payout-guard.test.ts test/konto-payout-pending.test.ts test/konto-payout-rule.test.ts test/konto-revoke-replaced.test.ts test/konto-bridge.test.ts test/handoff-api.test.ts` muss Exit-Code 0 haben.
- [x] Vier Fälle in `test/konto-payout.test.ts` zeigen, dass ohne Freigabe für SEPA die Seite auf `payout-verify` bleibt und nichts
      bei Bridge angelegt wird, mit Freigabe `payout-bank` folgt und ein Fehler bei Bridge 502 ist; gegen den Stand der Merge-Basis
      sind die Fälle 1, 2 und 4 rot und Fall 3 grün.
      MVP: Funktion, weil erst der rote Lauf am alten Code belegt, dass die Fälle die Lücke treffen.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("the payout waits for the SEPA approval of Bridge"));console.log(a.length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `exit=0` und `4 4` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp test/konto-payout.test.ts test/money-helpers.ts $T/test/; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("the payout waits for the SEPA approval of Bridge"));console.log(a.filter(x=>x.status!=="passed").length, a.filter(x=>x.status==="passed").length, a.find(x=>x.title.startsWith("moves on to the bank step"))?.status)' $T/r.json` muss genau `3 1 passed` ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("test/konto-payout.test.ts","utf8");const miss=["sepaStatus","customerFails","/v0/customers/cus_1","external_accounts","payout_handoffs","EXAMPLE_IBAN","502"].filter(x=>!s.includes(x));if(miss.length){console.error(miss);process.exit(1)}console.log("faelle ok")'` muss `faelle ok` ausgeben.
- [x] Der nachgebaute Bridge kennt `GET /v0/customers/cus_1` mit Endorsement `sepa`, Vorgabe `approved`, und kann scheitern.
      MVP: Funktion, weil die heutigen Fälle sonst an einer 404 des nachgebauten Bridge scheitern und die neuen nichts zeigen.
      Prüfung: `awk '/^export function bridgeFake/{f=1} f{print} f&&/^}/{exit}' test/money-helpers.ts | grep -cE 'sepaStatus: "approved"|customerFails: false'` muss genau `2` ausgeben.
      Prüfung: `awk '/^export function bridgeFake/{f=1} f{print} f&&/^}/{exit}' test/money-helpers.ts | grep -c 'endorsements'` muss mindestens `1` ausgeben.
- [ ] Seite und SOLL-Bilder bleiben gleich: Die echten Seiten der Auszahlung sind pixelgleich mit den Bildern, und weder Bilder,
      Seiten noch SOLL-Werkzeuge ändern sich.
      MVP: Funktion, weil der Kunde nur später zur IBAN kommt und keine neue Fläche sieht.
      Prüfung: `git diff --quiet origin/dev...HEAD -- docs/soll 'ops/soll*.mjs' src/public && echo bilder gleich` muss `bilder gleich` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live-money.mjs --out $T >/dev/null && PATH=/usr/bin:$PATH node ops/soll-money.mjs --check --source $T > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll money: 16 images, blocks end 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
- [x] Die Entscheidungen stehen mit Grund in `goals/konto/ANNAHMEN.md`, und `docs/konto/euro.md` beschreibt die Prüfung.
      MVP: Funktion, weil konto 15 die Werte `CP_BRIDGE_*` erst nach diesem Goal setzt und wissen muss, was vor der Auszahlung
      geprüft wird.
      Prüfung: `awk '/^## Goal 16/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens `4` ausgeben.
      Prüfung: `awk '/^## Goal 16/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE 'getCustomer|sepaApproved'` muss mindestens `2` ausgeben.
      Prüfung: `grep -c 'getCustomer' docs/konto/euro.md` muss mindestens `1` ausgeben.
      Prüfung: `git diff --numstat origin/dev...HEAD -- docs | awk '{n++} END{print n+0}'` muss genau `1` ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, Client von Bridge, Datenbank, Auszahl-Lauf und Schnittstelle bleiben gleich,
      kein Test wird schwächer, kein neues Paket, kein Schlüssel im Diff, keine andere Goal-Datei geändert, und `check` ist grün.
      MVP: Funktion, weil `src/**` mit dem Merge ausrollt und zahlende Kunden den Stand tragen.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/handoff/routes\.ts|docs/konto/euro\.md|test/(konto-payout\.test|money-helpers)\.ts|goals/konto/16-ausgezahlt-wird-erst-nach-der-freigabe-fuer-sepa\.md|goals/konto/verdicts/16-[A-Za-z0-9._-]+\.md|goals/konto/ANNAHMEN\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- src/konto src/db.ts src/app.ts src/public mcp ops harness && echo schnittstelle gleich` muss `schnittstelle gleich` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- package.json pnpm-lock.yaml && echo pakete gleich` muss `pakete gleich` ausgeben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' ':!goals/konto/16-ausgezahlt-wird-erst-nach-der-freigabe-fuer-sepa.md' && echo goals gleich` muss `goals gleich` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-16 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ohne Endorsement `sepa` `approved` sieht der Kunde `payout-verify`, und bei Bridge entsteht weder Bankkonto noch Auszahladresse,
      auch nicht über einen direkten `POST`.
- [ ] Mit KYC und SEPA `approved` geht die Seite wie heute zur IBAN, und die zweite Einrichtung samt Widerruf läuft unverändert.
- [ ] Keine Seite, kein SOLL-Bild und keine Tabelle ändert sich.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.key`, `*.pem`, `*.db`
- `src/**` außer `src/handoff/routes.ts` (nur `payoutStep`, `POST /h/{code}/payout-bank` und der Helfer `sepaApproved`); insbesondere
  `src/konto/**`, `src/db.ts`, `src/app.ts`, `src/public/**`
- `mcp/**`, `ops/**`, jedes Bild unter `docs/soll/`, `docs/**` außer dem Absatz „Der Weg“ in `docs/konto/euro.md`
- jede Transaktion auf einer echten Kette, jeder Aufruf bei Turnkey, Bridge oder einem RPC, jeder Lauf von `ops/konto/*.mjs`, jeder
  Aufruf auf dem Server
- `ROADMAP.md`, `docs/kette.md`, alle Goal-Dateien außer dieser, jede Zeile einer `ANNAHMEN.md` außer `## Goal 16`
- ein neues Paket, ein Test, der gestrichen, übersprungen oder schwächer wird
- ein API-Schlüssel, ein privater Schlüssel, ein Testschlüssel als Literal, eine IBAN außer `EXAMPLE_IBAN` oder ein Name eines Kunden
  in Repo, Log, Ausgabe, Kommentar oder Fixture
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-22 Zyklus 1: Punkte 1, 2, 3, 5 und 6 gebaut (getCustomer und sepaApproved in payoutStep und POST payout-bank, Bridge-Nachbau mit Kunde, vier Fälle, Annahmen, Doku), Punkt 4 offen, weil ops/soll-live-money.mjs (Deny List) einen eigenen Bridge-Nachbau ohne GET /v0/customers/cus_1 hat und payout-bank dort 502 wird (Vorschlag konto-nacharbeit-2026-11-22-1). Prüfbefehle: P1 2, 1, 1, vitest 7 Dateien 63 Tests Exit 0; P2 exit=0 und 4 4, Merge-Basis 3 1 passed, faelle ok; P3 2, 1; P4 bilder gleich, soll-live-money exit=2 (payout-bank answered 502) und 0, in einer Wegwerfkopie mit der Route exit=0 und 16 images 0 defects; P5 9, 5, 1, 1; P6 0, schnittstelle gleich, 0, pakete gleich, goals gleich, 0, check grün (2574 Tests), PR #368 check pass 1.
- 2026-11-22 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 5, 6, nach Merge von dev b974687; Punkt 4 bleibt offen, weil der eigene Bridge-Nachbau in ops/soll-live-money.mjs (Deny List) GET /v0/customers/cus_1 nicht kennt (Vorschlag konto-nacharbeit-2026-11-22-1). Prüfbefehle: P1 2, 1, 1, vitest 7 Dateien 63 Tests Exit 0; P2 exit=0 und 4 4, Merge-Basis 3 1 passed, faelle ok; P3 2, 1; P4 bilder gleich, soll-live-money exit=2 (payout-bank answered 502) und 0; P5 9, 5, 1, 1; P6 0, schnittstelle gleich, 0, pakete gleich, goals gleich, 0, check grün.

## Blockers
