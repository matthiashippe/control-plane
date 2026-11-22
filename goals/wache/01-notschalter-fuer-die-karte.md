# Wache Goal 01: Notschalter für die Karte

## Status
PLANNED

## Active Objective
Seit karte 01 nimmt der Dienst Kartengeld von Digistore24 an, und Digistore24 erzwingt für englische Produkte 60 Tage Geld zurück.
Das Guthaben wird sofort verbraucht, eine Erstattung danach bucht nur zurück, was noch da ist; den Rest trägt HTC als Fehlbetrag
`shortfall_mc` in `card_orders`. Heute hält nichts einen Käufer auf, der mit immer neuen Wallets kauft, verbraucht und erstatten
lässt. Nach diesem Goal führt jeder Weg zur Kasse über eine Weiterleitung des Dienstes `GET /card/<paket>?address=<wallet>` (Pakete
`5`, `20` und `50`, der Bruttopreis in EUR), und nur sie kennt den Link zu Digistore24; die vier Wege zur Kasse aus karte 02 (Formular
der Startseite, README, Tool `card_top_up` des Plugins, `card_url` der 402) laufen über sie. Die Weiterleitung schickt nicht mehr zur Kasse,
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
- karte Goal 02 DONE

## Kontext für den Maker
- Ziel in einem Satz: Der Test mit Kartenzahlung kostet HTC höchstens 50 USD, egal wer ihn ausnutzt, und Matthias erfährt sofort, wenn
  die Grenze erreicht ist.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Die Wege aus karte 02 und die Werbung aus werbung 01 dürfen die
  Kasse überall bewerben, weil der Schaden aus Erstattungen gedeckelt ist. Ohne dieses Goal wäre jede Werbung für die Karte eine Einladung zum Ausnutzen.
- Quelle: `ROADMAP.md`, Topic `wache`, Glied 01; Grundsatz zur Karte in `docs/kette.md`, Abschnitt „karte: Guthaben per Karte über
  Digistore24“ (Guthaben unauszahlbar, ein Saldo wird nie negativ, die Adresse steht nie im Repo, kein Text nach außen nennt
  PostYourPrice). Die Annahme der IPN in `src/payments/digistore.ts` baute karte 01; sie bleibt, wie sie ist.
