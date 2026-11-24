# Wache Goal 03: Der Notschalter hält auch die direkt aufgerufene Kasse

## Status
ACTIVE

## Active Objective
Seit wache 01 schließt der Notschalter jeden Weg des Dienstes zur Kasse von Digistore24, aber nicht die Kasse selbst: Wer einmal auf
`/card/5` klickt, sieht in der 302 die Adresse der Kasse mit `custom=<wallet>` (`checkoutUrl` in `src/payments/card-way.ts:72`) und
kann sie mit jeder Wallet direkt aufrufen, und die IPN in `handleDigistoreIpn` (`src/payments/digistore.ts:297`) schreibt die Zahlung
gut, ohne `cardBreaker` oder `walletRefunded` zu fragen. So kann jemand bei Notschalter an oder mit einer Wallet, die schon eine
Erstattung hatte, weiter kaufen, verbrauchen und erstatten lassen, und der Fehlbetrag wächst über 50 USD hinaus. Dazu zeigt der Block
`video` der Startseite (`src/public/index.html:972`) und jeder Fehlerseite (`src/public/error-pages.ts:96`) auch bei Notschalter an
die eingebrannte Schlusstafel „Top up by card, PayPal or Apple Pay.“ (`docs/video/move.tape:35`).
Nach diesem Goal schreibt die IPN bei Notschalter an und für eine Wallet mit früherer Erstattung nichts gut, speichert die Bestellung
mit Status `held`, schreibt eine Log-Zeile mit Bestellnummer und Grund und antwortet Digistore24 mit `OK`; `ops/card-breaker.sh --held`
nennt die Zahl der gehaltenen Bestellungen, `ops/watchdog.sh` meldet jede neue einmal über den bestehenden Alarmweg, und bei
Notschalter an steht auf `/` und auf den Fehlerseiten kein Video mit der Kasse.
Leitzahl: gutgeschriebene Credits aus Bestellungen bei Notschalter an, Ziel 0; nach dem Rollout gemessen mit
`ops/card-breaker.sh --held` neben `ops/card-breaker.sh` (jede gehaltene Bestellung ist eine, die vorher gutgeschrieben worden wäre).
Grenze dieses Goals: keine Erstattung über die API von Digistore24 und kein Human Gate. Bei Notschalter an kommt nach heutigem Stand
keine echte Bestellung, und wer doch zahlt, bekommt sein Geld über die 60 Tage Geld zurück von Digistore24; zeigt `held` eine echte
Bestellung, wird die Erstattung über die API ein Vorschlag mit dem Gate für den Schlüssel. Das Skript `docs/video/move.tape` und das
GIF im README bleiben, wie sie sind (Entscheidung 5).
Widerlegt, wenn die IPN schon heute bei Notschalter an nicht gutschreibt (gemessen am 2026-11-24 auf `dev` f835fd5 mit dem dritten
Prüfbefehl von Punkt 1: Status `booked`, Guthaben größer 0, also gilt das Goal).
MVP: Funktion, weil der Notschalter sonst nur die Knöpfe sperrt, aber nicht das Geld.

## Voraussetzungen
- wache Goal 02 DONE
- reichweite Goal 03 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ist der Notschalter an oder hatte die Wallet schon eine Erstattung, kommt kein Guthaben mehr aus einer Zahlung
  per Karte, gleich auf welchem Weg der Käufer in die Kasse kam, und keine Seite zeigt dann noch ein Video, das die Kasse verspricht.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Die Karte bleibt offen, solange der Test höchstens 50 USD kostet,
  weil niemand die Grenze mehr über die direkt aufgerufene Kasse umgehen kann; ohne diese Sperre müsste der Notschalter bei der
  ersten Umgehung von Hand ganz zu, und Menschen ohne Krypto verlören den Weg, den werbung 01 überall bewirbt.
- Quelle: `ROADMAP.md`, Topic `wache`, Glied 03 (Tech Lead 24.11.2026, PRO-28911). Übernimmt
  `goals/_vorschlaege/wache-kritik-2026-11-23-1.md` (ohne die Erstattung per API) und
  `goals/_vorschlaege/reichweite-kritik-2026-11-23-1.md` (Block `video` und Schlusstafel).
