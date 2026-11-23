# Wache Goal 01: Notschalter für die Karte

## Status
DONE

## Active Objective
Seit karte 01 nimmt der Dienst Kartengeld von Digistore24 an, und Digistore24 erzwingt für englische Produkte 60 Tage Geld zurück.
Das Guthaben wird sofort verbraucht, eine Erstattung danach bucht nur zurück, was noch da ist; den Rest trägt HTC als Fehlbetrag
`shortfall_mc` in `card_orders`. Heute hält nichts einen Käufer auf, der mit immer neuen Wallets kauft, verbraucht und erstatten
lässt. Nach diesem Goal führt jeder Weg zur Kasse über eine Weiterleitung des Dienstes `GET /card/<paket>?address=<wallet>` (Pakete
`5`, `20` und `50`, der Bruttopreis in EUR), und nur sie kennt den Link zu Digistore24. Die Weiterleitung schickt nicht mehr zur Kasse,
sondern zeigt einen Satz mit dem Weg über USDC, sobald (a) der Fehlbetrag aus Erstattungen und Rückbuchungen von Live-Bestellungen der
letzten 60 Tage 50 USD erreicht oder (b) zu dieser Wallet schon eine Erstattung kam. Im Fall (a) lassen Startseite und 402 den Weg zur
Kasse ganz weg; fällt die Summe unter die Grenze, geht die Kasse von selbst wieder auf. `ops/status.sh` zeigt die Zeile
`card_refunds_60d <n> shortfall_usd <x> breaker on|off`, und `ops/watchdog.sh` meldet das Auslösen genau einmal über
`CP_ALERT_WEBHOOK`.
Leitzahl: Fehlbetrag aus Erstattungen von Live-Bestellungen der letzten 60 Tage (`ops/card-breaker.sh`, Feld `shortfall_usd`).
Grenze dieses Goals: Bestellungen von vor dem Auslösen kann Digistore24 noch bis zu 60 Tage lang erstatten, ihr Fehlbetrag kommt
dazu. Der Notschalter deckelt neue Käufe, nicht die schon offenen; ob es dafür eine Obergrenze offener Bestellungen braucht, misst
der Fehlbetrag nach dem ersten Auslösen.
Widerlegt, wenn nach dem Auslösen eine neue Live-Bestellung in `card_orders` entsteht oder der Fehlbetrag 50 USD erreicht, ohne
dass `ops/status.sh` `breaker on` meldet und der Alarm kam.
MVP: Funktion, weil sonst jeder mit einer neuen Wallet beliebig oft kaufen, verbrauchen und erstatten lassen kann (Matthias
22.11.2026: „machen wir doch den test mit digistore. aber hab ein auge drauf!!“).

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel in einem Satz: Der Test mit Kartenzahlung kostet HTC höchstens 50 USD, egal wer ihn ausnutzt, und Matthias erfährt sofort, wenn
  die Grenze erreicht ist.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: karte 02 und werbung 01 dürfen die Kasse überall bewerben, weil der
  Schaden aus Erstattungen gedeckelt ist. Ohne dieses Goal wäre jede Werbung für die Karte eine Einladung zum Ausnutzen.
- Quelle: `ROADMAP.md`, Topic `wache`, Glied 01; Grundsatz zur Karte in `docs/kette.md`, Abschnitt „karte: Guthaben per Karte über
  Digistore24“ (Guthaben unauszahlbar, ein Saldo wird nie negativ, die Adresse steht nie im Repo, kein Text nach außen nennt
  PostYourPrice). Die Annahme der IPN in `src/payments/digistore.ts` baute karte 01; sie bleibt, wie sie ist.
- **Bestand.** `reverse()` in `src/payments/digistore.ts` setzt eine Live- oder Testbestellung bei `on_refund` und `on_chargeback`
  auf `status = 'reversed'`, schreibt `shortfall_mc` (gutgeschrieben minus zurückgeholt) und `updated_at`; danach ändert keine IPN die
  Zeile mehr. 1 USD sind 100000 mc (`MC_PER_CENT` ist 1000). karte 02 ist vor diesem Goal gemergt: Auf `dev` führen Startseite
  (`src/public/index.html`, drei Knöpfe mit `formaction` zu Digistore24, Feld `custom`), 402 (`cardCheckoutUrl` aus
  `src/payments/digistore.ts` in `src/inference/proxy.ts`), `README.md` (drei Links) und `mcp/server.mjs` (`cardLink`) direkt zur Kasse.
  Dieses Goal schreibt alle vier auf die Weiterleitung um (Entscheidung 8).
