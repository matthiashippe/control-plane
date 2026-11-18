# Annahmen umzug

## Goal 01 (17.11.2026, Engineer CP)

- **Der Wechsel von `CP_PUBLIC_URL` gehört nicht in dieses Goal** (Entscheidung 1 des Tech Lead). `deploy/docker-compose.prod.yml`
  steht in `deny_paths` und in der Deny List; ein Wechsel vor dem Rollout dieses Goals bräche canonical, x402-`resource` und
  Rücksprung, weil Caddy `automatonhost.com` dann noch nicht bediente. Alles ist so gebaut, dass es mit
  `CP_PUBLIC_URL=https://postyourprice.com` und mit `https://automatonhost.com` richtig arbeitet; umzug 02 beginnt mit dem
  Wechsel als Human Gate an Matthias (`docs/umzug.md`, Abschnitt „Der Wechsel“).
- **`SERVICE_HOSTS` in `src/public/site.ts`** nennt die drei Hosts einmal. Die Middleware in `src/app.ts` leitet eine Seite auf
  jedem Host aus der Liste, der nicht `siteHost()` ist, mit 301 auf den kanonischen; ein Host außerhalb bleibt unberührt, ohne
  `CP_PUBLIC_URL` leitet sie nichts weiter. Neu gegenüber vorher: Ein Host wird vor dem Vergleich klein geschrieben und ohne Port
  und Punkt am Ende gelesen, weil `PostYourPrice.com` sonst als fremder Host durchginge. Die neuen Fälle in
  `test/automatonhost.test.ts` importieren `SERVICE_HOSTS` nicht, damit die Gegenprobe am alten Stand rote Fälle zeigt (5 rot,
  gemessen mit dem fünften Prüfbefehl von Punkt 1).
- **Ein ungültiges `CP_PUBLIC_URL`** fällt wie bisher auf `https://cp.hippe.eu` zurück; dann leiten Seiten auf den anderen
  beiden Hosts dorthin. Das ist der bestehende Rückfall aus `siteOrigin()` und in der Produktion nicht gesetzt.
- **`Caddyfile`:** Der Block des Dienstes beginnt mit `automatonhost.com, postyourprice.com, cp.hippe.eu {` und ist sonst
  unverändert, ein `reverse_proxy cp:8402` (Prüfbefehl aus betrieb 02 gibt weiter 1). `www.automatonhost.com` leitet mit 308 auf den
  Apex wie `www.postyourprice.com`. `caddy validate` und `caddy adapt` aus `$HOME/.local/bin`, kein Docker auf dem code-host.
- **DNS mit `ops/site-dns.py` (site-dns) vor dem Merge** (Entscheidung 4). Das Werkzeug kennt nur GET und POST und lehnt jede
  andere Methode ab, bevor es den Token liest. Gegenprobe gegen die echte Zone in beide Richtungen am 17.11.2026:
  `python3 ops/site-dns.py check 76.13.144.207` gab vor dem Anlegen `CHANGE dns create A automatonhost.com`,
  `CHANGE dns create A www.automatonhost.com`, `SITE DNS DRIFT changed=2` (Exit 1); `python3 ops/site-dns.py apply 76.13.144.207`
  gab `created A automatonhost.com`, `created A www.automatonhost.com`, `SITE DNS OK changed=0` (Exit 0). Danach
  `dig +short @kobe.ns.cloudflare.com automatonhost.com A` und dasselbe für `www.automatonhost.com`: je `76.13.144.207`. Keine
  andere Zone wurde angefasst, kein Eintrag geändert oder gelöscht.
