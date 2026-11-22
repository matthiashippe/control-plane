# Karte Goal 02: Der Weg zur Kasse

## Status
ACTIVE

## Active Objective
Seit karte 01 nimmt der Dienst Kartengeld von Digistore24 an, aber kein Betreiber kommt zur Kasse: Kunde 1 und der Automaton vom
21.11.2026 hörten nach leerem Saldo auf, und weder Startseite noch README, Plugin oder die 402 nennen einen Weg ohne USDC. Die drei
Produkte im Konto verkaufen außerdem noch nicht, weil IPN-Verbindung, Kennwort in der Produktion, Rückgabe von 30 Tagen, Testkauf und
Freigabe fehlen (`goals/_vorschlaege/karte-kritik-2026-11-22-1.md`). Nach diesem Goal ist die Kasse scharf und eingereicht, und der
Weg dorthin steht überall, wo ein Betreiber nach Guthaben sucht: Die Startseite zeigt direkt nach dem Umzugsblock einen Block `card`
mit einem Feld für die Adresse des Automatons und drei Knöpfen (5, 20 und 50 EUR, je mit dem Guthaben, das das Paket ergibt), die das
Formular ohne Skript direkt an `https://www.checkout-ds24.com/product/<id>/?custom=<adresse>` schicken; das README zeigt dieselben drei
Wege direkt unter der Zeile `conwayApiUrl`; das Plugin hat ein Tool `card_top_up`, das die drei Links für eine Adresse ausgibt; die 402
bei leerem Saldo nennt den Link als `card_url`. Gebaut wird 1:1 nach den neuen SOLL-Bildern der Startseite (390 und 1440 px), die der
Design Reviewer vor dem Bau abnimmt.
Leitzahl: fremde Käufe per Karte je Woche (`ops/card-orders.sh`, Feld `live`) und Sichtungen des Blocks `card` (`/px/card.png`, gezählt
in karte 03).
Widerlegt, wenn in den sieben Tagen nach dem Rollout kein fremder Leser den Block `card` sieht; dann sitzt der Block an der falschen
Stelle, und karte 03 misst das, bevor die Seite weiter wächst.
MVP: Funktion, weil Kunde 1 und der Automaton vom 21.11.2026 nach leerem Saldo aufhörten und ihr Betreiber heute keinen Weg zur Karte
sieht. Übernimmt goals/_vorschlaege/karte-kritik-2026-11-22-1.md.

## Voraussetzungen
- karte Goal 01 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Betreiber, dessen Automaton mit leerem Saldo eine 402 bekommt oder der auf der Startseite landet, kauft ohne
  Wallet in zwei Klicks Guthaben für genau diesen Automaton und weiß vor dem Kauf, wie viel Guthaben er bekommt.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: karte 03 misst sieben Tage nach dem Rollout Sichtungen, Käufe je
  Paket und die Inferenz aus Kartenguthaben. Ohne die Schritte in die Produktion (Punkte 1 und 2) führt jeder Knopf in eine Kasse, die
  nicht verkauft.
- Quelle: `ROADMAP.md`, Topic `karte`, Glied 02; Grundsatz in `docs/kette.md`, Abschnitt „karte: Guthaben per Karte über Digistore24“
  (bindend: dasselbe Verkäuferkonto wie Personalplaner24, Bautagebuch24 und Aszendent24, nur die eigenen drei Produkte 771278, 771279
  und 771280 ändern; Preise fest; Guthaben unauszahlbar; Seite, Plugin und Kasse nennen vor dem Kauf das Guthaben; die Adresse reist
  nur in `custom` und in der IPN; kein Text nach außen nennt PostYourPrice). Vorlagen, nur lesen: `~/work/aszendent24/loop-constraints.md`,
  Abschnitt „Digistore24: was bei Personalplaner24 Zeit gekostet hat“ (Knöpfe direkt auf die Kasse, Garantie passend zur Rückgabe,
  `ipnSetup` erst nach GET 200, Freigabe erst nach Testkauf, je Stand genau ein Einreichen), `~/brain/connectors/digistore24.md`.
