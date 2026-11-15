# Konto Goal 03: Konto und Abbuchung auf Base Sepolia

## Status
PLANNED

## Active Objective
Wer im Terminal einen Automaton startet und keine Wallet hat, bekommt über den Handoff aus konto 02 ein eigenes Konto: Nach der
richtigen Zahl legt er auf dem Handy per Passkey ein Konto bei Turnkey an, dessen Wallet Eigentümer einer Coinbase Smart Wallet
ist, und unterschreibt mit demselben Passkey eine Abbuchungserlaubnis (Spend Permission über `SpendPermissionManager`, nur USDC,
nur an unsere Adresse, Tagesgrenze gleich dem Tageslimit des Handoffs). Das Terminal erfährt über den Strom aus konto 02 die
Adresse des Kontos und einmal einen API-Schlüssel. Das Control Plane bucht Credits aus dieser Erlaubnis nach, wenn sie knapp
werden, und bucht sie erst, wenn die Abbuchung on-chain gelungen ist; Einnahmen eines Dienstes mit payTo auf dem Konto landen
direkt dort. Alles läuft auf Base Sepolia (84532) mit Test-USDC und einem eigenen Testschlüssel, der nur auf dem code-host liegt
(`loop-constraints.md`, Regel 10, Ausnahme Base Sepolia vom 13.11.2026), belegt zuerst im Harness und dann einmal echt auf Base
Sepolia; in der Produktion bleibt das Konto aus (`ROADMAP.md`, konto 03; Grundsatz in `docs/kette.md`, Abschnitt konto).
Widerlegt, wenn die Abbuchung über der Grenze durchgeht. Übernimmt goals/_vorschlaege/konto-kritik-2026-11-13-1.md und
goals/_vorschlaege/konto-kritik-2026-11-13-3.md.
MVP: Funktion, weil konto 04 (`start_automaton` im Terminal) und konto 05 (Auszahlung) auf genau diesem Konto und dieser
Erlaubnis aufsetzen und ohne beides kein Mensch ohne Wallet einen Automaton bei uns bezahlt.

## Voraussetzungen
- konto Goal 02 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Mensch ohne Wallet hat nach einer Minute auf dem Handy ein Konto, das nur er mit seinem Passkey
  entsperrt, und eine Erlaubnis, aus der wir höchstens das Tageslimit für seine Credits abbuchen können, und keine Prompt-Injection
  im Terminal kommt an mehr heran.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte):
  1. Punkt 8 zuerst (Vorschlag konto-kritik-1): Im Harness auf anvil mit chainId 84532 legt eine secp256k1-Adresse (Stellvertreter
     der Turnkey-Wallet, ein lokales Konto aus viem) über `CoinbaseSmartWalletFactory.createAccount` eine Smart Wallet an,
     unterschreibt eine Spend Permission (ERC-6492, solange die Smart Wallet noch nicht deployt ist), `approveWithSignature` und
     `spend()` bis zur Grenze gelingen, das nächste `spend()` bricht mit `ExceededSpendPermission` (Selector `0xfd1ebc88`) ab. Den
     Code der Verträge legt der Schritt mit `anvil_setCode` an ihre Adressen auf Base Sepolia, wie `harness/chain/chain.mjs` es mit
     dem USDC-Mock macht: der Laufzeit-Code einmal per `eth_getCode` von https://sepolia.base.org geholt, als Datei unter
     `harness/chain/konto/` mit Adresse, Block und keccak256 in `harness/chain/konto/README.md`. Nötig sind mindestens
     `SpendPermissionManager` (`0xf85210B21cC50302F477BA56686d2019dC9b67Ad`), sein `PUBLIC_ERC6492_VALIDATOR`, die Factory und die
     Implementierung der Smart Wallet und Test-USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, im Harness der USDC-Mock an
     dieser Adresse). Ein zweiter anvil-Dienst in `harness/docker-compose.yml` mit `--chain-id 84532`, der bestehende bleibt auf
     8453. Trägt der Lauf nicht (Turnkey-Wallet kann kein Eigentümer sein, `spend()` reißt die Grenze nicht), endet das Goal mit
     `BLOCKED fachlich` und einem Vorschlag, bevor eine Seite entsteht.
  2. Dann die Bausteine ohne Netz (Punkte 5, 6, 7, 9), Commit, Push.
  3. Dann die SOLL-Bilder (Punkte 1 und 2), Commit, Push, den Design Reviewer auf dem Topic dieses Goals mit allen Bildpfaden und
     dem Commit erwähnen und die Zeile `Abnahme-Issue konto: PRO-<n>` in `docs/soll/README.md` setzen. Bis „SOLL abgenommen“
     dasteht, baut der Maker an der Seite nichts (Child `blocked`, Owner Design Reviewer). Die Zeilen `Abnahme-Issue: PRO-18819`
     und `Abnahme-Issue handoff: …` bleiben, wie sie sind. Punkt 3 prüft die Reihenfolge an den Zeitstempeln.
  4. Dann die Seite (Punkt 4), Commit, Push.
  5. Dann das Human Gate `security_settings`: Der Maker erzeugt den Testschlüssel mit `ops/konto/testkey.mjs` (schreibt ihn mit
     Modus 0600 nach `~/.config/control-plane/konto-sepolia.key`, gibt nur die Adresse aus, überschreibt nie einen vorhandenen),
     wählt einen freien Port für den lokalen Lauf und setzt `## Status` auf `BLOCKED matthias` mit diesen Blocker-Zeilen: Aufgabe
     „Turnkey-Zugang für das Kundenkonto anlegen und die Testadresse mit Test-Geld füllen“, Worum „konto 03 legt auf Base Sepolia
     ein Konto per Passkey an und bucht daraus ab, dafür braucht der Loop den Zugang zu Turnkey und Test-Geld aus dem Faucet“,
     Empfehlung mit den Schritten aus `docs/konto/anbieter.md`, Abschnitt konto 03 (Organization ID, API-Schlüsselpaar, Auth Proxy
     mit Passkey und den Allowed Origins `https://postyourprice.com` und `http://localhost:<port>`, Werte in
     `~/brain/connectors/secrets.env` unter den vier Namen dort), dazu 20 Test-USDC auf Base Sepolia über https://faucet.circle.com
     und etwas Base-Sepolia-ETH für Gas an die Testadresse. Schritte für Matthias schreibt der Tech Lead am Gate.
  6. Nach dem Gate der Lauf auf Base Sepolia (Punkte 10 und 11), dann Punkte 12 bis 15.
