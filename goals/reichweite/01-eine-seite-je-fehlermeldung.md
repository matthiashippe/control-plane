# Reichweite Goal 01: Eine Seite je Fehlermeldung

## Status
DONE

## Active Objective
Wer bei Conway hängen bleibt, sucht nach dem genauen Text, den sein Automaton ausgibt, und findet heute höchstens `/fix`, dessen
Titel zwei der Fehler in einer Zeile nennt. Nach diesem Goal hat automatonhost.com je Fehler eine eigene Seite
`/errors/<slug>` für die drei häufigsten Fehler aus den Conway-Issues: `/v1/auth/verify` antwortet 500 `Database error`, 401
`Invalid or expired nonce`, Aufladung bezahlt und kein Guthaben. Jede Seite trägt den genauen Fehlertext als Überschrift und im
Titel, sagt in zwei Sätzen, was bei Conway kaputt ist, und zeigt die eine Zeile `conwayApiUrl` mit `automaton --provision` im ersten
Bildschirm. Die Startseite verlinkt die drei Seiten in ihrer Fußzeile, `sitemap.xml` nennt sie, und ein Messwerkzeug zählt die
Ankünfte auf `/errors/` je Woche nach Herkunft. Gebaut wird 1:1 nach SOLL-Bildern (390 und 1440 px), die der Design Reviewer vor
dem Bau abnimmt (`ROADMAP.md`, reichweite 01).
Leitzahl: Ankünfte über Suchmaschinen auf `/errors/` je Woche (`ops/error-pages-arrivals.mjs`, Feld `search`).
Widerlegt, wenn vier Wochen nach dem Rollout keine einzige Ankunft über eine Suchmaschine auf `/errors/` kommt; dann prüft der
Kurs-Check, ob die Seiten im Index stehen, bevor weitere Fehlerseiten entstehen.
MVP: Funktion, weil Betroffene nach genau diesem Text suchen und reichweite 02 unsere Kommentare in den Conway-Issues auf diese
Seiten umlenkt.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel in einem Satz: Ein Betreiber, der den Fehlertext seines Automatons in eine Suchmaschine tippt, landet auf einer Seite, die
  genau diesen Text als Überschrift trägt, und sieht ohne Scrollen die eine Zeile, mit der sein Automaton bei uns weiterläuft.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: reichweite 02 lässt jeden unserer 30 Kommentare in den
  Conway-Issues auf die Seite zum Fehler des Issues zeigen statt auf die Startseite, und jede Seite ist ein eigener Treffer für die
  Suche nach dem Fehlertext. Quelle: `ROADMAP.md`, Topic `reichweite`, Glied 01; Hintergrund in
  `docs/research/2026-11-22-conway-marketing.md`, Abschnitt „Übertragbar auf uns“, Punkt 2.
