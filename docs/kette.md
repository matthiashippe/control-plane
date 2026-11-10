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
seinem Timeout von 60 Sekunden, berechnet wurden sie trotzdem, zusammen 79229 mc (0,79 USD, gemessen mit Befehl in
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
