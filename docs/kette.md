# Die Kette des Loops control-plane

Ausführliche Fassung jedes Glieds aus `ROADMAP.md`, Stand 10.11.2026. Der Writer schreibt eine fehlende Goal-Datei aus dem Abschnitt
ihres Glieds, nach dem Muster der vorhandenen Goal-Dateien, mit Prüfbefehlen, die rot werden können. Was ein Vorgänger festgelegt hat
(etwa `docs/sandbox/plan.md` aus sandbox 01), geht diesem Text vor. Kein Abschnitt nennt Namen oder Adressen von Kunden; der Maker
findet sie in der Produktion, das Repo bekommt sie nie.

## fehler: Fehler echter Nutzer

Keine festen Glieder. Der Writer hängt je Vorschlag `goals/_vorschlaege/fehler-*.md` mit Schwere 5 ein Glied an (`LOOP.md`, Fehler
echter Nutzer). Ein Glied ist erledigt, wenn ein Test den Fehler nachstellt (rot vor dem Fix, grün danach) und `ops/live.sh` nach dem
Rollout zeigt, dass derselbe Weg für eine eigene Adresse nicht mehr scheitert.

## abrechnung 01: Keine Abbuchung ohne angekommene Antwort

Beleg vom 10.11.2026: Ein fremder Automaton brach 5 Anfragen an `/v1/chat/completions` vor der fertigen Antwort ab, 3 davon in
seinem Timeout von 60 Sekunden, berechnet wurden sie trotzdem, zusammen ***** mc (*.** USD, Betrag je Kunde nicht im öffentlichen Repo, Grundregel 8; gemessen mit Befehl in
`docs/abrechnung/abbrueche-2026-11-10.md`). Die fünf Fälle stehen im Ledger (`kind = 'inference'`) und im Caddy-Zugriffslog. Ursache im Code: `handleChatUncoalesced` in `src/inference/proxy.ts` bucht, sobald der Anbieter antwortet, ohne zu
wissen, ob der Client noch wartet.

Ziel: Bricht der Client vor der fertigen Antwort ab, gibt es keine Ledger-Zeile `inference` und die Reservierung ist frei; der Abbruch
reicht bis zum Anbieter durch (kein Einkauf ins Leere, wo es geht), und er steht im Log mit Modell, Dauer und Einkaufspreis, damit
abrechnung 02 ihn zählen kann. Zusammengeführte Anfragen (`dedupe.ts`) bleiben richtig: Bricht einer von zwei identischen Aufrufern ab,
zahlt der andere genau einmal. Die fünf Fälle vom 10.11.2026 bekommen eine interne Gutschrift auf das Guthaben dieses Kunden, eine
Ledger-Zeile mit Verweis auf die fünf Abbuchungen (ihre `ref`), idempotent, über Code, der mit dem Rollout läuft, nie per Hand auf dem
Server; keine Überweisung, kein On-Chain-Senden. `ops/live.sh` entsteht hier: die Live-Prüfung des Release Managers, nur lesend gegen
die Produktion, und sie zeigt die Gutschrift.

## abrechnung 02: Schnellere Anbieter über das Provider-Routing

OpenRouter wählt je Modell unter mehreren Anbietern; das Provider-Routing im Request (`provider`: Sortierung nach Durchsatz oder Latenz,
Reihenfolge, Ausweichen) entscheidet, wer antwortet. Ziel: weniger Anfragen, die länger laufen als der Timeout der Runtime. Zuerst die
Timeout-Quote vorher aus den eigenen Daten (Caddy-Zugriffslog mit Dauer je Anfrage an `/v1/chat/completions` und das Ledger), mit
Gegenprobe; dann das Routing (konfigurierbar, im Test belegt, was an OpenRouter geht, nie ein Claude- oder Anthropic-Modell), und je
Aufruf Dauer und tatsächlicher Anbieter im Ledger, damit die Quote nachher messbar ist. Die Quote nachher zeigt `ops/live.sh` ab dem
Rollout; nach sieben Tagen wird der Vergleich ein Vorschlag für den Writer.

## sandbox 01: Sandbox-Vertrag, Isolation, Preis und PoC-Plan