- **`PAYMENT_ZONES = ["postyourprice.com", "automatonhost.com"]`** ersetzt `PAYMENT_ZONE` in `src/sandbox/service.ts` und
  `ops/sandbox/sandboxd.mjs`. In `ops/sandbox/cloudflare.py` prüft `PAYMENT_ZONES` (`in_payment_zone`) die Domain der Ports;
  `PAYMENT_ZONE` bleibt dort für die Verwaltung von `ctl.sbx.postyourprice.com`, die nur diese eine Zone betrifft.
  `ops/sandbox/setup.sh` lehnt beide Zonen und ihre Namen ab. Kein Rollout auf dem Sandbox-Server in diesem Goal; der nächste Lauf
  von `setup.sh` bringt den Stand mit (Entscheidung 5). Gegenprobe am alten Stand: 3 rote Fälle.
- **Konten mit Passkey: 0** (Entscheidung 6), gemessen am 17.11.2026 nur lesend:
  `ssh … 'docker exec -i deploy-cp-1 node -e "…require(\"better-sqlite3\")(\"/data/cp.db\",{readonly:true})…SELECT COUNT(*) AS n FROM konto_accounts…"'`
  gab `konto_accounts=0`; `docker exec deploy-cp-1 sh -c 'test -n "$CP_KONTO_AUTH_PROXY_ID"'` gab leer. Gegenprobe desselben
  Befehls auf `api_keys` gab `api_keys_nonzero=true`, das Werkzeug kann also mehr als 0 melden. Damit kein Related Origin Request
  in diesem Goal; vor dem Wechsel in umzug 02 wird erneut gezählt.
- **`live.sh`:** Die Prüfung `hosts` (`judge_hosts`, `hosts_live`) prüft alle drei Hosts und `www.automatonhost.com` nach jedem
  Rollout und nennt den kanonischen Host in `OK hosts: canonical <host>`; so ist dieselbe Prüfung vor und nach dem Wechsel grün.
  Bis Caddy das Zertifikat für `automatonhost.com` nach dem ersten Rollout hat, wäre sie rot; deshalb stehen die DNS-Einträge vor
  dem Merge.

## Goal 02 (17.11.2026, Engineer CP)

- **Der Name ist `automatonhost.com`, klein geschrieben**, weil Matthias seit dem 17.11.2026 unter dieser Domain verkauft und
  ein Betreiber aus einem Conway-Issue den Namen der Seite wiederfinden soll (Entscheidung 1). In Sätzen, deren Subjekt der alte
  Name war, steht „We“; der Design Reviewer hat das in den Bildern abgenommen.
- **Maschinenverträge bleiben** (`handsel_notice`, `X-PostYourPrice-Hint`, `handsel-%`, `ctl.sbx.postyourprice.com`,
  `SERVICE_HOSTS`, `PAYMENT_ZONES`, `src/handoff/routes.ts`, `src/payments/`), weil Runtimes, Plugins und Drittsysteme sie lesen
  und ein neuer Name sie bräche (Entscheidung 2). Kommentare im Code, die den alten Host als Geschichte nennen, bleiben ebenso.
- **Startseite: Knopf im Kopf „Switch now“ zu `/fix`**, weil der Kopf mit „Post a job“ den Markt vor den Wechsel stellte
  (Entscheidung 3). „Agent stuck?“ trägt bei 390 px die vorhandene Klasse `hide-s`, weil der Kopf mit beiden Links in zwei Zeilen
  brach und der Knopf dasselbe Ziel hat. Der Block `move` nennt keinen Start eines Automatons bei uns, weil Konto in der
  Produktion aus ist und das Plugin ohne Konto nichts startet (Regel V: kein Versprechen, das nicht hält).
- **Bisherige Tests erwarten den neuen Text**, weil sie dieselbe Sache am neuen Namen prüfen: In `test/public.test.ts` prüft das
  Paar „Switch now“ zu `/fix` den Knopf im Kopf, wo vorher „Post a job“ zu `/post` stand; „Post your first job“ zu `/post`
  bleibt geprüft. Keine Assertion fiel weg.
- **SOLL-Quellen aus Textersatz, Seiten danach**, weil der Maker die fünf Seitendateien vor der Abnahme nicht ändern durfte: Die
  15 Quellen wurden direkt geändert und gerendert (`f8f8b95`, 16:39 UTC), der Design Reviewer nahm sie um 16:41 UTC ab, die
  Seiten folgten in `a78dce5` (16:46 UTC); die Live-Werkzeuge rendern seitdem pixelgleich mit 0 Mängeln.
