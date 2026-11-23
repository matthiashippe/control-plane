# Reichweite Goal 03: Ein Video zeigt den Umzug

## Status
ACTIVE

## Active Objective
Wer aus einem Conway-Issue oder über die Suche auf automatonhost.com landet, liest heute, dass eine Zeile reicht, und muss es glauben,
bevor er Geld auflädt. Nach diesem Goal zeigt ein Video von höchstens 30 Sekunden, ohne Ton, mit Texteinblendungen auf Englisch, wie
ein unveränderter Automaton aus `Conway-Research/automaton` (Pin `d8f8168`) den echten Fehler von `api.conway.tech` bekommt, wie die
eine Zeile `conwayApiUrl` geändert wird und wie derselbe Automaton danach bei uns startet und seine erste Runde dreht. Aufgenommen
wird aus einer Skriptdatei im Repo (`docs/video/umzug.tape`) mit echten Befehlen gegen die echten Dienste, mit unserem eigenen
Testkonto, nichts gestellt; was der Automaton ausgibt, steht vollständig in `docs/video/umzug.transcript.json`, und das Video zeigt
jede dieser Zeilen. Eingebunden wird es als MP4 mit Standbild und `preload="none"` auf der Startseite direkt unter dem Block mit der
Zeile `conwayApiUrl` und auf jeder Seite aus reichweite 01 direkt unter dem Block `fix`, dazu als GIF im README. Gebaut wird 1:1
nach SOLL-Bildern (390 und 1440 px der Startseite und der drei Fehlerseiten, dazu vier Schlüsselbilder des Videos), die der Design
Reviewer vor dem Einbau abnimmt (`ROADMAP.md`, reichweite 03).
Leitzahl: Starts des Videos je Woche (`ops/video-starts.mjs`: fremde Adressen, die `/video/umzug.mp4` abrufen; mit
`preload="none"` lädt ein Browser die Datei erst beim Abspielen).
Widerlegt, wenn vier Wochen nach dem Rollout weniger als ein Start auf zehn fremde Ankünfte auf Startseite und `/errors/` kommt
(`ops/video-starts.mjs` gegen `ops/error-pages-arrivals.mjs` und `ops/traffic.sh`); dann prüft der Kurs-Check, ob das Video gesehen
wird, bevor ein weiteres Video entsteht.
MVP: Funktion, weil ein Besucher sieht, dass es wirklich eine Zeile ist, bevor er Geld auflädt.

## Voraussetzungen
- reichweite Goal 02 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Betreiber, dessen Automaton bei Conway hängt, sieht in 30 Sekunden ohne Ton, dass sein unveränderter
  Automaton nach einer geänderten Zeile bei uns weiterläuft, und lädt danach Guthaben auf.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Die 29 umgelinkten Kommentare aus reichweite 02 und die Suche
  führen auf Seiten, die den Umzug jetzt zeigen statt nur beschreiben; das Video ist der Beleg für den Satz „one line“, an dem ein
  Betreiber vor der ersten Zahlung zweifelt. Kein X-Konto (Matthias hat keins, 22.11.2026): Das Video lebt auf unseren Seiten und im
  README. Quelle: `ROADMAP.md`, Topic `reichweite`, Glied 03; Hintergrund in `docs/research/2026-11-22-conway-marketing.md`
  (Conway wuchs über einen Thread mit Videos, Abschnitt „Übertragbar auf uns“).
