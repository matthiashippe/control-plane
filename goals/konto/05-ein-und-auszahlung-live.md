# Konto Goal 05: Ein- und Auszahlung live

## Status
ACTIVE

## Active Objective
Wer aus Claude Code einen Automaton betreibt und keine Wallet hat, bringt Geld per Karte auf sein Konto und bekommt die Einnahmen
seines Automatons in Euro auf sein Bankkonto, ohne dass wir je Kundengeld oder einen Schlüssel halten. `deposit` öffnet über den
Handoff aus konto 02 den Karten-Onramp, den Turnkey anbietet (`INIT_FIAT_ON_RAMP`), und das USDC landet direkt in der Smart Wallet
des Kunden. `payout` und `set_payout_rule` (etwa alles über 20 USD jeden Montag) zahlen nur an seine feste Auszahladresse bei
Bridge: Die erste Auszahlung führt über den Handoff zur Identitätsprüfung von Bridge, zur IBAN und zu einer zweiten Erlaubnis, die
der Kunde mit seinem Passkey unterschreibt. Ihr Spender ist eine Weiterleitung `PayoutForwarder` ohne Eigentümer, deren einziges Ziel
on-chain die Auszahladresse ist. Credits bleiben unauszahlbar (Regel 10); ausgezahlt wird nur USDC auf dem Konto des Kunden.
Matthias trägt die Ausnahme für das Hauptnetz in Regel 10 ein, und HTC beginnt die Firmenprüfung bei Bridge (Human Gate). Dazu
kommen der QR-Code für das dunkle Terminal, der RPC-Fehler, der den Handoff nicht mehr verbrennt, und das gemerkte Periodenende in
`topUpIfLow` (`ROADMAP.md`, konto 05; Grundsatz in `docs/kette.md`, Abschnitt konto).
Widerlegt, wenn eine Auszahlung an eine andere Adresse als die feste des Kunden durchgeht.
Übernimmt goals/_vorschlaege/konto-kritik-2026-11-13-2.md, goals/_vorschlaege/konto-kritik-2026-11-15-1.md und
goals/_vorschlaege/konto-kritik-2026-11-15-2.md.
MVP: Funktion, weil ein Automaton, der verdient, ohne Auszahlung in Euro nichts für seinen Menschen wert ist, und weil ein Mensch ohne
Wallet ohne Karte kein Geld auf sein Konto bekommt.

## Voraussetzungen
- konto Goal 04 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Mensch ohne Wallet tippt in Claude Code „zahl 20 Euro ein“ oder „zahl alles über 20 Dollar jeden Montag
  aus“, scannt beim ersten Mal einen QR-Code, und das Geld kommt auf sein Konto oder auf sein Bankkonto, während eine
  Prompt-Injection im Terminal höchstens sein eigenes Geld auf sein eigenes Bankkonto schicken kann.
- Entscheidung des Tech Lead zum Schnitt: Echter Euro fließt in diesem Goal noch nicht. Die Handy-Seite läuft nur unter
  `postyourprice.com` (RP ID der Passkeys, erlaubte Origin bei Turnkey), also erst nach dem Merge in der Produktion, und dort ist das
  Konto heute aus (kein `CP_KONTO_*` auf dem Server). Dieses Goal baut und belegt alles bis zum Schalter: im Harness gegen
  nachgebildete Antworten von Bridge und Onramp, auf Base Sepolia echt mit Passkey und Weiterleitung, und mit dem Code für das
  Hauptnetz, der erst nach der Ausnahme in Regel 10 entsteht. Das Einschalten in der Produktion und die erste echte Einzahlung und
  Auszahlung von Matthias sind konto 06; `## Für konto 06` in `docs/konto/euro.md` beschreibt sie.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte):
  1. Zuerst die Klärung (Punkt 1) aus der aktuellen Doku, Commit, Push. Sie entscheidet die Einzahlung; die Auszahlung steht unten
     fest und wird nur belegt.
  2. Dann die SOLL-Bilder (Punkte 2 und 3), Commit, Push, den Design Reviewer auf dem Topic dieses Goals mit allen Bildpfaden und dem
     Commit erwähnen und die Zeile `Abnahme-Issue money: PRO-<n>` in `docs/soll/README.md` setzen. Bis „SOLL abgenommen“ dasteht,
     ändert der Maker nichts unter `src/public/` (Punkt 4 prüft das an den Zeitstempeln). Die vorhandenen Zeilen `Abnahme-Issue…`
     bleiben, wie sie sind.
  3. Während der Abnahme die drei übernommenen Reparaturen (Punkte 6, 7 und 8), dann Weiterleitung, Auszahlung, Regel, Einzahlung,
     Tools und Harness (Punkte 9 bis 14), je Punkt Commit und Push.
  4. Nach der Abnahme die Seite (Punkt 5), dann der Lauf auf Base Sepolia (Punkt 15).
  5. Dann das Human Gate (unten), danach Punkt 16, zuletzt Doku, Annahmen und Punkt 18.
- Human Gate, sobald die Punkte 1 bis 15 grün sind: `## Status` auf `BLOCKED matthias`, unter `## Blockers` je eine Zeile `Art:
  matthias`, `Gate: security_settings`, `Aufgabe:`, `Worum:` und `Empfehlung:`. Die Aufgabe hat zwei Teile, beide ohne Geld:
  (a) Regel 10 bekommt unter der Ausnahme Base Sepolia diesen Absatz, den nur Matthias in `loop-constraints.md` auf `dev` einträgt:
  „**Ausnahme Hauptnetz** (Matthias, <Datum>, für das Topic konto): Auf Base (chainId 8453) sendet das Control Plane nur
  `approveWithSignature`, `revokeAsSpender` und `spend()` von Erlaubnissen, die ein Kunde mit seinem Passkey unterschrieben hat, dazu
  das Anlegen und den Aufruf seiner Weiterleitung `PayoutForwarder`, deren einziges Ziel seine feste Auszahladresse ist. Gas zahlt ein
  eigener Schlüssel, nie der Schlüssel der Betreiber-Wallet. Eingeschaltet wird das nur mit `CP_KONTO_MAINNET=1` in
  `/opt/control-plane/.env`, die nur Matthias setzt. Credits bleiben unauszahlbar.“ (b) die Anfrage an den Vertrieb von Bridge für
  HTC als Plattform mit EUR und SEPA, als fertiger Entwurf mit Betreff und Text unter `Empfehlung:`, den Matthias selbst sendet
  (`third_party_mail`), und die Liste der Unterlagen aus `docs/konto/euro.md`, Abschnitt `## Für konto 06`. Commit, Push. Das Goal
  läuft weiter, sobald der Absatz aus (a) auf `origin/dev` steht (Punkt 16 prüft das); auf (b) wartet erst konto 06.
