# Konto Goal 11: Wer nach einem Schlüsselwechsel neu auszahlt, beendet mit derselben Unterschrift die alte Erlaubnis

## Status
ACTIVE

## Active Objective
Nach einem Leck des Gasschlüssels bewegt niemand mehr Geld eines Kunden über eine Erlaubnis, die er abgelöst hat. Heute bleibt sie
freigeschaltet (beim Schreiben am 2026-11-18 am Code von `dev` d02070e gelesen):

1. `sendPayout` in `src/konto/payout.ts` verwirft ein wartendes `retire_*`, dessen alte Weiterleitung einen anderen `caller` als den
   heutigen Gasschlüssel trägt, ohne Transaktion und schreibt nur die Log-Zeile `[payout] retire skipped for <Weiterleitung>:
   other_caller`. Die alte Erlaubnis bleibt im SpendPermissionManager freigeschaltet.
2. `docs/konto/euro.md`, Abschnitt `## Wechsel des Gasschlüssels`, letzter Absatz, überlässt den Widerruf dem Passkey des Kunden
   („Widerrufen kann sie der Kunde selbst mit seinem Passkey; der Server tut es nicht.“), aber kein Handoff bietet ihn an.
3. Wer den alten Gasschlüssel hat, ruft `payout` der alten Weiterleitung und zahlt bis zur Grenze je Periode (ohne Deckel,
   `PAYOUT_ALLOWANCE`) an die alte Auszahladresse des Kunden bei Bridge. Ob Bridge diese Adresse nach der neuen IBAN noch bedient und was
   mit USDC geschieht, das dort ankommt, steht nirgends.

Danach klärt `docs/konto/euro.md` aus der Doku von Bridge, was mit einer abgelösten Auszahladresse geschieht; der Schritt
`payout-approve` zeigt nach neuen, abgenommenen SOLL-Bildern eine Zeile, dass die frühere Freigabe endet; derselbe Passkey-Tipp, der die
neue Erlaubnis unterschreibt, unterschreibt eine User Operation der Smart Wallet des Kunden mit `revoke` der alten Erlaubnis beim
SpendPermissionManager; und `sendPayout` verwirft `retire_*` erst, wenn `isApproved` die alte Erlaubnis nicht mehr kennt
(`ROADMAP.md`, konto 11; Grundsatz in `docs/kette.md`, Abschnitt konto).
Widerlegt, wenn die Smart Wallet des Kunden `revoke` nicht in derselben Passkey-Unterschrift wie die neue Erlaubnis tragen kann (dann
wird der Widerruf ein zweiter Knopf auf derselben Seite, und das braucht ein eigenes SOLL-Bild, also einen neuen Schnitt).
Übernimmt goals/_vorschlaege/konto-kritik-2026-11-17-9.md.
MVP: Funktion, weil der Wechsel des Gasschlüssels nach einem Leck genau den Angreifer aussperren soll, der den alten Schlüssel hat, und
das heute für das Geld auf dem Konto des Kunden nicht gilt.

