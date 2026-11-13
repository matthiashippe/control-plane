# Konto Goal 02: Der Handoff zum Handy

## Status
PLANNED

## Active Objective
Wer im Terminal einen Automaton startet und keine Wallet hat, gibt den einen Schritt, den nur er freigeben darf, auf seinem Handy
frei: Das Terminal ruft `POST /v1/handoff` und zeigt Kurzlink, QR-Code als Text und eine zweistellige Zahl, das Handy öffnet
`/h/{code}`, sieht, was freigegeben wird (Name des Automatons, Tageslimit, Betrag), wählt aus drei Zahlen die aus dem Terminal, und
das Terminal erfährt über `GET /v1/handoff/{code}` als SSE, dass der Schritt erledigt ist. Zuerst entstehen die SOLL-Bilder der
Handy-Seite unter `docs/soll/` (390 und 1440 px) mit Abnahme durch den Design Reviewer, erst danach wird die Seite gebaut, 1:1 nach
den Bildern. Jeder Code gilt zehn Minuten und genau einmal, eine falsche Zahl verbrennt ihn, den Ausgang sieht nur das Terminal, das
ihn angelegt hat. Der Schritt hinter der Freigabe ist hier ein Platzhalter, der nur bestätigt; das Konto per Passkey baut konto 03
darauf (`ROADMAP.md`, konto 02; Grundsatz in `docs/kette.md`, Abschnitt konto). Widerlegt, wenn ein Code aus einer fremden Sitzung
ohne passenden Zahlenabgleich etwas freigibt.
MVP: Funktion, weil konto 03 (Konto per Passkey), konto 04 (`start_automaton` im Terminal) und konto 05 (Auszahlung) jeden Schritt,
den nur der Mensch freigeben darf, über genau diesen Weg aufs Handy schicken, und ohne ihn kein Mensch ohne Wallet einen Automaton
bei uns startet.

## Voraussetzungen
- konto Goal 01 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Mensch, der in Claude Code einen Automaton starten will, gibt den Schritt in unter einer Minute auf seinem
  Handy frei, ohne das Terminal sonst zu verlassen, und niemand, der nur den QR-Code oder den Link sieht, kann das für ihn tun.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte): zuerst Punkte 1 und 2 (SOLL-Bilder und ihre Prüfung), Commit,
  Push, dann den Design Reviewer auf dem Topic dieses Goals erwähnen, mit allen sechs Bildpfaden und dem Commit, und die Zeile
  `Abnahme-Issue handoff: PRO-<n>` in `docs/soll/README.md` setzen. Die bestehende Zeile `Abnahme-Issue: PRO-18819` der Startseite
  bleibt, wie sie ist. Bis „SOLL abgenommen“ dasteht, baut der Maker an der Seite nichts: Das Child geht auf `blocked` mit dem Design
  Reviewer als Owner, sein Kommentar weckt den Maker. Die Abnahme reicht, einen Look bei Matthias gibt es in diesem Loop nicht. Ändern
  sich Bilder nach der Abnahme, braucht es eine neue. Punkt 3 prüft die Reihenfolge an den Zeitstempeln (`LOOP.md`, Fläche nur nach
  SOLL-Bild; TEAM.md „Kein UI-Bau ohne Bild“).
- Die Fläche ist eine, in drei Zuständen: `freigabe` (was freigegeben wird, drei Zahlen als Knöpfe in einem `<form method="post">`,
  der ganze Block `data-soll="freigabe"` im ersten Bildschirm, 844 px bei 390 und 900 px bei 1440), `erledigt` (bestätigt, zurück ins
  Terminal) und `ungueltig` (abgelaufen, schon benutzt, falsche Zahl oder unbekannt; das Bild zeigt den abgelaufenen Code, die anderen
  Gründe tauschen nur eine Zeile Text). Quellen `docs/soll/src/handoff-<zustand>.html`, Bilder `docs/soll/handoff-<zustand>-<breite>.png`,
  sechs Stück. Beispielwerte im Bild sind erfunden (Name `Atlas`, Tageslimit und Betrag 5.00 USD), keine Kundendaten
  (`loop-constraints.md`, Grundregel 8).