- Entscheidungen des Tech Lead (Maker schreibt sie mit Grund unter `## Goal 05` in `goals/konto/ANNAHMEN.md`):
  1. Auszahlung über eine Weiterleitung, nicht über eine Unterschrift je Auszahlung: Eine Spend Permission zahlt nur an ihren
     Spender, und nur er darf `spend()` aufrufen (`docs/konto/anbieter.md`, Abschnitt konto 05). Deshalb ist der Spender der zweiten
     Erlaubnis ein Vertrag `PayoutForwarder` (`src/konto/contracts/PayoutForwarder.sol`, Solidity, ohne Eigentümer und ohne Funktion
     zum Ändern) mit den unveränderlichen Werten `account`, `destination`, `token`, `manager` und `caller` (die Adresse unseres
     Gasschlüssels). Er hat genau drei Funktionen mit Wirkung: `payout(SpendPermission p, uint160 value)` verlangt
     `msg.sender == caller`, prüft `p.account == account`, `p.spender == address(this)` und `p.token == token`, ruft
     `manager.spend(p, value)` und überweist im selben Aufruf `value` an `destination`; `retire(SpendPermission p)` verlangt
     `msg.sender == caller` und ruft `manager.revokeAsSpender(p)`; `flush()` überweist das ganze USDC des Vertrags an `destination`.
     Kein `delegatecall`, kein `selfdestruct`, kein `receive` für ETH. Der feste Aufrufer verhindert, dass ein Fremder das Konto am
     Betrag vorbei, den der Mensch behalten will, auf sein Bankkonto leert; selbst unser Schlüssel kann nur an `destination` zahlen.
     Angelegt wird der Vertrag per CREATE2 über den Deterministic Deployment Proxy `0x4e59b44847b379578588920ca78fbf26c0b4956c` mit
     Salt 0; `forwarderAddress` in `src/konto/payout.ts` rechnet die Adresse aus `account` und `destination` (dazu Token, Manager und
     Aufrufer aus der Einstellung) voraus, und die Seite lässt genau diese Adresse als Spender unterschreiben. Der Vertrag entsteht bei
     der ersten Auszahlung. Darum darf die Regel ohne Handy laufen.
  2. Die zweite Erlaubnis: Token USDC, Spender die Weiterleitung, `allowance` 2^160 minus 1, `period` 2.592.000 s, `end` 2^48 minus
     1, eigener `salt`. Keine Grenze, weil das Ziel on-chain fest ist und eine Grenze nur den Kunden von seinem eigenen Geld
     abhielte. Eine neue IBAN heißt neue Auszahladresse, neue Weiterleitung und neue Unterschrift über den Handoff; vor der nächsten
     Auszahlung ruft der Server `retire` der alten Weiterleitung mit der alten Erlaubnis und zahlt danach nur noch über die neue.
  3. Der Handoff `step: "payout"` braucht den API-Schlüssel (sonst 401) und läuft nach der richtigen Zahl über die Zustände
     `payout-verify` (Link von Bridge zur Identitätsprüfung, `POST /v0/kyc_links`; weiter erst, wenn Bridge `approved` meldet),
     `payout-bank` (IBAN und Name des Kontoinhabers; der Server legt bei Bridge das externe Konto und die Auszahladresse für Base, USDC,
     SEPA und EUR an und speichert nur die Kennungen, die Adresse und die letzten vier Stellen der IBAN) und `payout-passkey`
     (Unterschrift der zweiten Erlaubnis). Ist der Kunde bei Bridge schon geprüft, entfällt `payout-verify`. Erst nach `done` zahlt
     der Server die erste Auszahlung aus.
  4. `POST /v1/konto/payout` mit API-Schlüssel und `amount_usd` als Text in Dollar oder `all: true`: Ohne zweite Erlaubnis 409 mit
     `error: "payout_needs_phone"`. Sonst sendet der Server über `sendKontoTx` bei Bedarf das Anlegen der Weiterleitung, beim ersten
     Mal `approveWithSignature` und dann `payout` der Weiterleitung. Jedes Feld, das ein Ziel nennen könnte (`to`, `destination`,
     `address`, `iban`), ergibt 400 `invalid_arguments` ohne Transaktion. Höchstens das USDC, das `balanceOf` für die Smart Wallet
     meldet; mehr ergibt 400 `insufficient_balance`, unter 1,00 USD 400 `below_minimum` (Mindestbetrag der Route bei Bridge). Credits
     liest diese Route nie.
  5. `POST /v1/konto/payout-rule` mit API-Schlüssel und `keep_usd` und `weekday` (`monday` bis `sunday`) oder `off: true`. Ein Lauf je
     Stunde aus `src/index.ts` (`setInterval` mit `unref`) zahlt am Wochentag der Regel (UTC) einmal am Tag den Kontostand minus
     `keep_usd` aus, wenn das mindestens 1,00 USD sind. Fehlt die zweite Erlaubnis, zahlt er nichts und loggt `payout_needs_phone`.
     Die Funktion `runPayoutRules(deps, nowMs)` bekommt die Uhr von außen.
  6. Einzahlung: `step: "deposit"` mit API-Schlüssel und `amount_usd`. Nach der richtigen Zahl zeigt die Seite `deposit-card`, und
     ein Knopf startet den Onramp, den Punkt 1 entscheidet (Vorgabe: `initFiatOnRamp` von `@turnkey/core` mit MoonPay), mit der Smart
     Wallet aus dem Konto des Schlüssels als Ziel, Base, USDC und dem Betrag. Die Adresse setzt der Server in die Seite; ein Feld
     `wallet_address` im Body ergibt 400. Der Handoff ist `done`, sobald die Seite meldet, dass der Onramp geöffnet ist; das Geld
     zeigt danach `automaton_status` als `balance_usd`. Entscheidet Punkt 1, dass kein Anbieter per Karte in Deutschland direkt in
     die Smart Wallet zahlt, gilt die dort entschiedene Alternative, und der Maker schreibt sie mit Grund in die Annahmen.
  7. RPC-Fehler: `signatureValid` gibt für eine ungültige Unterschrift weiter `false` zurück, wirft aber bei einem Fehler des
     Transports `SignatureCheckUnavailable`. Die Passkey-Routen (`/h/:code/konto`, `/h/:code/limit` und neu die der Auszahlung)
     antworten darauf 503 mit `error: "signature_check_unavailable"`, der Handoff bleibt `matched`, und die Seite zeigt den Zustand
     `retry` und schickt beim Tippen dieselbe Unterschrift noch einmal, ohne zweiten Passkey und ohne zweite Sub-Organisation.
  8. Periodenende: `topUpIfLow` merkt sich je Konto das Ende der Periode, in der `period_used_up` galt, und meldet bis dahin ohne
     Aufruf ans Netz `period_used_up`; eine Erlaubnis mit `end` in der Vergangenheit ergibt `permission_expired` ohne Aufruf. Eine
     Erhöhung aus konto 04 löscht das Gemerkte, damit die neue Erlaubnis sofort zählt.
  9. QR-Code: `qrText` zeichnet die hellen Module als Blöcke und legt eine Ruhezone von vier hellen Modulen um den Code, weil Claude
     Code im dunklen Terminal helle Zeichen auf dunklem Grund zeigt. `qr` in `POST /v1/handoff` und in `start_automaton` ist genau
     dieser Text.
  10. Hauptnetz: `export const MAINNET_CHAIN_ID = 8453` in `src/konto/config.ts`. `readKontoConfig` nimmt 8453 nur mit
      `CP_KONTO_MAINNET=1` an, dann mit USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` und `https://mainnet.base.org` als Vorgabe;
      ohne den Schalter bleibt 8453 ein Fehler beim Start wie heute. `requireSepolia` wird `requireKontoChain(chainId, config)`, die
      nur die eingestellte Kette durchlässt. Dieser Code entsteht erst nach dem Absatz „Ausnahme Hauptnetz“ auf `origin/dev`. Im
      Hauptnetz sendet dieses Goal nichts.
  11. Bridge erreicht der Server über `CP_BRIDGE_URL` (Vorgabe `https://api.bridge.xyz`) mit dem Schlüssel aus der Datei
      `CP_BRIDGE_KEY_FILE` (Header `Api-Key`); fehlt sie, antworten `step: "payout"` und die Regel 503. Ein eigenes Modul
      `src/konto/bridge.ts` mit `fetch` von außen; Felder und Pfade aus der Doku von Bridge, festgehalten in Punkt 1.
- Die Fläche: sieben neue Zustände der Handy-Seite. `deposit-approve` und `payout-approve` sind die Wahl der Zahl wie `approve` aus
  konto 02 mit dem Block `data-soll="approve"`, zeigen aber, was geschieht („Add $20.00 to Atlas“, „Send money from Atlas to your
  bank account“). `deposit-card` (Block `card`) nennt Betrag und Karte und hat einen Knopf. `payout-verify` (Block `verify`) sagt,
  dass Bridge einmal die Identität prüft, mit einem Knopf. `payout-bank` (Block `bank`) hat ein Feld `name="iban"` und einen Knopf.
  `payout-passkey` (Block `payout`) sagt in der Überschrift, was beim Tippen passiert, darunter in einer Zeile „PostYourPrice can
  send money from Atlas only to your bank account ending 3000.“, einen Knopf. `retry` (Block `retry`) sagt, dass die Prüfung gerade
  nicht ging, und hat einen Knopf „Tap again“. Jeder Block endet im ersten Bildschirm (844 px bei 390, 900 px bei 1440). Abbruch und
  Fehler zeigen den Zustand `fehlgeschlagen` aus konto 03 unverändert. Quellen `docs/soll/src/money-<zustand>.html`, Bilder
  `docs/soll/money-<zustand>-<breite>.png`, vierzehn Stück, Beispielwerte erfunden (Name `Atlas`, 20.00 USD, Beispiel-IBAN
  `DE89 3704 0044 0532 0130 00`). Werkzeuge `ops/soll-money.mjs` (rendern, `--check`, `--source <ordner>`) und
  `ops/soll-live-money.mjs` nach dem Muster von `ops/soll-limit.mjs` und `ops/soll-live-limit.mjs`, die unverändert bleiben. Das
  Flag heißt von Anfang an `--check` und die Summenzeile ist englisch (Grundregel 12, Vorschlag konto-kritik-2026-11-16-1). Ein
  unbekanntes Argument endet mit Exit 1 ohne Bild. Höchstens vier neue Klassen, jede mit Grund als `` `.<klasse>` `` unter einem
  Abschnitt `## Geld /h/{code}` in `docs/soll/README.md`. Die Seite rendert alle sieben Zustände aus `src/public/money.ts`.
- Die SOLL-Werkzeuge von konto 02 bis 04 benennt seite 03 um (`--pruefen` wird `--check`, die Summenzeilen englisch). Die
  Prüfbefehle dieses Goals für diese Werkzeuge lesen deshalb das Flag aus dem Werkzeug und nehmen beide Summenzeilen an; dieses
  Goal ändert keines davon.