Beleg vom 10.11.2026: Derselbe Automaton wollte einen eigenen Dienst starten und bekam bei uns 501 für Sandboxes und 404 für Domains.

Ziel: `docs/sandbox/vertrag.md` hält fest, welche Endpunkte und Felder die unveränderte Runtime am Pin `d8f8168` bei Conway für
Sandboxes und Domains aufruft (Methode, Pfad, Felder der Anfrage, Felder der Antwort, die sie liest, Fundstelle `Datei:Zeile`, was sie
bei einem Fehler tut), dazu was fremde Runtimes in der Produktion tatsächlich aufgerufen haben (Pfade und Status aus dem Caddy-Log, ohne
Adressen). `docs/sandbox/plan.md` entscheidet Isolation (fremder Code eines Kunden, nie auf dem Zahlungsserver; was der kleine Server
kann, etwa ob es `/dev/kvm` gibt), Netz (was eine Sandbox erreicht und was nie, der Zahlungsserver gehört dazu), Grenzen je Sandbox
(CPU, Speicher, Platte, Laufzeit), Preis in Credits mit Einkauf und Marge, die Verbindung zwischen Control Plane und Sandbox-Server
(ohne Secret in `/opt/control-plane/.env`, die kein Goal von Hand ändert: etwa ein Schlüsselpaar, das der Dienst in seinem Volume
erzeugt und dessen öffentliche Hälfte der Maker lesend holt) und die Schritte für sandbox 02 bis 04. Der Server-Kauf ist das Human
Gate `server_kauf`: eine Karte mit den genauen Klicks bei Hostinger (Paket, Preis im Monat, etwa 5 Euro, Standort, Betriebssystem, der
öffentliche Schlüssel des code-host zum Eintragen), wenige Minuten, Matthias bestellt. Danach ist der Server mit diesem Schlüssel vom
code-host erreichbar, und `docs/sandbox/server.md` nennt Adresse und Paket.

## sandbox 02: Der Sandbox-Server steht

Ziel: Der Server ist nach `docs/sandbox/plan.md` eingerichtet, mit einem Skript im Repo (idempotent, ein zweiter Lauf ändert nichts),
gefahren vom code-host per SSH: Betriebssystem auf Stand, nur die nötigen Ports offen, die Isolation installiert, ein Dienst, mit dem
das Control Plane Sandboxes anlegt, ausführt, Dateien schreibt, einen Port freigibt und löscht, mit Authentifizierung nach Plan,
Grenzen je Sandbox und Aufräumen abgelaufener Sandboxes. Prüfungen gegen diesen Server (Netz): Eine Sandbox liest keine Datei des
Hosts, erreicht weder den Zahlungsserver noch Metadaten-Adressen, und ein Prozess über der Speichergrenze stirbt, ohne den Host zu
treffen. Der Zahlungsserver bleibt unberührt.

## sandbox 03: Die Sandbox-API ist frei und abgerechnet

Ziel: Das Control Plane beantwortet jeden Endpunkt aus `docs/sandbox/vertrag.md` so, wie die Runtime ihn erwartet, statt mit 501,
und reicht ihn an den Dienst auf dem Sandbox-Server weiter. Abgerechnet in Credits nach dem Preis aus `docs/sandbox/plan.md`: eine
Ledger-Zeile je Abrechnungsschritt in derselben Transaktion wie der Saldo, reserviert wie bei der Inferenz, idempotent, keine Sandbox
ohne Guthaben, Halt bei leerem Guthaben, nichts berechnet, was nicht lief. Unit-Tests mit einem nachgebauten Dienst, der Rollout über
`deploy.yml`, danach legt `ops/live.sh` mit einer eigenen Adresse eine Sandbox an und löscht sie wieder.

## sandbox 04: Ende zu Ende mit der unveränderten Upstream-Runtime

Ziel: Der Harness bekommt einen Dienst, der den Sandbox-Server nachbildet, und `pnpm e2e` (oder ein eigener Lauf daneben im Job `e2e`)
zeigt: Die unveränderte Runtime am Pin legt eine Sandbox an, führt darin aus, gibt einen Port frei, das Ledger stimmt, und die
Sandbox ist danach weg. Dazu einmal gegen die Produktion mit einem eigenen Automaton (Adresse aus `src/bounties/ours.ts`), bezahlt aus
vorhandenen Credits, ohne Wallet-Bewegung.