- Entscheidungen des Tech Lead (Maker schreibt sie mit Grund unter `## Goal 03` in `goals/konto/ANNAHMEN.md`):
  1. `POST /v1/handoff` nimmt ein optionales Feld `step` mit `confirm` (Vorgabe, Verhalten von konto 02 unverändert) oder `konto`.
     Bei `konto` führt die richtige Zahl in den neuen Zustand `matched` statt `done`; die Seite zeigt dann den Schritt Passkey, und
     erst ein gültiges `POST /h/{code}/konto` setzt `done`. Eine abgelehnte Erlaubnis verbrennt den Handoff (`burned`), wie eine
     falsche Zahl, weil das Terminal sonst auf einen halb fertigen Schritt wartet; das Tool legt dann einen neuen an.
  2. Die Seite macht Signup und Unterschrift im Browser: Turnkey über den Auth Proxy (öffentliche `authProxyConfigId`, kein
     Schlüssel auf unserem Server), die Smart Wallet per `toCoinbaseSmartAccount` aus viem mit der Turnkey-Wallet als Eigentümer, die
     Erlaubnis per `signTypedData` dieser Smart Wallet. Das Skript liegt auf unserer Adresse (`/h/konto.js` oder ähnlich), kein
     Skript von einem fremden Dienst; nur die Aufrufe an Turnkey gehen nach außen. Ohne JavaScript sagt die Seite in einem Satz,
     dass der Schritt einen Browser mit JavaScript braucht.
  3. Der Server prüft vor `done`: Konto der Erlaubnis gleich der gemeldeten Smart Wallet, Spender gleich unserer Adresse, Token gleich
     Test-USDC, `allowance` gleich `daily_limit_usdc` des Handoffs, `period` 86400, `start` nicht in der Zukunft um mehr als fünf
     Minuten, `end` nach `start`, und die Unterschrift gültig für die Smart Wallet (ERC-6492 über `verifyTypedData` aus viem gegen
     `CP_KONTO_RPC_URL`). Exportierte Funktionen mit festen Namen für die Gegenproben: `permissionMatches` und `signatureValid` in
     `src/konto/`.
  4. Die Identität des Kontos ist die Adresse der Smart Wallet (klein geschrieben) in `wallets`, weil Einnahmen (payTo) und Credits
     dann an derselben Adresse hängen, die der Kunde besitzt. Der API-Schlüssel entsteht über die vorhandene Funktion in
     `src/auth/**` (importieren, nicht ändern), gespeichert nur als Hash; der Klartext steht genau einmal im ersten Ereignis `done`
     des Stroms (`account`, `api_key`) und wird danach aus der Zeile gelöscht.
  5. Gesendet wird nur über eine Funktion `sendKontoTx` in `src/konto/`, und sie ruft vor jedem Aufruf ans Netz
     `requireSepolia(chainId)`, das jede chainId außer 84532 mit einem Fehler ablehnt (Regel 10, Ausnahme Base Sepolia: „Code, der
     sendet, prüft die chainId und verweigert jede andere; ein Test zeigt das mit chainId 8453“). Der Testschlüssel kommt nur aus der
     Datei in `CP_KONTO_KEY_FILE`, nie aus einer Umgebungsvariable mit dem Wert, nie aus `CP_SETTLER_KEY` oder einem anderen
     Schlüssel der Betreiber-Wallet, und erscheint in keiner Ausgabe, keinem Log und keinem Fehlertext.
  6. Nachbuchen: Fällt das Guthaben eines Kontos unter `CP_KONTO_TOPUP_BELOW_USDC` (Vorgabe 1000000, also 1 USD), bucht
     `topUpIfLow` `CP_KONTO_TOPUP_USDC` (Vorgabe 2000000) per `spend()` ab, höchstens den Rest der laufenden Periode
     (`getCurrentPeriod` des Vertrags); ist der Rest 0, gibt es keine Transaktion und die Anfrage bekommt 402 wie heute. Je Konto
     läuft höchstens ein Nachbuchen gleichzeitig. Gebucht wird eine Ledger-Zeile `topup` mit `ref` gleich dem Hash der Transaktion
     und `meta` mit `source` `spend_permission` und `chain_id` 84532, erst nach einer Quittung mit Status `success`
     (`receiptSucceeded`), und derselbe Hash bucht nie zweimal.
  7. Das Konto ist aus, solange `CP_KONTO_CHAIN_ID` fehlt: `step: "konto"` und `/h/{code}/konto` antworten dann 503 mit Klartext,
     und ein anderer Wert als 84532 lässt den Dienst beim Start mit Fehler enden. `deploy/**` und `.github/**` setzen keine
     Variable `CP_KONTO_*`, damit die Produktion nie Credits aus Test-USDC bucht; das Konto in der Produktion schaltet erst konto 05
     im Hauptnetz an, nach Matthias' Änderung an Regel 10.