- Text: Englisch wie die Seite aus konto 02 bis 04, ebenso Tool-Beschreibungen, Skill und `mcp/README.md`. Kein Wort, das der
  Nutzer erst übersetzen muss (`handoff`, `token`, `wallet`, `smart`, `permission`, `sepolia`, `turnkey`, `erc`, `allowance`,
  `liquidation`, `onramp`, `kyc`, `forwarder`, `spender`, `usdc`); „passkey“, „IBAN“, „card“, „identity“ und die Namen Bridge und
  MoonPay stehen. Der Skill sagt Claude, dass `payout` beim ersten Mal einen QR-Code bringt und danach ohne Handy zahlt, und dass
  Geld nur auf das Bankkonto des Menschen gehen kann.
- Der Harness-Lauf `harness/e2e/money.mjs` (in `harness/e2e/full.sh`, auf der Chain 84532 aus konto 03, Weiterleitung und Proxy per
  `anvil_setCode` wie in `harness/e2e/konto-chain.mjs`): ein Konto über `start_automaton` wie in `terminal.mjs`, `deposit` über den
  nachgebildeten Onramp (er schreibt Test-USDC an die Smart Wallet), `payout` beim ersten Mal über den nachgebildeten Handoff mit
  Bridge-Nachbildung (Identität, IBAN, Unterschrift mit einem lokalen Konto aus viem als Eigentümer), USDC kommt an der
  Auszahladresse an, eine zweite Auszahlung ohne Handoff, ein `spend()` mit der zweiten Erlaubnis direkt von unserem Schlüssel
  scheitert on-chain, ein `payout` über eine Weiterleitung mit anderem Ziel scheitert on-chain, ein `payout` von einer fremden
  Adresse an die richtige Weiterleitung scheitert on-chain, `set_payout_rule` speichert die
  Regel. Bridge- und Onramp-Nachbildung als Dienst in `harness/docker-compose.yml` oder als Prozess aus `full.sh`, Code unter
  `harness/money-mock/`. Letzte Zeile `MONEY_VERDICT ok`. Kein Browser. `harness/e2e/terminal.mjs` bleibt grün.
- Der Lauf auf Base Sepolia (`ops/konto/sepolia-payout-run.mjs`, Ablauf und Chromium mit virtuellem Authenticator wie
  `ops/konto/sepolia-limit-run.mjs`, frische Datenbank aus `mktemp -d`, freier Port auf `127.0.0.1`, Bridge nachgebildet): ein neues
  Konto, die Testadresse zahlt 8 Test-USDC an das Konto, die zweite Erlaubnis mit demselben Passkey für eine frische eigene Adresse
  als Ziel, Anlegen der Weiterleitung, Auszahlung von 3 USD, dann ein `spend()` der zweiten Erlaubnis direkt von unserem Schlüssel
  und ein `payout` über eine zweite Weiterleitung mit anderem Ziel, beide mit festem Gas, die on-chain scheitern. Die Werte stehen in
  `docs/konto/sepolia-payout.md` als Zeilen `konto: 0x…`, `ziel: 0x…`, `forwarder: 0x…`, `forwarder-fremd: 0x…`, `erlaubnis: 0x…`,
  `anlage: 0x…`, `auszahlung: 0x…`, `fremd-spend: 0x…` und `fremd-ziel: 0x…`. Turnkey-Werte und Testschlüssel liegen seit konto 03 auf
  dem code-host; kein Human Gate. Reicht das Test-Geld nicht, setzt der Maker `BLOCKED matthias` mit Aufgabe Faucet wie in konto 03.
- Der Vertrag wird mit `solc` aus der Registry übersetzt (höchstens ein neues Paket für die Entwicklung, Version fest); das Ergebnis
  steht als `FORWARDER_BYTECODE` und `FORWARDER_ABI` in `src/konto/forwarder.ts`, weil der Server ohne Entwicklungspakete läuft, und
  ein Test übersetzt die Quelle ohne Netz und vergleicht.
- Die SOLL-Befehle laufen mit `FONTCONFIG_FILE=~/.config/control-plane/soll-fonts.conf` wie in konto 04. Ein Prüfbefehl, der nur
  deshalb Mängel meldet, ist ein Umgebungsproblem und steht so im Progress Log.
- Kein Schlüssel im Repo, auch nicht in Fixtures: Tests nutzen die bekannten Schlüssel von anvil oder `generatePrivateKey()` zur
  Laufzeit, API-Schlüssel in Tests sind erfunden und haben nicht die Form `cnwy_k_` gefolgt von 16 Zeichen, IBANs in Tests und
  Bildern sind nur die Beispiel-IBAN. Prüfbefehle ohne Netz binden keinen festen Port (`app.request`, kein `serve`), Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Jeder neue
  Test war einmal rot, die Zeile im Progress Log sagt, womit.
- Was danach schneller zu mehr zahlenden Kunden führt: konto 06 schaltet das Konto in der Produktion ein (Server-Werte und Gas von
  Matthias, Bridge nach der Firmenprüfung) und belegt die erste echte Einzahlung per Karte und die erste Auszahlung in Euro.

## Done Condition
- [x] Aus der aktuellen Doku steht fest, wie Geld per Karte in Deutschland direkt in die Smart Wallet eines Kunden kommt und welche
      Aufrufe von Bridge Identitätsprüfung, IBAN und Auszahladresse brauchen; Einzahlung und Auszahlung sind entschieden.
      MVP: Funktion, weil keiner der Euro-Anbieter aus konto 01 eine Karte in Deutschland anbietet und der Bau sonst gegen geratene
      Felder entsteht.
      Prüfung: `node -e 'const d=require("fs").readFileSync("docs/konto/euro.md","utf8");const L=d.split("\n");const bad=[];for(const h of ["## Einzahlung","## Auszahlung","## Weiterleitung","## Regel","## Hauptnetz","## Entscheidung","## Für konto 06"])if(!L.includes(h))bad.push(h);const q=[...d.matchAll(/\[Quelle\]\((https:\/\/[^)\s]+)\)/g)].length;if(q<12)bad.push("quellen "+q);if(!/^Einzahlung: .+$/m.test(d))bad.push("einzahlung");if(!/^Auszahlung: .+$/m.test(d))bad.push("auszahlung");if((d.match(/^Grund: .+$/gm)||[]).length<2)bad.push("grund");for(const w of ["INIT_FIAT_ON_RAMP","kyc_links","external_accounts","liquidation_addresses","drains","0x4e59b44847b379578588920ca78fbf26c0b4956c"])if(!d.includes(w))bad.push(w);if(/[\u2013\u2014]/.test(d))bad.push("gedankenstrich");if(bad.length){console.error(bad);process.exit(1)}console.log("euro ok "+q)'` muss `euro ok <n>` mit n mindestens 12 ausgeben.
      Prüfung: `grep -cE "Stand 2026-1[12]-[0-9]{2}" docs/konto/euro.md` muss mindestens 12 ausgeben.