- **Bestand und Entscheidungen des Tech Lead (22.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile
  `- 2026-11-22, reichweite 01: …` in `goals/reichweite/ANNAHMEN.md` (neu).
  1. `/fix` (`src/public/fix.ts`) ist die ausführliche Anleitung und bleibt unverändert, auch im Aussehen, weil es für `/fix` kein
     SOLL-Bild gibt. Die Fehlerseiten sind keine zweite Anleitung, sondern je ein Einstieg für eine Suche: Überschrift, zwei Sätze,
     die eine Zeile, ein Link auf `/fix` für jeden weiteren Schritt. Kein neues Zustandsmodell, keine neue Datenquelle.
  2. Gerendert wird mit dem Rahmen, den `/fix` und `/check` nutzen (`page()` in `src/app.ts`, mit Kopf, Fußzeile, Titel,
     Beschreibung und Pfad), die Inhalte stehen in einer neuen Datei `src/public/error-pages.ts` (nicht `errors.ts`, den Namen trägt
     schon `src/errors.ts` für Fehlerantworten der API) als Liste `ERROR_PAGES` mit `slug`, `heading`, `title`, `description` und
     `cause`, und die Route `app.get("/errors/:slug")` rendert daraus. Ein unbekannter Slug antwortet 404 mit dem Rahmen der Seite.
  3. Die drei Seiten, Überschrift Zeichen für Zeichen so (der Text der Conway-Issues #408, #419, #440, #432 und #427, nach dem
     Betroffene suchen):

     | slug | Überschrift (`heading`) |
     |---|---|
     | `verify-500-database-error` | `/v1/auth/verify returns 500 {"error":"Database error"}` |
     | `invalid-or-expired-nonce` | `/v1/auth/verify returns 401 {"error":"Invalid or expired nonce"}` |
     | `credits-never-granted` | `x402 top-up paid on-chain, but credits never granted` |

     Der Titel (`<title>`) ist `Conway automaton: <Überschrift> | automatonhost.com`, die Beschreibung ein Satz zur Ursache und
     ein Satz zur einen Zeile. Die Ursache in zwei Sätzen nimmt nur, was `/fix` schon belegt (Anmeldung neuer Wallets bei
     api.conway.tech scheitert seit Juli 2026, Issue #339; die 401 sagt „nonce“, obwohl die Nonce nicht abgelaufen ist; der
     Zahlungsweg nimmt weiter USDC an, das Guthaben kommt nie an, und die Runtime kauft nach). Keine Zahl ohne Messung
     (`loop-constraints.md`, Grundregel 3), kein Name und keine Adresse eines Kunden.
  4. Der Block `data-soll="fix"` jeder Seite enthält Überschrift, Ursache, die Zeile wie im Block `move` der Startseite
     (`~/.automaton/automaton.json`, `{ "conwayApiUrl": "https://automatonhost.com" }`, `automaton --provision`) und den Link auf
     `/fix`, und er endet im ersten Bildschirm (844 px bei 390, 900 px bei 1440). Darunter eine Zeile im Stil `.fine`:
     automatonhost.com ist ein eigener Dienst, der mit der unveränderten Conway-Automaton-Runtime arbeitet, damit niemand eine
     Verbindung zu Conway annimmt. Englisch, wie `/fix` und die Leser aus den Conway-Issues; einen deutschen ersten Bildschirm gibt
     es für diese Seiten nicht.
  5. Die Startseite verlinkt die drei Seiten in der Fußzeile (Block `data-soll="errors"` in der SOLL-Quelle), nicht im Block `move`:
     Der erste Bildschirm bleibt, wie er abgenommen ist, und der Link ist für Suchmaschinen ein Verweis von der stärksten Seite. Die
     Linktexte sind die Fehler in kurz (etwa „verify 500 Database error“, „Invalid or expired nonce“, „Credits never granted“), die
     Zeile davor sagt, was dahinter steht (etwa „Conway errors and how to keep running:“); das Bild entscheidet, der Design Reviewer
     nimmt es ab.
  6. Die Leitzahl misst ein eigenes Werkzeug `ops/error-pages-arrivals.mjs` statt einer Erweiterung von `ops/traffic.sh`, weil dessen
     Selbsttest die Sitemap aus dem Netz liest und das Werkzeug 1500 Zeilen hat; `ops/traffic.sh` bleibt unverändert.
- **SOLL zuerst (Punkte 1 bis 3).** Quellen `docs/soll/src/errors-<slug>.html` (drei), Bilder `docs/soll/errors-<slug>-<breite>.png`
  (sechs), gebaut aus den Klassen von `src/public/index.html` wie die Quelle der Startseite, höchstens drei neue Klassen, jede mit
  Grund als `` `.<klasse>` `` unter einem neuen Abschnitt `## Fehlerseiten /errors/{slug} (goals/reichweite/01)` in
  `docs/soll/README.md`. Dazu die Startseite: `docs/soll/src/startseite.html` bekommt den Block `errors` in der Fußzeile,
  `node ops/soll.mjs` schreibt `startseite-390.png` und `startseite-1440.png` neu; der Abschnitt `#move` der Quelle bleibt Zeichen
  für Zeichen. Werkzeug `ops/soll-errors.mjs` nach dem Muster von `ops/soll-money.mjs` (Browser über `ops/browser.mjs`, Art
  `picture`, ohne Netz, ohne Port): ohne Argument Bilder schreiben, `--check` neu rendern und vergleichen, `--source <ordner>`
  gegen drei Quellen `errors-<slug>.html` in einem Ordner, jedes andere Argument Exit 1 vor dem Browser. Letzte Zeile genau
  `soll errors: 6 images, blocks end 390=<y> 1440=<y>, 0 defects`, y je Breite das tiefste Ende des Blocks `fix`. Mängel wie bei
  Geld: ein Pixel über der Kanaltoleranz, waagrechter Überlauf (die Überschrift mit JSON muss bei 390 px umbrechen), Gedankenstrich
  im sichtbaren Text, fremde Adresse, falsche Breite, Block fehlt oder endet unter dem ersten Bildschirm. Die Auswertung ist
  `assessErrors` in `ops/soll-assess.mjs`, geprüft von `test/soll-errors.test.ts` ohne Browser. `ops/soll-live-errors.mjs --out
  <ordner>` rendert die echten drei Seiten aus `createApp` (leere Datenbank, `CP_PUBLIC_URL=https://automatonhost.com`, kein Port)
  in diesen Ordner, nach dem Muster von `ops/soll-live-money.mjs`. Auf dem code-host rendern alle SOLL-Werkzeuge mit
  `FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf`.
- **Abnahme.** Sind Quellen und Bilder committet und gepusht, setzt der Maker in `docs/soll/README.md` die Zeile
  `Abnahme-Issue errors: PRO-<n>` mit dem Topic dieses Goals und erwähnt dort den Design Reviewer mit allen acht Bildpfaden und dem
  Commit. Bis „SOLL abgenommen“ dasteht, baut der Maker weder `src/public/error-pages.ts` noch die Fußzeile in
  `src/public/index.html` (Child `blocked`, Owner Design Reviewer; sein Kommentar weckt den Maker). Punkt 3 prüft die Reihenfolge an
  den Zeitstempeln. Ändern sich Bilder nach der Abnahme, braucht es eine neue. Die übrigen Zeilen `Abnahme-Issue …` bleiben.
- **Messwerkzeug (Punkt 6).** `ops/error-pages-arrivals.mjs`, Node ESM ohne neues Paket, liest Caddy-JSON-Zeilen aus `--log <datei>`
  oder ohne `--log` aus der Ausgabe von `bash ops/access-log.sh` (nur lesen). Eine Ankunft ist eine fremde Adresse (nicht in der
  Datei aus `--own-ips <datei>`, Vorgabe `ops/own-ips.txt`; User-Agent nicht `control-plane-check/1.0`; User-Agent ohne `bot`,
  `crawl`, `spider` oder `slurp`, Groß- und Kleinschreibung egal) mit ihrer ersten Anfrage auf einen Pfad `/errors/<slug>` mit
  Status 200 im Fenster von `--days <n>` Tagen (Vorgabe 7) bis jetzt (`CP_NOW` in Epoch-Sekunden ersetzt die Uhr). Herkunft nach dem
  Host des Referers: `search`, wenn er einen Eintrag aus `SEARCH_REFERRERS` in `ops/traffic.sh` enthält, `github` für `github.com`,
  sonst `other` (auch ohne Referer). Ausgabe genau vier Zeilen, englisch: zuerst
  `error_pages_arrivals days <n> search <n> github <n> other <n>`, dann je Slug in der Reihenfolge von `ERROR_PAGES`
  `error_page <slug> search <n> github <n> other <n>`. Log nicht lesbar: Exit 2 mit `log unreadable`, sonst Exit 0. Keine Ausgabe
  nennt eine Adresse. Die Zählung ist eine exportierte reine Funktion `countErrorArrivals`, die `test/error-pages-arrivals.test.ts`
  ohne Netz mit Zeilen aus Dokumentationsadressen (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) prüft.
- Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `startseite`, `sitemap` oder `index.html` nennen
  (`grep -l -E 'startseite|sitemap|index\.html' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem Bau erneut.
  Wird einer durch dieses Goal rot, ohne dass sein Zweck verletzt ist, fragt der Maker den Tech Lead auf dem Topic mit Befehl und
  beiden Ausgaben; der entscheidet mit einer Zeile `Abgelöst:` im `ANNAHMEN.md` des alten Goals. Kein Prüfbefehl eines fertigen
  Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Test geht ins Netz oder bindet einen festen Port (`app.request`, kein `serve`). Jeder
  neue Test war einmal rot, die Zeile im Progress Log sagt, womit. Code, Bezeichner, Testnamen und Ausgaben englisch.

## Done Condition
- [x] Die sechs SOLL-Bilder der Fehlerseiten und die zwei der Startseite kommen aus ihren Quellen, ohne Netz und ohne Mangel, der
      Block `fix` steht ganz im ersten Bildschirm, und die Quellen bauen aus den Bausteinen der Seite.
      MVP: Funktion, weil die Seiten nur nach Bild gebaut werden dürfen und der Betreiber die eine Zeile ohne Scrollen sehen muss.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-errors.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o)"; rm -rf $T` muss genau `exit=0 soll errors: 6 images, blocks end 390=<y> 1440=<y>, 0 defects` ausgeben, mit y bei 390 höchstens 844 und bei 1440 höchstens 900.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `node --input-type=module -e 'import fs from "node:fs"; import { decodePng } from "./ops/soll-assess.mjs"; const bad = []; for (const s of ["verify-500-database-error", "invalid-or-expired-nonce", "credits-never-granted"]) for (const w of [390, 1440]) { const p = decodePng(fs.readFileSync("docs/soll/errors-" + s + "-" + w + ".png")); if (p.width !== w) bad.push(s + " " + w); } if (bad.length) { console.error(bad); process.exit(1); } console.log("breiten ok")'` muss `breiten ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const dec=t=>t.replace(/&quot;|&#34;/g,"\"").replace(/&#39;/g,"\x27").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");const want={"verify-500-database-error":"/v1/auth/verify returns 500 {\"error\":\"Database error\"}","invalid-or-expired-nonce":"/v1/auth/verify returns 401 {\"error\":\"Invalid or expired nonce\"}","credits-never-granted":"x402 top-up paid on-chain, but credits never granted"};const bad=[];for(const [s,h] of Object.entries(want)){const f=fs.readFileSync("docs/soll/src/errors-"+s+".html","utf8");const u=f.indexOf("data-soll=\"fix\"");const blk=u<0?"":f.slice(u);const m=f.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);const h1=m?dec(m[1].replace(/<[^>]+>/g,"")).replace(/\s+/g," ").trim():"";if(h1!==h)bad.push(s+" h1: "+h1);if(u<0)bad.push(s+" block");for(const w of ["conwayApiUrl","https://automatonhost.com","automaton --provision","href=\"/fix\""])if(!blk.includes(w))bad.push(s+" fehlt "+w);if(/<script/i.test(f))bad.push(s+" script");if(/(src|srcset)="(https?:)?\/\/|<link[^>]+href="(https?:)?\/\/|url\(["\x27]?(https?:)?\/\//.test(f))bad.push(s+" fremde adresse");if(/[\u2013\u2014]/.test(f))bad.push(s+" gedankenstrich");if(/cp\.hippe\.eu|postyourprice/i.test(f))bad.push(s+" alter name")}if(bad.length){console.error(bad);process.exit(1)}console.log("quellen ok")'` muss `quellen ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const css=(fs.readFileSync("src/public/index.html","utf8").match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join("");const q=String.fromCharCode(96);const r=fs.readFileSync("docs/soll/README.md","utf8");const m=r.match(/^## Fehlerseiten \/errors\/\{slug\} \(goals\/reichweite\/01\)$([\s\S]*?)(?=^## |$(?![\s\S]))/m);const sec=m?m[1]:"";const cl=new Set();for(const s of ["verify-500-database-error","invalid-or-expired-nonce","credits-never-granted"]){const f=fs.readFileSync("docs/soll/src/errors-"+s+".html","utf8");for(const x of f.matchAll(/class="([^"]+)"/g))for(const c of x[1].split(/\s+/))if(c)cl.add(c)}const neu=[...cl].filter(c=>!new RegExp("\\."+c.replace(/[.*+?^${}()|[\]\\-]/g,"\\$&")+"(?![\\w-])").test(css));const ohne=neu.filter(c=>!sec.includes(q+"."+c+q));if(!m||ohne.length||neu.length>3){console.error({neu,ohne});process.exit(1)}console.log("bausteine ok neu="+neu.length)'` muss `bausteine ok neu=<n>` mit n höchstens 3 ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const s=fs.readFileSync("docs/soll/src/startseite.html","utf8");const i=s.indexOf("data-soll=\"errors\"");const f=s.lastIndexOf("<footer",i);const blk=i<0?"":s.slice(i,s.indexOf("</footer>",i));const bad=[];if(i<0||f<0||f>i)bad.push("block errors nicht in der fusszeile");for(const x of ["verify-500-database-error","invalid-or-expired-nonce","credits-never-granted"])if(!blk.includes("href=\"/errors/"+x+"\""))bad.push("link "+x);if(bad.length){console.error(bad);process.exit(1)}console.log("fusszeile ok")'` muss `fusszeile ok` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); m() { sed -n '/<section class="hero" id="move" data-soll="move">/,/<\/section>/p'; }; a=$(git show $B:docs/soll/src/startseite.html | m | sha256sum); b=$(m < docs/soll/src/startseite.html | sha256sum); [ "$a" = "$b" ] && [ -n "$(m < docs/soll/src/startseite.html)" ] && echo move gleich` muss `move gleich` ausgeben.
- [x] Die Auswertung der Fehlerseiten-Bilder lehnt jeden Mangel ab und lässt den sauberen Stand durch, das Werkzeug kennt nur seine
      Argumente, und die übrigen SOLL-Werkzeuge und Bilder bleiben, wie sie sind.
      MVP: Funktion, weil ein Bild, das seine Prüfung nicht in beide Richtungen besteht, kein SOLL ist.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/soll-errors.test.ts test/soll.test.ts test/soll-flags.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/soll-errors.test.ts` muss mindestens 7 ausgeben (je ein Fall für Pixelabweichung, Überlauf, Gedankenstrich, fremde Adresse, falsche Breite, Block `fix` unter dem ersten Bildschirm, sauberer Stand ohne Mangel).
      Prüfung: `node ops/soll-errors.mjs --chek; echo "exit=$?"; git status --porcelain docs/soll src/public | wc -l` muss `exit=1` und danach `0` ausgeben.
      Prüfung: `T=$(mktemp -d); cp docs/soll/src/errors-*.html $T/; sed -i 's/never granted/never booked/' $T/errors-credits-never-granted.html; FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-errors.mjs --check --source $T > $T/o 2>&1; echo "exit=$?"; rm -rf $T` muss `exit=1` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- docs/soll | grep -vE '^docs/soll/(errors-[a-z0-9-]+-(390|1440)\.png|src/errors-[a-z0-9-]+\.html|startseite-(390|1440)\.png|src/startseite\.html|README\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- ops/soll.mjs ops/soll-live.mjs ops/soll-handoff.mjs ops/soll-live-handoff.mjs ops/soll-konto.mjs ops/soll-live-konto.mjs ops/soll-limit.mjs ops/soll-live-limit.mjs ops/soll-money.mjs ops/soll-live-money.mjs ops/soll-og.mjs ops/browser.mjs | wc -l` muss `0` ausgeben.
- [x] Der Design Reviewer hat genau diese acht Bilder abgenommen, bevor Fehlerseiten oder Fußzeile gebaut wurden.
      MVP: Funktion, weil die Seiten 1:1 nach einem abgenommenen Bild entstehen und nicht nach einer Beschreibung.
      Prüfung: `grep -cE '^Abnahme-Issue errors: PRO-[0-9]+$' docs/soll/README.md` muss `1` ausgeben.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue errors: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- 'docs/soll/errors-*.png' 'docs/soll/src/errors-*.html' docs/soll/startseite-390.png docs/soll/startseite-1440.png docs/soll/src/startseite.html); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/public/error-pages.ts src/public/index.html | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok.filter(x=>x>t))<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [x] Die drei Fehlerseiten antworten unter `/errors/<slug>` mit dem genauen Fehlertext in Überschrift und Titel, ein unbekannter
      Slug antwortet 404, und die echten Seiten sind pixelgleich mit den abgenommenen Bildern.
      MVP: Funktion, weil die Suche den Titel zeigt und der Betreiber auf der Seite sehen muss, was das Bild verspricht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/error-pages.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "answers each error page with 200 and html" "puts the exact error text in the heading and the title" "shows the conwayApiUrl line with the public origin" "links each error page to /fix" "answers 404 for an unknown error page" "points the canonical link at the error page" "names the three error pages in the sitemap" "links the three error pages from the start page"; do grep -qF "\"$t\"" test/error-pages.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live-errors.mjs --out $T && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-errors.mjs --check --source $T > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/but credits never granted/but credits never booked/' $T/src/public/error-pages.ts; grep -q 'credits never booked' $T/src/public/error-pages.ts || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH node --import tsx ops/soll-live-errors.mjs --out $T/out); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-errors.mjs --check --source $T/out > $T/o 2>&1; echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src/public/fix.ts ops/traffic.sh | wc -l` muss `0` ausgeben.