- **Entscheidungen des Tech Lead (22.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, wache 01: …` in
  `goals/wache/ANNAHMEN.md`.
  1. **Eine Stelle für die Rechnung.** Neue Datei `src/payments/card-way.ts`, die einzige Datei des Produkts, die den Host
     `checkout-ds24.com` nennt. Sie exportiert `CARD_BREAKER_SHORTFALL_MC = 5_000_000` (50 USD), `CARD_BREAKER_WINDOW_DAYS = 60`,
     `cardBreaker(db, now)` mit `{ refunds60d, shortfallMc, on }`, `walletRefunded(db, address)`, `checkoutUrl(pkg, address)` (das
     Ziel `https://www.checkout-ds24.com/product/<productId>/?custom=<address in Kleinbuchstaben>`), `cardLink(pkg, address)`
     (`<siteOrigin>/card/<paket>?address=<address in Kleinbuchstaben>`), `cardUrlFor(db, address, now)` (der `cardLink` des Pakets zu
     5 EUR oder `null`, solange der Notschalter an ist) und `stripCardWay(html, on)`. Die Pakete kommen aus `CARD_PACKAGES`, der
     Schlüssel im Pfad ist `grossEurCents / 100`.
  2. **Was zählt.** `refunds60d` und `shortfallMc` zählen nur Zeilen mit `mode = 'live'` und `status = 'reversed'`, deren `updated_at`
     höchstens `CARD_BREAKER_WINDOW_DAYS` Tage vor `now` liegt; `on` ist `shortfallMc >= CARD_BREAKER_SHORTFALL_MC`. Testbestellungen
     zählen nie. `walletRefunded` gilt für jede Live-Zeile mit `status = 'reversed'` zu dieser Adresse (Kleinbuchstaben), ohne
     Zeitfenster und auch mit Fehlbetrag 0, weil eine Wallet, die einmal erstatten ließ, die Kasse nicht wieder braucht. Ganze Zahlen,
     kein `Number(`, kein `parseFloat`, kein `toFixed`. Ein Index auf `card_orders(address)` in `src/db.ts` ist erlaubt.
  3. **Die Weiterleitung** `GET /card/:package` in `src/app.ts`, immer mit `Cache-Control: no-store` und
     `X-Robots-Tag: noindex`: Paket unbekannt ergibt 404. Fehlt `address` oder passt sie nicht auf `0x` plus 40 Hexziffern, kommt eine
     kurze Seite mit Status 200 und einem Formular `<form method="get">` mit dem Feld `name="address"`
     (`pattern="0x[0-9a-fA-F]{40}"`, `required`), weil ein 4xx im Zugriffslog als Fehler eines echten Nutzers zählt
     (`loop-constraints.md`, Grundregel 4). Ist der Notschalter aus und kam zu dieser Wallet keine Erstattung, antwortet sie mit 302 auf
     `checkoutUrl`. Sonst Status 200 mit genau einem Satz und dem Weg über USDC, für (a) und (b) derselbe Text, damit niemand erfährt,
     welcher Fall gilt: etwa „Card payment is paused. Your automaton can still top up with USDC on Base: <link>“, der Link ist
     `<siteOrigin>/pay/5/<address in Kleinbuchstaben>` wie `topup_url` der 402. Die Seite nennt `checkout-ds24` nicht. Texte englisch,
     klare Wörter, keine Begründung, kein Vorbehalt.
  4. **Startseite und 402.** `/` in `src/app.ts` reicht den fertigen Text durch `stripCardWay(html, cardBreaker(db, now).on)`: Solange
     der Notschalter an ist, fällt alles zwischen `<!--CARD-->` und `<!--/CARD-->` samt der Marken weg, sonst fallen nur die Marken weg.
     Die Marken setzt dieses Goal um den Block `#card` der Startseite, und `card_url` der 402 kommt aus `cardUrlFor`
     (Entscheidung 8).
  5. **Messwerkzeug** `ops/card-breaker.sh` nach dem Muster von `ops/card-orders.sh` (gleiche Variablen, fragt per SSH im laufenden
     Container, öffnet die Datenbank mit `readonly: true`), mit `--container` für den Lauf auf dem Server wie
     `ops/credit-runway.sh --container`. Es rechnet nicht selbst, sondern importiert `cardBreaker` aus
     `/app/dist/payments/card-way.js` im Container (der Pfad als Variable mit diesem Standard, damit der Test ihn umlenken kann), also
     steht die Rechnung nur einmal im Code. Ausgabe genau eine Zeile `card_refunds_60d <n> shortfall_usd <dollar>.<cent> breaker on|off`
     (auf den Cent abgerundet, mit BigInt), sonst `card_breaker unreadable` mit Exit 1 (Datenbank, Tabelle oder Modul fehlt, etwa vor dem
     Rollout) und `ssh failed` mit Exit 2. Die Uhr kommt aus `CP_WINDOW_NOW`, wenn gesetzt (Grundregel 3: in beide Richtungen bewiesen).
     Keine Adresse in einer Ausgabe. `ops/status.sh` nimmt die Zeile in genau diesem Format als Feld `card_breaker` auf: `ok` bei
     `breaker off`, `red` bei `breaker on`, `unknown` bei allem anderen. `ops/card-orders.sh` bleibt, wie es ist, weil karte 01 seine
     drei Zeilen jede Nacht prüft.
  6. **Alarm.** `check_card_breaker` in `ops/watchdog.sh` nach dem Muster von `check_credit` (mit Zeitlimit, Zustand
     `${STATE_FILE}.card-breaker`): ein `report "WARN" …` beim Wechsel auf `on` mit Fehlbetrag, Grenze und dem Satz, dass die Kasse
     zu ist, ein `report "OK" …` beim Wechsel zurück auf `off`, nichts, solange der Zustand bleibt. Der neue Zustand wird erst nach
     erfolgreichem POST gespeichert, damit ein gescheiterter POST im nächsten Lauf wiederkommt; eine unlesbare Antwort behält den
     Zustand und meldet höchstens einmal am Tag. Der Text nennt keine Adresse.
  7. **Wächter in `check`.** Ein Test `test/card-way-guard.test.ts` liest `README.md` und jede Datei unter `src/` und `mcp/` von der
     Platte (nicht über git, damit er auch in einer Kopie ohne `.git` greift) und schlägt fehl, sobald außer `src/payments/card-way.ts`
     eine Datei `checkout-ds24.com` nennt. So geht auch jeder spätere Weg zur Kasse über die Weiterleitung. Die Wege von karte 02 schreibt
     dieses Goal auf `cardLink` um (Entscheidung 8).
  8. **Die Wege von karte 02 über die Weiterleitung** (Kritik des Tech Lead, 2026-11-23; karte 02 wurde vor diesem Goal gemergt).
     `cardCheckoutUrl` fällt aus `src/payments/digistore.ts`, die Annahme der IPN dort bleibt unverändert. Die 402 in
     `src/inference/proxy.ts` holt `card_url` und den Satz „No USDC? Pay by card: …“ aus `cardUrlFor(db, address, now)`; beide fehlen,
     solange der Notschalter an ist. In `src/public/index.html` stehen `<!--CARD-->` und `<!--/CARD-->` um den Block `#card`, das Feld
     heißt `name="address"` statt `custom`, die Knöpfe haben `formaction="/card/5"`, `"/card/20"` und `"/card/50"`; auf dem Bildschirm
     ändert sich nichts, also kein SOLL. `README.md` nennt die drei Links `https://automatonhost.com/card/<paket>?address=<your
     automaton's wallet address>`. `cardLink` in `mcp/server.mjs` baut `<CP_URL>/card/<paket>?address=<address in Kleinbuchstaben>`,
     `test/mcp-card.test.ts` und `test/card-checkout.test.ts` ziehen mit (ändern, nicht löschen). `deploy/Caddyfile` behält
     `https://www.checkout-ds24.com` in `form-action`, weil der Browser das Ziel der 302 nach einem Formular dagegen prüft. Wird
     dadurch ein Prüfbefehl von karte 02 rot, schreibt der Maker Befehl und beide Ausgaben auf das Topic, und der Tech Lead entscheidet
     je Zeile `Abgelöst:` in `goals/karte/ANNAHMEN.md`.
- **Tests** mit festen Zeiten und ohne Netz und festen Port: `test/card-way.test.ts` (Rechnung und Hilfen), `test/card-redirect.test.ts`
  (gegen `createApp` mit leerer Datenbank und `CP_PUBLIC_URL=https://automatonhost.com`), `test/card-breaker-ops.test.ts` (nachgebautes
  `ssh` und `docker` vorn im `PATH` wie `test/card-orders.test.ts`), `test/watchdog-card-breaker.test.ts` (wie
  `test/watchdog-credit.test.ts`, nachgebautes `curl`, dessen POST scheitern kann), `test/card-way-guard.test.ts`, `test/card-way-pages.test.ts` (Startseite und 402 gegen `createApp`). Die Namen prüfen
  die Punkte. Testadressen sind nur Wiederholungen eines Hex-Paars (`0x` plus 20 Mal `ab`). Jeder neue Fall war einmal rot, die Zeile
  im Progress Log sagt, womit.
- Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `card-orders`, `digistore`, `watchdog` oder `status.sh` nennen
  (`grep -l -E 'card-orders|digistore|watchdog|status\.sh' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem Bau
  erneut. Wird einer durch dieses Goal rot, ohne dass sein Zweck verletzt ist, fragt der Maker den Tech Lead auf dem Topic mit Befehl
  und beiden Ausgaben; der entscheidet mit einer Zeile `Abgelöst:` im `ANNAHMEN.md` des alten Goals. Kein Prüfbefehl eines fertigen
  Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Kauf, kein POST an `/pay/digistore` der Produktion, kein Wert in
  `/opt/control-plane/.env`, kein Rollout und kein Neustart durch einen Agent. Code, Bezeichner, Testnamen, Ausgaben und Texte der
  Seite englisch.

## Done Condition
- [x] Die Rechnung des Notschalters steht genau einmal in `src/payments/card-way.ts`, zählt nur Live-Erstattungen der letzten 60 Tage,
      schaltet bei genau 50 USD Fehlbetrag an, öffnet von selbst wieder und sperrt jede Wallet mit einer Erstattung.
      MVP: Funktion, weil die Grenze von 50 USD sonst nur auf dem Papier steht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "stays off below 50 USD of shortfall from live refunds in 60 days" "turns on at exactly 50 USD of shortfall" "counts chargebacks like refunds" "never counts test orders" "forgets a refund older than 60 days and opens again by itself" "closes the checkout for a wallet that had a refund, also without shortfall" "builds every link to the checkout through /card/<package>" "removes the card way between the markers only while the breaker is on" "offers no card_url while the breaker is on"; do grep -qF "\"$t\"" test/card-way.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -cE '^export const CARD_BREAKER_SHORTFALL_MC = 5_000_000;' src/payments/card-way.ts` muss genau 1 ausgeben.
      Prüfung: `grep -cE '^export const CARD_BREAKER_WINDOW_DAYS = 60;' src/payments/card-way.ts` muss genau 1 ausgeben.
      Prüfung: `grep -cE 'Number\(|parseFloat|toFixed' src/payments/card-way.ts` muss 0 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/CARD_BREAKER_SHORTFALL_MC = 5_000_000;/CARD_BREAKER_SHORTFALL_MC = 5_000_001;/' $T/src/payments/card-way.ts; grep -q '5_000_001' $T/src/payments/card-way.ts || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way.test.ts > /dev/null 2>&1); echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
- [x] `GET /card/<paket>?address=<wallet>` schickt bei offener Kasse mit 302 zu Digistore24, zeigt im Fall (a) und (b) denselben Satz
      mit dem Weg über USDC und keinen Link zur Kasse, fragt bei fehlender Adresse mit einem Formular nach und wird nie zwischengespeichert.
      MVP: Funktion, weil nur ein Weg, den der Dienst selbst führt, sich abschalten lässt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-redirect.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "sends an open checkout with 302 to digistore24 with the address as custom" "shows the way over USDC instead of the checkout once the breaker is on" "shows the same sentence for a wallet that had a refund" "asks for the address with a form when it is missing or malformed" "answers 404 for an unknown package" "is never cached and never indexed"; do grep -qF "\"$t\"" test/card-redirect.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const bad = []; const a = "0x" + "aB".repeat(20); const al = a.toLowerCase(); const b = "0x" + "cd".repeat(20); const c = "0x" + "ef".repeat(20); const ins = (db, id, addr, mode, mc) => { const t = new Date().toISOString(); db.prepare("INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)").run(id, "771280", addr, mode, "reversed", mc, mc, t, t); }; const get = async (app, p) => { const r = await app.request(p); return { s: r.status, l: r.headers.get("location"), c: r.headers.get("cache-control") ?? "", t: await r.text() }; }; const db = openDb(":memory:"); const app = createApp({ db }); let r = await get(app, "/card/5?address=" + a); if (r.s !== 302 || r.l !== "https://www.checkout-ds24.com/product/771278/?custom=" + al || !r.c.includes("no-store")) bad.push("offen " + r.s); r = await get(app, "/card/50?address=" + a); if (r.l !== "https://www.checkout-ds24.com/product/771280/?custom=" + al) bad.push("paket 50"); r = await get(app, "/card/5?address=0x12"); if (r.s !== 200 || r.l || !r.t.includes("name=\"address\"")) bad.push("formular " + r.s); r = await get(app, "/card/7?address=" + a); if (r.s !== 404) bad.push("paket 7 " + r.s); ins(db, "W1", b, "live", 0); r = await get(app, "/card/20?address=" + b); if (r.s !== 200 || r.l || r.t.includes("checkout-ds24") || !r.t.includes("/pay/5/" + b)) bad.push("wallet " + r.s); r = await get(app, "/card/20?address=" + a); if (r.s !== 302) bad.push("andere wallet " + r.s); ins(db, "T1", c, "test", 5000000); r = await get(app, "/card/5?address=" + a); if (r.s !== 302) bad.push("test zaehlt " + r.s); ins(db, "L1", c, "live", 4999999); r = await get(app, "/card/5?address=" + a); if (r.s !== 302) bad.push("unter grenze " + r.s); ins(db, "L2", "0x" + "12".repeat(20), "live", 1); r = await get(app, "/card/5?address=" + a); if (r.s !== 200 || r.l || r.t.includes("checkout-ds24") || !r.t.includes("/pay/5/" + al)) bad.push("grenze " + r.s); console.log(bad.length ? bad.join("; ") : "weiterleitung ok")' 2>&1 | tail -1` muss genau `weiterleitung ok` ausgeben.
      Prüfung: `grep -cE 'app\.get\("/card/:package"' src/app.ts` muss genau 1 ausgeben.
- [x] Startseite, 402, README und MCP führen nur über `/card/<paket>` zur Kasse, Startseite und 402 lassen den Weg weg, solange der
      Notschalter an ist, und kein anderer Ort im Produkt nennt die Kasse von Digistore24.
      MVP: Funktion, weil ein Link an der Weiterleitung vorbei den Notschalter umgeht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-guard.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -qF '"links to the digistore24 checkout only from src/payments/card-way.ts"' test/card-way-guard.test.ts && echo name ok` muss genau `name ok` ausgeben.
      Prüfung: `grep -rl 'checkout-ds24' src mcp README.md | grep -vxc 'src/payments/card-way.ts'` muss 0 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; echo 'https://www.checkout-ds24.com/product/771278/' >> $T/README.md; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-guard.test.ts > /dev/null 2>&1); echo "exit=$?"; rm -rf $T` muss genau `exit=1` ausgeben.
      Prüfung: `grep -c 'stripCardWay(' src/app.ts` muss mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-pages.test.ts test/mcp-card.test.ts test/card-checkout.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "drops the card block of the start page while the breaker is on" "keeps the card block of the start page without the markers while the breaker is off" "offers card_url through /card/5 in the 402 while the breaker is off" "names no card in the 402 while the breaker is on"; do grep -qF "\"$t\"" test/card-way-pages.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -cE 'formaction="/card/(5|20|50)"' src/public/index.html` muss genau 3 ausgeben.
      Prüfung: `grep -c '<!--/CARD-->' src/public/index.html` muss genau 1 ausgeben.
      Prüfung: `grep -c 'name="custom"' src/public/index.html` muss 0 ausgeben.
      Prüfung: `grep -cE 'https://automatonhost\.com/card/(5|20|50)\?address=' README.md` muss genau 3 ausgeben.
      Prüfung: `cat src/payments/digistore.ts src/inference/proxy.ts mcp/server.mjs | grep -c 'cardCheckoutUrl'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops/card-orders.sh ops/digistore.mjs | wc -l` muss 0 ausgeben.
- [x] `ops/card-breaker.sh` meldet Erstattungen, Fehlbetrag und Notschalter der letzten 60 Tage aus der Rechnung des Dienstes, liest
      nur, nennt nie eine Adresse und kippt in beide Richtungen; `ops/status.sh` zeigt die Zeile als `card_breaker`.
      MVP: Funktion, weil Matthias' „hab ein auge drauf“ eine Zahl braucht, die jeder Lauf der Ops-Triage sieht.
      Prüfung: `bash -n ops/card-breaker.sh && echo syntax ok` muss genau `syntax ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-breaker-ops.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "prints card_refunds_60d, shortfall_usd and breaker off below the limit" "prints breaker on at the limit and off again once the refund is older than 60 days" "rounds the shortfall down to the cent" "never prints an address of the database" "says card_breaker unreadable and exits 1 when the module or the table is missing" "says ssh failed and exits 2 when the server cannot be asked" "ops/status.sh shows card_breaker red while the breaker is on and unknown when the tool fails"; do grep -qF "\"$t\"" test/card-breaker-ops.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'readonly: true' ops/card-breaker.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b|shortfall_mc' ops/card-breaker.sh` muss 0 ausgeben.
      Prüfung: `grep -c 'dist/payments/card-way.js' ops/card-breaker.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -c 'card-breaker.sh' ops/status.sh` muss mindestens 1 ausgeben.
- [x] Der Watchdog meldet das Auslösen des Notschalters genau einmal über `CP_ALERT_WEBHOOK`, das Wiederöffnen einmal, und verliert
      keine Meldung, wenn der POST scheitert.
      MVP: Funktion, weil ein Notschalter, von dem niemand erfährt, die Kasse still schließt.
      Prüfung: `bash -n ops/watchdog.sh && echo syntax ok` muss genau `syntax ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-card-breaker.test.ts test/watchdog-credit.test.ts test/watchdog-webhook-fail.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "posts one warning when the breaker turns on" "posts nothing more while the breaker stays on" "posts once when the checkout opens again" "keeps the state and posts again on the next run when the post failed" "keeps the state when ops/card-breaker.sh cannot be read"; do grep -qF "\"$t\"" test/watchdog-card-breaker.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'check_card_breaker' ops/watchdog.sh` muss mindestens 2 ausgeben.
- [x] Die Entscheidungen stehen in `goals/wache/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg, und
      nichts im Repo nennt eine Adresse eines Kunden.
      MVP: Funktion, weil karte 02 und werbung 01 auf diesen Wegen bauen und wissen müssen, warum es nur einen Link zur Kasse gibt.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, wache 01: ' goals/wache/ANNAHMEN.md` muss mindestens 7 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/payments/card-way\.ts|src/payments/digistore\.ts|src/inference/proxy\.ts|src/public/index\.html|mcp/server\.mjs|README\.md|src/app\.ts|src/db\.ts|ops/card-breaker\.sh|ops/status\.sh|ops/watchdog\.sh|ops/README\.md|test/[a-z0-9-]+\.test\.ts|goals/wache/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- . ':!goals' | grep '^+' | grep -oE '0x[0-9a-fA-F]{40}' | sort -u | awk '{s=substr($0,3,2); r=""; for(i=0;i<20;i++) r=r s; if (substr($0,3)!=r) n++} END{print n+0}'` muss 0 ausgeben.
      Prüfung: `grep -ci 'postyourprice' src/payments/card-way.ts` muss 0 ausgeben.
- [x] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil der Laufzeitpfad sich ändert und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/wache-01 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer mit immer neuen Wallets kauft, verbraucht und erstatten lässt, kommt nach 50 USD Fehlbetrag in 60 Tagen über keinen Weg
      des Dienstes mehr zur Kasse, bis die Summe wieder unter der Grenze liegt, und eine Wallet mit Erstattung nie wieder.
- [ ] Matthias bekommt beim Auslösen genau eine Meldung über den bestehenden Alarmweg, und `ops/status.sh` zeigt den Stand jederzeit.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse eines Kunden, kein Satz zu PostYourPrice, kein Satz zu den Bedingungen des Einkaufs bei
      OpenRouter.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/payments/digistore.ts`: nur `cardCheckoutUrl` fällt weg (Entscheidung 8), die Annahme der IPN bleibt, wie karte 01 sie
  gebaut hat; `src/payments/**` sonst nur die neue Datei `src/payments/card-way.ts`. `src/auth/**`, `src/konto/**`, `src/checkout/**`, `src/handoff/**`
- `src/public/index.html`, `src/inference/proxy.ts`, `mcp/server.mjs`, `README.md`: nur der Weg zur Kasse nach Entscheidung 8, kein
  anderer Text, nichts Sichtbares; `mcp/**` sonst unverändert
- `ops/card-orders.sh` und `ops/digistore.mjs`: unverändert (karte 01 prüft beide jede Nacht)
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`,
  die der Tech Lead entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- Produkte, Rückgaberegeln, IPN-Verbindungen und Bestellformulare im Konto von Digistore24: nicht anfassen, dieses Goal ruft
  Digistore24 nicht auf
- ein Kauf, ein POST an `/pay/digistore` der Produktion, jeder Wert in `/opt/control-plane/.env`, ein Rollout oder Neustart durch einen
  Agent, Wallet-Bewegung, Topup, Gutschrift von Hand (`loop-constraints.md`, Grundregeln 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-23 Zyklus 1: Punkte 1, 2, 4, 5, 6, 7, 8 gebaut: `src/payments/card-way.ts` (Rechnung des Notschalters, Links nur über `/card/<paket>`, `stripCardWay`), Route `GET /card/:package` in `src/app.ts`, `ops/card-breaker.sh` mit Feld `card_breaker` in `ops/status.sh`, `check_card_breaker` in `ops/watchdog.sh`, 13 Zeilen in `goals/wache/ANNAHMEN.md`. Punkt 3 bleibt offen nach Entscheidung des Tech Leads (karte 02 ist vor diesem Goal gemergt, Startseite, 402, README und MCP führen auf dev direkt zur Kasse; neuer Schnitt in der Kritik). Rot gesehen: die vier neuen Testdateien gegen die Merge-Basis (card-way: Modul fehlt; card-redirect 5 von 6; card-breaker-ops 7 von 7; watchdog-card-breaker 5 von 5), Grenze 5_000_001 per Mutation exit=1. Prüfbefehle: Punkt 1 vitest Exit 0, Namen nichts fehlt, 1, 1, 0, exit=1 ohne sed-miss; Punkt 2 vitest Exit 0, Namen nichts fehlt, `weiterleitung ok`, 1; Punkt 3 (offen) guard-Test exit=1, `checkout-ds24` außerhalb 4, `stripCardWay(` 1, fremde Dateien 0; Punkt 4 `syntax ok`, vitest Exit 0, Namen nichts fehlt, `readonly: true` 2, Schreibwörter 0, Modul 2, `status.sh` 3; Punkt 5 `syntax ok`, vitest Exit 0 (drei Dateien), Namen nichts fehlt, `check_card_breaker` 2; Punkt 6 Annahmen 13, fremde Pfade 0, gelöschte Tests 0, Adressen 0, `postyourprice` 0; Punkt 7 PR #395 am Kopf 24c42c5 `check` und `e2e` pass; Punkt 8 `check` grün in 97 s.
- 2026-11-23 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 4, 5, 6, 7, 8 nach Merge von `dev` (86d28e1) in den Goal-Branch; Punkt 3 bleibt offen bis zum neuen Schnitt des Tech Leads in der Kritik. Prüfbefehle: Punkt 1 vitest Exit 0, Namen nichts fehlt, 1, 1, 0, exit=1 ohne sed-miss; Punkt 2 vitest Exit 0, Namen nichts fehlt, `weiterleitung ok`, 1; Punkt 3 (offen) guard-Test exit=1, `checkout-ds24` außerhalb 4, `stripCardWay(` 1, gesperrte Dateien 0; Punkt 4 `syntax ok`, vitest Exit 0, Namen nichts fehlt, 2, 0, 2, 3; Punkt 5 `syntax ok`, vitest Exit 0 (drei Dateien), Namen nichts fehlt, 2; Punkt 6 Annahmen 12, fremde Pfade 0, gelöschte Tests 0, Adressen 0, `postyourprice` 0; Punkt 7 PR #395 am Kopf 99c69da `e2e` pass (1), `check` pass; Punkt 8 `check` grün in 77 s.
- 2026-11-23 Zyklus 3: Punkt 3 nach dem neuen Schnitt gebaut (Startseite mit Marken, Feld `address` und `/card/5`, `/card/20`, `/card/50`; 402 aus `cardUrlFor`; `cardCheckoutUrl` entfernt; README und `cardLink` in `mcp/server.mjs` auf `/card/<paket>?address=`; `test/card-checkout.test.ts` und `test/mcp-card.test.ts` nachgezogen; neu `test/card-way-pages.test.ts` und `test/card-way-guard.test.ts`, gegen b9be439 alle 5 Fälle rot). Punkt 6 wieder offen: die Prüfung des Umfangs gibt 1, weil `goals/_vorschlaege/wache-kritik-2026-11-23-1.md` aus dem Kritik-Commit b9be439 außerhalb der erlaubten Pfade liegt. Prüfbefehle: Punkt 1 vitest Exit 0, Namen nichts fehlt, 1, 1, 0, exit=1 ohne sed-miss; Punkt 2 vitest Exit 0, Namen nichts fehlt, `weiterleitung ok`, 1; Punkt 3 vitest Exit 0, `name ok`, 0, exit=1 (unverändert exit=0), 1, vitest Exit 0 (drei Dateien), Namen nichts fehlt, 3, 1, 0, 3, 0, 0; Punkt 4 `syntax ok`, vitest Exit 0, Namen nichts fehlt, 2, 0, 2, 3; Punkt 5 `syntax ok`, vitest Exit 0, Namen nichts fehlt, 2; Punkt 6 Annahmen 16, fremde Pfade 1 (Vorschlag), gelöschte Tests 0, Adressen 0, `postyourprice` 0; Punkt 7 PR #395 am Kopf e0304ec `e2e` pass, `check` pass; Punkt 8 `check` grün in 93 s. karte 02: Punkte der Zeilen 188, 189 und 202 rot, an den Tech Lead für `Abgelöst:`.
- 2026-11-23 Zyklus 4: Abschluss gemeldet, Punkte 1 bis 8, nachdem der Tech Lead den Vorschlag vom Goal-Branch nahm und karte 02 Punkte 6 und 8 ablöste (b58b889); `dev` (86d28e1) ist enthalten. Prüfbefehle: Punkt 1 vitest Exit 0, Namen nichts fehlt, 1, 1, 0, exit=1 ohne sed-miss; Punkt 2 vitest Exit 0, Namen nichts fehlt, `weiterleitung ok`, 1; Punkt 3 vitest Exit 0, `name ok`, 0, exit=1 (unverändert exit=0), 1, vitest Exit 0 (drei Dateien), Namen nichts fehlt, 3, 1, 0, 3, 0, 0; Punkt 4 `syntax ok`, vitest Exit 0, Namen nichts fehlt, 2, 0, 2, 3; Punkt 5 `syntax ok`, vitest Exit 0, Namen nichts fehlt, 2; Punkt 6 Annahmen 19, fremde Pfade 0, gelöschte Tests 0, Adressen 0, `postyourprice` 0; Punkt 7 PR #395 am Kopf b58b889 `e2e` pass (1), `check` pass; Punkt 8 `check` grün in 78 s.
- 2026-11-23 Release: PASS K und B (Zyklus 4), DONE.

## Blockers
keine
