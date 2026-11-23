# Werbung Goal 01: Karte zuerst, überall

## Status
PLANNED

## Active Objective
Seit karte 02 gibt es die Kasse für Guthaben per Karte, PayPal und Apple Pay, und wache 01 führt jeden Weg dorthin über die
Weiterleitung mit Notschalter. Trotzdem steht an jeder Stelle, an der ein Betreiber zuerst liest, zuerst die Wallet: Der erste
Bildschirm der Startseite sagt „It signs in here with its own wallet“ und „With USDC in its wallet“, das README nennt im ersten
Absatz USDC, die drei Seiten unter `/errors/` nennen nur USDC, die 402 bei leerem Guthaben erklärt zuerst x402 und USDC auf Base und
nennt die Karte im vorletzten Satz, und unsere Antworten in Conway-Issues kennen nur USDC. Wer kein Krypto hat, gibt genau dort auf.
Nach diesem Goal steht an diesen fünf Stellen ganz oben und vor dem ersten Wort USDC die Botschaft „No crypto needed“: Der
Automaton läuft weiter, bezahlt per Karte, PayPal oder Apple Pay, mit 60 Tagen, um den Kauf zu widerrufen. Startseite und
Fehlerseiten entstehen 1:1 nach neuen SOLL-Bildern (390 und 1440 px), die der Design Reviewer vor dem Bau abnimmt. Ist der
Notschalter aus wache 01 an, verschwindet die Botschaft dort, wo wache 01 den Weg zur Kasse weglässt, damit keine Seite eine Kasse
verspricht, die zu ist.
Leitzahl: Kartenkäufe je Woche (`ops/card-orders.sh`, Felder `live` und `booked`).
Widerlegt, wenn `live` in den 14 Tagen nach dem Rollout nicht über den Wert am Tag des Rollouts steigt; dann prüft der Kurs-Check, ob
die Leser die Botschaft überhaupt sehen (Sichtungen `/px/card.png` gegen `/px/top.png`), bevor eine weitere Stelle wirbt.
MVP: Funktion, weil wer kein USDC hat, heute an genau diesen Stellen aufgibt (Matthias 22.11.2026: „über diesen fiat weg richtig die
werbetrommel rühren, denn viele haben kein crypto“).

## Voraussetzungen
- wache Goal 01 DONE
- karte Goal 02 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Betreiber ohne Krypto, der auf der Startseite, im README, auf einer Fehlerseite, in der 402 seines
  Automatons oder in unserer Antwort in einem Conway-Issue liest, erfährt im ersten Satz, dass er per Karte, PayPal oder Apple Pay
  zahlen kann, und kommt von dort in einem Klick zur Kasse.
- Der erste Leser ist fast immer ein Agent: Wer einen Automaton betreibt, lässt ihn von Claude Code oder einer anderen
  Agenten-Session reparieren. Die liest die 402 im Log, sucht im Netz, liest `/llms.txt` und die Conway-Issues und empfiehlt ihrem
  Menschen dann einen Satz (Matthias 22.11.2026: „immer dran denken wie kommen die leute auf uns, durch claude code oder agent sessions!“). Jede Stelle ist darum zuerst für einen Agenten
  geschrieben, der sie weitergibt: ein Satz, den er wörtlich übernehmen kann, mit dem genauen Link.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Die Kasse aus karte 02 verkauft nur, wenn Leser ohne Wallet sie
  finden. reichweite 02 lenkt danach unsere Kommentare in den Conway-Issues auf die Fehlerseiten, und die nächste Runde des Topics
  kanal schreibt ihre Antworten aus der Vorlage dieses Goals; beide tragen dann dieselbe Botschaft.
- Quelle: `ROADMAP.md`, Topic `werbung`, Glied 01; Grundsatz in `docs/kette.md`, Abschnitt „karte: Guthaben per Karte über
  Digistore24“ (Preise fest, Guthaben unauszahlbar, die Adresse reist nur in `custom` und in der IPN, kein Text nach außen nennt
  PostYourPrice). Ton nach Regel V: verkäuferisch, kurz, Nutzen vorn, keine Technik, kein Vorbehalt. Klare Wörter: „card, PayPal or
  Apple Pay“ statt eines Namens für den Zahlweg.