- Werkzeug: ein eigenes `ops/soll-handoff.mjs` (rendern und `--pruefen`, `--source <ordner>` mit den drei Quellen), das die reine
  Auswertung aus `ops/soll-assess.mjs` nutzt und, wo nötig, erweitert. `ops/soll.mjs`, `ops/soll-live.mjs`, `test/soll.test.ts` und die
  Bilder der Startseite bleiben unverändert, weil das Audit die eingefrorenen Prüfbefehle von seite 01 und 02 nachts fährt
  (`ops/soll-live.mjs` darf nach seite 02 Punkt 2 keine Zeichenfolge `data-soll` oder `docs/soll` enthalten). Mängel wie bei der
  Startseite (Pixel über der Kanaltoleranz, waagrechter Überlauf, Gedankenstrich, Anfrage an eine fremde Adresse) und dazu: Block
  `freigabe` endet unter dem ersten Bildschirm, und ein Wort, das der Nutzer erst übersetzen muss (`handoff`, `phishing`, `token`,
  `SSE`), steht im sichtbaren Text (TEAM.md „Klare Wörter“). Gerendert wird ohne Netz mit dem Chromium aus `~/.cache/ms-playwright/`
  wie in `ops/soll.mjs`; `test/soll-handoff.test.ts` prüft die Auswertung ohne Browser, damit `check` auf den GitHub-Rechnern grün
  bleibt.
- Bausteine: Die Quellen nutzen Klassen aus dem `<style>` von `src/public/index.html`, höchstens drei neue, jede mit Grund als
  `` `.<klasse>` `` unter einem Abschnitt `## Handoff /h/{code}` in `docs/soll/README.md`. Kein Skript auf der Seite, keine Schrift,
  kein Bild und kein Stil eines fremden Dienstes: Die Freigabe ist ein Formular, das ohne JavaScript funktioniert.
- Text: Englisch wie die Startseite, die Tools und die API; die Leser kommen aus Claude Code. Vom Ziel her (Skill `loop-regeln`,
  Abschnitt Vom Ziel her): Die Überschrift der Freigabe sagt, was passiert, wenn man tippt (etwa „Allow Atlas to spend up to $5.00 a
  day?“), darunter in einer Zeile, wo die richtige Zahl steht („Tap the number shown in your terminal“). Kein Wort, das der Nutzer
  erst übersetzen muss. Die Überschrift jedes Zustands steht in `src/public/handoff.ts` als `<h1>` ohne Attribut, weil Punkt 4 sie zur Gegenprobe ändert.