- [x] Die Startseite verlinkt die drei Seiten in ihrer Fußzeile, `sitemap.xml` nennt sie, und die echte Startseite ist pixelgleich
      mit ihrem neuen Bild.
      MVP: Funktion, weil Suchmaschinen eine Seite über Sitemap und Verweise von der Startseite finden und ohne beides nie zeigen.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const app = createApp({ db: openDb(":memory:") }); const x = await (await app.request("/sitemap.xml")).text(); const h = await (await app.request("/")).text(); const bad = []; for (const s of ["verify-500-database-error", "invalid-or-expired-nonce", "credits-never-granted"]) { if (!x.includes("<loc>https://automatonhost.com/errors/" + s + "</loc>")) bad.push("sitemap " + s); if (!h.includes("href=\"/errors/" + s + "\"")) bad.push("start " + s); const r = await app.request("/errors/" + s); if (r.status !== 200) bad.push("status " + s + " " + r.status); } if (bad.length) { console.error(bad); process.exit(1); } console.log("verlinkt ok")'` muss `verlinkt ok` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live.mjs --out $T/s.html && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check --source $T/s.html > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sitemap-covers-pages.test.ts test/domain-move.test.ts test/journeys-cover-pages.test.ts` muss Exit-Code 0 haben.
- [x] `ops/error-pages-arrivals.mjs` zählt die Ankünfte auf `/errors/` je Woche nach Suchmaschine, github.com und Rest, lässt eigene
      Adressen, den eigenen Prüfer und Crawler aus und nennt nie eine Adresse.
      MVP: Funktion, weil die Leitzahl dieses Glieds sonst unsichtbar bleibt und der Kurs-Check nicht sieht, ob die Seiten gefunden
      werden.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/error-pages-arrivals.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "counts a search arrival on an error page" "counts a github arrival on an error page" "counts an arrival without referrer as other" "leaves out our own addresses and our checker" "leaves out crawlers" "counts an address once, at its first error page" "leaves out requests outside the window" "leaves out error pages that did not answer 200" "uses the search hosts of ops/traffic.sh" "ends with exit 2 when the log cannot be read" "prints no address"; do grep -qF "\"$t\"" test/error-pages-arrivals.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); printf '%s\n' '{"ts": 1790107010.0, "status": 200, "request": {"remote_ip": "192.0.2.7", "client_ip": "192.0.2.7", "uri": "/errors/invalid-or-expired-nonce", "headers": {"User-Agent": ["Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0"], "Referer": ["https://www.google.com/"]}}}' '{"ts": 1790107020.0, "status": 200, "request": {"remote_ip": "198.51.100.9", "client_ip": "198.51.100.9", "uri": "/errors/credits-never-granted", "headers": {"User-Agent": ["Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0"], "Referer": ["https://github.com/Conway-Research/automaton/issues/427"]}}}' > $T/a.log; : > $T/own; CP_NOW=1790110000 PATH=/usr/bin:$PATH node ops/error-pages-arrivals.mjs --log $T/a.log --own-ips $T/own; echo "exit=$?"; rm -rf $T` muss genau diese fünf Zeilen ausgeben: `error_pages_arrivals days 7 search 1 github 1 other 0`, `error_page verify-500-database-error search 0 github 0 other 0`, `error_page invalid-or-expired-nonce search 1 github 0 other 0`, `error_page credits-never-granted search 0 github 1 other 0`, `exit=0`.
      Prüfung: `PATH=/usr/bin:$PATH node ops/error-pages-arrivals.mjs --log /nonexistent/access.log > /dev/null 2>&1; echo "exit=$?"` muss `exit=2` ausgeben.
      Prüfung (Netz): `bash -c 'set -a; . ~/.config/control-plane/loop.env; set +a; PATH=/usr/bin:$PATH node ops/error-pages-arrivals.mjs' | grep -cE '^(error_pages_arrivals days 7|error_page [a-z0-9-]+) search [0-9]+ github [0-9]+ other [0-9]+$'` muss genau `4` ausgeben.
- [x] Die Entscheidungen stehen in `goals/reichweite/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg,
      und nichts im Repo nennt eine Adresse eines Kunden.
      MVP: Funktion, weil reichweite 02 auf diesen Slugs aufsetzt und ein späteres Goal wissen muss, warum `/fix` blieb.
      Prüfung: `grep -cE '^- [0-9-]+, reichweite 01: ' goals/reichweite/ANNAHMEN.md` muss mindestens `6` ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/app\.ts|src/public/error-pages\.ts|src/public/index\.html|ops/error-pages-arrivals\.mjs|ops/soll-errors\.mjs|ops/soll-live-errors\.mjs|ops/soll-assess\.mjs|docs/soll/.*|docs/.*\.md|test/.*\.test\.ts|test/site-pages\.ts|goals/reichweite/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss `0` ausgeben.
      Prüfung: `cat goals/reichweite/ANNAHMEN.md src/public/error-pages.ts docs/soll/src/errors-*.html | grep -cE '0x[0-9a-fA-F]{40}'` muss `0` ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Kritik: Der JSON-LD-Knoten `WebPage` jeder Fehlerseite nennt Titel und Beschreibung Zeichen für Zeichen wie `ERROR_PAGES`,
      ohne HTML-Entity im JSON-LD, und die anderen Seiten behalten ihr JSON-LD.
      MVP: Funktion, weil Suchmaschinen den maschinenlesbaren Teil lesen und dort heute `{&quot;error&quot;:…}` und `Conway&#39;s`
      statt des Fehlertexts steht, nach dem Betroffene suchen.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const { ERROR_PAGES } = await import("./src/public/error-pages.ts"); const app = createApp({ db: openDb(":memory:") }); const bad = []; for (const p of ERROR_PAGES) { const h = await (await app.request("/errors/" + p.slug)).text(); const m = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/); const g = m ? JSON.parse(m[1])["@graph"] || [] : []; const w = g.find((n) => n["@type"] === "WebPage"); if (!w || w.name !== p.title || w.description !== p.description) bad.push(p.slug + " ld: " + (w && w.name)); if (!m || /&(quot|amp|lt|gt|#\d+);/.test(m[1])) bad.push(p.slug + " ld entity"); if (!h.includes("<title>" + p.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;") + "</title>") && !h.includes("<title>" + p.title.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</title>")) bad.push(p.slug + " title"); } if (bad.length) { console.error(bad); process.exit(1); } console.log("ld ok")'` muss `ld ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/jsonld.test.ts test/error-pages.test.ts` muss Exit-Code 0 haben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Betreiber, der den Fehlertext seines Automatons sucht, sieht auf der Seite ohne Scrollen genau diesen Text, die Ursache in
      zwei Sätzen und die eine Zeile, mit der er weiterläuft.
- [ ] Die Seiten sehen aus wie die Startseite: gleiche Schrift, gleiche Farben, gleiche Bausteine; der erste Bildschirm der
      Startseite bleibt, wie er abgenommen ist.
- [ ] Kein Gedankenstrich, kein Name und keine Wallet-Adresse eines Kunden, keine Zahl ohne Messung, nichts zu den Bedingungen des
      Einkaufs bei OpenRouter, kein Satz, der eine Verbindung zu Conway behauptet.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/payments/**`, `src/auth/**`, `src/automaton/**`, `src/handoff/**`, `src/konto/**`, `ops/conway-series.sh`,
  `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `src/public/fix.ts` und `ops/traffic.sh`: bleiben unverändert (Entscheidungen 1 und 6)
- die übrigen SOLL-Werkzeuge, -Bilder und -Quellen außer denen der Startseite; der Abschnitt `#move` der Startseite
- `ROADMAP.md`, `docs/kette.md` und die Goal-Dateien anderer Goals; in deren `ANNAHMEN.md` nur Zeilen `Abgelöst:`, die der Tech Lead
  entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- kein Kommentar und keine Änderung in einem fremden Repo (das macht reichweite 02), keine Anmeldung bei einer Suchmaschine
- kein Aufruf der Produktion außer dem lesenden Prüfbefehl `(Netz)` von Punkt 6; der Zahlungsserver `76.13.144.207` und der
  Sandbox-Server: nur lesen über `ops/access-log.sh`
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-22 Zyklus 1: Punkte 1, 2 gebaut (drei SOLL-Quellen und sechs Bilder der Fehlerseiten, Fußzeile der Startseite neu gerendert, `ops/soll-errors.mjs` mit `assessErrors`, `test/soll-errors.test.ts`, `goals/reichweite/ANNAHMEN.md`); Fehlerseiten, Fußzeile in `src/public/index.html` und Messwerkzeug warten auf die Abnahme des Design Reviewers auf PRO-27594. Neue Tests einmal rot: drei Mutationen von `assessErrors` (Block-, Breiten- und Überlaufprüfung aus, alle Prüfungen von `assess` aus, Slug-Prüfung aus) und ohne `ops/soll-errors.mjs`. Prüfbefehle: P1 `soll errors: 6 images, blocks end 390=675 1440=637, 0 defects` exit 0, `soll.mjs --check` exit 0 0 defects, `breiten ok`, `quellen ok`, `bausteine ok neu=0`, `fusszeile ok`, `move gleich`; P2 vitest 3 Dateien grün, 9 Fälle, `--chek` exit=1 und 0, Gegenprobe `never booked` exit=1, beide Umfangszähler 0; P7 ANNAHMEN 8 Zeilen; check grün (252 Dateien, 2603 Tests).
- 2026-11-22 Zyklus 2: Punkte 3, 4, 5, 6, 7, 8 gebaut (nach der Abnahme des Design Reviewers auf PRO-27594 um 15:07: `src/public/error-pages.ts`, Route `/errors/:slug` mit 404, Sitemap, `llms.txt`, Fußzeile in `src/public/index.html`, `ops/soll-live-errors.mjs`, `ops/error-pages-arrivals.mjs` mit eigenen Adressen über `own_ips`, `docs/journeys.md` B0.0). Neue Tests einmal rot: `test/error-pages.test.ts` gegen `src/app.ts` und `index.html` von `dev` (8 rot) und ohne maskierten Titel (2 rot); `test/error-pages-arrivals.test.ts` ohne Slugs im Quelltext (3 rot) und mit zwei Mutationen der Zählung (9 und 4 rot), der Fall mit `own_ips` ohne Liste (1 rot). Prüfbefehle: P1 `soll errors: 6 images, blocks end 390=675 1440=637, 0 defects` exit 0 und die übrigen sechs wie in Zyklus 1; P2 wie in Zyklus 1; P3 1 und `abnahme ok 1` (Bilder 15:01:24, erster Bau 15:13:37); P4 vitest grün, keine Zeile `fehlt`, echte Seiten `exit=0 0 defects`, Gegenprobe `never booked` exit=1 ohne `sed-miss`, 0; P5 `verlinkt ok`, `exit=0 0 defects`, vitest grün; P6 vitest grün, keine Zeile `fehlt`, die vier Zeilen und `exit=0`, `exit=2`, live 4 Zeilen (alle Zähler 0, Seiten noch nicht ausgerollt; Gegenprobe echtes Log mit gepflanzter Zeile: search 1); P7 13, 0, 0, 0; P8 check grün (254 Dateien, 2622 Tests). Prüfbefehle fertiger Goals zu Startseite, Sitemap und `index.html` an `dev` und am Kopf: inhaltlich gleich, abweichend nur Umfangszähler `origin/dev...HEAD`.
- 2026-11-22 Zyklus 3: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8 (aktuelles `dev` mit `d4bae16` gemergt, nur die Goal-Datei karte 02 kam dazu). Prüfbefehle: alle 33 nach dem Merge erneut ausgeführt, jede Erwartung erfüllt: P1 `soll errors: 6 images, blocks end 390=675 1440=637, 0 defects` exit 0, `exit=0 0 defects`, `breiten ok`, `quellen ok`, `bausteine ok neu=0`, `fusszeile ok`, `move gleich`; P2 vitest 32 grün, 9, `exit=1` und 0, `exit=1`, 0, 0; P3 1, `abnahme ok 1`; P4 vitest 8 grün, keine Zeile `fehlt`, `exit=0 0 defects`, Gegenprobe `exit=1` ohne `sed-miss`, 0; P5 `verlinkt ok`, `exit=0 0 defects`, vitest 11 grün; P6 vitest 11 grün, keine Zeile `fehlt`, die vier Zeilen und `exit=0`, `exit=2`, live 4; P7 13, 0, 0, 0; P8 check grün (254 Dateien, 2622 Tests, 128 s); `e2e` und `check` am PR #375 auf `afb587e` grün.
- 2026-11-22 Zyklus 4: Punkt 9 gebaut (Kritik: Route `/errors/:slug` gibt Titel und Beschreibung roh an `page()`, `page()` maskiert `"` nur in den Attributen des Kopfs, JSON-LD `WebPage` trägt den Text ohne Entity; Annahme in `goals/reichweite/ANNAHMEN.md`). Neuer Test einmal rot: "names each error page in its JSON-LD by the exact title and description" gegen den Stand vor dem Fix und mit zurückgesetztem `esc(p.title)`; ohne Maskierung in `attr` wird "puts the exact error text in the heading and the title" rot. HTML aller 18 Seiten aus Sitemap und Rahmen vorher und nachher verglichen: anders nur die drei Fehlerseiten und `og:title`, `twitter:title` von `/fix` (auf `dev` brach das Attribut an rohen Anführungszeichen ab), JSON-LD aller übrigen Seiten gleich. Prüfbefehle: P9 `ld ok`, vitest `jsonld` und `error-pages` 19 grün; P1 bis P7 erneut wie in Zyklus 3 (P7 ANNAHMEN jetzt 14); P8 check grün (254 Dateien, 2623 Tests, 64 s).
- 2026-11-22 Release: PASS K und B (Zyklus 4), DONE.

## Blockers
keine