- **Bestand am Kopf von `dev` (f835fd5).** `handleDigistoreIpn` setzt für eine Live-Zahlung mit Adresse, Währung EUR und lesbarem
  `amount_vendor` den Status `pending_rate` (`src/payments/digistore.ts:322`), fügt die Zeile mit `INSERT OR IGNORE` ein, holt den Kurs
  der EZB und bucht mit `bookWithRate`. Die Spalte `status` von `card_orders` hat ein CHECK ohne `held`
  (`src/db.ts:392`). `cardBreaker(db, now)` und `walletRefunded(db, address)` stehen in `src/payments/card-way.ts:41` und `:54`;
  `card-way.ts` importiert `CARD_PACKAGES` aus `./digistore.js` und nutzt es nur in Funktionen. `ops/card-breaker.sh --container`
  importiert `cardBreaker` aus `/app/dist/payments/card-way.js` im Container `deploy-cp-1` und gibt genau eine Zeile aus;
  `check_card_breaker` in `ops/watchdog.sh:178` ruft es alle fünf Minuten über die crontab des Servers auf
  (`ops/README.md:82`, dort steht `CP_ALERT_WEBHOOK`, nicht in `/opt/control-plane/.env` und nicht im Container), meldet nur den
  Wechsel über `report` und speichert den neuen Stand erst nach dem POST. Der Block `video` steht auf `/` zwischen `<!--/NOCARD-->`
  (Zeile 970) und `<!--CARD-->` des Blocks `card` (Zeile 979), auf den Fehlerseiten ohne Bedingung in `renderErrorPage`.