- **Entscheidungen des Tech Lead (22.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- 2026-11-22, werbung 01: …` in
  `goals/werbung/ANNAHMEN.md` (neu).
  1. **Der Wortlaut ist `No crypto needed`**, englisch wie jede Seite für Automaton-Betreiber, genau so geschrieben, damit Tests und
     Prüfbefehle ihn finden. Er steht an jeder der fünf Stellen vor dem ersten Vorkommen von `USDC` und in derselben Zeile oder im
     selben Satz wie „card, PayPal or Apple Pay“ (Groß- und Kleinschreibung von „card“ frei).
  2. **Startseite: die Überschrift trägt die Botschaft.** Der Block `#move` bleibt der erste Bildschirm (`ops/soll.mjs`, Zeile
     `move top`, bei 390 px heute 828 von 844 px), deshalb ersetzt die Botschaft Text, statt Zeilen anzuhängen: Die `<h1>` von
     `#move` enthält `No crypto needed`, etwa „Your automaton runs here.“ und „No crypto needed.“ in zwei Zeilen; das Pill über der
     Überschrift trägt den Haken für Conway-Leser, etwa „Conway not answering?“ mit Link auf `/fix`; der Satz `.sub` nennt „card,
     PayPal or Apple Pay“ und „60 days to cancel the purchase“; die Zeile `.fine` mit USDC bleibt unter dem Code. Die Knöpfe „Switch
     in two steps“ und „Pay by card“ bleiben; welcher vorn steht, entscheidet das Bild. Die `<h1>` nach `#move` (`#fuer-agenten`),
     `<title>`, die Beschreibung im Kopf und die Vorschaukarte bleiben, wie sie sind (`test/public.test.ts` vergleicht die erste
     `<h1>` nach `#move` mit `/llms.txt`, umzug 03 prüft `docs/soll/src/og-card.html`). Der Block `card` aus karte 02 bleibt
     unverändert.
  3. **„60 days to cancel the purchase“, nie „money back“ oder „refund“.** Das ist der Vertrauensanker aus der ROADMAP in der
     Fassung, die karte 02 nach `test/public.test.ts` gefunden hat: Die Startseite sperrt „refund“ und „money back“, weil Guthaben nie
     auszahlbar ist (`loop-constraints.md`, Grundregel 10); die Rückgabe von 60 Tagen macht Digistore24 am Kauf, nicht wir am
     Guthaben. Dieselbe Fassung gilt in README, Fehlerseiten und Vorlage.
  4. **Fehlerseiten: eine Zeile über der Zeile mit USDC.** In `renderErrorPage` (`src/public/error-pages.ts`) steht direkt unter dem
     Code mit `conwayApiUrl` und vor der Zeile `.fine` „With USDC in its wallet …“ eine Zeile im Stil `.fine` oder `.sub`, etwa
     „No crypto needed: pay by card, PayPal or Apple Pay. You have 60 days to cancel the purchase.“ mit dem Link `/#card` auf das
     Formular. Ohne Adresse auf der Seite gibt es keinen Link mit `address`; das Formular der Startseite schickt über die
     Weiterleitung aus wache 01. Überschrift, Titel, Ursache, Slugs und die Zeile `conwayApiUrl` bleiben (reichweite 01 und 02
     hängen daran), und der Block `fix` endet weiter im ersten Bildschirm (`ops/soll-errors.mjs`, `blocks end`).
  5. **402: die Karte als zweiter Satz.** In `src/inference/proxy.ts`, nur im Zweig mit Aufladung, wo wache 01 die Karte anbietet:
     `message` beginnt weiter mit `Insufficient credits: need <n> cents, have <m> cents.` (`test/messages.test.ts`), danach sofort
     `No crypto needed: pay by card, PayPal or Apple Pay at <card_url> `, dann der bisherige Text ab `Buy credits at …` mit USDC und
     x402. Der Satz `No USDC? Pay by card: <card_url> ` am Ende entfällt, damit die Karte nicht zweimal steht. `error`,
     `details.required_cents`, `details.current_balance_cents`, `topup_url`, `card_url` und der Marker bleiben, wie sie sind
     (Upstream `src/conway/topup.ts:103`), `pnpm e2e` im PR bleibt grün. Ist der Notschalter an, steht kein Satz zur Karte in der
     402, wie wache 01 es baut. Erwarten Tests von karte 02 oder wache 01 den alten Satz an der alten Stelle, ändert der Maker in
     demselben Test nur die erwartete Zeichenkette auf den neuen Satz, genauso streng (ganze Zeichenkette, Link eingeschlossen),
     ohne den Namen des Tests zu ändern, und schreibt alte und neue Zeile in `ANNAHMEN.md`. Kein Test fällt weg und keiner wird
     umbenannt.
  6. **README: der erste Absatz.** Der Absatz direkt unter „**Conway not answering? Your automaton runs here.**“ beginnt mit
     `No crypto needed` und nennt „card, PayPal or Apple Pay“; USDC kommt frühestens danach. Der Absatz „No USDC? Pay by card.“ aus
     karte 02 mit den drei Links über die Weiterleitung aus wache 01 bleibt unter der Zeile `conwayApiUrl`, sein Titel darf auf
     `No crypto needed.` wechseln, wenn das den Text kürzer macht.
  7. **Vorlage für Antworten in Conway-Issues: `docs/kanal/antwort-vorlage.md` (neu).** Kopf auf Deutsch in zwei Sätzen (wofür, wer
     sie nutzt), darunter der englische Absatz, den jede Antwort, die den Dienst nennt, als Schluss übernimmt: eine Zeile, die mit
     `Disclosure:` beginnt, `https://automatonhost.com` ausschreibt (die Regel 4 und 5 von `ops/before-the-answers.py`), mit
     `No crypto needed` vor jedem USDC, „card, PayPal or Apple Pay“, dem Link `https://automatonhost.com/#card` und „60 days to cancel
     the purchase“. Kein anderer Host aus `KNOWN_HOSTS`, kein PostYourPrice, keine Zahl. `ops/before-the-answers.py`,
     `ops/post-the-answers.py` und die Entwürfe unter `goals/kanal/` bleiben unverändert: Die schon geposteten Antworten sind fest,
     und eine neue Regel im Gatter würde die Prüfbefehle der fertigen kanal-Goals rot machen. Ob das Gatter die Vorlage erzwingt,
     ist ein Vorschlag für kanal.
  8. **Jeder Weg zur Kasse über wache 01.** Keine der fünf Stellen verlinkt `checkout-ds24.com` direkt; Links mit Adresse sind die
     Weiterleitung aus wache 01 (aus ihrer Funktion, nicht von Hand zusammengesetzt), Links ohne Adresse zeigen auf `/#card`.
  9. **Notschalter an.** Wo wache 01 im Fall „Fehlbetrag erreicht die Grenze“ den Weg zur Kasse weglässt (Startseite, 402), fehlt
     auch die Botschaft: Die Startseite zeigt dann den ersten Bildschirm genau so, wie wache 01 ihn mit Notschalter an zeigt (Stand
     der Merge-Basis), und die Fehlerseiten zeigen die Zeile aus Entscheidung 4 nicht und sind dann wie vor diesem Goal. Gebaut über
     den Zustand, den wache 01 dafür liest, nie über eine eigene Zählung. README und Vorlage sind fest; ihr Link `/#card` führt auf
     die Startseite, die dann den Weg über USDC zeigt.
