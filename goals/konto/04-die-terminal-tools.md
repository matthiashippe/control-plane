# Konto Goal 04: Die Terminal-Tools

## Status
ACTIVE

## Active Objective
Wer in Claude Code arbeitet und keine Wallet hat, startet einen Automaton mit einem Satz: Das Plugin bringt `mcp/server.mjs` und
einen Skill mit, `start_automaton` nimmt Genesis-Prompt, Name und Tageslimit, zeigt den QR-Code des Handoffs aus konto 02, wartet
über den Strom auf das Konto aus konto 03 und startet dann mit dem neuen API-Schlüssel den Automaton aus sandbox 08. Dazu kommen
`automaton_status`, `automaton_logs`, `set_daily_limit` und `stop_automaton`. Das Tageslimit sinkt im Terminal sofort; erhöhen
geht nur über einen neuen Handoff, bei dem der Mensch auf dem Handy mit seinem vorhandenen Passkey eine neue Abbuchungserlaubnis
unterschreibt, und die alte widerruft der Server, bevor er aus der neuen abbucht. Auf der Maschine des Nutzers liegt nur der
API-Schlüssel, nie ein Wallet-Schlüssel. Belegt im Harness vom Aufruf `start_automaton` bis zum ersten Turn der Runtime in der
Sandbox, ohne Browser außer dem nachgebildeten Handoff, und die Erhöhung einmal echt auf Base Sepolia. Widerlegt, wenn ein Tool das
Tageslimit ohne Handoff erhöhen kann. Dazu Grundregel 12 auf der Handy-Seite: Die Zustände `freigabe`, `erledigt` und `ungueltig`
heißen im Code `approve`, `approved` und `invalid` (`ROADMAP.md`, konto 04; Grundsatz in `docs/kette.md`, Abschnitt konto).
Übernimmt goals/_vorschlaege/konto-nacharbeit-2026-11-14-1.md.
MVP: Funktion, weil die meisten Nutzer aus Claude Code im Terminal kommen und ohne diese Tools keiner von ihnen einen Automaton
startet, und weil konto 05 Einzahlung und Auszahlung als weitere Tools in genau diesen Server hängt.

## Voraussetzungen
- sandbox Goal 08 DONE
- konto Goal 03 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Mensch ohne Wallet tippt in Claude Code „starte einen Automaton, der …“, scannt einen QR-Code, tippt
  auf dem Handy eine Zahl und den Passkey, und eine Minute später denkt sein Automaton in einer Sandbox, bezahlt aus seinem Konto,
  ohne dass eine Prompt-Injection im Terminal mehr als das Tageslimit erreicht.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte):
  1. Zuerst die SOLL-Bilder der Erhöhung (Punkte 1 und 2), Commit, Push, den Design Reviewer auf dem Topic dieses Goals mit allen
     Bildpfaden und dem Commit erwähnen und die Zeile `Abnahme-Issue limit: PRO-<n>` in `docs/soll/README.md` setzen. Bis „SOLL
     abgenommen“ dasteht, ändert der Maker nichts unter `src/public/`, auch nicht für die Umbenennung (Punkt 3 prüft das an den
     Zeitstempeln). Die Zeilen `Abnahme-Issue: PRO-18819`, `Abnahme-Issue handoff: PRO-19925` und `Abnahme-Issue konto: PRO-20104`
     bleiben, wie sie sind.
  2. Während der Abnahme die Teile ohne Fläche: Tools im MCP-Server (Punkt 7), Plugin und Skill (Punkt 8), Limit auf dem Server
     (Punkt 6), Commit, Push.
  3. Nach der Abnahme die Umbenennung (Punkt 5), dann die beiden neuen Zustände der Seite (Punkt 4), Commit, Push.
  4. Dann der Harness-Lauf (Punkt 9), der Lauf auf Base Sepolia (Punkt 10), Vertrag und Annahmen (Punkt 11), zuletzt Punkt 12.
- Den Automaton legt die Schnittstelle aus sandbox 08 an. Die Tools rufen genau ihre Routen (anlegen mit Genesis-Prompt und Name,
  Zustand, Log, Stopp) mit dem API-Schlüssel des Kontos; dieses Goal baut keine zweite Route für denselben Zweck. Fehlt dort Log
  oder Stopp, ergänzt das Goal sie an derselben Stelle, in den Dateien, die sandbox 08 dafür angelegt hat, und schreibt das mit
  Grund in `goals/konto/ANNAHMEN.md`.
- Entscheidungen des Tech Lead (Maker schreibt sie mit Grund unter `## Goal 04` in `goals/konto/ANNAHMEN.md`):
  1. `start_automaton` antwortet sofort mit `qr`, `url` und `match` und nie mit `poll_token`, weil Claude Code ein Ergebnis erst
     zeigt, wenn der Aufruf endet, und der Mensch den QR-Code sehen muss, solange der Code zehn Minuten gilt. Den Strom
     `GET /v1/handoff/{code}` hält der MCP-Server im Hintergrund offen; `automaton_status` meldet `waiting_for_phone`, `matched`,
     `starting`, `running`, `stopped` oder `failed` mit Grund. Bei `burned` oder `expired` legt der nächste `start_automaton` einen
     neuen Handoff an, nie wiederholt er den alten Code.
  2. Der API-Schlüssel aus dem ersten Ereignis `done` landet in der Datei aus `CP_KEY_FILE` (Vorgabe
     `~/.config/control-plane/api-key`), angelegt mit Modus 0600; eine vorhandene Datei mit Rechten für Gruppe oder andere liest
     der Server nicht und meldet `key_file_mode`. `CP_API_KEY` bleibt wie heute und geht vor. Liegt schon ein Schlüssel vor,
     startet `start_automaton` ohne neuen Handoff. Der Schlüssel steht in keinem Tool-Ergebnis und keiner Zeile auf stderr
     (`redact`).
  3. Die erste Zahlung, die die Seite zeigt, ist die erste Abbuchung: Für `step: "konto"` ohne `amount_usdc` setzt der Server das
     Minimum aus `CP_KONTO_TOPUP_USDC` und Tageslimit, ein anderer Wert ergibt 400; das Tool schickt das Feld nicht. Antwortet der
     Start nach `done` mit 402, weil das Nachbuchen aus konto 03 im Hintergrund läuft, liest das Tool den Kontostand und versucht es
     höchstens 90 Sekunden lang erneut, danach `failed` mit Klartext.
  4. Senken: `POST /v1/konto/limit` mit API-Schlüssel und `daily_limit_usdc` speichert eine Obergrenze je Konto, die `topUpIfLow`
     zusätzlich zum Rest der Periode einhält (gebucht höchstens Obergrenze minus schon Abgebuchtes der laufenden Periode). Ein Wert
     über der Grenze der gültigen Erlaubnis ergibt 403 mit `error: "limit_raise_needs_phone"` und ändert nichts. Die Entscheidung
     trifft eine exportierte Funktion `isLowering` in `src/konto/limit.ts`, die Gegenprobe des Prüfbefehls.
  5. Erhöhen: `POST /v1/handoff` mit `step: "limit"`, API-Schlüssel eines Kontos und dem neuen `daily_limit_usdc` (größer als das
     heutige, sonst 400; ohne Schlüssel 401). Die richtige Zahl führt nach `matched`, die Seite zeigt den Schritt `limit`, der
     Mensch unterschreibt mit seinem vorhandenen Passkey (Stempel per WebAuthn an Turnkey, ein Passkey-Dialog, kein neues Konto)
     eine neue Erlaubnis mit neuem `salt`, und `POST /h/{code}/limit` prüft sie mit `permissionMatches` und `signatureValid` gegen
     das Konto des Schlüssels und das neue Limit. Passt sie, wird der Handoff `done` (Ereignis mit `daily_limit_usdc`, ohne
     `api_key`); passt sie nicht, 400 und `burned`, die alte Erlaubnis gilt weiter. Vor der nächsten Abbuchung sendet der Server
     über `sendKontoTx` `approveWithSignature` für die neue und `revokeAsSpender` für die alte, damit on-chain nie zwei unserer
     Erlaubnisse zugleich gelten. Im MCP-Server entscheidet `raiseNeedsPhone`, ob `set_daily_limit` den Handoff braucht; der Server
     lehnt trotzdem jede Erhöhung ohne Handoff ab.
  6. Das Plugin liegt in `mcp/` (`mcp/.claude-plugin/plugin.json` mit `mcpServers` inline: `node ${CLAUDE_PLUGIN_ROOT}/server.mjs`,
     Skill `mcp/skills/automaton/SKILL.md`), der Katalog in `.claude-plugin/marketplace.json` an der Wurzel mit `source` `./mcp`,
     damit die eine Zeile `claude plugin marketplace add matthiashippe/control-plane && claude plugin install <plugin>@<katalog>`
     reicht. Der Katalog steht nicht in `merge_allowlist` von `gate.yaml`: Das Gate lehnt den Goal-PR deshalb mit Grund
     `allowlist` ab, und weil die Registrierung `human_inbox: tech-lead` nennt, prüft der Tech Lead genau diese eine Datei und
     merged; das ist erwartet und kein Fehler des Makers. `mcp/server.mjs` bleibt eine Datei ohne Pakete.
  7. Die Umbenennung trifft Code und Tests, nicht die abgenommenen Bilder und Quellen: `docs/soll/handoff-<zustand>-<breite>.png`
     und `docs/soll/src/handoff-<zustand>.html` behalten Namen und Inhalt (auch `data-soll="freigabe"` in der Quelle, weil konto 02
     Punkt 1 es nachts prüft), und die Summenzeilen `soll handoff: 6 Bilder, freigabe oben …` und `soll konto: 4 Bilder, passkey
     oben …` bleiben Zeichen für Zeichen, weil die Audits von konto 02 und 03 genau sie erwarten. Die Zuordnung vom Zustand zum
     Dateinamen steht an genau einer Stelle in `ops/soll-assess.mjs`, alles andere liest dort.
