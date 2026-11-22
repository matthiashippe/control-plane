# Karte Goal 01: Guthaben per Karte

## Status
PLANNED

## Active Objective
Ein Mensch ohne Wallet kann heute bei uns nicht bezahlen: Guthaben kommt nur als USDC über x402 auf Base (`/pay/:usd`), und der Weg
per Karte über MoonPay ruht (konto 15, Matthias 22.11.2026). Nach diesem Goal stehen im Verkäuferkonto von HTC bei Digistore24 drei
eigene Produkte (Guthaben 5, 20 und 50 EUR brutto, Währung EUR, Bestellformular 254538, Rückgabe 30 Tage), und der Dienst nimmt unter
`POST /pay/digistore` die signierte IPN an: Er bucht je Bestellnummer genau einmal den Verkäuferanteil aus der IPN als `topup` auf die
Adresse aus dem Parameter `custom`, umgerechnet in USD zum Referenzkurs der EZB vom Kauftag, und bucht bei Rückerstattung oder
Rückbuchung zurück, soweit das Guthaben noch da ist. `GET /pay/digistore` antwortet 200. Ohne das IPN-Kennwort in der Produktion
weist der Dienst jeden POST ab und bucht nichts, also geht der Merge dunkel live.
Leitzahl: fremde Käufe per Karte je Woche (`ops/card-orders.sh`, Zeile `card_orders`, Feld `live`).
Widerlegt, wenn Digistore24 die Produkte zweimal mit demselben Grund ablehnt; dann meldet das Glied den Grund an Matthias.
MVP: Funktion, weil erst dann ein Mensch ohne Wallet bei uns bezahlen kann.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel in einem Satz: Wer per Karte, PayPal oder Apple Pay in der Kasse von Digistore24 eines der drei Pakete kauft, hat danach genau
  einmal das Guthaben auf seinem Automaton, das der Verkäuferanteil in USD ergibt, und eine Rückerstattung nimmt es wieder weg, ohne
  dass ein Saldo negativ wird.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: karte 02 zeigt Betreibern den Weg zur Kasse (Startseite, README,
  Plugin, `card_url` in der 402). Ohne dieses Goal führt jeder dieser Knöpfe ins Leere.
- Quelle: `ROADMAP.md`, Topic `karte`, Glied 01; Grundsatz in `docs/kette.md`, Abschnitt „karte: Guthaben per Karte über
  Digistore24“ (bindend: dasselbe Verkäuferkonto wie Personalplaner24, Bautagebuch24 und Aszendent24, nur die eigenen neuen Produkte
  ändern; Preise fest; Guthaben unauszahlbar; Adresse nur in `custom` und in der IPN; kein Text nach außen nennt PostYourPrice).
- **Was dieses Goal nicht schafft und warum (Entscheidung Tech Lead, 22.11.2026).** `ipnSetup` bei Digistore24 verlangt, dass die
  IPN-Adresse auf GET schon mit 200 antwortet (`~/work/aszendent24/loop-constraints.md`, Abschnitt „Digistore24: was bei
  Personalplaner24 Zeit gekostet hat“). Heute landet `GET /pay/digistore` in `app.get("/pay/:usd")` und antwortet nicht 200, und der
  Code dieses Goals rollt erst nach dem PASS mit dem Merge aus. Deshalb gehören die IPN-Verbindung im Konto, das IPN-Kennwort in
  `/opt/control-plane/.env` (nur Matthias), der Testkauf je Produkt und das Einreichen zur Freigabe nicht in dieses Goal, sondern an
  den Anfang von karte 02, das nach dem Rollout startet. Der Maker hält das in einem Vorschlag fest (Punkt 6), damit die Triage es in
  karte 02 übernimmt, und schreibt die Zeile dazu in `goals/karte/ANNAHMEN.md`. Dieses Goal braucht kein Human Gate.