- **SOLL zuerst (Punkte 1 und 2), dann Abnahme (Punkt 3), dann der Bau.** `docs/soll/src/startseite.html` bekommt den neuen ersten
  Bildschirm, `docs/soll/src/errors-<slug>.html` je Fehlerseite die Zeile aus Entscheidung 4, gebaut aus den Klassen von
  `src/public/index.html`; jede neue Klasse mit Grund als `` `.<klasse>` `` unter einem neuen Abschnitt
  `## Werbung: Karte zuerst (goals/werbung/01)` in `docs/soll/README.md`. `node ops/soll.mjs` schreibt `startseite-390.png` und
  `startseite-1440.png`, `node ops/soll-errors.mjs` die sechs Bilder der Fehlerseiten neu. Sind Quellen und Bilder committet und
  gepusht, setzt der Maker in `docs/soll/README.md` die Zeile `Abnahme-Issue werbung: PRO-<n>` mit dem Topic dieses Goals und
  erwähnt dort den Design Reviewer mit allen acht Bildpfaden und dem Commit. Bis „SOLL abgenommen“ dasteht, ändert der Maker
  `src/public/index.html` und `src/public/error-pages.ts` nicht. Ändern sich Bilder nach der Abnahme, braucht es eine neue. Auf dem
  code-host rendern die SOLL-Werkzeuge mit `FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf`.
- **Tests.** `test/werbung.test.ts` gegen `createApp` (leere Datenbank, `CP_PUBLIC_URL=https://automatonhost.com`, kein Port), den
  Inferenz-Weg der bestehenden 402-Tests und den Zustand des Notschalters, wie die Tests von wache 01 ihn herstellen; die Namen
  prüfen die Punkte. Jeder neue Fall war einmal rot, die Zeile im Progress Log sagt, womit.
- Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `startseite`, `index.html`, `error-pages`, `errors-`, `README`,
  `proxy.ts`, `card_url` oder `antworten` nennen (`grep -l -E 'startseite|index\.html|error-pages|errors-|README|proxy\.ts|card_url|antworten'
  goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem Bau erneut. Wird einer durch dieses Goal rot, ohne dass sein Zweck
  verletzt ist, fragt der Maker den Tech Lead auf dem Topic mit Befehl und beiden Ausgaben; der entscheidet mit einer Zeile
  `Abgelöst:` im `ANNAHMEN.md` des alten Goals. Kein Prüfbefehl eines fertigen Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Test geht ins Netz oder bindet einen festen Port. Kein Kauf, kein Kommentar in einem
  fremden Repo, kein Wert in `/opt/control-plane/.env`, kein Rollout und kein Neustart durch einen Agent. Code, Bezeichner,
  Testnamen und alle Texte auf Seite, README, 402 und in der Vorlage englisch, Kopf der Vorlage und `ANNAHMEN.md` deutsch.

## Done Condition
- [x] Die zwei SOLL-Bilder der Startseite zeigen im ersten Bildschirm `No crypto needed` in der Überschrift, Karte, PayPal, Apple Pay
      und 60 Tage zum Widerrufen vor jedem USDC, kommen aus ihrer Quelle ohne Netz und ohne Mangel, und der Block `card` bleibt.
      MVP: Funktion, weil die Startseite 1:1 nach einem Bild entsteht und nicht nach einer Beschreibung.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const s=fs.readFileSync("docs/soll/src/startseite.html","utf8");const bad=[];const m=s.indexOf("data-soll=\"move\"");const mv=m<0?"":s.slice(m,s.indexOf("</section>",m));const h1=mv.slice(mv.indexOf("<h1"),mv.indexOf("</h1>"));if(!h1.includes("No crypto needed"))bad.push("h1");for(const w of ["PayPal","Apple Pay","60 days to cancel the purchase"])if(!mv.includes(w))bad.push(w);if(!/card/i.test(mv.replace(/href="#card"/g,"")))bad.push("card");const n=mv.indexOf("No crypto needed"),u=mv.indexOf("USDC");if(n<0||(u>=0&&u<n))bad.push("usdc vor der botschaft");if(/checkout-ds24|money back|refund/i.test(mv))bad.push("kasse direkt oder money back");if(/[\u2013\u2014]/.test(mv))bad.push("gedankenstrich");if(!s.includes("data-soll=\"card\""))bad.push("block card fehlt");console.log(bad.length?bad.join("; "):"soll start ok")'` muss genau `soll start ok` ausgeben.
      Prüfung: `node --input-type=module -e 'import fs from "node:fs"; import { decodePng } from "./ops/soll-assess.mjs"; const bad = []; for (const w of [390, 1440]) { const p = decodePng(fs.readFileSync("docs/soll/startseite-" + w + ".png")); if (p.width !== w) bad.push(String(w)); } console.log(bad.length ? "falsch " + bad.join(" ") : "breiten ok")'` muss genau `breiten ok` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); c() { sed -n '/<section id="card" data-soll="card">/,/<\/section>/p'; }; [ "$(git show $B:docs/soll/src/startseite.html | c | sha256sum)" = "$(c < docs/soll/src/startseite.html | sha256sum)" ] && [ -n "$(c < docs/soll/src/startseite.html)" ] && echo card gleich` muss genau `card gleich` ausgeben.
      Prüfung: `grep -cE '^## Werbung: Karte zuerst \(goals/werbung/01\)$' docs/soll/README.md` muss genau 1 ausgeben.
- [x] Die sechs SOLL-Bilder der Fehlerseiten zeigen über der Zeile mit USDC die Zeile mit `No crypto needed`, Karte, PayPal, Apple
      Pay und dem Link auf das Formular, kommen aus ihren Quellen ohne Netz und ohne Mangel, und der Block `fix` endet im ersten
      Bildschirm.
      MVP: Funktion, weil wer den Fehlertext sucht, auf diesen Seiten landet und dort heute nur USDC liest.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-errors.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o)"; rm -rf $T` muss genau `exit=0 soll errors: 6 images, blocks end 390=<y> 1440=<y>, 0 defects` ausgeben, mit y bei 390 höchstens 844 und bei 1440 höchstens 900.
      Prüfung: `node -e 'const fs=require("fs");const bad=[];for(const f of ["verify-500-database-error","invalid-or-expired-nonce","credits-never-granted"]){const s=fs.readFileSync("docs/soll/src/errors-"+f+".html","utf8");const n=s.indexOf("No crypto needed"),u=s.indexOf("USDC");if(n<0||(u>=0&&u<n))bad.push(f+" usdc vor der botschaft");for(const w of ["PayPal","Apple Pay","60 days to cancel the purchase"])if(!s.includes(w))bad.push(f+" "+w);if(!/href="(https:\/\/automatonhost\.com)?\/#card"/.test(s))bad.push(f+" link");if(/checkout-ds24|money back|refund|[\u2013\u2014]/i.test(s))bad.push(f+" kasse direkt, money back oder gedankenstrich")}console.log(bad.length?bad.join("; "):"soll errors ok")'` muss genau `soll errors ok` ausgeben.
      Prüfung: `node --input-type=module -e 'import fs from "node:fs"; import { decodePng } from "./ops/soll-assess.mjs"; const bad = []; for (const s of ["verify-500-database-error", "invalid-or-expired-nonce", "credits-never-granted"]) for (const w of [390, 1440]) { const p = decodePng(fs.readFileSync("docs/soll/errors-" + s + "-" + w + ".png")); if (p.width !== w) bad.push(s + " " + w); } console.log(bad.length ? "falsch " + bad.join(" ") : "breiten ok")'` muss genau `breiten ok` ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- docs/soll | grep -vE '^docs/soll/(startseite-(390|1440)\.png|src/startseite\.html|errors-[a-z0-9-]+-(390|1440)\.png|src/errors-[a-z0-9-]+\.html|README\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops/soll.mjs ops/soll-live.mjs ops/soll-errors.mjs ops/soll-live-errors.mjs ops/soll-assess.mjs ops/browser.mjs | wc -l` muss 0 ausgeben.