- Entscheidungen des Tech Lead (Maker schreibt sie mit Grund unter `## Goal 02` in `goals/konto/ANNAHMEN.md`):
  1. `POST /v1/handoff` braucht keinen Schlüssel, weil das Konto erst in konto 03 über genau diesen Weg entsteht. Der Pfad kommt in
     `V1_ROUTES`, `V1_KEYLESS` und die Liste der offenen Pfade mit Rate Limit in `src/app.ts`; konto 03 entscheidet, welche Schritte
     einen Schlüssel verlangen.
  2. Neben dem öffentlichen `code` (im QR und im Link) gibt die Antwort ein geheimes `poll_token` zurück, das nur das Terminal kennt.
     `GET /v1/handoff/{code}` antwortet nur mit `Authorization: Bearer <poll_token>`, sonst 401 ohne Zustand, weil konto 03 dort
     den Ausgang der Kontoanlage meldet und wer den QR-Code auf dem Bildschirm sieht, ihn sonst mitlesen könnte. Gespeichert wird nur
     der Hash des Tokens (`hashApiKey` aus `src/auth/siwe.ts` darf importiert werden, `src/auth/**` ändert sich nicht).
  3. Weil die Middleware unter `/v1` nur exakte Pfade kennt, kommt `/v1/handoff/*` mit Grund in `ERLAUBTE_WILDCARDS` von
     `test/v1-ohne-variables-segment.test.ts` und prüft das Token im eigenen Handler, wie `/v1/sandboxes/*`.
  4. `code`: mindestens 50 Bit aus `crypto.randomBytes` in Crockford-Base32 (mindestens 10 Zeichen); Kurzlink
     `<siteOrigin()>/h/<code>`. `match`: zweistellig, 10 bis 99; die zwei Lockzahlen sind andere zweistellige Zahlen, die Position der
     richtigen auf der Seite ist zufällig. Eine falsche Wahl verbrennt den Code sofort, weil sonst drei Versuche immer treffen.
  5. Beträge als ganze Zahl in atomaren USDC als String (`daily_limit_usdc`, `amount_usdc`, 6 Dezimalen, `LOOP.md`, Technik), nur
     ganze Cent (Vielfaches von 10000), sonst 400; angezeigt als `$5.00`, gerechnet mit bigint, nie float. `automaton_name` 1 bis 64
     Zeichen, auf der Seite HTML-escaped.
  6. Die Antwort trägt den QR-Code als Text fürs Terminal (`qr`, Halbblöcke mit Ruhezone). Ein Paket aus der Registry zum Erzeugen ist
     erlaubt, eines nur als devDependency zum Zurücklesen im Test; mehr nicht (Punkt 10). Ein Desktop-Browser ohne Passkey nutzt
     dieselbe Antwort; eine eigene Desktop-Seite baut erst das Goal, das sie braucht.
  7. `/h/{code}` antwortet mit `Cache-Control: no-store`, `Referrer-Policy: no-referrer` und `noindex` und steht nicht in der Sitemap;
     kennt ein Test der Seiten eine Ausnahmeliste, kommt der Pfad dort mit Grund hinein.
- Funktionen mit festen Namen für die Gegenproben in Punkt 5 und 6 (jede exportiert aus einer Datei unter `src/handoff/`, und der Weg
  über HTTP ruft genau sie): `pickMatches` (stimmt die gewählte Zahl), `pollTokenMatches` (stimmt das Token des Terminals),
  `isExpired` (ist der Code älter als zehn Minuten). Die Uhr kommt aus `now` der `AppOptions`, damit Tests ohne Warten ablaufen.
- Der SSE-Strom sendet sofort ein Ereignis `state` mit `pending` oder dem Endzustand, danach jeden Wechsel und endet mit `done`,
  `burned` oder `expired`; ein Kommentar alle 15 Sekunden hält die Verbindung über Caddy offen. Ein Prozess, eine SQLite-Datei: Ein
  Abfragetakt mit einstellbarem Intervall reicht.
- `ops/live.sh` bekommt eine Prüfung `handoff` nach dem Muster der vorhandenen (Richterfunktion, gepflanzte Fälle im Selbsttest in
  beide Richtungen, ein Aufruf im Live-Modus): `POST /v1/handoff` mit Beispielwerten, `GET /h/{code}` zeigt die drei Zahlen mit
  `match` darunter, der Strom mit Token liefert binnen fünf Sekunden `pending`; sie gibt nichts frei, der Code läuft nach zehn Minuten
  ab. Temporäre Dateien in einem Verzeichnis aus `mktemp -d`, das ein `trap` löscht.
- Der Vorschlag `goals/_vorschlaege/konto-kritik-2026-11-13-1.md` gehört zu konto 03 und nicht vor dieses Goal, weil konto 02 weder
  Turnkey noch die Chain berührt: Der Schritt hinter der Freigabe ist ein Platzhalter.
- Kein Konto, kein Passkey, kein Turnkey, keine Abbuchungserlaubnis, nichts on-chain, auch nicht auf Base Sepolia; das ist konto 03.
- Prüfbefehle ohne Netz binden keinen festen Port (`app.request`, kein `serve`), Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Jeder neue Test war einmal rot, die Zeile
  im Progress Log sagt, womit.
- Was danach schneller zu mehr zahlenden Kunden führt: Mit dem Handoff baut konto 03 die Kontoanlage per Passkey auf dem Handy und
  konto 04 `start_automaton` im Terminal; zusammen mit sandbox 07 startet dann ein Mensch aus Claude Code heraus einen Automaton, ohne
  je eine Wallet zu besitzen, und genau an der Wallet blieben bis 23.09.2026 alle 43 Besucher hängen (`src/auth/keyless.ts`).