- Die Fläche: zwei neue Zustände der Handy-Seite, `passkey` (was das Konto erlaubt, in einer Zeile das Tageslimit und an wen,
  ein Knopf, der Block `data-soll="passkey"` ganz im ersten Bildschirm, 844 px bei 390 und 900 px bei 1440) und
  `fehlgeschlagen` (Passkey abgebrochen oder Anbieter nicht erreichbar, zurück ins Terminal für einen neuen Code). `freigabe`,
  `erledigt` und `ungueltig` aus konto 02 bleiben pixelgleich, auch für `step: "konto"`. Quellen `docs/soll/src/konto-<zustand>.html`,
  Bilder `docs/soll/konto-<zustand>-<breite>.png`, vier Stück, Beispielwerte erfunden (Name `Atlas`, 5.00 USD). Werkzeug
  `ops/soll-konto.mjs` (rendern und `--pruefen`, `--source <ordner>`) und `ops/soll-live-konto.mjs` nach dem Muster der beiden
  Werkzeuge aus konto 02, die unverändert bleiben, weil das Audit ihre Prüfbefehle nachts fährt. Mängel wie dort, dazu ein Wort im
  sichtbaren Text, das der Nutzer erst übersetzen muss (`handoff`, `token`, `wallet`, `smart`, `permission`, `sepolia`, `turnkey`,
  `erc`); „passkey“ ist ein bekanntes Wort und steht. Höchstens drei neue Klassen, jede mit Grund als `` `.<klasse>` `` unter einem
  Abschnitt `## Konto /h/{code}` in `docs/soll/README.md`.
- Text: Englisch wie die Seite aus konto 02. Die Überschrift von `passkey` sagt, was beim Tippen passiert (etwa „Create your account
  with a passkey“), die Zeile darunter, was wir dürfen (etwa „PostYourPrice can charge up to $5.00 a day, only for Atlas.“).
- `ops/live.sh`: Die Prüfung `handoff` liest zusätzlich die Kopfzeile `Referrer-Policy` von `/h/<code>` und verlangt `no-referrer`
  (Vorschlag konto-kritik-3), mit einem gepflanzten Fall `strict-origin-when-cross-origin`, der `FAIL handoff` ergibt; es bleibt
  genau ein gepflanzter Fall `OK handoff`, weil konto 02 Punkt 8 genau 1 zählt. `deploy/Caddyfile` setzt an beiden Stellen
  `Referrer-Policy "?strict-origin-when-cross-origin"`, damit Caddy nur einen fehlenden Wert ergänzt.
- Der Lauf auf Base Sepolia (`ops/konto/sepolia-run.mjs`): startet das Control Plane auf dem code-host mit einer frischen
  Datenbank aus `mktemp -d` am gewählten Port auf `127.0.0.1`, legt einen Handoff mit `step: "konto"` und Tageslimit 5.00 USD an,
  öffnet `/h/<code>` in Chromium aus `~/.cache/ms-playwright/` mit einem virtuellen Authenticator über das DevTools-Protokoll
  (`WebAuthn.addVirtualAuthenticator`, Passkey wie auf dem Handy), wählt die Zahl, tippt den Knopf, wartet auf `done` im Strom. Dann
  zahlt die Testadresse per `transferWithAuthorization` 6 Test-USDC an das Konto (ein Dienst mit payTo auf dem Konto nimmt eine
  Zahlung ein), das Guthaben des Kontos fällt unter die Schwelle, `topUpIfLow` bucht 2 USD ab, und eine Abbuchung von 4 USD in einem
  späteren Block reißt die Tagesgrenze und wird mit festem Gas gesendet, damit sie on-chain scheitert. Die Hashes stehen in
  `docs/konto/sepolia.md` als Zeilen `konto: 0x…`, `besitzer: 0x…` (Turnkey-Wallet), `spender: 0x…`, `erlaubnis: 0x…`
  (`approveWithSignature`), `zahlung: 0x…`, `abbuchung: 0x…`, `ueber-grenze: 0x…` und `ledger: topup <delta_mc> <hash>`.
  `ops/konto/turnkey-check.mjs` liest mit den Schlüsseln aus `secrets.env` nur lesend die Sub-Organisation des Kontos und gibt
  `turnkey ok passkey=<n> owner=<0|1>` aus.
- Kein Schlüssel im Repo, auch nicht in Fixtures: Tests nutzen die bekannten Schlüssel von anvil oder `generatePrivateKey()` zur
  Laufzeit. Prüfbefehle ohne Netz binden keinen festen Port (`app.request`, kein `serve`), Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), `check` im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Jeder neue Test
  war einmal rot, die Zeile im Progress Log sagt, womit.
- Was danach schneller zu mehr zahlenden Kunden führt: konto 04 baut darauf `start_automaton` im Terminal, das mit sandbox 08 einen
  Automaton für einen Menschen ohne Wallet startet und seine Inferenz aus diesem Konto bezahlt; konto 05 schaltet dasselbe im
  Hauptnetz mit echtem Geld an.