- **Bestand.** `reverse()` in `src/payments/digistore.ts` setzt eine Live- oder Testbestellung bei `on_refund` und `on_chargeback`
  auf `status = 'reversed'`, schreibt `shortfall_mc` (gutgeschrieben minus zurückgeholt) und `updated_at`; danach ändert keine IPN die
  Zeile mehr. 1 USD sind 100000 mc (`MC_PER_CENT` ist 1000). karte 02 (Merge `d373269`) nennt die Kasse an vier Stellen direkt
  (`grep -rn 'checkout-ds24' src mcp README.md`): die drei Knöpfe `formaction="https://www.checkout-ds24.com/product/<id>/"` mit dem
  Feld `name="custom"` im Block `<section id="card">` von `src/public/index.html`, die drei Links im Absatz „No USDC? Pay by card.“
  des `README.md`, `cardLink` in `mcp/server.mjs` (für `cardTopUpText` und das Tool `card_top_up`) und `cardCheckoutUrl` in
  `src/payments/digistore.ts`, aus dem `src/inference/proxy.ts` den `card_url` der 402 holt. Im Umzug führt der Knopf
  `<a class="btn btn-2" href="#card">Pay by card</a>` auf den Block. Die drei Produkte sind seit dem 22.11.2026 freigegeben
  (`node ops/digistore.mjs --report`, Kritik karte 02).
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
     der Notschalter an ist, fällt alles zwischen `<!--CARD-->` und `<!--/CARD-->` samt der Marken weg, sonst fallen nur die Marken weg;
     das gilt für jedes Paar. In `src/public/index.html` steht ein Paar um den ganzen Block `<section id="card">` und eines um den
     Knopf „Pay by card“ im Umzug, damit bei an keine Seite auf eine Kasse zeigt, die zu ist. Im Block schickt das Formular an die
     eigene Seite: `<form method="get">` bleibt, die drei Knöpfe tragen `formaction="/card/5"`, `"/card/20"` und `"/card/50"` in der
     Reihenfolge von `CARD_PACKAGES`, das Feld heißt `name="address"` statt `custom` (`pattern`, `required`, `autocomplete`,
     `spellcheck` bleiben). Texte, Klassen, Reihenfolge, das Skript der Seite und sein Hash bleiben Byte für Byte, also bleibt die Seite
     pixelgleich mit dem abgenommenen Bild, und `docs/soll/**` ändert sich nicht. `src/inference/proxy.ts` holt `card_url` der 402
     aus `cardUrlFor` statt aus `cardCheckoutUrl`; der Zweig `topupsClosed` und alles, was die Runtime liest, bleiben.
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
     eine Datei `checkout-ds24.com` nennt. So geht auch jeder spätere Weg zur Kasse über die Weiterleitung.
  8. **README und Plugin.** Im Absatz „No USDC? Pay by card.“ des `README.md` werden die drei Links zu
     `https://automatonhost.com/card/<paket>?address=<your automaton's wallet address>`, der übrige Text bleibt. `cardLink` in
     `mcp/server.mjs` baut `<Basis>/card/<paket>?address=<address in Kleinbuchstaben>` mit der Basis, die das Plugin schon für den
     Dienst nutzt (Standard `DEFAULT_BASE_URL`), und bleibt `null` ohne gültige Adresse; das Plugin ist reines Node und kann
     `src/payments/card-way.ts` nicht importieren, deshalb hält `test/mcp-card.test.ts` beide Funktionen für die Standardbasis gleich.
     `cardCheckoutUrl` in `src/payments/digistore.ts` fällt samt Kommentar weg; wer es rief, nimmt `src/payments/card-way.ts`.
  9. **Die CSP bleibt.** `form-action` in `deploy/Caddyfile` behält `https://www.checkout-ds24.com`, weil Browser `form-action` auch
     auf die Weiterleitung nach dem Absenden prüfen (die 302 von `/card/<paket>`); `deploy/**` bleibt auf der Deny List.
  10. **Prüfer von Digistore24.** Annahme: Die freigegebenen Produkte bleiben freigegeben, weil jeder Knopf weiter auf derselben Kasse
     mit demselben Preis landet. Bei Personalplaner24 kam die Ablehnung „reduzierter Preis“ bei der ersten Prüfung einer Umleitung
     (`~/work/aszendent24/loop-constraints.md`, Abschnitt Digistore24). Dieses Goal ruft Digistore24 nicht auf und reicht nichts ein;
     meldet `--report` später eine Ablehnung, ist das ein Befund für den Tech Lead, kein Rückbau durch den Maker.
  11. **Abgelöste Prüfungen von karte 02.** Zwei Prüfbefehle von karte 02 verlangen den direkten Link und werden durch Punkt 4 dieses
     Goals abgelöst. Der Maker schreibt dafür genau diese zwei Zeilen in `goals/karte/ANNAHMEN.md`:
     „- Abgelöst: karte 02 Punkt 6 durch wache 01 Punkt 4, Ausgabe dann genau `knoepfe ; feld` (Tech Lead, 2026-11-22)“ für die
     Prüfung mit `seite ok` und „- Abgelöst: karte 02 Punkt 8 durch wache 01 Punkt 4, Ausgabe dann genau
     `link 771278; link 771279; link 771280` (Tech Lead, 2026-11-22)“ für die Prüfung mit `readme ok`, jede in einer Zeile. Liefern sie eine andere Ausgabe, fragt er den Tech Lead mit Befehl und Ausgabe. Tests von karte 02,
     die den direkten Link erwarten (`test/card-checkout.test.ts`, `test/mcp-card.test.ts`), behalten ihren Namen; der Maker ändert
     darin nur die erwartete Zeichenkette auf den Weg über `/card/<paket>`, genauso streng (ganze Zeichenkette, Link eingeschlossen),
     und schreibt alte und neue Zeile in `goals/wache/ANNAHMEN.md`. Kein Test fällt weg.
