# Konto Goal 13: Der Widerruf trifft nur die Erlaubnis, die der Kunde ablöst

## Status
DONE

## Active Objective
Mit seinem Passkey beendet ein Kunde genau die Erlaubnis, die er ablöst, und keine Seite bringt ihn dazu, etwas anderes zu
unterschreiben. Heute (beim Schreiben am 2026-11-18 am Code von `dev` b8d9341 gelesen):

1. `POST /h/{code}/payout` in `src/handoff/routes.ts` prüft den Widerruf gegen `replacedPermission(current)`, wartet danach auf
   `checkSignature` (ein Aufruf beim RPC), und `finishPayout` in `src/konto/payout.ts` bestimmt in seiner Transaktion die abzulösende
   Erlaubnis mit `replacedPermission(readPayout(db, account))` neu. Leert ein Auszahl-Lauf dazwischen `retire_*` oder schließt ein
   zweiter Handoff desselben Kontos ab, speichert `finishPayout` als `retire_revoke` einen Widerruf, der für eine andere Erlaubnis
   unterschrieben ist, und der nächste Lauf schickt ihn mit unserem Gas über `handleOps`, wo er revertiert; beim ersten Einrichten
   ohne Widerruf wird so eine Erlaubnis zu `retire_*` ganz ohne Widerruf.
2. Der Client unterschreibt `data-revoke-hash` der Seite ungeprüft (`revokeHash: d.revokeHash` in `src/public/konto-client/main.mjs`,
   `signer.signRawPayloads([hash, revoke.hash])` in `runPayout` in `src/public/konto-client/flow.mjs`). Für die Smart Wallet ist eine
   Unterschrift des Eigentümers über den Hash einer User Operation eine Vollmacht für jeden Aufruf, etwa einen weiteren Owner,
   während der Client die neue Erlaubnis aus ihren Feldern selbst hasht.

Danach reicht die Route die Erlaubnis, deren Widerruf sie geprüft hat, an `finishPayout`, das bei Abweichung in derselben Transaktion
`false` gibt und nichts speichert, und der Client baut User Operation und Hash selbst aus `data-revoke-permission` und
`data-revoke-nonce` und unterschreibt keinen Hash der Seite, der davon abweicht (`ROADMAP.md`, konto 13; Grundsatz in `docs/kette.md`,
Abschnitt konto). Seite und SOLL-Bilder ändern sich nicht.
Widerlegt, wenn `finishPayout` am Kopf von `dev` die geprüfte Erlaubnis schon als Eingabe nimmt (heute nimmt es `code`, `account`,
`permission`, `signature`, `revoke` und `nowMs`).
Übernimmt goals/_vorschlaege/konto-kritik-2026-11-18-2.md und goals/_vorschlaege/konto-kritik-2026-11-18-3.md.
MVP: Funktion, weil ein falsch gespeicherter Widerruf die alte Weiterleitung eines zahlenden Kunden offen lässt, bis er wieder aufs
Handy muss, und weil eine Unterschrift über einen Hash, den der Kunde nicht prüfen kann, mehr freigibt als das Ende einer Erlaubnis.

## Voraussetzungen
- konto Goal 12 DONE