## Voraussetzungen
- konto Goal 10 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer nach einem neuen Gasschlüssel auf dem Handy die neue IBAN freigibt, beendet mit demselben Tipp die alte
  Erlaubnis, und der Server zahlt erst wieder aus, wenn die Kette das bestätigt.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte):
  1. Zuerst Punkt 1 (Bridge-Doku, mit Netz über WebFetch), dann die SOLL-Bilder (Punkt 2: Quelle, zwei Bilder, `ops/soll-money.mjs`,
     `ops/soll-assess.mjs`, README), Commit, Push. Dann den Design Reviewer auf dem Topic dieses Goals mit beiden Bildpfaden und dem
     Commit erwähnen und die Zeile `Abnahme-Issue payout-revoke: PRO-<n>` unter `## Geld /h/{code}` in `docs/soll/README.md` setzen.
     Bis „SOLL abgenommen“ dasteht, ändert der Maker `src/public/money.ts` nicht (Punkt 3 prüft das an den Zeitstempeln). Die
     vorhandenen Zeilen `Abnahme-Issue…` bleiben, wie sie sind.
  2. Während der Abnahme die vier Fälle in `test/konto-payout.test.ts` gegen den heutigen Stand (Punkt 5, drei rot), dann Server,
     Datenbank und Kette (Punkt 4) ohne `src/public/money.ts`.
  3. Nach der Abnahme Seite und Client (Punkt 6), Doku und Annahmen (Punkt 7), zuletzt Punkt 8. Je Punkt Commit und Push.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 11` in `goals/konto/ANNAHMEN.md`):
  1. Die abzulösende Erlaubnis ist dieselbe, die `finishPayout` zu `retire_*` macht: ein wartendes `retire_*`, sonst `permission` und
     `forwarder` der Zeile in `konto_payouts`. Gibt es sie, trägt jeder Auszahl-Handoff den Widerruf, nicht nur nach einem
     Schlüsselwechsel, weil die Seite ohne Lesezugriff auf die Kette nicht weiß, wessen `caller` die alte Weiterleitung trägt, weil die
     Zeile auf der Seite in beiden Fällen stimmt und weil sonst ein wartendes `retire_*` mit fremdem `caller` bei einer Zeile, die zu
     den heutigen Werten passt, nie einen Widerruf bekäme (Schleife aus 409 `payout_needs_phone`). Ohne abzulösende Erlaubnis (erste
     Auszahlung) bleibt der Handoff, wie er ist.
  2. Der Widerruf ist eine User Operation der Coinbase Smart Wallet v1 des Kunden an den EntryPoint v0.6
     `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` mit genau einem Aufruf `execute(SPEND_PERMISSION_MANAGER, 0, revoke(<alte
     Erlaubnis>))`, `initCode` und `paymasterAndData` `0x`, `maxFeePerGas` und `maxPriorityFeePerGas` `0`: Die Wallet braucht kein ETH,
     unser Gasschlüssel reicht sie mit `handleOps([op], <unser Gasschlüssel>)` über `sendKontoTx` ein und zahlt das Gas. Grund:
     `revoke` verlangt die Wallet als Absender, der SpendPermissionManager kennt kein `revoke` mit Unterschrift, und die Wallet hält
     nur USDC. Die drei Gasgrenzen stehen als Konstanten in `src/konto/payout.ts` (Vorschlag `callGasLimit` 100000,
     `verificationGasLimit` 200000, `preVerificationGas` 50000; andere Werte nur mit Grund in `ANNAHMEN.md`). Die Nonce liest
     `PayoutChain` mit einer neuen Methode `nonceOf(account: Address): Promise<bigint>` (`getNonce(account, 0)` des EntryPoint) beim
     Rendern des Schritts `payout-passkey`; scheitert der Lesezugriff, antwortet die Seite wie bei Bridge mit 502 und „Reload this page
     in a minute.“.
  3. Ein Passkey-Tipp: Der Server rechnet den Hash der User Operation (`getUserOperationHash` aus `viem/account-abstraction`,
     `entryPointVersion: "0.6"`) und gibt ihn mit der Nonce als `data-revoke-hash` und `data-revoke-nonce` an den Knopf des Schritts
     `payout-passkey`. Der Client lässt Turnkey mit genau einer Aktivität `ACTIVITY_TYPE_SIGN_RAW_PAYLOADS` (beide Hashes, `HASH_FUNCTION_NO_OP`)
     und genau einem `X-Stamp-WebAuthn` beide unterschreiben und schickt an `POST /h/{code}/payout` zusätzlich
     `revoke: { nonce, signature }`. Ohne `data-revoke-hash` bleibt es bei `sign_raw_payload` wie heute. Link und Datum der Doku von
     Turnkey zu `sign_raw_payloads` stehen in `docs/konto/euro.md`. Kann Turnkey das nicht in einem gestempelten Aufruf, ist das
     Goal widerlegt: Blocker mit Beleg, kein zweiter Knopf ohne SOLL.
  4. `POST /h/{code}/payout` baut die User Operation aus abzulösender Erlaubnis und `revoke.nonce` nach und nimmt sie nur an, wenn
     `recoverAddress` über ihren Hash den `owner` des Kontos aus `konto_accounts` ergibt. Fehlt `revoke`, obwohl eine abzulösende
     Erlaubnis existiert, oder passt die Unterschrift nicht, gilt dasselbe wie bei einer falschen Erlaubnis: 400 `permission_refused`,
     Handoff verbrannt, nichts gespeichert. `finishPayout` speichert `{ nonce, signature }` als JSON in der neuen Spalte
     `retire_revoke` von `konto_payouts`, zusammen mit `retire_*`; bleibt ein wartendes `retire_*` stehen, bekommt es den neuen
     Widerruf, weil er für genau diese Erlaubnis unterschrieben ist. Die Spalte kommt per `ALTER TABLE … ADD COLUMN` in `src/db.ts`,
     nur wenn sie fehlt, bestehende Zeilen behalten ihre Werte.
  5. `sendPayout` im Zweig `retire_*`, in dieser Reihenfolge: `isApproved` falsch, dann verworfen wie heute (`not_approved`); sonst mit
     gespeichertem `retire_revoke` die User Operation über `handleOps` in der Stufe `retire`, danach muss `isApproved` falsch sein, sonst
     `PayoutFailed("retire", hash)`; sonst `caller` gleich dem heutigen Schlüssel, dann `retire` der Weiterleitung wie heute; sonst
     (fremder `caller`, kein Widerruf) wirft sie `payout_needs_phone`, `retire_*` bleibt, Log-Zeile `[payout] retire waits for the
     phone for <Weiterleitung>: other_caller`. Erst danach werden `retire_*` und `retire_revoke` geleert. Scheitert `handleOps`
     (Revert, etwa wegen einer verbrauchten Nonce), leert sie nur `retire_revoke` und wirft `PayoutFailed("retire", hash)`, damit der
     nächste Versuch nach dem Handy fragt statt dieselbe User Operation erneut zu schicken.
  6. Bridge: Der neue Abschnitt `## Abgelöste Auszahladresse bei Bridge` in `docs/konto/euro.md` beantwortet aus der aktuellen Doku
     von Bridge (Link auf `apidocs.bridge.xyz` und „Stand 2026-11-<Tag>“ je Aussage), ob sich eine Liquidation Address abschalten
     lässt (Aufruf und Zustand) und was mit USDC geschieht, das danach dort ankommt. Der Bau in diesem Goal hängt nicht davon ab, weil
     der Widerruf die alte Weiterleitung ohnehin stilllegt; bietet Bridge das Abschalten an, legt der Maker dafür einen Vorschlag
     `goals/_vorschlaege/konto-nacharbeit-<Datum>-<n>.md` an.
  7. Die Seite: `payout-approve` bekommt mit abzulösender Erlaubnis einen dritten Eintrag im Block `grant` mit dem Titel
     `Earlier approval` und einem Text, der sagt, dass die frühere Freigabe mit diesem Vorgang endet (etwa „Ends with this, so no
     money goes out the old way“; den Wortlaut legt das SOLL-Bild fest). Im SOLL heißt der Zustand `payout-approve-revoke`, Quelle
     `docs/soll/src/money-payout-approve-revoke.html`, Bilder `money-payout-approve-revoke-390.png` und `-1440.png`, Block
     `approve`; `MONEY_STATES` und `MONEY_BLOCKS` in `ops/soll-assess.mjs` bekommen ihn, `ops/soll-live-money.mjs` schreibt ihn aus
     einem Konto mit abzulösender Erlaubnis. Alle anderen Geld-Bilder bleiben Byte für Byte, auch `payout-passkey` (nur
     `data-*`-Werte kommen dazu, die das Bild nicht zeigt).