- **Tests** mit festen Zeiten und ohne Netz und festen Port: `test/card-way.test.ts` (Rechnung und Hilfen), `test/card-redirect.test.ts`
  (gegen `createApp` mit leerer Datenbank und `CP_PUBLIC_URL=https://automatonhost.com`), `test/card-breaker-ops.test.ts` (nachgebautes
  `ssh` und `docker` vorn im `PATH` wie `test/card-orders.test.ts`), `test/watchdog-card-breaker.test.ts` (wie
  `test/watchdog-credit.test.ts`, nachgebautes `curl`, dessen POST scheitern kann), `test/card-way-guard.test.ts`. Die Namen prüfen
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
- [ ] Die Rechnung des Notschalters steht genau einmal in `src/payments/card-way.ts`, zählt nur Live-Erstattungen der letzten 60 Tage,
      schaltet bei genau 50 USD Fehlbetrag an, öffnet von selbst wieder und sperrt jede Wallet mit einer Erstattung.
      MVP: Funktion, weil die Grenze von 50 USD sonst nur auf dem Papier steht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "stays off below 50 USD of shortfall from live refunds in 60 days" "turns on at exactly 50 USD of shortfall" "counts chargebacks like refunds" "never counts test orders" "forgets a refund older than 60 days and opens again by itself" "closes the checkout for a wallet that had a refund, also without shortfall" "builds every link to the checkout through /card/<package>" "removes the card way between the markers only while the breaker is on" "offers no card_url while the breaker is on"; do grep -qF "\"$t\"" test/card-way.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -cE '^export const CARD_BREAKER_SHORTFALL_MC = 5_000_000;' src/payments/card-way.ts` muss genau 1 ausgeben.
      Prüfung: `grep -cE '^export const CARD_BREAKER_WINDOW_DAYS = 60;' src/payments/card-way.ts` muss genau 1 ausgeben.
      Prüfung: `grep -cE 'Number\(|parseFloat|toFixed' src/payments/card-way.ts` muss 0 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/CARD_BREAKER_SHORTFALL_MC = 5_000_000;/CARD_BREAKER_SHORTFALL_MC = 5_000_001;/' $T/src/payments/card-way.ts; grep -q '5_000_001' $T/src/payments/card-way.ts || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way.test.ts > /dev/null 2>&1); echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
- [ ] `GET /card/<paket>?address=<wallet>` schickt bei offener Kasse mit 302 zu Digistore24, zeigt im Fall (a) und (b) denselben Satz
      mit dem Weg über USDC und keinen Link zur Kasse, fragt bei fehlender Adresse mit einem Formular nach und wird nie zwischengespeichert.
      MVP: Funktion, weil nur ein Weg, den der Dienst selbst führt, sich abschalten lässt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-redirect.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "sends an open checkout with 302 to digistore24 with the address as custom" "shows the way over USDC instead of the checkout once the breaker is on" "shows the same sentence for a wallet that had a refund" "asks for the address with a form when it is missing or malformed" "answers 404 for an unknown package" "is never cached and never indexed"; do grep -qF "\"$t\"" test/card-redirect.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const bad = []; const a = "0x" + "aB".repeat(20); const al = a.toLowerCase(); const b = "0x" + "cd".repeat(20); const c = "0x" + "ef".repeat(20); const ins = (db, id, addr, mode, mc) => { const t = new Date().toISOString(); db.prepare("INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)").run(id, "771280", addr, mode, "reversed", mc, mc, t, t); }; const get = async (app, p) => { const r = await app.request(p); return { s: r.status, l: r.headers.get("location"), c: r.headers.get("cache-control") ?? "", t: await r.text() }; }; const db = openDb(":memory:"); const app = createApp({ db }); let r = await get(app, "/card/5?address=" + a); if (r.s !== 302 || r.l !== "https://www.checkout-ds24.com/product/771278/?custom=" + al || !r.c.includes("no-store")) bad.push("offen " + r.s); r = await get(app, "/card/50?address=" + a); if (r.l !== "https://www.checkout-ds24.com/product/771280/?custom=" + al) bad.push("paket 50"); r = await get(app, "/card/5?address=0x12"); if (r.s !== 200 || r.l || !r.t.includes("name=\"address\"")) bad.push("formular " + r.s); r = await get(app, "/card/7?address=" + a); if (r.s !== 404) bad.push("paket 7 " + r.s); ins(db, "W1", b, "live", 0); r = await get(app, "/card/20?address=" + b); if (r.s !== 200 || r.l || r.t.includes("checkout-ds24") || !r.t.includes("/pay/5/" + b)) bad.push("wallet " + r.s); r = await get(app, "/card/20?address=" + a); if (r.s !== 302) bad.push("andere wallet " + r.s); ins(db, "T1", c, "test", 5000000); r = await get(app, "/card/5?address=" + a); if (r.s !== 302) bad.push("test zaehlt " + r.s); ins(db, "L1", c, "live", 4999999); r = await get(app, "/card/5?address=" + a); if (r.s !== 302) bad.push("unter grenze " + r.s); ins(db, "L2", "0x" + "12".repeat(20), "live", 1); r = await get(app, "/card/5?address=" + a); if (r.s !== 200 || r.l || r.t.includes("checkout-ds24") || !r.t.includes("/pay/5/" + al)) bad.push("grenze " + r.s); console.log(bad.length ? bad.join("; ") : "weiterleitung ok")' 2>&1 | tail -1` muss genau `weiterleitung ok` ausgeben.
      Prüfung: `grep -cE 'app\.get\("/card/:package"' src/app.ts` muss genau 1 ausgeben.