- Zuerst lesen (nur lesen): `src/checkout/index.ts` (die Regel „the amount comes from the row, never from the callback“ gilt hier
  umgekehrt: der Betrag kommt aus der signierten IPN, deshalb zählt nur eine gültige Signatur), `src/payments/pay.ts` (wie ein
  `topup` gebucht wird), `src/db.ts` (`postLedger`, `ensureWallet`, `MC_PER_CENT`, der Index `ledger_topup_ref`, `LedgerEntry.kind`),
  `src/app.ts` um `app.get("/pay/:usd")` und die Middleware, die Pfade unter `/pay/` behandelt, `ops/konto-ready.sh` mit
  `test/konto-ready.test.ts` (Muster für ein Werkzeug, das über `ssh` im Container liest). Vorlagen außerhalb des Repos, nur lesen:
  `~/work/personalplaner24/deploy/digistore.js` (`signaturZeichenkette`, `signaturPruefen`: Byte-Sortierung, leere Werte weg, je Feld
  `name=wert` plus Kennwort, SHA-512 groß, Vergleich in konstanter Zeit), `~/work/personalplaner24/app/ipnprobe.py` (Prüffall der
  Signatur aus der Doku von Digistore24, Kennwort `xxxxx`, Hash beginnt mit `342770076245D14ED7DF4D2E5D82216D`),
  `~/work/aszendent24/scripts/digistore.mjs` (Anlegen von Produkt und Zahlungsplan, `PROTECTED`, `WRITE_TOOLS`, Selbsttest, Zugang
  über die klassische API), `~/brain/connectors/digistore24.md` (Fallen: Währung nach dem Anlegen auf EUR setzen, `cli.py` bricht
  seit 17.11.2026 beim Handshake ab, die klassische API mit Kopf `X-DS-API-KEY` geht). Die IPN-Felder stehen in
  `https://www.digistore24.com/download/ipn/examples/ipn/digistore_ipn.pdf` (per `curl` laden, `pdftotext`): `event`
  (`on_payment`, `on_refund`, `on_chargeback`, `connection_test`), `api_mode` (`live` oder `test`), `order_id`, `order_date`,
  `product_id`, `custom`, `currency`, `amount_vendor`, `transaction_type`, `sha_sign`. Digistore24 erwartet als Antwort den Text `OK`.
