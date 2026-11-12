# Seite Goal 02: Die Startseite nennt den Umzug von Conway

## Status
PLANNED

## Active Objective
Wer aus einem Conway-Issue auf `/` landet, sieht im ersten Bildschirm den Umzug: `conwayApiUrl` auf `https://postyourprice.com`,
`automaton --provision`, der Link auf `/fix`. Dieses Goal baut die Startseite `src/public/index.html` 1:1 nach den abgenommenen
SOLL-Bildern aus seite 01 (`docs/soll/startseite-390.png`, `docs/soll/startseite-1440.png`, Abnahme PRO-18819) und belegt das mit
einem Pixelvergleich des echten Renders gegen diese Bilder. Dazu misst es, wie viele neue Adressen mit Referrer
`github.com/Conway-Research` auf `/` ankommen und binnen 24 Stunden `POST /v1/auth/verify` mit 200 aufrufen, und schreibt die Zahl
vor dem Rollout fest, damit das nächste Glied vorher und nachher vergleichen kann.
Widerlegt, wenn 14 Tage nach dem Rollout Ankünfte aus Conway-Issues da sind und sich keine binnen 24 Stunden anmeldet; das Urteil
fällt im nächsten Glied mit demselben Werkzeug.
MVP: Funktion, weil jeder Betreiber, der aus einem unserer Kommentare in Conway-Issues kommt (kanal 01 und 03), den Umzug heute erst
hinter „Agent stuck?“ findet und nach diesem Goal ohne Suche im ersten Bildschirm.

## Voraussetzungen
- seite Goal 01 DONE

## Kontext für den Maker
- Bild: `docs/soll/startseite-390.png` und `docs/soll/startseite-1440.png`, Quelle `docs/soll/src/startseite.html`, Regeln in
  `docs/soll/README.md`. Gebaut wird nach dem Bild, nie nach dieser Beschreibung: Wo beide sich unterscheiden, gilt das Bild. Bilder,
  Quelle und `ops/soll*.mjs` ändert dieses Goal nicht (Deny List), denn eine geänderte Vorlage bräuchte eine neue Abnahme.
- Die Fläche ist eine: `/`, ausgeliefert aus `src/public/index.html` über `app.get("/")` in `src/app.ts` (Platzhalter `<!--HUMAN-->`,
  `<!--PASTEBOX-->`, `<!--NUMBERS-->`, `<!--MARKET-->`, `<!--WALLETS-->`, `<!--PRICES-->`, dazu `withOrigin` und
  `germanFirstScreen`). Im Bild steht der Umzug als `<section class="hero" id="umzug" data-soll="umzug">` vor `<!--HUMAN-->`, und der
  Block `<section id="agents">` am Seitenende ist weg, weil er nach oben gewandert ist. Alles andere bleibt, wie es ist. Es reicht eine
  Änderung an `src/public/index.html`; eine andere Datei unter `src/` ändert dieses Goal nicht.
- Die Zählmarke `/px/top.png` muss im ersten Bildschirm bleiben, sonst misst `ops/depth.sh` nichts mehr: Sie steht im Umzug-Block
  oder direkt davor, vor seinem `</section>`. Die übrigen Marken (`proof`, `market`, `close`, `end`) bleiben an ihrer Stelle in
  derselben Reihenfolge.
- Sprache: Der Umzug ist englisch und bekommt keine Marken `<!--T:…-->`, auch bei `Accept-Language: de` steht er vor dem Katalog für
  Menschen (Annahme aus seite 01 in `goals/seite/ANNAHMEN.md`). Die Adresse im Block ist die der Anfrage: mit
  `CP_PUBLIC_URL=https://postyourprice.com` steht dort `https://postyourprice.com`, wie im Bild.
- Pixelvergleich am echten Render: `ops/soll-live.mjs` (neu, Code Englisch), aufgerufen als
  `node --import tsx ops/soll-live.mjs --out <datei>`, rendert `/` aus `createApp` mit leerer Datenbank (`openDb(":memory:")`,
  `app.request("/")`, kein Port, kein Netz) mit `CP_PUBLIC_URL=https://postyourprice.com` und englischem Browser und schreibt das
  Ergebnis nach `<datei>`, reduziert um genau das, was seite 01 für die Quelle weggelassen hat (`goals/seite/ANNAHMEN.md`, seite 01:
  HTML-Kommentare, die Zählmarken `/px/*.png`, beide Skripte, `<noscript>`, der Canonical-Link, die Statuszeile auf „online“), und um
  nichts sonst. Kein Text des Umzugs und kein Baustein der Seite steht in diesem Skript, und es liest nichts unter `docs/soll/`. Jeder
  andere Unterschied zum Bild wird in `src/public/index.html` behoben. Danach vergleicht `node ops/soll.mjs --pruefen --source <datei>`
  den Render mit den abgenommenen Bildern (Grenze 0 Pixel über der Kanaltoleranz, seite 01 Punkt 6). Den neuen Test, den es dafür
  braucht, nennt Punkt 1; der Pixelvergleich braucht Chromium und läuft deshalb nicht in `check`.