## Done Condition
- [ ] Die sechs SOLL-Bilder der Handy-Seite kommen aus ihren Quellen, ohne Netz und ohne Mangel, die Freigabe steht ganz im ersten
      Bildschirm, und die Quellen bauen aus den Bausteinen der Seite.
      MVP: Funktion, weil die Seite nur nach Bild gebaut werden darf und ein Mensch die Freigabe ohne Scrollen sehen muss.
      Prüfung: `node ops/soll-handoff.mjs --pruefen` muss Exit 0 haben und als letzte Zeile `soll handoff: 6 Bilder, freigabe oben 390=<y> 1440=<y>, 0 Mängel` ausgeben, mit y bei 390 höchstens 844 und bei 1440 höchstens 900.
      Prüfung: `node -e 'const fs=require("fs");for(const z of ["freigabe","erledigt","ungueltig"])for(const w of [390,1440]){const b=fs.readFileSync("docs/soll/handoff-"+z+"-"+w+".png");if(b.readUInt32BE(16)!==w){console.error(z,w);process.exit(1)}}console.log("breiten ok")'` muss `breiten ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const bad=[];for(const z of ["freigabe","erledigt","ungueltig"]){const s=fs.readFileSync("docs/soll/src/handoff-"+z+".html","utf8");const t=s.replace(/<style[\s\S]*?<\/style>/g,"").replace(/<[^>]+>/g," ");if(/<script/i.test(s))bad.push(z+" script");if(!/<h1[ >]/.test(s))bad.push(z+" h1");if(/(src|srcset)="(https?:)?\/\/|<link[^>]+href="(https?:)?\/\/|url\(["\x27]?(https?:)?\/\//.test(s))bad.push(z+" fremde adresse");if(/[\u2013\u2014]/.test(s))bad.push(z+" gedankenstrich");if(/handoff|phishing|token|\bsse\b/i.test(t))bad.push(z+" wort")}const f=fs.readFileSync("docs/soll/src/handoff-freigabe.html","utf8");const u=f.indexOf("data-soll=\"freigabe\"");const blk=u<0?"":f.slice(u);const v=[...blk.matchAll(/<button[^>]*value="([0-9]+)"/g)].map(m=>m[1]);if(u<0)bad.push("freigabe fehlt");if(!/<form[^>]+method="post"/i.test(blk))bad.push("form");if(v.length!==3||new Set(v).size!==3||!v.every(x=>/^[1-9][0-9]$/.test(x)))bad.push("drei zahlen "+v);if(!/Atlas/.test(blk)||!/\$[0-9]+\.[0-9]{2}/.test(blk))bad.push("was freigegeben wird");if(bad.length){console.error(bad);process.exit(1)}console.log("quellen ok")'` muss `quellen ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const css=(fs.readFileSync("src/public/index.html","utf8").match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join("");const cl=new Set();for(const z of ["freigabe","erledigt","ungueltig"]){const s=fs.readFileSync("docs/soll/src/handoff-"+z+".html","utf8");for(const m of s.matchAll(/class="([^"]+)"/g))for(const c of m[1].split(/\s+/))if(c)cl.add(c)}const neu=[...cl].filter(c=>!new RegExp("\\."+c.replace(/[.*+?^${}()|[\]\\-]/g,"\\$&")+"(?![\\w-])").test(css));const r=fs.readFileSync("docs/soll/README.md","utf8");const ohne=neu.filter(c=>!r.includes("`."+c+"`"));if(neu.length>3||ohne.length||!/^## Handoff \/h\/\{code\}$/m.test(r)){console.error({neu,ohne});process.exit(1)}console.log("bausteine ok neu="+neu.length)'` muss `bausteine ok neu=<n>` mit n höchstens 3 ausgeben.