- **Bestand und Entscheidungen des Tech Lead (22.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile
  `- 2026-11-22, karte 02: …` in `goals/karte/ANNAHMEN.md`.
  1. **Kein Skript, ein Formular direkt zur Kasse.** Die CSP in `deploy/Caddyfile` erlaubt genau ein Inline-Skript per Hash, und das
     Skript der Startseite bleibt Byte für Byte (`test/without-script.test.ts`, `statusScript` in `src/app.ts`). Deshalb ist der Block
     ein `<form method="get">` mit einem Feld `name="custom"` (`pattern="0x[0-9a-fA-F]{40}"`, `required`, `autocomplete="off"`,
     `spellcheck="false"`) und drei Knöpfen `<button type="submit" formaction="https://www.checkout-ds24.com/product/<id>/">` in der
     Reihenfolge von `CARD_PACKAGES`. Der Browser schickt die Adresse als `?custom=` an Digistore24, sie kommt nie in unser
     Zugriffslog, und der Prüfer von Digistore24 sieht Knöpfe, die direkt auf die Kasse zeigen. Dafür bekommt `form-action` in der CSP
     von `deploy/Caddyfile` den Host der Kasse dazu (`loop-constraints.md`: den Caddyfile ändert der Loop selbst): zuerst mit
     `curl -sI` (Netz, Digistore24 ist nicht unsere Produktion) die Kette der Weiterleitungen von
     `https://www.checkout-ds24.com/product/771278/` lesen und jeden Host dieser Kette in `form-action` aufnehmen, weil Browser
     `form-action` auch auf Weiterleitungen anwenden. Sonst ändert sich am Caddyfile nichts, auch nicht der Hash.
  2. **Der Block steht direkt nach `#move`, nicht darin.** `ops/soll.mjs` führt es als Mangel, wenn der Umzugsblock unter dem ersten
     Bildschirm endet, und drei Pakete mit Feld passen nicht zusätzlich hinein. Deshalb bleibt `#move`, wie es ist, bis auf einen Link
     `href="#card"` direkt unter dem Code mit `conwayApiUrl` (etwa am Ende der Zeile `.fine`: „No USDC? Pay by card.“), und die nächste
     Section nach `#move` ist `<section id="card" data-soll="card">`, vor `<!--HUMAN-->`. Bei 390 px endet `#move` heute bei 828 von
     844 px (`node ops/soll.mjs --check`, Zeile `move top`), also darf der Link keine Zeile kosten: Er ersetzt einen Teil der Zeile
     `.fine` oder steht in einer Zeile, die schon da ist. Das Bild entscheidet über Aufbau und Gewicht,
     der Design Reviewer nimmt es ab. Der Block ist statisches HTML in `src/public/index.html`, englisch wie `#move`.
  3. **Texte (Klare Wörter, verkäuferisch).** Überschrift etwa „No USDC? Pay by card.“, Feld mit sichtbarem Label „Wallet address of
     your automaton“ und Platzhalter `0x…`, je Knopf zwei Zeilen genau `<n> EUR` und `about $<m> credit` (m aus `aboutCreditUsd`).
     Darunter eine Zeile im Stil `.fine`, die sagt, womit man zahlt, wer verkauft und dass es 30 Tage Geld zurück gibt, etwa „Card,
     PayPal or Apple Pay. Digistore24 sells this credit and charges you. 30 days money back.“ Kein Vorbehalt, kein Satz zur Technik.
  4. **Das Guthaben je Paket ist gemessen, nicht geschätzt** (`loop-constraints.md`, Grundregel 3). Nach den Testkäufen aus Punkt 2
     zeigt `ops/card-orders.sh --test-vendor` je Produkt den Verkäuferanteil der neuesten Testbestellung in EUR-Cent. Diese Zahlen
     stehen als `vendorEurCents` in `CARD_PACKAGES`, dazu `CARD_RATE_E4` (der niedrigste USD-Kurs der EZB in
     `eurofxref-hist-90d.xml` am Tag des Eintrags, mal 10000, Tag im Kommentar) und je Paket `aboutCreditUsd` gleich
     `Math.floor(vendorEurCents * CARD_RATE_E4 / 1_000_000)` als ganze Zahl im Code. Die Zahlen stehen als Literale da, weil karte 01
     in `src/payments/digistore.ts` weder `Number(`, `parseFloat` noch `toFixed` zulässt und genau drei Zeilen `productId:` erwartet;
     beides prüft das nächtliche Audit von karte 01 weiter. Ein Käufer aus einem Land mit höherer Umsatzsteuer bekommt etwas weniger,
     deshalb heißt es „about“. Gibt die Testbestellung keinen Verkäuferanteil (`vendor_eur_cents` leer oder 0), fragt der Maker den
     Tech Lead auf dem Topic, statt eine Zahl zu setzen.
  5. **`card_url` in der 402** (`src/inference/proxy.ts`, nur der Zweig mit Aufladung, nicht `topupsClosed`): `details.card_url` ist
     der Link der Kasse des Pakets zu 5 EUR mit `?custom=<adresse in Kleinbuchstaben>`, aus einer Funktion `cardCheckoutUrl(pkg,
     address)` in `src/payments/digistore.ts`, die auch Seite-Tests und Plugin nutzen. `message` bekommt vor „Nothing was charged for
     this call.“ genau den Satz `No USDC? Pay by card: <card_url> `. `error`, `details.required_cents`,
     `details.current_balance_cents`, `topup_url` und der Marker bleiben, wie sie sind (Upstream `src/conway/topup.ts:103`), `pnpm e2e`
     im PR bleibt grün. 5 EUR, weil `topup_url` auch die kleinste Stufe nennt und der Saldo leer ist.
  6. **Plugin.** Ein neues Tool `card_top_up` in `mcp/server.mjs` mit dem Argument `address` (Pflicht, `0x` plus 40 Hexziffern) gibt
     drei Zeilen aus, je Paket `<n> EUR, about $<m> credit: <link>`, und sagt in einem Satz, dass der Link im Browser die Kasse von
     Digistore24 öffnet. Eine falsche Adresse ergibt einen Fehler ohne Link. Das Tool `deposit` (MoonPay, ruht mit konto 15) bleibt
     unverändert, weil es Geld auf ein Konto bringt und nicht auf einen Automaton; ob es auf Digistore24 umzieht, ist ein Vorschlag.
     Die Zahl der Tools in Kommentar, `mcp/README.md` und Tests steigt um eins.
  7. **README.** Direkt unter dem Block mit `"conwayApiUrl": "https://automatonhost.com"` und vor „**Run an automaton from Claude
     Code**“ ein kurzer Absatz: ohne USDC per Karte, die drei Links
     `https://www.checkout-ds24.com/product/<id>/?custom=<your automaton's wallet address>` je mit `about $<m> credit`, und
     `https://automatonhost.com/#card` für das Formular.
  8. **Leitzahl.** Ein Klick auf einen Knopf verlässt die Seite ohne Spur bei uns, weil kein Skript läuft. Gezählt werden deshalb
     Sichtungen: eine Zählmarke `card` in der Liste der Marken in `src/app.ts` und `<img src="/px/card.png" …>` im Block wie die
     anderen Marken (lazy, `class="px"`); `ops/soll-live.mjs` nimmt Marken schon heraus. Käufe zählt `ops/card-orders.sh`.
  9. **`unassigned`** (offen aus karte 01): Seite, README, Plugin und 402 erzeugen nur Links mit gültiger Adresse, also entsteht
     `unassigned` nur aus einem von Hand geänderten Link. Es bleibt gezählt und bucht nie; ein Käufer bekommt sein Geld über die
     Rückgabe von Digistore24. Kein Raten einer Adresse.
- **Zuerst die Kasse scharf (Punkte 1 und 2), dann das Bild, dann der Bau.** Reihenfolge im Lauf:
  1. `ops/digistore-release.mjs` (neu, Node ESM ohne neues Paket, nach dem Muster von `ops/digistore.mjs`, dessen Datei unverändert
     bleibt, weil karte 01 ihre Sperren prüft; gemeinsame Teile darf das neue Werkzeug aus ihr importieren, wenn sie dort schon
     exportiert sind): `--passphrase` legt `~/.config/control-plane/digistore-ipn.txt` mit `umask 077` an, wenn sie fehlt (32
     Hexzeichen aus `crypto.randomBytes(16)`), und gibt nur `passphrase file ready` aus. `--ipn` legt per `ipnSetup` der klassischen
     API genau eine Verbindung `automaton-credit` an: `ipn_url` `https://automatonhost.com/pay/digistore`, `product_ids`
     `771278,771279,771280`, `transactions` `payment,refund,chargeback`, Zeitpunkt vor der Dankeseite, `sha_passphrase` aus der Datei;
     gibt es die Verbindung schon, ändert es nichts. `--submit` setzt je eigenem Produkt `approval_status` auf `pending`, nur wenn
     `--report` für dieses Produkt keinen Mangel und als Freigabe weder `pending` noch `approved` meldet, also je Stand höchstens ein
     Einreichen. `--report` liest nur und gibt aus: `ipn automaton-credit: url <url>, products <ids>, events <ereignisse>,
     <before|after> thankyou` (oder `ipn automaton-credit: missing`), je Produkt `approval <id>: <status>`, zuletzt
     `release report: <n> defects`. `--selftest` ohne Netz mit festen Antworten. Jede ID außerhalb von `CARD_PACKAGES` bricht vor dem
     Schreiben ab, jedes andere Argument endet mit Exit 1 vor dem ersten Aufruf ins Netz. Schlüssel und Kennwort erscheinen nie in
     einer Ausgabe. Gibt die API einen Testkauf her (OpenAPI-Index `https://www.digistore24.com/api/docs/openapi.yaml`), macht ihn das
     Werkzeug mit `--testorder` selbst, und Schritt 3 im Gate entfällt.
  2. `node ops/digistore-release.mjs --passphrase` und `--ipn`, dann `--report`. Lehnt `ipnSetup` die Adresse ab, weil die
     Verbindungsprobe ohne Kennwort mit 503 endet, kommt `--ipn` nach Schritt 1 des Gates, und der Testkauf wird ein zweites Gate.
  3. **Human Gate.** `## Status` auf `BLOCKED matthias`, unter `## Blockers` genau diese Zeilen (Empfehlung mit den fertigen Befehlen
     und Links), Commit, Push:
     `Art: matthias`
     `Aufgabe: Kennwort der Kartenzahlung in die Produktion legen und ausrollen, Rückgabe der drei Guthaben-Produkte auf 30 Tage stellen, je Produkt einen Testkauf mit Testpay machen.`
     `Worum: Ohne Kennwort bucht der Dienst keinen Kartenkauf, und Digistore24 gibt die Produkte erst nach Testkauf und mit 30 Tagen Rückgabe frei.`
     `Empfehlung: 1. Terminal auf dem code-host: set -a; . ~/.config/control-plane/loop.env; set +a; P=$(cat ~/.config/control-plane/digistore-ipn.txt); ssh -i "$CP_SSH_KEY" "$CP_HOST" "grep -q '^CP_DIGISTORE_IPN_PASSPHRASE=' /opt/control-plane/.env || echo 'CP_DIGISTORE_IPN_PASSPHRASE=$P' >> /opt/control-plane/.env" && gh workflow run deploy.yml -R matthiashippe/control-plane --ref dev -f force=true. 2. Backoffice von Digistore24, Produkte 771278, 771279 und 771280: Rückgaberecht 30 Tage, speichern. 3. Je Produkt im selben Chrome wie das Backoffice die Kasse mit Testpay: <die drei Links mit custom gleich einer Adresse aus 0x und 40 Nullen, die letzte 1>.`
     Der Tech Lead prüft das Gate und schreibt die Schritte für Matthias; das Goal läuft weiter, wenn sein Ergebnis da ist.
  4. Nach dem Gate: Punkt 2 prüfen, die Zahlen aus `ops/card-orders.sh --test-vendor` und den EZB-Kurs in `CARD_PACKAGES` eintragen
     (Punkt 3), dann SOLL, Abnahme, Bau, und als letzten Schritt vor dem Abschluss `node ops/digistore-release.mjs --submit` (Punkt 10).
- **SOLL zuerst (Punkte 4 und 5).** `docs/soll/src/startseite.html` bekommt den Link in `#move` und den Block `card`, gebaut aus den
  Klassen von `src/public/index.html` (die Karten der Pakete etwa wie `grid-cards three` mit `card pick`, `card-head`, `price`,
  `price-note`), höchstens drei neue Klassen (das Feld braucht eine), jede mit Grund als `` `.<klasse>` `` unter einem neuen Abschnitt
  `## Karte #card (goals/karte/02)` in `docs/soll/README.md`. `node ops/soll.mjs` schreibt `startseite-390.png` und
  `startseite-1440.png` neu. Die Werte im Bild sind die aus `CARD_PACKAGES` (Punkt 3), das Feld ist leer. Sind Quelle und Bilder
  committet und gepusht, setzt der Maker in `docs/soll/README.md` die Zeile `Abnahme-Issue card: PRO-<n>` mit dem Topic dieses Goals
  und erwähnt dort den Design Reviewer mit beiden Bildpfaden und dem Commit. Bis „SOLL abgenommen“ dasteht, ändert der Maker
  `src/public/index.html` nicht. Ändern sich Bilder nach der Abnahme, braucht es eine neue. Auf dem code-host rendern die
  SOLL-Werkzeuge mit `FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf`.
- **Tests.** `test/card-checkout.test.ts` gegen `createApp` (leere Datenbank, `CP_PUBLIC_URL=https://automatonhost.com`, kein Port)
  und den Inferenz-Weg der bestehenden 402-Tests, `test/mcp-card.test.ts` gegen `mcp/server.mjs` wie `test/mcp-money.test.ts`, neue
  Fälle in `test/card-orders.test.ts` für `--test-vendor`; die Namen prüfen die Punkte. Jeder neue Fall war einmal rot, die Zeile im
  Progress Log sagt, womit.
- Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `startseite`, `index.html`, `Caddyfile`, `card-orders`, `digistore`,
  `topup_url` oder `mcp/server` nennen (`grep -l -E 'startseite|index\.html|Caddyfile|card-orders|digistore|topup_url|mcp/server'
  goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem Bau erneut. Wird einer durch dieses Goal rot, ohne dass sein Zweck
  verletzt ist, fragt der Maker den Tech Lead auf dem Topic mit Befehl und beiden Ausgaben; der entscheidet mit einer Zeile
  `Abgelöst:` im `ANNAHMEN.md` des alten Goals. Kein Prüfbefehl eines fertigen Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Test geht ins Netz oder bindet einen festen Port. Kein Kauf außer dem Testkauf mit
  Testpay, kein POST an `/pay/digistore` der Produktion, kein Wert in `/opt/control-plane/.env`, kein Rollout und kein Neustart durch
  einen Agent. Code, Bezeichner, Testnamen, Ausgaben und alle Texte auf Seite, README und Plugin englisch.

## Done Condition
- [x] Das Kennwort liegt nur auf dem code-host, die IPN-Verbindung `automaton-credit` zeigt mit Zahlung, Rückerstattung und
      Rückbuchung vor der Dankeseite auf `https://automatonhost.com/pay/digistore`, und das Werkzeug schreibt nur an die eigenen drei
      Produkte und reicht je Stand höchstens einmal ein.
      MVP: Funktion, weil ohne diese Verbindung kein Kartenkauf beim Dienst ankommt.
      Prüfung: `PATH=/usr/bin:$PATH node ops/digistore-release.mjs --selftest 2>&1 | tail -1` muss genau `SELFTEST OK` ausgeben.
      Prüfung: `for s in --passphrase --ipn --submit --report --selftest; do grep -q -- "'$s'" ops/digistore-release.mjs || echo "fehlt $s"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node ops/digistore-release.mjs --chek > /dev/null 2>&1; echo "exit=$?"` muss genau `exit=1` ausgeben.
      Prüfung: `grep -ci 'postyourprice' ops/digistore-release.mjs` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops/digistore.mjs | wc -l` muss 0 ausgeben.
      Prüfung: `f=~/.config/control-plane/digistore-ipn.txt; [ "$(stat -c %a $f)" = 600 ] && [ "$(tr -d '\n' < $f | wc -c)" = 32 ] && echo bereit` muss genau `bereit` ausgeben.
      Prüfung (Netz): `PATH=/usr/bin:$PATH node ops/digistore-release.mjs --report 2>&1 | grep -cx 'ipn automaton-credit: url https://automatonhost.com/pay/digistore, products 771278,771279,771280, events payment refund chargeback, before thankyou'` muss genau 1 ausgeben.
- [x] Nach dem Human Gate ist das Kennwort in der Produktion gesetzt, die Rückgabe steht auf 30 Tagen, und je Produkt kam eine
      Testbestellung an, deren Verkäuferanteil das Werkzeug ohne Adresse ausgibt.
      MVP: Funktion, weil Digistore24 die Produkte erst danach freigibt und erst dann ein Kauf Guthaben bucht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-orders.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "prints the vendor share of the newest test order per product" "prints no address with --test-vendor"; do grep -qF "$t" test/card-orders.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -cE '\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b' ops/card-orders.sh` muss 0 ausgeben.
      Prüfung (Netz): `bash -c 'set -a; . ~/.config/control-plane/loop.env; set +a; ops/card-orders.sh' | grep -cx 'ipn_passphrase set'` muss genau 1 ausgeben.
      Prüfung (Netz): `bash -c 'set -a; . ~/.config/control-plane/loop.env; set +a; ops/card-orders.sh --test-vendor' | grep -cE '^card_test_vendor (771278|771279|771280) [1-9][0-9]*$'` muss genau 3 ausgeben.
      Prüfung (Netz): `node ops/digistore.mjs --report 2>&1 | grep -c ', refund 30 days, '` muss genau 3 ausgeben.
      Prüfung (Netz): `node ops/digistore.mjs --report 2>&1 | grep -cx 'report: 0 defects'` muss genau 1 ausgeben.
- [x] Das Guthaben je Paket ist aus dem gemessenen Verkäuferanteil und dem Kurs der EZB gerechnet, und die Regeln von karte 01 für
      `src/payments/digistore.ts` gelten weiter.
      MVP: Funktion, weil Seite, README und Plugin vor dem Kauf eine Zahl nennen, die stimmen muss.
      Prüfung: `PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const d = await import("./src/payments/digistore.ts"); const bad = d.CARD_PACKAGES.filter((p) => !(Number.isInteger(p.vendorEurCents) && p.vendorEurCents > 0 && p.vendorEurCents < p.grossEurCents) || p.aboutCreditUsd !== Math.floor((p.vendorEurCents * d.CARD_RATE_E4) / 1e6) || !(p.aboutCreditUsd > 0)); console.log(Number.isInteger(d.CARD_RATE_E4) && d.CARD_RATE_E4 > 5000 && bad.length === 0 ? "gerechnet" : "falsch")'` muss genau `gerechnet` ausgeben.
      Prüfung (Netz): `bash -c 'set -a; . ~/.config/control-plane/loop.env; set +a; ops/card-orders.sh --test-vendor' | PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { CARD_PACKAGES } = await import("./src/payments/digistore.ts"); let d = ""; for await (const c of process.stdin) d += c; const got = Object.fromEntries([...d.matchAll(/^card_test_vendor ([0-9]+) ([0-9]+)$/gm)].map((x) => [x[1], +x[2]])); const bad = CARD_PACKAGES.filter((p) => got[p.productId] !== p.vendorEurCents); console.log(bad.length ? "abweichend " + bad.map((p) => p.productId).join(",") : "gemessen")'` muss genau `gemessen` ausgeben.
      Prüfung: `grep -cE 'parseFloat|toFixed|Number\(' src/payments/digistore.ts` muss 0 ausgeben.
      Prüfung: `grep -cE 'productId: *"?[0-9]{5,}' src/payments/digistore.ts` muss genau 3 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/digistore-ipn.test.ts` muss Exit-Code 0 haben.
- [x] Die zwei SOLL-Bilder der Startseite mit dem Block `card` kommen aus ihrer Quelle, ohne Netz und ohne Mangel, und die Quelle
      trägt Feld, Knöpfe, Preise, Guthaben und Verkäufer wie beschrieben.
      MVP: Funktion, weil die Startseite 1:1 nach einem Bild entsteht und nicht nach einer Beschreibung.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const fs = await import("node:fs"); const { CARD_PACKAGES } = await import("./src/payments/digistore.ts"); const s = fs.readFileSync("docs/soll/src/startseite.html", "utf8"); const bad = []; const m = s.indexOf("data-soll=\"move\""); const me = s.indexOf("</section>", m); const c = s.indexOf("<section", me); const head = s.slice(c, s.indexOf(">", c)); const blk = c < 0 ? "" : s.slice(c, s.indexOf("</section>", c)); if (m < 0 || !head.includes("id=\"card\"") || !head.includes("data-soll=\"card\"")) bad.push("card nicht direkt nach move"); if (!s.slice(m, me).includes("href=\"#card\"")) bad.push("move ohne link"); const ids = [...blk.matchAll(/formaction="https:\/\/www\.checkout-ds24\.com\/product\/([0-9]+)\/"/g)].map((x) => x[1]); if (ids.join() !== CARD_PACKAGES.map((p) => p.productId).join()) bad.push("knoepfe " + ids.join()); if (!blk.includes("name=\"custom\"") || !blk.includes("pattern=\"0x[0-9a-fA-F]{40}\"") || !/\srequired[\s>]/.test(blk)) bad.push("feld"); for (const p of CARD_PACKAGES) { if (!blk.includes(p.grossEurCents / 100 + " EUR")) bad.push("preis " + p.productId); if (!(p.aboutCreditUsd > 0) || !blk.includes("about $" + p.aboutCreditUsd + " credit")) bad.push("guthaben " + p.productId); } if (!blk.includes("Digistore24") || !blk.includes("30 days")) bad.push("verkaeufer oder rueckgabe"); console.log(bad.length ? bad.join("; ") : "karte ok")'` muss genau `karte ok` ausgeben.
      Prüfung: `node --input-type=module -e 'import fs from "node:fs"; import { decodePng } from "./ops/soll-assess.mjs"; const bad = []; for (const w of [390, 1440]) { const p = decodePng(fs.readFileSync("docs/soll/startseite-" + w + ".png")); if (p.width !== w) bad.push(String(w)); } console.log(bad.length ? "falsch " + bad.join(" ") : "breiten ok")'` muss genau `breiten ok` ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- docs/soll | grep -vE '^docs/soll/(startseite-(390|1440)\.png|src/startseite\.html|README\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `grep -cE '^## Karte #card \(goals/karte/02\)$' docs/soll/README.md` muss genau 1 ausgeben.
- [ ] Der Design Reviewer hat genau diese zwei Bilder abgenommen, bevor sich `src/public/index.html` änderte.
      MVP: Funktion, weil die Seite 1:1 nach einem abgenommenen Bild entsteht.
      Prüfung: `grep -cE '^Abnahme-Issue card: PRO-[0-9]+$' docs/soll/README.md` muss genau 1 ausgeben.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue card: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- docs/soll/startseite-390.png docs/soll/startseite-1440.png docs/soll/src/startseite.html); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/public/index.html | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok.filter(x=>x>t))<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [ ] Die echte Startseite zeigt den Block `card` direkt nach dem Umzugsblock mit Feld, drei Knöpfen direkt auf die Kasse, Preisen und
      Guthaben, zählt seine Sichtungen und ist pixelgleich mit dem abgenommenen Bild; eine geänderte Zeile fällt dabei auf, und das
      Skript der Seite und sein Hash bleiben, wie sie sind.
      MVP: Funktion, weil ein Betreiber hier ohne Wallet zur Kasse kommt und die Seite halten muss, was das Bild verspricht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-checkout.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "puts the card block right after the move block" "links the card block from the move block" "sends the address as custom straight to the digistore24 checkout of each package" "names the price and the credit of each package" "says how to pay, who sells and that there are 30 days money back" "counts views of the card block with the pixel /px/card.png" "allows the digistore24 checkout as a form target in the csp" "offers the card link in the 402 for an empty balance" "leaves error, required_cents, current_balance_cents and topup_url of the 402 as they are" "offers no card link once topups are closed" "computes the credit of each package from its measured vendor share"; do grep -qF "\"$t\"" test/card-checkout.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const { CARD_PACKAGES } = await import("./src/payments/digistore.ts"); const app = createApp({ db: openDb(":memory:") }); const s = await (await app.request("/")).text(); const px = await app.request("/px/card.png"); const bad = []; const m = s.indexOf("data-soll=\"move\""); const me = s.indexOf("</section>", m); const c = s.indexOf("<section", me); const head = s.slice(c, s.indexOf(">", c)); const blk = c < 0 ? "" : s.slice(c, s.indexOf("</section>", c)); if (m < 0 || !head.includes("id=\"card\"")) bad.push("card nicht direkt nach move"); if (!s.slice(m, me).includes("href=\"#card\"")) bad.push("move ohne link"); const ids = [...blk.matchAll(/formaction="https:\/\/www\.checkout-ds24\.com\/product\/([0-9]+)\/"/g)].map((x) => x[1]); if (ids.join() !== CARD_PACKAGES.map((p) => p.productId).join()) bad.push("knoepfe " + ids.join()); if (!blk.includes("name=\"custom\"") || !blk.includes("pattern=\"0x[0-9a-fA-F]{40}\"")) bad.push("feld"); for (const p of CARD_PACKAGES) if (!(p.aboutCreditUsd > 0) || !blk.includes("about $" + p.aboutCreditUsd + " credit")) bad.push("guthaben " + p.productId); if (px.status !== 200 || !blk.includes("src=\"/px/card.png\"")) bad.push("pixel " + px.status); console.log(bad.length ? bad.join("; ") : "seite ok")' 2>&1 | tail -1` muss genau `seite ok` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live.mjs --out $T/s.html && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check --source $T/s.html > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/about \$/near $/g' $T/src/public/index.html; grep -q 'near \$' $T/src/public/index.html || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH node --import tsx ops/soll-live.mjs --out $T/s.html); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check --source $T/s.html > $T/o 2>&1; echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); s() { sed -n '/^<script>$/,/<\/script>/p'; }; a=$(git show $B:src/public/index.html | s | sha256sum); b=$(s < src/public/index.html | sha256sum); [ "$a" = "$b" ] && [ -n "$(s < src/public/index.html)" ] && echo skript gleich` muss genau `skript gleich` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/public.test.ts test/without-script.test.ts test/domain-move.test.ts test/journeys-cover-pages.test.ts test/sitemap-covers-pages.test.ts test/soll.test.ts` muss Exit-Code 0 haben.