- [x] Der Design Reviewer hat genau diese acht Bilder abgenommen, bevor sich `src/public/index.html` oder `src/public/error-pages.ts`
      änderten.
      MVP: Funktion, weil Startseite und Fehlerseiten 1:1 nach einem abgenommenen Bild entstehen.
      Prüfung: `grep -cE '^Abnahme-Issue werbung: PRO-[0-9]+$' docs/soll/README.md` muss genau 1 ausgeben.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue werbung: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- docs/soll/startseite-390.png docs/soll/startseite-1440.png docs/soll/src/startseite.html 'docs/soll/errors-*.png' 'docs/soll/src/errors-*.html'); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/public/index.html src/public/error-pages.ts | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok.filter(x=>x>t))<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [x] Die echte Startseite zeigt im ersten Bildschirm `No crypto needed` in der Überschrift, Karte, PayPal, Apple Pay und 60 Tage
      zum Widerrufen vor jedem USDC, ist pixelgleich mit dem abgenommenen Bild, eine geänderte Botschaft fällt dabei auf, mit
      Notschalter an zeigt sie den ersten Bildschirm von wache 01, und das Skript der Seite und sein Hash bleiben, wie sie sind.
      MVP: Funktion, weil die Startseite der erste Ort ist, an dem ein Betreiber ohne Krypto heute nur die Wallet sieht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/werbung.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "puts no crypto needed in the heading of the first screen" "names card, paypal and apple pay before any usdc on the start page" "says 60 days to cancel the purchase in the first screen" "shows the first screen of wache 01 while the card breaker is on" "leaves the card block of karte 02 as it is" "links no checkout of digistore24 directly from any page"; do grep -qF "\"$t\"" test/werbung.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const app = createApp({ db: openDb(":memory:") }); const s = await (await app.request("/")).text(); const bad = []; const main = s.slice(s.indexOf("<main>")); const m = main.indexOf("data-soll=\"move\""); const mv = m < 0 ? "" : main.slice(m, main.indexOf("</section>", m)); const h1 = mv.slice(mv.indexOf("<h1"), mv.indexOf("</h1>")); if (!h1.includes("No crypto needed")) bad.push("h1"); for (const w of ["PayPal", "Apple Pay", "60 days to cancel the purchase"]) if (!mv.includes(w)) bad.push(w); const n = main.indexOf("No crypto needed"), u = main.indexOf("USDC"); if (n < 0 || (u >= 0 && u < n)) bad.push("usdc vor der botschaft"); if (/checkout-ds24/.test(s)) bad.push("kasse direkt"); if (/money back|refund/i.test(mv)) bad.push("money back"); if (!main.includes("data-soll=\"card\"")) bad.push("block card fehlt"); console.log(bad.length ? bad.join("; ") : "start ok")' 2>&1 | tail -1` muss genau `start ok` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live.mjs --out $T/s.html && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check --source $T/s.html > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/No crypto needed/No coins needed/g' $T/src/public/index.html; grep -q 'No coins needed' $T/src/public/index.html || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH node --import tsx ops/soll-live.mjs --out $T/s.html); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check --source $T/s.html > $T/o 2>&1; echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); s() { sed -n '/^<script>$/,/<\/script>/p'; }; a=$(git show $B:src/public/index.html | s | sha256sum); b=$(s < src/public/index.html | sha256sum); [ "$a" = "$b" ] && [ -n "$(s < src/public/index.html)" ] && echo skript gleich` muss genau `skript gleich` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); c() { sed -n '/<section id="card" data-soll="card">/,/<\/section>/p'; }; [ "$(git show $B:src/public/index.html | c | sha256sum)" = "$(c < src/public/index.html | sha256sum)" ] && [ -n "$(c < src/public/index.html)" ] && echo card gleich` muss genau `card gleich` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/public.test.ts test/without-script.test.ts test/domain-move.test.ts test/journeys-cover-pages.test.ts test/sitemap-covers-pages.test.ts test/soll.test.ts test/card-checkout.test.ts` muss Exit-Code 0 haben.
- [x] Jede Fehlerseite zeigt über der Zeile mit USDC die Zeile mit `No crypto needed`, Karte, PayPal, Apple Pay und dem Link auf das
      Formular, ist pixelgleich mit ihren abgenommenen Bildern, eine geänderte Botschaft fällt dabei auf, und mit Notschalter an
      fehlt die Zeile.
      MVP: Funktion, weil wer bei Conway hängt und den Fehlertext sucht, hier im ersten Bildschirm den Weg ohne Krypto braucht.
      Prüfung: `for t in "puts no crypto needed above the usdc line on every error page" "links every error page to the card form" "drops the card line from the error pages while the card breaker is on"; do grep -qF "\"$t\"" test/werbung.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const { ERROR_PAGES } = await import("./src/public/error-pages.ts"); const app = createApp({ db: openDb(":memory:") }); const bad = []; for (const p of ERROR_PAGES) { const r = await app.request("/errors/" + p.slug); const s = await r.text(); const main = s.slice(s.indexOf("<main>")); const n = main.indexOf("No crypto needed"), u = main.indexOf("USDC"); if (r.status !== 200) bad.push(p.slug + " " + r.status); if (n < 0 || (u >= 0 && u < n)) bad.push(p.slug + " usdc vor der botschaft"); for (const w of ["PayPal", "Apple Pay"]) if (!main.includes(w)) bad.push(p.slug + " " + w); if (!/href="(https:\/\/automatonhost\.com)?\/#card"/.test(main)) bad.push(p.slug + " link"); if (/checkout-ds24/.test(s)) bad.push(p.slug + " kasse direkt"); } console.log(bad.length ? bad.join("; ") : "errors ok")' 2>&1 | tail -1` muss genau `errors ok` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live-errors.mjs --out $T && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-errors.mjs --check --source $T > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/No crypto needed/No coins needed/g' $T/src/public/error-pages.ts; grep -q 'No coins needed' $T/src/public/error-pages.ts || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH node --import tsx ops/soll-live-errors.mjs --out $T/out); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-errors.mjs --check --source $T/out > $T/o 2>&1; echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/error-pages.test.ts test/soll-errors.test.ts test/jsonld.test.ts test/error-pages-arrivals.test.ts` muss Exit-Code 0 haben.
- [x] Der erste Absatz des README beginnt mit `No crypto needed`, nennt Karte, PayPal und Apple Pay vor jedem USDC, und das README
      verlinkt die Kasse nur über die Weiterleitung aus wache 01 oder über das Formular.
      MVP: Funktion, weil Betreiber, die über GitHub kommen, zuerst das README lesen.
      Prüfung: `node -e 'const r=require("fs").readFileSync("README.md","utf8");const bad=[];const ps=r.split(/\n\s*\n/).map(p=>p.trim()).filter(p=>p&&!p.startsWith("#"));const first=ps.find(p=>!/^\*\*[^*]+\*\*$/.test(p))||"";if(!first.startsWith("No crypto needed"))bad.push("erster absatz: "+first.slice(0,40));for(const w of ["PayPal","Apple Pay"])if(!first.includes(w))bad.push(w);if(!/card/i.test(first))bad.push("card");const n=r.indexOf("No crypto needed"),u=r.indexOf("USDC");if(n<0||(u>=0&&u<n))bad.push("usdc vor der botschaft");if(!r.includes("60 days to cancel the purchase"))bad.push("60 tage");if(/checkout-ds24|money back|[\u2013\u2014]/i.test(r))bad.push("kasse direkt, money back oder gedankenstrich");if(!r.includes("https://automatonhost.com/#card"))bad.push("formular");console.log(bad.length?bad.join("; "):"readme ok")'` muss genau `readme ok` ausgeben.
      Prüfung: `grep -ci 'postyourprice' README.md` muss 0 ausgeben.
- [x] Die 402 bei leerem Guthaben nennt direkt nach dem ersten Satz `No crypto needed` mit Karte, PayPal, Apple Pay und `card_url`,
      vor jedem USDC; mit Notschalter an nennt sie keine Karte, und alles, was die Runtime liest, bleibt gleich.
      MVP: Funktion, weil Betreiber diese Antwort täglich im Log ihres Automatons lesen und dort heute zuerst x402 und USDC finden.
      Prüfung: `for t in "puts no crypto needed right after the first sentence of the 402" "names the card url before any usdc in the 402" "drops the card sentence from the 402 while the card breaker is on" "keeps error, required_cents, current_balance_cents and topup_url of the 402"; do grep -qF "\"$t\"" test/werbung.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/werbung.test.ts test/messages.test.ts test/the-way-to-pay.test.ts test/inference-sunset.test.ts test/goal-18-die-tuer.test.ts test/card-checkout.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c 'No crypto needed: pay by card, PayPal or Apple Pay at ' src/inference/proxy.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c 'checkout-ds24' src/inference/proxy.ts` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- test | grep -cE '^-\s*(it|test)(\.each\([^)]*\))?\('` muss 0 ausgeben.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/werbung-01 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [x] Die Vorlage für Antworten in Conway-Issues steht in `docs/kanal/antwort-vorlage.md` mit `Disclosure:`, `No crypto needed` vor
      jedem USDC, Karte, PayPal, Apple Pay, dem Link auf das Formular und nur dem Host automatonhost.com, und das Gatter und die
      Entwürfe des Topics kanal bleiben unverändert.
      MVP: Funktion, weil der Kanal, der bisher als einziger fremde Leser brachte, die Karte sonst nie nennt.
      Prüfung: `node -e 'const s=require("fs").readFileSync("docs/kanal/antwort-vorlage.md","utf8");const bad=[];if(!/^Disclosure: /m.test(s))bad.push("disclosure");const d=(s.match(/^Disclosure: .*$/m)||[""])[0];const n=s.indexOf("No crypto needed"),u=s.indexOf("USDC");if(n<0||(u>=0&&u<n))bad.push("usdc vor der botschaft");for(const w of ["https://automatonhost.com","PayPal","Apple Pay","https://automatonhost.com/#card","60 days to cancel the purchase"])if(!s.includes(w))bad.push(w);if(!d.includes("https://automatonhost.com"))bad.push("host nicht in der zeile disclosure");if(/cp\.hippe\.eu|postyourprice|checkout-ds24|money back|refund|[\u2013\u2014]/i.test(s))bad.push("fremder host, kasse direkt, money back oder gedankenstrich");console.log(bad.length?bad.join("; "):"vorlage ok")'` muss genau `vorlage ok` ausgeben.
      Prüfung: `grep -qF '"keeps the answer template card first"' test/werbung.test.ts && echo da` muss genau `da` ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops/before-the-answers.py ops/post-the-answers.py ops/answers_args.py goals/kanal | wc -l` muss 0 ausgeben.
- [x] Die 402 bei leerem Guthaben trägt zusätzlich das Feld `message_for_operator` mit genau einem Satz, den ein Agent seinem Menschen
      wörtlich weitergeben kann: `No crypto needed: top up this automaton by card, PayPal or Apple Pay at <Link>`, der Link über die
      Weiterleitung aus wache 01 mit der Wallet dieses Aufrufs; mit Notschalter an nennt das Feld nur den Weg über USDC. Das Feld kommt
      dazu, nichts, was die Runtime liest, ändert sich.
      MVP: Funktion, weil Betreiber ihren Automaton meist von einem Agenten reparieren lassen, der die 402 liest und dann einen Satz
      empfiehlt (Matthias 22.11.2026: „immer dran denken wie kommen die leute auf uns, durch claude code oder agent sessions!“).
      Prüfung: `for t in "gives an agent one sentence to pass on in message_for_operator" "names only usdc in message_for_operator while the card breaker is on"; do grep -qF "\"$t\"" test/werbung.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'message_for_operator' src/inference/proxy.ts` muss mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/werbung.test.ts test/messages.test.ts` muss Exit-Code 0 haben.