- **Bestand und Entscheidungen des Tech Lead (22.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile
  `- <Datum>, reichweite 03: …` (Datum des Baus) in `goals/reichweite/ANNAHMEN.md`.
  1. **Kein vhs.** Auf dem code-host gibt es weder `vhs` noch `ttyd` noch ein `ffmpeg` mit H.264 (das ffmpeg von Playwright kann nur
     VP9 in WebM). Darum zwei Schritte: `ops/video-record.sh` nimmt auf (mit Netz, schreibt nur das Transkript), `ops/video-render.mjs`
     macht daraus ohne Netz Bilder (Browser über `ops/browser.mjs`, Art `picture`, mit
     `FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf`) und kodiert sie. Kodiert wird mit dem ffmpeg aus
     `uvx --with imageio-ffmpeg` (H.264, GIF und PNG, am 22.11.2026 auf dem code-host geprüft), Pfad über `CP_FFMPEG` oder sonst über
     `uvx`; kein neues Paket in `package.json`, kein ffmpeg im Repo, keine Prüfung braucht ffmpeg.
  2. **Skriptdatei** `docs/video/umzug.tape`, eine Anweisung je Zeile, `#` für Kommentare: `setup <Befehl>` läuft vor der Aufnahme
     und erscheint nicht im Video (Programm `automaton` als Hülle um `node /opt/automaton/dist/index.js`, Wallet-Datei,
     `automaton.json` über `setup-headless.mjs` mit `conwayApiUrl` gleich `https://api.conway.tech`), `caption <Szene> <Text>`,
     `run <Szene> <Befehl>` (gezeigt mit Prompt `$ `, ausgeführt, Ausgabe aufgenommen), `until <Regex>` beendet den vorigen `run`,
     sobald eine Zeile passt (höchstens 180 s). Vier Szenen:
     - 1, Einblendung `Before: api.conway.tech fails.`: `grep conwayApiUrl ~/.automaton/automaton.json`, dann
       `automaton --provision` (der echte Fehler von Conway, Exit ungleich 0);
     - 2, Einblendung `Change one line.`: `sed -i 's#https://api.conway.tech#https://automatonhost.com#' ~/.automaton/automaton.json`,
       dann `grep conwayApiUrl ~/.automaton/automaton.json`;
     - 3, Einblendung `After: it runs on automatonhost.com.`: `automaton --provision` (Exit 0), dann `automaton --run` mit
       `until` auf die erste Zeile `Turn <id>: <n> tools`;
     - 4, Schlusstafel ohne Befehl: `automatonhost.com/fix` und `Top up by card, PayPal or Apple Pay.`
     Die Texte stehen so im Tape; ändert der Design Reviewer einen, gilt seiner, und die Zeile in ANNAHMEN.md nennt ihn.
  3. **Aufnahme in einer Sandbox unserer Produktion**, nicht auf dem code-host: Mit leerem `sandboxId` führt die Runtime jedes
     Werkzeug lokal aus (`execSync` in `src/conway/client.ts` am Pin), auf dem code-host also mit dessen Rechten und Schlüsseln. Das
     Image `sandboxd-base:2` trägt die unveränderte Runtime unter `/opt/automaton`. `ops/video-record.sh` folgt
     `ops/automaton-live.sh` (öffentliche Sandbox-API mit `LIVE_SANDBOX_KEY` aus `~/.config/control-plane/live-sandbox.env`, kleinste
     Sandbox, Löschen in jedem Fall, auch bei Fehler oder Signal, kein Topup, ein 402 endet mit `VIDEO RECORD FAIL credits`, jede Zeile
     durch einen Wächter), ändert `ops/automaton-live.sh` aber nicht. Die Wallet der Runtime ist die Wallet des eigenen Kontos
     (`LIVE_SANDBOX_WALLET_KEY`, Adresse `LIVE_SANDBOX_ADDRESS` aus `src/bounties/ours.ts`), weil eine frische Wallet bei uns als
     fremder Automaton zählen und den Startbonus aus `src/credits/starter.ts` ziehen würde; der Schlüssel geht nur als Datei in die
     Sandbox, die danach gelöscht wird, und erscheint nirgends sonst. Modell: das billigste aus `GET /v1/models`, das weder Claude noch
     Anthropic ist (`loop-constraints.md`, Grundregel 11), Genesis-Prompt kurz wie in `ops/automaton-live.sh`.
  4. **Transkript** `docs/video/umzug.transcript.json`: `runtime_rev` (`d8f8168`), `recorded_at` (UTC), `steps` je `run` mit
     `scene`, `command` (Zeichen für Zeichen wie im Tape), `exit_code`, `started_ms` und `lines` (`t_ms`, `text`) in der Reihenfolge der
     Ausgabe. Verändert wird genau eins: Der Wert von `apiKey` heißt `<api key hidden>`. `keyPrefix` bleibt, weil `--verify` ihn im
     Ledger wiederfindet. Ein String aus 64 Hex-Zeichen oder eine andere Adresse als `LIVE_SANDBOX_ADDRESS` beendet die Aufnahme mit
     `VIDEO RECORD FAIL secret` und schreibt nichts. Antwortet Conway bei der Aufnahme ohne Fehler, endet sie mit
     `VIDEO RECORD FAIL conway answered`, und der Maker fragt den Tech Lead auf dem Topic, statt etwas zu stellen.
  5. **Nichts geschnitten heißt:** Jede aufgenommene Zeile erscheint im Video, in ihrer Reihenfolge und unverändert bis auf den
     Schlüssel. Gekürzt werden nur Wartezeiten, jede auf höchstens 1 s; die echten Zeiten bleiben im Transkript. Tippen mit fester
     Geschwindigkeit, jede Einblendung 1,5 s. Passt das nicht in 30 s, kürzt der Maker das Tape (etwa `grep` statt `cat`), nie die
     Ausgabe.
  6. **Dateien:** `src/public/video/umzug.mp4` (H.264, `yuv420p`, 1280x720, höchstens 30,0 s, keine Tonspur, `moov` vor `mdat` für den
     schnellen Start, höchstens 2 MB, im Metadatenfeld `comment` die Zeile `transcript_sha256=<hex> tape_sha256=<hex>`),
     `src/public/video/umzug-poster.png` (1280x720, gleich dem Schlüsselbild 2), `docs/video/umzug.gif` (800 px breit, höchstens
     10 Bilder je Sekunde, höchstens 3 MB). `ops/video-assess.mjs` prüft das ohne ffmpeg und ohne Netz (MP4-Boxen in Node gelesen,
     `decodePng` aus `ops/soll-assess.mjs`), die reinen Funktionen prüft `test/video-assess.test.ts`.
  7. **Auslieferung:** Die Route `app.get("/video/:file")` in `src/app.ts` liefert genau `umzug.mp4` (`video/mp4`) und
     `umzug-poster.png` (`image/png`) aus `PUBLIC_DIR` oder `src/public/video/` wie `ogImage`, mit `Accept-Ranges: bytes`, 206 und
     `Content-Range` auf eine Range-Anfrage (Safari spielt MP4 nur so), 416 auf eine unerfüllbare, jede andere Datei 404. Die CSP in
     `deploy/Caddyfile` bekommt `media-src 'self';`, sonst nichts (ohne sie blockt `default-src 'none'` das Video); geprüft mit
     `caddy validate` wie in den Goals davor. Kein Skript, kein `autoplay`.
  8. **Einbau:** Der Block `data-soll="video"` mit `<video controls muted playsinline preload="none" width="1280" height="720"
     poster="/video/umzug-poster.png">` und `<source src="/video/umzug.mp4" type="video/mp4">` steht auf der Startseite direkt nach
     `</section>` des Blocks `move`, auf jeder Fehlerseite direkt nach dem Block `fix`, nie in einem der beiden: Beide müssen im ersten
     Bildschirm enden (`ops/soll.mjs`, `ops/soll-errors.mjs`), und `move` ist abgenommen. Ob die Zeile `.fine` der Fehlerseiten vor oder
     nach dem Video steht und welcher Satz unter dem Video steht, entscheidet das Bild. Das Video kommt nicht in die Sitemap.
  9. **README:** direkt nach dem ersten Block ```` ```json ```` mit `conwayApiUrl` die Zeile
     `[![<Alternativtext>](docs/video/umzug.gif)](https://automatonhost.com/fix)`, sonst bleibt das README Zeichen für Zeichen.
  10. **Leitzahl:** eigenes Werkzeug `ops/video-starts.mjs` nach dem Muster von `ops/error-pages-arrivals.mjs` (eigene Adressen über
      `ops/own-ips.sh`, Prüfer `control-plane-check/1.0` und Crawler aus, `CP_NOW`, `--log`, `--own-ips`, `--days`), `ops/traffic.sh` und
      `ops/error-pages-arrivals.mjs` bleiben unverändert. Ein Start ist eine fremde Adresse mit ihrer ersten Anfrage auf
      `/video/umzug.mp4` mit Status 200 oder 206 im Fenster; die Seite kommt aus dem Pfad des Referers (`/` gleich `home`,
      `/errors/<slug>` gleich `errors`, sonst `other`). Ausgabe genau eine Zeile `video_starts days <n> total <n> home <n> errors <n>
      other <n>`, Log nicht lesbar Exit 2 mit `log unreadable`. Reine Funktion `countVideoStarts`, geprüft von
      `test/video-starts.test.ts` mit Dokumentationsadressen.
- **Reihenfolge.** Zuerst die Aufnahme (Punkt 1, mit Netz), weil die Schlüsselbilder aus dem echten Transkript entstehen. Dann die
  SOLL-Bilder (Punkt 2): `docs/soll/src/startseite.html` und die drei `docs/soll/src/errors-<slug>.html` bekommen den Block `video`,
  `node ops/soll.mjs` und `node ops/soll-errors.mjs` schreiben ihre Bilder neu, `node ops/video-render.mjs --frames` schreibt
  `docs/soll/video-umzug-<n>-1280.png` (n 1 bis 4, je das letzte Bild einer Szene), höchstens drei neue Klassen mit Grund unter einem
  neuen Abschnitt `## Video (goals/reichweite/03)` in `docs/soll/README.md`. Das Standbild erscheint in den Seitenbildern; wie die
  SOLL- und Live-Werkzeuge es ohne Netz laden, entscheidet der Maker und schreibt es in ANNAHMEN.md, ohne dass eine Prüfung eines
  fertigen Goals schwächer wird.
- **Abnahme.** Sind Quellen und Bilder gepusht, setzt der Maker in `docs/soll/README.md` die Zeile `Abnahme-Issue video: PRO-<n>` mit
  dem Topic dieses Goals und erwähnt dort den Design Reviewer mit allen zwölf Bildpfaden, dem Commit und dem Pfad des Transkripts.
  Bis „SOLL abgenommen“ dasteht, baut der Maker weder `src/public/video/` noch den Block in `src/public/index.html` oder
  `src/public/error-pages.ts` (Child `blocked`, Owner Design Reviewer; sein Kommentar weckt den Maker). Ändern sich Bilder nach der
  Abnahme, braucht es eine neue. Die übrigen Zeilen `Abnahme-Issue …` bleiben.
- Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `startseite`, `soll-errors`, `soll-live`, `index.html`, `Caddyfile`
  oder `README` nennen (`grep -l -E 'startseite|soll-errors|soll-live|index\.html|Caddyfile|README' goals/*/[0-9]*.md`), einmal am
  Kopf von `dev` ohne Netz fahren und nach dem Bau erneut. Wird einer durch dieses Goal rot, ohne dass sein Zweck verletzt ist, fragt
  der Maker den Tech Lead auf dem Topic mit Befehl und beiden Ausgaben; der entscheidet mit einer Zeile `Abgelöst:` im `ANNAHMEN.md`
  des alten Goals. Kein Prüfbefehl eines fertigen Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Test geht ins Netz oder bindet einen festen Port (`app.request`, kein `serve`). Jeder
  neue Test war einmal rot, die Zeile im Progress Log sagt, womit. Code, Bezeichner, Testnamen, Einblendungen und Ausgaben englisch.

## Done Condition
- [x] Die Aufnahme ist echt und vollständig: Das Transkript stammt aus der unveränderten Runtime am Pin, Szene 1 zeigt den Fehler von
      `api.conway.tech`, Szene 3 die Anmeldung bei uns und die erste Runde, und es enthält keinen Schlüssel und keine fremde Adresse.
      MVP: Funktion, weil das Video nur überzeugt, wenn jede Zeile darin wirklich so aus dem Automaton kam.
      Prüfung: `node -e 'const fs=require("fs");const t=JSON.parse(fs.readFileSync("docs/video/umzug.transcript.json","utf8"));const tape=fs.readFileSync("docs/video/umzug.tape","utf8").split("\n").map(l=>l.match(/^run ([1-4]) (.+)$/)).filter(Boolean).map(m=>[Number(m[1]),m[2]]);const s=t.steps||[];const bad=[];if(t.runtime_rev!=="d8f8168")bad.push("rev");if(s.length!==tape.length||s.some((x,i)=>x.scene!==tape[i][0]||x.command!==tape[i][1]))bad.push("steps ungleich tape");const sc=n=>s.filter(x=>x.scene===n);const txt=n=>sc(n).flatMap(x=>(x.lines||[]).map(l=>l.text)).join("\n");const p1=sc(1).find(x=>/--provision$/.test(x.command));const p3=sc(3).find(x=>/--provision$/.test(x.command));if(!/"conwayApiUrl": *"https:\/\/api\.conway\.tech"/.test(txt(1)))bad.push("szene 1 zeile");if(!p1||p1.exit_code===0||!/Provision failed/.test(txt(1)))bad.push("szene 1 fehler");if(!/"conwayApiUrl": *"https:\/\/automatonhost\.com"/.test(txt(2)))bad.push("szene 2 zeile");if(!p3||p3.exit_code!==0||!/<api key hidden>/.test(txt(3)))bad.push("szene 3 anmeldung");if(!/Turn [^:]+: [0-9]+ tools/.test(txt(3)))bad.push("szene 3 runde");if(bad.length){console.error(bad);process.exit(1)}console.log("aufnahme ok "+s.length)'` muss `aufnahme ok <n>` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const raw=fs.readFileSync("docs/video/umzug.transcript.json","utf8")+fs.readFileSync("docs/video/umzug.tape","utf8");const t=JSON.parse(fs.readFileSync("docs/video/umzug.transcript.json","utf8"));const txt=(t.steps||[]).flatMap(x=>(x.lines||[]).map(l=>l.text)).join("\n");const keys=[...txt.matchAll(/"apiKey"\s*:\s*"([^"]*)"/g)].map(m=>m[1]);const bad=[];if(/[0-9a-fA-F]{64}/.test(raw)||/[0-9a-fA-F]{64}/.test(txt))bad.push("hex64");if(!keys.length||keys.some(k=>k!=="<api key hidden>"))bad.push("apiKey "+keys.length);if(bad.length){console.error(bad);process.exit(1)}console.log("kein schluessel")'` muss `kein schluessel` ausgeben.
      Prüfung: `cat docs/video/umzug.transcript.json docs/video/umzug.tape | grep -oiE '0x[0-9a-f]{40}' | grep -viF 0x2f2817d4985991ba3c078edb4e7d328b051c8098 | wc -l` muss `0` ausgeben.
      Prüfung: `bash ops/video-record.sh --selftest 2>&1 | tail -n 1` muss genau `VIDEO RECORD SELFTEST OK` ausgeben (ohne Netz, gegen Attrappen, in beide Richtungen: Sandbox auch bei Fehler gelöscht, Zeile mit Schlüssel zurückgehalten, 402 endet mit `VIDEO RECORD FAIL credits`, Conway ohne Fehler endet mit `VIDEO RECORD FAIL conway answered`).
      Prüfung: `bash ops/video-record.sh --recrod > /dev/null 2>&1; echo "exit=$?"` muss genau `exit=1` ausgeben.
      Prüfung (Netz): `bash ops/video-record.sh --verify 2>&1 | tail -n 1` muss `VIDEO VERIFY OK key_prefix_seen=yes inference_rows=<n>` mit n mindestens 1 ausgeben (Ledger der Produktion nur lesend, `readonly: true`: ein Schlüssel mit dem `keyPrefix` des Transkripts für `LIVE_SANDBOX_ADDRESS`, angelegt in der Zeit der Aufnahme, und Inferenz dieses Kontos in derselben Zeit).
- [x] Das Video zeigt jede aufgenommene Zeile in ihrer Reihenfolge, kürzt nur Wartezeiten und bleibt unter 30 Sekunden, und das
      Werkzeug kennt nur seine Argumente.
      MVP: Funktion, weil ein Video, das Zeilen weglässt oder länger als 30 Sekunden läuft, gestellt wirkt oder nicht zu Ende gesehen wird.
      Prüfung: `PATH=/usr/bin:$PATH node ops/video-render.mjs --plan 2>&1 | tail -n 1` muss `video plan: <f> frames, <s> s, 4 scenes, <l> lines, 0 defects` ausgeben, mit s höchstens 30 und l gleich der Zahl aller Zeilen unter `lines` im Transkript.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/video-render.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "keeps every recorded line in the timeline in its order" "fails when a recorded line is missing" "caps a pause at one second" "fails when the video would run longer than 30 seconds" "fails when scene 1 does not show an error from api.conway.tech" "fails when scene 3 does not reach a turn" "rejects a transcript with an api key" "exits 1 on an unknown argument before the browser"; do grep -qF "\"$t\"" test/video-render.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `node ops/video-render.mjs --pln; echo "exit=$?"; git status --porcelain docs/soll docs/video src/public | wc -l` muss `exit=1` und danach `0` ausgeben.
- [x] Die SOLL-Bilder kommen aus ihren Quellen, ohne Netz und ohne Mangel: Startseite und Fehlerseiten mit dem Block `video` unter
      `move` und `fix`, beide Blöcke weiter im ersten Bildschirm, dazu die vier Schlüsselbilder aus dem echten Transkript.
      MVP: Funktion, weil Seiten und Video nur nach Bild gebaut werden dürfen und die eine Zeile ohne Scrollen sichtbar bleiben muss.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-errors.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o)"; rm -rf $T` muss genau `exit=0 soll errors: 6 images, blocks end 390=<y> 1440=<y>, 0 defects` ausgeben, mit y bei 390 höchstens 844 und bei 1440 höchstens 900.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf PATH=/usr/bin:$PATH node ops/video-render.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o)"; rm -rf $T` muss genau `exit=0 video soll: 4 images, 0 defects` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const bad=[];const blk=f=>{const i=f.indexOf("data-soll=\"video\"");return {i,b:i<0?"":f.slice(i,f.indexOf("</video>",i)+8)}};const chk=(name,f,after)=>{const {i,b}=blk(f);if(i<0){bad.push(name+" kein block video");return}if(!(after>=0&&after<i))bad.push(name+" block nicht nach "+name);for(const w of ["<video","preload=\"none\"","umzug-poster.png","umzug.mp4","type=\"video/mp4\"","controls"])if(!b.includes(w))bad.push(name+" fehlt "+w);if(/autoplay|<script/i.test(b))bad.push(name+" autoplay oder script");if(/[\u2013\u2014]/.test(b))bad.push(name+" gedankenstrich")};const s=fs.readFileSync("docs/soll/src/startseite.html","utf8");const m=s.indexOf("id=\"move\"");chk("move",s,m<0?-1:s.indexOf("</section>",m));for(const x of ["verify-500-database-error","invalid-or-expired-nonce","credits-never-granted"]){const f=fs.readFileSync("docs/soll/src/errors-"+x+".html","utf8");const u=f.indexOf("data-soll=\"fix\"");chk(x,f,u)}if(bad.length){console.error(bad);process.exit(1)}console.log("block video ok")'` muss `block video ok` ausgeben.
      Prüfung: `node --input-type=module -e 'import fs from "node:fs"; import { decodePng } from "./ops/soll-assess.mjs"; const bad = []; for (const n of [1, 2, 3, 4]) { const f = "docs/soll/video-umzug-" + n + "-1280.png"; if (!fs.existsSync(f)) { bad.push("fehlt " + f); continue; } const p = decodePng(fs.readFileSync(f)); if (p.width !== 1280 || p.height !== 720) bad.push(f + " " + p.width + "x" + p.height); } if (bad.length) { console.error(bad); process.exit(1); } console.log("schluesselbilder ok")'` muss `schluesselbilder ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const css=(fs.readFileSync("src/public/index.html","utf8").match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join("");const q=String.fromCharCode(96);const r=fs.readFileSync("docs/soll/README.md","utf8");const m=r.match(/^## Video \(goals\/reichweite\/03\)$([\s\S]*?)(?=^## |$(?![\s\S]))/m);const sec=m?m[1]:"";const cl=new Set();for(const f of ["startseite","errors-verify-500-database-error","errors-invalid-or-expired-nonce","errors-credits-never-granted"]){const s=fs.readFileSync("docs/soll/src/"+f+".html","utf8");const i=s.indexOf("data-soll=\"video\"");if(i<0)continue;const b=s.slice(s.lastIndexOf("<",i),s.indexOf("</video>",i));for(const x of b.matchAll(/class="([^"]+)"/g))for(const c of x[1].split(/\s+/))if(c)cl.add(c)}const neu=[...cl].filter(c=>!new RegExp("\\."+c.replace(/[.*+?^${}()|[\]\\-]/g,"\\$&")+"(?![\\w-])").test(css));const ohne=neu.filter(c=>!sec.includes(q+"."+c+q));if(!m||ohne.length||neu.length>3){console.error({neu,ohne});process.exit(1)}console.log("bausteine ok neu="+neu.length)'` muss `bausteine ok neu=<n>` mit n höchstens 3 ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); m() { sed -n '/<section class="hero" id="move" data-soll="move">/,/<\/section>/p'; }; a=$(git show $B:docs/soll/src/startseite.html | m | sha256sum); b=$(m < docs/soll/src/startseite.html | sha256sum); [ "$a" = "$b" ] && [ -n "$(m < docs/soll/src/startseite.html)" ] && echo move gleich` muss `move gleich` ausgeben.
- [x] Der Design Reviewer hat genau diese zwölf Bilder abgenommen, bevor Video, Standbild oder Block in die Seiten kamen.
      MVP: Funktion, weil Seiten und Video 1:1 nach einem abgenommenen Bild entstehen und nicht nach einer Beschreibung.
      Prüfung: `grep -cE '^Abnahme-Issue video: PRO-[0-9]+$' docs/soll/README.md` muss `1` ausgeben.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue video: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- 'docs/soll/video-umzug-*.png' 'docs/soll/errors-*.png' 'docs/soll/src/errors-*.html' docs/soll/startseite-390.png docs/soll/startseite-1440.png docs/soll/src/startseite.html); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/public/video src/public/index.html src/public/error-pages.ts | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok.filter(x=>x>t))<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [x] Video, Standbild und GIF erfüllen Entscheidung 6 und gehören zu genau diesem Transkript und Tape.
      MVP: Funktion, weil ein Video mit Ton, ohne schnellen Start oder zu groß auf dem Telefon nicht abgespielt wird.
      Prüfung: `PATH=/usr/bin:$PATH node ops/video-assess.mjs 2>&1 | tail -n 1` muss `video files: mp4 1280x720 <d> s, poster 1280x720, gif 800 px, 0 defects` mit d höchstens 30 ausgeben.
      Prüfung: `T=$(mktemp -d); sed 's/Change one line/Change two lines/' docs/video/umzug.tape > $T/t.tape; PATH=/usr/bin:$PATH node ops/video-assess.mjs --tape $T/t.tape > $T/o 2>&1; echo "exit=$?"; rm -rf $T` muss `exit=1` ausgeben.
      Prüfung: `T=$(mktemp -d); node -e 'const fs=require("fs");const t=JSON.parse(fs.readFileSync("docs/video/umzug.transcript.json","utf8"));const st=t.steps.find(x=>x.lines&&x.lines.length>1);st.lines.splice(1,1);fs.writeFileSync(process.argv[1],JSON.stringify(t,null,2)+"\n")' $T/t.json; PATH=/usr/bin:$PATH node ops/video-assess.mjs --transcript $T/t.json > $T/o 2>&1; echo "exit=$?"; rm -rf $T` muss `exit=1` ausgeben (eine fehlende Zeile im Transkript passt nicht mehr zum Hash im Video).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/video-assess.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "accepts the committed video files" "rejects an mp4 with an audio track" "rejects an mp4 longer than 30 seconds" "rejects an mp4 whose moov comes after mdat" "rejects an mp4 that is not 1280x720" "rejects an mp4 whose transcript hash does not match" "rejects a gif wider than 800 px or larger than 3 MB" "rejects a poster that differs from key frame 2"; do grep -qF "\"$t\"" test/video-assess.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `stat -c %s src/public/video/umzug.mp4 docs/video/umzug.gif | paste -sd' '` muss zwei Zahlen ausgeben, die erste höchstens 2097152, die zweite höchstens 3145728.
- [x] Die Seiten liefern das Video aus und spielen es erst auf Klick: Route mit Range-Anfragen, CSP mit `media-src 'self'`, Block
      `video` auf Startseite und Fehlerseiten, und die echten Seiten sind pixelgleich mit ihren abgenommenen Bildern.
      MVP: Funktion, weil das Video ohne Range-Antwort auf dem iPhone und ohne `media-src` in keinem Browser läuft.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/video.test.ts test/error-pages.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "serves the video as mp4 with accept-ranges" "answers a range request with 206 and content-range" "answers an unsatisfiable range with 416" "serves the poster as png" "answers 404 for any other file under /video/" "embeds the video below the move block on the start page" "embeds the video below the fix block on every error page" "loads the video only on play"; do grep -qF "\"$t\"" test/video.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); a=$(git show $B:deploy/Caddyfile | grep -o 'Content-Security-Policy "[^"]*"'); b=$(grep -o 'Content-Security-Policy "[^"]*"' deploy/Caddyfile | sed "s/ media-src 'self';//"); [ -n "$a" ] && [ "$a" = "$b" ] && grep -q "media-src 'self';" deploy/Caddyfile && [ "$(git diff $B HEAD -- deploy/Caddyfile | grep -cE '^[-+][^-+]')" = 2 ] && echo csp ok` muss `csp ok` ausgeben.
      Prüfung: `T=$(mktemp -d); sed "s#/var/log/caddy/access.log#$T/access.log#" deploy/Caddyfile > $T/Caddyfile && PATH=$HOME/.local/bin:$PATH caddy validate --config $T/Caddyfile --adapter caddyfile 2>&1 | tail -1; rm -rf $T` muss eine Zeile ausgeben, die `Valid configuration` enthält.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live.mjs --out $T/s.html && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check --source $T/s.html > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live-errors.mjs --out $T && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-errors.mjs --check --source $T > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const app = createApp({ db: openDb(":memory:") }); const x = await (await app.request("/sitemap.xml")).text(); const bad = []; if (x.includes("/video/")) bad.push("sitemap"); for (const p of ["/", "/errors/verify-500-database-error", "/errors/invalid-or-expired-nonce", "/errors/credits-never-granted"]) { const h = await (await app.request(p)).text(); if (!/<video[^>]*preload="none"/.test(h) || /<video[^>]*autoplay/.test(h) || !h.includes("src=\"/video/umzug.mp4\"")) bad.push(p); } const r = await app.request("/video/umzug.mp4", { headers: { Range: "bytes=0-99" } }); if (r.status !== 206 || r.headers.get("content-type") !== "video/mp4") bad.push("range " + r.status); if (bad.length) { console.error(bad); process.exit(1); } console.log("eingebunden ok")'` muss `eingebunden ok` ausgeben.
