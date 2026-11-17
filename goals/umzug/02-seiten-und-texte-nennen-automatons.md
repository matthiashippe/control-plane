# Umzug Goal 02: Seiten und Texte nennen Automatons

## Status
ACTIVE

## Active Objective
Nach außen heißt der Dienst `automatonhost.com`, und kein Text, den ein Besucher, ein Betreiber oder sein Automaton liest, nennt
PostYourPrice oder Handsel: Startseite, Seitentitel, strukturierte Daten, `llms.txt`, OpenAPI, die Vorschaubilder geteilter Links, die
Handy-Seiten unter `/h/{code}`, README, das Plugin (`.claude-plugin/marketplace.json`, `mcp/.claude-plugin/plugin.json`, der Standard
von `CP_URL` in `mcp/server.mjs`), der Skill des Plugins und der Name im Passkey. Die Startseite führt mit dem Angebot für Automatons,
der Markt für Menschen bleibt erreichbar, steht aber nicht oben. Vor dem Bau stehen neue SOLL-Bilder bei 390 und 1440 px unter
`docs/soll/`, abgenommen vom Design Reviewer. Zuletzt stellt Matthias den kanonischen Host mit einer Zeile auf `automatonhost.com` um
(Human Gate), und `postyourprice.com` leitet seine Seiten dorthin weiter (`ROADMAP.md`, umzug 02; `docs/kette.md`, umzug 02;
`docs/umzug.md`, Der Wechsel).
MVP: Funktion, weil Matthias das Angebot seit dem 17.11.2026 unter dem Namen Automatons und der Domain `automatonhost.com` verkauft
und ein Betreiber aus einem Conway-Issue am Namen erkennen soll, was er hier bekommt.

## Voraussetzungen
- umzug Goal 01 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Betreiber, dessen Automaton bei Conway hängt, landet auf `automatonhost.com`, liest dort als Erstes, dass
  sein Automaton hier weiterläuft, und findet in Seite, README, Plugin und Passkey denselben Namen. Was dem nicht dient, gehört nicht
  in dieses Goal.
- Grundsatz (Matthias 17.11.2026, `docs/kette.md` Abschnitt umzug): Nach außen wird PostYourPrice weder genannt noch verlinkt; das
  Angebot sind die Automatons, die bei uns laufen, der Name ist die Domain `automatonhost.com`. Einen anderen Markennamen setzt kein
  Goal.