- **Entscheidungen des Tech Lead (24.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, wache 03: …` in
  `goals/wache/ANNAHMEN.md`.
  1. **Die IPN hält die Zahlung.** `src/payments/digistore.ts` importiert `cardBreaker` und `walletRefunded` aus `./card-way.js` (der
     Kreis der Importe ist unschädlich, weil beide Seiten das Fremde nur in Funktionen nutzen; `check` und `e2e` belegen das). Wäre der
     Status `pending_rate`, wird er `held`, wenn `cardBreaker(db, now).on` gilt (Grund `card breaker on`) oder sonst
     `walletRefunded(db, address)` (Grund `wallet had a refund`). Für `held` schreibt die IPN genau die Log-Zeile
     `[digistore] order <order_id> held: <Grund>`, fragt die EZB nicht, bucht nichts und antwortet `200` mit `OK`. Eine wiederholte IPN
     und eine Erstattung oder Rückbuchung einer Bestellung auf `held` buchen nichts und lassen sie auf `held` (der bestehende Zweig
     „on a held order, nothing booked“ in `reverse` reicht). Eine Bestellung, die vor dem Auslösen auf `pending_rate` stand, bucht
     `bookPendingCardOrders` weiter wie bisher, weil sie bezahlt wurde, als die Kasse offen war. `cardBreaker` und `walletRefunded`
     bleiben unverändert.
  2. **`held` im Schema.** Das CHECK von `card_orders` kennt `held`. SQLite ändert kein CHECK, also baut `openDb` eine Tabelle ohne
     `held` einmal neu, in einer Transaktion und mit jeder Zeile, nach dem Muster von `handoffs` in `src/db.ts:495` (Umbenennen,
     neu anlegen, kopieren, alte löschen). Die Produktion hat Zeilen in `card_orders`; keine geht verloren, und ein zweites `openDb`
     baut nichts mehr um.
  3. **Gemeldet wird über den Watchdog.** Der Alarmweg ist `report` in `ops/watchdog.sh`, weil nur dort `CP_ALERT_WEBHOOK` steht
     (crontab des Servers, `ops/README.md:82`); der Dienst selbst kennt den Webhook nicht (`grep -rn CP_ALERT_WEBHOOK src` ist leer), und
     Cron und `/opt/control-plane/.env` bleiben, wie sie sind. Neu in `src/payments/card-way.ts`: `export function heldCardOrders(db: Db):
     number` (Zahl der Zeilen mit Status `held`); die Regel steht damit nur dort. `ops/card-breaker.sh --held` (über ssh) und
     `ops/card-breaker.sh --container --held` importieren sie wie `cardBreaker` aus dem übersetzten Modul, öffnen die Datenbank mit
     `readonly: true` und geben genau eine Zeile `card_orders_held <n>` aus, sonst `card_breaker unreadable` mit Exit 1 oder `ssh
     failed` mit Exit 2 wie bisher; ohne `--held` bleibt die Ausgabe Byte für Byte, wie sie ist, weil `ops/status.sh` und die Tests von
     wache 01 sie lesen. `check_card_held` in `ops/watchdog.sh` ruft es mit derselben Zeitgrenze wie `check_card_breaker` auf, steht als
     eigene Zeile `check_card_held` direkt nach `check_card_breaker` am Ende und vergleicht mit `<state file>.card-held` (fehlt die
     Datei, gilt 0): Ist die Zahl größer, genau ein `report "WARN" "card order held: <neu> new, <n> in total, paid while the card
     checkout was closed, nothing credited"`, und der neue Stand wird erst nach dem POST gespeichert, damit ein gescheiterter POST im
     nächsten Lauf wiederkommt; bleibt sie gleich, nur eine Zeile `[INFO]` im Log; ist die Antwort nicht lesbar, kein POST (das meldet
     `check_card_breaker` schon einmal am Tag). `ops/README.md` beschreibt `--held` und die Meldung im Abschnitt des Watchdogs.
  4. **Kein Video mit der Kasse bei Notschalter an.** Auf `/` wandert die Zeile `<!--CARD-->` des Blocks `card` vor
     `<section class="watch" data-soll="video">`, sonst ändert sich an `src/public/index.html` nichts: Video und Karte bilden einen
     Block, den `stripCardWay` bei Notschalter an ganz entfernt, und bei Notschalter aus bleibt die Seite bis auf Leerraum gleich, auch
     die Reihenfolge `move`, `video`, `card`, die `test/werbung.test.ts` und `test/card-checkout.test.ts` prüfen. In
     `renderErrorPage` steht der Block `video` nur bei `cardOpen`, wie die Zeile `CARD_LINE`. Weil die Seiten bei Notschalter aus gleich
     bleiben und bei Notschalter an nur ein Block wegfällt, wie wache 01 den Block `card` weglässt, bleiben die SOLL-Bilder gültig, und
     es braucht kein neues.
  5. **Skript und Video bleiben.** Der Kommentar von `src/public/video/move.mp4` nennt den sha256 von `docs/video/move.tape`
     (`expectedComment` in `ops/video-assess.mjs:137`), und `ops/video-assess.mjs` meldet bei geändertem Skript den Fehler „mp4 comment
     tape_sha256 does not match the tape file“ (gemessen am 2026-11-24 mit einer Kopie ohne die Zeile der Schlusstafel); dann wären
     „accepts the committed video files“ in `test/video-assess.test.ts` und Prüfbefehle von reichweite 03 rot. Darum ändert dieses Goal
     das Skript nicht, entgegen dem Wortlaut der `ROADMAP.md`: Die Tafel verschwindet bei Notschalter an mit dem Block, und die nächste
     Aufnahme bekommt die Tafel ohne Zahlweg. Das GIF im README lässt sich nicht abschalten und bleibt.
- **Tests** mit fester Uhr wie `test/digistore-ipn.test.ts`, ohne Netz (die EZB ist ein gestelltes `fetch`) und ohne festen Port.
  Neue Fälle, deren Namen die Punkte prüfen: in `test/digistore-ipn.test.ts` „holds a payment while the card breaker is on and
  credits nothing“, „holds a payment of a wallet that had a refund and credits nothing“, „still credits a payment while the card
  breaker is off“, „a repeated ipn or a refund of a held order books nothing“ und „keeps every card order when an older database
  learns the status held“; in `test/card-breaker-ops.test.ts` „prints card_orders_held with the number of held orders“ und
  „never prints an address of a held order“; in der neuen Datei `test/watchdog-card-held.test.ts` (nach dem Muster von
  `test/watchdog-card-breaker.test.ts`, das Skript aus `WATCHDOG_UNDER_TEST`, sonst `ops/watchdog.sh`) „posts one warning when an
  order is held“, „posts nothing more while the number of held orders stays“, „posts again when another order is held“, „keeps the
  count and posts again on the next run when the post failed“ und „posts nothing when ops/card-breaker.sh --held cannot be read“; in
  `test/card-way-pages.test.ts` „shows no video with the card on it while the breaker is on“ (auf `/` und jeder Fehlerseite).
  Testadressen sind nur Wiederholungen eines Hex-Paars (`0x` plus 20 Mal `ab`) oder je Lauf erzeugt wie in
  `test/digistore-ipn.test.ts`. Jeder neue Fall war einmal rot, die Zeile im Progress Log sagt, womit.
- **Was mitzieht.** Der gestellte `docker` in `test/watchdog-card-breaker.test.ts` und den anderen Tests des Watchdogs antwortet auf
  jeden Aufruf mit sechs oder mehr Argumenten mit der Zeile des Notschalters; `check_card_held` liest das als nicht lesbar und postet
  nichts, so bleiben diese Tests unverändert grün. Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `digistore`,
  `card-breaker`, `watchdog`, `card-way`, `index.html`, `error-pages` oder `db.ts` nennen
  (`grep -l -E 'digistore|card-breaker|watchdog|card-way|index\.html|error-pages|db\.ts' goals/*/[0-9]*.md`), einmal am Kopf von
  `dev` fahren und nach dem Bau erneut. Wird einer durch dieses Goal rot, ohne dass sein Zweck verletzt ist, fragt der Maker den
  Tech Lead auf dem Topic mit Befehl und beiden Ausgaben; der entscheidet mit einer Zeile `Abgelöst:` im `ANNAHMEN.md` des alten
  Goals. Kein Prüfbefehl eines fertigen Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Kauf, kein Aufruf von Digistore24 oder der EZB, kein POST an `/pay/digistore` der
  Produktion, kein Wert in `/opt/control-plane/.env`, keine Änderung an der crontab, kein Rollout und kein Neustart durch einen Agent.
  Code, Bezeichner, Testnamen, Log-Zeilen und Meldungen englisch.

## Done Condition
- [x] Die IPN schreibt bei Notschalter an und für eine Wallet mit früherer Erstattung nichts gut, speichert die Bestellung auf
      `held`, schreibt eine Log-Zeile mit Bestellnummer und Grund ohne Adresse, fragt die EZB nicht und antwortet `200` mit `OK`; eine
      Wiederholung und eine Erstattung dieser Bestellung buchen nichts, und bei Notschalter aus wird wie bisher gutgeschrieben.
      MVP: Funktion, weil sonst jeder mit einer neuen Wallet die direkt aufgerufene Kasse nutzt und der Fehlbetrag über 50 USD wächst.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/digistore-ipn.test.ts test/card-redirect.test.ts test/card-way.test.ts test/card-orders.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "holds a payment while the card breaker is on and credits nothing" "holds a payment of a wallet that had a refund and credits nothing" "still credits a payment while the card breaker is off" "a repeated ipn or a refund of a held order books nothing"; do grep -qF "\"$t\"" test/digistore-ipn.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { openDb, getBalanceMc } = await import("./src/db.ts"); const { handleDigistoreIpn, signFields, CARD_PACKAGES } = await import("./src/payments/digistore.ts"); const { CARD_BREAKER_SHORTFALL_MC: S } = await import("./src/payments/card-way.ts"); const P = "test-passphrase-0123456789"; const NOW = new Date("2026-11-24T12:00:00.000Z"); const xml = "<Cube time=\"2026-11-20\"><Cube currency=\"USD\" rate=\"1.0512\"/></Cube>"; const logs = []; let calls = 0; const deps = { passphrase: P, fetch: async () => { calls++; return new Response(xml, { status: 200 }); }, now: () => NOW, log: (l) => logs.push(l) }; const t = NOW.toISOString(); const a = (h) => "0x" + h.repeat(20); const rev = (db, id, addr, mc) => db.prepare("INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)").run(id, CARD_PACKAGES[0].productId, addr, "live", "reversed", mc, mc, t, t); const ipn = (db, id, addr, ev = "on_payment") => { const f = { event: ev, api_mode: "live", order_id: id, order_date: "2026-11-20", product_id: CARD_PACKAGES[0].productId, currency: "EUR", amount_vendor: "2.80", custom: addr }; return handleDigistoreIpn(db, deps, { ...f, sha_sign: signFields(f, P) }); }; const st = (db, id) => db.prepare("SELECT status FROM card_orders WHERE order_id = ?").get(id)?.status; const bad = []; const on = openDb(":memory:"); rev(on, "TRIP", a("ab"), S); let r = await ipn(on, "H1", a("cd")); if (r.status !== 200 || r.body !== "OK") bad.push("an antwort"); if (st(on, "H1") !== "held") bad.push("an status " + st(on, "H1")); if (getBalanceMc(on, a("cd")) !== 0) bad.push("an gutgeschrieben"); r = await ipn(on, "H1", a("cd")); if (st(on, "H1") !== "held" || getBalanceMc(on, a("cd")) !== 0) bad.push("an wiederholt"); await ipn(on, "H1", a("cd"), "on_refund"); if (st(on, "H1") !== "held" || on.prepare("SELECT COUNT(*) AS n FROM ledger").get().n !== 0) bad.push("an erstattet"); const w = openDb(":memory:"); rev(w, "OLD", a("ef"), 0); await ipn(w, "H2", a("ef")); if (st(w, "H2") !== "held" || getBalanceMc(w, a("ef")) !== 0) bad.push("wallet " + st(w, "H2")); if (calls !== 0) bad.push("ezb gefragt " + calls); const off = openDb(":memory:"); await ipn(off, "B1", a("12")); if (st(off, "B1") !== "booked" || getBalanceMc(off, a("12")) <= 0) bad.push("aus " + st(off, "B1")); const held = logs.filter((l) => / held: /.test(l)); if (!held.some((l) => l.includes("order H1 held: card breaker on"))) bad.push("log an"); if (!held.some((l) => l.includes("order H2 held: wallet had a refund"))) bad.push("log wallet"); if (logs.some((l) => /0x[0-9a-fA-F]{40}/.test(l))) bad.push("adresse im log"); console.log(bad.length ? bad.join("; ") : "held ok")' 2>&1 | tail -1` muss genau `held ok` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/on: shortfallMc >= CARD_BREAKER_SHORTFALL_MC/on: false/' $T/src/payments/card-way.ts; grep -q 'on: false' $T/src/payments/card-way.ts || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/digistore-ipn.test.ts -t "holds a payment while the card breaker is on and credits nothing" > /dev/null 2>&1); echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/^  return row !== undefined;$/  return false;/' $T/src/payments/card-way.ts; grep -q '^  return false;$' $T/src/payments/card-way.ts || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/digistore-ipn.test.ts -t "holds a payment of a wallet that had a refund and credits nothing" > /dev/null 2>&1); echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- src/payments/card-way.ts | grep -E '^[-+]' | grep -vE '^(\+\+\+|---) ' | grep -c '^-'` muss 0 ausgeben.