## Done Condition
- [ ] Die vier SOLL-Bilder der Kontoanlage kommen aus ihren Quellen, ohne Netz und ohne Mangel, der Schritt Passkey steht ganz im
      ersten Bildschirm, und die Quellen bauen aus den Bausteinen der Seite.
      MVP: Funktion, weil die Seite nur nach Bild gebaut werden darf und der Mensch ohne Scrollen sehen muss, was er erlaubt.
      Prüfung: `node ops/soll-konto.mjs --pruefen` muss Exit 0 haben und als letzte Zeile `soll konto: 4 Bilder, passkey oben 390=<y> 1440=<y>, 0 Mängel` ausgeben, mit y bei 390 höchstens 844 und bei 1440 höchstens 900.
      Prüfung: `node -e 'const fs=require("fs");for(const z of ["passkey","fehlgeschlagen"])for(const w of [390,1440]){const b=fs.readFileSync("docs/soll/konto-"+z+"-"+w+".png");if(b.readUInt32BE(16)!==w){console.error(z,w);process.exit(1)}}console.log("breiten ok")'` muss `breiten ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const bad=[];for(const z of ["passkey","fehlgeschlagen"]){const s=fs.readFileSync("docs/soll/src/konto-"+z+".html","utf8");const t=s.replace(/<style[\s\S]*?<\/style>/g,"").replace(/<[^>]+>/g," ");if(/<script/i.test(s))bad.push(z+" script");if(!/<h1[ >]/.test(s))bad.push(z+" h1");if(/(src|srcset)="(https?:)?\/\/|<link[^>]+href="(https?:)?\/\/|url\(["\x27]?(https?:)?\/\//.test(s))bad.push(z+" fremde adresse");if(/[\u2013\u2014]/.test(s))bad.push(z+" gedankenstrich");if(/handoff|token|wallet|smart|permission|sepolia|turnkey|\berc/i.test(t))bad.push(z+" wort")}const f=fs.readFileSync("docs/soll/src/konto-passkey.html","utf8");const u=f.indexOf("data-soll=\"passkey\"");const blk=u<0?"":f.slice(u);if(u<0)bad.push("passkey fehlt");if(!/<button/i.test(blk))bad.push("knopf");if(!/passkey/i.test(blk))bad.push("wort passkey");if(!/Atlas/.test(blk)||!/\$[0-9]+\.[0-9]{2}/.test(blk))bad.push("was erlaubt wird");if(bad.length){console.error(bad);process.exit(1)}console.log("quellen ok")'` muss `quellen ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const css=(fs.readFileSync("src/public/index.html","utf8").match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join("");const q=String.fromCharCode(96);const r=fs.readFileSync("docs/soll/README.md","utf8");const m=r.match(/^## Konto \/h\/\{code\}$([\s\S]*?)(?=^## |$(?![\s\S]))/m);const sec=m?m[1]:"";const cl=new Set();for(const z of ["passkey","fehlgeschlagen"]){const s=fs.readFileSync("docs/soll/src/konto-"+z+".html","utf8");for(const x of s.matchAll(/class="([^"]+)"/g))for(const c of x[1].split(/\s+/))if(c)cl.add(c)}const neu=[...cl].filter(c=>!new RegExp("\\."+c.replace(/[.*+?^${}()|[\]\\-]/g,"\\$&")+"(?![\\w-])").test(css));const ohne=neu.filter(c=>!r.includes(q+"."+c+q));const eigen=[...sec.matchAll(new RegExp(q+"\\.([A-Za-z0-9_-]+)"+q,"g"))].length;if(!m||ohne.length||eigen>3){console.error({neu,ohne,eigen});process.exit(1)}console.log("bausteine ok neu="+eigen)'` muss `bausteine ok neu=<n>` mit n höchstens 3 ausgeben.
- [ ] Die Auswertung der Konto-Bilder lehnt jeden Mangel ab und lässt den sauberen Stand durch, und Startseite und Handoff prüfen
      sich weiter wie vorher.
      MVP: Funktion, weil ein Bild, das seine Prüfung nicht in beide Richtungen besteht, kein SOLL ist.
      Prüfung: `pnpm -s vitest run test/soll-konto.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/soll-konto.test.ts` muss mindestens 7 ausgeben (je ein Fall für Pixelabweichung, Überlauf, Gedankenstrich, fremde Adresse, Block passkey unter dem ersten Bildschirm, Wort aus der Sperrliste im sichtbaren Text, sauberer Stand ohne Mangel).
      Prüfung: `git diff --quiet origin/dev...HEAD -- ops/soll.mjs ops/soll-live.mjs ops/soll-handoff.mjs ops/soll-live-handoff.mjs test/soll.test.ts test/soll-handoff.test.ts 'docs/soll/startseite-*.png' docs/soll/src/startseite.html 'docs/soll/handoff-*.png' 'docs/soll/src/handoff-*.html' && echo bestand gleich` muss `bestand gleich` ausgeben.
      Prüfung: `node ops/soll-handoff.mjs --pruefen` muss Exit 0 haben und als letzte Zeile `soll handoff: 6 Bilder, freigabe oben 390=<y> 1440=<y>, 0 Mängel` ausgeben, und `node ops/soll.mjs --pruefen` muss Exit 0 haben und als letzte Zeile `soll: 2 Bilder, umzug oben 390=<y> 1440=<y>, 0 Mängel` ausgeben.