- Stand am 17.11.2026 (`dev` bei `e8126eb`), gemessen:
  - umzug 01 ist auf `dev` (`d1d2ded`): Der Dienst antwortet auf `automatonhost.com`, `postyourprice.com` und `cp.hippe.eu`, Seiten
    leiten auf den Host aus `CP_PUBLIC_URL`, und `deploy/docker-compose.prod.yml` Zeile 19 steht noch auf
    `CP_PUBLIC_URL: https://postyourprice.com`.
  - `git grep -c -iE 'postyourprice|handsel'` findet den alten Namen in ausgelieferten Dateien unter anderem in `src/public/index.html`
    (6), `src/app.ts` (17, darunter `llms.txt` und Seitentitel), `src/public/money.ts` (9), `src/public/handoff.ts` (5, Kopf und
    Fußzeile jeder Handy-Seite), `src/public/konto.ts` (4), `src/public/limit.ts`, `src/public/jsonld.ts`, `src/public/openapi.ts`,
    `src/public/frame.de.ts`, `src/public/terms.ts`, `src/public/og-card.html`, `src/public/og-card-x402.html`, im Bild
    `src/public/og.png`, in `README.md` (Titel `# Handsel`), in `.claude-plugin/marketplace.json`, `mcp/.claude-plugin/plugin.json`
    (`CP_URL` `https://postyourprice.com`), `mcp/server.mjs` (Beschreibung, `DEFAULT_BASE_URL` `https://cp.hippe.eu`),
    `mcp/README.md`, `mcp/skills/automaton/SKILL.md` und in `src/public/konto-client/flow.mjs` (`rp.name`, `walletName` und der Name
    des Passkeys `PostYourPrice <Datum>`).
  - Alle 15 SOLL-Quellen unter `docs/soll/src/` nennen PostYourPrice (Kopf der Handy-Seiten, Titel, Sätze wie „PostYourPrice can
    charge up to …“), also ändern sich alle 30 Bilder. `ops/soll-live.mjs` rendert `/` mit `CP_PUBLIC_URL=https://postyourprice.com`.
  - `ops/before-the-answers.py` verlangt in jedem Entwurf für den Kanal `https://postyourprice.com` (`CANONICAL_HOST`).
  - Konto ist in der Produktion aus: `konto_accounts` hatte am 17.11.2026 0 Zeilen, `CP_KONTO_AUTH_PROXY_ID` war leer
    (`goals/umzug/ANNAHMEN.md`, Goal 01). Ohne Konto startet das Plugin keinen Automaton.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 02` in `goals/umzug/ANNAHMEN.md`):
  1. **Der Name ist `automatonhost.com`, klein geschrieben**, im Kopf jeder Seite, in Titeln (`<Seite> | automatonhost.com`), in
     `og:site_name`, `jsonld.ts`, `openapi.ts`, `llms.txt` (`# automatonhost.com`), im Impressum („automatonhost.com is operated
     privately by Matthias Hippe …“) und in der Fußzeile der Handy-Seiten. „automaton“ ist das Wort der Zielgruppe für ihren Agenten
     und steht. In Sätzen, deren Subjekt heute PostYourPrice ist, steht „We“ („We can charge up to $5.00 a day for your account
     Atlas.“, „We never see your passkey and cannot open the account.“, „We never see your card number.“); was am Ende dasteht,
     entscheidet die Abnahme.
  2. **Maschinenverträge bleiben**: das JSON-Feld `handsel_notice`, der Header `X-PostYourPrice-Hint`, Kennungen in der Datenbank
     (`handsel-%`), `ctl.sbx.postyourprice.com`, `SERVICE_HOSTS`, `PAYMENT_ZONES`, die Adressen in `src/handoff/routes.ts` und alles
     unter `src/payments/`, weil Runtimes, installierte Plugins und Drittsysteme sie lesen und ein neuer Name sie bräche, ohne dass ein
     Leser etwas gewinnt. `/terms` darf `handsel_notice` als Feldnamen in `<code>` nennen; das ist die einzige erlaubte Fundstelle in
     einer ausgelieferten Seite.
  3. **Startseite**: Reihenfolge wie heute (Block `data-soll="move"`, dann `class="human"`, dann `id="fuer-agenten"`), damit
     `test/landing-move.test.ts` seinen Zweck behält. Der Block `move` bleibt der erste Bildschirm und zeigt `conwayApiUrl` mit
     `https://automatonhost.com`. Er nennt nur Wege, die die Produktion heute trägt: den Wechsel mit `conwayApiUrl`; den Start eines
     Automatons bei uns nur, wenn der Maker mit einem lesenden Aufruf belegt, dass der verlinkte Weg in der Produktion antwortet, sonst
     nicht (Konto ist aus, das Plugin startet ohne Konto nichts, und ein Versprechen, das nicht hält, verbietet Regel V). Im Kopf führt
     der Knopf zum Wechsel (`/fix`) statt zu „Post a job“; „Post a job“ bleibt im Abschnitt `fuer-agenten`. Vorschlag für Titel und
     Überschrift: `automatonhost.com: keep your automaton running`, „Conway not answering? Your automaton runs here.“
  4. **Plugin**: Marketplace `automatonhost` mit Besitzer `automatonhost.com`, der Server in `mcpServers` heißt `automatonhost`, `CP_URL`
     ist `https://automatonhost.com`, ebenso `DEFAULT_BASE_URL` in `mcp/server.mjs`. Installation in README und `mcp/README.md`:
     `claude plugin marketplace add matthiashippe/control-plane && claude plugin install automaton@automatonhost`. Ein schon
     installiertes `automaton@postyourprice` läuft weiter, weil die API auf `postyourprice.com` ohne Weiterleitung antwortet; README und
     Plugin erwähnen den alten Namen nicht.
  5. **Passkey**: `rp.name` und `walletName` sind `automatonhost.com`, der Name des Passkeys `automatonhost.com <Datum>`. `rpId` bleibt
     `window.location.hostname`; neue Passkeys entstehen nach dem Wechsel für `automatonhost.com`. `konto.js` wird mit
     `node ops/konto/build-client.mjs` neu gebaut. `https://automatonhost.com` als erlaubter Origin im Auth Proxy von Turnkey kommt mit
     dem Einschalten von Konto, nicht hier; `docs/umzug.md` nennt den Schritt.
  6. **Kanal**: `CANONICAL_HOST` in `ops/before-the-answers.py` ist ohne `CP_PUBLIC_HOST` `automatonhost.com`, `KNOWN_HOSTS` nennt alle
     drei Hosts. Damit verlangt jeder neue Entwurf `https://automatonhost.com` und meldet einen Entwurf mit `postyourprice.com` oder
     `cp.hippe.eu` als veraltet. Die Entwürfe unter `goals/kanal/antworten*/` gehören zu fertigen Goals und bleiben, wie sie sind.
  7. **Vorschaubilder**: `src/public/og-card.html` und `src/public/og-card-x402.html` nennen `automatonhost.com` statt PostYourPrice
     und `postyourprice.com`; `src/public/og.png` und `src/public/og-x402.png` werden aus ihnen neu aufgenommen (Chromium aus
     `~/.cache/ms-playwright/`, 2400 x 1260 wie in `og:image:width` und `og:image:height`), `ops/og-card-says-the-truth.sh` bleibt grün.
  8. **Weiterleitung vor dem Wechsel absichern** (übernimmt `goals/_vorschlaege/umzug-kritik-2026-11-17-1.md` und
     `goals/_vorschlaege/umzug-kritik-2026-11-17-2.md`): Steht `siteHost()` nicht in `SERVICE_HOSTS` (Tippfehler im Wechsel, etwa
     `automatonhost.de`), leitet die Middleware in `src/app.ts` nichts weiter und loggt genau einmal je Prozess die Zeile
     `canonical host <host> is not in SERVICE_HOSTS, pages are not redirected`, weil ein 301 auf einen Host, den Caddy nicht bedient,
     in Browsern hängen bleibt. Dazu je ein Fall für einen Host mit `:443` und einen mit Punkt am Ende, die wie der nackte Host
     weitergeleitet werden.
  9. **Der Wechsel ist ein Human Gate und kommt zuletzt.** `deploy/docker-compose.prod.yml` steht in `deny_paths` und in der Deny List;
     kein Agent ändert die Datei. Sind alle anderen Punkte grün, misst der Maker nur lesend wie in umzug 01: die Zahl der Zeilen in
     `konto_accounts`, ob `CP_KONTO_AUTH_PROXY_ID` gesetzt ist, und `bash ops/live.sh` (Zeile `OK hosts: canonical postyourprice.com`),
     und schreibt Befehle und Ergebnis unter `## Goal 02` in die Annahmen. Ist die Zahl nicht 0 oder die Auth-Proxy-ID gesetzt, fragt
     er den Tech Lead auf dem Topic, bevor er das Gate setzt, weil Passkeys an die rpId `postyourprice.com` gebunden sind. Sonst setzt
     er `## Status` auf `BLOCKED matthias` mit diesen Zeilen unter `## Blockers`:
     ```
     Art: matthias
     Aufgabe: In deploy/docker-compose.prod.yml auf dev die Zeile CP_PUBLIC_URL von https://postyourprice.com auf https://automatonhost.com ändern und mergen.
     Worum: Erst damit ist automatonhost.com der Name, unter dem Seiten, Stripe-Rücksprung und x402-Angebote erscheinen; die Datei ändert nur Matthias.
     Empfehlung: Im Terminal am Mac im Checkout von control-plane: git fetch origin && git switch -c umzug-wechsel origin/dev && sed -i '' 's#CP_PUBLIC_URL: https://postyourprice.com#CP_PUBLIC_URL: https://automatonhost.com#' deploy/docker-compose.prod.yml && git commit -am "umzug: CP_PUBLIC_URL auf automatonhost.com" && git push -u origin umzug-wechsel && gh pr create -B dev -f && gh pr merge --merge --admin
     ```
     Der Merge rollt über `deploy.yml` aus. Danach holt der Maker `dev` in den Goal-Branch, prüft Punkt 9 und meldet den Abschluss.
  10. **Abgelöste Prüfbefehle fertiger Goals.** Neue Bilder, neue Texte und der neue Standard in `ops/before-the-answers.py` ändern die
      Ausgabe von Prüfbefehlen fertiger Goals (seite, konto, kanal und andere). Entscheidung (Tech Lead, 2026-11-17): Diese Punkte sind
      durch dieses Goal abgelöst. Der Maker führt jeden Prüfbefehl der Goal-Dateien mit Status `DONE`, der einen Pfad aus
      `git diff --name-only origin/dev...HEAD` oder eines der Wörter PostYourPrice, Handsel, postyourprice nennt, an der Merge-Basis
      und am Goal-Branch aus (außer Befehlen, die etwas verschicken oder live auf echten Daten laufen), und für jeden, dessen Ausgabe
      sich ändert, steht im `goals/<topic>/ANNAHMEN.md` des abgelösten Goals genau eine Zeile, gesammelt unter
      `## Abgelöst durch umzug 02 (Maker, <Datum>)`:
      ```
      - Abgelöst: <topic> <NN> Punkt <n> durch umzug 02 Punkt <m>, Ausgabe dann genau `Exit <k>, <letzte Zeile>` (Tech Lead, 2026-11-17)
      ```
      `<m>` ist der Punkt dieses Goals, der denselben Zweck mit dem neuen Namen prüft. Die Goal-Dateien selbst bleiben eingefroren.
      Die Zeile im Progress Log nennt die Zahl der abgelösten Befehle je Goal.