- [x] Eine Datenbank, deren `card_orders` `held` noch nicht kennt, lernt den Status beim Öffnen, ohne eine Zeile zu verlieren.
      MVP: Funktion, weil die Produktion Zeilen in `card_orders` hat und die erste gehaltene Bestellung sonst am CHECK scheitert.
      Prüfung: `for t in "keeps every card order when an older database learns the status held"; do grep -qF "\"$t\"" test/digistore-ipn.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH T=$T node --import tsx --input-type=module -e 'const Database = (await import("better-sqlite3")).default; const { openDb } = await import("./src/db.ts"); const f = process.env.T + "/cp.db"; const q = (l) => l.map((s) => String.fromCharCode(39) + s + String.fromCharCode(39)).join(", "); const old = new Database(f); old.exec("CREATE TABLE card_orders (order_id TEXT PRIMARY KEY, product_id TEXT NOT NULL, address TEXT, mode TEXT NOT NULL CHECK (mode IN (" + q(["live", "test"]) + ")), status TEXT NOT NULL CHECK (status IN (" + q(["booked", "test", "unassigned", "pending_rate", "reversed"]) + ")), vendor_eur_cents INTEGER, rate_e4 INTEGER, rate_date TEXT, credited_mc INTEGER NOT NULL DEFAULT 0, reversed_mc INTEGER NOT NULL DEFAULT 0, shortfall_mc INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"); old.prepare("INSERT INTO card_orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("KEEP", "771278", "0x" + "ab".repeat(20), "live", "booked", 280, 10512, "2026-11-20", 306400, 0, 0, "2026-11-20T10:00:00.000Z", "2026-11-20T10:00:00.000Z"); old.close(); const bad = []; const ins = (db, id, s) => db.prepare("INSERT INTO card_orders (order_id, product_id, address, mode, status, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?)").run(id, "771278", "live", s, "x", "x"); let db = openDb(f); const k = db.prepare("SELECT * FROM card_orders WHERE order_id = ?").get("KEEP"); if (!k || k.status !== "booked" || k.credited_mc !== 306400 || k.rate_e4 !== 10512) bad.push("zeile weg"); try { ins(db, "H", "held"); } catch { bad.push("held abgelehnt"); } try { ins(db, "X", "bogus"); bad.push("bogus angenommen"); } catch {} db.close(); db = openDb(f); const n = db.prepare("SELECT COUNT(*) AS n FROM card_orders").get().n; if (!bad.includes("held abgelehnt") && n !== 2) bad.push("zweites oeffnen " + n); db.close(); console.log(bad.length ? bad.join("; ") : "migration ok")' 2>&1 | tail -1; rm -rf $T` muss genau `migration ok` ausgeben.