- [ ] Die Auswertung der Handy-Bilder lehnt jeden Mangel ab und lässt den sauberen Stand durch, und die Startseite prüft sich weiter
      wie vorher.
      MVP: Funktion, weil ein Bild, das seine Prüfung nicht in beide Richtungen besteht, kein SOLL ist.
      Prüfung: `pnpm -s vitest run test/soll-handoff.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/soll-handoff.test.ts` muss mindestens 7 ausgeben (je ein Fall für Pixelabweichung, Überlauf, Gedankenstrich, fremde Adresse, Freigabe unter dem ersten Bildschirm, Wort aus der Sperrliste im sichtbaren Text, sauberer Stand ohne Mangel).
      Prüfung: `git diff --quiet origin/dev...HEAD -- ops/soll.mjs ops/soll-live.mjs test/soll.test.ts docs/soll/startseite-390.png docs/soll/startseite-1440.png docs/soll/src/startseite.html && echo startseite gleich` muss `startseite gleich` ausgeben.
      Prüfung: `node ops/soll.mjs --pruefen` muss Exit 0 haben und als letzte Zeile `soll: 2 Bilder, umzug oben 390=<y> 1440=<y>, 0 Mängel` ausgeben, und `pnpm -s vitest run test/soll.test.ts` muss Exit-Code 0 haben.
- [ ] Der Design Reviewer hat genau diese Bilder abgenommen, bevor die Seite gebaut wurde.
      MVP: Funktion, weil die Seite 1:1 nach einem abgenommenen Bild entsteht und nicht nach einer Beschreibung.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue handoff: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- 'docs/soll/handoff-*.png' 'docs/soll/src/handoff-*.html'); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/handoff src/public/handoff.ts | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok)<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [ ] Die echte Seite in allen drei Zuständen ist pixelgleich mit den abgenommenen Bildern, und eine geänderte Überschrift fällt dabei
      auf.
      MVP: Funktion, weil der Mensch auf dem Handy sehen muss, was das Bild verspricht.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-handoff.mjs --out $T && node ops/soll-handoff.mjs --pruefen --source $T` muss Exit 0 haben und als letzte Zeile `soll handoff: 6 Bilder, freigabe oben 390=<y> 1440=<y>, 0 Mängel` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i '0,/<h1>/s/<h1>/<h1>X /' $T/src/public/handoff.ts; grep -q '<h1>X ' $T/src/public/handoff.ts || echo sed-miss; (cd $T && node --import tsx ops/soll-live-handoff.mjs --out $T/out); node ops/soll-handoff.mjs --pruefen --source $T/out; echo "exit=$?"` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `{ grep -cE '</?(html|head|body|main|section|div|form|button|h1|h2|p|span|style|meta|link|br)[ >/]|data-soll|docs/soll' ops/soll-live-handoff.mjs || true; }` muss `0` ausgeben (das Skript kürzt die Seite um nichts und trägt kein Markup).
- [ ] `POST /v1/handoff` legt einen Handoff an und antwortet mit Code, Kurzlink, QR-Code als Text, Zahl, Ablaufzeit und Token des
      Terminals; der QR-Code liest sich zurück als genau der Kurzlink.
      MVP: Funktion, weil das Terminal (konto 04) aus dieser Antwort alles zeigt, was der Mensch braucht.
      Prüfung: `pnpm -s vitest run test/handoff-api.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/handoff-api.test.ts` muss mindestens 7 ausgeben (je ein Fall: 201 mit `code` aus mindestens 10 Zeichen Crockford-Base32, `url` gleich `<siteOrigin()>/h/<code>`, `match` von 10 bis 99, `expires_at` genau 600 s nach `now`, `poll_token` aus mindestens 32 Zeichen; der Text in `qr` liest sich mit einem unabhängigen Decoder als `url` zurück; in der Datenbank steht das Token nur als Hash; 400 für leeren und für 65 Zeichen langen Namen; 400 für Beträge, die keine ganzen Cent sind oder keine ganze Zahl; zwei Handoffs bekommen verschiedene Codes und Tokens; mehr Anlagen von einer Adresse als das Rate Limit erlaubt ergeben 429).