## sandbox 07: Ein ganzer Automaton läuft in einer Sandbox

Bis sandbox 06 startet ein Automaton, der woanders läuft, seinen Dienst bei uns. Ab hier läuft der Automaton selbst bei uns, weil
ein Mensch ohne Wallet (konto) meist auch keinen Server hat. Die Runtime bleibt unverändert am Pin; was sie zum Start braucht
(Genesis, Config, Wallet-Datei), schreibt das Control Plane in die Sandbox, und die Grenzen aus `docs/sandbox/plan.md` gelten wie
für jede Sandbox. Die Wallet der Runtime signiert nur (Anmeldung, Nachrichten) und hält nie Geld, damit wir nie Kundengeld in
einem Schlüssel auf unserem Server haben.

## domains 01: Die Domain-Endpunkte der Runtime

Ziel: Die Domain-Endpunkte aus `docs/sandbox/vertrag.md` antworten, wie die Runtime es erwartet, statt mit 404. Was dahinter
entsteht, entscheidet das Goal nach dem Plan: etwa ein Name unter einer eigenen Zone, der auf den freigegebenen Port einer Sandbox
zeigt, und eine klare Antwort für alles, was einen Kauf bräuchte (ein Domain-Kauf ist das Human Gate `server_kauf`). Belegt mit
Unit-Tests und dem Harness; DNS einer fremden Zone fasst das Goal nie an.

## kanal 01: Antworten auf neue Conway-Issues vorbereiten

Ziel: Neue Issues im Upstream-Repo `Conway-Research/automaton` mit Anmelde- oder Zahlungsfehlern finden (gelesen über `gh`, seit dem
letzten Eintrag in `ops/posted-answers.log`), je Issue eine Antwort vorbereiten, die den Fehler in der Sache beantwortet und den Weg
über `postyourprice.com` offen nennt, und sie durch `ops/before-the-answers.py` prüfen (höchstens 3 am Tag, Gatter grün). Die
Entwürfe stehen im öffentlichen Repo, also nichts darin, was nicht auch im Issue stehen dürfte. Gepostet wird erst nach Matthias'
Freigabe (Human Gate `public_post`), genau der freigegebene Text, über `ops/post-the-answers.py`, und `ops/posted-answers.log` hält
jeden Kommentar fest.

## konto: Ein Automaton für Menschen ohne Wallet

Grundsatz für alle Glieder 01 bis 05 (Matthias 13.11.2026, fast track). Die meisten Nutzer kommen aus Claude Code im Terminal und
haben keine Wallet. Bis 23.09.2026 blieben 43 Besucher an der Wallet-Signatur hängen (`src/auth/keyless.ts`), und keiner kam weiter.

- Wir halten nie einen Key und nie Kundengeld. Das Konto liegt beim Anbieter für eingebettete Wallets und wird nur mit dem Passkey
  des Kunden entsperrt; Verwahrung, Tausch und Auszahlung in Euro machen Anbieter mit Erlaubnis.
- Jede Geldbewegung ist on-chain an ein Ziel gebunden: die Abbuchung für Inferenz nur an uns und mit Tagesgrenze, die Auszahlung
  nur an die feste Auszahladresse des Kunden. Kapert eine Prompt-Injection den Agent im Terminal, kostet das höchstens das Tageslimit.
- Credits bleiben unauszahlbar (Regel 10). Was ausgezahlt wird, gehört schon dem Kunden und liegt auf seinem Konto.
- Das Terminal verlässt der Nutzer nur für einen QR-Code aufs Handy: beim Start (Passkey, Erlaubnis, erste Zahlung) und bei der
  ersten Auszahlung (Identitätsprüfung des Anbieters). Alles andere ist ein Tool in `mcp/server.mjs`.

## karte: Guthaben per Karte über Digistore24