- [ ] Der Design Reviewer hat genau diese Bilder abgenommen, bevor die Seite gebaut wurde.
      MVP: Funktion, weil die Seite 1:1 nach einem abgenommenen Bild entsteht und nicht nach einer Beschreibung.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue konto: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- 'docs/soll/konto-*.png' 'docs/soll/src/konto-*.html'); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/public/konto.ts src/public/konto-client | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok)<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [ ] Die echte Seite in beiden neuen Zuständen ist pixelgleich mit den abgenommenen Bildern, eine geänderte Überschrift fällt dabei
      auf, und die drei Zustände aus konto 02 bleiben pixelgleich.
      MVP: Funktion, weil der Mensch auf dem Handy sehen muss, was das Bild verspricht.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-konto.mjs --out $T && node ops/soll-konto.mjs --pruefen --source $T` muss Exit 0 haben und als letzte Zeile `soll konto: 4 Bilder, passkey oben 390=<y> 1440=<y>, 0 Mängel` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i '0,/<h1>/s/<h1>/<h1>X /' $T/src/public/konto.ts; grep -q '<h1>X ' $T/src/public/konto.ts || echo sed-miss; (cd $T && node --import tsx ops/soll-live-konto.mjs --out $T/out); node ops/soll-konto.mjs --pruefen --source $T/out; echo "exit=$?"` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-handoff.mjs --out $T && node ops/soll-handoff.mjs --pruefen --source $T` muss Exit 0 haben und als letzte Zeile `soll handoff: 6 Bilder, freigabe oben 390=<y> 1440=<y>, 0 Mängel` ausgeben.
      Prüfung: `{ grep -cE '</?(html|head|body|main|section|div|form|button|h1|h2|p|span|style|meta|link|br)[ >/]|data-soll|docs/soll' ops/soll-live-konto.mjs || true; }` muss `0` ausgeben.
- [ ] Gesendet wird nur auf Base Sepolia: `sendKontoTx` lehnt jede andere chainId vor jedem Aufruf ans Netz ab, und der
      Testschlüssel kommt nur aus seiner Datei.
      MVP: Funktion, weil Regel 10 im Hauptnetz unverändert gilt und ein Fehler hier echtes Geld bewegen würde.
      Prüfung: `pnpm -s vitest run test/konto-chain.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-chain.test.ts` muss mindestens 4 ausgeben (je ein Fall: chainId 8453 ergibt einen Fehler und null Aufrufe an den Transport; chainId 1 ebenso; 84532 sendet; ein Schlüssel in `CP_KONTO_KEY_FILE` erscheint in keiner Ausgabe und keinem Fehlertext, auch nicht bei einer Datei mit falschem Inhalt).
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$(grep -lE "export function requireSepolia\(" $T/src/konto/*.ts | head -1); if [ -z "$f" ]; then echo "fehlt requireSepolia"; else sed -i "s/export function requireSepolia(/function requireSepoliaOrig(/" $f; echo "export function requireSepolia(..._a: unknown[]): void {}" >> $f; (cd $T && pnpm -s vitest run test/konto-chain.test.ts >/dev/null 2>&1) && echo "gruen ohne requireSepolia"; fi` muss nichts ausgeben.
      Prüfung: `grep -rnE "CP_SETTLER_KEY|CP_PAY_TO|privateKeyToAccount\(\s*process\.env" src/konto | wc -l` muss `0` ausgeben, und `grep -rlE "requireSepolia\(" src/konto | wc -l` muss mindestens `1` ausgeben.
- [ ] Ein Handoff mit `step: "konto"` wird erst `done`, wenn eine passende und gültig unterschriebene Erlaubnis ankommt; das Terminal
      bekommt Adresse und API-Schlüssel genau einmal, und die Gegenproben `permissionMatches` und `signatureValid` machen die Tests rot.
      MVP: Funktion, weil eine Erlaubnis an einen fremden Spender oder über dem Tageslimit das Konto des Kunden öffnen würde.
      Prüfung: `pnpm -s vitest run test/konto-account.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-account.test.ts` muss mindestens 12 ausgeben (je ein Fall: richtige Zahl ergibt `matched` und die Seite `passkey`; eine passende Erlaubnis ergibt `done`, das erste Ereignis `done` im Strom trägt `account` und `api_key`, ein zweites Lesen trägt keinen `api_key`; in der Datenbank steht der Schlüssel danach nur als Hash; fremder Spender, anderes Token, `allowance` ungleich `daily_limit_usdc`, `period` ungleich 86400 und `start` mehr als fünf Minuten in der Zukunft ergeben je 400 und `burned`; ungültige Unterschrift ergibt 400 und `burned`; `POST /h/{code}/konto` vor der richtigen Zahl ergibt 409, nach `done` und nach Ablauf 410; ohne `CP_KONTO_CHAIN_ID` ergeben `step: "konto"` und `/h/{code}/konto` 503; `step: "confirm"` und ein Handoff ohne `step` verhalten sich wie in konto 02).
      Prüfung: `for m in permissionMatches signatureValid; do T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$(grep -lE "export (async )?function $m\(" $T/src/konto/*.ts | head -1); [ -n "$f" ] || { echo "fehlt $m"; continue; }; a=; grep -qE "export async function $m\(" $f && a=async; sed -i -E "s/export (async )?function $m\(/\1function ${m}Orig(/" $f; if [ -n "$a" ]; then echo "export async function $m(..._a: unknown[]): Promise<boolean> { return true; }" >> $f; else echo "export function $m(..._a: unknown[]): boolean { return true; }" >> $f; fi; (cd $T && pnpm -s vitest run test/konto-account.test.ts >/dev/null 2>&1) && echo "gruen trotz $m"; done` muss nichts ausgeben.
      Prüfung: `pnpm -s vitest run test/handoff-api.test.ts test/handoff-page.test.ts test/handoff-events.test.ts test/handoff-cleanup.test.ts test/v1-ohne-variables-segment.test.ts test/messages.test.ts` muss Exit-Code 0 haben.