- [x] Die CSP lässt das Formular zur Kasse von Digistore24 zu und ist sonst unverändert.
      MVP: Funktion, weil der Browser das Formular sonst nicht abschickt.
      Prüfung: `f=$(grep -oE "form-action [^;\"]*" deploy/Caddyfile); for x in "'self'" https://checkout.stripe.com https://www.checkout-ds24.com; do case "$f" in *"$x"*) ;; *) echo "fehlt $x";; esac; done` muss nichts ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); c() { grep -o 'Content-Security-Policy "[^"]*"' | sed -E 's/form-action [^;]*;//'; }; [ "$(git show $B:deploy/Caddyfile | c)" = "$(c < deploy/Caddyfile)" ] && echo csp sonst gleich` muss genau `csp sonst gleich` ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- deploy/Caddyfile | grep -E '^[-+][^-+]' | grep -vc 'Content-Security-Policy'` muss 0 ausgeben.
      Prüfung: `T=$(mktemp -d); sed "s#/var/log/caddy/access.log#$T/access.log#" deploy/Caddyfile > $T/Caddyfile && PATH=$HOME/.local/bin:$PATH caddy validate --config $T/Caddyfile --adapter caddyfile 2>&1 | tail -1; rm -rf $T` muss eine Zeile ausgeben, die `Valid configuration` enthält.