- [ ] Die Seite `/h/{code}` zeigt, was freigegeben wird, und gibt nur mit der richtigen Zahl frei, genau einmal und nur zehn Minuten
      lang; die Gegenproben `pickMatches` und `isExpired` machen die Tests rot.
      MVP: Funktion, weil ein Code aus einer fremden Sitzung ohne passende Zahl nichts freigeben darf (Widerlegung dieses Goals).
      Prüfung: `pnpm -s vitest run test/handoff-page.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/handoff-page.test.ts` muss mindestens 10 ausgeben (je ein Fall: die Seite zeigt Name, Tageslimit und Betrag als `$5.00` und genau drei verschiedene zweistellige Zahlen, darunter `match`; ein Name mit `<script>` erscheint escaped; über 300 Handoffs steht `match` an jeder der drei Stellen mindestens 50 Mal; richtige Zahl ergibt den Zustand `done` und die Seite `erledigt`; falsche Zahl ergibt `burned` und die Seite `ungueltig`, und die richtige Zahl danach gibt nichts mehr frei; ein Code aus einer fremden Sitzung mit der Zahl des eigenen Terminals gibt nichts frei; zweite Freigabe nach `done` ergibt `ungueltig`; nach 601 s ergeben Aufruf und Freigabe `ungueltig` und den Zustand `expired`; ein unbekannter Code ergibt 404 mit der Seite `ungueltig`; die Antwort trägt `Cache-Control: no-store`, `Referrer-Policy: no-referrer` und `noindex`; mehr unbekannte Codes von einer Adresse als das Rate Limit erlaubt ergeben 429).
      Prüfung: `for m in pickMatches isExpired; do T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$(grep -lE "export function $m\(" $T/src/handoff/*.ts | head -1); [ -n "$f" ] || { echo "fehlt $m"; continue; }; r=true; [ $m = isExpired ] && r=false; sed -i "s/export function $m(/function ${m}Orig(/" $f; echo "export function $m(..._a: unknown[]): boolean { return $r; }" >> $f; (cd $T && pnpm -s vitest run test/handoff-page.test.ts >/dev/null 2>&1) && echo "gruen trotz $m"; done` muss nichts ausgeben.