- **Vorschaubilder neu aufgenommen bei 2400 x 1260**, weil `og:image:width` und `og:image:height` diese Größe nennen: mit
  `chrome-headless-shell` aus `~/.cache/ms-playwright/chromium_headless_shell-1248`, `--window-size=1200,630
  --force-device-scale-factor=2` und `FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf`, damit die Schriften dieselben
  wie in den SOLL-Bildern sind.
  Der Inhalt der Karten blieb bis auf den Namen gleich, weil Entscheidung 7 nur den Namen ändert.
- **`ops/og-card-says-the-truth.sh` fragt ohne `CP_URL` `https://automatonhost.com`**, weil das der Name nach außen ist und
  `/v1/status` auf allen drei Hosts antwortet; `--selftest` bleibt grün.
- **Kanal: `CANONICAL_HOST` ohne `CP_PUBLIC_HOST` ist `automatonhost.com`, `KNOWN_HOSTS` nennt drei Hosts**, weil jeder Kommentar
  dauerhaft auf die Adresse verlinkt, die er nennt (Entscheidung 6). Die Fixtures von `test/answers-*.test.ts` nennen den neuen
  Host, weil ihr Entwurf sonst als veraltet gälte; die Entwürfe fertiger Goals bleiben unverändert.
- **Fremder kanonischer Host leitet nichts weiter**, weil ein 301 auf einen Host, den Caddy nicht bedient, in Browsern hängen
  bleibt (Entscheidung 8): Die Middleware vergleicht den Host aus `CP_PUBLIC_URL` (klein, ohne Port, ohne Punkt am Ende) mit
  `SERVICE_HOSTS`, ebenso den Host der Anfrage. Die Zeile im Log kommt einmal je Prozess und Host (`Set` auf Modulebene), weil jede Anfrage
  sie sonst wiederholte.
- **Konten mit Passkey vor dem Wechsel: `konto_accounts=0`**, gemessen am 17.11.2026 um 16:52 UTC nur lesend, weil Passkeys an
  die rpId `postyourprice.com` gebunden wären (Entscheidung 9):
  `ssh … 'docker exec -i deploy-cp-1 node -e "…require(\"better-sqlite3\")(\"/data/cp.db\",{readonly:true})…SELECT COUNT(*) AS n FROM konto_accounts…"'`
  gab `konto_accounts=0`; Gegenprobe im selben Aufruf auf `api_keys` gab `api_keys_nonzero=true`.
  `docker exec deploy-cp-1 sh -c 'test -n "$CP_KONTO_AUTH_PROXY_ID"'` gab `auth_proxy_id=empty`, `CP_PUBLIC_URL` im Container
  `https://postyourprice.com`. `bash ops/live.sh` gab `OK hosts: canonical postyourprice.com, /health 200 on 3 hosts, / 301 to
  https://postyourprice.com/ on 2 hosts, www.automatonhost.com/health 308 to https://automatonhost.com/health`. Damit fragt der
  Maker den Tech Lead nicht und setzt das Human Gate.