- [x] Das README zeigt direkt unter der Zeile `conwayApiUrl` die drei Wege zur Kasse mit ihrem Guthaben und das Formular.
      MVP: Funktion, weil Betreiber, die über GitHub kommen, zuerst das README lesen.
      Prüfung: `PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const fs = await import("node:fs"); const { CARD_PACKAGES } = await import("./src/payments/digistore.ts"); const r = fs.readFileSync("README.md", "utf8"); const a = r.indexOf("\"conwayApiUrl\": \"https://automatonhost.com\""); const run = r.indexOf("**Run an automaton"); const sec = a < 0 || run < a ? "" : r.slice(a, run); const bad = []; for (const p of CARD_PACKAGES) { if (!sec.includes("https://www.checkout-ds24.com/product/" + p.productId + "/?custom=")) bad.push("link " + p.productId); if (!(p.aboutCreditUsd > 0) || !sec.includes("about $" + p.aboutCreditUsd + " credit")) bad.push("guthaben " + p.productId); } if (!sec.includes("https://automatonhost.com/#card")) bad.push("seite"); console.log(bad.length ? bad.join("; ") : "readme ok")'` muss genau `readme ok` ausgeben.
      Prüfung: `grep -ci 'postyourprice' README.md` muss 0 ausgeben.