- Die vier Fälle stehen in genau einem `describe("the earlier permission ends with the same passkey", …)` in
  `test/konto-payout.test.ts` und importieren aus `src/` nur, was es am Kopf von `dev` schon gibt, weil Punkt 5 sie gegen die
  Merge-Basis fährt. Den Hash der User Operation liest der Test aus `data-revoke-hash` der Seite, er rechnet ihn nicht selbst.
  Fall 1 `it("ends the old permission with the same passkey after a new gas key …")`: Konto mit Weiterleitung des alten Schlüssels,
  `withNewGasKey`, neue IBAN über den Handoff, die Seite `payout-passkey` trägt `data-revoke-hash`, der Test unterschreibt beide mit
  dem Schlüssel des Eigentümers, `POST /h/{code}/payout` 200, dann `POST /v1/konto/payout` 200; die gesendeten Transaktionen beginnen
  mit `revoke` (`handleOps`), danach `deploy`, `approveWithSignature`, `payout`, und der nachgebaute SpendPermissionManager meldet die
  alte Erlaubnis mit `isApproved` falsch.
  Fall 2 `it("answers 409 payout_needs_phone and keeps the retire when the old forwarder has another caller and no revoke waits", …)`:
  `retire_*` mit fremdem `caller` direkt in `konto_payouts`, ohne Widerruf; `POST /v1/konto/payout` 409 `payout_needs_phone`, null
  Transaktionen, `retire_forwarder` unverändert.
  Fall 3 `it("refuses a payout handoff without the revoke when an earlier permission exists …")`: `POST /h/{code}/payout` mit gültiger
  neuer Erlaubnis, aber ohne `revoke`, ergibt 400 `permission_refused`, der Handoff ist verbrannt, `konto_payouts` unverändert.
  Fall 4 `it("keeps the first payout setup as it is …")` (Wächter, grün vor und nach dem Fix): ohne abzulösende Erlaubnis trägt die
  Seite kein `data-revoke-hash`, `payout-approve` enthält nicht `Earlier approval`, und die erste Auszahlung sendet `deploy`,
  `approveWithSignature`, `payout`.