- **Abgelöste Prüfbefehle: 7**, weil neue Bilder und Texte ihre Ausgabe ändern (Entscheidung 10): Gefahren wurden alle
  Prüfbefehle von Goals mit Status `DONE`, die einen Pfad aus `git diff --name-only origin/dev...HEAD` oder den alten Namen nennen,
  an der Merge-Basis `f53113e` und am Goal-Branch, je in einem eigenen Worktree, ohne Netz (Proxy `127.0.0.1:9`), verglichen über
  Exit-Code und letzte Zeile (Dauern und Pfade unter `/tmp` ausgenommen). Ohne Netz: 136 Befehle, geändert nur umzug 01 Punkt 1
  (Zahl der Fälle in `test/automatonhost.test.ts`, 17 auf 21, Erwartung bleibt erfüllt). Befehle, die den Integrationszweig im
  Diff nennen, misst das Audit am Verdict-Commit ihres Goals und blieben außen vor. Mit Netz, nur lesend: Die Abnahme-Prüfungen
  von konto 02, 03, 04, 05, 06 und seite 01 lesen den Zeitpunkt des letzten Commits an `docs/soll/*.png`, das ist jetzt
  `f8f8b95` (2026-11-17T16:39:12+00:00), und ihre Abnahme-Issues haben keine Abnahme danach; die Abnahme dieser Bilder steht in
  PRO-24257 (umzug 02 Punkt 2). kanal 01 und kanal 03 Punkt 3 bleiben `READY`. Die Zeilen stehen unter
  `## Abgelöst durch umzug 02` in `goals/konto/ANNAHMEN.md` (5), `goals/seite/ANNAHMEN.md` (1) und hier (1).
- **Wechsel grün am 17.11.2026**, weil Matthias `CP_PUBLIC_URL` in PR #255 (`187ac7a`) auf `https://automatonhost.com` gesetzt
  hat und `deploy.yml` grün durchlief: Die Abfragen von `hosts_live` aus `ops/live.sh`, nur lesend und ohne den vollen Lauf, der
  eigene Sandboxes und Automatons anlegt, ergaben mit `bash ops/live.sh --judge hosts` die Zeile `OK hosts: canonical
  automatonhost.com`; Gegenprobe mit gepflanztem `postyourprice.com / 200 -` ergab `FAIL hosts: … two canonical hosts`.
  `curl` auf `https://postyourprice.com/` gab `301 https://automatonhost.com/`, auf `https://automatonhost.com/` `200`.
- **Punkt 9, dritte Netz-Prüfung belegt erst den Rollout dieses Goals**, weil `LOOP.md` (Arbeitsweise) sagt, dass eine Zeile mit
  `(Netz)` nur belegt, was schon ausgerollt ist, und die Live-Prüfung des Neuen der Release Manager nach dem Deploy macht: Am
  17.11.2026 nach dem Wechsel zählt `curl -s https://automatonhost.com/` noch 8 Fundstellen des alten Namens, weil dort die
  Startseite von `dev` ohne umzug 02 läuft; nach dem Merge dieses Goals und dem Rollout über `deploy.yml` muss sie 0 ausgeben.
- **konto 07 ohne abgelöste Prüfbefehle**, weil es nach dem Lauf von Zyklus 1 auf `dev` fertig wurde und seine beiden Befehle,
  die einen Pfad dieses Goals nennen (die vitest-Liste mit `test/konto-account.test.ts` und der Zähler über
  `goals/konto/ANNAHMEN.md`), am Goal-Branch nach dem Merge von `dev` dieselbe Ausgabe wie auf `dev` geben (Exit 0, 103 Tests;
  `8` und `8`).

## Abgelöst durch umzug 02 (Maker, 2026-11-17)

- Abgelöst: umzug 01 Punkt 1 durch umzug 02 Punkt 8, Ausgabe dann genau `Exit 0, 21` (Tech Lead, 2026-11-17)

## Goal 03 (18.11.2026, Engineer CP)

- **Die Karte sagt, was der Block `move` sagt**, weil ein Betreiber aus einem Conway-Issue zuerst den geteilten Link sieht
  (Entscheidung 1): Überschrift in zwei festen Zeilen, Satz zu Wallet und API, die Zeile `"conwayApiUrl": "https://automatonhost.com"`
  und unten rechts `automatonhost.com`. Markt, Provision und freier erster Auftrag sind weg.
- **Neuer Baustein `.line` mit Codekasten**, weil die Zeile mit `conwayApiUrl` das ist, was der Betreiber abtippt, und als Code
  erkennbar sein muss; Rahmen und Feldname im Grün der Karte, kein neuer Farbwert. Die Beschriftung lautet „One line to change“.