- [x] Das Plugin gibt mit `card_top_up` die drei Links zur Kasse für eine Adresse aus, und `deposit` bleibt, wie es ist.
      MVP: Funktion, weil ein Betreiber im Terminal den Link dort braucht, wo er arbeitet.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/mcp-card.test.ts test/mcp.test.ts test/mcp-automaton.test.ts test/mcp-money.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "lists card_top_up beside the other tools" "prints the three card links for an address" "names the credit each package gives" "refuses a malformed address without a link"; do grep -qF "\"$t\"" test/mcp-card.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); d() { sed -n '/name: "deposit"/,/^  },$/p'; }; [ "$(git show $B:mcp/server.mjs | d | sha256sum)" = "$(d < mcp/server.mjs | sha256sum)" ] && [ -n "$(d < mcp/server.mjs)" ] && echo deposit gleich` muss genau `deposit gleich` ausgeben.
      Prüfung: `grep -c 'card_top_up' mcp/README.md` muss mindestens 1 ausgeben.
- [x] Die 402 bei leerem Saldo nennt den Link zur Kasse als `card_url`, und alles, was die Runtime liest, bleibt gleich.
      MVP: Funktion, weil Kunde 1 täglich über tausend Mal genau diese Antwort bekommt und sein Betreiber sie im Log liest.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/the-way-to-pay.test.ts test/messages.test.ts test/inference-sunset.test.ts test/goal-18-die-tuer.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c 'card_url' src/inference/proxy.ts` muss mindestens 1 ausgeben.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/karte-02 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [ ] Die drei Produkte sind zur Freigabe eingereicht oder freigegeben.
      MVP: Funktion, weil Digistore24 erst nach der Freigabe an Fremde verkauft.
      Prüfung (Netz): `PATH=/usr/bin:$PATH node ops/digistore-release.mjs --report 2>&1 | grep -cE '^approval (771278|771279|771280): (pending|approved)$'` muss genau 3 ausgeben.
      Prüfung (Netz): `PATH=/usr/bin:$PATH node ops/digistore-release.mjs --report 2>&1 | tail -1` muss genau `release report: 0 defects` ausgeben.