- Der nachgebaute Knoten in `test/money-helpers.ts` lernt `getNonce` als `eth_call` und `handleOps` als Transaktion an den EntryPoint:
  Er entschlüsselt die User Operation, prüft, dass `callData` genau `execute(SPEND_PERMISSION_MANAGER, 0, revoke(p))` ist und die
  Unterschrift (`SignatureWrapper` mit `ownerIndex` 0) über `getUserOperationHash` den Eigentümer der Wallet ergibt, nimmt `p` aus den
  freigeschalteten Erlaubnissen, erhöht die Nonce und meldet `kind: "revoke"`; alles andere ist Quittung `0x0`. Die ABIs dafür stehen im
  Helfer selbst. Der bestehende Fall „pays again after a new gas key and one phone handoff, sends no retire to the forwarder of the old
  key and logs other_caller“ folgt dem neuen Ablauf (Titel und Erwartung), mit mindestens so vielen `expect` wie heute.
- Kein Netz außer Punkt 1 (Doku lesen), kein fester Port: alles über `handoffApp` und den nachgebauten Knoten. Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), `check` und die SOLL-Werkzeuge im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check`
  stagen. Den Client baut `node ops/konto/build-client.mjs` neu, `src/public/konto-client/konto.js` wird mit committet.
- Rollout: `src/**` rollt mit dem nächsten fälligen Deploy aus, der Merge bekommt den üblichen Release-Auftrag. Keine Transaktion auf
  Base Sepolia oder im Hauptnetz in diesem Goal; ein Lauf von `ops/konto/sepolia-payout-run.mjs` mit Widerruf ist ein Vorschlag für
  später.
- Nicht in diesem Goal: `src/konto/contracts/**` und `src/konto/forwarder.ts` (jede Änderung verschöbe die Adresse jeder
  Weiterleitung), ein Abschalten der Auszahladresse bei Bridge, ein Widerruf der ersten Erlaubnis (Tageslimit), ein Paymaster.

## Done Condition
- [x] `docs/konto/euro.md` klärt aus der Doku von Bridge, ob eine abgelöste Auszahladresse abgeschaltet wird und was mit USDC
      geschieht, das danach ankommt, nennt die Doku von Turnkey zu `sign_raw_payloads`, und der Abschnitt zum Wechsel des
      Gasschlüssels beschreibt den Widerruf über den Handoff statt ihn dem Kunden zu überlassen.
      MVP: Funktion, weil erst diese Antwort zeigt, ob nach dem Widerruf noch ein zweiter Weg zum Geld des Kunden offen ist.
      Prüfung: `awk '/^## Abgelöste Auszahladresse bei Bridge$/{f=1;next} /^## /{f=0} f' docs/konto/euro.md | grep -oE 'https://apidocs\.bridge\.xyz/[^) ]+' | sort -u | wc -l` muss mindestens `2` ausgeben.
      Prüfung: `awk '/^## Abgelöste Auszahladresse bei Bridge$/{f=1;next} /^## /{f=0} f' docs/konto/euro.md | grep -cE 'Stand 2026-11-[0-9]{2}'` muss mindestens `2` ausgeben.
      Prüfung: `awk '/^## Abgelöste Auszahladresse bei Bridge$/{f=1;next} /^## /{f=0} f' docs/konto/euro.md | grep -ciE 'usdc'` muss mindestens `1` ausgeben.
      Prüfung: `grep -cE 'sign_raw_payloads|SIGN_RAW_PAYLOADS' docs/konto/euro.md` muss mindestens `1` ausgeben.
      Prüfung: `grep -c 'der Server tut es nicht' docs/konto/euro.md` muss genau `0` ausgeben.
      Prüfung: `awk '/^## Wechsel des Gasschlüssels$/{f=1;next} /^## /{f=0} f' docs/konto/euro.md | grep -cE 'revoke|retire_revoke'` muss mindestens `1` ausgeben.
- [x] Die zwei SOLL-Bilder des Zustands `payout-approve-revoke` kommen aus ihrer Quelle, ohne Netz und ohne Mangel, der Block steht ganz
      im ersten Bildschirm, nennt die frühere Freigabe, und alle anderen Geld-Bilder bleiben Byte für Byte.
      MVP: Funktion, weil die Seite nur nach Bild gebaut werden darf und der Mensch vor dem Tipp sehen muss, dass er die frühere
      Freigabe beendet.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node ops/soll-money.mjs --check > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll money: 16 images, blocks end 390=([0-9]|[1-7][0-9]|[1-7][0-9][0-9]|8[0-3][0-9]|84[0-4]) 1440=([0-9]|[1-8][0-9]|[1-8][0-9][0-9]|900), 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");for(const w of [390,1440]){const b=fs.readFileSync("docs/soll/money-payout-approve-revoke-"+w+".png");if(b.readUInt32BE(16)!==w){console.error(w);process.exit(1)}}console.log("breiten ok")'` muss `breiten ok` ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("docs/soll/src/money-payout-approve-revoke.html","utf8");const i=s.indexOf("data-soll=\"approve\"");const t=(i<0?"":s.slice(i)).replace(/<style[\s\S]*?<\/style>/g,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ");const bad=[];if(i<0)bad.push("block");if(!/Earlier approval/.test(t))bad.push("titel");if(!/\bends?\b/i.test(t))bad.push("endet");if(!/Atlas/.test(t))bad.push("name");if(/<script/i.test(s))bad.push("script");if(/[\u2013\u2014]/.test(s))bad.push("gedankenstrich");if(bad.length){console.error(bad);process.exit(1)}console.log("zeile ok")'` muss `zeile ok` ausgeben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'docs/soll/money-*' 'docs/soll/src/money-*' && echo geld gleich` muss `geld gleich` ausgeben.
      Prüfung: `T=$(mktemp -d); cp docs/soll/src/money-*.html $T/; sed -i '0,/<h1>/s/<h1>/<h1>X /' $T/money-payout-approve-revoke.html; grep -q '<h1>X ' $T/money-payout-approve-revoke.html || echo sed-miss; PATH=/usr/bin:$PATH node ops/soll-money.mjs --check --source $T > $T/out 2>&1; echo "exit=$?" >> $T/out; grep -cE '^(soll money: defect payout-approve-revoke (390|1440): [0-9]+ pixels differ from a fresh render|exit=1)$' $T/out` muss `3` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/soll-money.test.ts test/soll-flags.test.ts test/soll-fonts.test.ts` muss Exit-Code 0 haben.
- [x] Der Design Reviewer hat die zwei neuen Bilder abgenommen, bevor sich `src/public/money.ts` änderte.
      MVP: Funktion, weil die Seite 1:1 nach einem abgenommenen Bild entsteht und nicht nach einer Beschreibung.
      Prüfung: `grep -cE '^Abnahme-Issue payout-revoke: PRO-[0-9]+$' docs/soll/README.md` muss genau `1` ausgeben.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue payout-revoke: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- 'docs/soll/money-payout-approve-revoke-*.png' 'docs/soll/src/money-payout-approve-revoke.html'); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/public/money.ts | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok)<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [x] Server, Datenbank und Kette: `POST /h/{code}/payout` verlangt mit abzulösender Erlaubnis einen Widerruf, den der Eigentümer
      unterschrieben hat, `finishPayout` speichert ihn in `retire_revoke`, und `sendPayout` schickt ihn über `handleOps` und verwirft
      `retire_*` erst, wenn `isApproved` falsch ist.
      MVP: Funktion, weil an dieser Stelle die Widerlegung hängt: Eine abgelöste Erlaubnis mit fremdem `caller` darf nicht mehr
      freigeschaltet bleiben (Vorschlag konto-kritik-2026-11-17-9).
      Prüfung: `grep -ciF '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' src/konto/payout.ts` muss mindestens `1` ausgeben.
      Prüfung: `grep -cE 'nonceOf\(account: Address\): Promise<bigint>' src/konto/payout.ts` muss genau `1` ausgeben.
      Prüfung: `grep -cE 'handleOps' src/konto/payout.ts` muss mindestens `1` ausgeben.
      Prüfung: `grep -cE 'retire_revoke +TEXT|ADD COLUMN retire_revoke' src/db.ts` muss mindestens `1` ausgeben.
      Prüfung: `grep -c 'retire waits for the phone for' src/konto/payout.ts` muss mindestens `1` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts test/konto-payout-guard.test.ts test/konto-payout-pending.test.ts test/konto-payout-rule.test.ts test/mcp-money.test.ts test/money-adversarial.test.ts` muss Exit-Code 0 haben.
- [x] Vier Fälle in `test/konto-payout.test.ts` decken Widerruf nach neuem Schlüssel, wartendes `retire_*` ohne Widerruf, Handoff ohne
      Widerruf und die erste Einrichtung ab; gegen den Stand der Merge-Basis sind genau drei rot.
      MVP: Funktion, weil erst der rote Lauf am alten Code zeigt, dass die Fälle den Fehler treffen, und der Wächter festhält, dass die
      erste Auszahlung keine zweite Unterschrift verlangt.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("the earlier permission ends with the same passkey"));console.log(a.length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `exit=0` und `4 4` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp test/konto-payout.test.ts test/money-helpers.ts test/handoff-helpers.ts $T/test/; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("the earlier permission ends with the same passkey"));console.log(a.filter(x=>x.status!=="passed").length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `3 1` ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("test/konto-payout.test.ts","utf8");const miss=["withNewGasKey","data-revoke-hash","payout_needs_phone","permission_refused","isApproved","\"revoke\"","Earlier approval","retire_forwarder"].filter(x=>!s.includes(x));if(miss.length){console.error(miss);process.exit(1)}console.log("faelle ok")'` muss `faelle ok` ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("test/money-helpers.ts","utf8");const miss=["handleOps","getNonce","getUserOperationHash","revoke"].filter(x=>!s.includes(x));if(miss.length){console.error(miss);process.exit(1)}console.log("knoten ok")'` muss `knoten ok` ausgeben.
- [x] Seite und Client: `payout-approve` zeigt mit abzulösender Erlaubnis die Zeile aus dem Bild, `payout-passkey` trägt Hash und Nonce
      des Widerrufs, der Client unterschreibt beide Hashes mit einem Passkey-Tipp, und die echte Seite ist in allen acht Geld-Zuständen
      pixelgleich mit den Bildern.
      MVP: Funktion, weil der Kunde nur einmal tippen soll und sehen muss, was dieser Tipp beendet.
      Prüfung: `grep -c 'SIGN_RAW_PAYLOADS' src/public/konto-client/flow.mjs` muss mindestens `1` ausgeben.
      Prüfung: `grep -c 'data-revoke-hash' src/public/money.ts` muss mindestens `1` ausgeben.
      Prüfung: `grep -c 'Earlier approval' src/public/money.ts` muss mindestens `1` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-client.test.ts test/konto-client-deposit.test.ts test/konto-client-limit.test.ts test/soll-money.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live-money.mjs --out $T && PATH=/usr/bin:$PATH node ops/soll-money.mjs --check --source $T > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll money: 16 images, blocks end 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; grep -n 'Earlier approval' $T/src/public/money.ts | head -1 | cut -d: -f1 > $T/n; test -s $T/n || echo sed-miss; sed -i "$(cat $T/n)s/Earlier approval/Earlier approvaL/" $T/src/public/money.ts; (cd $T && PATH=/usr/bin:$PATH node --import tsx ops/soll-live-money.mjs --out $T/out); PATH=/usr/bin:$PATH node ops/soll-money.mjs --check --source $T/out; echo "exit=$?"` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
- [x] Die Entscheidungen stehen mit Grund in `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil die Linsen und die nächsten Goals der Kette gegen diese Annahmen prüfen.
      Prüfung: `awk '/^## Goal 11/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens `6` ausgeben.
      Prüfung: `awk '/^## Goal 11/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE 'maxFeePerGas.+0|handleOps'` muss mindestens `1` ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, Verträge, Weiterleitung und die übrigen Geld-Bilder bleiben gleich, kein Test wird
      schwächer, kein neues Paket, kein Schlüssel im Diff, keine andere Goal-Datei geändert, und `check` ist grün.
      MVP: Funktion, weil `src/**` mit dem Merge ausrollt und zahlende Kunden den Stand tragen.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/konto/payout\.ts|src/handoff/routes\.ts|src/db\.ts|src/public/money\.ts|src/public/konto-client/(flow|main)\.mjs|src/public/konto-client/konto\.js|test/(konto-payout|konto-payout-guard|konto-payout-pending|konto-payout-rule|mcp-money|money-adversarial|konto-client|konto-client-deposit|konto-client-limit|soll-money)\.test\.ts|test/(money|handoff)-helpers\.ts|docs/konto/euro\.md|docs/soll/README\.md|docs/soll/money-payout-approve-revoke-(390|1440)\.png|docs/soll/src/money-payout-approve-revoke\.html|ops/soll-(money|assess|live-money)\.mjs|goals/konto/11-wer-nach-einem-schluesselwechsel-neu-auszahlt-beendet-mit-derselben-unterschrift-die-alte-erlaubnis\.md|goals/konto/verdicts/11-[A-Za-z0-9._-]+\.md|goals/konto/ANNAHMEN\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- src/konto/contracts src/konto/forwarder.ts src/konto/permission.ts src/konto/topup.ts src/konto/limit.ts && echo vertrag gleich` muss `vertrag gleich` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- package.json pnpm-lock.yaml && echo pakete gleich` muss `pakete gleich` ausgeben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' ':!goals/konto/11-wer-nach-einem-schluesselwechsel-neu-auszahlt-beendet-mit-derselben-unterschrift-die-alte-erlaubnis.md' && echo goals gleich` muss `goals gleich` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-11 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [ ] Kritik: Ein Widerruf, der die alte Erlaubnis nicht beendet, geht nie ein zweites Mal raus. Zwei Fälle in einem eigenen
      `describe("a revoke that does not end the old permission", …)` in `test/konto-payout.test.ts` (nicht im `describe` aus Punkt 5,
      dessen Zähler bleiben): `it("… when its handleOps reverts …")` (etwa eine Nonce, die die Wallet schon verbraucht hat) und
      `it("… when the chain still approves the old permission after handleOps …")`. In beiden antwortet `POST /v1/konto/payout` 502
      mit `stage: "retire"`, danach ist `retire_revoke` leer und `retire_forwarder` unverändert, und der nächste `POST /v1/konto/payout`
      antwortet 409 `payout_needs_phone` ohne eine weitere Transaktion.
      MVP: Funktion, weil `runPayoutRules` sonst bei jedem fälligen Lauf dieselbe tote User Operation mit unserem Gas schickt oder
      `retire_*` leert, während die alte Erlaubnis freigeschaltet bleibt, und genau diese zwei Zweige aus Entscheidung 5 ohne Test sind.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("a revoke that does not end the old permission")&&/when its handleOps reverts|when the chain still approves the old permission after handleOps/.test(x.title));console.log(a.length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `exit=0` und `2 2` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; grep -c 'SET retire_revoke = NULL WHERE' $T/src/konto/payout.ts; sed -i 's/SET retire_revoke = NULL WHERE/SET retire_revoke = retire_revoke WHERE/' $T/src/konto/payout.ts; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("a revoke that does not end the old permission")&&/when its handleOps reverts|when the chain still approves the old permission after handleOps/.test(x.title));console.log(a.filter(x=>x.status!=="passed").length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau die zwei Zeilen `2` und `2 0` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Nach einem neuen Gasschlüssel beendet der eine Passkey-Tipp für die neue IBAN auch die alte Erlaubnis, und die Kette bestätigt es
      vor der nächsten Auszahlung.
- [ ] Solange eine alte Erlaubnis mit fremdem `caller` freigeschaltet ist und kein Widerruf wartet, zahlt der Server nichts aus und
      schickt den Kunden aufs Handy.
- [ ] Der Kunde sieht vor dem Tipp, dass die frühere Freigabe endet, nach einem abgenommenen Bild; die erste Einrichtung bleibt, wie sie
      ist.
- [ ] `docs/konto/euro.md` sagt mit Quelle, was Bridge mit einer abgelösten Auszahladresse tut.
- [ ] Kein Gedankenstrich, kein deutscher Bezeichner im Code.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.key`, `*.pem`
- `src/**` außer `src/konto/payout.ts`, `src/handoff/routes.ts`, `src/db.ts` (nur die Spalte `retire_revoke`), `src/public/money.ts`
  und `src/public/konto-client/{flow.mjs,main.mjs,konto.js}`, insbesondere `src/konto/contracts/**`, `src/konto/forwarder.ts`,
  `src/konto/permission.ts`, `src/konto/topup.ts`, `src/konto/limit.ts`, `src/public/handoff.ts`, `src/public/konto.ts`,
  `src/public/limit.ts`
- `ops/**` außer `ops/soll-money.mjs`, `ops/soll-assess.mjs` (nur `MONEY_STATES` und `MONEY_BLOCKS`) und `ops/soll-live-money.mjs`;
  `docs/**` außer `docs/konto/euro.md`, `docs/soll/README.md` (Tabelle und Abnahme-Zeile im Abschnitt Geld) und den drei neuen Dateien
  des Zustands `payout-approve-revoke`; kein anderes Bild unter `docs/soll/`
- `src/public/money.ts` vor der Abnahme der neuen Bilder durch den Design Reviewer
- jede Transaktion auf einer echten Kette, jeder Aufruf bei Turnkey, Bridge oder einem RPC außer dem Lesen ihrer Doku, jeder Lauf von
  `ops/konto/*.mjs` außer `ops/konto/build-client.mjs`
- ein Paymaster, ETH an die Wallet eines Kunden, ein Abschalten der Auszahladresse bei Bridge
- `ROADMAP.md`, `docs/kette.md`, alle Goal-Dateien außer dieser (eingefroren), jede Zeile einer `ANNAHMEN.md` außer `## Goal 11`
- ein neues Paket, ein Test, der gestrichen, übersprungen oder schwächer wird
- ein API-Schlüssel, ein privater Schlüssel, ein Testschlüssel als Literal, eine IBAN außer `EXAMPLE_IBAN` oder ein Name eines Kunden
  in Repo, Log, Ausgabe, Kommentar oder Fixture
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-18 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7, 8 gebaut: Bridge-Doku und Widerruf in `docs/konto/euro.md`, SOLL `payout-approve-revoke` (abgenommen auf PRO-24730 um 02:13:39Z, `src/public/money.ts` erst ab 02:18:14Z), Widerruf als User Operation über `handleOps` mit `retire_revoke`, vier Fälle, Seite und Client mit einem Tipp für beide Hashes, Annahmen; neue Tests waren rot: Fälle 1 bis 3 gegen die Merge-Basis (`3 1`), der Client-Fall `SIGN_RAW_PAYLOADS` gegen den Client vor Punkt 6. Prüfbefehle: P1 Links 5, Stand 5, usdc 4, sign_raw_payloads 2, alter Satz 0, revoke 5; P2 `exit=0` und `1` (16 Bilder, 390=655, 1440=684), `breiten ok`, `zeile ok`, `geld gleich`, Gegenprobe `3` ohne `sed-miss`, vitest Exit 0; P3 `1`, `abnahme ok 1`; P4 1, 1, 6, 2, 1, vitest Exit 0; P5 `exit=0` `4 4`, Merge-Basis `3 1`, `faelle ok`, `knoten ok`; P6 3, 1, 1, vitest Exit 0, live `exit=0` und `1`, Gegenprobe letzte Zeile `exit=1` ohne `sed-miss`; P7 15 und 4; P8 0, `vertrag gleich`, `0`, `pakete gleich`, `goals gleich`, 0, `check` grün (2379 Tests, 204 s), Job `check` am PR #269 `pass` (Netz-Prüfung `1`).
- 2026-11-18 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8; `dev` (`f076a93`) war schon im Branch, nichts zu mergen, jeder Prüfbefehl am Kopf `1f594cd` neu gelaufen. Prüfbefehle: P1 5, 5, 4, 2, 0, 5; P2 `exit=0` und `1`, `breiten ok`, `zeile ok`, `geld gleich`, Gegenprobe `3`, vitest Exit 0; P3 `1`, `abnahme ok 1`; P4 1, 1, 6, 2, 1, vitest Exit 0; P5 `exit=0` `4 4`, Merge-Basis `3 1`, `faelle ok`, `knoten ok`; P6 3, 1, 1, vitest Exit 0, live `exit=0` und `1`, Gegenprobe letzte Zeile `exit=1`; P7 15, 4; P8 0, `vertrag gleich`, `0`, `pakete gleich`, `goals gleich`, 0, `check` grün (2379 Tests, 426 s), Netz-Prüfung `1`; am PR #269 Jobs `check` und `e2e` grün (Run 44223541816).

## Blockers