- **`/og.png` gilt weiter für alle Seiten, die es tragen**, weil eine eigene Karte für Marktseiten keinen Bezug zum Ziel hat
  (Entscheidung 2); `og-card-x402.html` und `og-x402.png` blieben unverändert.
- **`ops/soll-og.mjs` misst Inhalt an den Kästen der Elemente, nicht an der Scrollbreite**, weil das Leuchten `body::before` mit
  Absicht über den Rand reicht und abgeschnitten wird; über die Scrollbreite meldete das Werkzeug beim ersten Lauf 1320 px für
  eine Karte, die nichts abschneidet. Das Werkzeug steht zusätzlich in den gemeinsamen Tests der SOLL-Werkzeuge (Flags, Browser
  weg, Schriften).
- **1:1 heißt byte- und pixelgleich**, weil Entscheidung 4 es so festlegt: `src/public/og-card.html` und `src/public/og.png` sind
  Kopien von Quelle und SOLL-Bild, gemacht nach der Abnahme (Design Reviewer 01:19 UTC, Karte um 01:23 UTC).
- **Test der Karte verlangt keinen freien ersten Auftrag**, weil ein Bild `starterOffer()` nicht fragen kann (Entscheidung 6):
  „first job“, „free“ und der Betrag des Startguthabens fehlen. Der zweite Fall vergleicht mit der Überschrift des Blocks `move`
  und prüft zusätzlich, dass sie aus zwei Sätzen besteht und die Frage vorn steht; Fälle 3 wie vorher, Zeilen mit `expect(` 15 statt 11.
- **Das Prüfwerkzeug der Karte erkennt die Umzugskarte an `conwayApiUrl`**, weil sie keinen Auftrag verspricht und damit bei
  jedem Topf wahr ist (Entscheidung 7); verspricht sie ihn doch, gilt die alte Prüfung. Die sechs alten Fälle stehen unverändert,
  vier neue kamen dazu.
- **`llms.txt` beginnt mit dem Wechsel**, weil ein Automaton die Datei zuerst liest (Entscheidung 8); der Markt-Absatz steht
  unverändert unter `## The market`, deshalb bleiben die Tests, die dort die Sätze der Startseite suchen, grün.
- **Prüfbefehl von Punkt 3 mit `soll-live.mjs` braucht Node 22 vorn im `PATH`**, weil better-sqlite3 im Worktree für Node 22
  gebaut ist und die Shell des code-host Node 24 vorn hat; mit `PATH=/usr/bin:$PATH` gibt er `exit=0 0 defects`.
- **Abgelöste Prüfbefehle: 7**, weil neue Tests, Kommentare und Zeitstempel unter `docs/soll/` ihre Ausgabe ändern
  (Entscheidung 9): Von 79 Prüfbefehlen fertiger Goals, die einen Pfad dieses Diffs oder `og-card`, `og.png`, `llms` oder
  `One job` nennen, liefen 49 ohne Netz an der Merge-Basis `d02070e` und am Goal-Branch `8dc5ed4`, je in einem eigenen Worktree,
  verglichen über Exit-Code und letzte Zeile; 29 nennen `origin/dev` oder die Merge-Basis und laufen im Audit am Verdict-Commit
  ihres Goals, die 7 mit `(Netz)` liefen zusätzlich an beiden Ständen und lesen nur die Paperclip-API. Geändert: konto 08 Punkt 2 und 4 (sechstes Werkzeug in
  `test/soll-browser-gone.test.ts`), seite 03 Punkt 6 (18 auf 28, an der Merge-Basis schon rot, weil umzug 01 und 02 den Namen
  der Goals in Kommentare schrieben), umzug 02 Punkt 4 zweimal (Erwartung bleibt erfüllt), dazu mit Netz seite 01 Punkt 4 und
  umzug 02 Punkt 2, weil `docs/soll/src/startseite.html` jetzt den Commit von 01:23 UTC trägt.

## Abgelöst durch umzug 03 (Maker, 2026-11-18)