- Die Fläche: zwei neue Zustände der Handy-Seite für `step: "limit"`. `limit-approve` ist die Wahl der Zahl wie `approve` aus
  konto 02, zeigt aber das heutige und das neue Tageslimit statt der ersten Zahlung; der Block `data-soll="approve"` liegt ganz im
  ersten Bildschirm. `limit-passkey` sagt in der Überschrift, was beim Tippen passiert (etwa „Raise the daily limit for Atlas“),
  darunter in einer Zeile das neue Limit und an wen (etwa „PostYourPrice can charge up to $10.00 a day, only for Atlas.“), einen
  Knopf; der Block `data-soll="limit"` endet im ersten Bildschirm (844 px bei 390, 900 px bei 1440). Abbruch und Fehler zeigen
  den Zustand `fehlgeschlagen` aus konto 03 unverändert. Quellen `docs/soll/src/limit-<zustand>.html`, Bilder
  `docs/soll/limit-<zustand>-<breite>.png`, vier Stück, Beispielwerte erfunden (Name `Atlas`, 5.00 auf 10.00 USD). Werkzeuge
  `ops/soll-limit.mjs` (rendern, `--pruefen`, `--source <ordner>`) und `ops/soll-live-limit.mjs` nach dem Muster von
  `ops/soll-konto.mjs` und `ops/soll-live-konto.mjs`, die unverändert bleiben; die Summenzeile ist englisch. Höchstens drei neue
  Klassen, jede mit Grund als `` `.<klasse>` `` unter einem Abschnitt `## Limit /h/{code}` in `docs/soll/README.md`. Die Seite
  rendert beide Zustände aus `src/public/limit.ts`.
- Text: Englisch wie die Seite aus konto 02 und 03, ebenso Tool-Beschreibungen, Skill und `mcp/README.md`. Kein Wort, das der
  Nutzer erst übersetzen muss (`handoff`, `token`, `wallet`, `smart`, `permission`, `sepolia`, `turnkey`, `erc`, `allowance`);
  „passkey“ und „daily limit“ stehen. Der Skill sagt Claude, dass es `qr` unverändert in einem Codeblock zeigt, dazu `url` und
  `match`, und dann `automaton_status` abfragt, bis `running` oder `failed` dasteht.
- Der Harness-Lauf `harness/e2e/terminal.mjs` (in `harness/e2e/full.sh`, auf der Chain 84532 aus konto 03): startet
  `mcp/server.mjs` per stdio gegen das Control Plane des Harness, ruft `start_automaton`, spielt das Handy mit `fetch` nach
  (Seite lesen, Zahl wählen, Erlaubnis mit einem lokalen Konto aus viem als Eigentümer der Smart Wallet wie in
  `harness/e2e/konto-chain.mjs`), wartet über `automaton_status` auf `running` und auf den ersten Turn der Runtime (die erste
  Ledger-Zeile einer Inferenz für die Adresse des Kontos), dann `set_daily_limit` niedriger (gelingt), höher per API direkt
  (`limit_raise_needs_phone`), höher über den nachgebildeten Handoff (gelingt), ein `spend()` aus der alten Erlaubnis scheitert
  on-chain, zuletzt `stop_automaton`. Letzte Zeile `TERMINAL_VERDICT ok first_turn_ms=<n>`. Kein Browser.
- Der Lauf auf Base Sepolia (`ops/konto/sepolia-limit-run.mjs`, Ablauf und Chromium mit virtuellem Authenticator wie
  `ops/konto/sepolia-run.mjs`, frische Datenbank aus `mktemp -d`, freier Port auf `127.0.0.1`): ein neues Konto mit Tageslimit
  5.00 USD, die Testadresse zahlt 8 Test-USDC an das Konto, Erhöhung auf 10.00 USD mit demselben Passkey, Abbuchung von 6 USD aus
  der neuen Erlaubnis in einer Periode (mehr als das alte Limit), dann ein `spend()` aus der alten Erlaubnis mit festem Gas, das
  on-chain scheitert. Die Hashes stehen in `docs/konto/sepolia-limit.md` als Zeilen `konto: 0x…`, `spender: 0x…`,
  `erlaubnis-alt: 0x…`, `erlaubnis-neu: 0x…`, `widerruf: 0x…`, `abbuchung-neu: 0x…` und `alt-nach-widerruf: 0x…`. Turnkey-Werte
  und Testschlüssel liegen seit konto 03 auf dem code-host; kein Human Gate. Reicht das Test-Geld nicht, setzt der Maker
  `BLOCKED matthias` mit Aufgabe Faucet wie in konto 03, Schritt 5.