- [ ] Das Control Plane bucht Credits aus der Erlaubnis nach, wenn sie knapp werden, nie über den Rest der Periode, nur nach einer
      gelungenen Abbuchung und je Transaktion genau einmal; die Gegenprobe `receiptSucceeded` macht die Tests rot.
      MVP: Funktion, weil Inferenz ohne Nachbuchen nach dem ersten Guthaben stehen bleibt und eine Buchung ohne Geld Credits verschenkt.
      Prüfung: `pnpm -s vitest run test/konto-topup.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-topup.test.ts` muss mindestens 8 ausgeben (je ein Fall: unter der Schwelle ein `spend()` über den Betrag und nach Quittung `success` genau eine Ledger-Zeile `topup` mit dem Hash als `ref` und `chain_id` 84532 in `meta`; Quittung `reverted` ergibt keine Zeile; derselbe Hash zweimal ergibt eine Zeile; Rest der Periode kleiner als der Betrag ergibt `spend()` über den Rest; Rest 0 ergibt keine Transaktion; über der Schwelle keine Transaktion; zwei gleichzeitige Auslöser ergeben genau ein `spend()`; Konto mit chainId 8453 ergibt keine Transaktion).
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$(grep -lE "export function receiptSucceeded\(" $T/src/konto/*.ts | head -1); if [ -z "$f" ]; then echo "fehlt receiptSucceeded"; else sed -i "s/export function receiptSucceeded(/function receiptSucceededOrig(/" $f; echo "export function receiptSucceeded(..._a: unknown[]): boolean { return true; }" >> $f; (cd $T && pnpm -s vitest run test/konto-topup.test.ts >/dev/null 2>&1) && echo "gruen trotz receiptSucceeded"; fi` muss nichts ausgeben.
- [ ] Im Harness auf anvil mit chainId 84532 und dem Code der Verträge von Base Sepolia steuert eine secp256k1-Adresse eine Smart
      Wallet, `spend()` bis zur Grenze gelingt und darüber bricht mit `ExceededSpendPermission` ab; das läuft in `e2e`.
      MVP: Funktion, weil der Baustein aus konto 01 sonst erst mit Geld auf einer echten Chain bewiesen wäre und jede spätere Änderung
      ohne diesen Lauf die Grenze still brechen könnte.
      Prüfung: `grep -lE "konto-chain" harness/e2e/full.sh | wc -l` muss `1` ausgeben, und `grep -cE "84532|0xfd1ebc88|ExceededSpendPermission|createAccount|approveWithSignature" harness/e2e/konto-chain.mjs` muss mindestens `5` ausgeben.
      Prüfung: `grep -nE "^\s*command:.*--chain-id.*8453\"" harness/docker-compose.yml | wc -l` muss mindestens `1` ausgeben (die bestehende Chain bleibt auf 8453), und `grep -cE -- "--chain-id.*84532" harness/docker-compose.yml` muss mindestens `1` ausgeben.
      Prüfung (Netz): `node -e 'const fs=require("fs");const r=fs.readFileSync("harness/chain/konto/README.md","utf8");const rows=[...r.matchAll(/^\| *(0x[0-9a-fA-F]{40}) *\| *([^ |]+) *\| *(0x[0-9a-f]{64}) *\|/gm)];if(rows.length<4){console.error("zu wenige zeilen "+rows.length);process.exit(1)}const {keccak256}=require("viem");(async()=>{const bad=[];for(const [,a,f,h] of rows){const local=fs.readFileSync("harness/chain/konto/"+f,"utf8").trim();if(keccak256(local)!==h)bad.push("datei "+f);const res=await fetch("https://sepolia.base.org",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_getCode",params:[a,"latest"]})}).then(x=>x.json());if(keccak256(res.result)!==h)bad.push("chain "+a)}if(bad.length){console.error(bad);process.exit(1)}console.log("code gleich "+rows.length)})()'` muss `code gleich <n>` mit n mindestens 4 ausgeben (je Zeile der Tabelle Adresse, Datei unter `harness/chain/konto/` mit dem Code als Hex, keccak256).
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-03 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="e2e" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [ ] Die Produktion bucht nie Credits aus Test-USDC: Ohne `CP_KONTO_CHAIN_ID` ist das Konto aus, ein anderer Wert als 84532 hält den
      Dienst beim Start an, und kein Deploy setzt die Variable.
      MVP: Funktion, weil Credits aus Test-Geld in der Produktion verschenkte Inferenz wären.
      Prüfung: `pnpm -s vitest run test/konto-config.test.ts` muss Exit-Code 0 haben, und `grep -cE "^\s*(it|test)\(" test/konto-config.test.ts` muss mindestens 3 ausgeben (je ein Fall: ohne Variable ist das Konto aus; 84532 schaltet es an; 8453 ergibt beim Start einen Fehler).
      Prüfung: `grep -rn "CP_KONTO_" deploy .github | wc -l` muss `0` ausgeben.
- [ ] Auf Base Sepolia entstand ein Konto per Passkey über den Handoff, es bekam eine Zahlung, die Erlaubnis buchte Credits ab, und
      eine Abbuchung über der Tagesgrenze scheiterte on-chain.
      MVP: Funktion, weil erst der echte Lauf belegt, dass Turnkey, die Smart Wallet und die Erlaubnis zusammen tragen (Widerlegung
      dieses Goals).
      Prüfung (Netz): `node -e 'const fs=require("fs");const d=fs.readFileSync("docs/konto/sepolia.md","utf8");const g=k=>{const m=d.match(new RegExp("^"+k+": (0x[0-9a-fA-F]+)$","m"));return m?m[1].toLowerCase():""};const rpc=(method,params)=>fetch("https://sepolia.base.org",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})}).then(r=>r.json());const SPM="0xf85210b21cc50302f477ba56686d2019dc9b67ad",USDC="0x036cbd53842c5426634e7929541ec2318f3dcf7e",T="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";const pad=a=>"0x"+a.slice(2).padStart(64,"0");(async()=>{const bad=[];const cid=(await rpc("eth_chainId",[])).result;if(cid!=="0x14a34")bad.push("chain "+cid);const konto=g("konto"),spender=g("spender"),owner=g("besitzer");if(!konto||!spender||!owner)bad.push("konto, spender oder besitzer fehlt");for(const k of ["erlaubnis","zahlung","abbuchung","ueber-grenze"]){const h=g(k);if(!h){bad.push("fehlt "+k);continue}const rc=(await rpc("eth_getTransactionReceipt",[h])).result;if(!rc){bad.push("kein beleg "+k);continue}if(rc.status!==(k==="ueber-grenze"?"0x0":"0x1"))bad.push(k+" status "+rc.status);if(k!=="zahlung"&&(rc.to||"").toLowerCase()!==SPM)bad.push(k+" nicht an SpendPermissionManager");const tr=rc.logs.filter(l=>l.address.toLowerCase()===USDC&&l.topics[0]===T);if(k==="zahlung"&&!tr.some(l=>l.topics[2]===pad(konto)))bad.push("zahlung nicht aufs konto");if(k==="abbuchung"&&!tr.some(l=>l.topics[1]===pad(konto)&&l.topics[2]===pad(spender)))bad.push("abbuchung nicht vom konto an den spender");if(k==="ueber-grenze"){const tx=(await rpc("eth_getTransactionByHash",[h])).result;const c=await rpc("eth_call",[{from:tx.from,to:tx.to,data:tx.input},"0x"+(BigInt(rc.blockNumber)-1n).toString(16)]);if(!String((c.error&&c.error.data)||"").startsWith("0xfd1ebc88"))bad.push("kein ExceededSpendPermission")}}const o=await rpc("eth_call",[{to:konto,data:"0xa2e1a8d8"+owner.slice(2).padStart(64,"0")},"latest"]);if(!o.result||BigInt(o.result)!==1n)bad.push("besitzer ist nicht eigentuemer");const l=d.match(/^ledger: topup ([0-9]+) (0x[0-9a-fA-F]{64})$/m);if(!l||l[2].toLowerCase()!==g("abbuchung"))bad.push("ledger nicht zur abbuchung");if(bad.length){console.error(bad);process.exit(1)}console.log("sepolia ok")})()'` muss `sepolia ok` ausgeben (die Abbuchung über der Grenze liegt in einem späteren Block als die gelungene).
      Prüfung (Netz): `node ops/konto/turnkey-check.mjs` muss als letzte Zeile `turnkey ok passkey=<n> owner=1` mit n mindestens 1 ausgeben.
      Prüfung: `s=$(sed -n 's/^spender: //p' docs/konto/sepolia.md); [ -n "$s" ] && ! grep -rqi -- "$s" src deploy && echo spender eigen` muss `spender eigen` ausgeben (die Adresse des Testschlüssels steht nirgends im Code und nicht in `src/bounties/ours.ts`).
- [ ] Der Testschlüssel steht nirgends im Repo: weder im Diff noch in einem Commit des Goal-Branches, und die Datei auf dem code-host
      ist nur für ihren Besitzer lesbar.
      MVP: Funktion, weil die Ausnahme für Base Sepolia nur für einen Schlüssel gilt, der nie im Repo, Log oder einer Ausgabe steht.
      Prüfung: `f=~/.config/control-plane/konto-sepolia.key; [ "$(stat -c %a $f)" = 600 ] || echo "modus $(stat -c %a $f)"; k=$(tr -d '\n' < $f | sed 's/^0x//'); [ ${#k} -eq 64 ] || echo "kein schluessel"; git log -p origin/dev..HEAD | grep -ci -- "$k"` muss als einzige Ausgabe `0` haben.
- [ ] Die Kopfzeile `Referrer-Policy: no-referrer` von `/h/{code}` kommt in der Produktion an, und die Live-Prüfung merkt, wenn
      nicht.
      MVP: Funktion, weil an `/h/{code}` jetzt die Kontoanlage hängt und Caddy die Kopfzeile der App bisher überschreibt.
      Prüfung: `grep -c 'Referrer-Policy "?strict-origin-when-cross-origin"' deploy/Caddyfile` muss mindestens `2` ausgeben, und `grep -c 'Referrer-Policy "strict-origin-when-cross-origin"' deploy/Caddyfile` muss `0` ausgeben.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `LIVE SELFTEST OK` ausgeben, `bash ops/live.sh --selftest | grep -E '^planted handoff ' | grep -c ': OK handoff'` muss `1` ausgeben, und `bash ops/live.sh --selftest | grep -E '^planted handoff ' | grep -i 'referrer' | grep -c ': FAIL handoff'` muss mindestens `1` ausgeben.
- [ ] Der Ablauf steht für konto 04 und 05 fest, und die Entscheidungen stehen mit Grund in `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil konto 04 die Tools gegen diesen Ablauf baut und konto 05 ihn ins Hauptnetz bringt.
      Prüfung: `for w in step matched account api_key permissionMatches signatureValid requireSepolia topUpIfLow CP_KONTO_CHAIN_ID CP_KONTO_KEY_FILE CP_KONTO_RPC_URL CP_KONTO_TOPUP_BELOW_USDC CP_KONTO_TOPUP_USDC 84532 86400 ExceededSpendPermission; do grep -qw -- "$w" docs/konto/konto.md || echo "fehlt $w"; done; for h in "## Ablauf" "## Erlaubnis" "## Nachbuchen" "## Base Sepolia" "## Für konto 04 und 05"; do grep -qx -- "$h" docs/konto/konto.md || echo "fehlt $h"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Goal 03/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens 7 ausgeben.
- [ ] Der Diff bleibt in den Pfaden dieses Goals, kein Test wird schwächer, höchstens drei neue Pakete und zwei neue Pakete für die
      Entwicklung, kein Schlüssel im Diff, und `check` und `e2e` sind grün.
      MVP: Funktion, weil der Merge über `deploy.yml` ausrollt und zahlende Kunden den Stand tragen.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/app\.ts|src/db\.ts|src/index\.ts|src/handoff/[A-Za-z0-9._-]+\.ts|src/konto/[A-Za-z0-9._-]+\.ts|src/public/handoff\.ts|src/public/konto\.ts|src/public/konto-client/[A-Za-z0-9._/-]+|src/public/openapi\.ts|test/[A-Za-z0-9._-]+\.ts|ops/soll-konto\.mjs|ops/soll-live-konto\.mjs|ops/soll-assess\.mjs|ops/konto/[A-Za-z0-9._-]+|ops/live\.sh|harness/chain/konto/[A-Za-z0-9._-]+|harness/chain/chain\.mjs|harness/e2e/konto-chain\.mjs|harness/e2e/full\.sh|harness/docker-compose\.yml|deploy/Caddyfile|docs/soll/konto-(passkey|fehlgeschlagen)-(390|1440)\.png|docs/soll/src/konto-(passkey|fehlgeschlagen)\.html|docs/soll/README\.md|docs/konto/(konto|sepolia)\.md|package\.json|pnpm-lock\.yaml|tsconfig\.json|goals/konto/(verdicts/)?[A-Za-z0-9._-]+\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `T=$(mktemp -d); git show origin/dev:package.json > $T/p.json; node -e 'const a=require(process.argv[1]),b=require("./package.json");const n=k=>Object.keys(b[k]||{}).filter(x=>!(x in (a[k]||{})));const d=n("dependencies"),v=n("devDependencies");if(d.length>3||v.length>2){console.error(d,v);process.exit(1)}console.log("pakete ok "+d.length+" "+v.length)' $T/p.json` muss `pakete ok <d> <v>` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-03 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Mensch ohne Wallet hat nach der Zahl und einem Tipp auf den Passkey ein Konto und sieht vorher, was wir abbuchen dürfen.
- [ ] Wer nur den QR-Code, den Link oder den Agent im Terminal hat, kommt an höchstens das Tageslimit und nur zu unseren Gunsten
      als Credits; eine Abbuchung darüber scheitert on-chain.
- [ ] Kein Schlüssel und kein Kundengeld liegt bei uns: Den Passkey hat der Kunde, den Testschlüssel nur der code-host, die
      Produktion bucht nichts aus Test-USDC.
- [ ] Kein Gedankenstrich, kein Name und keine Wallet-Adresse eines Kunden, kein Wort, das der Nutzer erst übersetzen muss.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/runtime/**`,
  `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `deploy/**` außer `deploy/Caddyfile`
- `src/auth/**` und `src/payments/**`: dieses Goal nennt sie nicht zum Ändern; ihre Funktionen dürfen importiert werden
- `ops/soll.mjs`, `ops/soll-live.mjs`, `ops/soll-handoff.mjs`, `ops/soll-live-handoff.mjs`, `test/soll.test.ts`,
  `test/soll-handoff.test.ts`, die Bilder und Quellen der Startseite und des Handoffs unter `docs/soll/`
- `ROADMAP.md`, `docs/kette.md`, `docs/konto/anbieter.md`, `docs/konto/handoff.md` und alle Goal-Dateien außer dieser
- jede Transaktion außerhalb von Base Sepolia (84532), der Schlüssel der Betreiber-Wallet (`CP_SETTLER_KEY`, `CP_PAY_TO` und jeder
  Schlüssel der Produktion), ein Faucet mit Captcha oder Konto durch einen Agent, Kauf, Aufladung, Wallet-Bewegung im Hauptnetz
  (`loop-constraints.md`, Grundregeln 9 und 10)
- der Testschlüssel in Repo, Log, Ausgabe, Kommentar, Fixture oder Fehlertext; eine Variable `CP_KONTO_*` auf dem Server
- ein Konto oder eine Erlaubnis eines echten Kunden; Turnkey nur über die Sub-Organisationen des eigenen Laufs, lesend
- kein Skript eines fremden Dienstes auf der Seite und kein Aufruf einer fremden Adresse beim Rendern der SOLL-Bilder
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 5
- max Versuche pro Gap: 3

## Progress Log

## Blockers
keine