## Kontext für den Maker
- Ziel in einem Satz: Was der Server als abgelöste Erlaubnis speichert und was der Passkey als Widerruf unterschreibt, ist genau die
  Erlaubnis, die die Seite dem Kunden zur Ablösung gezeigt hat.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte): zuerst die beiden neuen Testdateien (Punkt 2 und Punkt 4) gegen den
  heutigen Stand, rot; dann Punkt 1, danach Punkt 3 samt neu gebautem `konto.js`, dann Punkt 5 (SOLL-Prüfung), Punkt 6 und zuletzt
  Punkt 7. Je Punkt Commit und Push.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 13` in `goals/konto/ANNAHMEN.md`):
  1. `finishPayout` bekommt im Eingabeobjekt das Feld `replaced: { forwarder: string; permission: string } | null`, genau den Wert,
     den die Route vor der Prüfung des Widerrufs aus `replacedPermission(current)` gelesen hat (`null` beim ersten Einrichten). In
     seiner Transaktion vergleicht es `replacedPermission(readPayout(db, account))` mit `replaced` (beide `null`, oder `forwarder`
     ohne Groß- und Kleinschreibung und `permission` als JSON-Text gleich) und gibt bei Abweichung `false`, ohne `konto_payouts`,
     `payout_handoffs` oder `handoffs` zu ändern. Das Feld ist Pflicht, weil ein vergessenes Feld sonst still den alten Weg nähme.
  2. Gibt `finishPayout` `false`, verbrennt die Route den Handoff mit `burnMatched` und antwortet wie heute 410 `handoff_closed`
     („This code no longer works. Start again in your terminal.“), weil der Kunde dann einen neuen Code braucht, dessen Seite die
     Erlaubnis von jetzt zeigt; ein Handoff, der nicht mehr `matched` ist, bleibt dabei, wie er ist. Kein neuer Fehlercode, weil
     Terminal und Seite 410 schon kennen.
  3. Die Seite `payout-passkey` trägt am Knopf zusätzlich `data-revoke-permission` mit genau dem gespeicherten JSON-Text der
     abzulösenden Erlaubnis (`replaced.permission`, durch `esc` der Seite). `data-revoke-hash` und `data-revoke-nonce` bleiben, weil
     `test/money-helpers.ts`, `test/konto-payout.test.ts` und `ops/soll-live-money.mjs` sie lesen; der Hash ist für den Client nur
     noch ein Abgleich.
  4. `runPayout` in `flow.mjs` baut aus `data-revoke-permission`, `data-revoke-nonce` und `data-chain` die User Operation wie
     `revokeUserOperation` in `src/konto/payout.ts` (Sender die Smart Wallet, `callData` `execute(SpendPermissionManager, 0,
     revoke(p))`, dieselben Gasgrenzen, Gebühr 0, EntryPoint v0.6) und ihren Hash mit `getUserOperationHash` aus
     `viem/account-abstraction`, und unterschreibt nur diesen. Er unterschreibt nichts und wirft `KontoError("unreachable", …)`, wenn
     die Erlaubnis fehlt oder nicht lesbar ist, wenn ihr `account` nicht `data-account` ist, ihr `token` nicht `data-token`, ihre
     `allowance` nicht `PAYOUT_ALLOWANCE` oder ihre `period` nicht `PAYOUT_PERIOD_SECONDS` (nur eine Auszahl-Erlaubnis dieses Kontos,
     nie die Erlaubnis zum Tageslimit), oder wenn die Seite einen `data-revoke-hash` trägt, der vom selbst gebauten abweicht. Die
     Konstanten stehen in `flow.mjs` mit einer Zeile Kommentar, dass sie denen in `src/konto/payout.ts` gleichen müssen; Punkt 4
     prüft das über den Hash.
  5. `src/konto/payout.ts` exportiert nichts Neues für den Client, weil `flow.mjs` ins Bündel für den Browser geht und
     `src/konto/payout.ts` Server-Code mit Datenbank zieht; die Gleichheit beider Hashes sichert der Test.
- Die Testdatei `test/konto-revoke-replaced.test.ts` (neu) hat genau einen `describe("the revoke ends only the permission the person
  replaces", …)` mit drei Fällen über die echte Route (`moneySetup` und die Helfer aus `test/money-helpers.ts`), importiert aus `src/`
  nur, was es an der Merge-Basis schon gibt, und ändert die Zeile während `checkSignature` über den nachgebauten `verifyClient` (etwa
  einen Haken vor dem ersten `eth_call`), weil Punkt 2 sie gegen die Merge-Basis fährt.
  Fall 1 `it("refuses the setup when a payout run ends the waiting retire while the signature is checked", …)`: Konto mit erster
  Einrichtung (Erlaubnis P1), zweiter Einrichtung (P1 wartet als `retire_*` mit Widerruf, P2 ist `permission`), dritter Handoff, dessen
  Seite den Widerruf von P1 zeigt; während der Prüfung setzt der Test `retire_forwarder`, `retire_permission` und `retire_revoke` auf
  NULL wie ein Auszahl-Lauf. Erwartet: 410, die Zeile in `konto_payouts` ist genau die, die der Test hinterlassen hat (P2 als
  `permission`, `retire_*` NULL), der Handoff ist `burned`, `payout_handoffs` behält die Zeile, keine Transaktion gesendet.
  Fall 2 `it("refuses the first setup when another setup of the account finishes while the signature is checked", …)`: erstes Einrichten
  ohne Widerruf, während der Prüfung schreibt der Test eine Erlaubnis in die Zeile wie ein zweiter Handoff. Erwartet: 410, nichts
  gespeichert, `retire_*` bleibt NULL.
  Fall 3 `it("keeps the revoke the person signed with the permission it was signed for when nothing changed", …)`: wie Fall 1 ohne
  Änderung; 200, `retire_permission` ist P1 und `retire_revoke` trägt Nonce und Unterschrift des Bodys. Wächter, grün davor und danach.
- Die Testdatei `test/konto-client-revoke.test.ts` (neu) hat genau einen `describe("the client signs only the revoke it builds
  itself", …)` mit vier Fällen über `wirePage` aus `main.mjs` und denselben nachgebauten Passkey und Turnkey wie
  `test/konto-client-deposit.test.ts` (in die neue Datei kopiert oder in einen gemeinsamen Helfer unter `test/` gezogen):
  Fall 1 `it("signs the hash of the revoke it builds from data-revoke-permission and the nonce", …)`: Seite mit einer
  Auszahl-Erlaubnis des Kontos in `data-revoke-permission`, Nonce 3, ohne `data-revoke-hash`; die zweite Nutzlast der Aktivität ist
  `revokeHash(p, 3n, 84532)` aus `src/konto/payout.ts`, und die Unterschrift im Body ergibt mit `recoverAddress` den Eigentümer.
  Fall 2 `it("signs nothing when the page carries another hash than the one it builds", …)`: Seite mit Erlaubnis, Nonce und einem
  fremden `data-revoke-hash`; kein Passkey-Dialog, kein Aufruf bei Turnkey, kein POST an `/h/{code}/payout`.
  Fall 3 `it("signs nothing for a permission of another account or of the daily limit", …)`: einmal `account` eines fremden Kontos,
  einmal `allowance` und `period` des Tageslimits, je mit dem passenden `data-revoke-hash` dieser Erlaubnis; nichts unterschrieben,
  nichts gesendet.
  Fall 4 `it("agrees with the server on the real payout-passkey page and ends the setup", …)`: die echte Seite `payout-passkey` einer
  zweiten Einrichtung aus `moneySetup`, der Client daran verdrahtet, der Body geht an die echte Route; 200, und `retire_revoke`
  trägt die Unterschrift, die der Client gebaut hat. Wächter, grün davor und danach.
- Den bestehenden Fall „signs the new permission and the revoke of the earlier one with one passkey dialog and one SIGN_RAW_PAYLOADS
  (goals/konto/11)“ in `test/konto-client-deposit.test.ts` stellt der Maker auf eine echte Auszahl-Erlaubnis in
  `data-revoke-permission` um und erwartet als zweite Nutzlast `revokeHash(p, 3n, 84532)` statt des heutigen SHA-256 eines Satzes;
  seine übrigen Erwartungen bleiben, weil der Fall sonst nach dem Fix nur noch eine fremde Zeichenkette prüft, die der Client ablehnt.
- `konto.js` baut der Maker mit `node ops/konto/build-client.mjs` neu und committet es im selben Commit wie `flow.mjs`;
  `test/konto-client.test.ts` vergleicht das Bündel mit den Quellen.
- `docs/konto/euro.md`, Absatz „Mit der alten Erlaubnis“: ein Satz, dass die Seite die abzulösende Erlaubnis als
  `data-revoke-permission` trägt und der Client den Hash selbst baut, und einer, dass `finishPayout` nur die geprüfte Erlaubnis ablöst
  und sonst den Handoff mit 410 beendet. Sonst nichts in `docs/`.
- Kein Netz, kein fester Port. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und die SOLL-Werkzeuge im Vordergrund mit
  eigenem Timeout, neue Dateien vor dem lokalen `check` stagen.
- Rollout: `src/**` rollt mit dem nächsten fälligen Deploy aus, der Merge bekommt den üblichen Release-Auftrag. Keine Migration, keine
  neue Spalte; eine Seite, die vor dem Deploy geladen wurde, hat kein `data-revoke-permission`, und ihr Tipp scheitert mit dem neuen
  Bündel als „unreachable“, bis der Kunde neu lädt (zehn Minuten Lebenszeit eines Handoffs).
- Nicht in diesem Goal: `sendPayout` und der Weg des Widerrufs zur Kette, `ops/konto/**`, `mcp/**`, die Prüfung bei Bridge vor der
  Auszahlung (konto 14), der Sepolia-Beleg des Widerrufs (konto 15), jede andere Tabelle.

## Done Condition
- [x] `finishPayout` nimmt die Erlaubnis, deren Widerruf die Route geprüft hat, als `replaced` und speichert bei Abweichung nichts;
      die Route reicht sie durch und beendet den Handoff dann mit 410.
      MVP: Funktion, weil an dieser Stelle die Widerlegung hängt: Kein Widerruf darf neben einer anderen Erlaubnis gespeichert werden
      als der, für die er unterschrieben ist (Vorschlag konto-kritik-2026-11-18-2).
      Prüfung: `grep -cE 'finishPayout\(db, \{[^}]*\breplaced\b' src/handoff/routes.ts` muss genau `1` ausgeben.
      Prüfung: `awk '/^export function finishPayout/{f=1} f&&/^}/{print;exit} f' src/konto/payout.ts | grep -cE '\breplaced\b'` muss mindestens `2` ausgeben.
      Prüfung: `awk '/^export function finishPayout/{f=1} f&&/^}/{exit} f' src/konto/payout.ts | grep -cE 'replaced\?:'` muss genau `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-revoke-replaced.test.ts test/konto-payout.test.ts test/konto-payout-guard.test.ts test/konto-payout-pending.test.ts test/konto-payout-rule.test.ts test/konto-signature-retry.test.ts test/konto-deposit.test.ts test/handoff-api.test.ts` muss Exit-Code 0 haben.
- [x] Drei Fälle in `test/konto-revoke-replaced.test.ts` zeigen, dass eine Änderung der Zeile während der Prüfung der Unterschrift
      nichts speichert und der unveränderte Weg den Widerruf behält; gegen den Stand der Merge-Basis sind die Fälle 1 und 2 rot und
      Fall 3 grün.
      MVP: Funktion, weil das Rennen zwischen Prüfung und Speichern nur ein Test mit geänderter Zeile zeigt und erst der rote Lauf am
      alten Code belegt, dass er es trifft.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-revoke-replaced.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("the revoke ends only the permission the person replaces"));console.log(a.length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `exit=0` und `3 3` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp test/konto-revoke-replaced.test.ts $T/test/; for f in $(git diff --name-only --diff-filter=A origin/dev...HEAD -- 'test/*-helpers.ts'); do cp $f $T/test/; done; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-revoke-replaced.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("the revoke ends only the permission the person replaces"));console.log(a.filter(x=>x.status!=="passed").length, a.filter(x=>x.status==="passed").length, a.find(x=>x.title.startsWith("keeps the revoke"))?.status)' $T/r.json` muss genau `2 1 passed` ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("test/konto-revoke-replaced.test.ts","utf8");const miss=["moneySetup","retire_permission","retire_revoke","burned","410","verifyClient"].filter(x=>!s.includes(x));if(miss.length){console.error(miss);process.exit(1)}console.log("faelle ok")'` muss `faelle ok` ausgeben.
- [x] Der Client baut User Operation und Hash des Widerrufs selbst aus `data-revoke-permission` und der Nonce, unterschreibt nur
      eine Auszahl-Erlaubnis dieses Kontos und keinen abweichenden Hash der Seite, und `konto.js` ist das Bündel dieser Quellen.
      MVP: Funktion, weil der Passkey des Kunden sonst einen beliebigen Aufruf seiner Smart Wallet freigeben könnte (Vorschlag
      konto-kritik-2026-11-18-3).
      Prüfung: `grep -c 'revokeHash: d.revokeHash' src/public/konto-client/main.mjs` muss genau `0` ausgeben.
      Prüfung: `grep -c 'revokePermission' src/public/konto-client/main.mjs` muss mindestens `1` ausgeben.
      Prüfung: `grep -cE 'getUserOperationHash' src/public/konto-client/flow.mjs` muss mindestens `1` ausgeben.
      Prüfung: `grep -c 'data-revoke-permission' src/public/money.ts` muss mindestens `1` ausgeben.
      Prüfung: `grep -c '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' src/public/konto-client/flow.mjs` muss mindestens `1` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node ops/konto/build-client.mjs --check; echo "exit=$?"` muss genau `exit=0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-client-revoke.test.ts test/konto-client-deposit.test.ts test/konto-client.test.ts test/konto-client-limit.test.ts test/soll-money.test.ts` muss Exit-Code 0 haben.