- [x] Das README zeigt das GIF direkt unter der Zeile `conwayApiUrl` und bleibt sonst Zeichen für Zeichen.
      MVP: Funktion, weil Agenten und Betreiber auf GitHub zuerst das README lesen und dort sehen sollen, was die eine Zeile bewirkt.
      Prüfung: `node -e 'const r=require("fs").readFileSync("README.md","utf8").split("\n");const i=r.findIndex(l=>l.startsWith("\u0060\u0060\u0060json"));let j=i+1;while(j<r.length&&!r[j].startsWith("\u0060\u0060\u0060"))j++;const n=r.slice(j+1).find(l=>l.trim()!=="");const ok=i>=0&&/^\[!\[[^\]]+\]\(docs\/video\/umzug\.gif\)\]\(https:\/\/automatonhost\.com\/fix\)$/.test(n||"");if(!ok||!r.slice(i,j).join("\n").includes("conwayApiUrl")){console.error(n);process.exit(1)}console.log("readme ok")'` muss `readme ok` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); git diff $B HEAD -- README.md | grep -E '^[-+][^-+]' | grep -vcE '^\+(\[!\[[^]]+\]\(docs/video/umzug\.gif\)\]\(https://automatonhost\.com/fix\))?$'` muss `0` ausgeben.
- [x] `ops/video-starts.mjs` zählt die Starts des Videos je Woche nach Seite, lässt eigene Adressen, den eigenen Prüfer und Crawler
      aus und nennt nie eine Adresse.
      MVP: Funktion, weil die Leitzahl dieses Glieds sonst unsichtbar bleibt und der Kurs-Check nicht sieht, ob das Video gesehen wird.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/video-starts.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "counts a start on the start page" "counts a start on an error page" "counts an address once per window" "counts a 206 range request as a start" "leaves out our own addresses and our checker" "leaves out crawlers" "leaves out requests outside the window" "ends with exit 2 when the log cannot be read" "prints no address"; do grep -qF "\"$t\"" test/video-starts.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); printf '%s\n' '{"ts": 1790107010.0, "status": 206, "request": {"remote_ip": "192.0.2.7", "client_ip": "192.0.2.7", "uri": "/video/umzug.mp4", "headers": {"User-Agent": ["Mozilla/5.0 (iPhone) Safari/604.1"], "Referer": ["https://automatonhost.com/"]}}}' '{"ts": 1790107011.0, "status": 206, "request": {"remote_ip": "192.0.2.7", "client_ip": "192.0.2.7", "uri": "/video/umzug.mp4", "headers": {"User-Agent": ["Mozilla/5.0 (iPhone) Safari/604.1"], "Referer": ["https://automatonhost.com/"]}}}' '{"ts": 1790107020.0, "status": 200, "request": {"remote_ip": "198.51.100.9", "client_ip": "198.51.100.9", "uri": "/video/umzug.mp4", "headers": {"User-Agent": ["Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0"], "Referer": ["https://automatonhost.com/errors/invalid-or-expired-nonce"]}}}' '{"ts": 1790107030.0, "status": 200, "request": {"remote_ip": "203.0.113.5", "client_ip": "203.0.113.5", "uri": "/video/umzug.mp4", "headers": {"User-Agent": ["Googlebot/2.1"], "Referer": ["https://automatonhost.com/"]}}}' > $T/a.log; : > $T/own; CP_NOW=1790110000 PATH=/usr/bin:$PATH node ops/video-starts.mjs --log $T/a.log --own-ips $T/own; echo "exit=$?"; rm -rf $T` muss genau diese zwei Zeilen ausgeben: `video_starts days 7 total 2 home 1 errors 1 other 0` und `exit=0`.
      Prüfung: `PATH=/usr/bin:$PATH node ops/video-starts.mjs --log /nonexistent/access.log > /dev/null 2>&1; echo "exit=$?"` muss `exit=2` ausgeben.
      Prüfung (Netz): `bash -c 'set -a; . ~/.config/control-plane/loop.env; set +a; PATH=/usr/bin:$PATH node ops/video-starts.mjs' | grep -cE '^video_starts days 7 total [0-9]+ home [0-9]+ errors [0-9]+ other [0-9]+$'` muss genau `1` ausgeben.