- Die SOLL-Befehle laufen mit der Schriftkonfiguration, mit der die Bilder gerendert sind; seit dem 15.11.2026 löst `sans-serif`
  auf dem code-host zu DejaVu Sans auf (Progress Log von konto 03, Zyklus 6). Ein Prüfbefehl, der nur deshalb Mängel meldet, ist
  ein Umgebungsproblem und steht so im Progress Log.
- Kein Schlüssel im Repo, auch nicht in Fixtures: Tests nutzen die bekannten Schlüssel von anvil oder `generatePrivateKey()` zur
  Laufzeit, API-Schlüssel in Tests sind erfunden und haben nicht die Form `cnwy_k_` gefolgt von 16 Zeichen. Prüfbefehle ohne Netz
  binden keinen festen Port (`app.request`, kein `serve`), Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` im Vordergrund
  mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Jeder neue Test war einmal rot, die Zeile im Progress Log
  sagt, womit.
- Was danach schneller zu mehr zahlenden Kunden führt: konto 05 hängt Einzahlung per Karte und Auszahlung als Tools in denselben
  Server und schaltet das Konto im Hauptnetz an; ab dann zahlt ein Mensch aus dem Terminal echtes Geld für seinen Automaton.

## Done Condition
- [x] Die vier SOLL-Bilder der Erhöhung kommen aus ihren Quellen, ohne Netz und ohne Mangel, Zahlenwahl und Passkey stehen ganz im
      ersten Bildschirm, und die Quellen bauen aus den Bausteinen der Seite.
      MVP: Funktion, weil die Seite nur nach Bild gebaut werden darf und der Mensch ohne Scrollen sehen muss, was er erlaubt.
      Prüfung: `node ops/soll-limit.mjs --pruefen` muss Exit 0 haben und als letzte Zeile `soll limit: 4 images, approve top 390=<y> 1440=<y>, limit top 390=<y> 1440=<y>, 0 defects` ausgeben, mit y bei 390 höchstens 844 und bei 1440 höchstens 900.
      Prüfung: `node -e 'const fs=require("fs");for(const z of ["approve","passkey"])for(const w of [390,1440]){const b=fs.readFileSync("docs/soll/limit-"+z+"-"+w+".png");if(b.readUInt32BE(16)!==w){console.error(z,w);process.exit(1)}}console.log("breiten ok")'` muss `breiten ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const bad=[];for(const z of ["approve","passkey"]){const s=fs.readFileSync("docs/soll/src/limit-"+z+".html","utf8");const t=s.replace(/<style[\s\S]*?<\/style>/g,"").replace(/<[^>]+>/g," ");if(/<script/i.test(s))bad.push(z+" script");if(!/<h1[ >]/.test(s))bad.push(z+" h1");if(/(src|srcset)="(https?:)?\/\/|<link[^>]+href="(https?:)?\/\/|url\(["\x27]?(https?:)?\/\//.test(s))bad.push(z+" fremde adresse");if(/[\u2013\u2014]/.test(s))bad.push(z+" gedankenstrich");if(/handoff|token|wallet|smart|permission|sepolia|turnkey|\berc|allowance/i.test(t))bad.push(z+" wort");if(!/Atlas/.test(t))bad.push(z+" name")}const a=fs.readFileSync("docs/soll/src/limit-approve.html","utf8");const ua=a.indexOf("data-soll=\"approve\"");const ba=ua<0?"":a.slice(ua);if(ua<0)bad.push("approve fehlt");if(!/<form[^>]+method="post"/i.test(ba))bad.push("form");if(new Set([...ba.matchAll(/<button[^>]*value="([0-9]{2})"/g)].map(m=>m[1])).size!==3)bad.push("drei zahlen");if(!/\$5\.00/.test(ba)||!/\$10\.00/.test(ba))bad.push("altes und neues limit");const p=fs.readFileSync("docs/soll/src/limit-passkey.html","utf8");const up=p.indexOf("data-soll=\"limit\"");const bp=up<0?"":p.slice(up);if(up<0)bad.push("limit fehlt");if(!/<button/i.test(bp))bad.push("knopf");if(!/passkey/i.test(bp))bad.push("wort passkey");if(!/\$10\.00/.test(bp))bad.push("neues limit");if(bad.length){console.error(bad);process.exit(1)}console.log("quellen ok")'` muss `quellen ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const css=(fs.readFileSync("src/public/index.html","utf8").match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join("");const q=String.fromCharCode(96);const r=fs.readFileSync("docs/soll/README.md","utf8");const m=r.match(/^## Limit \/h\/\{code\}$([\s\S]*?)(?=^## |$(?![\s\S]))/m);const sec=m?m[1]:"";const cl=new Set();for(const z of ["approve","passkey"]){const s=fs.readFileSync("docs/soll/src/limit-"+z+".html","utf8");for(const x of s.matchAll(/class="([^"]+)"/g))for(const c of x[1].split(/\s+/))if(c)cl.add(c)}const neu=[...cl].filter(c=>!new RegExp("\\."+c.replace(/[.*+?^${}()|[\]\\-]/g,"\\$&")+"(?![\\w-])").test(css));const ohne=neu.filter(c=>!r.includes(q+"."+c+q));const eigen=[...sec.matchAll(new RegExp(q+"\\.([A-Za-z0-9_-]+)"+q,"g"))].length;if(!m||ohne.length||eigen>3){console.error({neu,ohne,eigen});process.exit(1)}console.log("bausteine ok neu="+eigen)'` muss `bausteine ok neu=<n>` mit n höchstens 3 ausgeben.
- [x] Die Auswertung der Limit-Bilder lehnt jeden Mangel ab und lässt den sauberen Stand durch, und Startseite, Handoff und Konto
      prüfen sich weiter wie vorher, mit denselben Summenzeilen.
      MVP: Funktion, weil ein Bild, das seine Prüfung nicht in beide Richtungen besteht, kein SOLL ist, und weil die Audits von
      konto 02 und 03 die alten Summenzeilen nachts erwarten.
      Prüfung: `pnpm -s vitest run test/soll-limit.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/soll-limit.test.ts` muss mindestens 7 ausgeben (je ein Fall für Pixelabweichung, Überlauf, Gedankenstrich, fremde Adresse, Block `approve` oder `limit` unter dem ersten Bildschirm, Wort aus der Sperrliste im sichtbaren Text, sauberer Stand ohne Mangel).
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- docs/soll ':!docs/soll/README.md' ops/soll.mjs ops/soll-live.mjs ops/soll-konto.mjs ops/soll-live-konto.mjs test/soll.test.ts && echo bestand gleich` muss `bestand gleich` ausgeben (kein vorhandenes Bild, keine vorhandene Quelle und keines dieser Werkzeuge geändert).
      Prüfung: `node ops/soll-handoff.mjs --pruefen` muss Exit 0 haben und als letzte Zeile `soll handoff: 6 Bilder, freigabe oben 390=<y> 1440=<y>, 0 Mängel` ausgeben.
      Prüfung: `node ops/soll-konto.mjs --pruefen` muss Exit 0 haben und als letzte Zeile `soll konto: 4 Bilder, passkey oben 390=<y> 1440=<y>, 0 Mängel` ausgeben.
      Prüfung: `node ops/soll.mjs --pruefen` muss Exit 0 haben und als letzte Zeile `soll: 2 Bilder, umzug oben 390=<y> 1440=<y>, 0 Mängel` ausgeben.
- [x] Der Design Reviewer hat genau diese Bilder abgenommen, bevor sich unter `src/public/` etwas änderte.
      MVP: Funktion, weil die Seite 1:1 nach einem abgenommenen Bild entsteht und nicht nach einer Beschreibung.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue limit: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- 'docs/soll/limit-*.png' 'docs/soll/src/limit-*.html'); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/public | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok)<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [x] Die echte Seite in beiden neuen Zuständen ist pixelgleich mit den abgenommenen Bildern, eine geänderte Überschrift fällt dabei
      auf, und die Zustände aus konto 02 und 03 bleiben pixelgleich.
      MVP: Funktion, weil der Mensch auf dem Handy sehen muss, was das Bild verspricht, bevor er ein höheres Limit erlaubt.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-limit.mjs --out $T && node ops/soll-limit.mjs --pruefen --source $T` muss Exit 0 haben und als letzte Zeile `soll limit: 4 images, approve top 390=<y> 1440=<y>, limit top 390=<y> 1440=<y>, 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i '0,/<h1>/s/<h1>/<h1>X /' $T/src/public/limit.ts; grep -q '<h1>X ' $T/src/public/limit.ts || echo sed-miss; (cd $T && node --import tsx ops/soll-live-limit.mjs --out $T/out); node ops/soll-limit.mjs --pruefen --source $T/out; echo "exit=$?"` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-handoff.mjs --out $T && node ops/soll-handoff.mjs --pruefen --source $T` muss Exit 0 haben und als letzte Zeile `soll handoff: 6 Bilder, freigabe oben 390=<y> 1440=<y>, 0 Mängel` ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-konto.mjs --out $T && node ops/soll-konto.mjs --pruefen --source $T` muss Exit 0 haben und als letzte Zeile `soll konto: 4 Bilder, passkey oben 390=<y> 1440=<y>, 0 Mängel` ausgeben.
      Prüfung: `{ grep -cE '</?(html|head|body|main|section|div|form|button|h1|h2|p|span|style|meta|link|br)[ >/]|data-soll|docs/soll' ops/soll-live-limit.mjs || true; }` muss `0` ausgeben.
- [x] Die Zustände der Handy-Seite heißen im Code `approve`, `approved` und `invalid`, die deutschen Namen stehen nur noch in der
      einen Zuordnung zu den Dateinamen der Bilder, und ein Test in `check` meldet jede andere Fundstelle.
      MVP: Funktion, weil Grundregel 12 ausnahmslos gilt und dieses Goal die Seite ohnehin neu abnimmt (Vorschlag
      konto-nacharbeit-2026-11-14-1).
      Prüfung: `pnpm -s vitest run test/state-names.test.ts test/handoff-page.test.ts test/handoff-api.test.ts test/soll-handoff.test.ts test/soll-konto.test.ts test/konto-account.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git grep -nwE 'freigabe|erledigt|ungueltig' -- src test 'ops/soll-*.mjs' ':!ops/soll-assess.mjs' ':!test/state-names.test.ts' | wc -l` muss `0` ausgeben.
      Prüfung: `git grep -nwE 'freigabe|erledigt|ungueltig' -- ops/soll-assess.mjs | wc -l` muss höchstens `3` ausgeben (die Zuordnung).
      Prüfung: `grep -c 'data-soll="approve"' src/public/handoff.ts` muss mindestens `1` ausgeben.
      Prüfung: `for f in src/handoff/routes.ts ops/soll-live-handoff.mjs; do T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; echo 'export const leftover = "erledigt";' >> $T/$f; (cd $T && pnpm -s vitest run test/state-names.test.ts >/dev/null 2>&1) && echo "gruen trotz $f"; done` muss nichts ausgeben.
- [x] Das Tageslimit sinkt mit dem API-Schlüssel sofort und steigt nur über einen Handoff, bei dem eine neue, gültig
      unterschriebene Erlaubnis für genau dieses Konto ankommt; die alte wird widerrufen, bevor aus der neuen abgebucht wird.
      MVP: Funktion, weil eine Prompt-Injection im Terminal sonst das Limit selbst erhöhen und mehr als das Tageslimit abbuchen
      ließe (Widerlegung dieses Goals).
      Prüfung: `pnpm -s vitest run test/konto-limit.test.ts test/konto-topup.test.ts test/konto-topup-pending.test.ts test/konto-account.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-limit.test.ts` muss mindestens 12 ausgeben (je ein Fall: niedriger ergibt 200 und `topUpIfLow` bucht danach höchstens Obergrenze minus schon Abgebuchtes der Periode; gleich ergibt 200; höher ergibt 403 `limit_raise_needs_phone` mit unveränderter Obergrenze, unveränderter Erlaubnis und null Aufrufen an den Transport; ohne Schlüssel 401; `step: "limit"` ohne Schlüssel 401; `step: "limit"` mit einem Limit nicht über dem heutigen 400; richtige Zahl ergibt `matched` und die Seite `limit-passkey`, falsche Zahl `burned`; passende Erlaubnis ergibt `done`, ein Ereignis mit `daily_limit_usdc` und ohne `api_key`; Erlaubnis für ein anderes Konto oder mit anderem Limit ergibt 400 und `burned`, die alte gilt weiter; nach der Erhöhung sendet der nächste `topUpIfLow` zuerst `approveWithSignature` der neuen und `revokeAsSpender` der alten über `sendKontoTx`, dann `spend()` aus der neuen; `step: "konto"` ohne `amount_usdc` zeigt als erste Zahlung das Minimum aus `CP_KONTO_TOPUP_USDC` und Tageslimit, ein anderer Wert ergibt 400; ohne `CP_KONTO_CHAIN_ID` ergeben `step: "limit"`, `/h/{code}/limit` und `POST /v1/konto/limit` 503).
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$T/src/konto/limit.ts; if ! grep -qE "export function isLowering\(" $f 2>/dev/null; then echo "fehlt isLowering"; else sed -i "s/export function isLowering(/function isLoweringOrig(/" $f; echo "export function isLowering(..._a: unknown[]): boolean { return true; }" >> $f; (cd $T && pnpm -s vitest run test/konto-limit.test.ts >/dev/null 2>&1) && echo "gruen trotz isLowering"; fi` muss nichts ausgeben.
      Prüfung: `grep -rnE "CP_SETTLER_KEY|CP_PAY_TO|privateKeyToAccount\(\s*process\.env" src/konto | wc -l` muss `0` ausgeben.
- [x] `mcp/server.mjs` hat die fünf Tools, startet einen Automaton über Handoff und Konto ohne Wallet-Schlüssel, zeigt den API-Schlüssel
      nie und kann das Tageslimit ohne Handoff nur senken.
      MVP: Funktion, weil das die Tools sind, mit denen der Mensch im Terminal seinen Automaton startet, beobachtet und stoppt.
      Prüfung: `pnpm -s vitest run test/mcp-automaton.test.ts test/mcp.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/mcp-automaton.test.ts` muss mindestens 12 ausgeben (je ein Fall: `tools/list` nennt die fünf neuen Tools neben den sechs alten; `start_automaton` ohne Schlüssel macht genau ein `POST /v1/handoff` mit `step` `konto`, Name und Tageslimit in atomaren USDC und ohne `amount_usdc` und antwortet mit `qr`, `url` und `match`, ohne `poll_token`; nach `done` im Strom liegt der Schlüssel in `CP_KEY_FILE` mit Modus 0600, der Start läuft mit diesem Schlüssel, und `automaton_status` meldet `running`; der Schlüssel steht in keinem Tool-Ergebnis und keiner Zeile auf stderr; `burned` und `expired` erscheinen in `automaton_status`, und der nächste `start_automaton` legt einen neuen Handoff an; mit vorhandenem Schlüssel kein Handoff; 402 beim Start führt zu erneuten Versuchen und nach 90 Sekunden zu `failed`; eine Schlüsseldatei mit Modus 0644 ergibt `key_file_mode`; `set_daily_limit` niedriger macht genau ein `POST /v1/konto/limit` und keinen Handoff; `set_daily_limit` höher macht ein `POST /v1/handoff` mit `step` `limit` und null Aufrufe an `/v1/konto/limit`; `automaton_logs` zeigt das Log ohne Schlüssel; `stop_automaton` ruft den Stopp; Beträge wie `5.001`, `-1`, `abc` oder eine Zahl statt String ergeben `invalid_arguments` ohne Aufruf).
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$T/mcp/server.mjs; if ! grep -qE "export function raiseNeedsPhone\(" $f; then echo "fehlt raiseNeedsPhone"; else sed -i "s/export function raiseNeedsPhone(/function raiseNeedsPhoneOrig(/" $f; echo "export function raiseNeedsPhone() { return false; }" >> $f; (cd $T && pnpm -s vitest run test/mcp-automaton.test.ts >/dev/null 2>&1) && echo "gruen trotz raiseNeedsPhone"; fi` muss nichts ausgeben.
      Prüfung: `grep -ciE "privateKey|generatePrivateKey|mnemonic|signTypedData|secp256k1|seed phrase" mcp/server.mjs` muss `0` ausgeben.
      Prüfung: `grep -E "^import " mcp/server.mjs | grep -vc '"node:'` muss `0` ausgeben (die Datei bleibt ohne Pakete).
- [x] Ein Claude-Code-Plugin bringt Server und Skill mit, und die Doku nennt die Installation in einer Zeile.
      MVP: Funktion, weil der Mensch aus dem Terminal kommt und dort mit einer Zeile statt mit einer Konfigurationsdatei anfangen muss.
      Prüfung: `node -e 'const m=require("./.claude-plugin/marketplace.json");const p=require("./mcp/.claude-plugin/plugin.json");const e=(m.plugins||[]).find(x=>x.name===p.name);const s=(p.mcpServers&&Object.values(p.mcpServers)[0])||{};const bad=[];if(!m.name||!m.owner)bad.push("katalog kopf");if(!e||e.source!=="./mcp")bad.push("eintrag");if(s.command!=="node"||!(s.args||[]).includes("${CLAUDE_PLUGIN_ROOT}/server.mjs"))bad.push("server");if(/CP_API_KEY|cnwy_k_[A-Za-z0-9]/.test(JSON.stringify([m,p])))bad.push("schluessel im plugin");if(bad.length){console.error(bad);process.exit(1)}console.log("plugin ok "+p.name)'` muss `plugin ok <name>` ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("mcp/skills/automaton/SKILL.md","utf8");const bad=[];if(!/^---\nname: [a-z0-9-]+\ndescription: .+\n/.test(s))bad.push("kopf");for(const t of ["start_automaton","automaton_status","automaton_logs","set_daily_limit","stop_automaton"])if(!s.includes(t))bad.push(t);if(!/\bQR\b/.test(s))bad.push("qr");if(/[\u2013\u2014]/.test(s))bad.push("gedankenstrich");if(bad.length){console.error(bad);process.exit(1)}console.log("skill ok")'` muss `skill ok` ausgeben.
      Prüfung: `grep -F 'claude plugin marketplace add matthiashippe/control-plane' mcp/README.md | grep -c 'claude plugin install'` muss `1` ausgeben.
      Prüfung: `grep -cF 'claude plugin marketplace add matthiashippe/control-plane' README.md` muss mindestens `1` ausgeben.
- [x] Im Harness läuft der ganze Weg vom Aufruf `start_automaton` bis zum ersten Turn der Runtime in der Sandbox, ohne Browser außer
      dem nachgebildeten Handoff, und eine Erhöhung ohne Handoff scheitert; das läuft in `e2e`.
      MVP: Funktion, weil erst dieser Lauf zeigt, dass Tools, Handoff, Konto und Sandbox zusammen einen Automaton zum Denken bringen,
      und jede spätere Änderung ihn sonst still brechen könnte.
      Prüfung: `grep -c "terminal.mjs" harness/e2e/full.sh` muss mindestens `1` ausgeben.
      Prüfung: `grep -cE "start_automaton|automaton_status|set_daily_limit|stop_automaton|revokeAsSpender|84532|limit_raise_needs_phone|TERMINAL_VERDICT|mcp/server.mjs" harness/e2e/terminal.mjs` muss mindestens `9` ausgeben.
      Prüfung: `grep -ciE "playwright|chromium|puppeteer" harness/e2e/terminal.mjs` muss `0` ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-04 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="e2e" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [x] Auf Base Sepolia stieg das Tageslimit eines Kontos über den Handoff mit demselben Passkey, die alte Erlaubnis wurde widerrufen,
      die neue buchte mehr als das alte Limit ab, und ein `spend()` aus der alten scheiterte on-chain.
      MVP: Funktion, weil die Unterschrift mit einem vorhandenen Passkey bei Turnkey nur ein echter Lauf belegt und ein vergessener
      Widerruf das Tageslimit verdoppeln würde.
      Prüfung (Netz): `node -e 'const fs=require("fs");const d=fs.readFileSync("docs/konto/sepolia-limit.md","utf8");const g=k=>{const m=d.match(new RegExp("^"+k+": (0x[0-9a-fA-F]+)$","m"));return m?m[1].toLowerCase():""};const rpc=(method,params)=>fetch("https://sepolia.base.org",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})}).then(r=>r.json());const SPM="0xf85210b21cc50302f477ba56686d2019dc9b67ad",USDC="0x036cbd53842c5426634e7929541ec2318f3dcf7e",T="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";const pad=a=>"0x"+a.slice(2).padStart(64,"0");(async()=>{const bad=[];const cid=(await rpc("eth_chainId",[])).result;if(cid!=="0x14a34")bad.push("chain "+cid);const konto=g("konto"),spender=g("spender");if(!konto||!spender)bad.push("konto oder spender fehlt");const rc={};for(const k of ["erlaubnis-alt","erlaubnis-neu","widerruf","abbuchung-neu","alt-nach-widerruf"]){const h=g(k);if(!h){bad.push("fehlt "+k);continue}const r=(await rpc("eth_getTransactionReceipt",[h])).result;if(!r){bad.push("kein beleg "+k);continue}rc[k]=r;if(r.status!==(k==="alt-nach-widerruf"?"0x0":"0x1"))bad.push(k+" status "+r.status);if((r.to||"").toLowerCase()!==SPM)bad.push(k+" nicht an SpendPermissionManager")}const a=rc["abbuchung-neu"];if(a){const tr=a.logs.filter(l=>l.address.toLowerCase()===USDC&&l.topics[0]===T&&l.topics[1]===pad(konto)&&l.topics[2]===pad(spender));if(!tr.some(l=>BigInt(l.data)>5000000n))bad.push("abbuchung nicht ueber dem alten limit")}const w=rc["widerruf"],x=rc["alt-nach-widerruf"];if(w&&x&&!(BigInt(x.blockNumber)>BigInt(w.blockNumber)))bad.push("alte erlaubnis nicht nach dem widerruf probiert");if(bad.length){console.error(bad);process.exit(1)}console.log("sepolia limit ok")})()'` muss `sepolia limit ok` ausgeben.
      Prüfung: `s=$(sed -n 's/^spender: //p' docs/konto/sepolia-limit.md); [ -n "$s" ] && ! grep -rqi -- "$s" src deploy mcp && echo spender eigen` muss `spender eigen` ausgeben.
      Prüfung: `f=~/.config/control-plane/konto-sepolia.key; k=$(tr -d '\n' < $f | sed 's/^0x//'); [ ${#k} -eq 64 ] || echo "kein schluessel"; git log -p origin/dev..HEAD | grep -ci -- "$k"` muss als einzige Ausgabe `0` haben.
- [x] Der Ablauf der Tools und des Tageslimits steht für konto 05 fest, und die Entscheidungen stehen mit Grund in
      `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil konto 05 Einzahlung und Auszahlung als weitere Tools gegen genau diesen Ablauf baut.
      Prüfung: `for w in start_automaton automaton_status automaton_logs set_daily_limit stop_automaton CP_KEY_FILE key_file_mode limit_raise_needs_phone isLowering raiseNeedsPhone revokeAsSpender waiting_for_phone 0600; do grep -qw -- "$w" docs/konto/terminal.md || echo "fehlt $w"; done; for h in "## Tools" "## Tageslimit" "## Schlüssel" "## Plugin" "## Für konto 05"; do grep -qx -- "$h" docs/konto/terminal.md || echo "fehlt $h"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Goal 04/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens 7 ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, kein Test wird schwächer, höchstens ein neues Paket und ein neues Paket für die
      Entwicklung, kein Schlüssel im Diff, und `check` und `e2e` sind grün.
      MVP: Funktion, weil der Merge über `deploy.yml` ausrollt und zahlende Kunden den Stand tragen.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/app\.ts|src/db\.ts|src/index\.ts|src/handoff/[A-Za-z0-9._-]+\.ts|src/konto/[A-Za-z0-9._-]+\.ts|src/(sandbox|automaton)/[A-Za-z0-9._-]+\.ts|src/public/handoff\.ts|src/public/konto\.ts|src/public/limit\.ts|src/public/konto-client/[A-Za-z0-9._/-]+|src/public/openapi\.ts|test/[A-Za-z0-9._-]+\.ts|mcp/server\.mjs|mcp/README\.md|mcp/\.claude-plugin/plugin\.json|mcp/skills/automaton/SKILL\.md|\.claude-plugin/marketplace\.json|README\.md|ops/soll-assess\.mjs|ops/soll-handoff\.mjs|ops/soll-live-handoff\.mjs|ops/soll-limit\.mjs|ops/soll-live-limit\.mjs|ops/konto/[A-Za-z0-9._-]+|harness/e2e/terminal\.mjs|harness/e2e/full\.sh|harness/docker-compose\.yml|docs/soll/limit-(approve|passkey)-(390|1440)\.png|docs/soll/src/limit-(approve|passkey)\.html|docs/soll/README\.md|docs/konto/(terminal|sepolia-limit)\.md|package\.json|pnpm-lock\.yaml|goals/konto/(verdicts/)?[A-Za-z0-9._-]+\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `T=$(mktemp -d); git show origin/dev:package.json > $T/p.json; node -e 'const a=require(process.argv[1]),b=require("./package.json");const n=k=>Object.keys(b[k]||{}).filter(x=>!(x in (a[k]||{})));const d=n("dependencies"),v=n("devDependencies");if(d.length>1||v.length>1){console.error(d,v);process.exit(1)}console.log("pakete ok "+d.length+" "+v.length)' $T/p.json` muss `pakete ok <d> <v>` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}" | wc -l` muss `0` ausgeben.
      Prüfung: `grep -rn "CP_KONTO_" deploy .github | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-04 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [x] Eine Erhöhung setzt die Periode nicht zurück: Bis die laufende Periode der alten Erlaubnis endet, bucht `topUpIfLow` aus der
      neuen höchstens das neue Limit (oder die Obergrenze, wenn sie kleiner ist) minus dem, was die alte in dieser Periode schon
      abgebucht hat; danach gilt die Periode der neuen allein. Der Test war vor dem Fix rot.
      MVP: Funktion, weil die Seite „PostYourPrice can charge up to $10.00 a day“ verspricht und die neue Erlaubnis mit eigenem
      `start` eine frische Periode bekommt: Heute bucht der Server nach einer Erhöhung von 5 auf 10 am selben Tag 5 aus der alten und
      10 aus der neuen ab, also 15, und bei jeder weiteren Erhöhung wieder.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-limit-period.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-limit-period.test.ts` muss mindestens 3 ausgeben (je ein Fall: die alte hat 4 USD der Periode abgebucht, Erhöhung von 5 auf 10, der nächste `topUpIfLow` schickt `spend()` aus der neuen mit höchstens 6 USD, über mehrere Läufe zusammen höchstens 6 USD bis zum Ende der alten Periode; nach dem Ende der alten Periode bis 10 USD; mit Obergrenze 3 nach der Erhöhung höchstens 3 minus 4, also kein `spend()`).
      Prüfung: `for w in topUpIfLow spentThisPeriod revoke spend; do grep -qF -- "$w" test/konto-limit-period.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Scheitert nach der Freischaltung der neuen Erlaubnis der Widerruf der alten (Quittung `reverted`, Fehler oder Abbruch beim Warten
      auf die Quittung), schickt dieser Lauf kein `spend()`, und der nächste Lauf schickt kein zweites `approveWithSignature`, widerruft
      die alte erneut und bucht erst danach aus der neuen ab; ein Widerruf, dessen Quittung beim ersten Lauf fehlte, obwohl er on-chain
      gelang, hält das Konto nicht auf. Der Test war vor dem Fix rot.
      MVP: Funktion, weil zwischen Freischaltung und Widerruf on-chain zwei unserer Erlaubnisse gelten und ein Lauf, der in diesem
      Zustand abbucht, das Tageslimit verdoppelt, während ein Konto, das nach einem abgebrochenen Warten nie wieder nachbucht, den
      Automaton mitten im Lauf ohne Geld lässt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-limit-switch.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-limit-switch.test.ts` muss mindestens 3 ausgeben (je ein Fall: Widerruf `reverted`, danach null `spend()` in diesem Lauf und im nächsten genau ein `revokeAsSpender`, kein `approveWithSignature`, dann `spend()` aus der neuen; `receipt` des Widerrufs wirft, gleiches Ergebnis; der Widerruf war on-chain schon gelungen und der nächste Lauf bucht trotzdem ab).
      Prüfung: `for w in topUpIfLow approve revoke spend reverted; do grep -qF -- "$w" test/konto-limit-switch.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Mensch ohne Wallet startet aus Claude Code einen Automaton mit einem Satz, einem QR-Code, einer Zahl und einem Passkey.
- [ ] Wer nur das Terminal oder den Agent darin hat, kann das Tageslimit senken, aber nie erhöhen; erhöhen geht nur auf dem Handy
      mit dem Passkey, und danach gilt on-chain nur die neue Erlaubnis.
- [ ] Auf der Maschine des Nutzers liegt nur der API-Schlüssel in einer Datei, die nur er lesen kann, und er erscheint in keiner
      Ausgabe.
- [ ] Kein Gedankenstrich, kein Name und keine Wallet-Adresse eines Kunden, kein Wort, das der Nutzer erst übersetzen muss, kein
      deutscher Bezeichner im Code.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/runtime/**`,
  `harness/cp/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `deploy/**`
- `src/auth/**` und `src/payments/**`: dieses Goal nennt sie nicht zum Ändern; ihre Funktionen dürfen importiert werden
- `ops/soll.mjs`, `ops/soll-live.mjs`, `ops/soll-konto.mjs`, `ops/soll-live-konto.mjs`, `test/soll.test.ts`, jedes vorhandene Bild
  und jede vorhandene Quelle unter `docs/soll/`, die Summenzeilen `soll:`, `soll handoff:` und `soll konto:`
- `ROADMAP.md`, `docs/kette.md`, `docs/konto/anbieter.md`, `docs/konto/handoff.md`, `docs/konto/konto.md`,
  `docs/konto/sepolia.md` und alle Goal-Dateien außer dieser
- jede Transaktion außerhalb von Base Sepolia (84532), der Schlüssel der Betreiber-Wallet (`CP_SETTLER_KEY`, `CP_PAY_TO` und jeder
  Schlüssel der Produktion), ein Faucet mit Captcha oder Konto durch einen Agent, Kauf, Aufladung, Wallet-Bewegung im Hauptnetz
  (`loop-constraints.md`, Grundregeln 9 und 10)
- der Testschlüssel oder ein API-Schlüssel in Repo, Log, Ausgabe, Kommentar, Fixture oder Fehlertext; eine Variable `CP_KONTO_*`
  auf dem Server
- ein Wallet-Schlüssel, eine Seed-Phrase oder eine Unterschrift auf der Maschine des Nutzers oder in `mcp/`
- ein Konto oder eine Erlaubnis eines echten Kunden; Turnkey nur über die Sub-Organisationen des eigenen Laufs
- kein Skript eines fremden Dienstes auf der Seite und kein Aufruf einer fremden Adresse beim Rendern der SOLL-Bilder
- eine zweite Route für Anlegen, Zustand, Log oder Stopp eines Automatons neben der aus sandbox 08
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 5
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 gebaut: vier Limit-Bilder aus zwei Quellen ohne neue Klasse (Abnahme Design Reviewer auf PRO-22848 um 11:52:26 UTC, Bild-Commit 11:51:15, erster Commit unter `src/public/` 12:00:25), `ops/soll-limit.mjs` mit `assessLimit`, Zustände `approve`, `approved`, `invalid` mit der Zuordnung `HANDOFF_FILES`, `src/public/limit.ts`, `POST /v1/konto/limit` mit `isLowering`, `step: "limit"` und `POST /h/{code}/limit`, Wechsel der Erlaubnis in `topUpIfLow`, fünf Tools mit `raiseNeedsPhone` (Subagent Opus), Plugin und Skill, Browser-Teil `runLimit` mit WebAuthn-Stempel, `harness/e2e/terminal.mjs` in `full.sh`, Lauf auf Base Sepolia. Jeder neue Test war einmal rot: `test/soll-limit.test.ts` mit fünf Mutationen in `assessLimit` (Wortliste, Block fehlt, erster Bildschirm, Grundprüfungen, Zustand), `test/state-names.test.ts` vor der Umbenennung (20 Fundstellen), `test/konto-limit.test.ts` mit neun Mutationen (`isLowering` immer true, Obergrenze weg, Widerruf ersetzt, erste Zahlung frei, Schlüssel nicht geprüft, `daily_limit_usdc` fehlt, `permissionMatches` weg, 503 fehlt, heutiges Limit nicht geprüft) und fand dabei ein doppeltes `approveWithSignature` nach dem Wechsel (behoben), `test/konto-client-limit.test.ts` mit falscher Challenge und ohne Besitzprüfung, `test/mcp-automaton.test.ts` mit 14 Mutationen (Bericht des Subagents, etwa `raiseNeedsPhone` false, Schlüsseldatei 0644, `amount_usdc` gesendet), der Gate-Test von `full.sh` ohne `terminal`. Die SOLL-Befehle liefen mit `FONTCONFIG_FILE=~/.config/control-plane/soll-fonts.conf` (schließt DejaVu aus, wie konto 03 Zyklus 6); ohne sie melden die Bilder von konto 02 und 03 auf dem code-host Mängel (Umgebung). Prüfbefehle: P1 `soll limit: 4 images, approve top 390=528 1440=603, limit top 390=486 1440=510, 0 defects`, `breiten ok`, `quellen ok`, `bausteine ok neu=0`; P2 vitest Exit 0, `8`, `bestand gleich`, `soll handoff: 6 Bilder, freigabe oben 390=528 1440=603, 0 Mängel`, `soll konto: 4 Bilder, passkey oben 390=527 1440=510, 0 Mängel`, `soll: 2 Bilder, umzug oben 390=828 1440=656, 0 Mängel`; P3 `abnahme ok 1`; P4 `soll limit: 4 images, approve top 390=528 1440=603, limit top 390=486 1440=510, 0 defects`, `exit=1` ohne `sed-miss`, Handoff und Konto wie P2, `0`; P5 vitest Exit 0, `0`, `1`, `1`, keine Ausgabe; P6 vitest Exit 0, `13`, keine Ausgabe, `0`; P7 vitest Exit 0, `13`, keine Ausgabe, `0`, `0`; P8 `plugin ok automaton`, `skill ok`, `1`, `1`; P9 `2`, `40`, `0`, Job `e2e` am PR #208 läuft noch; P10 `sepolia limit ok`, `spender eigen`, `0`; P11 keine Ausgabe, `14`; P12 `0`, `0`, `pakete ok 0 0`, `0`, `0`, `check` lokal grün (188 Dateien, 2091 Tests), Job `check` am PR läuft noch.
- 2026-11-16 Zyklus 1: Abschluss gemeldet, Punkte 1 bis 12; `origin/dev` (Goal-Datei sandbox 09, PR #207) in den Goal-Branch gemergt (74a4553), danach jeder Prüfbefehl aller Punkte mit Node 22 (`PATH=/usr/bin:$PATH`, weil `better-sqlite3` im Worktree für Node 22 gebaut ist und Node 24 vorn im PATH des Runs lag) und mit `FONTCONFIG_FILE=~/.config/control-plane/soll-fonts.conf` wie in Zyklus 1. Prüfbefehle: P1 `soll limit: 4 images, approve top 390=528 1440=603, limit top 390=486 1440=510, 0 defects`, `breiten ok`, `quellen ok`, `bausteine ok neu=0`; P2 vitest Exit 0, `8`, `bestand gleich`, `soll handoff: 6 Bilder, freigabe oben 390=528 1440=603, 0 Mängel`, `soll konto: 4 Bilder, passkey oben 390=527 1440=510, 0 Mängel`, `soll: 2 Bilder, umzug oben 390=828 1440=656, 0 Mängel`; P3 `abnahme ok 1`; P4 `soll limit: … 0 defects`, `exit=1` ohne `sed-miss` (Mutation: `2 defects`), Handoff und Konto wie P2, `0`; P5 vitest Exit 0, `0`, `1`, `1`, keine Ausgabe; P6 vitest Exit 0, `13`, keine Ausgabe, `0`; P7 vitest Exit 0, `13`, keine Ausgabe, `0`, `0`; P8 `plugin ok automaton`, `skill ok`, `1`, `1`; P9 `2`, `40`, `0`, `1` (Job `e2e` pass am Kopf d6eb23b); P10 `sepolia limit ok`, `spender eigen`, `0`; P11 keine Ausgabe, `14`; P12 `0`, `0`, `pakete ok 0 0`, `0`, `0`, `check: grün in 157 s`, `1`.
- 2026-11-16 Zyklus 2: Punkt 13 gebaut (Kritik Tech Lead): `topUpIfLow` hält nach dem Widerruf der alten Erlaubnis ihren Verbrauch der laufenden Periode als `carry_usdc` bis `carry_until` (`periodEnd`) fest und zieht ihn bis dahin vom neuen Limit ab, eine zweite Erhöhung addiert; `test/konto-limit-period.test.ts` war vor dem Fix rot (3 von 4 Fällen: 10 statt 6 USD, 3 statt nichts bei Obergrenze 3, 12 statt 6 nach zweiter Erhöhung). Prüfbefehle: P13 vitest Exit 0, `4`, keine Ausgabe; `check: grün in 69 s`.
- 2026-11-16 Zyklus 3: Punkt 14 gebaut (Kritik Tech Lead): Freischaltung und Widerruf beim Wechsel laufen über `confirmed` in `src/konto/topup.ts`, das einen Revert, einen Fehler beim Senden und einen Abbruch beim Warten gleich als gescheitert nimmt, der Lauf endet dann ohne `spend()`, und der nächste widerruft erneut ohne zweite Freischaltung (`_revoke` des Vertrags kehrt bei schon widerrufener Erlaubnis ohne Revert zurück); `test/konto-limit-switch.test.ts` war vor dem Fix rot (4 von 5 Fällen warfen `timed out waiting for the receipt` oder `node refused the transaction` aus `topUpIfLow`). Prüfbefehle: P14 vitest Exit 0, `5`, keine Ausgabe; `check: grün in 67 s`.
- 2026-11-16 Zyklus 3: Abschluss gemeldet, Punkte 1 bis 14; `origin/dev` ohne neue Commits seit 74a4553, jeder Prüfbefehl aller Punkte mit `PATH=/usr/bin:$PATH` (Node 22) und `FONTCONFIG_FILE=~/.config/control-plane/soll-fonts.conf` am Kopf 03adca1. Prüfbefehle: P1 `soll limit: 4 images, approve top 390=528 1440=603, limit top 390=486 1440=510, 0 defects`, `breiten ok`, `quellen ok`, `bausteine ok neu=0`; P2 vitest Exit 0, `8`, `bestand gleich`, `soll handoff: 6 Bilder, freigabe oben 390=528 1440=603, 0 Mängel`, `soll konto: 4 Bilder, passkey oben 390=527 1440=510, 0 Mängel`, `soll: 2 Bilder, umzug oben 390=828 1440=656, 0 Mängel`; P3 `abnahme ok 1`; P4 `0 defects`, `exit=1` ohne `sed-miss`, Handoff und Konto wie P2, `0`; P5 vitest Exit 0, `0`, `1`, `1`, keine Ausgabe; P6 vitest Exit 0, `13`, keine Ausgabe, `0`; P7 vitest Exit 0, `13`, keine Ausgabe, `0`, `0`; P8 `plugin ok automaton`, `skill ok`, `1`, `1`; P9 `2`, `40`, `0`, Job `e2e` pass (11m4s) am Kopf 03adca1; P10 `sepolia limit ok`, `spender eigen`, `0`; P11 keine Ausgabe, `16`; P12 `0`, `0`, `pakete ok 0 0`, `0`, `0`, `check: grün in 67 s`, Job `check` pass; P13 vitest Exit 0, `4`, keine Ausgabe; P14 vitest Exit 0, `5`, keine Ausgabe.
- 2026-11-16 Zyklus 4: Gap aus Verdict K Zyklus 3 (Punkt 6) behoben: neuer Fall in `test/konto-limit.test.ts` schickt an `POST /h/{code}/limit` die passende Erlaubnis (Konto, Spender, Token, Limit) einmal mit der Unterschrift eines fremden Schlüssels und einmal mit einer kaputten, bei vorher auf 2 USD gesenktem Limit, und erwartet 400, `burned`, unveränderte Erlaubnis und `cap_usdc`; in einer Kopie aus `git archive HEAD` ohne Zeile 484 von `src/handoff/routes.ts` (`signatureValid`) ist er rot (`expected 200 to be 400`, `1 failed | 13 passed`), mit ihr grün. `origin/dev` gemergt (6b86aad, Konflikte in `ops/soll-assess.mjs` und `ops/soll-handoff.mjs` mit der Reparatur der SOLL-Schriften zusammengeführt), `ops/soll-limit.mjs` nutzt jetzt wie die drei anderen Renderer `FONTS_CONF`, `test/soll-fonts.test.ts` prüft auch ihn (ohne die Verdrahtung rot); damit laufen alle SOLL-Befehle ohne `FONTCONFIG_FILE`. Prüfbefehle aller Punkte mit `PATH=/usr/bin:$PATH` ohne `FONTCONFIG_FILE`: P1 `soll limit: 4 images, approve top 390=528 1440=603, limit top 390=486 1440=510, 0 defects`, `breiten ok`, `quellen ok`, `bausteine ok neu=0`; P2 vitest Exit 0, `8`, `bestand gleich`, `soll handoff: 6 Bilder, freigabe oben 390=528 1440=603, 0 Mängel`, `soll konto: 4 Bilder, passkey oben 390=527 1440=510, 0 Mängel`, `soll: 2 Bilder, umzug oben 390=828 1440=656, 0 Mängel`; P3 `abnahme ok 1`; P4 `0 defects`, `exit=1` ohne `sed-miss`, Handoff und Konto wie P2, `0`; P5 vitest Exit 0, `0`, `1`, `1`, keine Ausgabe; P6 vitest Exit 0, `14`, keine Ausgabe, `0`; P7 vitest Exit 0, `13`, keine Ausgabe, `0`, `0`; P8 `plugin ok automaton`, `skill ok`, `1`, `1`; P9 `2`, `40`, `0`, Job `e2e` am PR nach dem Push; P10 `sepolia limit ok`, `spender eigen`, `0`; P11 keine Ausgabe, `16`; P12 `0`, `0`, `pakete ok 0 0`, `0`, `0`, `check: grün in 77 s`; P13 vitest Exit 0, `4`, keine Ausgabe; P14 vitest Exit 0, `5`, keine Ausgabe.
- 2026-11-16 Zyklus 4: Abschluss gemeldet, Punkte 1 bis 14; Prüfbefehle wie in der Zeile davor, `check: grün in 77 s`, Jobs `check` und `e2e` am PR #208 am Kopf dieses Commits.

## Blockers
