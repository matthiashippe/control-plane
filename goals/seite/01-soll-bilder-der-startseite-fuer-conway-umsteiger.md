# Seite Goal 01: SOLL-Bilder der Startseite für Conway-Umsteiger

## Status
ACTIVE

## Active Objective
Wer aus einem Conway-Issue auf `/` landet, sieht im ersten Bildschirm den Umzug in einem Schritt: `conwayApiUrl` auf
`https://postyourprice.com` stellen, `automaton --provision`, weiter läuft der Automaton. Dieses Goal liefert dafür die SOLL-Bilder der
Startseite unter `docs/soll/` bei 390 und 1440 Pixeln, gebaut aus den Bausteinen der bestehenden Seite (`src/public/index.html`), mit
dem Katalog für Menschen weiter auf der Seite, und die Abnahme durch den Design Reviewer. Gebaut wird die Seite erst in seite 02, 1:1
nach diesen Bildern (`ROADMAP.md`, seite 01).
MVP: Funktion, weil seite 02 die Startseite nur nach Bild ändern darf (`LOOP.md`, „Traction zuerst“: Fläche nur nach SOLL-Bild) und ein
Betreiber, der aus Conway-Issue #435 kam, den Umzug heute erst hinter „Agent stuck?“ findet, also gar nicht.

## Voraussetzungen
- keine

## Kontext für den Maker
- Die Fläche ist eine: die Startseite `/`, ausgeliefert aus `src/public/index.html` mit den Platzhaltern, die `src/app.ts` füllt
  (`<!--HUMAN-->` aus `src/public/humanfirst.ts`, `<!--NUMBERS-->`, `<!--MARKET-->`, `<!--PASTEBOX-->`, `<!--PRICES-->`). Die
  Quelle des Bildes ist eine statische Seite `docs/soll/src/startseite.html`: der gerenderte Stand der heutigen Startseite (etwa aus
  `pnpm dev` auf freiem Port mit Mock-Provider, oder aus den Render-Funktionen), darin der Umzug als neuer Block oben. Platzhalter
  bleiben nicht stehen, Marktzahlen und Wallet-Stände im Bild sind erfundene Beispielwerte ohne Kundenbezug (`loop-constraints.md`,
  Grundregel 8).
- Bausteine: Die Quelle nutzt die Klassen aus dem `<style>` von `src/public/index.html` (`hero`, `wrap`, `code`, `btn`, `pill`,
  `eyebrow`, `human`, `card` und so weiter). Höchstens drei neue Klassen, jede mit Grund unter `## Neue Bausteine` in
  `docs/soll/README.md`. Der Umzug ist der Baustein aus `#agents` (Zeile mit `~/.automaton/automaton.json` und `automaton --provision`),
  nach oben geholt und mit `https://postyourprice.com` statt `https://cp.hippe.eu`; der Block trägt `data-soll="umzug"`.
- Inhalt oben: Eine Überschrift, die den Betreiber eines Automatons anspricht, dessen Anschluss bei Conway nicht mehr antwortet; die
  eine Zeile Konfiguration; `automaton --provision`; ein Link auf `/fix` für Einzelheiten. Verkäuferisch nach Regel V (Nutzen vorn,
  wenig Text), jede Zahl im Bild nur mit Befehl aus der Produktion, sonst keine Zahl. Der Katalog für Menschen (`section.human` mit
  „Zum Katalog“) bleibt auf der Seite, unter dem Umzug. Englisch, weil die Leser aus Conway-Issues englisch schreiben; der deutsche
  erste Bildschirm (`germanFirstScreen` in `src/app.ts`) ist nicht Teil dieses Goals; die Annahme dazu schreibt der Maker in
  `goals/seite/ANNAHMEN.md`.
- Werkzeug: `ops/soll.mjs` rendert die Quelle ohne Netz mit dem Headless-Chromium aus `~/.cache/ms-playwright/` (ohne neues Paket) nach `docs/soll/startseite-390.png` und `docs/soll/startseite-1440.png` (ganze Seite, Breite gleich
  dem Dateinamen). `--pruefen` rendert in ein `mktemp`-Verzeichnis neu und meldet Mängel: Bild weicht um mehr als 1 % der Pixel vom
  neuen Render ab, waagrechter Überlauf (`scrollWidth` größer als die Breite), Gedankenstrich (U+2013, U+2014) im sichtbaren Text, eine
  Anfrage an eine fremde Adresse beim Rendern, der Block `umzug` endet unter dem ersten Bildschirm (844 px bei 390, 900 px bei 1440).
  Die Auswertung der Messwerte ist eine reine Funktion, die `test/soll.test.ts` ohne Browser aufruft, damit `check` auf den
  GitHub-Rechnern ohne Chromium grün bleibt.