- [x] Die vierzehn SOLL-Bilder für Einzahlung, Auszahlung und erneutes Tippen kommen aus ihren Quellen, ohne Netz und ohne Mangel,
      jeder Block steht ganz im ersten Bildschirm, und die Quellen bauen aus den Bausteinen der Seite.
      MVP: Funktion, weil die Seite nur nach Bild gebaut werden darf und der Mensch ohne Scrollen sehen muss, wohin sein Geld geht.
      Prüfung: `node ops/soll-money.mjs --check` muss Exit 0 haben und als letzte Zeile `soll money: 14 images, blocks end 390=<y> 1440=<y>, 0 defects` ausgeben, mit y bei 390 höchstens 844 und bei 1440 höchstens 900.
      Prüfung: `node -e 'const fs=require("fs");for(const z of ["deposit-approve","deposit-card","payout-approve","payout-verify","payout-bank","payout-passkey","retry"])for(const w of [390,1440]){const b=fs.readFileSync("docs/soll/money-"+z+"-"+w+".png");if(b.readUInt32BE(16)!==w){console.error(z,w);process.exit(1)}}console.log("breiten ok")'` muss `breiten ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const S=["deposit-approve","deposit-card","payout-approve","payout-verify","payout-bank","payout-passkey","retry"];const bad=[];const src={};for(const z of S){const s=fs.readFileSync("docs/soll/src/money-"+z+".html","utf8");src[z]=s;const t=s.replace(/<style[\s\S]*?<\/style>/g,"").replace(/<[^>]+>/g," ");if(/<script/i.test(s))bad.push(z+" script");if(!/<h1[ >]/.test(s))bad.push(z+" h1");if(/(src|srcset)="(https?:)?\/\/|<link[^>]+href="(https?:)?\/\/|url\(["\x27]?(https?:)?\/\//.test(s))bad.push(z+" fremde adresse");if(/[\u2013\u2014]/.test(s))bad.push(z+" gedankenstrich");if(/handoff|token|wallet|smart|permission|sepolia|turnkey|\berc|allowance|liquidation|on-?ramp|\bkyc|forwarder|spender|usdc/i.test(t))bad.push(z+" wort");if(!/Atlas/.test(t))bad.push(z+" name")}const blk=(z,b)=>{const s=src[z]||"";const i=s.indexOf("data-soll=\""+b+"\"");if(i<0)bad.push(z+" block "+b);return i<0?"":s.slice(i)};for(const z of ["deposit-approve","payout-approve"]){const b=blk(z,"approve");if(!/<form[^>]+method="post"/i.test(b))bad.push(z+" form");if(new Set([...b.matchAll(/<button[^>]*value="([0-9]{2})"/g)].map(m=>m[1])).size!==3)bad.push(z+" drei zahlen")}if(!/\$20\.00/.test(blk("deposit-approve","approve")))bad.push("betrag");const c=blk("deposit-card","card");if(!/\$20\.00/.test(c)||!/card/i.test(c)||!/<(a|button)[ >]/i.test(c))bad.push("card");const v=blk("payout-verify","verify");if(!/identity/i.test(v)||!/<(a|button)[ >]/i.test(v))bad.push("verify");const k=blk("payout-bank","bank");if(!/<input[^>]+name="iban"/i.test(k)||!/IBAN/.test(k)||!/<button/i.test(k))bad.push("bank");const p=blk("payout-passkey","payout");if(!/passkey/i.test(p)||!/3000/.test(p)||!/<button/i.test(p))bad.push("payout");const r=blk("retry","retry");if(!/again/i.test(r)||!/<button/i.test(r))bad.push("retry");if(bad.length){console.error(bad);process.exit(1)}console.log("quellen ok")'` muss `quellen ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const css=(fs.readFileSync("src/public/index.html","utf8").match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join("");const q=String.fromCharCode(96);const r=fs.readFileSync("docs/soll/README.md","utf8");const m=r.match(/^## Geld \/h\/\{code\}$([\s\S]*?)(?=^## |$(?![\s\S]))/m);const sec=m?m[1]:"";const cl=new Set();for(const z of ["deposit-approve","deposit-card","payout-approve","payout-verify","payout-bank","payout-passkey","retry"]){const s=fs.readFileSync("docs/soll/src/money-"+z+".html","utf8");for(const x of s.matchAll(/class="([^"]+)"/g))for(const c of x[1].split(/\s+/))if(c)cl.add(c)}const neu=[...cl].filter(c=>!new RegExp("\\."+c.replace(/[.*+?^${}()|[\]\\-]/g,"\\$&")+"(?![\\w-])").test(css));const ohne=neu.filter(c=>!r.includes(q+"."+c+q));const eigen=[...sec.matchAll(new RegExp(q+"\\.([A-Za-z0-9_-]+)"+q,"g"))].length;if(!m||ohne.length||eigen>4){console.error({neu,ohne,eigen});process.exit(1)}console.log("bausteine ok neu="+eigen)'` muss `bausteine ok neu=<n>` mit n höchstens 4 ausgeben.
- [x] Die Auswertung der Geld-Bilder lehnt jeden Mangel ab und lässt den sauberen Stand durch, und Handoff, Konto und Limit prüfen
      sich weiter wie vorher.
      MVP: Funktion, weil ein Bild, das seine Prüfung nicht in beide Richtungen besteht, kein SOLL ist, und weil die Audits von konto 02
      bis 04 ihre Summenzeilen nachts erwarten.
      Prüfung: `pnpm -s vitest run test/soll-money.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/soll-money.test.ts` muss mindestens 8 ausgeben (je ein Fall für Pixelabweichung, Überlauf, Gedankenstrich, fremde Adresse, ein Block unter dem ersten Bildschirm, Wort aus der Sperrliste im sichtbaren Text, unbekanntes Argument mit Exit 1 ohne geschriebenes Bild, sauberer Stand ohne Mangel).
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- docs/soll ':!docs/soll/README.md' ops/soll.mjs ops/soll-live.mjs ops/soll-handoff.mjs ops/soll-live-handoff.mjs ops/soll-konto.mjs ops/soll-live-konto.mjs ops/soll-limit.mjs ops/soll-live-limit.mjs test/soll.test.ts test/soll-handoff.test.ts test/soll-konto.test.ts test/soll-limit.test.ts && echo bestand gleich` muss `bestand gleich` ausgeben (kein vorhandenes Bild, keine vorhandene Quelle und keines dieser Werkzeuge geändert).
      Prüfung: `F=$(grep -q '"--check"' ops/soll-handoff.mjs && echo --check || echo --pruefen); node ops/soll-handoff.mjs $F | tail -1 | grep -cE '^soll handoff: 6 (Bilder|pictures), freigabe (oben|top) 390=[0-9]+ 1440=[0-9]+, 0 (Mängel|defects)$'` muss `1` ausgeben.
      Prüfung: `F=$(grep -q '"--check"' ops/soll-konto.mjs && echo --check || echo --pruefen); node ops/soll-konto.mjs $F | tail -1 | grep -cE '^soll konto: 4 (Bilder|pictures), passkey (oben|top) 390=[0-9]+ 1440=[0-9]+, 0 (Mängel|defects)$'` muss `1` ausgeben.
      Prüfung: `F=$(grep -q '"--check"' ops/soll-limit.mjs && echo --check || echo --pruefen); node ops/soll-limit.mjs $F | tail -1 | grep -cE '^soll limit: 4 images, approve top 390=[0-9]+ 1440=[0-9]+, limit top 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss `1` ausgeben.
- [x] Der Design Reviewer hat genau diese Bilder abgenommen, bevor sich unter `src/public/` etwas änderte.
      MVP: Funktion, weil die Seite 1:1 nach einem abgenommenen Bild entsteht und nicht nach einer Beschreibung.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue money: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- 'docs/soll/money-*.png' 'docs/soll/src/money-*.html'); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/public | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok)<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [x] Die echte Seite in allen sieben neuen Zuständen ist pixelgleich mit den abgenommenen Bildern, eine geänderte Überschrift fällt
      dabei auf, und die Zustände aus konto 02 bis 04 bleiben pixelgleich.
      MVP: Funktion, weil der Mensch auf dem Handy sehen muss, was das Bild verspricht, bevor er sein Bankkonto freigibt.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-money.mjs --out $T && node ops/soll-money.mjs --check --source $T` muss Exit 0 haben und als letzte Zeile `soll money: 14 images, blocks end 390=<y> 1440=<y>, 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i '0,/<h1>/s/<h1>/<h1>X /' $T/src/public/money.ts; grep -q '<h1>X ' $T/src/public/money.ts || echo sed-miss; (cd $T && node --import tsx ops/soll-live-money.mjs --out $T/out); node ops/soll-money.mjs --check --source $T/out; echo "exit=$?"` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `T=$(mktemp -d); F=$(grep -q '"--check"' ops/soll-handoff.mjs && echo --check || echo --pruefen); node --import tsx ops/soll-live-handoff.mjs --out $T && node ops/soll-handoff.mjs $F --source $T | tail -1 | grep -cE '^soll handoff: 6 (Bilder|pictures), freigabe (oben|top) 390=[0-9]+ 1440=[0-9]+, 0 (Mängel|defects)$'` muss `1` ausgeben.
      Prüfung: `T=$(mktemp -d); F=$(grep -q '"--check"' ops/soll-konto.mjs && echo --check || echo --pruefen); node --import tsx ops/soll-live-konto.mjs --out $T && node ops/soll-konto.mjs $F --source $T | tail -1 | grep -cE '^soll konto: 4 (Bilder|pictures), passkey (oben|top) 390=[0-9]+ 1440=[0-9]+, 0 (Mängel|defects)$'` muss `1` ausgeben.
      Prüfung: `T=$(mktemp -d); F=$(grep -q '"--check"' ops/soll-limit.mjs && echo --check || echo --pruefen); node --import tsx ops/soll-live-limit.mjs --out $T && node ops/soll-limit.mjs $F --source $T | tail -1 | grep -cE '^soll limit: 4 images, approve top 390=[0-9]+ 1440=[0-9]+, limit top 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss `1` ausgeben.
      Prüfung: `{ grep -cE '</?(html|head|body|main|section|div|form|button|input|h1|h2|p|span|style|meta|link|br)[ >/]|data-soll|docs/soll' ops/soll-live-money.mjs || true; }` muss `0` ausgeben.