- [ ] `GET /v1/handoff/{code}` meldet den Ausgang als SSE nur dem Terminal, das den Code angelegt hat; die Gegenprobe
      `pollTokenMatches` macht die Tests rot.
      MVP: Funktion, weil konto 03 hier das Ergebnis der Kontoanlage meldet und das nur das Terminal des Kunden lesen darf.
      Prüfung: `pnpm -s vitest run test/handoff-events.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/handoff-events.test.ts` muss mindestens 6 ausgeben (je ein Fall: mit Token `text/event-stream` und als erstes Ereignis `state` mit `pending`; nach der Freigabe `done` und der Strom endet; nach falscher Zahl `burned`; nach Ablauf `expired`; ohne Token und mit dem Token eines anderen Handoffs 401 ohne Zustand im Körper; unbekannter Code 404).
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$(grep -lE "export function pollTokenMatches\(" $T/src/handoff/*.ts | head -1); if [ -z "$f" ]; then echo "fehlt pollTokenMatches"; else sed -i "s/export function pollTokenMatches(/function pollTokenMatchesOrig(/" $f; echo "export function pollTokenMatches(..._a: unknown[]): boolean { return true; }" >> $f; (cd $T && pnpm -s vitest run test/handoff-events.test.ts >/dev/null 2>&1) && echo "gruen trotz pollTokenMatches"; fi` muss nichts ausgeben.
      Prüfung: `pnpm -s vitest run test/v1-ohne-variables-segment.test.ts test/messages.test.ts` muss Exit-Code 0 haben.
- [ ] Die Live-Prüfung legt nach jedem Rollout einen Handoff an und liest Seite und Strom, ohne etwas freizugeben, in beide
      Richtungen bewiesen.
      MVP: Funktion, weil der Release Manager nach dem Rollout belegen muss, dass der Weg aufs Handy in der Produktion antwortet.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `LIVE SELFTEST OK` ausgeben.
      Prüfung: `bash ops/live.sh --selftest | grep -E '^planted handoff ' | grep -c ': OK handoff'` muss `1` ausgeben, und `bash ops/live.sh --selftest | grep -E '^planted handoff ' | grep -c ': FAIL handoff'` muss mindestens `3` ausgeben (404, Antwort ohne `match`, Strom ohne `pending`).
- [ ] Der Vertrag des Handoffs steht für konto 03 und 04 fest, und die Entscheidungen stehen mit Grund in `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil konto 03 den Platzhalter ersetzt und konto 04 die Tools gegen diesen Vertrag baut.
      Prüfung: `for w in automaton_name daily_limit_usdc amount_usdc code url qr match expires_at poll_token pending done burned expired 401 404 429; do grep -qw -- "$w" docs/konto/handoff.md || echo "fehlt $w"; done; for h in "## Anfrage" "## Antwort" "## Zustände" "## Für konto 03 und 04"; do grep -qx -- "$h" docs/konto/handoff.md || echo "fehlt $h"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Goal 02/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens 7 ausgeben.
- [ ] Der Diff bleibt in den Pfaden dieses Goals, kein Test wird schwächer, höchstens ein neues Paket je Art, kein Schlüssel im Diff,
      und `check` und `e2e` sind grün.
      MVP: Funktion, weil der Merge über `deploy.yml` ausrollt und zahlende Kunden den Stand tragen.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/app\.ts|src/db\.ts|src/handoff/[A-Za-z0-9._-]+\.ts|src/public/handoff\.ts|src/public/openapi\.ts|test/[A-Za-z0-9._-]+\.ts|ops/soll-handoff\.mjs|ops/soll-live-handoff\.mjs|ops/soll-assess\.mjs|ops/live\.sh|docs/soll/handoff-(freigabe|erledigt|ungueltig)-(390|1440)\.png|docs/soll/src/handoff-(freigabe|erledigt|ungueltig)\.html|docs/soll/README\.md|docs/konto/handoff\.md|package\.json|pnpm-lock\.yaml|goals/konto/(verdicts/)?[A-Za-z0-9._-]+\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `T=$(mktemp -d); git show origin/dev:package.json > $T/p.json; node -e 'const a=require(process.argv[1]),b=require("./package.json");const n=k=>Object.keys(b[k]||{}).filter(x=>!(x in (a[k]||{})));const d=n("dependencies"),v=n("devDependencies");if(d.length>1||v.length>1){console.error(d,v);process.exit(1)}console.log("pakete ok "+d.length+" "+v.length)' $T/p.json` muss `pakete ok <d> <v>` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-02 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="e2e" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Mensch sieht auf dem Handy ohne Scrollen, was er freigibt, und tippt die Zahl aus seinem Terminal; mehr muss er nicht tun.
- [ ] Wer nur den QR-Code oder den Link hat, kann weder freigeben noch den Ausgang lesen; ein geratener Code, ein alter Code und eine
      falsche Zahl geben nichts frei.
- [ ] Die Seite sieht aus wie das abgenommene Bild: gleiche Schrift, gleiche Farben, gleiche Bausteine wie die Startseite.
- [ ] Kein Gedankenstrich, kein Name und keine Wallet-Adresse eines Kunden, kein Wort, das der Nutzer erst übersetzen muss.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- `src/auth/**` und `src/payments/**`: dieses Goal nennt sie nicht zum Ändern; `hashApiKey` darf importiert werden
- `ops/soll.mjs`, `ops/soll-live.mjs`, `test/soll.test.ts`, die Bilder und die Quelle der Startseite unter `docs/soll/`
- `ROADMAP.md`, `docs/kette.md`, `docs/konto/anbieter.md` und alle Goal-Dateien außer dieser
- Konto, Passkey, Turnkey, Abbuchungserlaubnis, jede Transaktion auf einer Chain, auch auf Base Sepolia (konto 03); Kauf, Aufladung,
  Wallet-Bewegung (`loop-constraints.md`, Grundregeln 9 und 10)
- kein Aufruf einer fremden Adresse beim Rendern, keine Schrift, kein Bild, kein Stil und kein Skript eines fremden Dienstes auf der Seite
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
keine