- [x] `/llms.txt` beginnt direkt unter der ersten Überschrift mit einem Block für Agenten, die einem Menschen mit einem kaputten
      Conway-Automaton helfen: die Fehlertexte, an denen der Agent den Fall erkennt (mindestens `/v1/auth/verify` mit 500 und
      `INSUFFICIENT_CREDITS`), die eine Zeile für `conwayApiUrl` und `No crypto needed` mit Karte, PayPal, Apple Pay und dem Link zum
      Formular oder über die Weiterleitung, alles vor dem ersten USDC; mit Notschalter an fehlt die Karte im Block. Der Rest von
      `/llms.txt` steht darunter wie heute.
      MVP: Funktion, weil ein Agent mit Websuche `/llms.txt` liest, bevor er seinem Menschen einen Dienst empfiehlt.
      Prüfung: `for t in "opens llms.txt with the block for agents helping an operator" "drops the card from the llms.txt block while the card breaker is on"; do grep -qF "\"$t\"" test/werbung.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/werbung.test.ts test/llms-txt.test.ts test/public.test.ts` muss Exit-Code 0 haben.
- [x] Keine der fünf Stellen verlinkt die Kasse von Digistore24 direkt, die Entscheidungen stehen in `goals/werbung/ANNAHMEN.md`, der
      Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg, und nichts nennt eine Adresse eines Kunden oder PostYourPrice.
      MVP: Funktion, weil der Notschalter aus wache 01 nur wirkt, wenn jeder Weg zur Kasse über ihn geht.
      Prüfung: `cat README.md src/public/index.html src/public/error-pages.ts src/inference/proxy.ts docs/kanal/antwort-vorlage.md | grep -c 'checkout-ds24'` muss 0 ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+, werbung 01: ' goals/werbung/ANNAHMEN.md` muss mindestens 9 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/app\.ts|src/public/index\.html|src/public/error-pages\.ts|src/inference/proxy\.ts|README\.md|docs/soll/.*|docs/kanal/antwort-vorlage\.md|test/[a-z0-9-]+\.test\.ts|goals/werbung/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
      Prüfung: `cat goals/werbung/ANNAHMEN.md README.md src/public/error-pages.ts docs/kanal/antwort-vorlage.md docs/soll/src/startseite.html docs/soll/src/errors-*.html | grep -cE '0x[0-9a-fA-F]{40}'` muss 0 ausgeben.
      Prüfung: `cat src/public/error-pages.ts docs/kanal/antwort-vorlage.md docs/soll/src/errors-*.html | grep -ci 'postyourprice'` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Betreiber ohne Krypto liest an jeder der fünf Stellen zuerst, dass sein Automaton per Karte, PayPal oder Apple Pay weiterläuft,
      und kommt von dort in einem Klick zum Formular oder zur Kasse über die Weiterleitung aus wache 01.