- [x] Vier Fälle in `test/konto-client-revoke.test.ts` zeigen den selbst gebauten Hash, die Ablehnung eines fremden Hashes und einer
      fremden Erlaubnis und die Einigkeit mit dem Server an der echten Seite; gegen den Stand der Merge-Basis sind die Fälle 1 bis 3
      rot und Fall 4 grün.
      MVP: Funktion, weil erst der rote Lauf am alten Client zeigt, dass er heute einen fremden Hash unterschreibt, und Fall 4 belegt,
      dass Client und Server denselben Widerruf meinen.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-client-revoke.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("the client signs only the revoke it builds itself"));console.log(a.length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `exit=0` und `4 4` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp test/konto-client-revoke.test.ts $T/test/; for f in $(git diff --name-only --diff-filter=A origin/dev...HEAD -- 'test/*-helpers.ts'); do cp $f $T/test/; done; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-client-revoke.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("the client signs only the revoke it builds itself"));console.log(a.filter(x=>x.status!=="passed").length, a.filter(x=>x.status==="passed").length, a.find(x=>x.title.startsWith("agrees with the server"))?.status)' $T/r.json` muss genau `3 1 passed` ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("test/konto-client-revoke.test.ts","utf8");const miss=["wirePage","revokeHash","data-revoke-permission","data-revoke-hash","ACTIVITY_TYPE_SIGN_RAW_PAYLOADS","recoverAddress","payout-passkey"].filter(x=>!s.includes(x));if(miss.length){console.error(miss);process.exit(1)}console.log("faelle ok")'` muss `faelle ok` ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- test/konto-client-deposit.test.ts | grep -cE '^-.*createHash\("sha256"\)\.update\("the revoke of the earlier permission"\)'` muss genau `1` ausgeben.