- [x] Der QR-Code, den Terminal und `start_automaton` zeigen, liest eine Kamera im dunklen Terminal, ohne dass der Leser die Farben
      umkehrt. Der Test war vor dem Fix rot.
      MVP: Funktion, weil Claude Code dunkel startet und der Mensch sonst beim ersten Schritt an einem QR-Code hängt, den sein Handy
      nicht liest (Vorschlag konto-kritik-2026-11-13-2).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/handoff-qr.test.ts test/handoff-api.test.ts test/mcp-automaton.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/handoff-qr.test.ts` muss mindestens 4 ausgeben (je ein Fall: genau der Text `qr` aus `POST /v1/handoff`, gezeichnet als helle Zeichen auf dunklem Grund, ergibt mit jsQR und `inversionAttempts: "dontInvert"` die `url`; derselbe Text als dunkle Zeichen auf hellem Grund ergibt mit `dontInvert` nichts; die Ruhezone ist auf jeder Seite mindestens vier Module hell; jede Zeile ist gleich breit).
      Prüfung: `grep -c 'dontInvert' test/handoff-qr.test.ts` muss mindestens `1` ausgeben.
      Prüfung: `grep -nE 'jsQR\(' test/*.ts | grep -vc 'dontInvert'` muss `0` ausgeben (kein Rücklesetest mehr, der beide Polaritäten versucht).
- [x] Ein Fehler des RPC beim Prüfen der Unterschrift verbrennt keinen Handoff mehr: Die Route antwortet 503, der Handoff bleibt
      `matched`, und die Seite schickt dieselbe Unterschrift beim nächsten Tippen noch einmal. Der Test war vor dem Fix rot.
      MVP: Funktion, weil der Mensch sonst bei einem Aussetzer des RPC einen zweiten Passkey und eine zweite Sub-Organisation bekommt,
      obwohl er alles richtig gemacht hat (Vorschlag konto-kritik-2026-11-15-1).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-signature-retry.test.ts test/konto-account.test.ts test/konto-limit.test.ts test/konto-client.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-signature-retry.test.ts` muss mindestens 6 ausgeben (je ein Fall: Schritt konto mit werfendem `verifyClient` ergibt 503 `signature_check_unavailable` und der Handoff bleibt `matched`; derselbe Body danach mit funktionierendem `verifyClient` ergibt `done` und den API-Schlüssel genau einmal; eine ungültige Unterschrift ergibt weiter 400 und `burned`; Schritt limit mit werfendem `verifyClient` ergibt 503 und die alte Erlaubnis gilt weiter; der Passkey-Schritt der Auszahlung ebenso; der Client der Seite zeigt nach 503 `retry`, schickt beim Tippen dieselbe Unterschrift und ruft `signUpWithPasskey` genau einmal).
      Prüfung: `grep -c 'signature_check_unavailable' src/handoff/routes.ts` muss mindestens `1` ausgeben.
- [x] Ist die Periode verbraucht oder die Erlaubnis abgelaufen, fragt `topUpIfLow` das Netz bis zum Ende der Periode nicht mehr. Der
      Test war vor dem Fix rot.
      MVP: Funktion, weil ein Agent mit leerem Konto sonst bei jeder Anfrage den RPC fragt und dessen Ratenlimit trifft, über den auch
      die Anmeldung neuer Konten ihre Unterschrift prüft (Vorschlag konto-kritik-2026-11-15-2).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-topup-period.test.ts test/konto-topup.test.ts test/konto-topup-pending.test.ts test/konto-limit-period.test.ts test/konto-limit-switch.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-topup-period.test.ts` muss mindestens 4 ausgeben (je ein Fall: nach `period_used_up` ruft ein zweiter Lauf vor dem Periodenende `spentThisPeriod` nicht auf und meldet `period_used_up`; nach dem Periodenende fragt er wieder; eine Erlaubnis mit `end` in der Vergangenheit ergibt `permission_expired` mit null Aufrufen an die Chain; nach einer Erhöhung aus konto 04 fragt der nächste Lauf sofort).
      Prüfung: `grep -c 'permission_expired' src/konto/topup.ts` muss mindestens `1` ausgeben.
- [x] Die Weiterleitung kann nur an ihr festes Ziel zahlen: Die Quelle übersetzt ohne Netz zu genau dem Bytecode, den der Server
      anlegt, hat keine Funktion außer `payout`, `retire`, `flush` und den Lesern ihrer festen Werte, und ihre Adresse hängt an Konto
      und Ziel.
      MVP: Funktion, weil an diesem Vertrag die Widerlegung des Goals hängt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-forwarder.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-forwarder.test.ts` muss mindestens 5 ausgeben (je ein Fall: `solc` übersetzt `src/konto/contracts/PayoutForwarder.sol` ohne Netz zu `FORWARDER_BYTECODE`; die ABI nennt genau `account`, `destination`, `token`, `manager`, `caller`, `payout`, `retire` und `flush`; der Laufzeitcode enthält kein `DELEGATECALL`, `CALLCODE` und `SELFDESTRUCT` außerhalb von PUSH-Daten; `forwarderAddress` ergibt die CREATE2-Adresse über den Proxy mit Salt 0 und ist für ein anderes Ziel oder ein anderes Konto eine andere; der Konstruktor nimmt genau `account`, `destination`, `token`, `manager` und `caller`).
      Prüfung: `grep -ciE "delegatecall|selfdestruct|owner|setDestination|receive\(" src/konto/contracts/PayoutForwarder.sol` muss `0` ausgeben.
      Prüfung: `grep -c "immutable" src/konto/contracts/PayoutForwarder.sol` muss mindestens `5` ausgeben.
      Prüfung: `grep -c "msg.sender == caller" src/konto/contracts/PayoutForwarder.sol` muss mindestens `2` ausgeben.
- [x] Die erste Auszahlung führt über den Handoff zu Identität, IBAN und einer zweiten Erlaubnis, deren Spender die Weiterleitung zum
      festen Ziel ist; jede weitere zahlt mit dem API-Schlüssel nur dorthin, nie mehr als das USDC auf dem Konto und nie aus Credits.
      MVP: Funktion, weil der Mensch seine Einnahmen in Euro bekommen soll und eine Prompt-Injection kein anderes Ziel setzen darf
      (Widerlegung dieses Goals).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts test/konto-bridge.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-payout.test.ts` muss mindestens 13 ausgeben (je ein Fall: `step: "payout"` ohne Schlüssel 401; richtige Zahl `matched`, falsche `burned`; `payout-verify` zeigt den Link von Bridge und geht erst nach `approved` weiter; ein schon geprüfter Kunde überspringt `payout-verify`; eine ungültige IBAN ergibt 400, eine gültige legt externes Konto und Auszahladresse für Base, USDC, SEPA und EUR an und speichert von der IBAN nur die letzten vier Stellen; eine Erlaubnis mit Spender `forwarderAddress(account, destination)` und USDC ergibt `done`; Spender einer anderen Weiterleitung, anderes Token oder anderes Konto ergibt 400 und `burned`; `POST /v1/konto/payout` ohne zweite Erlaubnis 409 `payout_needs_phone`; die erste Auszahlung sendet über `sendKontoTx` in dieser Reihenfolge Anlage, `approveWithSignature` und `payout`, die zweite nur `payout`; `to`, `destination`, `address` oder `iban` im Body ergeben 400 `invalid_arguments` mit null Transaktionen; mehr als `balanceOf` ergibt 400 `insufficient_balance`; 50 USD Credits und 0 USDC ergeben bei `all: true` nichts zu zahlen, null Transaktionen und unveränderte Credits; unter 1,00 USD 400 `below_minimum`; ohne `CP_KONTO_CHAIN_ID` oder ohne `CP_BRIDGE_KEY_FILE` 503; eine neue IBAN ergibt eine neue Weiterleitung und eine neue Unterschrift über den Handoff, und vor der nächsten Auszahlung geht `retire` an die alte).
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$T/src/konto/payout.ts; if ! grep -qE "export function forwarderAddress\(" $f 2>/dev/null; then echo "fehlt forwarderAddress"; else sed -i "s/export function forwarderAddress(/function forwarderAddressOrig(/" $f; echo 'export function forwarderAddress(..._a: unknown[]): string { return "0x000000000000000000000000000000000000dead"; }' >> $f; (cd $T && pnpm -s vitest run test/konto-payout.test.ts >/dev/null 2>&1) && echo "gruen trotz forwarderAddress"; fi` muss nichts ausgeben.
      Prüfung: `grep -rnE "CP_SETTLER_KEY|CP_PAY_TO|privateKeyToAccount\(\s*process\.env" src/konto | wc -l` muss `0` ausgeben.
      Prüfung: `grep -cE "credit|ledger" src/konto/payout.ts` muss `0` ausgeben (die Auszahlung kennt keine Credits).
- [x] Eine Regel zahlt am gewählten Wochentag einmal alles über dem Betrag aus, den der Mensch behalten will, nur an das feste Ziel.
      MVP: Funktion, weil ein Automaton, der jede Woche verdient, seinen Menschen sonst jede Woche ins Terminal holt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout-rule.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-payout-rule.test.ts` muss mindestens 7 ausgeben (je ein Fall: setzen mit Schlüssel 200, ohne 401; am Montag mit 30 USD Stand und `keep_usd` 20 genau ein `payout` über 10 USD; an einem anderen Tag nichts; zwei Läufe am selben Tag zahlen einmal; Stand minus `keep_usd` unter 1,00 USD zahlt nichts; ohne zweite Erlaubnis nichts und eine Log-Zeile `payout_needs_phone`; `off: true` löscht die Regel; `weekday` außerhalb von `monday` bis `sunday` ergibt 400).
      Prüfung: `grep -c 'runPayoutRules' src/index.ts` muss mindestens `1` ausgeben.
- [x] Der Mensch zahlt per Karte über den Handoff direkt in seine Smart Wallet ein, und das Ziel der Einzahlung kann nur der Server
      setzen.
      MVP: Funktion, weil ein Mensch ohne Wallet sonst kein Geld auf sein Konto bekommt und sein Automaton nach dem ersten Guthaben
      stehen bleibt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-deposit.test.ts test/konto-client-deposit.test.ts` muss Exit-Code 0 haben.
      Prüfung: `cat test/konto-deposit.test.ts test/konto-client-deposit.test.ts | grep -cE "^\s*(it|test)\("` muss mindestens 7 ausgeben (je ein Fall: `step: "deposit"` ohne Schlüssel 401; ein Betrag wie `5.001`, `-1` oder `abc` ergibt 400; richtige Zahl zeigt `deposit-card` mit der Smart Wallet des Kontos dieses Schlüssels; `wallet_address` im Body ergibt 400; die Meldung der Seite, dass der Onramp offen ist, ergibt `done` ohne `api_key` im Ereignis; ohne `CP_KONTO_CHAIN_ID` 503; der Client ruft den Onramp mit genau der Adresse aus der Seite, Base und dem Betrag).
- [x] `mcp/server.mjs` hat `deposit`, `payout` und `set_payout_rule`, zeigt in `automaton_status` Kontostand und Regel, schickt nie
      ein Ziel und zeigt den API-Schlüssel nie.
      MVP: Funktion, weil der Mensch Ein- und Auszahlung aus dem Terminal bedient, in dem er seinen Automaton gestartet hat.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/mcp-money.test.ts test/mcp-automaton.test.ts test/mcp.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/mcp-money.test.ts` muss mindestens 9 ausgeben (je ein Fall: `tools/list` nennt die drei neuen Tools neben den bisherigen; `deposit` macht genau ein `POST /v1/handoff` mit `step` `deposit` und antwortet mit `qr`, `url` und `match`; `payout` mit zweiter Erlaubnis macht genau ein `POST /v1/konto/payout` und keinen Handoff; `payout` bei 409 `payout_needs_phone` macht ein `POST /v1/handoff` mit `step` `payout` und antwortet mit `qr`; kein Aufruf trägt `to`, `destination`, `address` oder `iban`; `set_payout_rule` schickt `keep_usd` und `weekday`; `automaton_status` zeigt `balance_usd` und die Regel; der Schlüssel steht in keinem Tool-Ergebnis und keiner Zeile auf stderr; Beträge wie `5.001`, `-1`, `abc` oder eine Zahl statt String ergeben `invalid_arguments` ohne Aufruf).
      Prüfung: `node -e 'const s=require("fs").readFileSync("mcp/skills/automaton/SKILL.md","utf8");const bad=[];for(const t of ["start_automaton","automaton_status","set_daily_limit","stop_automaton","deposit","payout","set_payout_rule"])if(!s.includes(t))bad.push(t);if(!/bank account/i.test(s))bad.push("bank account");if(/[\u2013\u2014]/.test(s))bad.push("gedankenstrich");if(bad.length){console.error(bad);process.exit(1)}console.log("skill ok")'` muss `skill ok` ausgeben.
      Prüfung: `grep -ciE "privateKey|generatePrivateKey|mnemonic|signTypedData|secp256k1|seed phrase" mcp/server.mjs` muss `0` ausgeben.
      Prüfung: `grep -E "^import " mcp/server.mjs | grep -vc '"node:'` muss `0` ausgeben (die Datei bleibt ohne Pakete).
- [x] Im Harness läuft Einzahlung, erste und zweite Auszahlung und die Regel aus dem Terminal, und beide Versuche, an ein anderes Ziel
      zu zahlen, scheitern on-chain; das läuft in `e2e`, und der Lauf aus konto 04 bleibt grün.
      MVP: Funktion, weil erst dieser Lauf zeigt, dass Tools, Handoff, Bridge, Weiterleitung und Chain zusammen Geld nur ans feste Ziel
      bringen, und jede spätere Änderung das sonst still brechen könnte.
      Prüfung: `grep -c "money.mjs" harness/e2e/full.sh` muss mindestens `1` ausgeben.
      Prüfung: `grep -c "terminal.mjs" harness/e2e/full.sh` muss mindestens `1` ausgeben.
      Prüfung: `grep -cE "deposit|payout_needs_phone|set_payout_rule|PayoutForwarder|forwarder|84532|MONEY_VERDICT|mcp/server.mjs|anvil_setCode" harness/e2e/money.mjs` muss mindestens `9` ausgeben.
      Prüfung: `grep -ciE "playwright|chromium|puppeteer" harness/e2e/money.mjs` muss `0` ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-05 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="e2e" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [x] Auf Base Sepolia zahlte ein Konto über seine Weiterleitung an sein festes Ziel, nach einer zweiten Erlaubnis mit demselben
      Passkey, und ein `spend()` direkt von unserem Schlüssel und ein `payout` über eine Weiterleitung mit anderem Ziel scheiterten
      on-chain.
      MVP: Funktion, weil Unterschrift mit vorhandenem Passkey, CREATE2 über den Proxy und die Prüfungen der Weiterleitung nur ein echter
      Lauf belegt.
      Prüfung (Netz): `node -e 'const fs=require("fs");const d=fs.readFileSync("docs/konto/sepolia-payout.md","utf8");const g=k=>{const m=d.match(new RegExp("^"+k+": (0x[0-9a-fA-F]+)$","m"));return m?m[1].toLowerCase():""};const rpc=(method,params)=>fetch("https://sepolia.base.org",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})}).then(r=>r.json());const SPM="0xf85210b21cc50302f477ba56686d2019dc9b67ad",USDC="0x036cbd53842c5426634e7929541ec2318f3dcf7e",PROXY="0x4e59b44847b379578588920ca78fbf26c0b4956c",T="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";const pad=a=>"0x"+a.slice(2).padStart(64,"0");(async()=>{const bad=[];const cid=(await rpc("eth_chainId",[])).result;if(cid!=="0x14a34")bad.push("chain "+cid);const konto=g("konto"),ziel=g("ziel"),fw=g("forwarder"),fw2=g("forwarder-fremd");if(!konto||!ziel||!fw||!fw2)bad.push("konto, ziel oder forwarder fehlt");const want={"erlaubnis":[SPM,"0x1"],"anlage":[PROXY,"0x1"],"auszahlung":[fw,"0x1"],"fremd-spend":[SPM,"0x0"],"fremd-ziel":[fw2,"0x0"]};const rc={};for(const [k,[to,st]] of Object.entries(want)){const h=g(k);if(!h){bad.push("fehlt "+k);continue}const r=(await rpc("eth_getTransactionReceipt",[h])).result;if(!r){bad.push("kein beleg "+k);continue}rc[k]=r;if(r.status!==st)bad.push(k+" status "+r.status);if((r.to||"").toLowerCase()!==to)bad.push(k+" an "+r.to)}const code=(await rpc("eth_getCode",[fw,"latest"])).result;if(!code||code==="0x")bad.push("forwarder ohne code");const a=rc["auszahlung"];if(a){const tr=a.logs.filter(l=>l.address.toLowerCase()===USDC&&l.topics[0]===T);if(!tr.some(l=>l.topics[1]===pad(konto)&&l.topics[2]===pad(fw)))bad.push("kein transfer vom konto an die weiterleitung");if(!tr.some(l=>l.topics[1]===pad(fw)&&l.topics[2]===pad(ziel)&&BigInt(l.data)>0n))bad.push("kein transfer an das ziel");if(tr.some(l=>l.topics[2]!==pad(fw)&&l.topics[2]!==pad(ziel)))bad.push("transfer an ein anderes ziel")}if(bad.length){console.error(bad);process.exit(1)}console.log("sepolia payout ok")})()'` muss `sepolia payout ok` ausgeben.
      Prüfung: `z=$(sed -n 's/^ziel: //p' docs/konto/sepolia-payout.md); [ -n "$z" ] && ! grep -rqi -- "$z" src deploy mcp && echo ziel nicht im code` muss `ziel nicht im code` ausgeben.
      Prüfung: `f=~/.config/control-plane/konto-sepolia.key; k=$(tr -d '\n' < $f | sed 's/^0x//'); [ ${#k} -eq 64 ] || echo "kein schluessel"; git log -p origin/dev..HEAD | grep -ci -- "$k"` muss als einzige Ausgabe `0` haben.
- [x] Das Hauptnetz ist vorbereitet, aber nicht eingeschaltet: Der Code dafür entstand erst nach der Ausnahme in Regel 10, 8453 läuft
      nur mit `CP_KONTO_MAINNET=1`, jede andere Kette bleibt verweigert, die Verträge liegen auf Base, und unser Schlüssel hat dort
      nichts gesendet.
      MVP: Funktion, weil konto 06 in der Produktion nur noch Werte setzt und keinen Code mehr braucht, der Geld im Hauptnetz bewegt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-mainnet.test.ts test/konto-chain.test.ts test/konto-config.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-mainnet.test.ts` muss mindestens 5 ausgeben (je ein Fall: 8453 ohne `CP_KONTO_MAINNET=1` wirft beim Start; 8453 mit dem Schalter ergibt USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` und `https://mainnet.base.org`; Kette 1 wirft auch mit dem Schalter; `sendKontoTx` mit Einstellung 84532 verweigert eine Transaktion für 8453 ohne Aufruf am Transport und umgekehrt; 84532 verhält sich wie in konto 03).
      Prüfung: `a=$(git log --reverse --format=%ct -S'Ausnahme Hauptnetz' origin/dev -- loop-constraints.md | head -1); b=$(git log --reverse --format=%ct -S'MAINNET_CHAIN_ID' origin/dev..HEAD -- src | head -1); [ -n "$a" ] && [ -n "$b" ] && [ "$b" -gt "$a" ] && echo reihenfolge ok` muss `reihenfolge ok` ausgeben.
      Prüfung (Netz): `node -e 'const rpc=(method,params)=>fetch("https://mainnet.base.org",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})}).then(r=>r.json());(async()=>{const bad=[];if((await rpc("eth_chainId",[])).result!=="0x2105")bad.push("chain");for(const a of ["0xf85210B21cC50302F477BA56686d2019dC9b67Ad","0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","0x4e59b44847b379578588920ca78fbf26c0b4956c","0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a"]){const c=(await rpc("eth_getCode",[a,"latest"])).result;if(!c||c==="0x")bad.push("kein code "+a)}if(bad.length){console.error(bad);process.exit(1)}console.log("hauptnetz bereit")})()'` muss `hauptnetz bereit` ausgeben.
      Prüfung (Netz): `node --input-type=module -e 'import {privateKeyToAccount} from "viem/accounts";import fs from "node:fs";import os from "node:os";const k=fs.readFileSync(os.homedir()+"/.config/control-plane/konto-sepolia.key","utf8").trim();const a=privateKeyToAccount(k.startsWith("0x")?k:"0x"+k).address;const r=await fetch("https://mainnet.base.org",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_getTransactionCount",params:[a,"latest"]})}).then(r=>r.json());console.log("hauptnetz nonce "+BigInt(r.result))'` muss `hauptnetz nonce 0` ausgeben.
- [x] Der Ablauf von Einzahlung, Auszahlung, Regel und Hauptnetz steht für konto 06 fest, und die Entscheidungen stehen mit Grund in
      `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil konto 06 in der Produktion genau gegen diesen Ablauf einschaltet.
      Prüfung: `for w in deposit payout set_payout_rule PayoutForwarder forwarderAddress payout_needs_phone runPayoutRules signature_check_unavailable permission_expired CP_KONTO_MAINNET CP_BRIDGE_URL CP_BRIDGE_KEY_FILE MAINNET_CHAIN_ID; do grep -qw -- "$w" docs/konto/euro.md || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Goal 05/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens 10 ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, kein Test wird schwächer, höchstens ein neues Paket und ein neues Paket für die
      Entwicklung, kein Schlüssel und keine echte IBAN im Diff, und `check` und `e2e` sind grün.
      MVP: Funktion, weil der Merge über `deploy.yml` ausrollt und zahlende Kunden den Stand tragen.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/app\.ts|src/db\.ts|src/index\.ts|src/handoff/[A-Za-z0-9._-]+\.ts|src/konto/[A-Za-z0-9._-]+\.ts|src/konto/contracts/PayoutForwarder\.sol|src/public/handoff\.ts|src/public/konto\.ts|src/public/limit\.ts|src/public/money\.ts|src/public/konto-client/[A-Za-z0-9._/-]+|src/public/openapi\.ts|test/[A-Za-z0-9._-]+\.ts|mcp/server\.mjs|mcp/README\.md|mcp/skills/automaton/SKILL\.md|README\.md|ops/soll-assess\.mjs|ops/soll-money\.mjs|ops/soll-live-money\.mjs|ops/konto/[A-Za-z0-9._-]+|harness/e2e/money\.mjs|harness/e2e/full\.sh|harness/docker-compose\.yml|harness/money-mock/[A-Za-z0-9._/-]+|harness/chain/konto/[A-Za-z0-9._-]+|docs/soll/money-(deposit-approve|deposit-card|payout-approve|payout-verify|payout-bank|payout-passkey|retry)-(390|1440)\.png|docs/soll/src/money-(deposit-approve|deposit-card|payout-approve|payout-verify|payout-bank|payout-passkey|retry)\.html|docs/soll/README\.md|docs/konto/(euro|sepolia-payout|terminal)\.md|package\.json|pnpm-lock\.yaml|goals/konto/(verdicts/)?[A-Za-z0-9._-]+\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `T=$(mktemp -d); git show origin/dev:package.json > $T/p.json; node -e 'const a=require(process.argv[1]),b=require("./package.json");const n=k=>Object.keys(b[k]||{}).filter(x=>!(x in (a[k]||{})));const d=n("dependencies"),v=n("devDependencies");if(d.length>1||v.length>1){console.error(d,v);process.exit(1)}console.log("pakete ok "+d.length+" "+v.length)' $T/p.json` muss `pakete ok <d> <v>` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}" | wc -l` muss `0` ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':!pnpm-lock.yaml' ':!*.png' | grep -E '^[+]' | grep -oE '\b[A-Z]{2}[0-9]{2}( ?[0-9A-Z]{4}){3,7}( ?[0-9A-Z]{1,3})?\b' | grep -vE '^DE89 ?3704 ?0044 ?0532 ?0130 ?00$' | wc -l` muss `0` ausgeben (keine IBAN außer der Beispiel-IBAN).
      Prüfung: `grep -rnE "CP_KONTO_|CP_BRIDGE_" deploy .github | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-05 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [x] Eine Auszahlung geht nur über die Weiterleitung, die zu den heutigen Werten passt: Vor der ersten Transaktion prüft
      `sendPayout`, dass die gespeicherte Weiterleitung gleich `forwarderAddress(account, destination, fixed)` mit dem heutigen
      `fixed` ist, und nach einer Anlage, dass an dieser Adresse Code liegt. Sonst geht kein `payout` raus: Die Route antwortet 409
      `payout_needs_phone` ohne Transaktion, die Regel loggt `payout_needs_phone` und setzt `last_paid_day` nicht. Der Test war vor dem
      Fix rot.
      MVP: Funktion, weil der Bank-Schritt die Adresse mit dem damaligen Gasschlüssel als `caller` rechnet und speichert, `sendPayout`
      die Weiterleitung aber mit dem heutigen anlegt: Nach einem Wechsel des Schlüssels (oder von Token und Kette in konto 06) entsteht
      der Vertrag an einer anderen Adresse, `payout` geht an die gespeicherte Adresse ohne Code, die Quittung meldet Erfolg, und Route
      und Regel melden `sent`, obwohl kein Cent das Konto verlassen hat.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout-guard.test.ts test/konto-payout.test.ts test/konto-payout-rule.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-payout-guard.test.ts` muss mindestens 3 ausgeben (je ein Fall: Bank-Schritt mit `caller` A, dann `POST /v1/konto/payout` mit einem `fixed` mit `caller` B ergibt 409 `payout_needs_phone` und null Aufrufe von `send`; dasselbe über `runPayoutRules` ergibt eine Log-Zeile `payout_needs_phone`, null Aufrufe von `send` und kein `last_paid_day`; die Anlage gelingt, `code` der gespeicherten Adresse bleibt aber `0x`, dann kein `payout` und `PayoutFailed` mit Stufe `deploy`).
      Prüfung: `grep -c "forwarderAddress(" src/konto/payout.ts` muss mindestens `2` ausgeben.
- [ ] Ein gesendetes `payout`, dessen Quittung fehlt, wird nie ein zweites Mal gesendet: Hash und Betrag stehen vor dem Warten auf die
      Quittung in der Datenbank. Bricht das Warten ab (Fehler, Zeitüberschreitung, Neustart), antwortet die Route 202 mit
      `state: "pending"` und dem Hash. Die nächste Auszahlung des Kontos, über die Route oder die Regel, klärt zuerst diesen Hash und
      sendet nichts, solange er offen ist; `success` gibt der Route `state: "sent"` mit dem alten Hash und Betrag ohne neue Transaktion,
      `reverted` gibt den Weg für ein neues `payout` frei. Der Test war vor dem Fix rot.
      MVP: Funktion, weil die Route heute nach einem abgebrochenen Warten 502 „Try again later“ antwortet, obwohl das Geld schon
      unterwegs sein kann: Wer „zahl 10 Dollar aus“ sagt und dem Rat folgt, bekommt 20 auf sein Bankkonto und hat 10 weniger für seinen
      Automaton. `topUpIfLow` hat für denselben Fall seit konto 03 `pending_tx`.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout-pending.test.ts test/konto-payout.test.ts test/mcp-money.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-payout-pending.test.ts` muss mindestens 4 ausgeben (je ein Fall: `receipt` des `payout` wirft, die Route antwortet 202 `pending` mit dem Hash, und eine zweite Anfrage mit demselben Betrag sendet null Transaktionen und antwortet wieder `pending`; meldet die Quittung danach `success`, antwortet die nächste Anfrage `sent` mit dem ersten Hash und null neuen Transaktionen; meldet sie `reverted`, sendet die nächste genau ein `payout`; `runPayoutRules` mit offenem Hash sendet nichts und setzt `last_paid_day` nicht).
      Prüfung: `grep -c "pending" src/konto/payout.ts` muss mindestens `1` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Mensch ohne Wallet zahlt aus Claude Code per Karte auf sein Konto ein und lässt seine Einnahmen einmal oder jede Woche auf
      sein Bankkonto auszahlen; das Handy braucht er nur für die Karte und für die erste Auszahlung.
- [ ] Wer nur das Terminal oder den Agent darin hat, kann Geld nur an die feste Auszahladresse des Kunden schicken, nie an ein anderes
      Ziel und nie aus Credits; das Ziel ändert nur ein neuer Handoff mit dem Passkey.
- [ ] Wir halten keinen Schlüssel und kein Kundengeld: Die Weiterleitung hat keinen Eigentümer und zahlt im selben Aufruf weiter.
- [ ] Kein Gedankenstrich, kein Name, keine IBAN und keine Wallet-Adresse eines Kunden, kein Wort, das der Nutzer erst übersetzen
      muss, kein deutscher Bezeichner im Code.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/runtime/**`,
  `harness/cp/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `deploy/**`; den Absatz „Ausnahme
  Hauptnetz“ trägt nur Matthias ein
- `src/auth/**` und `src/payments/**`: dieses Goal nennt sie nicht zum Ändern; ihre Funktionen dürfen importiert werden
- `ops/soll.mjs`, `ops/soll-live.mjs`, `ops/soll-handoff.mjs`, `ops/soll-live-handoff.mjs`, `ops/soll-konto.mjs`,
  `ops/soll-live-konto.mjs`, `ops/soll-limit.mjs`, `ops/soll-live-limit.mjs` und ihre Tests, jedes vorhandene Bild und jede vorhandene
  Quelle unter `docs/soll/` (seite 03 benennt die Werkzeuge um)
- `ROADMAP.md`, `docs/kette.md`, `docs/konto/anbieter.md`, `docs/konto/handoff.md`, `docs/konto/konto.md`, `docs/konto/sepolia.md`,
  `docs/konto/sepolia-limit.md` und alle Goal-Dateien außer dieser
- jede Transaktion außerhalb von Base Sepolia (84532), auch im Hauptnetz nach der Ausnahme in Regel 10 (das ist konto 06); der
  Schlüssel der Betreiber-Wallet (`CP_SETTLER_KEY`, `CP_PAY_TO` und jeder Schlüssel der Produktion), ein Faucet mit Captcha oder
  Konto durch einen Agent, Kauf, Aufladung, Gas im Hauptnetz (`loop-constraints.md`, Grundregeln 9 und 10)
- ein Konto bei Bridge, MoonPay oder Coinbase anlegen, ein Formular dort abschicken, eine Mail an Bridge senden (`third_party_mail`,
  `security_settings`); der Produktionszugang zu Bridge
- Credits als Quelle einer Auszahlung, eine Route oder ein Feld, das ein Ziel der Auszahlung annimmt
- der Testschlüssel, ein API-Schlüssel oder eine echte IBAN in Repo, Log, Ausgabe, Kommentar, Fixture oder Fehlertext; eine Variable
  `CP_KONTO_*` oder `CP_BRIDGE_*` auf dem Server
- ein Wallet-Schlüssel, eine Seed-Phrase oder eine Unterschrift auf der Maschine des Nutzers oder in `mcp/`
- ein Konto oder eine Erlaubnis eines echten Kunden; Turnkey nur über die Sub-Organisationen des eigenen Laufs
- kein Skript eines fremden Dienstes auf der Seite außer dem Onramp nach dem Tippen auf den Knopf, und kein Aufruf einer fremden
  Adresse beim Rendern der SOLL-Bilder
- eine zweite Route für Anlegen, Zustand, Log oder Stopp eines Automatons neben der aus sandbox 08
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 5
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Zyklus 1: Punkte 1 bis 15, 17 und 18 gebaut (Kopf `11d86c9`, PR #220 mit `check` und `e2e` grün). Prüfbefehle: alle
  72 Prüfbefehle der Goal-Datei einzeln ausgeführt, grün bis auf die drei von Punkt 16; Punkt 5 mit `PATH=/usr/bin:$PATH`, weil das
  `node` im PATH des code-host v24 ist und `better-sqlite3` für Node 22 gebaut ist. Gegenproben: Punkt 5 mit geänderter Überschrift
  `exit=1` und 8 Mängel, Punkt 10 mit vertauschtem `forwarderAddress` rot. Punkt 16 offen: Der Absatz „Ausnahme Hauptnetz“ fehlt auf
  `origin/dev`, deshalb gibt es weder `MAINNET_CHAIN_ID` in `src` noch `test/konto-mainnet.test.ts`; Human Gate gesetzt.
- 2026-11-16 Breaker no_progress_runs gegriffen (2 Maker-Runs ohne neue Zeile, während das Goal am Human Gate
  für Punkt 16 wartete); Status `BLOCKED umgebung`, `## Ehrliche Lücken` geschrieben, kein Bauversuch. Prüfbefehle: Reihenfolge-Prüfung
  von Punkt 16 gegen `origin/dev` `a127d5d` gibt leeres `a` und `b` aus, also nicht `reihenfolge ok`.
- 2026-11-16 Breaker no_progress_runs aufgehoben, Zählfehler des Loop Masters (PRO-23349). Status zurück auf `BLOCKED matthias`,
  `## Ehrliche Lücken` und die Breaker-Zeilen unter `## Blockers` entfernt, das Human Gate `security_settings` für Punkt 16 gilt
  wieder; kein Bauversuch. Prüfbefehle: `git show origin/dev:loop-constraints.md | grep -n Ausnahme` zeigt weiter nur
  „Ausnahme Base Sepolia“.
- 2026-11-17 Zyklus 2: Abschluss gemeldet, Punkte 1 bis 18. Punkt 16 im Topic gebaut, nachdem Matthias den Absatz „Ausnahme
  Hauptnetz“ auf `dev` eingetragen hatte (`5f77e64`, danach `4fb0cf1`); `dev` gemergt, dabei `assessMoney` auf `moveBottom` aus
  seite 03 gebracht (`d74d8c6`). Prüfbefehle: alle 72 der Goal-Datei einzeln am Kopf, jeder mit seiner Erwartung, `check` Exit 0;
  Punkt 16 `reihenfolge ok`, `hauptnetz bereit`, `hauptnetz nonce 0`. Gegenproben: `kontoNet` mit 8453 ohne Schalter und
  `requireNet` ohne Prüfung je ein roter Fall in `test/konto-mainnet.test.ts`; `hauptnetz bereit` mit einer Adresse ohne Code
  Exit 1, die Nonce-Abfrage an einem Konto mit Nonce 1 zeigt `hauptnetz nonce 1`.
- 2026-11-17 Zyklus 3: Punkt 19 gebaut. `forwarderFits` vergleicht die gespeicherte Weiterleitung mit `forwarderAddress` und dem
  heutigen `fixed`; `sendPayout` prüft das vor der ersten Transaktion, Route und `payout_ready` ebenso, und nach einer Anlage muss an
  der Adresse Code liegen, sonst `PayoutFailed` mit Stufe `deploy`. Prüfbefehle: Vitest von Punkt 19 Exit 0, `test/konto-payout-guard.test.ts`
  3 Fälle, `forwarderAddress(` 2 Treffer. Gegenprobe: vor dem Fix waren alle drei Fälle rot (502 statt 409, Regel `failed`, kein
  `PayoutFailed`).

## Blockers
- keine; das Human Gate `security_settings` ist erledigt, der Absatz „Ausnahme Hauptnetz“ liegt seit `5f77e64` auf `dev`.