- Bestehende Tests, die am Block `#agents` hängen (`test/public.test.ts`, `test/depth.test.ts`, `test/fix-page.test.ts`, gefunden mit
  `grep -rn 'id="agents"' test`), zeigen danach auf den Umzug-Block, keiner wird gestrichen, übersprungen oder schwächer. Wo ein Test
  einen Satz verlangt, den das Bild nicht mehr hat, gilt das Bild, und der Test prüft die Regel dahinter am neuen Ort: Der Hinweis zu
  den 5 USD steht im Block („tops up $5 of credit“) und vollständig auf `/fix`, auf das der Block verlinkt (Regel V: kein Vorbehalt im
  Verkaufstext, das Nähere auf der Seite mit allen Schritten); die Fehlerbeschreibung der Leser ist „Conway not answering?“. Je Test
  steht die Begründung im Kommentar darüber, Englisch.
- Messwerkzeug `ops/landing-yield.sh` (neu, nur lesend, Code Englisch), Aufruf
  `bash ops/landing-yield.sh --since <ISO UTC> [--until <ISO UTC>]`: liest das ganze Caddy-Zugriffslog über `ops/access-log.sh` (auch
  die rotierten Dateien). Je fremder Adresse (nicht in `ops/own-ips.txt`, für Tests `CP_OWN_IPS=<datei>`) zählt die erste Anfrage
  `GET /` (mit oder ohne Query) im Fenster, deren `Referer` mit `https://github.com/Conway-Research` beginnt, gefolgt von `/` oder
  nichts, als Ankunft. Angemeldet ist sie, wenn dieselbe Adresse danach, höchstens 24 Stunden später und nicht nach `--until`,
  `POST /v1/auth/verify` mit Status 200 hatte; noch offen, wenn das nicht so ist und die Ankunft weniger als 24 Stunden vor
  `--until` liegt. Telefon heißt: der User-Agent der Ankunft enthält `iPhone`, `iPad` oder `Android` zusammen mit `Mobile`. Ausgabe,
  nur Summen, nie eine Adresse (`loop-constraints.md`, Grundregel 8):
  `LANDING YIELD <since> to <until>: <a> arrived on / from github.com/Conway-Research, <b> signed in within 24 hours, <p> still inside 24 hours`,
  dann `BY DEVICE: <m> phone, <d> other`, dann `WINDOW <since> to <until>: <lines> log line(s), <f> foreign address(es)`. Ohne
  `--until` gilt die Zeit des Laufs, auf die volle Sekunde abgerundet. Exit 2, wenn das Log oder die eigene Liste nicht lesbar ist,
  `--until` vor `--since` liegt oder das Fenster keine einzige Zeile hat, denn eine Null aus einem leeren Fenster ist Blindheit. Exit 1
  bei falschem Argument. Für Tests ohne Netz `--log <datei>` statt des Servers und `--selftest` mit der Fixture
  `ops/fixtures/landing-yield.log` nach dem Muster von `ops/traffic.sh --selftest` (Fenster aus der Fixture gerechnet, damit sie nicht
  altert). Die Fixture trägt nur Dokumentationsadressen (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) und pflanzt in beide
  Richtungen (Grundregel 3): Ankunft mit Anmeldung nach 23 Stunden (zählt), Ankunft mit Anmeldung nach 25 Stunden (zählt nicht als
  angemeldet), Anmeldung mit Status 500 (nicht angemeldet), Ankunft mit Referrer auf `/fix` statt `/` (keine Ankunft), Referrer
  `https://github.com/Conway-Research-fake/` (keine Ankunft), eigene Adresse mit Referrer und Anmeldung (zählt nicht), Ankunft vor
  `--since` (zählt nicht), Ankunft eine Stunde vor `--until` ohne Anmeldung (noch offen), eine Ankunft mit iPhone-User-Agent (Telefon).
  Jeder neue Test war vor dem Werkzeug rot; die Zeile im Progress Log nennt es.
- `ops/github-yield.sh` aus kanal 03 zählt die erste Anfrage auf jedem Pfad ohne Frist und steht noch nicht auf `dev` (kanal 03 wartet
  am Human Gate `public_post`). `ops/landing-yield.sh` zählt nur Ankünfte auf `/` mit der Frist von 24 Stunden, deshalb ein eigenes
  Werkzeug. Steht `ops/github-yield.sh` beim Start auf `dev`, nimmt `ops/landing-yield.sh` dessen Leser des Logs, statt ihn zu kopieren;
  die Prüfbefehle bleiben gleich.