- Abnahme: Ist das Bild fertig, trägt `docs/soll/README.md` die Zeile `Abnahme-Issue: PRO-<n>` mit dem Topic dieses Goals, und der
  Maker erwähnt den Design Reviewer dort mit beiden Bildpfaden und dem Commit. Der Design Reviewer prüft nach seinem Vertrag (Abschnitt
  SOLL-Bild) und schreibt dort „SOLL abgenommen“. Einen Look bei Matthias gibt es in diesem Loop nicht (`human_gates` in `loop.yaml`
  nennt keinen), die Abnahme des Design Reviewers reicht. Fehlt sie am Ende des Laufs, bleibt Punkt 4 offen und das Child geht auf
  `blocked` mit dem Design Reviewer als Owner; sein Kommentar weckt den Maker. Ändern sich die Bilder nach der Abnahme, braucht es eine
  neue.
- Was danach schneller zu mehr zahlenden Automatons führt: Jeder Betreiber, der aus einem unserer Kommentare in Conway-Issues kommt
  (kanal 01), sieht den Umzug ohne Suche; seite 02 baut das und misst, wie viele davon sich binnen 24 Stunden anmelden.

## Done Condition
- [x] Beide Bilder kommen aus der Quelle, ohne Netz, mit dem Umzug im ersten Bildschirm und ohne Mangel.
      Prüfung: `node ops/soll.mjs --pruefen` muss Exit 0 haben und als letzte Zeile `soll: 2 Bilder, umzug oben 390=<y> 1440=<y>, 0 Mängel` ausgeben, mit y bei 390 höchstens 844 und bei 1440 höchstens 900.
      Prüfung: `node -e 'const fs=require("fs");for(const w of [390,1440]){const b=fs.readFileSync("docs/soll/startseite-"+w+".png");if(b.readUInt32BE(16)!==w){console.error(w);process.exit(1)}}console.log("breiten ok")'` muss `breiten ok` ausgeben.