- [x] Seite und SOLL-Bilder bleiben gleich: Die echten Seiten der Auszahlung sind pixelgleich mit den Bildern, und weder Bilder noch
      SOLL-Werkzeuge ändern sich.
      MVP: Funktion, weil der Fix nur Daten am Knopf und die Prüfung im Hintergrund betrifft und der Kunde auf dem Handy nichts davon
      sehen darf.
      Prüfung: `git diff --quiet origin/dev...HEAD -- docs/soll 'ops/soll*.mjs' && echo bilder gleich` muss `bilder gleich` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live-money.mjs --out $T >/dev/null && PATH=/usr/bin:$PATH node ops/soll-money.mjs --check --source $T > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll money: 16 images, blocks end 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
- [x] Die Entscheidungen stehen mit Grund in `goals/konto/ANNAHMEN.md`, und `docs/konto/euro.md` beschreibt den neuen Weg.
      MVP: Funktion, weil konto 15 den Widerruf auf Base Sepolia belegt und dafür wissen muss, welche Erlaubnis die Seite zeigt und
      was der Client unterschreibt.
      Prüfung: `awk '/^## Goal 13/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens `5` ausgeben.
      Prüfung: `awk '/^## Goal 13/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE 'replaced|data-revoke-permission'` muss mindestens `2` ausgeben.
      Prüfung: `grep -c 'data-revoke-permission' docs/konto/euro.md` muss mindestens `1` ausgeben.
      Prüfung: `git diff --numstat origin/dev...HEAD -- docs | awk '{n++} END{print n+0}'` muss genau `1` ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, Auszahl-Lauf, Schnittstelle und Sepolia-Läufe bleiben gleich, kein Test wird
      schwächer, kein neues Paket, kein Schlüssel im Diff, keine andere Goal-Datei geändert, und `check` ist grün.
      MVP: Funktion, weil `src/**` mit dem Merge ausrollt und zahlende Kunden den Stand tragen.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/handoff/routes\.ts|src/konto/payout\.ts|src/public/money\.ts|src/public/konto-client/(main|flow)\.mjs|src/public/konto-client/konto\.js|docs/konto/euro\.md|test/(konto-revoke-replaced|konto-client-revoke|konto-client-deposit|konto-payout)\.test\.ts|test/[a-z-]+-helpers\.ts|goals/konto/13-der-widerruf-trifft-nur-die-erlaubnis-die-der-kunde-abloest\.md|goals/konto/verdicts/13-[A-Za-z0-9._-]+\.md|goals/konto/ANNAHMEN\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `for fn in replacedPermission revokeUserOperation revokeHash revokeSignedBy settlePendingPayout sendPayout runPayoutRules; do diff <(git show origin/dev:src/konto/payout.ts | awk -v f="$fn" '$0 ~ "^export (async )?function "f"\\(" {p=1} p{print} p&&/^}/{exit}') <(awk -v f="$fn" '$0 ~ "^export (async )?function "f"\\(" {p=1} p{print} p&&/^}/{exit}' src/konto/payout.ts) >/dev/null || echo "$fn"; done | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- mcp ops src/konto/permission.ts src/konto/account.ts src/konto/chain.ts src/konto/bridge.ts src/db.ts && echo schnittstelle gleich` muss `schnittstelle gleich` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- package.json pnpm-lock.yaml && echo pakete gleich` muss `pakete gleich` ausgeben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' ':!goals/konto/13-der-widerruf-trifft-nur-die-erlaubnis-die-der-kunde-abloest.md' && echo goals gleich` muss `goals gleich` ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':!src/public/konto-client/konto.js' | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-13 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ändert sich die abzulösende Erlaubnis zwischen Prüfung und Speichern, speichert der Server nichts und der Kunde startet neu.