- [ ] Startseite und 402 holen den Weg zur Kasse nur aus `src/payments/card-way.ts` und lassen ihn weg, solange der Notschalter an ist;
      kein anderer Ort im Produkt nennt die Kasse von Digistore24.
      MVP: Funktion, weil ein Link an der Weiterleitung vorbei den Notschalter umgeht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-guard.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -qF '"links to the digistore24 checkout only from src/payments/card-way.ts"' test/card-way-guard.test.ts && echo name ok` muss genau `name ok` ausgeben.
      Prüfung: `grep -rl 'checkout-ds24' src mcp README.md | grep -vxc 'src/payments/card-way.ts'` muss 0 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; echo 'https://www.checkout-ds24.com/product/771278/' >> $T/README.md; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-guard.test.ts > /dev/null 2>&1); echo "exit=$?"; rm -rf $T` muss genau `exit=1` ausgeben.
      Prüfung: `grep -c 'stripCardWay(' src/app.ts` muss mindestens 1 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops/card-orders.sh ops/digistore.mjs deploy docs/soll | wc -l` muss 0 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- src/payments/digistore.ts | grep -cE '^\+[^+]'` muss 0 ausgeben.
      Prüfung: `grep -rn 'cardCheckoutUrl' src mcp test | wc -l` muss 0 ausgeben.