- [x] Die Entscheidungen stehen in `goals/reichweite/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg,
      kein neues Paket, und nichts im Repo nennt einen Schlüssel, eine Adresse oder einen Namen eines Kunden.
      MVP: Funktion, weil ein späteres Video oder Goal wissen muss, wie die Aufnahme entstand und warum sie in einer Sandbox lief.
      Prüfung: `grep -cE '^- [0-9-]+, reichweite 03: ' goals/reichweite/ANNAHMEN.md` muss mindestens `10` ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/app\.ts|src/public/index\.html|src/public/error-pages\.ts|src/public/video/umzug\.mp4|src/public/video/umzug-poster\.png|deploy/Caddyfile|README\.md|ops/video-record\.sh|ops/video-render\.mjs|ops/video-assess\.mjs|ops/video-starts\.mjs|ops/soll[a-z-]*\.mjs|ops/browser\.mjs|docs/video/.*|docs/soll/.*|docs/.*\.md|test/.*\.ts|test/fixtures/video/.*|goals/reichweite/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- package.json pnpm-lock.yaml src/public/fix.ts src/payments src/auth src/bounties src/credits ops/traffic.sh ops/error-pages-arrivals.mjs ops/automaton-live.sh ops/relink-comments.py ops/relink_rules.py ops/relinked-comments.log ops/post-the-answers.py harness | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss `0` ausgeben.
      Prüfung: `cat goals/reichweite/ANNAHMEN.md ops/video-record.sh ops/video-render.mjs ops/video-assess.mjs ops/video-starts.mjs docs/video/umzug.tape | grep -cE '[0-9a-fA-F]{64}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}'` muss `0` ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer auf der Startseite oder einer Fehlerseite auf das Standbild tippt, sieht in höchstens 30 Sekunden ohne Ton den echten Fehler
      von Conway, die eine geänderte Zeile und denselben Automaton, der bei uns weiterläuft.
- [ ] Jede Zeile im Video kam so aus dem unveränderten Automaton; nichts ist gestellt, nur Wartezeiten sind kürzer.
- [ ] Die Seiten laden das Video erst beim Abspielen; der erste Bildschirm der Startseite und der Fehlerseiten bleibt, wie er
      abgenommen ist.
- [ ] Kein Gedankenstrich in neuem Text, kein Schlüssel, kein Name und keine Wallet-Adresse eines Kunden, keine Zahl ohne Messung,
      nichts zu den Bedingungen des Einkaufs bei OpenRouter, kein Claude- oder Anthropic-Modell in der Aufnahme.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `deploy/**` außer der einen Zeile `Content-Security-Policy` in `deploy/Caddyfile` (Entscheidung 7)
- `src/**` außer `src/app.ts`, `src/public/index.html`, `src/public/error-pages.ts` und `src/public/video/`; `src/payments/**`,
  `src/auth/**`, `src/bounties/**`, `src/credits/**` und `src/public/fix.ts` bleiben unverändert
- `ops/traffic.sh`, `ops/error-pages-arrivals.mjs`, `ops/automaton-live.sh`, `ops/relink-comments.py`, `ops/relink_rules.py`,
  `ops/relinked-comments.log`, `ops/post-the-answers.py`: bleiben unverändert
- `ROADMAP.md`, `docs/kette.md` und die Goal-Dateien anderer Goals; in deren `ANNAHMEN.md` nur Zeilen `Abgelöst:`, die der Tech Lead
  entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket; ffmpeg nur über `uvx` außerhalb des Repos, nie ein Binärprogramm im Repo
- Produktion nur über `ops/video-record.sh`: `--record` als Kunde mit dem eigenen Konto (Sandbox anlegen und löschen, Anmeldung,
  Inferenz), `--verify` nur lesend (`readonly: true`); keine andere Anfrage an `automatonhost.com`, `76.13.144.207` oder den
  Sandbox-Server, kein Rollout, kein Neustart, nichts von Hand auf einem Server
- `api.conway.tech` nur mit dem einen `automaton --provision` der Szene 1 je Aufnahme; in `Conway-Research/automaton` kein Kommentar,
  kein Issue, kein PR, keine Änderung; kein X-Konto, kein anderes fremdes Repo
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10); der Schlüssel der
  eigenen Wallet wird nie ausgegeben, geloggt oder committet, der Schlüssel der Betreiber-Wallet nie gelesen
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 5
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-23 Zyklus 1: Punkte 1, 2, 3, 8 gebaut (echte Aufnahme in einer Sandbox des eigenen Kontos am 23.11.2026 16:55 UTC mit `ops/video-record.sh` und `docs/video/umzug.tape`, Conway antwortete 401 „Invalid or expired nonce“; `ops/video-render.mjs` mit Zeitplan 24,7 s und vier Schlüsselbildern; SOLL-Quellen und -Bilder von Startseite und Fehlerseiten mit dem Block `video`; dazu schon `ops/video-assess.mjs`, `ops/video-starts.mjs`, Route `/video/:file`, `media-src 'self'` in der CSP und `test/video.test.ts`), Abnahme beim Design Reviewer auf PRO-28535 angefragt; Punkte 4 bis 7, 9 und 10 warten auf „SOLL abgenommen“, weil Video, Standbild, GIF, Block der Seiten und README erst danach entstehen. Jeder neue Test war einmal rot: `test/video-render.test.ts` alle 8 mit Mutationen in `ops/video-render.mjs` (Wartezeit ungekappt, 30-s-Grenze, Szene-1- und Szene-3-Prüfung, Schlüsselprüfung, Zeilenprüfung aus, Browser vor der Argumentprüfung), `test/video-starts.test.ts` alle 9 gegen einen falschen Stub, `test/video-assess.test.ts` je Test mit einer abgeschalteten Prüfung und „accepts the committed video files“ heute rot, weil die Dateien fehlen, `test/video.test.ts` 4 von 8 rot ohne Block und ohne Dateien (die Route lief mit einer lokalen Probefassung 4 von 4 grün, 404 zuerst rot wegen 405 aus `c.notFound()`), `ops/video-record.sh --selftest` mit 11 Fällen in beide Richtungen. Prüfbefehle: Punkt 1 `aufnahme ok 7`, `kein schluessel`, `0`, `VIDEO RECORD SELFTEST OK`, `exit=1`, (Netz) `VIDEO VERIFY OK key_prefix_seen=yes inference_rows=1`; Punkt 2 `video plan: 743 frames, 24.7 s, 4 scenes, 27 lines, 0 defects` (27 Zeilen im Transkript), vitest grün, keine fehlende Testzeile, `exit=1` und `0`; Punkt 3 `exit=0 0 defects`, `exit=0 soll errors: 6 images, blocks end 390=728 1440=669, 0 defects`, `exit=0 video soll: 4 images, 0 defects`, `block video ok`, `schluesselbilder ok`, `bausteine ok neu=1`, `move gleich`; Punkt 4 Zeile `1`, Abnahme offen; Punkt 6 `csp ok`, `Valid configuration`; Punkt 8 vitest grün, keine fehlende Testzeile, die zwei erwarteten Zeilen, `exit=2`, (Netz) `1`; Punkt 9 `13`, `0`, `0`, `0`, `0`; Punkt 10 rot, solange die Dateien fehlen.
- 2026-11-23 Zyklus 2: Punkte 2, 3 gebaut (Befund 1 des Design Reviewers: Schrift im Video bei 390 zu klein). Jeder Schriftgrad im Video ist jetzt mindestens 44 px auf 1280, bei 358 px Breite (390er Seite, gemessen) also mindestens 12,3 px; Terminal mit 10 ganzen Reihen zu 46 Zeichen, jede Zeile mindestens 100 ms ganz im Bild, Video 26,3 s; zwölf Bilder neu, Satz unter dem Video „26 seconds“. Neue Tests in `test/video-render.test.ts` waren rot: zuerst ohne die Exporte (3 rot), dann je mit einer Mutation in `ops/video-render.mjs` (Zeilen 16 px, kein Mindestmoment, Sichtprüfung aus, Reihengrenze aus), jede kippt ihren Test. Prüfbefehle: Punkt 2 `video plan: 789 frames, 26.3 s, 4 scenes, 27 lines, 0 defects`, vitest grün, keine fehlende Testzeile, `exit=1` und `0`; Punkt 3 `exit=0 0 defects`, `exit=0 soll errors: 6 images, blocks end 390=728 1440=669, 0 defects`, `exit=0 video soll: 4 images, 0 defects`, `block video ok`, `schluesselbilder ok`, `bausteine ok neu=1`, `move gleich`.
- 2026-11-23 Breaker no_progress_runs (PRO-28570): Status BLOCKED umgebung, kein Bauversuch. Commit `d606bc9` (Video, Standbild, GIF, Block in den Seiten, README) kam ohne Zeile im Progress Log auf den Branch, die Häkchen der Punkte 4, 5, 6, 7 und 9 lagen nur ungesichert im Arbeitsbaum und sind verworfen. Prüfbefehle: Punkt 4 `grep -cE` 1, Punkt 7 README-Diff 0, `stat` 830978 und 1229603 Byte, Job `check` an PR #409 rot (`test/werbung.test.ts`), Job `e2e` grün.
- 2026-11-23 Zyklus 4: nach Changes requested des Tech Lead (Entscheidung `86b3c6a`: Folge `move`, `video`, `card` gewollt) Status zurück auf ACTIVE, Blockers und Ehrliche Lücken geleert; als Nächstes die Testdateien der Karte, der vollständige Vergleich der Prüfbefehle fertiger Goals und `check`.
- 2026-11-23 Zyklus 4: `test/card-checkout.test.ts` und `test/werbung.test.ts` finden den Kartenblock an seinem Kopf und prüfen die Folge `move`, `video`, `card`; der Test „puts the card block right after the move block“ heißt jetzt „puts the card block right after the video block below the move block“, der Hash-Teil bleibt. Rot gesehen mit Video hinter der Karte in `src/public/index.html` (2 rot, 30 grün), danach `Tests 32 passed (32)`.
- 2026-11-23 Zyklus 4: Vergleich der Prüfbefehle fertiger Goals gestartet: 54 Goals aus der grep-Liste, 1351 Befehle ohne Netz (93 mit Netz und 18 mit Zugriff auf die Produktion übersprungen), je am Kopf von `dev` und am Kopf `509d144`, sechs Worker mit eigenen Worktrees, Ergebnisse fortlaufend in `~/.cache/cp-cmp-reichweite03/results.jsonl` auf dem code-host.
- 2026-11-23 Zyklus 4: Vergleich der Prüfbefehle fertiger Goals vollständig (54 Goals, 1351 Befehle ohne Netz, Kopf `509d144` gegen `dev` `6733bbb`): 1174 einzeln gefahren, 125 reine vitest-Befehle aus je einem vollen vitest-Lauf mit JSON-Reporter abgeleitet (0 abweichend), 52 sind `node scripts/check.mjs`. Abweichungen: 96 Diff-Prüfungen gegen `origin/dev` oder die Merge-Basis geben mit `HEAD` statt `origin/dev` (Zustand nach dem Merge) genau das Ergebnis von `dev`; Selbsttests und Testdateien, die unter Last (bis 234) auf einer Seite rot waren, sind einzeln auf beiden Seiten grün (77 und 38 Tests, `TIMEOUT QUOTE SELFTEST OK`, `LIVE SELFTEST OK`, `CADDY RETRY SELFTEST OK`); übrige Unterschiede nur in Bytezahl, Seitenhöhe und Laufzeit. Wegen der neuen Lage anders: karte 02 Punkt 4 (Zeile 175) und Punkt 6 (Zeilen 188, 189), drei Zeilen `Abgelöst:` in `goals/karte/ANNAHMEN.md`. Aus anderem Grund rot: seite 03 Zeile 111 (`git grep` nach `\bumzug\b` gibt am Kopf 51 statt 0, alle Treffer der vorgeschriebene Dateiname `umzug`), Frage an den Tech Lead.
- 2026-11-23 Zyklus 4: Punkte 4, 5, 6, 7, 9, 10 abgehakt, alle Prüfbefehle am Kopf nach `3d11178`. Prüfbefehle: Punkt 4 `1`, (Netz) `abnahme ok 1`; Punkt 5 `video files: mp4 1280x720 26.3 s, poster 1280x720, gif 800 px, 0 defects`, `exit=1`, `exit=1`, vitest Exit 0, keine fehlende Testzeile, `830978 1229603`; Punkt 6 vitest Exit 0, keine fehlende Testzeile, `csp ok`, `Valid configuration`, `exit=0 0 defects` (Startseite), `exit=0 0 defects` (Fehlerseiten), `eingebunden ok`; Punkt 7 `readme ok`, `0`; Punkt 9 `17`, `0`, `0`, `0`, `0`; Punkt 10 `check: grün in 125 s` (272 Testdateien, 2792 Tests). `check` an `dev` zum Vergleich ebenfalls grün (268, 2755). Offen: Punkt 11 und die Entscheidung des Tech Lead zu seite 03 Zeile 111.

## Blockers

## Ehrliche Lücken