- Abgelöst: umzug 02 Punkt 2 durch umzug 03 Punkt 3, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-18T01:23:28+00:00` (Tech Lead, 2026-11-18)
- Abgelöst: umzug 02 Punkt 4 durch umzug 03 Punkt 5, Ausgabe dann genau `Exit 0, 5` (Tech Lead, 2026-11-18)
- Abgelöst: umzug 02 Punkt 4 durch umzug 03 Punkt 4, Ausgabe dann genau `Exit 0, SELFTEST OK: ten cases, both directions, including the number drifting apart and the card of the switch.` (Tech Lead, 2026-11-18)

## Goal 04 (18.11.2026, Engineer CP)

- **Tabelle `OG_CARDS` in `src/public/og-cards.ts` mit genau `og.png` und `og-x402.png`**, weil Bild und Alt-Text an einer Stelle
  stehen müssen, damit sie nicht wieder auseinanderlaufen (Entscheidung 1). Der Text für `og.png` ist Zeichen für Zeichen der aus
  `src/public/index.html`, `test/og-cards.test.ts` vergleicht beide; für `og-x402.png` gilt der Vorschlag des Tech Lead wörtlich.
- **Version beim Start aus den ausgelieferten Bytes, nie im Template**, weil `index.html` sonst bei jeder neuen Aufnahme mitgeändert
  werden müsste und eine vergessene Zahl still falsch wäre (Entscheidung 2). Gerechnet wird über den `ArrayBuffer`, den die Route
  ausliefert, also auch über `dist/public/og.png`, wenn das Image ihn trägt.
- **Eine Funktion `withCard()` für `page()` und `/`**, weil die Startseite nicht durch `page()` geht und zwei Stellen mit eigenen
  Regeln wieder auseinanderlaufen würden. Der frühere globale Ersatz `og.png` durch den Kartennamen im Kopf entfiel, weil er nur die
  beiden Bildzeilen traf und jetzt gezielt ersetzt wird.
- **Eine Karte ohne Eintrag wirft, und der Parameter `card` von `page()` hat den Typ `OgCardName`**, weil ein Rückfall auf den Text
  der Startseite das Bild falsch beschreibt (Entscheidung 3): `tsc` in `check` lehnt einen fremden Namen schon vor dem Start ab,
  die Ausnahme in `withCard()` fängt alles, was zur Laufzeit hereinkommt.
- **Alt-Text wird mit `esc()` aus `src/public/market.ts` eingesetzt**, weil er als Attribut im Kopf landet; beide heutigen Texte
  enthalten kein zu maskierendes Zeichen, deshalb bleibt der Text der Startseite byte-gleich.
- **`test/og-cards.test.ts` war gegen das alte `src/app.ts` rot (4 von 8 Fällen)**, weil die vier Seitenfälle die Version
  verlangen (Entscheidung 4); die vier übrigen Fälle prüfen Tabelle und Bildroute und sind ohne Fix grün.
- **`test/public.test.ts`, `test/x402-page.test.ts` und `test/conway-page.test.ts` verlangen die Adresse mit `?v=` und 8
  Hex-Zeichen per `toMatch`**, weil die alte Erwartung das schließende Anführungszeichen direkt hinter dem Bildnamen verlangte
  (Entscheidung 5); Zahl der Fälle und der `expect(` je Datei unverändert.
- **`test/site-dns-selftest.test.ts` startet mit leerem `HOME`, leerem Token und einem Proxy auf `127.0.0.1:9`**, weil das Werkzeug
  den Token sonst aus der Geheimnisdatei unter `HOME` liest und ein Test nie einen Weg nach Cloudflare haben darf (Entscheidung 6).
  Gegenprobe: `if want != got` in einer Kopie macht ihn rot (1 Fehler).
- **`KNOWN_HOSTS` wird als Menge gegen `SERVICE_HOSTS` verglichen**, weil die Reihenfolge in `ops/before-the-answers.py` nichts
  bedeutet (Entscheidung 7); Gegenprobe: `automatonhost.com` aus der Kopie gestrichen macht ihn rot (1 Fehler).