- [x] Die Auswertung lehnt jeden Mangel ab und lässt das saubere Bild durch.
      Prüfung: `pnpm -s vitest run test/soll.test.ts` muss Exit 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/soll.test.ts` muss mindestens 6 ausgeben (je ein Fall für Pixelabweichung, Überlauf, Gedankenstrich, fremde Adresse, Umzug unter dem ersten Bildschirm, sauberer Stand ohne Mangel).
- [x] Die Quelle zeigt den Umzug oben mit der richtigen Adresse, behält den Katalog für Menschen und baut aus den Bausteinen der Seite.
      Prüfung: `node -e 'const fs=require("fs");const s=fs.readFileSync("docs/soll/src/startseite.html","utf8");const u=s.indexOf("data-soll=\"umzug\"");const bad=[];if(u<0)bad.push("umzug");const e=s.indexOf("</section>",u);const blk=s.slice(u,e);if(!/conwayApiUrl/.test(blk)||!/https:\/\/postyourprice\.com/.test(blk)||!/automaton --provision/.test(blk)||!/href="\/fix"/.test(blk))bad.push("inhalt umzug");for(const m of ["id=\"proof\"","class=\"human\""]){const i=s.indexOf(m);if(i<0||i<e)bad.push("vor umzug oder fehlt "+m)}if(!/href="\/katalog"/.test(s))bad.push("katalog");if(/cp\.hippe\.eu/.test(s))bad.push("alte adresse");if(/<!--(HUMAN|NUMBERS|PASTEBOX|PRICES|WALLETS|MARKET)-->/.test(s))bad.push("platzhalter");if(/(src|srcset)="(https?:)?\/\/|<link[^>]+href="(https?:)?\/\/|url\(["\x27]?(https?:)?\/\//.test(s))bad.push("fremde adresse");if(/[\u2013\u2014]/.test(s))bad.push("gedankenstrich");if(bad.length){console.error(bad);process.exit(1)}console.log("quelle ok")'` muss `quelle ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const s=fs.readFileSync("docs/soll/src/startseite.html","utf8");const css=(fs.readFileSync("src/public/index.html","utf8").match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join("");const cl=new Set([...s.matchAll(/class="([^"]+)"/g)].flatMap(m=>m[1].split(/\s+/)).filter(Boolean));const neu=[...cl].filter(c=>!new RegExp("\\."+c.replace(/[.*+?^${}()|[\]\\-]/g,"\\$&")+"(?![\\w-])").test(css));const r=fs.readFileSync("docs/soll/README.md","utf8");const ohne=neu.filter(c=>!r.includes("`."+c+"`"));if(neu.length>3||ohne.length||!/^## Neue Bausteine$/m.test(r)){console.error({neu,ohne});process.exit(1)}console.log("bausteine ok neu="+neu.length)'` muss `bausteine ok neu=<n>` mit n höchstens 3 ausgeben.
- [x] Der Design Reviewer hat genau diese Bilder abgenommen.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- docs/soll/startseite-390.png docs/soll/startseite-1440.png docs/soll/src/startseite.html); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)&&Date.parse(c.createdAt)>t);if(!ok.length){console.error("keine abnahme nach "+process.env.T);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, die Live-Seite ändert sich nicht, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(docs/soll/|ops/soll\.mjs$|ops/soll-[a-z]+\.mjs$|test/soll\.test\.ts$|goals/seite/)' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- src && echo src gleich` muss `src gleich` ausgeben.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Betreiber, der aus einem Conway-Issue kommt, sieht ohne Scrollen, welche eine Zeile er ändert, und liest dort keine Rede an
      Menschen davor.
- [ ] Das Bild sieht aus wie die heutige Seite: gleiche Schrift, gleiche Farben, gleiche Bausteine, der Umzug gewichtet wie die
      Hauptsache.
- [ ] Kein Gedankenstrich, kein Name und keine Wallet-Adresse eines Kunden, keine Zahl ohne Messung, nichts zu den Bedingungen des
      Einkaufs bei OpenRouter.

## Deny List
- `src/**`: dieses Goal ändert die Live-Seite nicht, das macht seite 02
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- `ROADMAP.md`, `docs/kette.md` und alle Goal-Dateien außer dieser
- `package.json` und `pnpm-lock.yaml`: kein neues Paket, gerendert wird mit dem Chromium aus `~/.cache/ms-playwright/`
- kein Aufruf einer fremden Adresse beim Rendern, keine Schrift, kein Bild und kein Skript eines fremden Dienstes in der Quelle
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-12 Zyklus 1: Punkte 1, 2, 3, 5 gebaut: Quelle `docs/soll/src/startseite.html` aus dem Render von `/` (createApp, leere DB, kein Port) mit dem Umzug als erstem Block, beide Bilder, `ops/soll.mjs` (Chromium über DevTools-Pipe, ohne Port und ohne Netz) und die reine Auswertung `ops/soll-assess.mjs`; Punkt 4 wartet auf die Abnahme des Design Reviewers auf PRO-18819. Jeder der 8 Tests in `test/soll.test.ts` war rot, je mit der zugehörigen Prüfung in `ops/soll-assess.mjs` abgeschaltet; Gegenprobe des Werkzeugs mit gepflanzter Quelle (Gedankenstrich, fremdes Bild, 1600 px breite Box im Umzug und am Seitenende, Umzug nach unten geschoben) und gepflanzten Bildern (2 % rot): Exit 1 mit je genau diesen Mängeln; 18 parallele Läufe bei Load 70 pixelgleich. Prüfbefehle: `node ops/soll.mjs --pruefen` -> `soll: 2 Bilder, umzug oben 390=801 1440=656, 0 Mängel` (Exit 0); Breiten -> `breiten ok`; `pnpm -s vitest run test/soll.test.ts` -> Exit 0, 8 passed; grep -> 8; Quelle -> `quelle ok`; Bausteine -> `bausteine ok neu=0`; Pfade -> 0; src -> `src gleich`; `node scripts/check.mjs` -> Exit 0 (1375 Tests, erster Lauf Exit 1 nur durch „Timeout calling onTaskUpdate“ bei Load 83); Punkt 4 (Netz) -> offen, Abnahme angefragt.
- 2026-11-12 Zyklus 2: Punkte 1, 3 nachgebessert nach Befund 1 des Design Reviewers (PRO-18819): Unterzeile im Umzug ohne Bild, „It signs in here with its own wallet and gets answers again, over the same API it uses today.“, beide Bilder neu gerendert. Prüfbefehle: `node ops/soll.mjs --pruefen` -> `soll: 2 Bilder, umzug oben 390=828 1440=656, 0 Mängel` (Exit 0); Breiten -> `breiten ok`; `pnpm -s vitest run test/soll.test.ts` -> Exit 0, 8 passed; grep -> 8; Quelle -> `quelle ok`; Bausteine -> `bausteine ok neu=0`; Pfade -> 0; src -> `src gleich`; `node scripts/check.mjs` -> Exit 0 (1375 Tests); Punkt 4 (Netz) -> offen, neue Abnahme angefragt.
- 2026-11-12 Zyklus 2: Punkt 4 abgehakt, „SOLL abgenommen“ des Design Reviewers auf PRO-18819 für die Bilder aus 302a4e9. Prüfbefehle: Punkt 4 (Netz) -> `abnahme ok 1` (Bilder committet 18:22:22, Abnahme 18:24:45).
- 2026-11-12 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, nach Merge von `origin/dev` (96440e4). Prüfbefehle: `node ops/soll.mjs --pruefen` -> `soll: 2 Bilder, umzug oben 390=828 1440=656, 0 Mängel` (Exit 0); Breiten -> `breiten ok`; `pnpm -s vitest run test/soll.test.ts` -> Exit 0, 8 passed; grep -> 8; Quelle -> `quelle ok`; Bausteine -> `bausteine ok neu=0`; Pfade -> 0; src -> `src gleich`; `node scripts/check.mjs` -> Exit 0 (1418 Tests); Punkt 4 -> `abnahme ok 1`.

## Blockers
keine