- **Die IPN-Annahme (Punkte 1 und 2), neu in `src/payments/digistore.ts`, Route in `src/app.ts`.** Das ist die einzige Datei unter
  `src/payments/`, die dieses Goal anlegen oder ändern darf; `src/auth/**` bleibt unberührt.
  - `CARD_PACKAGES`: die drei Produkte mit `productId` (die ID aus dem Konto, Punkt 4), `grossEurCents` (500, 2000, 5000) und `label`
    (`credit 5 EUR`, `credit 20 EUR`, `credit 50 EUR`). Die IDs sind öffentlich (sie stehen in jedem Bestelllink) und gehören in den
    Code, nicht in die Umgebung.
  - Kennwort aus `CP_DIGISTORE_IPN_PASSPHRASE` (höchstens 40 Zeichen, weil das Feld bei Digistore24 still kürzt). Fehlt es, antwortet
    jeder POST 503 mit `{"error":"card_payments_unavailable"}` und bucht nichts; `GET /pay/digistore` antwortet immer 200 mit `OK`,
    ohne Wirkung. Beide Routen stehen in `src/app.ts` vor `app.get("/pay/:usd")`, damit `digistore` nie als Betrag gelesen wird.
  - POST nimmt `application/x-www-form-urlencoded`. Zuerst die Signatur über alle Felder (Regel wie `signaturZeichenkette`), Vergleich
    mit `timingSafeEqual`; falsch oder fehlend: 403, nichts gespeichert. Danach `connection_test`: `OK`. Ein `product_id` außerhalb
    von `CARD_PACKAGES`: `OK`, nichts gebucht, nichts gespeichert (das Konto ist geteilt).
  - Neue Tabelle `card_orders` (in `src/db.ts`, `CREATE TABLE IF NOT EXISTS`): `order_id TEXT PRIMARY KEY`, `product_id`, `address`
    (NULL, wenn `custom` keine Adresse ist), `mode` (`live` oder `test`), `status` (`booked`, `test`, `unassigned`, `pending_rate`,
    `reversed`), `vendor_eur_cents`, `rate_e4` (USD je EUR mal 10000), `rate_date`, `credited_mc`, `reversed_mc`, `shortfall_mc`,
    `created_at`, `updated_at`.
  - `on_payment` mit `api_mode=test`: Zeile mit `status = 'test'`, kein Ledger, `OK`. Mit `api_mode=live`: `custom` muss genau eine
    Adresse `0x` plus 40 Hexziffern sein (klein geschrieben gespeichert), sonst `status = 'unassigned'`, kein Ledger, `OK`.
    `currency` muss `EUR` sein, sonst `unassigned`. `amount_vendor` wird als Dezimaltext in ganze Cent gelesen, nie als float.
  - Kurs: Referenzkurs USD der EZB aus `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml`, der Kurs des `order_date`
    oder, wenn es für diesen Tag keinen gibt (Wochenende, Feiertag), des letzten Tags davor; als ganze Zahl `rate_e4` gelesen (1.0512
    wird 10512). Gutschrift `credited_mc = floor(vendor_eur_cents * rate_e4 * MC_PER_CENT / 10000)` in ganzen Zahlen. `fetch` wird
    hineingereicht, damit kein Test ins Netz geht; Zeitlimit 10 Sekunden. Ist die EZB nicht erreichbar: `status = 'pending_rate'`,
    `OK`, und ein Lauf beim Start und alle 10 Minuten (`src/index.ts`, wie die anderen Abgleichläufe) bucht jede solche Zeile, sobald
    der Kurs da ist.
  - Gebucht wird in einer Transaktion: Zeile in `card_orders` auf `booked` und `postLedger` mit `kind: "topup"`, `ref:
    "ds24:<order_id>"` und `meta` mit Produkt, Cent, Kurs und Kurstag. Der bestehende Index `ledger_topup_ref` macht die zweite
    Buchung derselben Bestellung unmöglich; eine wiederholte IPN antwortet `OK` und bucht nichts.
  - `on_refund` und `on_chargeback` für eine gebuchte Bestellung: neue Ledger-Art `card_reversal` (in `LedgerEntry.kind` mit einem
    Satz Kommentar, dazu ein eindeutiger Index auf `ref` für diese Art), `deltaMc` gleich minus dem Kleineren aus `credited_mc` und dem
    frei verfügbaren Guthaben (Saldo abzüglich reserviert und Sandbox-Halt, wie `postLedger` rechnet), der Rest als `shortfall_mc`,
    `status = 'reversed'`. Ein zweites Ereignis derselben Bestellung (Rückbuchung nach Rückerstattung) bucht nichts mehr. Ein Saldo
    wird nie negativ. Für eine Bestellung, die noch auf den Kurs wartet, wird sie `reversed` ohne Buchung.
  - Keine Log-Zeile, keine Fehlermeldung und keine Antwort enthält `custom`, eine Adresse, das Kennwort oder `sha_sign`.
  - `test/digistore-ipn.test.ts` gegen `createApp` mit Datenbank in einem Ordner aus `mkdtemp` und einem nachgebauten `fetch` für die
    EZB, Uhr fest. Die Fälle heißen genau so (Punkt 1 prüft die Namen):
    `matches the reference signature of the digistore24 documentation`,
    `refuses a wrong signature and stores nothing`,
    `refuses every post without a passphrase and books nothing`,
    `answers 200 on get without effect`,
    `books the vendor share once at the ecb rate of the order day`,
    `uses the last ecb rate before a day without one`,
    `a repeated ipn for the same order books nothing`,
    `a test order is stored and books nothing`,
    `a live order without an address books nothing and is counted`,
    `ignores a product that is not ours`,
    `keeps an order pending while the ecb is unreachable and books it later`,
    `a refund takes back at most the free balance and records the rest`,
    `a chargeback after a refund books nothing more`,
    `no log line carries the address or the passphrase`.
    Jeder Fall war einmal rot; das Progress Log sagt, womit.