- Zahl vorher: `docs/seite/conway-ankuenfte.md` (Deutsch) mit genau einer Zeile
  `Vorher: <a> kamen auf / von github.com/Conway-Research, <b> binnen 24 Stunden angemeldet, <p> noch in den 24 Stunden, <m> vom Telefon, 2026-11-02T00:00:00Z bis <until>`
  aus `bash ops/landing-yield.sh --since 2026-11-02T00:00:00Z --until <until>` gegen die Produktion, `<until>` die volle Stunde vor
  dem Lauf, darunter die Zeile `Befehl:` mit genau diesem Aufruf in Backticks und die Widerlegungsregel aus „Active Objective“. Die
  Untergrenze gilt wie in kanal 03: Ein Automaton ruft `/v1/auth/verify` oft von einer anderen Adresse als der Browser seines
  Betreibers, das steht als Satz darunter. Kommen nennenswert viele Ankünfte vom Telefon, schreibst du das als Vorschlag für ein
  Folge-Goal (Faltlinie bei 390 px, `goals/_vorschlaege/seite-kritik-2026-11-12-1.md`), nicht als Arbeit in diesem Goal.
- Zugang für die Zeilen mit `(Netz)`: `set -a; . ~/.config/control-plane/loop.env; set +a`, Werte nie ausgeben, Produktion nur
  lesen. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check`, vitest und `ops/soll.mjs` im Vordergrund mit eigenem Timeout.
- Rollout: `src/public/index.html` liegt im Laufzeitpfad, der Merge rollt über `deploy.yml` aus, die Live-Prüfung macht der Release
  Manager. Die Zahl nachher misst das nächste Glied ab dem Rollout mit `ops/landing-yield.sh`.
- Was danach schneller zu mehr zahlenden Automatons führt: Jede Antwort aus kanal 03 schickt Betreiber auf eine Seite, die sie
  sofort umstellen lässt, und die Zahl vorher und nachher sagt, ob die Seite oder der Kanal das Loch ist.

## Done Condition
- [ ] Die Startseite zeigt den Umzug als ersten Block vor dem Katalog für Menschen, mit der richtigen Adresse, auch für einen
      deutschen Browser, und mit der Zählmarke `top` im ersten Bildschirm.
      Prüfung: `pnpm -s vitest run test/landing-move.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/landing-move.test.ts` muss mindestens 5 ausgeben (je ein Fall: Reihenfolge Umzug vor `class="human"` vor `id="fuer-agenten"` bei englischem Browser; dieselbe Reihenfolge bei `Accept-Language: de`; der Block enthält `conwayApiUrl`, `https://postyourprice.com` bei `CP_PUBLIC_URL=https://postyourprice.com`, `automaton --provision` und `href="/fix"`; `id="agents"` fehlt auf der Seite; `/px/top.png` steht vor dem `</section>` des Umzugs).
- [ ] Der echte Render der Startseite ist pixelgleich mit den abgenommenen SOLL-Bildern, und eine geänderte Zeile der Seite fällt
      dabei auf.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live.mjs --out $T/s.html && node ops/soll.mjs --pruefen --source $T/s.html` muss Exit 0 haben und als letzte Zeile `soll: 2 Bilder, umzug oben 390=<y> 1440=<y>, 0 Mängel` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/Keep your automaton running\./Keep your agent running./' $T/src/public/index.html; grep -q 'Keep your agent running\.' $T/src/public/index.html || echo sed-miss; (cd $T && node --import tsx ops/soll-live.mjs --out $T/s.html); node ops/soll.mjs --pruefen --source $T/s.html; echo "exit=$?"` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `grep -cE 'Conway not answering|Keep your automaton|conwayApiUrl|data-soll|docs/soll|Rede zum Fest' ops/soll-live.mjs` muss `0` ausgeben.