- [ ] Ist der Notschalter an, verspricht weder die Startseite noch die 402 noch eine Fehlerseite eine Kasse.
- [ ] Ein Agent, der für seinen Menschen einen Conway-Automaton repariert, findet in der 402 und in `/llms.txt` einen Satz, den er
      weitergeben kann, mit dem Weg per Karte.
- [ ] Kein Gedankenstrich, kein Name und keine Wallet-Adresse eines Kunden, kein Satz zu PostYourPrice, nichts zu den Bedingungen des
      Einkaufs bei OpenRouter, kein „money back“ und kein Vorbehalt im Verkaufstext.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `.env*`, `*.db`, `*.key`, `*.pem`
- `deploy/**`; die CSP bleibt, wie karte 02 und wache 01 sie lassen
- `src/payments/**`, `src/auth/**`, `src/konto/**`, `src/checkout/**`, `src/handoff/**`; die Weiterleitung, die Grenze und der
  Notschalter aus wache 01: nur nutzen, nie ändern
- das Skript der Startseite, der Block `card` aus karte 02, die `<h1>` nach `#move`, `<title>` und Beschreibung im Kopf von
  `src/public/index.html`, `docs/soll/src/og-card.html` und die Vorschaukarte
- Überschrift, Titel, Ursache und Slug jeder Fehlerseite, `src/public/fix.ts`
- `error`, `details` außer der Reihenfolge im Text von `message`, `topup_url`, `card_url` und der Marker der 402; der Zweig
  `topupsClosed`