- **Das Werkzeug für das Konto (Punkte 3 und 4), neu `ops/digistore.mjs`**, Node ESM ohne neue Abhängigkeit, nach dem Muster von
  `~/work/aszendent24/scripts/digistore.mjs`. Zugang `DIGISTORE24_API_KEY` aus der Umgebung oder `~/brain/connectors/secrets.env`
  (nur lesen), klassische API `https://www.digistore24.com/api/call/<funktion>/` mit Kopf `X-DS-API-KEY`. Schlüssel und Kennwort
  erscheinen nie in einer Ausgabe. Geschrieben wird nur an IDs aus `CARD_PACKAGES` oder an Produkte, die `--create` gerade angelegt
  hat; jede ID aus `PROTECTED` (die Liste aus `~/work/aszendent24/scripts/digistore.mjs` plus 765137 und 767706) bricht vor dem
  Schreiben ab. Ausgaben englisch.
  - `--create` legt die fehlenden der drei Produkte an (Name `Automaton credit 5 EUR`, `Automaton credit 20 EUR`, `Automaton credit 50
    EUR`; Typ digital, Käufer consumer, Währung direkt danach `EUR`, Zahlungsplan einmalig mit 5.00, 20.00 und 50.00 brutto,
    Bestellformular `254538`, Verkaufsseite `https://automatonhost.com/`, Dankeseitentext kurz und englisch mit dem Satz „Seller of
    this offer is Digistore24 GmbH. The charge is made by Digistore24.“, dem Hinweis, dass das Guthaben in wenigen Minuten auf dem
    Automaton steht, und „30 days money back“), gibt je Produkt `created <id> <label>` aus und tut nichts, wenn ein Produkt mit
    diesem Namen schon da ist. Kein Gutschein, kein Rabatt, kein Marktplatz, keine Freigabe, kein `ipnSetup`.
  - `--report` liest nur und gibt je Produkt genau eine Zeile `product <id>: <label>, EUR <preis>, order form <id>, refund <n> days,
    thankyou <yes|no>, sales page <url>` aus, dann `ids: match` oder `ids: differ` (Vergleich mit `CARD_PACKAGES`, gelesen aus
    `src/payments/digistore.ts`), zuletzt `report: <n> defects`.
  - `--selftest` prüft ohne Netz mit festen Antworten (fehlendes Produkt wird angelegt, vorhandenes nicht, eine ID aus `PROTECTED`
    wird nie geschrieben, Rückgabe 60 Tage ist ein Mangel, abweichende IDs sind ein Mangel, keine Ausgabe enthält den Schlüssel) und
    endet mit `SELFTEST OK`.
  - Die Rückgabe (`refund_policy`) nimmt die API nicht an. Steht sie nach dem Anlegen nicht auf 30 Tagen, ist sie der eine Handgriff
    für Matthias in karte 02 und steht im Vorschlag aus Punkt 6; dieses Goal wartet nicht darauf, `--report` meldet sie als Mangel,
    Punkt 4 zählt sie nicht.
- **Ablauf im Lauf.** Punkt 1 und 2 lokal, Commit, Push, Draft-PR. Dann `node ops/digistore.mjs --create` gegen das Konto (einmal,
  die Ausgabe ins Progress Log ohne Schlüssel), die IDs in `CARD_PACKAGES` eintragen, Tests erneut, Commit, Push. Dann Punkte 3 bis 7.
- **`ops/card-orders.sh` (Punkt 5).** Nach dem Muster von `ops/konto-ready.sh`: gleiche Variablen `CP_DEPLOY_HOST` und
  `CP_DEPLOY_KEY`, über `ssh -o BatchMode=yes … 'bash -s -- --on-server'` auf den Server, dort im laufenden Container `cp` mit
  `node` und `better-sqlite3` auf `CP_DB_PATH` mit `readonly: true`. Ausgabe genau drei Zeilen:
  `card_orders live <n> test <n> booked <n> unassigned <n> pending_rate <n> reversed <n>`,
  `card_shortfall_usd <Summe shortfall_mc, auf Cent abgerundet, zwei Nachkommastellen>` und `ipn_passphrase set` oder
  `ipn_passphrase missing` (ob `CP_DIGISTORE_IPN_PASSPHRASE` im Container gesetzt ist, nie der Wert). Fehlt die Tabelle (vor dem
  Rollout), zählt jede Zahl 0. SSH-Fehler Exit 2 mit `ssh failed`, sonst Exit 0. `ops/status.sh` ruft es auf und zeigt die Zeilen
  `card_orders` und `card_shortfall_usd` mit. Test `test/card-orders.test.ts` mit nachgebautem `ssh` und `docker` vorn im `PATH`
  wie `test/konto-ready.test.ts`, Datenbank im Ordner aus `mkdtemp`, mindestens vier Fälle: Zählung mit je einer Zeile jedes Status
  und einem Fehlbetrag von 1,234 USD ergibt `card_shortfall_usd 1.23`; keine Ausgabe enthält die Adresse der Testdatenbank; fehlende
  Tabelle ergibt Nullen; scheiterndes `ssh` gibt `ssh failed` und Exit 2.