- [x] `ops/card-breaker.sh --held` gibt die Zahl der gehaltenen Bestellungen als genau eine Zeile aus, die Regel steht nur in
      `heldCardOrders` in `src/payments/card-way.ts`, und ohne `--held` bleibt das Werkzeug, wie es ist.
      MVP: Funktion, weil die Leitzahl dieses Goals ohne das Werkzeug nicht messbar ist.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-breaker-ops.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "prints card_orders_held with the number of held orders" "never prints an address of a held order" "prints card_refunds_60d, shortfall_usd and breaker off below the limit"; do grep -qF "\"$t\"" test/card-breaker-ops.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c '^export function heldCardOrders(db: Db): number' src/payments/card-way.ts` muss genau 1 ausgeben.
      Prüfung: `grep -c 'heldCardOrders' ops/card-breaker.sh` muss mindestens 1 ausgeben.
      Prüfung: `cat ops/card-breaker.sh ops/watchdog.sh | grep -c "'held'"` muss 0 ausgeben.
      Prüfung: `grep -cE '\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b|shortfall_mc' ops/card-breaker.sh` muss 0 ausgeben.
      Prüfung: `bash -n ops/card-breaker.sh && echo syntax ok` muss genau `syntax ok` ausgeben.
- [x] `ops/watchdog.sh` meldet jede neue gehaltene Bestellung genau einmal über den bestehenden Alarmweg, ein gescheiterter POST
      kommt im nächsten Lauf wieder, und crontab, `deploy/` und `/opt/control-plane/.env` bleiben, wie sie sind.
      MVP: Funktion, weil eine gehaltene Bestellung eine echte Zahlung ohne Guthaben ist und jemand davon wissen muss, bevor der
      Käufer nachfragt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-card-held.test.ts test/watchdog-card-breaker.test.ts test/watchdog-credit.test.ts test/watchdog-webhook-fail.test.ts test/watchdog-alive.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "posts one warning when an order is held" "posts nothing more while the number of held orders stays" "posts again when another order is held" "keeps the count and posts again on the next run when the post failed" "posts nothing when ops/card-breaker.sh --held cannot be read"; do grep -qF "\"$t\"" test/watchdog-card-held.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c '^check_card_held$' ops/watchdog.sh` muss genau 1 ausgeben.
      Prüfung: `grep -c '^check_card_held() {$' ops/watchdog.sh` muss genau 1 ausgeben.
      Prüfung: `d=$(mktemp -d); sed '/^check_card_held$/d' ops/watchdog.sh > $d/watchdog.sh; cp ops/card-breaker.sh ops/credit-runway.sh $d/; grep -q '^check_card_held$' $d/watchdog.sh && echo sed-miss; WATCHDOG_UNDER_TEST=$d/watchdog.sh PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-card-held.test.ts -t "posts one warning when an order is held" > /dev/null 2>&1; echo "exit=$?"; rm -rf $d` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `d=$(mktemp -d); cp ops/watchdog.sh ops/card-breaker.sh ops/credit-runway.sh $d/; WATCHDOG_UNDER_TEST=$d/watchdog.sh PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-card-held.test.ts -t "posts one warning when an order is held" > /dev/null 2>&1; echo "exit=$?"; rm -rf $d` muss genau `exit=0` ausgeben (Gegenprobe zur Zeile davor: die Kopie allein macht den Test nicht rot).
      Prüfung: `bash -n ops/watchdog.sh && echo syntax ok` muss genau `syntax ok` ausgeben.
      Prüfung: `grep -c 'card_orders_held' ops/README.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cF '*/5 * * * * CP_ALERT_WEBHOOK=https://ntfy.sh/<random-topic> /opt/control-plane/repo/ops/watchdog.sh >> /var/log/cp-watchdog.log 2>&1' ops/README.md` muss genau 1 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- deploy .github | wc -l` muss 0 ausgeben.
- [x] Bei Notschalter an steht auf `/` und auf jeder Fehlerseite kein Block `video`; bei Notschalter aus stehen die Seiten bis auf
      Leerraum, wie sie sind, und Skript, Video und SOLL-Bilder bleiben unverändert.
      MVP: Funktion, weil das Video sonst bei geschlossener Kasse mit seiner Schlusstafel einen Weg zeigt, der nicht geht.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const { CARD_BREAKER_SHORTFALL_MC: S } = await import("./src/payments/card-way.ts"); const { ERROR_PAGES } = await import("./src/public/error-pages.ts"); const app = (on) => { const db = openDb(":memory:"); if (on) { const t = new Date().toISOString(); db.prepare("INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)").run("TRIP", "771278", "0x" + "ef".repeat(20), "live", "reversed", S, S, t, t); } return createApp({ db }); }; const n = (s, w) => s.split(w).length - 1; const bad = []; const paths = ["/", ...ERROR_PAGES.map((p) => "/errors/" + p.slug)]; for (const on of [true, false]) { const a = app(on); for (const p of paths) { const h = await (await a.request(p)).text(); const v = n(h, "data-soll=\"video\""); if (v !== (on ? 0 : 1)) bad.push((on ? "an " : "aus ") + p + " " + v); if (n(h, "move.mp4") !== (on ? 0 : 1)) bad.push((on ? "an " : "aus ") + p + " mp4"); } } console.log(bad.length ? bad.join("; ") : "video ok " + paths.length)' 2>&1 | tail -1` muss genau `video ok 4` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; P='const { createApp } = await import(process.cwd() + "/src/app.ts"); const { openDb } = await import(process.cwd() + "/src/db.ts"); const { ERROR_PAGES } = await import(process.cwd() + "/src/public/error-pages.ts"); const { createHash } = await import("node:crypto"); const a = createApp({ db: openDb(":memory:") }); let s = ""; for (const p of ["/", ...ERROR_PAGES.map((e) => "/errors/" + e.slug)]) s += (await (await a.request(p)).text()).replace(/\s+/g, ""); console.log(createHash("sha256").update(s).digest("hex"))'; x=$(CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e "$P" 2>&1 | tail -1); y=$(cd $T && CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e "$P" 2>&1 | tail -1); rm -rf $T; [ ${#x} -eq 64 ] && [ "$x" = "$y" ] && echo "aus gleich" || echo "aus anders"` muss genau `aus gleich` ausgeben.
      Prüfung: `for t in "shows no video with the card on it while the breaker is on"; do grep -qF "\"$t\"" test/card-way-pages.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-pages.test.ts test/werbung.test.ts test/card-checkout.test.ts test/video.test.ts test/error-pages.test.ts test/video-assess.test.ts test/video-render.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git diff --numstat $(git merge-base origin/dev HEAD) HEAD -- src/public/index.html | tr '\t' ' '` muss genau `1 1 src/public/index.html` ausgeben.
      Prüfung: `grep -B1 -F '<section class="watch" data-soll="video">' src/public/index.html | head -1` muss genau `<!--CARD-->` ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- docs/video docs/soll src/public/video README.md | wc -l` muss 0 ausgeben.
- [x] Die Entscheidungen stehen in `goals/wache/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg, und
      nichts im Repo nennt eine Adresse eines Kunden.
      MVP: Funktion, weil jedes spätere Glied der Karte wissen muss, warum eine bezahlte Bestellung auf `held` steht und wer davon erfährt.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, wache 03: ' goals/wache/ANNAHMEN.md` muss mindestens 5 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/payments/digistore\.ts|src/payments/card-way\.ts|src/db\.ts|src/public/index\.html|src/public/error-pages\.ts|ops/card-breaker\.sh|ops/watchdog\.sh|ops/README\.md|test/[a-z0-9-]+\.test\.ts|goals/wache/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- . ':!goals' | grep '^+' | grep -oE '0x[0-9a-fA-F]{40}' | sort -u | awk '{s=substr($0,3,2); r=""; for(i=0;i<20;i++) r=r s; if (substr($0,3)!=r) n++} END{print n+0}'` muss 0 ausgeben.
- [x] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil sich die IPN und das Schema im Laufzeitpfad ändern und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/wache-03 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer bei geschlossener Kasse oder mit einer Wallet nach Erstattung doch bei Digistore24 zahlt, bekommt kein Guthaben, und die
      Bestellung steht als gehalten im Dienst.
- [ ] Jede neue gehaltene Bestellung erreicht den Alarmweg genau einmal.
- [ ] Bei geschlossener Kasse verspricht keine Seite mehr per Video die Zahlung per Karte.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse eines Kunden, kein Satz zu PostYourPrice, kein Satz zu den Bedingungen des Einkaufs bei
      OpenRouter.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/payments/card-way.ts`: nur `heldCardOrders` kommt dazu, keine bestehende Zeile ändert sich (Punkt 1); `cardBreaker`,
  `walletRefunded`, `checkoutUrl`, `cardLink` und `stripCardWay` bleiben
- `src/payments/digistore.ts`: nur der Halt der Zahlung aus Entscheidung 1; Signatur, Kurs, Buchung, `reverse` und `CARD_PACKAGES`
  bleiben
- `src/db.ts`: nur das CHECK von `card_orders` und sein einmaliger Neubau (Entscheidung 2)
- `src/public/index.html`: nur die eine Zeile `<!--CARD-->` wandert (Entscheidung 4); `src/public/error-pages.ts`: nur die Bedingung
  um den Block `video`
- `ops/card-breaker.sh`: nur `--held`; die Zeile ohne `--held` bleibt Byte für Byte. `ops/watchdog.sh`: nur `check_card_held` und
  sein Aufruf. `ops/README.md`: nur die Beschreibung von `--held` und der Meldung
- `ops/card-orders.sh`, `ops/status.sh`, `ops/digistore.mjs`, `ops/digistore-release.mjs`, `ops/video-*.mjs`, `ops/video-record.sh`,
  `docs/video/**`, `src/public/video/**`, `docs/soll/**`, `README.md`, `src/app.ts`, `src/inference/**`, `src/auth/**`,
  `src/konto/**`, `src/checkout/**`, `mcp/**`: unverändert
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`,
  die der Tech Lead entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- das Konto von Digistore24 (Produkte, Rückgaberegeln, IPN-Verbindungen, Bestellformulare) und seine API: dieses Goal ruft Digistore24
  nicht auf und erstattet nichts
- ein Kauf, ein POST an `/pay/digistore` der Produktion, jeder Wert in `/opt/control-plane/.env`, die crontab des Servers, ein Rollout
  oder Neustart durch einen Agent, Wallet-Bewegung, Topup, Gutschrift von Hand (`loop-constraints.md`, Grundregeln 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-24 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7, 8 gebaut (IPN hält Zahlungen bei Notschalter an und nach Erstattung auf `held`, CHECK von `card_orders` mit einmaligem Neubau, `heldCardOrders` und `ops/card-breaker.sh --held`, `check_card_held` im Watchdog, Video nur bei offener Kasse, sieben Annahmen); jeder neue Fall war rot (IPN- und Migrationsfälle gegen `src/` von `dev`, `--held`-Fälle gegen `ops/card-breaker.sh` von `dev`, alle fünf Watchdog-Fälle gegen `ops/watchdog.sh` von `dev` über `WATCHDOG_UNDER_TEST`, der Videofall gegen `index.html` und `error-pages.ts` von `dev`, „still credits a payment while the card breaker is off“ gegen eine IPN, die jede Zahlung hält); die Prüfbefehle der 53 fertigen Goals, die die berührten Dateien nennen, geben an `dev` und am Kopf dasselbe aus, bis auf Umfangszähler gegen `origin/dev`. Prüfbefehle: Punkt 1 vitest 46 grün, Namen vollständig, `held ok`, beide Gegenproben `exit=1` ohne `sed-miss`, Minuszeilen in `card-way.ts` 0; Punkt 2 Name vorhanden, `migration ok`; Punkt 3 vitest 9 grün, Namen vollständig, `heldCardOrders` 1, im Werkzeug 4, `'held'` 0, Schreibwörter 0, `syntax ok`; Punkt 4 vitest 23 grün, Namen vollständig, Aufruf 1, Funktion 1, Gegenprobe `exit=1` ohne `sed-miss`, Kopie `exit=0`, `syntax ok`, README 1 und 1, `deploy`/`.github` 0; Punkt 5 `video ok 4`, `aus gleich` (gepflanzte Änderung gibt `aus anders`), Name vorhanden, vitest 76 grün, `1 1 src/public/index.html`, `<!--CARD-->`, Video/SOLL/README 0; Punkt 6 Annahmen 7, fremde Pfade 0, gelöschte Tests 0, Adressen 0; Punkt 7 `e2e` an PR #426 grün am Kopf b9d8289 (11 min, Prüfbefehl gibt 1); Punkt 8 `check` grün in 172 s (2833 Tests).
- 2026-11-24 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8 (`dev` ef2f48b liegt schon im Branch, kein Merge nötig). Prüfbefehle am Kopf b68ffb3: Punkt 1 vitest grün, Namen vollständig, `held ok`, beide Gegenproben `exit=1` ohne `sed-miss`, Minuszeilen 0; Punkt 2 Name vorhanden, `migration ok`; Punkt 3 vitest grün, Namen vollständig, 1, 4, 0, 0, `syntax ok`; Punkt 4 vitest grün, Namen vollständig, 1, 1, Gegenprobe `exit=1`, Kopie `exit=0`, `syntax ok`, 1, 1, 0; Punkt 5 `video ok 4`, `aus gleich`, Name vorhanden, vitest grün, `1 1 src/public/index.html`, `<!--CARD-->`, 0; Punkt 6 Annahmen 7, 0, 0, 0; Punkt 7 `e2e` pass (10m57s) an PR #426 am Kopf b68ffb3, Prüfbefehl gibt 1; Punkt 8 `check` grün in 176 s.

## Blockers
keine