- Tests, die heute den alten Namen erwarten, erwarten danach den neuen; keine Assertion fällt weg, keine wird schwächer.
- Neue Tests importieren nur, was es am Kopf von `dev` schon gibt (`createApp`, `openDb`, die Renderer unter `src/public/`), damit die
  Gegenproben rote Fälle zeigen statt eines Importfehlers.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte):
  1. Zuerst die SOLL-Quellen und -Bilder (Punkt 1) und `ops/soll-live.mjs` auf `https://automatonhost.com`, Commit, Push. Dann den
     Design Reviewer auf dem Topic dieses Goals mit allen 30 Bildpfaden und dem Commit erwähnen und die Zeile
     `Abnahme-Issue umzug: PRO-<n>` in `docs/soll/README.md` setzen. Bis „SOLL abgenommen“ dasteht, ändert der Maker
     `src/public/index.html`, `src/public/handoff.ts`, `src/public/konto.ts`, `src/public/limit.ts` und `src/public/money.ts` nicht
     (Punkt 2 prüft das an den Zeitstempeln). Die vorhandenen Zeilen `Abnahme-Issue…` bleiben.
  2. Während der Abnahme README, Plugin und MCP (Punkt 5), Passkey (Punkt 6), Kanal (Punkt 7), Weiterleitung (Punkt 8), die übrigen
     Texte ohne die fünf Seitendateien (Punkt 4), je Punkt Commit und Push.
  3. Nach der Abnahme die Seiten (Punkte 3 und 4), dann abgelöste Prüfbefehle (Punkt 10), Doku und Annahmen (Punkt 11), Umfang und
     `check` (Punkte 12 und 13), zuletzt der Wechsel (Punkt 9, Human Gate).