- `goals/karte/ANNAHMEN.md` (neu): Zeilen `- <Datum>, karte 01: …`, mindestens zum Schnitt aus dem Abschnitt „Was dieses Goal nicht
  schafft“, zur Wahl des Kurstags (`order_date`, letzter Kurs davor), zu `unassigned` (Geld ohne Adresse wird nicht geraten, die Zahl
  zeigt `ops/card-orders.sh`, der Umgang damit kommt mit karte 02) und zu `test` (ein Testkauf bucht nichts).
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein
  Test geht ins Netz oder bindet einen festen Port. Kein Kauf, kein Testkauf, keine Rückerstattung und kein Aufruf von
  `POST /pay/digistore` in der Produktion durch einen Agent. Code, Bezeichner, Testnamen, Log-Zeilen und Ausgaben englisch.

## Done Condition
- [ ] Der Dienst nimmt die signierte IPN von Digistore24 an, bucht den Verkäuferanteil je Bestellung genau einmal als `topup` zum
      Kurs der EZB vom Kauftag und bucht bei Rückerstattung oder Rückbuchung höchstens das freie Guthaben zurück; ohne Kennwort bucht
      er nichts.
      MVP: Funktion, weil das die Stelle ist, an der Kartengeld zu Guthaben wird, und jeder Fehler hier Geld falsch bucht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/digistore-ipn.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "matches the reference signature of the digistore24 documentation" "refuses a wrong signature and stores nothing" "refuses every post without a passphrase and books nothing" "answers 200 on get without effect" "books the vendor share once at the ecb rate of the order day" "uses the last ecb rate before a day without one" "a repeated ipn for the same order books nothing" "a test order is stored and books nothing" "a live order without an address books nothing and is counted" "ignores a product that is not ours" "keeps an order pending while the ecb is unreachable and books it later" "a refund takes back at most the free balance and records the rest" "a chargeback after a refund books nothing more" "no log line carries the address or the passphrase"; do grep -qF "$t" test/digistore-ipn.test.ts || echo "missing: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -cE 'parseFloat|toFixed|Number\(' src/payments/digistore.ts` muss 0 ausgeben.
      Prüfung: `grep -c 'timingSafeEqual' src/payments/digistore.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '"card_reversal"' src/db.ts` muss mindestens 1 ausgeben.