- [ ] Die vier Wege zur Kasse aus karte 02 führen über `/card/<paket>`: das Formular der Startseite mit dem Feld `address`, die drei
      Links im README, `card_top_up` des Plugins und `card_url` der 402; ist der Notschalter an, zeigt die Startseite weder den Block
      `card` noch den Knopf dorthin.
      MVP: Funktion, weil karte 02 die Kasse sonst an vier Stellen am Notschalter vorbei verlinkt.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const bad = []; const db = openDb(":memory:"); const app = createApp({ db }); let s = await (await app.request("/")).text(); const c = s.indexOf("<section id=\"card\""); const blk = c < 0 ? "" : s.slice(c, s.indexOf("</section>", c)); const acts = [...blk.matchAll(/formaction="([^"]*)"/g)].map((x) => x[1]).join(); if (acts !== "/card/5,/card/20,/card/50") bad.push("knoepfe " + acts); if (!blk.includes("name=\"address\"") || blk.includes("name=\"custom\"")) bad.push("feld"); if (!s.includes("href=\"#card\"")) bad.push("umzug"); if (s.includes("checkout-ds24") || s.includes("<!--CARD-->") || s.includes("<!--/CARD-->")) bad.push("rest"); const t = new Date().toISOString(); db.prepare("INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)").run("L1", "771280", "0x" + "12".repeat(20), "live", "reversed", 5000000, 5000000, t, t); s = await (await app.request("/")).text(); if (s.includes("id=\"card\"") || s.includes("href=\"#card\"") || s.includes("/card/")) bad.push("notschalter"); console.log(bad.length ? bad.join("; ") : "startseite ok")' 2>&1 | tail -1` muss genau `startseite ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const fs = await import("node:fs"); const { CARD_PACKAGES } = await import("./src/payments/digistore.ts"); const r = fs.readFileSync("README.md", "utf8"); const a = r.indexOf("\"conwayApiUrl\": \"https://automatonhost.com\""); const sec = a < 0 ? "" : r.slice(a, r.indexOf("**Run an automaton", a)); const bad = []; for (const p of CARD_PACKAGES) if (!sec.includes("https://automatonhost.com/card/" + p.grossEurCents / 100 + "?address=")) bad.push("link " + p.grossEurCents / 100); if (r.includes("checkout-ds24")) bad.push("kasse"); console.log(bad.length ? bad.join("; ") : "readme ok")'` muss genau `readme ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node --input-type=module -e 'const m = await import("./mcp/server.mjs"); const a = "0x" + "aB".repeat(20); const t = m.cardTopUpText(a) ?? ""; const bad = []; for (const n of [5, 20, 50]) if (!t.includes("https://automatonhost.com/card/" + n + "?address=" + a.toLowerCase())) bad.push("link " + n); if (t.includes("checkout-ds24")) bad.push("kasse"); if (m.cardTopUpText("0x12") !== null) bad.push("adresse"); console.log(bad.length ? bad.join("; ") : "plugin ok")'` muss genau `plugin ok` ausgeben.
      Prüfung: `grep -c 'cardUrlFor(' src/inference/proxy.ts` muss mindestens 1 ausgeben.
      Prüfung: `for t in "offers card_url through /card/5 in the 402 while the checkout is open"; do grep -qF "\"$t\"" test/card-way.test.ts || echo "fehlt: $t"; done; grep -qF '"keeps cardLink of the plugin equal to cardLink of src/payments/card-way.ts"' test/mcp-card.test.ts || echo "fehlt: plugin gleich"` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-checkout.test.ts test/mcp-card.test.ts test/mcp.test.ts test/mcp-automaton.test.ts test/mcp-money.test.ts test/the-way-to-pay.test.ts test/messages.test.ts test/public.test.ts test/without-script.test.ts test/soll.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live.mjs --out $T/s.html && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check --source $T/s.html > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); s() { sed -n '/^<script>$/,/<\/script>/p'; }; a=$(git show $B:src/public/index.html | s | sha256sum); b=$(s < src/public/index.html | sha256sum); [ "$a" = "$b" ] && [ -n "$(s < src/public/index.html)" ] && echo skript gleich` muss genau `skript gleich` ausgeben.
      Prüfung: `grep -cE '^- Abgelöst: karte 02 Punkt (6|8) durch wache 01 Punkt 4, ' goals/karte/ANNAHMEN.md` muss genau 2 ausgeben.
- [ ] `ops/card-breaker.sh` meldet Erstattungen, Fehlbetrag und Notschalter der letzten 60 Tage aus der Rechnung des Dienstes, liest
      nur, nennt nie eine Adresse und kippt in beide Richtungen; `ops/status.sh` zeigt die Zeile als `card_breaker`.
      MVP: Funktion, weil Matthias' „hab ein auge drauf“ eine Zahl braucht, die jeder Lauf der Ops-Triage sieht.
      Prüfung: `bash -n ops/card-breaker.sh && echo syntax ok` muss genau `syntax ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-breaker-ops.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "prints card_refunds_60d, shortfall_usd and breaker off below the limit" "prints breaker on at the limit and off again once the refund is older than 60 days" "rounds the shortfall down to the cent" "never prints an address of the database" "says card_breaker unreadable and exits 1 when the module or the table is missing" "says ssh failed and exits 2 when the server cannot be asked" "ops/status.sh shows card_breaker red while the breaker is on and unknown when the tool fails"; do grep -qF "\"$t\"" test/card-breaker-ops.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'readonly: true' ops/card-breaker.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b|shortfall_mc' ops/card-breaker.sh` muss 0 ausgeben.
      Prüfung: `grep -c 'dist/payments/card-way.js' ops/card-breaker.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -c 'card-breaker.sh' ops/status.sh` muss mindestens 1 ausgeben.