- Die SOLL-Befehle laufen mit `FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf` wie in konto 04 bis 06. konto 07 und
  konto 08 (Browser-Treiber der SOLL-Werkzeuge) können parallel laufen: vor der Übergabe `dev` mergen; die Prüfbefehle hier lesen nur
  Exit-Code und `0 defects` am Ende der letzten Zeile, nicht die übrige Summenzeile.
- Der PR ändert `.claude-plugin/marketplace.json`, das nicht in `merge_allowlist` steht, und kann mit 30 Bildern über
  `max_files_per_goal_pr` (80) kommen. Das Gate gibt ihn dann mit Grund `allowlist` oder `files` in die Human Inbox, die für diesen
  Loop der Tech Lead ist; das ist erwartet und kein Grund, Dateien wegzulassen.
- Prüfbefehle ohne Netz binden keinen festen Port (`app.request`), Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check`, vitest und
  die SOLL-Werkzeuge im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Jeder neue Test war einmal rot,
  die Zeile im Progress Log sagt, womit. Progress Log und Verdicts zitieren keine Suchausdrücke der Prüfbefehle wörtlich.
- Rollout: `src/**` liegt im Laufzeitpfad, der Merge rollt über `deploy.yml` aus; der Wechsel rollt mit Matthias' Merge aus.
- Widerlegt, wenn der Test aus Punkt 4 schon am Kopf von `dev` grün ist; dann nennt keine ausgelieferte Seite den alten Namen mehr,
  und das Goal endet mit dieser Messung in den Annahmen.
- Was danach schneller zu mehr zahlenden Automatons führt: Der Kanal verlinkt ab jetzt `https://automatonhost.com`, und jede Antwort
  in einem Conway-Issue führt auf eine Seite, deren erster Satz sagt, dass der Automaton hier weiterläuft.

## Done Condition
- [x] Die 30 SOLL-Bilder (Startseite 2, Handy-Seiten 28) kommen aus Quellen, die weder PostYourPrice noch Handsel nennen und im Kopf
      `automatonhost.com` tragen; der Block `move` der Startseite steht vor dem Markt für Menschen und zeigt `conwayApiUrl` mit
      `https://automatonhost.com`; jedes SOLL-Werkzeug meldet 0 Mängel.
      MVP: Funktion, weil die Seiten nur nach Bild gebaut werden dürfen und der Betreiber den neuen Namen zuerst auf der Startseite
      sieht.
      Prüfung: `cat docs/soll/src/*.html | grep -ciE 'postyourprice|handsel'` muss 0 ausgeben.
      Prüfung: `for f in docs/soll/src/*.html; do grep -qF automatonhost.com "$f" || echo "fehlt $f"; done` muss nichts ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("docs/soll/src/startseite.html","utf8");const m=s.indexOf("data-soll=\"move\""),h=s.indexOf("class=\"human\""),a=s.indexOf("id=\"fuer-agenten\"");const blk=m<0?"":s.slice(m,s.indexOf("</section>",m));const bad=[];if(!(m>=0&&m<h&&h<a))bad.push("order");if(!blk.includes("conwayApiUrl"))bad.push("conwayApiUrl");if(!blk.includes("https://automatonhost.com"))bad.push("host");console.log(bad.length?bad.join(" "):"start ok")'` muss `start ok` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- 'docs/soll/*.png' | wc -l` muss 30 ausgeben.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-handoff.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-konto.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-limit.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-money.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
- [x] Der Design Reviewer hat die 30 Bilder nach ihrem letzten Commit abgenommen, bevor eine der fünf Seitendateien sich änderte.
      MVP: Funktion, weil kein UI ohne abgenommenes Bild gebaut wird (`LOOP.md`, Fläche nur nach SOLL-Bild).
      Prüfung: `grep -cE '^Abnahme-Issue umzug: PRO-[0-9]+$' docs/soll/README.md` muss 1 ausgeben.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue umzug: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- 'docs/soll/*.png' 'docs/soll/src/*.html'); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/public/index.html src/public/handoff.ts src/public/konto.ts src/public/limit.ts src/public/money.ts | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok)<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [x] Die echte Startseite und alle Zustände der Handy-Seiten sind pixelgleich mit den neuen Bildern, gerendert mit
      `CP_PUBLIC_URL=https://automatonhost.com`.
      MVP: Funktion, weil erst die echte Seite zeigt, was der Besucher liest.
      Prüfung: `grep -c 'https://postyourprice.com' ops/soll-live.mjs` muss 0 ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live.mjs --out $T/s.html && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check --source $T/s.html > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-handoff.mjs --out $T && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-handoff.mjs --check --source $T > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-konto.mjs --out $T && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-konto.mjs --check --source $T > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-limit.mjs --out $T && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-limit.mjs --check --source $T > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-money.mjs --out $T && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-money.mjs --check --source $T > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
- [x] Keine ausgelieferte Seite nennt PostYourPrice oder Handsel: jede Seite aus `/sitemap.xml`, `/llms.txt`, `/openapi.json`, jeder
      Zustand der Handy-Seiten und beide Vorschaubilder, außer dem Feldnamen `handsel_notice` auf `/terms`. Die neuen Fälle waren vor
      dem Fix rot.
      MVP: Funktion, weil jede Seite, die ein Betreiber aus einem Issue oder einem geteilten Link öffnet, sonst den Namen zeigt, unter
      dem wir nicht mehr verkaufen.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-name.test.ts test/og-card.test.ts test/llms-txt.test.ts test/sitemap-covers-pages.test.ts test/landing-move.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/automaton-name.test.ts` muss mindestens 4 ausgeben.
      Prüfung: `for w in sitemap.xml llms.txt openapi.json handsel_notice og-card automatonhost.com; do grep -qF -- "$w" test/automaton-name.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; B=$(git merge-base origin/dev HEAD); rm -rf $T/src; git archive $B src | tar -x -C $T; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-name.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 3 ausgeben.
      Prüfung: `cat src/public/og-card.html src/public/og-card-x402.html | grep -ciE 'postyourprice|handsel'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src/public/og.png src/public/og-x402.png | wc -l` muss 2 ausgeben.
      Prüfung: `bash ops/og-card-says-the-truth.sh --selftest` muss Exit-Code 0 haben.
- [x] README, Plugin, MCP-Server und Skill nennen `automatonhost.com` statt PostYourPrice, Handsel oder `cp.hippe.eu`, das Plugin
      spricht ohne eigene Einstellung mit `https://automatonhost.com`, und die Installation heißt `automaton@automatonhost`.
      MVP: Funktion, weil das Plugin der Weg ist, auf dem ein Mensch aus Claude Code einen Automaton bei uns startet, und sein Name im
      Terminal derselbe sein muss wie auf der Seite.
      Prüfung: `cat README.md mcp/README.md mcp/skills/automaton/SKILL.md mcp/server.mjs mcp/.claude-plugin/plugin.json .claude-plugin/marketplace.json | grep -ciE 'postyourprice|handsel|cp\.hippe\.eu'` muss 0 ausgeben.
      Prüfung: `head -n 1 README.md | grep -c automatonhost.com` muss 1 ausgeben.
      Prüfung: `node -e 'const p=require("./mcp/.claude-plugin/plugin.json");const m=require("./.claude-plugin/marketplace.json");const s=Object.entries(p.mcpServers);const bad=[];if(m.name!=="automatonhost")bad.push("marketplace");if(s.length!==1||s[0][0]!=="automatonhost"||s[0][1].env.CP_URL!=="https://automatonhost.com")bad.push("server");console.log(bad.length?bad.join(" "):"plugin ok")'` muss `plugin ok` ausgeben.
      Prüfung: `grep -cxF 'export const DEFAULT_BASE_URL = "https://automatonhost.com";' mcp/server.mjs` muss 1 ausgeben.
      Prüfung: `cat README.md mcp/README.md | grep -c 'claude plugin install automaton@automatonhost'` muss mindestens 2 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/mcp.test.ts test/mcp-automaton.test.ts test/mcp-money.test.ts` muss Exit-Code 0 haben.
- [x] Der Passkey heißt `automatonhost.com <Datum>`, `rp.name` und `walletName` sind `automatonhost.com`, die rpId bleibt der Host der
      Seite, und `konto.js` ist aus den Quellen neu gebaut.
      MVP: Funktion, weil der Mensch den Passkey später in seinem Schlüsselbund unter dem Namen suchen muss, unter dem er das Konto
      angelegt hat.
      Prüfung: `cat src/public/konto-client/flow.mjs src/public/konto-client/konto.js | grep -ci postyourprice` muss 0 ausgeben.
      Prüfung: `grep -c 'automatonhost.com' src/public/konto-client/flow.mjs` muss mindestens 1 ausgeben.
      Prüfung: `grep -c 'rpId: window.location.hostname' src/public/konto-client/main.mjs` muss 1 ausgeben.
      Prüfung: `node --input-type=module -e 'import fs from "node:fs"; import { bundle, BUNDLE } from "./ops/konto/build-client.mjs"; console.log((await bundle()) === fs.readFileSync(BUNDLE, "utf8") ? "gleich" : "alt")'` muss `gleich` ausgeben.
      Prüfung: `grep -c 'automatonhost.com' test/konto-client.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-client.test.ts test/konto-client-limit.test.ts test/konto-client-deposit.test.ts` muss Exit-Code 0 haben.
- [x] Jeder neue Entwurf für den Kanal muss `https://automatonhost.com` nennen, ein Entwurf mit `postyourprice.com` oder
      `cp.hippe.eu` gilt als veraltet. Die neuen Fälle waren vor dem Fix rot.
      MVP: Funktion, weil der Kanal der einzige Weg ist, der je einen Leser gebracht hat, und jeder Kommentar dauerhaft auf die Adresse
      verlinkt, die er nennt.
      Prüfung: `grep -cxF 'CANONICAL_HOST = os.environ.get("CP_PUBLIC_HOST") or "automatonhost.com"' ops/before-the-answers.py` muss 1 ausgeben.
      Prüfung: `grep -E '^KNOWN_HOSTS = ' ops/before-the-answers.py | grep -o -E 'automatonhost\.com|postyourprice\.com|cp\.hippe\.eu' | sort -u | wc -l` muss 3 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/answers-host.test.ts test/answers-folder.test.ts test/answers-approved.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/answers-host.test.ts` muss mindestens 2 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; B=$(git merge-base origin/dev HEAD); git show $B:ops/before-the-answers.py > $T/ops/before-the-answers.py; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/answers-host.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 1 ausgeben.
- [x] Nennt `CP_PUBLIC_URL` einen Host außerhalb von `SERVICE_HOSTS`, leitet keine Seite weiter, und der Dienst loggt das einmal; ein
      Host mit `:443` oder mit Punkt am Ende wird wie der nackte Host weitergeleitet. Der Fall des fremden Hosts war vor dem Fix rot,
      die beiden anderen sind rot, wenn die Normalisierung fehlt.
      MVP: Funktion, weil ein Tippfehler im Wechsel sonst jede Seite aller drei Hosts per 301 auf einen Host schickt, den Caddy nicht
      bedient, und Browser diese Weiterleitung behalten.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automatonhost.test.ts test/one-host.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/automatonhost.test.ts` muss mindestens 20 ausgeben.
      Prüfung: `grep -cF 'is not in SERVICE_HOSTS, pages are not redirected' src/app.ts` muss 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; B=$(git merge-base origin/dev HEAD); git show $B:src/app.ts > $T/src/app.ts; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/automatonhost.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's#header("host")?.toLowerCase().replace([^;]*;#header("host")?.toLowerCase();#' $T/src/app.ts; grep -q 'header("host")?.toLowerCase();' $T/src/app.ts || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/automatonhost.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss eine Zahl von mindestens 2 ausgeben und darf `sed-miss` nicht ausgeben.
- [x] `automatonhost.com` ist der kanonische Host: `deploy/docker-compose.prod.yml` auf `dev` setzt `CP_PUBLIC_URL` auf
      `https://automatonhost.com` (geändert von Matthias am Human Gate), `postyourprice.com` leitet seine Startseite dorthin, und vor
      dem Gate ist die Zahl der Konten mit Passkey mit Befehl in den Annahmen gemessen.
      MVP: Funktion, weil Seiten, Stripe-Rücksprung, x402-Angebote und die `curl`-Beispiele erst damit den neuen Namen tragen.
      Prüfung: `git show origin/dev:deploy/docker-compose.prod.yml | grep -cxF '      CP_PUBLIC_URL: https://automatonhost.com'` muss 1 ausgeben.
      Prüfung: `awk '/^## Goal 02/{f=1;next} /^## /{f=0} f' goals/umzug/ANNAHMEN.md | grep -cE 'konto_accounts=[0-9]+'` muss mindestens 1 ausgeben.
      Prüfung (Netz): `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 https://postyourprice.com/` muss genau `301 https://automatonhost.com/` ausgeben.
      Prüfung (Netz): `curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://automatonhost.com/` muss genau `200` ausgeben.
      Prüfung (Netz): `curl -s --max-time 15 https://automatonhost.com/ | grep -ciE 'postyourprice|handsel'` muss 0 ausgeben.
- [x] Jeder Prüfbefehl eines fertigen Goals, dessen Ausgabe sich durch dieses Goal ändert, steht als abgelöst in den Annahmen seines
      Topics, in der Form aus Entscheidung 10.
      MVP: Funktion, weil das Audit nachts jeden Prüfbefehl fertiger Goals fährt und jede unerklärte rote Zeile eine Reparatur ohne
      Ursache auf `dev` auslöst.
      Prüfung: `q=$(printf '\140'); cat goals/*/ANNAHMEN.md | grep -E '^- Abgelöst: .* durch umzug 02 ' | grep -vcE " durch umzug 02 Punkt [0-9]+, Ausgabe dann genau ${q}Exit [0-9]+, [^${q}]*${q} \\(Tech Lead, 2026-11-17\\)\$"` muss 0 ausgeben.
      Prüfung: `cat goals/*/ANNAHMEN.md | grep -cE '^- Abgelöst: .* durch umzug 02 '` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+ Zyklus [0-9]+: .*abgelöst' goals/umzug/02-seiten-und-texte-nennen-automatons.md` muss mindestens 1 ausgeben.
- [x] Die Doku sagt, wie der Dienst nach außen heißt, was beim alten Namen bleibt und warum, wie das Plugin installiert wird, was beim
      Einschalten von Konto für den neuen Host zu tun ist und wie der Wechsel ausging; die Entscheidungen stehen mit Grund in den
      Annahmen.
      MVP: Funktion, weil das nächste Goal, das Text nach außen schreibt, sonst wieder den alten Namen nimmt.
      Prüfung: `for w in "OK hosts: canonical automatonhost.com" automaton@automatonhost handsel_notice X-PostYourPrice-Hint konto_accounts Turnkey before-the-answers.py; do grep -qF -- "$w" docs/umzug.md || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Goal 02/{f=1;next} /^## /{f=0} f' goals/umzug/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens 8 ausgeben.
- [x] Das Goal ändert nur Seiten, Texte, SOLL-Bilder und ihre Werkzeuge, Plugin, MCP, das Prüfwerkzeug des Kanals, die Weiterleitung,
      Doku, Annahmen und Tests, weder Compose, Zahlung, Anmeldung, Automaton, Harness noch CI, und bringt keinen Schlüssel ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8) und Compose nur Matthias ändert.
      Prüfung: `git diff --name-only origin/dev...HEAD -- deploy src/payments src/auth src/automaton src/handoff harness .github scripts/check.mjs loop.yaml gate.yaml LOOP.md loop-constraints.md | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vcE '^(src/app\.ts|src/public/[^/]+|src/public/konto-client/(flow\.mjs|konto\.js)|docs/soll/.+|docs/umzug\.md|ops/soll[a-z-]*\.mjs|ops/before-the-answers\.py|ops/og-card-says-the-truth\.sh|test/.+|README\.md|mcp/.+|\.claude-plugin/marketplace\.json|goals/[a-z]+/ANNAHMEN\.md|goals/umzug/.+|goals/_vorschlaege/umzug-[a-z0-9.-]+\.md)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}|Bearer [A-Za-z0-9_-]{30,})'` muss 0 ausgeben.
- [x] `check` ist grün, und der Job `e2e` des Goal-PR ist grün.
      MVP: Funktion, weil Seiten und Weiterleitung jede Anfrage sehen und erst der Gang mit der unveränderten Runtime zeigt, dass
      Anmeldung, Zahlung und Inferenz weiter laufen (Grundregel 13).
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/umzug-02 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jeder neue Fall, der ein neues Verhalten verlangt, war vor dem Fix rot; die Zeile im Progress Log
      nennt, womit.
- [ ] Maschinenpfade, Feldnamen und Header verhalten sich auf allen drei Hosts genau wie vor dem Goal.
- [ ] Code, Kommentare, Testnamen, Ausgaben der Werkzeuge und Texte der Seiten Englisch (deutsche Seiten wie bisher Deutsch),
      Goal-Datei, Doku und Annahmen Deutsch, kein Gedankenstrich, kein Wort, das der Leser erst übersetzen muss (TEAM.md
      „Klare Wörter“).

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`,
  `deploy/docker-compose.prod.yml` (den Wechsel macht Matthias am Human Gate), `deploy/**`, `harness/**`, `src/payments/**`,
  `src/auth/**`, `src/automaton/**`, `src/handoff/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`,
  `*.crt`
- die Goal-Dateien fertiger Goals und ihre Entwürfe unter `goals/kanal/antworten*/`; in ihren `ANNAHMEN.md` nur die Zeilen aus
  Entscheidung 10
- Cloudflare, Turnkey, Stripe: kein Zugriff in diesem Goal
- der Zahlungsserver `76.13.144.207`: nur lesen (Zahl der Konten mit Passkey, `CP_KONTO_AUTH_PROXY_ID` gesetzt oder nicht, `ops/live.sh`),
  kein Rollout, kein Neustart; der Sandbox-Server: kein Zugriff
- kein Kommentar in einem fremden Repo (Human Gate `public_post`)
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-17 Zyklus 1: Punkte 1 bis 8, 10, 12 und 13 gebaut; 7 Prüfbefehle fertiger Goals abgelöst (konto 02, 03, 04, 05, 06 je 1, seite 01 1, umzug 01 1), Punkt 11 bis auf den Ausgang des Wechsels, Punkt 9 wartet am Human Gate. SOLL-Bilder `f8f8b95` (16:39 UTC), Abnahme des Design Reviewers 16:41 UTC, Seiten erst danach (`a78dce5`). Rot vor dem Fix: `test/automaton-name.test.ts` mit dem `src` der Merge-Basis 4 von 4 rot, `test/answers-host.test.ts` am alten Prüfwerkzeug 2 rot, `test/automatonhost.test.ts` am alten `src/app.ts` 1 rot und ohne Normalisierung des Hosts 2 rot, der neue Fall in `test/konto-client.test.ts` am alten `flow.mjs` rot. Prüfbefehle: Punkt 1 `0`, nichts, `start ok`, `30`, fünfmal `exit=0 0 defects`; Punkt 2 `1`, `abnahme ok 1`; Punkt 3 `0`, fünfmal `exit=0 0 defects`; Punkt 4 Exit 0, `4`, nichts, `4`, `0`, `2`, Selbsttest Exit 0; Punkt 5 `0`, `1`, `plugin ok`, `1`, `2`, Exit 0; Punkt 6 `0`, `3`, `1`, `gleich`, `2`, Exit 0; Punkt 7 `1`, `3`, Exit 0, `3`, `2`; Punkt 8 Exit 0, `21`, `1`, `1`, `2` ohne `sed-miss`; Punkt 9 `0` (Wechsel steht aus), `2`, Netz offen; Punkt 10 `0`, `7`, diese Zeile; Punkt 11 nichts, `10`; Punkt 12 `0`, `0`, `0`, `0`; Punkt 13 `check: grün in 265 s`, `e2e` am PR #252 `SUCCESS` (`572bd9f`).
- 2026-11-17 Zyklus 2: Abschluss gemeldet, Punkte 1 bis 13; nach Matthias' Wechsel (PR #255, `187ac7a`, `deploy.yml` grün) `dev` gemergt (Konflikt in `goals/konto/ANNAHMEN.md` aufgelöst, beide Abschnitte bleiben), Punkt 9 gemessen und Punkt 11 mit dem Ausgang des Wechsels in `docs/umzug.md` ergänzt; konto 07, seit Zyklus 1 fertig, hat 0 abgelöste Prüfbefehle. Prüfbefehle: Punkt 1 `0`, nichts, `start ok`, `30`, fünfmal `exit=0 0 defects`; Punkt 2 `1`, `abnahme ok 1`; Punkt 3 `0`, fünfmal `exit=0 0 defects`; Punkt 4 Exit 0, `4`, nichts, `4`, `0`, `2`, Selbsttest Exit 0; Punkt 5 `0`, `1`, `plugin ok`, `1`, `2`, Exit 0; Punkt 6 `0`, `3`, `1`, `gleich`, `2`, Exit 0; Punkt 7 `1`, `3`, Exit 0, `3`, `2`; Punkt 8 Exit 0, `21`, `1`, `1`, `2` ohne `sed-miss`; Punkt 9 `1`, `2`, `301 https://automatonhost.com/`, `200`, `8` (Startseite von `dev` ohne dieses Goal, belegt erst nach dem Rollout, `goals/umzug/ANNAHMEN.md`); Punkt 10 `0`, `7`, `1`; Punkt 11 nichts, `13`; Punkt 12 `0`, `0`, `0`, `0`; Punkt 13 `check: grün in 103 s`, `e2e` am PR #252 `SUCCESS` (`c0b26cc`).
- 2026-11-17 Release: PASS K und B (Zyklus 2), DONE.
- 2026-11-17 Zyklus 3: Abschluss gemeldet, Punkte 1 bis 13; `origin/dev` mit konto 08 (PR #257) in den Goal-Branch gemergt, weil der PR einen Konflikt in `goals/konto/ANNAHMEN.md` hatte (beide Abschnitte bleiben, `01bf57c`), dadurch Status wieder `ACTIVE` und der PASS aus Zyklus 2 offen; konto 08 hat 0 abgelöste Prüfbefehle (sein Zähler über `goals/konto/ANNAHMEN.md` gibt auf `dev` und am Goal-Branch `7`), kein eigener Code geändert. Prüfbefehle: Punkt 1 `0`, nichts, `start ok`, `30`, fünfmal `exit=0 0 defects`; Punkt 2 `1`, `abnahme ok 1`; Punkt 3 `0`, fünfmal `exit=0 0 defects`; Punkt 4 Exit 0, `4`, nichts, `4`, `0`, `2`, Selbsttest Exit 0; Punkt 5 `0`, `1`, `plugin ok`, `1`, `2`, Exit 0; Punkt 6 `0`, `3`, `1`, `gleich`, `2`, Exit 0; Punkt 7 `1`, `3`, Exit 0, `3`, `2`; Punkt 8 Exit 0, `21`, `1`, `1`, `2` ohne `sed-miss`; Punkt 9 `1`, `2`, `301 https://automatonhost.com/`, `200`, `8` (belegt erst nach dem Rollout dieses Goals, `goals/umzug/ANNAHMEN.md`); Punkt 10 `0`, `7`, `2`; Punkt 11 nichts, `13`; Punkt 12 `0`, `0`, `0`, `0`; Punkt 13 `check: grün in 150 s`, `e2e` am PR #252 `SUCCESS` (`01bf57c`).

## Blockers
Keine.