Grundsatz für alle Glieder (Matthias 22.11.2026): Menschen ohne Wallet zahlen per Karte über Digistore24, nicht über MoonPay
(konto 15 ruht). Digistore24 verkauft als Reseller im eigenen Namen und führt die Umsatzsteuer ab; es braucht weder einen neuen
Zahlungsanbieter noch eine eigene Lösung für die Umsatzsteuer.

- Es ist dasselbe Verkäuferkonto wie bei Personalplaner24, Bautagebuch24 und Aszendent24. Ein Goal ändert nur die eigenen neuen
  Produkte, nie Produkte, IPN-Verbindungen oder Bestellformulare der anderen Projekte. Zugang über `DIGISTORE24_API_KEY` aus
  `~/brain/connectors/secrets.env`, Werkzeuge und Fallen in `~/brain/connectors/digistore24.md`. Vorlage für Kasse, IPN und Freigabe
  ist `~/work/personalplaner24` (`app/digistore_kasse.py`, `goals/46-erste-zahlung.md`), dazu der Abschnitt „Digistore24: was bei
  Personalplaner24 Zeit gekostet hat“ in `~/work/aszendent24/loop-constraints.md`.
- Pakete und Preise stehen fest: 5, 20 und 50 EUR brutto. Einen anderen Preis, einen Gutschein oder einen Rabatt setzt kein Goal.
- Gutgeschrieben wird, was bei HTC ankommt: der Verkäuferanteil aus der IPN in USD zum Referenzkurs der EZB vom Kauftag. Die Marge
  bleibt der Aufschlag auf Inferenz. Seite, Plugin und Kasse nennen vor dem Kauf das Guthaben, das ein Paket ergibt.
- Guthaben bleibt unauszahlbar (Regel 10). Eine Rückerstattung oder Rückbuchung bucht das Guthaben zurück, soweit es noch da ist; den
  Rest zeigt `ops/status.sh` als Fehlbetrag, ein Saldo wird nie negativ.
- Die Adresse des Automatons reist nur im Parameter `custom` der Kasse und in der IPN; sie steht nie im Repo, in Logs von Actions
  oder in Texten (Grundregel 8). Kein Text nach außen nennt PostYourPrice (Grundsatz umzug).

**Testkauf und Rückgabe ohne Matthias (22.11.2026):** Ein Testkauf braucht keine Anmeldung im Backoffice. `getProduct` liefert `orderform_preview_url` mit dem Schlüssel `testpay`; dieser Link plus `&custom=<adresse>` öffnet die Kasse mit der Zahlart Testpay, auch headless (Playwright), und der Kauf geht ohne Anmeldung durch. So liefen die drei Testkäufe zu karte 02 (Bestellungen XVKLH764, D9VUMT3K, JWZXV2AF); der Dienst legt sie als `test` ab und bucht nichts. Ein Testkauf ist darum nie ein Human Gate. Digistore verlangt für englische Produkte 60 Tage Rückgabe und lehnt 30 ab (22.11.2026); die Freigabe beantragt `updateProduct` mit `data[approval_status]=pending`. Die Rückgabe von 60 Tagen hängt nicht am Produkt, sondern an der Rückgaberegel 59404 „Automaton credit 60 Tage“ (Backoffice, Meine Produkte, Rückgabe-Regelungen), die 771278, 771279 und 771280 umfasst; `getProduct` zeigt sie als `refund_policy.private.refund_days`. Ein neues Produkt kommt in diese Regel, das geht nur im Backoffice und erledigt die Mac-Session, nie eine Karte an Matthias.

## umzug: Von PostYourPrice auf automatonhost.com

Grundsatz (Matthias 17.11.2026): Nach außen (Seiten, README, Plugin, PRs, Einträge, Kommentare, Posts) wird PostYourPrice weder genannt
noch verlinkt; das Angebot sind die Automatons, die bei uns laufen. Der Name ist die Domain `automatonhost.com` (Matthias' Wahl vom
17.11.2026); einen anderen Markennamen setzt kein Goal. Die Domain kauft Matthias im Cloudflare-Konto von HTC. Fehlt die Zone
`automatonhost.com` dort beim Start von umzug 01, steht das Goal zuerst am Human Gate `server_kauf` mit genau diesem Kauf.
`postyourprice.com` und `cp.hippe.eu` bleiben registriert und erreichbar, weil laufende Automatons, installierte Plugins und
veröffentlichte Kommentare auf sie zeigen.