- [ ] Der Watchdog meldet das Auslösen des Notschalters genau einmal über `CP_ALERT_WEBHOOK`, das Wiederöffnen einmal, und verliert
      keine Meldung, wenn der POST scheitert.
      MVP: Funktion, weil ein Notschalter, von dem niemand erfährt, die Kasse still schließt.
      Prüfung: `bash -n ops/watchdog.sh && echo syntax ok` muss genau `syntax ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-card-breaker.test.ts test/watchdog-credit.test.ts test/watchdog-webhook-fail.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "posts one warning when the breaker turns on" "posts nothing more while the breaker stays on" "posts once when the checkout opens again" "keeps the state and posts again on the next run when the post failed" "keeps the state when ops/card-breaker.sh cannot be read"; do grep -qF "\"$t\"" test/watchdog-card-breaker.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'check_card_breaker' ops/watchdog.sh` muss mindestens 2 ausgeben.
- [ ] Die Entscheidungen stehen in `goals/wache/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg, und
      nichts im Repo nennt eine Adresse eines Kunden.
      MVP: Funktion, weil karte 02 und werbung 01 auf diesen Wegen bauen und wissen müssen, warum es nur einen Link zur Kasse gibt.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, wache 01: ' goals/wache/ANNAHMEN.md` muss mindestens 11 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/payments/card-way\.ts|src/payments/digistore\.ts|src/app\.ts|src/db\.ts|src/public/index\.html|src/inference/proxy\.ts|mcp/server\.mjs|README\.md|ops/card-breaker\.sh|ops/status\.sh|ops/watchdog\.sh|ops/README\.md|test/[a-z0-9-]+\.test\.ts|goals/wache/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- . ':!goals' | grep '^+' | grep -oE '0x[0-9a-fA-F]{40}' | sort -u | awk '{s=substr($0,3,2); r=""; for(i=0;i<20;i++) r=r s; if (substr($0,3)!=r) n++} END{print n+0}'` muss 0 ausgeben.
      Prüfung: `grep -ci 'postyourprice' src/payments/card-way.ts` muss 0 ausgeben.
- [ ] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil der Laufzeitpfad sich ändert und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/wache-01 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer mit immer neuen Wallets kauft, verbraucht und erstatten lässt, kommt nach 50 USD Fehlbetrag in 60 Tagen über keinen Weg
      des Dienstes mehr zur Kasse, bis die Summe wieder unter der Grenze liegt, und eine Wallet mit Erstattung nie wieder.
- [ ] Matthias bekommt beim Auslösen genau eine Meldung über den bestehenden Alarmweg, und `ops/status.sh` zeigt den Stand jederzeit.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse eines Kunden, kein Satz zu PostYourPrice, kein Satz zu den Bedingungen des Einkaufs bei
      OpenRouter.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/payments/digistore.ts`: nur `cardCheckoutUrl` samt Kommentar fällt weg, die Annahme der IPN bleibt, wie karte 01 sie gebaut
  hat; `src/payments/**` sonst nur die neue Datei `src/payments/card-way.ts`. `src/auth/**`, `src/konto/**`, `src/checkout/**`,
  `src/handoff/**`
- `src/public/index.html`: nur die Marken, `formaction` und der Name des Felds aus Entscheidung 4; Texte, Klassen, Skript und Hash
  bleiben. `src/inference/proxy.ts`: nur die Quelle von `card_url`. `mcp/server.mjs`: nur `cardLink`, `deposit` bleibt. `README.md`:
  nur die drei Links. `mcp/README.md` und `docs/soll/**`: unverändert
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
- max Zyklen: 5
- max Versuche pro Gap: 3

## Progress Log

## Blockers
keine