- [ ] Die Entscheidungen stehen in `goals/karte/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg, und
      nichts im Repo nennt eine Adresse eines Kunden, das Kennwort oder den Schlüssel.
      MVP: Funktion, weil karte 03 auf diesen Zahlen und Wegen misst und ein späteres Goal wissen muss, warum es kein Skript gibt.
      Prüfung: `grep -cE '^- [0-9-]+, karte 02: ' goals/karte/ANNAHMEN.md` muss mindestens 9 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/app\.ts|src/public/index\.html|src/inference/proxy\.ts|src/payments/digistore\.ts|mcp/server\.mjs|mcp/README\.md|README\.md|deploy/Caddyfile|ops/digistore-release\.mjs|ops/card-orders\.sh|docs/soll/.*|docs/[a-z0-9-]+\.md|test/[a-z0-9-]+\.test\.ts|goals/karte/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
      Prüfung: `cat goals/karte/ANNAHMEN.md README.md mcp/README.md src/public/index.html docs/soll/src/startseite.html | grep -cE '0x[0-9a-fA-F]{40}'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -ciE '(^|/)\.env|passphrase|ipn-pass|digistore-ipn'` muss 0 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Betreiber ohne Wallet sieht auf der Startseite gleich nach der Zeile `conwayApiUrl` den Weg zur Karte, gibt die Adresse
      seines Automatons ein, wählt ein Paket und landet in der Kasse von Digistore24 mit seiner Adresse in `custom`.
- [ ] Vor dem Kauf steht überall dieselbe Zahl Guthaben je Paket, und sie ist aus einer echten Testbestellung gerechnet.
- [ ] Kein Gedankenstrich, kein Name und keine Wallet-Adresse eines Kunden, kein Satz zu PostYourPrice, nichts zu den Bedingungen des
      Einkaufs bei OpenRouter, kein Vorbehalt im Verkaufstext.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `.env*`, `*.db`, `*.key`, `*.pem`
- `deploy/**` außer `form-action` in der CSP von `deploy/Caddyfile` (Entscheidung 1); der Hash des Skripts bleibt
- `src/payments/**` außer `src/payments/digistore.ts`, und dort nur `vendorEurCents`, `aboutCreditUsd`, `CARD_RATE_E4` und
  `cardCheckoutUrl`; die Annahme der IPN bleibt, wie karte 01 sie gebaut hat. `src/auth/**`, `src/konto/**`, `src/checkout/**`,
  `src/handoff/**`
- `ops/digistore.mjs`: unverändert (karte 01 prüft seine Sperren); das Skript der Startseite und der Zweig `topupsClosed` der 402
- das Tool `deposit` in `mcp/server.mjs`; die übrigen SOLL-Werkzeuge, -Bilder und -Quellen außer denen der Startseite
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`,
  die der Tech Lead entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- Produkte, Zahlungspläne, IPN-Verbindungen, Gutscheine und Bestellformulare anderer Projekte im Konto von Digistore24;
  `~/work/personalplaner24`, `~/work/bautagebuch24`, `~/work/aszendent24` und `~/brain`: nur lesen
- jeder Preis außer 5, 20 und 50 EUR, jeder Gutschein, Rabatt und Marktplatz-Eintrag; mehr als ein Einreichen je Stand
- ein Kauf außer dem Testkauf mit Testpay, ein POST an `/pay/digistore` der Produktion, jeder Wert in `/opt/control-plane/.env`, ein
  Rollout oder Neustart durch einen Agent, Wallet-Bewegung, Topup, Gutschrift von Hand (`loop-constraints.md`, Grundregeln 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-22 Zyklus 1: Punkte 1, 7 und 10 gebaut (ops/digistore-release.mjs, IPN-Verbindung automaton-credit im Konto angelegt, form-action mit der Kasse), dazu ops/card-orders.sh --test-vendor, cardCheckoutUrl und card_url in der 402, zwölf Zeilen in ANNAHMEN.md; danach Human Gate für Kennwort, Rückgabe und Testkauf. Prüfbefehle: Punkt 1 alle sieben wie erwartet (SELFTEST OK, nichts fehlt, exit=1, 0, 0, bereit, 1); Gegenprobe des Selbsttests mit drei gepflanzten Fehlern rot (zweites ipnSetup, zweites Einreichen desselben Stands, Lesen fremder ID); Zählung der Testkäufe gegengeprüft (758179: 5, eigene: 0). Punkt 7 alle vier wie erwartet (nichts fehlt, csp sonst gleich, 0, Valid configuration). Punkt 2 ohne Netz grün (vitest 10 von 10, beide Namen da, 0); die drei neuen Fälle waren vor dem Skript rot; mit Netz `ops/card-orders.sh` ipn_passphrase missing, `--test-vendor` card_test_vendor none, `ops/digistore.mjs --report` refund 14 days, warten auf das Gate. Punkt 10: vitest 114 von 114, card_url 3 Treffer, e2e am PR #378 pass (Kopf 6a875b0, 10m53s), Zähler 1; in test/card-checkout.test.ts war der Fall mit card_url gegen den alten proxy.ts rot, die Wächter für Felder und geschlossene Aufladung rot mit gepflanztem Fehler, der CSP-Fall rot gegen den alten Caddyfile. Punkt 13: check grün in 80 s (2631 Tests). Offen bis nach dem Gate: Punkte 2 bis 6, 8, 9, 11 (brauchen Verkäuferanteil der Testkäufe), 12 und 13 (erst am fertigen Diff).
- 2026-11-22 Zyklus 2: Punkte 2, 3, 4, 8 und 9 gebaut (Gate von Matthias erledigt, Guthaben je Paket aus den Testkäufen 280, 1423 und 3707 Cent mit CARD_RATE_E4 10968 gleich about $3, $15 und $40, SOLL der Startseite mit Block card, README und Tool card_top_up, Zählmarke card in src/app.ts), Abnahme des SOLL beim Design Reviewer angefragt; Punkt 6 wartet auf die Abnahme, Punkt 11 kommt zuletzt. Prüfbefehle: Punkt 2 alle sieben wie erwartet (Exit 0, nichts fehlt, 0, 1, 3, 3, 1); Punkt 3 gerechnet, gemessen, 0, 3, Exit 0, der neue Fall in test/card-checkout.test.ts war vor den Zahlen rot, EZB-Kurs gegengeprüft (gepflanzte 0.5000 wird als Minimum gefunden); Punkt 4 exit=0 0 defects, karte ok (alte Quelle: card fehlt, link fehlt), breiten ok, 0, 1, move top 390=828 1440=656 unverändert; Punkt 8 readme ok (altes README: alle drei Links und seite fehlen), 0; Punkt 9 vitest 52 von 52, nichts fehlt, deposit gleich, 1, die vier Fälle in test/mcp-card.test.ts waren gegen den alten Server rot; die sechs Seitenfälle für Punkt 6 sind geschrieben und gegen die alte Seite rot.
- 2026-11-22 Zyklus 3: Befund 1 der SOLL-Abnahme behoben (je Paket die Zeile `.go` „Buy credit“, Commit 2942c1d), neue Abnahme angefragt; Punkt 5 und 6 warten weiter darauf. Prüfbefehle: Punkt 4 exit=0 0 defects, karte ok, move top 390=828 1440=656, test/soll.test.ts 8 von 8.

## Blockers