- [ ] Der Passkey unterschreibt als Widerruf nur den Hash, den der Client aus einer Auszahl-Erlaubnis dieses Kontos selbst baut.
- [ ] Client und Server bauen für dieselbe Erlaubnis und Nonce denselben Hash, und die zweite Einrichtung geht weiter durch.
- [ ] Keine Seite und kein SOLL-Bild ändert sich.
- [ ] Kein Gedankenstrich, kein deutscher Bezeichner im Code.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.key`, `*.pem`
- `src/**` außer `src/handoff/routes.ts` (nur `POST /h/{code}/payout` und die Daten von `payout-passkey`), `src/konto/payout.ts` (nur
  `finishPayout` und ein Helfer zum Vergleich daneben), `src/public/money.ts` (nur die Daten am Knopf von `payout-passkey`) und `src/public/konto-client/{main,flow}.mjs`
  samt `konto.js`; insbesondere `sendPayout`, `settlePendingPayout`, `src/konto/permission.ts`, `src/konto/account.ts`,
  `src/konto/chain.ts`, `src/konto/bridge.ts`, `src/db.ts`, `src/app.ts`
- `mcp/**`, `ops/**` (auch `ops/konto/**`, `ops/soll*.mjs`, `ops/browser.mjs`), jedes Bild unter `docs/soll/`, `docs/**` außer dem
  Absatz „Mit der alten Erlaubnis“ in `docs/konto/euro.md`
- jede Transaktion auf einer echten Kette, jeder Aufruf bei Turnkey, Bridge oder einem RPC, jeder Lauf von `ops/konto/*.mjs`
- `ROADMAP.md`, `docs/kette.md`, alle Goal-Dateien außer dieser (eingefroren), jede Zeile einer `ANNAHMEN.md` außer `## Goal 13`
- ein neues Paket, ein Test, der gestrichen, übersprungen oder schwächer wird
- ein API-Schlüssel, ein privater Schlüssel, ein Testschlüssel als Literal, eine IBAN außer `EXAMPLE_IBAN` oder ein Name eines Kunden
  in Repo, Log, Ausgabe, Kommentar oder Fixture
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-18 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7 gebaut: `finishPayout` nimmt `replaced` und speichert bei Abweichung nichts, die Route verbrennt dann den Handoff mit 410, die Seite trägt `data-revoke-permission`, der Client baut Widerruf und Hash selbst, `konto.js` neu, Annahmen und `euro.md` nachgezogen. Prüfbefehle: P1 `1`, `4`, `0`, vitest 8 Dateien 66 Tests Exit 0; P2 `exit=0` `3 3`, Merge-Basis `2 1 passed`, `faelle ok`; P3 `0`, `1`, `2`, `1`, `1`, `exit=0`, vitest 5 Dateien 32 Tests Exit 0; P4 `exit=0` `4 4`, Merge-Basis `3 1 passed`, `faelle ok`, `1`; P5 `bilder gleich`, `exit=0` und `1` (`16 images, blocks end 390=655 1440=684, 0 defects`); P6 `8`, `3`, `1`, `1`; P7 `0`, `0`, `schnittstelle gleich`, `0`, `pakete gleich`, `goals gleich`, `0`, `check` Exit 0 (2413 Tests), Netz `1` (Job `check` an PR #286 pass).
- 2026-11-19 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7; `dev` hatte nichts Neues, alle Prüfbefehle am Kopf bdd4513 erneut gefahren. Prüfbefehle: P1 `1`, `4`, `0`, vitest 66 Tests Exit 0; P2 `exit=0` `3 3`, Merge-Basis `2 1 passed`, `faelle ok`; P3 `0`, `1`, `2`, `1`, `1`, `exit=0`, vitest 32 Tests Exit 0; P4 `exit=0` `4 4`, Merge-Basis `3 1 passed`, `faelle ok`, `1`; P5 `bilder gleich`, `exit=0` und `1`; P6 `8`, `3`, `1`, `1`; P7 `0`, `0`, `schnittstelle gleich`, `0`, `pakete gleich`, `goals gleich`, `0`, `check` Exit 0 (2413 Tests), Netz `1`; Jobs `check` und `e2e` an PR #286 am Kopf pass.
- 2026-11-19 Zyklus 3: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7; `dev` (586957e) in den Goal-Branch gemergt, den Konflikt in `goals/konto/ANNAHMEN.md` mit beiden Abschnitten gelöst (zuerst „Abgelöst durch konto 05“ von `dev`, dann „Goal 13“), PR #286 wieder ohne Konflikt. Prüfbefehle am Merge 6217002: P1 `1`, `4`, `0`, vitest 66 Tests Exit 0; P2 `exit=0` `3 3`, Merge-Basis `2 1 passed`, `faelle ok`; P3 `0`, `1`, `2`, `1`, `1`, `exit=0`, vitest 32 Tests Exit 0; P4 `exit=0` `4 4`, Merge-Basis `3 1 passed`, `faelle ok`, `1`; P5 `bilder gleich`, `exit=0` und `1`; P6 `8`, `3`, `1`, `1`; P7 `0`, `0`, `schnittstelle gleich`, `0`, `pakete gleich`, `goals gleich`, `0`, `check` Exit 0 (2413 Tests, 361 s bei Last 434 auf 30 Kernen), Netz `1`; Jobs `check` und `e2e` an PR #286 für 6217002 pass.
- 2026-11-19 Release: PASS K und B (Zyklus 3), DONE.

## Blockers