- [ ] `GET /pay/digistore` antwortet 200 und landet nie in der Route für x402, und die bestehenden Wege für Guthaben sind unverändert
      grün.
      MVP: Funktion, weil Digistore24 die IPN-Verbindung nur auf eine Adresse legt, die auf GET mit 200 antwortet.
      Prüfung: `awk '/app\.(get|post)\("\/pay\/digistore"/{if(!d)d=NR} /app\.get\("\/pay\/:usd"/{if(!u)u=NR} END{print (d>0 && u>0 && d<u) ? "vorher" : "falsch"}' src/app.ts` muss genau `vorher` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run $(ls test/*.test.ts | grep -E 'pay|topup|checkout|x402')` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src/payments src/auth | grep -vx 'src/payments/digistore.ts' | wc -l` muss 0 ausgeben.
- [ ] `ops/digistore.mjs` legt nur die eigenen drei Produkte an, schreibt nie an ein fremdes Produkt und gibt nie den Schlüssel aus.
      MVP: Funktion, weil das Verkäuferkonto mit Personalplaner24, Bautagebuch24 und Aszendent24 geteilt ist.
      Prüfung: `PATH=/usr/bin:$PATH node ops/digistore.mjs --selftest 2>&1 | tail -1` muss genau `SELFTEST OK` ausgeben.
      Prüfung: `for s in --create --report --selftest; do grep -q -- "'$s'" ops/digistore.mjs || echo "missing $s"; done` muss nichts ausgeben.
      Prüfung: `grep -ci 'postyourprice' ops/digistore.mjs` muss 0 ausgeben.
      Prüfung: `grep -oE "'(758179|758180|758181|758954|758955|758956|765137|767706)'" ops/digistore.mjs | sort -u | wc -l` muss genau 8 ausgeben.
- [ ] Die drei Produkte stehen im Konto mit Preis, Währung EUR, Bestellformular 254538 und Dankeseite, und ihre IDs sind die aus
      `CARD_PACKAGES`.
      MVP: Funktion, weil ohne Produkte keine Kasse existiert, auf die karte 02 zeigen kann.
      Prüfung (Netz): `node ops/digistore.mjs --report 2>&1 | grep -cE '^product [0-9]+: credit (5|20|50) EUR, EUR (5|20|50)\.00, order form 254538, refund [0-9]+ days, thankyou yes, sales page https://automatonhost\.com/$'` muss genau 3 ausgeben.
      Prüfung (Netz): `node ops/digistore.mjs --report 2>&1 | grep -cx 'ids: match'` muss genau 1 ausgeben.
      Prüfung: `grep -cE 'productId: *"?[0-9]{5,}' src/payments/digistore.ts` muss genau 3 ausgeben.
- [ ] `ops/card-orders.sh` zählt Kartenkäufe, Fehlbetrag und ob das Kennwort gesetzt ist, liest nur und nennt nie eine Adresse;
      `ops/status.sh` zeigt die Zeilen mit.
      MVP: Funktion, weil die Leitzahl (fremde Käufe per Karte je Woche) und jeder Fehlbetrag sonst unsichtbar bleiben.
      Prüfung: `bash -n ops/card-orders.sh && echo syntax ok` muss `syntax ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-orders.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/card-orders.test.ts` muss mindestens 4 ausgeben.
      Prüfung: `grep -c 'readonly: true' ops/card-orders.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b' ops/card-orders.sh` muss 0 ausgeben.
      Prüfung: `grep -c 'card-orders.sh' ops/status.sh` muss mindestens 1 ausgeben.
      Prüfung (Netz): `bash -c 'set -a; . ~/.config/control-plane/loop.env; set +a; ops/card-orders.sh' | grep -cE '^(card_orders live [0-9]+ test [0-9]+ booked [0-9]+ unassigned [0-9]+ pending_rate [0-9]+ reversed [0-9]+|card_shortfall_usd [0-9]+\.[0-9]{2}|ipn_passphrase (set|missing))$'` muss genau 3 ausgeben.
- [ ] Der Schritt in die Produktion ist festgehalten: ein Vorschlag nennt, was karte 02 zuerst tut (IPN-Verbindung per `ipnSetup`
      auf `https://automatonhost.com/pay/digistore` mit `payment`, `refund` und `chargeback` vor der Dankeseite, das Kennwort in
      `/opt/control-plane/.env` als Handgriff für Matthias mit fertigem Befehl, Rückgabe 30 Tage im Backoffice, falls `--report` sie
      anders meldet, Testkauf je Produkt mit Testpay, einmal einreichen), und die Annahmen stehen fest.
      MVP: Funktion, weil die Produkte erst mit Freigabe verkaufen und dieser Schritt sonst zwischen zwei Goals verloren geht.
      Prüfung: `p=$(ls goals/_vorschlaege/karte-kritik-*.md 2>/dev/null | xargs -r grep -lx 'Goal: karte 01' | head -1); [ -n "$p" ] && head -1 "$p" | grep -qx 'Schwere: 4' && grep -q 'ipnSetup' "$p" && grep -q 'CP_DIGISTORE_IPN_PASSPHRASE' "$p" && grep -qi 'testpay' "$p" && echo belegt || echo fehlt` muss genau `belegt` ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, karte 01: " goals/karte/ANNAHMEN.md` muss mindestens 4 ausgeben.
- [ ] Nichts im Repo nennt eine Adresse eines Kunden, das Kennwort oder den Schlüssel.
      Prüfung: `cat goals/karte/ANNAHMEN.md $(ls goals/_vorschlaege/karte-kritik-*.md 2>/dev/null) | grep -cE '0x[0-9a-fA-F]{40}'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -ciE '(^|/)\.env|passphrase|ipn-pass'` muss 0 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Kein Kauf, kein Testkauf, keine Rückerstattung, kein `ipnSetup`, kein Einreichen zur Freigabe und kein POST an
      `/pay/digistore` der Produktion durch einen Agent.
- [ ] Kein Wert in `/opt/control-plane/.env`, kein Rollout und kein Neustart von Hand.
- [ ] Goal-Datei, Vorschlag und `ANNAHMEN.md` Deutsch, Code und Ausgaben Englisch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`, `*.key`
- `src/payments/**` außer der neuen Datei `src/payments/digistore.ts`; `src/auth/**`, `src/konto/**`, `src/checkout/**`
- `README.md`, `src/public/**`, `mcp/**`, die 402 und jede Seite: das ist karte 02
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen
- Produkte, Zahlungspläne, IPN-Verbindungen, Gutscheine und Bestellformulare anderer Projekte im Konto von Digistore24;
  `~/work/personalplaner24`, `~/work/bautagebuch24`, `~/work/aszendent24` und `~/brain`: nur lesen
- jeder Preis außer 5, 20 und 50 EUR, jeder Gutschein und Rabatt
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