- `ops/before-the-answers.py`, `ops/post-the-answers.py`, `ops/answers_args.py`, `ops/posted-answers.log`, alles unter `goals/kanal/`
- `mcp/**`; die übrigen SOLL-Werkzeuge, -Bilder und -Quellen außer denen der Startseite und der Fehlerseiten
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`,
  die der Tech Lead entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- jeder Preis außer 5, 20 und 50 EUR, jeder Gutschein und Rabatt; Produkte und Einstellungen im Konto von Digistore24
- ein Kauf, ein Kommentar in einem fremden Repo, ein POST an die Produktion, jeder Wert in `/opt/control-plane/.env`, ein Rollout oder
  Neustart durch einen Agent, Wallet-Bewegung, Topup, Gutschrift (`loop-constraints.md`, Grundregeln 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-23 Zyklus 1: Punkte 1 bis 12 gebaut: SOLL-Bilder der Startseite und der drei Fehlerseiten neu (`e92192b`), vom Design Reviewer auf PRO-28027 um 02:06 abgenommen, danach erster Bildschirm der Startseite mit `No crypto needed` in der `<h1>` (bei Notschalter an der erste Bildschirm von wache 01 über `<!--NOCARD-->` und `keepNoCardWay`), Zeile unter der Überschrift jeder Fehlerseite, 402 mit Karte als zweitem Satz und `message_for_operator`, Block für Agenten oben in `/llms.txt`, erster Absatz des README, `docs/kanal/antwort-vorlage.md`, 16 Zeilen in `goals/werbung/ANNAHMEN.md`; `test/og-card.test.ts` vergleicht nach Entscheidung des Tech Leads (PRO-28027, 02:23) die Karte mit Pill und erstem Satz der `<h1>`. Rot gesehen: `test/werbung.test.ts` gegen die Merge-Basis 13 von 19 rot, die sechs Wächter („shows the first screen of wache 01…“, „leaves the card block…“, „drops … while the card breaker is on“ dreimal, „keeps error, required_cents…“) sind dort grün und je mit einer gepflanzten Änderung am gebauten Stand rot; `test/og-card.test.ts` mit anderem Pill rot. Prüfbefehle: P1 `exit=0 0 defects`, `soll start ok`, `breiten ok`, `card gleich`, 1; P2 `exit=0 soll errors: 6 images, blocks end 390=728 1440=669, 0 defects`, `soll errors ok`, `breiten ok`, 0, 0; P3 1, `abnahme ok 1`; P4 vitest werbung grün, Namen vollständig, `start ok`, Live `exit=0 0 defects`, Gegenprobe `exit=1` ohne `sed-miss`, `skript gleich`, `card gleich`, sieben Suiten grün; P5 Namen vollständig, `errors ok`, Live `exit=0 0 defects`, Gegenprobe `exit=1` ohne `sed-miss`, vier Suiten grün; P6 `readme ok`, 0; P7 Namen vollständig, sechs Suiten grün, 1, 0, 0, e2e am Kopf `bc324b6` pass (1); P8 `vorlage ok`, `da`, 0; P9 Namen vollständig, 1, zwei Suiten grün; P10 Namen vollständig, drei Suiten grün; P11 0, 16, 0, 0, 0, 0; P12 `node scripts/check.mjs` auf dem GitHub-Rechner am Kopf `bc324b6` grün (3:02 min), lokal zweimal nach 600 s abgebrochen ohne roten Test, Last 199 bis 252 auf dem code-host.
- 2026-11-23 Zyklus 2: Abschluss gemeldet, Punkte 1 bis 12; `dev` ohne neue Commits seit der Merge-Basis `e423d4d`, nichts zu mergen. Prüfbefehle: alle 47 Befehle der Punkte 1 bis 12 am Kopf `a5761dd` mit erwarteter Ausgabe (P1 `exit=0 0 defects`, `soll start ok`, `breiten ok`, `card gleich`, 1; P2 `exit=0 soll errors: 6 images, blocks end 390=728 1440=669, 0 defects`, `soll errors ok`, `breiten ok`, 0, 0; P3 1, `abnahme ok 1`; P4 sieben Befehle grün, Gegenprobe `exit=1` ohne `sed-miss`; P5 fünf Befehle grün, Gegenprobe `exit=1` ohne `sed-miss`; P6 `readme ok`, 0; P7 Namen vollständig, sechs Suiten grün, 1, 0, 0, e2e pass (1); P8 `vorlage ok`, `da`, 0; P9 und P10 Namen vollständig und Suiten grün; P11 0, 17, 0, 0, 0, 0); P12 `check` auf GitHub am Kopf `a5761dd` grün (2:51 min, `e2e` 11:01 min grün), lokal bei Last 130 bis 370 auf 26 Kernen zweimal rot: Lauf 1 mit drei Fällen in `test/relink-comments.test.ts` und `test/traffic-hosts.test.ts` (Skripte außerhalb des Diffs, Unterprozess in der Zeitgrenze, beide Dateien allein 28 von 28 grün), Lauf 2 mit 264 von 264 Testdateien grün, aber nach 606 s an der Grenze `LIMIT_S` von 600 s in `scripts/check.mjs`.

## Blockers
keine