- [ ] Die Tests, die am alten Block `#agents` hingen, prüfen ihre Regel am Umzug-Block weiter, keiner fehlt.
      Prüfung: `for f in test/public.test.ts test/depth.test.ts test/fix-page.test.ts; do a=$(git show origin/dev:$f | grep -cE "^\s*(it|test)\("); b=$(grep -cE "^\s*(it|test)\(" $f); [ "$b" -ge "$a" ] || echo "weniger $f $a $b"; done; grep -nE 'id="agents"|\.(skip|only|todo)\(' test/public.test.ts test/depth.test.ts test/fix-page.test.ts test/landing-move.test.ts | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `pnpm -s vitest run test/public.test.ts test/depth.test.ts test/fix-page.test.ts` muss Exit-Code 0 haben.
- [ ] `ops/landing-yield.sh` zählt Ankünfte aus Conway-Issues auf `/` und ihre Anmeldung binnen 24 Stunden, als Summe ohne Adressen,
      in beide Richtungen bewiesen.
      Prüfung: `bash ops/landing-yield.sh --selftest | tail -1` muss `SELFTEST OK` ausgeben.
      Prüfung: `pnpm -s vitest run test/landing-yield.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/landing-yield.test.ts` muss mindestens 6 ausgeben (Anmeldung nach 23 und nach 25 Stunden, Status 500, Referrer auf `/fix` und auf `Conway-Research-fake`, eigene Adresse, noch offen, Telefon, leeres Fenster mit Exit 2).
      Prüfung: `a=$(grep -oE '"(remote_ip|client_ip)": *"[^"]*"' ops/fixtures/landing-yield.log | wc -l); b=$(grep -oE '"(remote_ip|client_ip)": *"[^"]*"' ops/fixtures/landing-yield.log | grep -vE '"(192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]{1,3}"$' | wc -l); echo "adressen=$a fremd=$b"` muss `adressen=<n> fremd=0` mit n mindestens 1 ausgeben.
- [ ] Die Zahl vor dem Rollout steht mit Befehl und Widerlegungsregel fest.
      Prüfung: `grep -cE '^Vorher: [0-9]+ kamen auf / von github\.com/Conway-Research, [0-9]+ binnen 24 Stunden angemeldet, [0-9]+ noch in den 24 Stunden, [0-9]+ vom Telefon, 2026-11-02T00:00:00Z bis 20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:00:00Z$' docs/seite/conway-ankuenfte.md` muss `1` ausgeben.
      Prüfung: `grep -cE '^Befehl: .bash ops/landing-yield\.sh --since 2026-11-02T00:00:00Z --until 20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:00:00Z.$' docs/seite/conway-ankuenfte.md` muss `1` ausgeben.
      Prüfung: `grep -c 'Widerlegt, wenn' docs/seite/conway-ankuenfte.md` muss mindestens `1` ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; u=$(sed -n 's/^Vorher: .* bis \(.*\)$/\1/p' docs/seite/conway-ankuenfte.md); bash ops/landing-yield.sh --since 2026-11-02T00:00:00Z --until "$u" | head -2` muss Exit 0 haben und in den beiden Zeilen dieselben Zahlen für angekommen, angemeldet, noch offen und Telefon ausgeben wie die Zeile `Vorher:`.
- [ ] Der Diff bleibt in den Pfaden dieses Goals, unter `src/` ändert sich nur die Startseite, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/public/index\.html|ops/soll-live\.mjs|ops/landing-yield\.sh|ops/fixtures/landing-yield\.log|test/landing-move\.test\.ts|test/landing-yield\.test\.ts|test/public\.test\.ts|test/depth\.test\.ts|test/fix-page\.test\.ts|docs/seite/conway-ankuenfte\.md|goals/seite/|goals/_vorschlaege/seite-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src | grep -vx 'src/public/index.html' | wc -l` muss `0` ausgeben.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Betreiber, der aus einem Conway-Issue kommt, sieht auf `postyourprice.com` ohne Scrollen die eine Zeile und den einen
      Befehl, und die Seite sieht aus wie das abgenommene Bild.
- [ ] Der Katalog für Menschen, der Markt, der Abschnitt mit dem freien Check und die Zählmarken arbeiten weiter wie vorher.
- [ ] Die Zahl vorher steht so fest, dass das nächste Glied mit demselben Befehl die Zahl nachher daneben stellt.
- [ ] Kein Gedankenstrich, keine Adresse, kein Name und keine Wallet eines Kunden, keine Zahl ohne Befehl, nichts zu den Bedingungen
      des Einkaufs bei OpenRouter.

## Deny List
- `src/**` außer `src/public/index.html`, ausdrücklich `src/payments/**` und `src/auth/**`
- `docs/soll/**`, `ops/soll.mjs`, `ops/soll-assess.mjs`, `test/soll.test.ts`: die abgenommene Vorlage und ihr Prüfwerkzeug
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `ops/access-log.sh`, `ops/own-ips.txt`, `.env*`, `*.key`, `*.pem`
- `ROADMAP.md`, `docs/kette.md` und alle Goal-Dateien außer dieser; Vorschläge nur neu anlegen
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- kein Schreiben auf dem Server, kein Rollout von Hand, kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- keine Adresse eines echten Besuchers in Fixture, Test, Doku, Commit oder Kommentar
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
keine