### umzug 01: Der Dienst zieht auf automatonhost.com

Ziel: `https://automatonhost.com` ist der kanonische Host (`CP_PUBLIC_URL`) mit gültigem Zertifikat, `www.automatonhost.com` leitet mit
308 auf den Apex. Muster ist der Umzug von `cp.hippe.eu` (`src/app.ts`, Kommentar über `PAGES_STAY`): Seiten unter `postyourprice.com`
und `cp.hippe.eu` leiten mit 301 auf denselben Pfad unter `automatonhost.com`, die Pfade aus `PAGES_STAY` (`/v1/`, `/pay/`,
`/.well-known/` und die übrigen) antworten auf allen drei Hosts, weil Clients bei einem Redirect über Hosts den Authorization-Header
verwerfen und ein Automaton mit `conwayApiUrl: https://postyourprice.com` sonst unangemeldet ankäme. Die Zahlungsdomain darf nie an
den Dienst eines Kunden gehen: Jede Sperre für `postyourprice.com` (`ops/sandbox/sandboxd.mjs`, `ops/sandbox/setup.sh`, die Prüfung
der `public_url` im Control Plane) gilt genauso für `automatonhost.com`. Passkeys: Konten aus `/konto` haben ihren Passkey für die
rpId des Hosts, auf dem sie entstanden (`src/public/konto-client/main.mjs`); das Goal zählt in der Produktion nur lesend die Konten
mit Passkey und hält jedes davon benutzbar (etwa Related Origin Requests über `/.well-known/webauthn` oder `/konto` für sie auf dem
alten Host). Die erlaubten Origins im Auth Proxy des Wallet-Anbieters bekommen `https://automatonhost.com` dazu; was dort nur
Matthias einstellen kann, ist ein Human Gate. Stripe kehrt auf `automatonhost.com` zurück. Belegt mit Tests der Weiterleitung je Host
und Pfadklasse und nach dem Rollout mit `ops/smoke.sh` gegen `https://automatonhost.com` und gegen `https://postyourprice.com`.

### umzug 02: Seiten und Texte nennen Automatons

Ziel: Startseite, Seitentitel, strukturierte Daten, `llms.txt`, README, das Plugin (`.claude-plugin/marketplace.json`,
`mcp/.claude-plugin/plugin.json`, der Standard von `CP_URL` in `mcp/server.mjs`) und der Name im Passkey nennen Automatons und
`automatonhost.com`, weder PostYourPrice noch Handsel; Beispiele mit `curl` zeigen `https://automatonhost.com`. Die Startseite führt
mit dem Angebot für Automatons (einen Automaton bei uns starten, `conwayApiUrl` umstellen); der Markt für Menschen bleibt erreichbar,
steht aber nicht mehr oben. Die Entwürfe aus kanal und jeder neue Text nach außen nennen `automatonhost.com`. Vor dem Bau SOLL-Bilder
bei 390 und 1440 px unter `docs/soll/`, Abnahme durch den Design Reviewer; was seite 01 und 02 festlegen, übernimmt den neuen Namen.
Belegt mit einem Prüfbefehl, der `PostYourPrice` und `Handsel` in ausgelieferten Seiten, README und Plugin zählt und 0 verlangt. Ein
schon installiertes Plugin `automaton@postyourprice` läuft weiter, weil die API auf `postyourprice.com` antwortet.

## relay 01: Das Social-Relay der Runtime

Beleg: Die Runtime am Pin hat in `src/social/` einen fertigen Client für Nachrichten, die mit dem Wallet-Key signiert sind, und
spricht mit `socialRelayUrl` (Default `https://social.conway.tech`, DNS tot, `docs/protocol.md`). Wir antworten auf dieselben Pfade
mit 501. Ein Automaton, der `socialRelayUrl` auf uns stellt, braucht keine Zeile Code, um wieder mit anderen zu schreiben. Die
Nachrichten selbst kommen nie on-chain; Identität ist die Signatur, Spam hält der Preis für Erstkontakte ab.
