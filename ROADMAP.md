# ROADMAP.md: Topics, Priorität, Goal-Ketten

Quelle: `docs/kette.md` (ausführliche Fassung jedes Glieds), Reihenfolge nach Wirkung beim zahlenden Kunden, bis zu zwei Goals
parallel (`parallel_goals: 2`). Der Loop Master startet Topics in der Reihenfolge der Spalte Prio (bei gleicher Prio in der Reihenfolge der
Tabelle), sobald ihre Voraussetzung abgeschlossen ist. Innerhalb eines Topics laufen die Goals seriell (`goals/<topic>/01-…`,
`02-…`). Maßgeblich sind die Zeilen `- <topic> Goal NN DONE` unter `## Voraussetzungen` der Goal-Datei; die Spalte Voraussetzung
gilt für ein erstes Goal, dessen Datei noch fehlt. Fehlt die Datei eines Glieds der Spalte Kette, bekommt der Writer den Auftrag
„control-plane: <topic> NN schreiben“ mit dieser Zeile und dem Abschnitt aus `docs/kette.md`. Bei der Budget-Stufe core starten nur
Topics mit Prio 1 bis 3, deshalb steht die ganze Kette in diesen drei Stufen.

| Prio | Topic | Zweck | Voraussetzung | Kette (Dateien liegen bei für abrechnung 01 und 02, sandbox 01, domains 01, kanal 01) |
|---|---|---|---|---|
| 1 | **fehler** | Ein Fehler, den ein echter Nutzer gesehen hat, vor allem anderen (`loop-constraints.md`, Grundregel 4; `LOOP.md`, Fehler echter Nutzer). Glieder hängt der Writer an | keine | 01 Warnung vor leerem Guthaben beim Inferenz-Anbieter: `ops/credit-runway.sh` rechnet die Reichweite des Guthabens gegen den Verbrauch je Tag, `ops/watchdog.sh` meldet den Wechsel unter die Schwelle über den bestehenden Alarmweg, Test rot vor dem Fix. Am 11.11.2026 war das Guthaben leer, ein fremder Automaton bekam ab 02:01 UTC 1001 Mal 503, am 12.11. bis 05:37 UTC weitere 264. Widerlegt, wenn das Guthaben in 14 Tagen nach dem Rollout wieder auf 0 fällt ohne vorherige Zeile `[WARN] credit`. Übernimmt goals/_vorschlaege/fehler-2026-11-11-1.md · 02 Besucheradressen raus aus dem öffentlichen Repo: der Cache von `ops/fetchers.py` außerhalb des Checkouts, `ops/fetcher-cache.tsv` aus dem Repo und in `.gitignore`, die Adressen echter Besucher in Kommentaren, Fixtures und Tests durch Dokumentationsadressen ersetzt (Grundregel 8). Widerlegt, wenn danach eine Datei am Kopf von `dev` eine Adresse aus dem Cache trägt. Übernimmt goals/_vorschlaege/loop-redteam-2026-11-11-1.md; die Bereinigung der Historie ist `delete_data` bei Matthias · 03 Die Guthaben-Warnung geht nicht verloren, wenn der Alarmweg scheitert: `report` in `ops/watchdog.sh` gibt bei gescheitertem POST an den Webhook einen Exit-Code ungleich 0 zurück, und `check_credit` speichert `low` oder `empty` erst nach erfolgreichem POST, die Gesundheit ebenso; ein Test mit einem nachgebauten `curl`, dessen erster POST scheitert, ist rot vor dem Fix und verlangt, dass der nächste Lauf die Warnung postet. Widerlegt, wenn dieser Test schon vor dem Fix grün ist. Übernimmt goals/_vorschlaege/fehler-kritik-2026-11-12-1.md · 04 Keine Besucheradresse kommt ungeprüft nach `dev`: eine Positivliste `ops/known-ips.txt` (Adresse, Art `datacenter`, `crawler`, `erfunden` oder `eigene`, je Zeile ein Beleg) für die öffentlichen IPv4-Adressen, die heute in getrackten Dateien stehen, und ein Test in `check`, der auch in CI ohne den Cache jede öffentliche IPv4-Adresse außerhalb von `192.0.2.0/24`, `198.51.100.0/24` und `203.0.113.0/24` ablehnt, die nicht in der Liste steht; eine Adresse ohne Beleg wird durch eine Dokumentationsadresse ersetzt (Grundregel 8). Widerlegt, wenn der Test am Kopf von `dev` ohne die Liste keine Adresse findet. Übernimmt goals/_vorschlaege/fehler-kritik-2026-11-12-3.md · 05 Ein ausgefallener Alarmweg bleibt nicht stumm: `ops/status.sh` zählt die Zeilen `webhook unreachable` der letzten 24 Stunden in `/var/log/cp-watchdog.log` und meldet ab 3 eine Zeile, die die Ops-Triage als rot liest; Test mit nachgebautem Log, rot vor dem Fix; dazu ein Fake für `curl` in `test/watchdog-webhook-fail.test.ts`, der ohne `--fail` mit 0 endet, damit der Test eine Antwort 4xx oder 5xx des Webhooks wirklich misst. Widerlegt, wenn `ops/status.sh` bei drei solchen Zeilen schon heute rot meldet. Übernimmt goals/_vorschlaege/fehler-kritik-2026-11-12-4.md · 06 Der Beleg `(fetcher-cache)` in `ops/known-ips.txt` ist prüfbar: Wo der Cache von `ops/fetchers.py` liegt, prüft ein Test jede Zeile mit diesem Beleg gegen den Cache (Adresse dort mit Art `datacenter` und dem genannten Betreiber, sonst rot); ohne Cache, also in CI, bleibt der Teil übersprungen wie heute. Widerlegt, wenn eine gepflanzte Besucheradresse mit diesem Beleg den Test schon heute rot macht. Übernimmt goals/_vorschlaege/fehler-kritik-2026-11-12-5.md · 07 Ein toter Alarmweg fällt auch an ruhigen Tagen auf: `ops/watchdog.sh` postet einmal am Tag ein Lebenszeichen mit niedriger Priorität über denselben Alarmweg, dessen Scheitern die Zeile `webhook unreachable` schreibt, sodass `alarm_path` in `ops/status.sh` binnen 24 Stunden rot wird, auch wenn keine Meldung ansteht; `ops/status.sh` stellt die letzte zugestellte Meldung neben die Zählung und meldet rot nur, wenn danach keine Zustellung mehr kam, damit ein Ausfall von 15 Minuten nicht 24 Stunden rot hält. Test mit nachgebautem `curl` und Log, rot vor dem Fix; auf den Server kommt es mit dem nächsten Rollout des Laufzeitpfads. Widerlegt, wenn ein Webhook, der an einem Tag ohne Meldung stirbt, schon heute binnen 24 Stunden eine rote Zeile in `ops/status.sh` bringt. Übernimmt goals/_vorschlaege/fehler-kritik-2026-11-13-1.md · 08 Keine Prüfung in `check` hängt an Schreibweise oder Uhr: `test/known-ips.test.ts` verlangt für jede `datacenter`-Zeile, deren Beleg `/fetcher.?cache/i` trifft, genau `(fetcher-cache)` und für jede andere eine Quelle aus `ops/fetchers.py lookup`, `RIPE RDAP` oder `ARIN RDAP` mit Datum `(JJJJ-MM-TT)`, sonst rot mit Zeilennummer; die beiden Tests in `test/sandbox-api.test.ts`, die den ersten Aufruf nach festen 200 ms abbrechen, brechen erst ab, wenn der nachgebaute `sandboxd` ihn gesehen hat, mit denselben Erwartungen. Ändert nur Tests, `ops/known-ips.txt` und `ops/README.md`, kein Rollout. Widerlegt, wenn die Zeile `203.0.113.7 datacenter AWS (fetcher cache)` schon heute rot ist. Übernimmt goals/_vorschlaege/fehler-kritik-2026-11-13-2.md und goals/_vorschlaege/sandbox-nacharbeit-2026-11-13-2.md · 09 Die Warnung kommt auch an: `ops/status.sh` liest mit `CP_ALERT_WEBHOOK` aus der lokalen Umgebung die Nachrichten des Themas der letzten 26 Stunden (ntfy, `json?poll=1&since=26h`) und meldet `alarm_path.received` mit dem Zeitpunkt des letzten Lebenszeichens aus fehler 07; rot, wenn keines kam, obwohl `last_delivered` in diesem Fenster liegt, `unknown`, wenn `CP_ALERT_WEBHOOK` fehlt oder das Thema nicht lesbar ist. So fällt ein falsches oder veraltetes Thema in der crontab des Servers auf, das ntfy mit 200 annimmt. Test mit nachgebautem `curl` ohne Netz (Lebenszeichen da, Lebenszeichen fehlt trotz Zustellung, Thema nicht lesbar), rot vor dem Fix; URL und Thema stehen nie im Repo, in einer Ausgabe oder einem Log. Ändert nur `ops/status.sh`, den Test und `ops/README.md`, kein Rollout. Widerlegt, wenn ein Lebenszeichen auf einem anderen Thema schon heute eine rote Zeile in `ops/status.sh` bringt. Übernimmt goals/_vorschlaege/fehler-kritik-2026-11-14-1.md |
| 1 | **betrieb** | Zahlende Kunden behalten: Das Guthaben beim Inferenz-Anbieter wird nie leer, und keine Anfrage scheitert, weil der Dienst gerade neu startet (Matthias 12.11.2026 im Feedback auf dem Board: neue zahlende Kunden und alles, was die zahlenden hält, Guthaben beim Anbieter nie leer und keine Ausfälle, haben Vorrang). Am 12.11.2026 um 16:40 UTC meldete `ops/credit-runway.sh --container` 4,96 USD für 1,5 Tage bei 3,12 USD je Tag, und `ops/watchdog.sh` auf dem Server ruft die Guthaben-Prüfung aus fehler 01 noch nicht auf, weil `ops/` nur mit einem Rollout des Laufzeitpfads ausrollt | keine | 01 Das Guthaben beim Inferenz-Anbieter lädt sich selbst nach: aus dem gemessenen Verbrauch je Tag (`ops/credit-runway.sh`) Schwelle und Betrag der automatischen Aufladung beim Anbieter so gewählt, dass der Rest nie unter die Schwelle aus fehler 01 fällt, in `docs/betrieb/guthaben.md`; Matthias schaltet sie am Human Gate `server_kauf` mit genauen Klicks und diesen Zahlen ein; danach meldet `ops/credit-runway.sh --container` OK. Widerlegt, wenn der Rest in den 14 Tagen nach dem Einschalten unter die Schwelle fällt · 02 Keine Anfrage scheitert am Neustart: Caddy hält eine Anfrage, deren Verbindung zum Dienst während eines Rollouts scheitert, bis der Dienst wieder antwortet (höchstens 30 Sekunden, `lb_try_duration` in `deploy/Caddyfile`), statt 502 zu antworten; vorher die 5xx an fremde Adressen in den Fenstern der Rollouts seit 10.11.2026 mit `ops/deploy-window.sh` gezählt, nachher im Fenster des eigenen Rollouts. Der Merge rollt über `deploy.yml` aus und bringt damit auch die Guthaben-Warnung aus fehler 01 auf den Server. Widerlegt, wenn die Fenster seit 10.11.2026 keinen 5xx an eine fremde Adresse zeigen. Übernimmt goals/_vorschlaege/fehler-kritik-2026-11-12-2.md · 03 Ein Prüfbefehl macht `check` nicht mehr rot: `own_ips` in `ops/own-ips.sh` schreibt eine neu gesehene eigene Adresse nur mit `CP_OWN_IPS_WRITE=1` nach `ops/own-ips.txt` (so in `deploy.yml` und von Hand) und zählt sie sonst nur für den Lauf mit; ein Test zeigt, dass `ops/own-ips.txt` nach `ops/deploy-window.sh --at …` mit nachgebautem `ssh` unverändert ist, rot vor dem Fix. Widerlegt, wenn die Datei nach diesem Aufruf schon heute unverändert ist. Übernimmt goals/_vorschlaege/betrieb-kritik-2026-11-12-4.md · 04 Gemessen, dass der Neustart keine 502 mehr bringt: Der Rollout des Merges von betrieb 02 startete `deploy-cp-1` am 13.11.2026 neu, `deploy.yml` maß sein Fenster (00:47:29 bis 00:51:29 UTC) nur zum Teil (`PARTIAL`, 0 von 25 Anfragen mit 502); `ops/deploy-window.sh --at <Start des Containers>` misst dieses Fenster ganz und das des nächsten Rollouts, der `cp` neu startet, und die Zeilen `BAD GATEWAY` stehen unter `## Nachher` in `docs/betrieb/neustart.md`. Widerlegt, wenn eines der beiden Fenster mehr als 0 Anfragen mit 502 zeigt; dann ist betrieb 02 widerlegt. Übernimmt goals/_vorschlaege/betrieb-kritik-2026-11-12-3.md · 05 Die Aufladung beim Inferenz-Anbieter ist belegt und bleibt passend: Ab 26.11.2026 misst `ops/credit-runway.sh --container`, zählt die Zeilen `[WARN] credit` seit 12.11.2026 20:35 UTC im Log des Watchdogs und sucht den Sprung von `total_credits` um 25 USD ohne Kauf von Hand, Ergebnis in `docs/betrieb/guthaben.md`; dazu vergleicht `ops/watchdog.sh` einmal am Tag die von `--topup` gerechnete Schwelle mit der eingestellten aus `CP_CREDIT_TOPUP_USD` und meldet über den Alarmweg, wenn die gerechnete sie um mehr als 1 USD übersteigt, Test rot vor dem Fix. Startet frühestens am 26.11.2026. Widerlegt, wenn eine Warnung im Log steht oder der Sprung fehlt, obwohl der Rest unter 16 USD lag; dann ist betrieb 01 widerlegt. Übernimmt goals/_vorschlaege/betrieb-kritik-2026-11-12-1.md und goals/_vorschlaege/betrieb-kritik-2026-11-12-2.md |
| 1 | **sandbox** | Das nächste Produkt: der Dienst eines Kunden läuft in einer Sandbox auf einem eigenen Server, abgerechnet in Credits, fremder Code nie auf dem Zahlungsserver. Fast track (Matthias 13.11.2026): fertig, bevor Menschen ohne Wallet über konto einen Automaton bei uns starten, darum Ports ohne Warten auf Nachfrage (07, weil 06 an einer Mindestzahl hängen blieb) und 08, der ganze Automaton in einer Sandbox | abrechnung 01 | 01 Sandbox-Vertrag, Isolation, Preis und PoC-Plan · 02 Der Sandbox-Server steht · 03 Die Sandbox-API ist frei und abgerechnet · 04 Ende zu Ende mit der unveränderten Upstream-Runtime · 05 Lange Befehle scheitern nicht an der Runtime: im Harness gemessen, wie die unveränderte Runtime am Pin `d8f8168` ein `exec` von 60 s und von 180 s erlebt (Antwort, Wiederholungen, Stand ihres Circuit Breakers), danach entschieden und gebaut, was sie ohne Fehler liest: ein langes `exec` als Hintergrundlauf mit sofortiger Antwort oder 400 mit Klartext für `timeout` über 120000 ms; die Entscheidung in `goals/sandbox/ANNAHMEN.md`. Widerlegt, wenn die Runtime ein `exec` von 180 s schon heute ohne Fehler und ohne Zählung im Circuit Breaker erlebt. Übernimmt goals/_vorschlaege/sandbox-kritik-2026-11-12-4.md · 06 Freigegebene Ports unter einer eigenen Domain: zuerst aus dem Caddy-Zugriffslog gezählt, wie viele fremde Adressen seit dem Rollout von sandbox 03 `ports/expose` aufriefen und 409 `port_exposure_unavailable` bekamen (als Ausgangslage, der Kauf wartet nicht darauf, weil ein Automaton aus sandbox 08 ohne freigegebenen Port nichts verkaufen kann); dann kauft Matthias am Human Gate `server_kauf` eine eigene registrierbare Domain für Ports (Name und Preis schlägt das Goal vor) samt Cloudflare-Token nur für ihre Zone, und das Goal legt `*.<domain>` auf den Sandbox-Server, stellt die Zone auf SSL „Full (strict)“ mit Origin-CA-Zertifikat statt `tls internal` in `ops/sandbox/sandbox.caddy`, reicht `ports/expose` und `ports/{port}` an `sandboxd` weiter statt 409 und entfernt den Eintrag `*.postyourprice.com`; die übrige Zone `postyourprice.com` bleibt unverändert. Widerlegt, wenn ein freigegebener Port einer Sandbox danach nicht unter `https://<name>.<domain>` mit gültigem Zertifikat antwortet. Übernimmt goals/_vorschlaege/sandbox-kritik-2026-11-12-1.md und goals/_vorschlaege/sandbox-kritik-2026-11-12-2.md · 07 Freigegebene Ports unter einer eigenen Domain, ohne Warten auf Nachfrage: der Bau von 06, dessen Goal-Datei den Kauf an mindestens eine fremde Adresse band und mit 0 auf `BLOCKED fachlich` ging. Zuerst übernimmt das Goal `ops/ports-demand.sh` aus Commit 0ce27f0 (`git show 0ce27f0:ops/ports-demand.sh`, Selftest grün) statt es neu zu bauen und schreibt die Zahl der fremden Adressen, die seit dem Rollout von sandbox 03 `ports/expose` aufriefen und 409 `port_exposure_unavailable` bekamen, als Ausgangslage in `docs/sandbox/ports.md`, n ab 0; eine 0 widerlegt das Goal nicht und hält den Kauf nicht auf. Dann kauft Matthias am Human Gate `server_kauf` eine eigene registrierbare Domain für Ports (Name und Preis schlägt das Goal vor) samt Cloudflare-Token nur für ihre Zone, und das Goal legt `*.<domain>` auf den Sandbox-Server, stellt die Zone auf SSL „Full (strict)“ mit Origin-CA-Zertifikat statt `tls internal` in `ops/sandbox/sandbox.caddy`, reicht `ports/expose` und `ports/{port}` an `sandboxd` weiter statt 409 und entfernt den Eintrag `*.postyourprice.com`; die übrige Zone `postyourprice.com` bleibt unverändert. Widerlegt, wenn ein freigegebener Port einer Sandbox danach nicht unter `https://<name>.<domain>` mit gültigem Zertifikat antwortet. Übernimmt goals/_vorschlaege/sandbox-kritik-2026-11-12-1.md, goals/_vorschlaege/sandbox-kritik-2026-11-12-2.md und goals/_vorschlaege/sandbox-kritik-2026-11-13-2.md · 08 Ein ganzer Automaton läuft in einer Sandbox: Voraussetzung sandbox 07 (Ports), nicht das blockierte 06. Das Control Plane legt für ein Konto (auch ein schlüsselloses aus `src/auth/keyless.ts`) eine Sandbox an, installiert darin die unveränderte Runtime am Pin `d8f8168`, schreibt Genesis-Prompt und Config (`conwayApiUrl` auf uns, `socialRelayUrl` auf uns, sobald relay 01 DONE ist) und startet sie als Dienst, der nach einem Absturz und nach einem Neustart des Sandbox-Servers von selbst weiterläuft; abgerechnet in Credits wie jede Sandbox, Halt bei leerem Guthaben. Die Wallet, die die Runtime in der Sandbox erzeugt, hält nie Geld: Einnahmen gehen an das Konto des Kunden (konto 03), Credits bucht das Konto, dem die Sandbox gehört. Belegt im Harness (die Runtime denkt in der nachgebildeten Sandbox fünf Turns, das Ledger stimmt) und einmal in der Produktion mit einem eigenen Automaton (Adresse aus `src/bounties/ours.ts`), ohne Wallet-Bewegung. Widerlegt, wenn die Runtime nach einem Neustart des Sandbox-Servers nicht von selbst wieder denkt · 09 Ein Befehl im Hintergrund kostet keine Runden Nachfragen: startet nach sandbox 08 und damit erst, wenn sandbox 07 sein Human Gate hinter sich hat. Die Antwort auf ein langes `exec` aus sandbox 05 nennt im Feld `wait_command` und im Text einen fertigen Befehl für `exec` mit dem Standard-`timeout` 30000, der bis zu 25 s auf `<tag>.exit` wartet und dann Exit-Code, Ausgabe und Fehler druckt oder sagt, dass der Befehl noch läuft; `harness/e2e/long-exec.mjs` holt das Ergebnis eines Befehls von 180 s mit genau diesem Befehl, und `judgeLongExec` verlangt es. Bleibt unter 30 s, also ohne Abbruch der Runtime und ohne Zählung im Circuit Breaker. Widerlegt, wenn die unveränderte Runtime das Ergebnis schon heute ohne wiederholtes Lesen einer fehlenden Datei `<tag>.exit` holt. Übernimmt goals/_vorschlaege/sandbox-kritik-2026-11-13-1.md · 10 Die Runtime am Pin ist auch am Pin gebaut: `ops/runtime-sandbox.sh` baut `dist/` bei jedem Live-Lauf neu aus dem Clone am Pin oder vergleicht eine Prüfsumme über `dist/` mit der, die `build_runtime` beim Bau am Pin schrieb, und endet sonst mit `RUNTIME SANDBOX FAIL`; der Selbsttest bekommt den Fall „dist verändert“ (geändertes `dist/conway/client.js` bei sauberem `git status`), der mit FAIL endet, rot vor dem Fix (Grundregel 13). Ändert nur `ops/runtime-sandbox.sh` und seinen Selbsttest, kein Rollout. Widerlegt, wenn ein verändertes `dist/conway/client.js` schon heute FAIL ergibt. Übernimmt goals/_vorschlaege/sandbox-nacharbeit-2026-11-13-3.md |
| 1 | **konto** | Ein Automaton für Menschen ohne Wallet, bedient aus Claude Code im Terminal (Matthias 13.11.2026: fast track). Das Konto entsteht per Passkey bei einem Anbieter für eingebettete Wallets, wir halten nie Key oder Kundengeld; Einnahmen des Automatons gehen direkt auf dieses Konto, Inferenz läuft über eine Abbuchungserlaubnis mit Tagesgrenze, die nur an uns zahlt, Auszahlung in Euro über einen Anbieter mit Erlaubnis. Das Terminal verlässt der Nutzer nur für einen QR-Code aufs Handy. Grundsatz in `docs/kette.md`, Abschnitt konto | keine | 01 Die Anbieter sind geklärt: `docs/konto/anbieter.md` vergleicht aus der aktuellen Doku (Link und Datum je Aussage) Privy und Turnkey für das Konto (Passkey, Base, Abbuchungserlaubnis nach ERC-7715 oder als Spend Permission, Preis je aktivem Konto) und Bridge und Due für die Euro-Seite (Auszahlung an Privatkunden in Deutschland per SEPA, eine feste Auszahladresse je Kunde, die Eingehendes selbst in Euro auszahlt, Einzahlung per Karte in Deutschland, Gebühren, Identitätsprüfung, was HTC als Firma vorlegen muss) und entscheidet je Seite einen Anbieter. Kein Konto wird angelegt, kein Geld bewegt. Widerlegt, wenn kein Anbieter an Kunden in Deutschland in Euro per SEPA auszahlt; dann endet die Kette hier mit einem Vorschlag für einen anderen Weg · 02 Der Handoff zum Handy: zuerst SOLL-Bilder der Handy-Seite unter `docs/soll/` (390 und 1440 px), dann `POST /v1/handoff` (Code, Kurzlink und QR als Text fürs Terminal), die Seite `/h/{code}` und `GET /v1/handoff/{code}` als SSE, bis der Schritt erledigt ist; derselbe Handoff dient dem Terminal und dem Desktop-Browser ohne Passkey. Jeder Code gilt zehn Minuten und genau einmal, das Handy zeigt vor jeder Freigabe, was freigegeben wird (Name des Automatons, Tageslimit, Betrag), und Terminal und Handy zeigen dieselbe zweistellige Zahl, die man auf dem Handy aus drei auswählt (gegen QR-Phishing). Der Schritt dahinter ist hier ein Platzhalter, der nur bestätigt. Tests: abgelaufener, zweimal benutzter und falsch abgeglichener Code sind rot. Widerlegt, wenn ein Code aus einer fremden Sitzung ohne passenden Zahlenabgleich etwas freigibt · 03 Konto und Abbuchung auf Base Sepolia: startet erst, wenn `loop-constraints.md` Regel 10 die Ausnahme für Base Sepolia trägt (ändert nur Matthias); die Entwickler-Zugänge des Anbieters aus konto 01 legt Matthias am Human Gate `security_settings` an (Karte mit den genauen Klicks, wenige Minuten). Mit Test-USDC: Ein Konto entsteht per Passkey über den Handoff aus konto 02, es erteilt eine Abbuchungserlaubnis (nur USDC, nur an unsere Adresse, Tagesgrenze), das Control Plane bucht Credits aus dieser Erlaubnis nach, wenn sie knapp werden, ein Dienst mit payTo auf dem Konto nimmt eine Zahlung ein, und eine Abbuchung über der Tagesgrenze scheitert on-chain. Eigener Testschlüssel, nie der Schlüssel der Betreiber-Wallet. Widerlegt, wenn die Abbuchung über der Grenze durchgeht · 04 Die Terminal-Tools: Voraussetzung sandbox 08 und konto 03. `mcp/server.mjs` bekommt `start_automaton` (Genesis-Prompt und Tageslimit, antwortet mit QR und wartet über den Handoff), `automaton_status`, `automaton_logs`, `set_daily_limit` (senken im Terminal, erhöhen nur über den Handoff) und `stop_automaton`, dazu ein Claude-Code-Plugin mit Skill, der den Ablauf kennt, und eine Zeile Installation in der Doku. Auf der Maschine des Nutzers liegt nur ein API-Key, nie ein Wallet-Key. Belegt im Harness: vom Aufruf `start_automaton` bis zum ersten Turn der Runtime in der Sandbox ohne Browser außer dem nachgebildeten Handoff. Widerlegt, wenn ein Tool das Tageslimit ohne Handoff erhöhen kann · 05 Ein- und Auszahlung live: Voraussetzung konto 04; HTC durchläuft die Firmenprüfung beim Euro-Anbieter aus konto 01 (Human Gate `security_settings`), und Matthias ändert Regel 10 für die Abbuchung im Hauptnetz. Dann Einzahlung per Karte über den Onramp des Anbieters direkt ins Konto des Kunden und Auszahlung per Tool `payout` oder als Regel (etwa alles über 20 USDC jeden Montag) an die feste Auszahladresse des Kunden, freigegeben durch eine zweite Erlaubnis, die nur an diese Adresse geht; die erste Auszahlung führt über den Handoff zur Identitätsprüfung des Anbieters. Credits bleiben unauszahlbar (Regel 10), ausgezahlt wird nur Geld auf dem Konto des Kunden. Widerlegt, wenn eine Auszahlung an eine andere Adresse als die feste des Kunden durchgeht Dazu zeigt das Terminal den QR-Code so, dass eine Handykamera ihn auch im dunklen Terminal liest (Standard von Claude Code), geprüft mit `jsQR` und `inversionAttempts: "dontInvert"` in genau der Darstellung, die das Terminal bekommt; `qr` aus `POST /v1/handoff` wird daran angepasst. Übernimmt goals/_vorschlaege/konto-kritik-2026-11-13-2.md |
| 1 | **relay** | Automatons schreiben sich wieder: Die Runtime hat einen fertigen Client für signierte Nachrichten (`src/social/` am Pin), Conways Relay `social.conway.tech` ist tot, und wir antworten auf `/v1/messages` mit 501. Ein Grund mehr, `conwayApiUrl` auf uns zu stellen (Matthias 13.11.2026: fast track) | keine | 01 Das Social-Relay der Runtime: `docs/relay/vertrag.md` hält mit Fundstellen fest, was die Runtime am Pin `d8f8168` sendet und liest (`POST /v1/messages` mit Signatur über `Conway:send:{to}:{keccak256(content)}:{signed_at}`, `/v1/messages/poll` mit `Conway:poll:{address}:{timestamp}`, `/v1/messages/count`, Grenzen 64 KB je Nachricht und 100 je Stunde), und das Control Plane beantwortet diese Endpunkte danach statt mit 501: Signatur und Nonce geprüft (kein Replay), dieselben Endpunkte auch mit API-Key für Konten ohne Wallet, beim Empfänger als ungeprüfter Absender gekennzeichnet; eine Nachricht an eine Adresse, mit der der Absender noch keinen Kontakt hatte, kostet Credits nach einem Preis, den das Goal festlegt und begründet. Belegt im Harness mit zwei unveränderten Runtimes, die sich eine Nachricht schicken. Widerlegt, wenn die unveränderte Runtime mit `socialRelayUrl` auf uns eine Nachricht nicht zustellt oder eine Nachricht mit fremder Signatur angenommen wird · 02 Jede Nachricht zählt genau einmal und braucht ein Gegenüber: `src/relay/routes.ts` normalisiert die Signatur vor Lookup und Speichern (Kleinschreibung, 65 Byte, `s` in der unteren Hälfte, sonst 401), und eine Nachricht mit `to` gleich Absender bekommt 400 mit Klartext; Tests mit der großgeschriebenen und der gespiegelten Form einer schon angenommenen Signatur und mit einer Nachricht an sich selbst, rot vor dem Fix. Widerlegt, wenn die großgeschriebene Form einer angenommenen Signatur schon heute abgelehnt wird. Übernimmt goals/_vorschlaege/relay-kritik-2026-11-13-1.md und goals/_vorschlaege/relay-kritik-2026-11-13-2.md · 03 Feste Signaturen halten die Grenze: `test/relay-signature.test.ts` prüft `canonicalSignature` (`src/relay/signature.ts`) mit einer Tabelle fester Signaturen statt zufälliger Wallets: `s` gleich `n / 2` angenommen, `n / 2 + 1` abgelehnt, `s` gleich 0 abgelehnt, Präfix `0X` und 132 Hex-Zeichen abgelehnt, `v` als 27, 28, 0 und 1 mit derselben einen Form für 0 und 27 sowie 1 und 28; dazu ein `poll` mit `X-Signature` und `v` als 0 oder 1, der dieselbe Antwort bekommt wie der erste `poll`. Jeder Fall ist rot gegen eine Mutation der Grenze (`s >= HALF_N`, kein Abweis von `s` gleich 0, `/i` am Muster). Nur Tests, kein Rollout, solange kein Fall einen Fehler im Dienst zeigt. Widerlegt, wenn die Mutation `s >= HALF_N` die Tests aus relay 02 schon heute rot macht. Übernimmt goals/_vorschlaege/relay-kritik-2026-11-14-1.md · 04 Antworten an Konten ohne Wallet nur bei Bedarf: Die Runtime am Pin kann einer Kennung `key:…` nicht antworten (`validateMessage` verlangt eine EVM- oder Solana-Adresse, `docs/relay/vertrag.md`, Abschnitt Ungeprüfte Absender). Zuerst zählt ein Werkzeug unter `ops/` aus dem Ledger der Produktion (nur lesen, `readonly: true`) die Zeilen `relay` eines Versands mit API-Key und die Zahl der Konten dahinter, nur Summen, mit Selbsttest ohne Netz in beide Richtungen; die Zahl steht samt Befehl in `docs/relay/vertrag.md`, die Entscheidung in `goals/relay/ANNAHMEN.md`. Ab einem Konto hängt der Writer ein Glied an, das solchen Konten eine Antwortadresse gibt (eine EVM-Adresse, die das Relay für das Konto führt und auf seine Kennung abbildet); bei 0 bleibt der Vertrag, wie er ist. Startet frühestens am 21.11.2026, eine Woche nach dem Rollout von relay 02. Widerlegt, wenn die Zählung 0 ergibt; dann entfällt die Antwortadresse. Übernimmt goals/_vorschlaege/relay-nacharbeit-2026-11-13-1.md |
| 1 | **abrechnung** | Jede Antwort genau einmal und nur, wenn sie beim Kunden ankommt, und weniger Antworten, die gar nicht erst ankommen | keine | 01 Keine Abbuchung ohne angekommene Antwort · 02 Schnellere Anbieter über das Provider-Routing · 03 Timeout-Quote vorher und nachher auf derselben Grundlage: beide Messungen über denselben Zeitraum nebeneinander (`ops/timeout-quote.sh` mit Caddy-Join und mit `--since-rollout`), die Abweichung mit ihren Ursachen (Wiederholungen, die der Coalescer bedient; Uhr des Dienstes erst nach Auth und Reservierung) in `docs/abrechnung/timeouts.md`, bevor kanal oder die Seite eine Quote nennt; dazu die gemessene Summe der berechneten Abbrüche vom 10.11.2026 aus abrechnung 01 mit ihrem Befehl in `docs/abrechnung/` und `docs/kette.md` statt der ungemessenen 0,37 USD (den Satz in `LOOP.md` ändert nur ein Mensch). Widerlegt, wenn beide Messungen über denselben Zeitraum gleich zählen. Übernimmt goals/_vorschlaege/abrechnung-kritik-2026-11-10-3.md und goals/_vorschlaege/abrechnung-kritik-2026-11-10-2.md · 04 Einkauf abgebrochener Anfragen gegen die Abrechnung des Anbieters: die Zeilen mit `answered = 0` je Tag und Modell gegen die Aktivität bei OpenRouter (nur lesend), der Einkauf eines Abbruchs aus dieser Abrechnung statt 0, Timeout-Quote und Anbieterwahl rechnen mit dieser Kostenzahl. Widerlegt, wenn die Aktivität des Anbieters je Tag und Modell schon gleich dem Einkauf in Ledger und `inference_aborts` ist. Übernimmt goals/_vorschlaege/abrechnung-kritik-2026-11-10-1.md · 05 Quote nach außen nach sieben Tagen: zuerst skaliert `--compare` (sortierter Abgleich im gleitenden Fenster statt jeder Anfrage gegen jede Zeile, kein `Math.max(...)` über die Liste, Selftest mit 200000 gepflanzten Zeilen unter 10 s) und rechnet sich unabhängig gegen (Spalte `caddy` gegen `--join`, Spalte `service` gegen `--rows` über denselben Zeitraum, Exit 3 bei Abweichung statt der Summenprobe, die nie greift); dann `--compare` vom Rollout von abrechnung 02 (10.11.2026 20:27:18 UTC) bis 17.11.2026 23:59:59 UTC und in `docs/abrechnung/timeouts.md` genau eine Zeile `Quote nach außen:` mit Zahl, Zeitraum und Anfragen oder mit Grund für weiter keine. Startet frühestens am 18.11.2026. Widerlegt, wenn der Vergleich über die sieben Tage nicht gleich zählt und die Gegenrechnung die Abweichung keiner Ursache zuordnen kann. Übernimmt goals/_vorschlaege/abrechnung-kritik-2026-11-10-4.md, -5.md und -6.md |
| 3 | **domains** | Die Domain-Endpunkte, die ein fremder Automaton beim Start seines Dienstes mit 404 traf | sandbox 01 | 01 Die Domain-Endpunkte der Runtime · 02 Die Live-Prüfung belegt, dass die Domain-Suche antwortet: `ops/live.sh` ruft `/v1/domains/search` zusätzlich mit dem Schlüssel der eigenen Adresse aus sandbox 03 (`LIVE_SANDBOX_KEY`) und prüft Status 200 und die Felder der Antwort nach dem Vertrag der Runtime, nur lesend, ohne Kauf; der Selbsttest macht 404, 401 mit Schlüssel und eine Antwort ohne diese Felder rot. Startet nach sandbox 03. Widerlegt, wenn `ops/live.sh` schon heute eine Antwort des Handlers prüft. Übernimmt goals/_vorschlaege/domains-kritik-2026-11-11-2.md · 03 Die Live-Prüfung meldet die Sandbox nicht falsch rot und lässt keinen Schlüssel liegen: `ops/live.sh` wartet nach `changed=1` von `ops/sandbox/setup.sh --client-key`, bis ein Abrechnungstakt nach dem neuen Schlüssel vergangen ist (mehr als 60 s, `RECHECK_MS` in `src/sandbox/service.ts`), bevor es anlegt, und legt die Dateien mit `LIVE_SANDBOX_KEY` in `domains_search_live` und `sandbox_live` in ein Verzeichnis aus `mktemp -d`, das ein `trap … EXIT INT TERM` in `live()` löscht; Selbsttest: ein Anlegen direkt nach `changed=1` ist rot, und ein schlafender `curl`, beendet mit `kill -TERM`, lässt das Verzeichnis leer. Der Dienst bleibt, wie er ist. Widerlegt, wenn beide Selbsttests schon vor dem Fix grün sind. Übernimmt goals/_vorschlaege/sandbox-kritik-2026-11-12-5.md und goals/_vorschlaege/domains-kritik-2026-11-13-1.md · 04 Die Live-Prüfung sagt, worauf sie wartet, und das Warten ist in der Produktion belegt: `ops/live.sh` gibt vor dem Warten nach `changed=1` die Zeile `WAIT sandbox: new client key, <n> s before the create` aus (Selbsttest rot vor dem Fix), und beim ersten Lauf mit `changed=1` belegen die Zeitstempel aus dem Log des Dienstes (`key not accepted`), dass die Anlage mehr als `RECHECK_MS` nach der letzten solchen Zeile kam; Ergebnis samt Dauer des ganzen Laufs unter `docs/`. Kommt bis zum Goal kein Schlüsselwechsel von selbst, löst das Goal einen für die eigene Adresse über `ops/sandbox/setup.sh --client-key` aus und begründet das in `goals/domains/ANNAHMEN.md`. Widerlegt, wenn der Lauf mit `changed=1` die Sandbox rot meldet. Übernimmt goals/_vorschlaege/domains-kritik-2026-11-13-2.md und goals/_vorschlaege/domains-kritik-2026-11-13-3.md · 05 Der Schlüssel-Reset sperrt keinen Kunden aus: `ops/sandbox/setup.sh --client-key-reset <address>` verweigert mit `SETUP CLIENT-KEY-RESET FAIL: foreign sandbox running`, ohne `cp.pub` zu verschieben, wenn `sandboxd` eine laufende Sandbox eines Kontos außerhalb von `src/bounties/ours.ts` kennt, und legt bei jedem Reset auf dem Sandbox-Server einen Timer an (`--restore-after <s>`, Standard 120, `systemd-run --on-active=<s>`), der `cp.pub.prev` zurück nach `cp.pub` legt, wenn `cp.pub` dann noch fehlt. Selbsttest mit beiden Fällen auf dem nachgebauten Sandbox-Server (fremde Sandbox läuft: FAIL und `cp.pub` unverändert; Timer abgelaufen ohne `--client-key`: `cp.pub` wieder da), rot vor dem Fix. Ändert nur `ops/sandbox/` und `ops/README.md`, der Dienst bleibt, wie er ist. Widerlegt, wenn der Selbsttest mit laufender fremder Sandbox schon heute FAIL meldet. Übernimmt goals/_vorschlaege/domains-kritik-2026-11-14-1.md |
| 3 | **kanal** | Automatons mit Anmelde- oder Zahlungsfehlern bei Conway finden uns: Antworten in den Issues des Upstream-Repos, vorbereitet vom Loop, gepostet erst nach Matthias' Freigabe | abrechnung 01 | 01 Antworten auf neue Conway-Issues vorbereiten · 02 Das Postwerkzeug postet nur den freigegebenen Text: eine gemeinsame Argument-Funktion für `ops/before-the-answers.py` und `ops/post-the-answers.py` (`--folder=<ordner>` wie `--folder <ordner>`, Exit 1 bei unbekanntem Argument) und `ops/post-the-answers.py --verify-posted`, das jeden Live-Kommentar aus `ops/posted-answers.log` mit seinem Entwurf vergleicht, vor dem nächsten `public_post`. Widerlegt, wenn `--verify-posted` die drei Kommentare vom 11.11.2026 anders beurteilt als der Abgleich von Hand. Übernimmt goals/_vorschlaege/kanal-kritik-2026-11-11-1.md und -2.md · 03 Zweite Runde Antworten und was die erste gebracht hat: neue Issues in `Conway-Research/automaton` mit Anmelde- oder Zahlungsfehlern seit dem letzten Eintrag in `ops/posted-answers.log`, je Issue eine geprüfte Antwort über die Werkzeuge aus kanal 01 und 02, gebündelt am Human Gate `public_post`; dazu als Summe ohne Adressen, wie viele neue Adressen mit Referrer `github.com/Conway-Research` seit den Posts vom 11.11.2026 sich angemeldet und gezahlt haben (Matthias 12.11.2026 im Feedback: alles, was neue zahlende Kunden bringt, hat Vorrang). Widerlegt, wenn die Posts vom 11.11.2026 binnen 14 Tagen keine Anmeldung mit diesem Referrer bringen; dann ist die nächste Runde kein Antwortpaket, sondern ein anderer Kanal · 04 Die Freigabe gilt nur für den freigegebenen Text: Der Trockenlauf von `ops/post-the-answers.py` druckt je Entwurf die ersten 12 Zeichen von `sha256` über `body_to_send`, die Schritte am Gate `public_post` nennen sie, und `--send` nimmt `--approved <n>:<sha12>,…` und postet nur bei gleichem Wert, sonst Exit 1 ohne POST; nach jedem POST liest das Werkzeug genau diesen Kommentar zurück und endet mit `DIFFERS` und Exit 1, wenn er nicht der gesendete Text ist; beide Skripte laden `answers_args` auch unter `python3 -I`. Test mit den Fakes aus `test/answers-folder.test.ts`: ein nach dem Trockenlauf geänderter Entwurf ergibt Exit 1 und keinen POST, rot vor dem Fix. Läuft vor dem nächsten `public_post`. Widerlegt, wenn ein nach dem Trockenlauf geänderter Entwurf schon heute nicht gesendet wird. Übernimmt goals/_vorschlaege/kanal-kritik-2026-11-12-1.md und goals/_vorschlaege/kanal-kritik-2026-11-12-2.md · 05 Urteil je Antwort, welche davon Automatons gebracht hat: `ops/github-yield.sh` liest die Issue-Nummer aus dem Pfad des Referrers und schreibt je Nummer eine Zeile `ISSUE <n>: <a> arrived, <b> signed in, <c> paid`, nur Summen, die Regel aus `goals/kanal/ertrag.md` gilt je Runde für deren Nummern statt für einen Zeitraum; Eigene Wallets zählen getrennt: Die Adresse der Anfrage beim ersten `POST /v1/auth/verify` einer Wallet wird gegen `ops/own-ips.txt` gehalten, die Summenzeile lautet `<w> new wallets (<o> ours), <p> paying (<q> ours)`, und die Zeilen je Issue zählen nur fremde. Fixture mit je einer Ankunft samt Anmeldung über eine Antwort der ersten und der zweiten Runde, jede zählt nur in ihrer Zeile, und einer Anmeldung von einer eigenen Adresse, die nur als `ours` zählt. Am 25.11.2026 das Urteil über beide Runden je Issue in `goals/kanal/ertrag.md`: welche Antwort Anmeldungen und Zahlungen brachte und ob die nächste Runde ein Antwortpaket oder ein anderer Kanal wird. Startet frühestens am 25.11.2026. Widerlegt, wenn die Zählung je Issue dieselben Summen ergibt wie heute und keine Anmeldung einer Runde zuordnet. Übernimmt goals/_vorschlaege/kanal-kritik-2026-11-12-3.md und goals/_vorschlaege/kanal-kritik-2026-11-12-4.md · 06 Matthias liest genau den Text, über den der Wert gerechnet ist: Der Trockenlauf von `ops/post-the-answers.py` druckt je Entwurf den vollen `body_to_send` zwischen `--- #<n> sha12 <wert> ---` und `--- end #<n> ---` statt der ersten 90 Zeichen, und die Schritte am Gate `public_post` nehmen Text und Wert aus genau dieser einen Ausgabe; der Kommentar über der Reihenfolge nennt die Sendezeile mit `--approved` wie der Docstring. Test in `test/answers-approved.test.ts`: der Block zwischen den Markern ist Byte für Byte `body_to_send` des Entwurfs, und `sha256` darüber (`node:crypto`) ist der Wert der Kopfzeile, rot vor dem Fix. Kein Rollout. Läuft vor der nächsten Runde Antworten am Gate `public_post`. Widerlegt, wenn der Trockenlauf schon heute den vollen Text druckt. Übernimmt goals/_vorschlaege/kanal-kritik-2026-11-13-1.md und goals/_vorschlaege/kanal-kritik-2026-11-13-2.md |
| 4 | **seite** | Wer aus einem Conway-Issue kommt, landet auf der Startseite und liest dort oben Reden und Bewerbungen für Menschen; den Umzug von Conway (`conwayApiUrl` auf `https://postyourprice.com`) findet er erst hinter „Agent stuck?“. Belegt am 10.11.2026: Sichtprüfung der Live-Seite bei 390 und 1440 px, eine Ankunft mit Referrer `Conway-Research/automaton/issues/435` auf `/` im Caddy-Zugriffslog seit 02.11. (Referer-Feld, eigene Adressen aus `ops/own-ips.txt` heraus), und die Entwürfe aus kanal 01 verlinken die Startseite. Bei der Budget-Stufe core startet dieses Topic nicht | keine | 01 SOLL-Bilder der Startseite für Conway-Umsteiger: unter `docs/soll/` je 390 und 1440 px, aus den Bausteinen der bestehenden Seite, der Umzug in einem Schritt oben, der Katalog für Menschen bleibt, Abnahme durch den Design Reviewer · 02 Die Startseite nennt den Umzug von Conway: 1:1 nach den Bildern aus seite 01, dazu die Messung neuer Adressen mit Referrer `github.com/Conway-Research`, die binnen 24 Stunden `/v1/auth/verify` erfolgreich aufrufen. Widerlegt, wenn 14 Tage nach dem Rollout Ankünfte aus Conway-Issues da sind und sich keine anmeldet. Beide übernehmen keinen Vorschlag · 03 Code auf Englisch (Grundregel 12, ein Regelbruch und keine Schönheit): die Umbenennungen aus den drei Vorschlägen, je Datei-Paar ein Commit. `VERTRAG` in `test/domains.test.ts` und `test/sandbox-api.test.ts` wird `CONTRACT_FILE`, die deutschen Kommentare dort englische Paraphrasen mit Verweis auf `docs/sandbox/vertrag.md`; die Arten `erfunden` und `eigene` werden `invented` und `own` in `ops/known-ips.txt`, `test/known-ips.test.ts` und der Tabelle in `ops/README.md`, die Kommentare in `.gitignore` englisch; `--pruefen`, `umzugBottom`, `"fehlt"`, `id="umzug"`, `data-soll="umzug"` und die Summenzeile von `ops/soll-assess.mjs` werden englisch (`--check`, `moveBottom`, `missing`, `move`, `soll: <n> pictures, move top …, <n> defects`) in `ops/soll-assess.mjs`, `ops/soll.mjs`, `ops/soll-live.mjs` und `src/public/index.html`. Die Seite sieht danach gleich aus, `ops/soll.mjs` meldet gegen die SOLL-Bilder aus seite 01 dieselben Werte; Doku für Matthias bleibt Deutsch. Widerlegt, wenn keiner der alten Namen am Kopf von `dev` noch in Code, Test oder Log-Zeile steht. Übernimmt goals/_vorschlaege/domains-nacharbeit-2026-11-13-1.md, goals/_vorschlaege/fehler-nacharbeit-2026-11-13-2.md und goals/_vorschlaege/seite-nacharbeit-2026-11-13-1.md |
| 5 | **adressen** | Keine Adresse eines Besuchers im öffentlichen Repo, auch nicht in den Logs seiner Actions und nicht ohne Sperre im Gate (`loop-constraints.md`, Grundregel 8; Schwere 4 aus der Triage vom 13.11.2026). Eigene Zeile statt Glied an fehler, weil das Glied an Matthias hängt und fehler sonst bis dahin stünde | keine | 01 Besucheradressen aus den Actions-Logs und im Gate gesperrt: Zuerst zählt das Goal, ohne eine Adresse auszugeben, wie viele fremde Adressen die Logs der sechs `deploy`-Läufe vom 10. bis 12.11.2026 enthalten (42879222074, 42895005251, 43164473390, 43260817090, 43277458881, 43322130930), und schreibt nur die Zahl in `docs/`. Dann löscht Matthias in einer Aufgabe am Human Gate `delete_data` diese Logs (`gh api -X DELETE repos/matthiashippe/control-plane/actions/runs/<id>/logs` je Lauf) und trägt `ops/fetcher-cache.tsv` in `deny_paths` von `gate.yaml` ein, das nur ein Mensch ändert; danach prüft das Goal mit Netz, dass keiner der sechs Läufe mehr ein Log liefert und `gate.yaml` auf `dev` den Eintrag trägt, und der nächste Drill des Loop Masters zeigt ihn. Widerlegt, wenn die Zählung 0 ergibt; dann entfällt das Löschen und es bleibt der Eintrag im Gate. Übernimmt goals/_vorschlaege/loop-triage-2026-11-13-1.md und goals/_vorschlaege/betrieb-redteam-2026-11-13-1.md |
| 5 | **messung** | Die Zahlen, an denen der Loop zahlende Kunden misst, zählen keine eigenen Anfragen und hängen nicht am Zufall: Eigene Adressen kommen nur aus `own_ips` (betrieb 03), und dass ein Neustart keine Anfrage verliert, belegt jeder Rollout selbst statt nur zufälliger Fremdverkehr. Eigene Zeile statt Glied an betrieb, weil betrieb 05 erst am 26.11.2026 startet | betrieb 04 | 01 Eigene Anfragen zählen nie als fremde: `ops/claim-keyless.sh` sourct `ops/own-ips.sh` und nimmt `own_ips` statt `ops/own-ips.txt` direkt zu lesen; Test mit nachgebautem `ssh` und einer Adresse nur in der Datei aus `CP_OWN_IPS_SEEN`, rot vor dem Fix. Widerlegt, wenn diese Adresse schon heute nicht als fremde zählt. Übernimmt goals/_vorschlaege/betrieb-kritik-2026-11-13-1.md · 02 Jeder Rollout belegt selbst, dass der Neustart keine Anfrage verliert: `ops/deploy-window.sh`, wie es `deploy.yml` heute schon aufruft, wartet selbst, bis 180 s seit dem Start des Containers vergangen sind, misst dann das ganze Fenster statt `PARTIAL` und meldet `BAD GATEWAY` größer 0 über den Alarmweg; dazu belegt ein Harness-Test mit dem echten `deploy/Caddyfile` vor einem Dienst, der neu startet, dass eine Probe alle 250 ms auf `GET /health` nur 200 bekommt und mindestens eine Antwort länger als 0,5 s gehalten wurde, rot ohne `lb_try_duration`. `.github/**` bleibt unverändert (`gate.yaml`). Widerlegt, wenn der Harness-Test auch ohne `lb_try_duration` grün ist. Übernimmt goals/_vorschlaege/betrieb-kritik-2026-11-13-2.md und goals/_vorschlaege/betrieb-kritik-2026-11-13-3.md · 03 Auch die Ankünfte der Startseite zählen keine eigenen Anfragen: Die gemeinsame Regel von `ops/landing-yield.sh` und `ops/github-yield.sh` (Log lesen, Adresse aus `client_ip` oder `remote_ip`, eigene Adressen über `own_ips` aus `ops/own-ips.sh` mit Abbruch bei leerer Liste, Referrer `Conway-Research` ohne Rücksicht auf Groß- und Kleinschreibung, Anmeldung per `POST /v1/auth/verify` mit 200) steht in einem Helfer unter `ops/`, den beide rufen; je Werkzeug bleiben Fenster, Frist und Ausgabe. Test mit leerer eigener Liste (beide brechen ab) und mit einer Adresse nur in der Datei aus `CP_OWN_IPS_SEEN` (zählt in beiden nicht als fremde), rot vor dem Fix für `ops/landing-yield.sh`; die Ausgaben beider Werkzeuge auf ihren bisherigen Fixtures bleiben gleich. Kein Rollout. Widerlegt, wenn `ops/landing-yield.sh` bei leerer eigener Liste schon heute abbricht. Übernimmt goals/_vorschlaege/seite-nacharbeit-2026-11-13-2.md |

## Abschlusskriterium

Ein fremder Automaton betreibt seinen Dienst bei uns: Eine Sandbox einer Adresse, die nicht uns gehört (`src/bounties/ours.ts`), ist über die
unveränderte Runtime angelegt, läuft auf dem Sandbox-Server und ist aus Credits bezahlt (eine Ledger-Zeile der Sandbox-Abrechnung
dieser Adresse in der Produktion; der Prüfbefehl entsteht mit sandbox 03). Gegen diese Zeile urteilt der Kurs-Check.

## Meilensteine

Jeder Meilenstein ist ein Prüfbefehl, kein Satz; die Befehle entstehen mit den Goals.

- Keine Abbuchung ohne angekommene Antwort: ein Test, der einen Abbruch vor der fertigen Antwort ohne Ledger-Zeile `inference`
  verlangt, und die Gutschrift der drei Fälle vom 10.11.2026 in der Produktion (`ops/live.sh`, abrechnung 01).
- Timeout-Quote: Anteil der Inferenz-Anfragen, die länger laufen als der Timeout der Runtime, vorher und nachher aus den eigenen Daten
  (abrechnung 02).
- Sandbox-Vertrag: jeder Endpunkt und jedes Feld, das die Runtime am Pin `d8f8168` bei Conway für Sandboxes und Domains aufruft, mit
  Fundstelle (sandbox 01).
- Erste Sandbox: Die unveränderte Runtime legt im Harness eine Sandbox an, führt darin aus und wird abgerechnet (sandbox 04).
- Erste fremde Sandbox: Abschlusskriterium oben.

## Zielzahlen

Die Zahlen aus `ZIELE.md` (neu geschrieben am 29.09.2026, gemessen von `ops/ziele.sh` gegen die Produktion, nie aus einer Datei)
bleiben stehen; `ZIELE.md` ist mit dem Verkehr der Produktion die Quelle für das Nachfüllen der Kette (`LOOP.md`).

| Bis | Ziel | Die Zahl |
|---|---|---|
| 02.10. | Ein Mensch kann ohne Wallet kaufen | erreicht am 30.09.2026, 03:07 UTC |
| 10.10. | Der erste zahlende Mensch, mindestens 11 EUR | `human_orders_paid_30d` ≥ 1 |
| 31.10. | Zehn zahlende Menschen, 500 EUR im Monat | `human_buyers_30d` ≥ 10, `human_revenue_30d_cents` ≥ 50.000 |
| 31.12. | 5.000 EUR im Monat, und mindestens ein fremder Agent liefert | `human_revenue_30d_cents` ≥ 500.000, `foreign_submissions_30d` ≥ 1 |

Was am 10.11.2026 tatsächlich zahlt, sind Automatons, nicht Menschen: 6 registrierte Automatons, davon 4 fremde, 8 Zahlungen über
zusammen 36 USDC. Deshalb führt diese Kette die Seite, die zahlt (Abrechnung, Sandboxes, Domains, Kanal), und die Ziele für Menschen
aus `ZIELE.md` bleiben die Messlatte, an der der Kurs-Check und das Nachfüllen sie messen. Die Begründung dafür steht unten in der
Roadmap vom 29.09.2026, Abschnitt „Die Wette, in einem Satz“: Die Inferenzseite finanziert, und genau dort kommen die fremden
Kunden heute an.

## Begründung: die Roadmap vom 29.09.2026

Unverändert übernommen, nur die Überschriften eine Stufe tiefer. Sie ist die Herleitung der Richtung, kein Plan, dem gefolgt wird.

### Roadmap: Produkt und Go-to-Market

> Angelegt am 29.09.2026, weil Matthias gefragt hat, wo sie liegt, und die ehrliche Antwort
> "nirgends" war. Es gab Ziele (`ZIELE.md`), ein aktives Goal (`GOAL.md`), dreizehn abgeschlossene
> (`goals/`) und einen Zyklus (`loop-dauerauftrag.md`). Was fehlte, war der Satz dazwischen: was in
> welcher Reihenfolge gebaut wird und warum, ueber einen Zyklus hinaus.
>
> Diese Datei ist kein Plan, dem gefolgt wird, bis er stimmt. Sie ist eine Wette mit einem
> Ablaufdatum je Zeile, und jede Zeile nennt die Messung, die sie widerlegt.

### Wie hier gearbeitet wird

**Keine Sprints, kein Backlog, kein Schaetzen.** Ein Ziel gleichzeitig, fortlaufend. Das ist naeher
an Kanban mit WIP 1 als an Scrum, und es ist so gewachsen, nicht so entworfen.

Der Zyklus steht in `loop-dauerauftrag.md` und hat vier Schritte:

0. **Ziele messen.** `ops/ziele.sh` und `ops/sperren.sh`, gegen die Produktion, nie gegen eine
   Datei. Exit 0 heisst fertig, und erst dann hoert der Loop auf.
1. **Hinsehen.** Verkehr, Gesundheit, jeder 4xx und 5xx, den ein echter Nutzer gesehen hat.
2. **Das eine tun, das am meisten bringt.** Es muss auf eine der sechs Zielzahlen zeigen. Tut es
   das nicht, ist es Reparatur, und Reparatur geht nur vor, wenn jemand gegen eine Wand gelaufen
   ist.
3. **Bauen, ausrollen, protokollieren.** `ops/deploy.sh` erzwingt Tests und E2E davor,
   `.scratch/gtm/nachtlauf.md` haelt fest, was war.

**Ein Goal gleichzeitig.** `GOAL.md` traegt genau eines, mit Abnahmekriterien, die gemessen und
nicht behauptet werden. Ist es durch, wandert es nach `goals/` und das naechste wird geschrieben.
Am 29.09. war das Goal 18.

**Woher die Arbeit kommt.** Aus drei Quellen, in dieser Reihenfolge: ein Fehler, den ein echter
Nutzer gesehen hat; eine Zielzahl, die klemmt; ein Ultracode-Schwarm, der Vorschlaege ableitet und
sie drei Skeptiker-Linsen vorwirft. Am 23.09. haben von 30 abgeleiteten Vorschlaegen **null** den
Skeptiker ueberstanden, und der Plan wurde aus den Ablehnungsbegruendungen gebaut statt aus den
Vorlagen. Das ist der Normalfall, nicht der Ausrutscher.

**Was nie passiert:** ein Deploy ohne gruene Tests, eine Messung ohne Gegenprobe in beide
Richtungen, eine Zahl in einem Bericht, die nicht rot werden kann.

### Die vier Termine, an denen gemessen wird

Sie stehen in `ZIELE.md` und werden hier nicht wiederholt. Kurz: 26.09. (verstrichen, nicht
erreicht), 02.10. (zur Haelfte erfuellt), 29.10., 31.12. Die eine Zahl, wenn nur eine bliebe, ist
`foreign_gmv_30d`, und sie steht auf 0.

### Die Vision: Fiverr fuer Agenten

Matthias am 29.09.: *"wir wollen ja im endeffekt das fiverr nur fuer agents bauen. die agents
bedienen die eine seite und die menschen die andere. die value proposition vor fiverr ist insane:
extrem schnelle delivery und man kann es aussuchen, ausserdem gibt es bieterkampf und man macht es
guenstiger."*

**Die drei Versprechen, gemessen am 29.09., und keines ist eingeloest.**

| Versprechen | Stand | Gemessen an |
|---|---|---|
| Lieferung in Minuten statt Tagen | nie gegen einen Fremden gemessen | 36 Auftraege mit Lieferung, Median 0,2 s, und das ist unser eigenes Pruefskript. Oberhalb der 1-Cent-Aussaat: 15,7 s, 207,5 s, und zweimal 20,8 Stunden. Fremde Lieferungen: 0 |
| Auswahl aus mehreren Arbeiten | **1 von 36**, also 2,8 % | 35 Auftraege bekamen genau eine Einsendung, einer zwei |
| Preisdruck durch Gebote | **nicht gebaut** | `submitWork()` nimmt `{bountyId, agent, body}` und keinen Preis. Der Preis steht beim Ausschreiben fest und aendert sich nie |

**Was das Vorbild anders macht, und es ist der wichtigste Satz dieser Datei.** Fiverrs
Geschaeftsbericht 2025 (SEC 20-F, CIK 0001762301) beschreibt den Kaeuferweg woertlich als *"an
e-commerce experience that is designed for streamlined browsing, searching and purchasing"*. Es
gibt dort keine Ausschreibung, kein Warten und keine Gebote. **Die Auswahl passiert vor der
Bestellung, nicht danach.** Der Bieterkampf ist der Teil der Vision, den Fiverr nie hatte.

Und zwei Zahlen aus demselben Bericht, die die Richtung drehen: Fiverrs Serviceumsatz, also
Anzeigen und Abos **an die Anbieterseite**, war 2025 **133,4 Mio USD, plus 50,9 Prozent, 31 Prozent
des Gesamtumsatzes**, waehrend der Marktplatz um 2,2 Prozent schrumpfte. Und *"buyers who spent
over $500 accounted for 66% of our marketplace revenue"*.

Bei uns ist es genauso herum: die einzigen zwei zahlenden Fremden sind **Agenten**, sie haben
15,02 USD fuer Inferenz eingezahlt und das Brett null Mal geoeffnet. **Die Anbieterseite zahlt
schon, die Nachfrageseite ist die Wette.**

### Die Umkehrung, 29.09. nachmittags

Matthias: *"waere es nicht schlau, zuerst die Demand-Seite aufzubauen und im Zweifelsfall alles via
Agents selbst zu liefern?"*

**Das kehrt den Fehler um, den dieses Projekt seit zehn Tagen macht.** Wir bestuecken die
**Nachfrage**seite selbst: 44 von 47 Auftraegen kommen von unserer eigenen Wallet. Wir spielen den
Kaeufer und warten auf Agenten. Dabei ist bei uns das Angebot Software und die Nachfrage nicht,
also ist genau die Seite knapp, die wir uns selbst schenken, und die, die wir uns schenken
koennten, kaufen wir teuer ein.

`ops/compete.ts` gibt es seit dem 21.09.: ein Agent, der das Brett liest, seine eigene Inferenz
bezahlt und einsendet. Die Maschinerie fuer die Angebotsseite steht also. Was fehlt, ist ein
Kaeufer.

#### Was die Rechnung sagt

Eine Lieferung kostet uns im Median **0,5 Cent** Inferenz (82 Aufrufe gemessen, Spanne 0,001 bis
5,8 Cent). Drei Fassungen eines Auftrags kosten also 1,5 bis 17 Cent.

| Auftrag | Provision, 10 % | Selbst liefern | Faktor |
|---|---|---|---|
| 5 EUR | 0,50 EUR | 4,83 bis 4,99 EUR | 10 |
| 20 EUR | 2,00 EUR | 19,83 bis 19,98 EUR | 10 |
| 50 EUR | 5,00 EUR | 49,83 bis 49,98 EUR | 10 |

**Und die Anzeigenrechnung dreht sich.** Der Break-even faellt von **111 EUR auf 11,13 EUR** je
Auftrag, weil der Wert je Kunde nicht mehr zehn Prozent ist, sondern fast der ganze Preis. Ab
einem Auftrag von 20 EUR traegt ein Klick zu 10 Cent bei der heute gemessenen Konversion von 0,90
Prozent.

#### Was das fuer die Vertragsfrage heisst

Die Wahl vom Vormittag war **Marktplatz**, und sie war fuer den Fall richtig, dass ein fremder
Agent liefert. Wenn wir selbst liefern, sind wir **Verkaeufer** und schulden dem Kaeufer die
Arbeit. Beides nebeneinander, und die Reihenfolge ist die Umkehrung:

1. **Verkaeufer, solange wir liefern.** Ein gewoehnliches Stripe-Konto, kein Connect, keine
   Identitaet je Agent, keine Auszahlung. Damit faellt das groesste Stueck Arbeit aus dem
   kritischen Pfad.
2. **Marktplatz, sobald ein fremder Agent liefert.** Dann Connect, dann Provision, dann
   Auszahlung.

#### Was ehrlich bleiben muss

Wenn wir liefern, steht das da. Keine Seite, die von konkurrierenden Agenten spricht, waehrend
drei Prompts von uns antworten. **Das Versprechen traegt auch so:** Arbeit einstellen, in Minuten
drei fertige Fassungen bekommen, die beste bezahlen. Drei Fassungen aus drei verschiedenen
Modellen sind echte Auswahl, sie gehoeren nur uns, und das gehoert auf die Seite.

### Die Wette, in einem Satz

Der gemessene x402-Markt ist dreistellig im Monat (385 USDC von 38 Wallets bei Conway, gefallen
von 440 und 44). Die gemessene Nachfrage bei uns liegt vollstaendig auf der Inferenzseite: zwei
fremde Automatons, 36 Aufrufe, 15 USD eingezahlt, **null** Abrufe des Auftragsbretts.
**Also: die Inferenzseite finanziert, die Marktseite ist die Wette, und die Marktseite steht und
faellt mit dem Auftragswert.**

---

### Produkt

#### Jetzt (diese Woche)

- **Der Weg eines Ankoemmlings, ohne Reibung.** Am 29.09. end to end bewiesen: Schluessel ohne
  Wallet, Zuschuss feuert auf dem ersten Aufruf, der sich nicht bezahlen kann, und die Antwort
  nennt das Brett. Bleibt: was ein Ankoemmling zwischen Schluessel und erstem Verdienst noch nicht
  findet. **Messung:** `thinking_wallets.not_ours`, heute 2, Ziel 25 am 02.10.
- **Auffindbarkeit fuer Maschinen.** `/openapi.json` steht seit dem 29.09. und hat binnen einer
  Stunde eine neue Besucherklasse ausgeloest. Offen: ob A2A gebaut wird (siehe unten).
  **Messung:** Adressen, die zum ersten Mal die Bezahlroute anfragen.

#### Der Abbruch am Brett, gemessen am 29.09.

**31 fremde Adressen haben eine Marktseite geholt** (`/bounties.json`, `/jobs`, `/market`,
`/receipts`), nachdem die 41 Indexer-Durchlaeufe herausgerechnet sind, die jeden dokumentierten
Pfad abgehen. **29 von ihnen haben danach nichts getan.** Eine hat den Bezahlweg angesehen, eine
hat eingesendet.

Zwei Vorsichtsmassnahmen an dieser Zahl, weil die erste Fassung beide verletzt hat und 34
Einsender gemeldet haette: ein `POST /v1/submissions`, der 401 bekommt, ist keine Einsendung,
sondern ein Crawler auf der Liste; und wer 18 Requests auf 12 verschiedene Pfade macht, sieht sich
nicht den Markt an, sondern kartiert die API.

Was der Log **nicht** sagt: ob die 29 Menschen oder kleine Crawler waren. Die Zahl ist ein
Nenner, kein Beweis fuer verlorene Kaeufer.

#### Als Naechstes, und es haengt an einer Entscheidung

- **Der Auftragswert.** Die Anzeigenrechnung sagt: ein Auftrag muesste rund **111 EUR** wert sein,
  damit ein Klick zu 10 Cent sich bei heutiger Konversion traegt.

  **Korrigiert am 29.09.:** hier stand "45 bis 650 Cent", und das war falsch. In der
  Produktionsdatenbank nachgezaehlt sind es alle 47 Preise: 33-mal 1 Cent, dann 5, 5, 5, 12, 15,
  45, 50, 55, 65, 150, 150, 150, 200, 250. **Der teuerste Auftrag, den es je gab, war 2,50 EUR.**
  Der Abstand zu 111 EUR ist also Faktor 44 und nicht Faktor 17.

  Das ist kein Marketingproblem, sondern die Frage, welche Arbeit jemandem dreistellig wert ist
  und sich von mehreren Agenten parallel liefern laesst.
- **Ein Katalog statt eines Bretts.** Heute kann ein Mensch auf der Seite **nichts kaufen**: er
  kann ausschreiben und warten. Fiverrs Kaeuferweg ist der umgekehrte, die Auswahl passiert vor
  der Bestellung. Ein Katalogposten (Agent, Preis, Lieferzusage in Minuten, Beschreibung) macht
  aus vier Schritten vor dem ersten Ergebnis einen Klick, und er kann ohne Nachfrage existieren,
  waehrend ein Auftrag das nicht kann: deshalb sind 44 der 47 Ausschreibungen unsere.
  **Ohne Stripe testbar**, weil der Kaeuferzuschuss bis 50 Cent deckt. **Widerlegt durch:** zehn
  Posten stehen sieben Tage und kein Fremder kauft, dann ist die Bremse die Nachfrage.

- **A2A, oder ausdruecklich nicht.** `/.well-known/agent-card.json` wird 45-mal gesucht,
  `/.well-known/agent.json` 41-mal. Eine Karte ist eine Zusage der Schnittstellen, die man
  implementiert, und wir implementieren keine. Entweder A2A bauen oder die Absage stehen lassen,
  die seit dem 29.09. wenigstens sagt, was es stattdessen gibt. **Entscheidung, kein Zyklus.**
- **Die Katalogzeile.** Sie zeigt auf die Wallet eines Fremden. `/pay/{usd}` ohne Adresse ist
  gebaut; die Zeile aendert sich erst, wenn jemand darueber bezahlt. Gemessen am 29.09.: ein
  Verify katalogisiert nicht, nur eine angenommene Zahlung. **Nichts zu bauen, nur zu warten.**

#### Spaeter, und nur wenn die Marktseite lebt

Bewertungen der Lieferungen, Wiederholauftraege, Bestenliste der Agenten, Benachrichtigung bei
passenden Auftraegen, Webhooks. Alles davon setzt voraus, dass es ueberhaupt fremde Agenten und
fremde Kaeufer gibt, und beide Zahlen stehen auf 0. Vorher gebaut waere es Dekoration.

---

### Go-to-Market

#### Was belegt ist

**Ein Kanal hat je einen Leser gebracht: GitHub.** Drei Adressen kamen von einer github.com-Seite,
alle drei haben gelesen, zwei aus Issues, die wir beantwortet haben. Und eine Suche nach dem
eigenen Namen findet genau eine Stelle, naemlich unseren eigenen Kommentar vom 23.09. Am 29.09.
sind drei weitere Antworten raus (#353, #356, #359), die vierte folgt.

**Crawler finden uns.** Ein Dutzend x402-Indexer, dazu Googlebot (55 Requests), ClaudeBot (169),
Applebot, OpenAI SearchBot, DuckDuckBot. Gecrawlt ist nicht indexiert, und das sehen wir erst in
der Search Console.

#### Was gerechnet und verworfen ist

**Anzeigen, Stand 29.09.: Faktor 308 daneben.** Wert je Kunde 0,036 EUR gemessen, Kosten 11,10 EUR
bei 10 Cent je Klick und 0,90 Prozent Konversion. `ops/anzeigen-rechnung.py` rechnet das aus
Hauptbuch und Zugriffslog, laeuft in jedem `check-all` mit und **schlaegt von selbst um**, sobald
ein Kunde mehr ausgibt oder ein Auftrag mehr wert ist. Das ist Matthias' "regelmaessig challengen",
als Code statt als Vorsatz.

**Die Messe.** Am 23.09. abgelehnt: Ticket plus acht Stunden fuer eine Handvoll Gespraeche,
waehrend der belegte Kanal kostenlos offen liegt.

#### Was als Naechstes gemessen wird

| Woche | Frage | Messung | Heute |
|---|---|---|---|
| 29.09. | Bringen die Issue-Antworten Leser? | Referrer beim ERSTEN Request einer neuen Adresse | 3 Adressen bisher |
| 29.09. | Sind wir indexiert oder nur gecrawlt? | Search Console, im Browser | unbekannt |
| 06.10. | Traegt ein Kanal bei hoeherem Auftragswert? | `ops/anzeigen-rechnung.py` | Faktor 308 |
| 06.10. | Tippt ein Mensch freiwillig etwas ein? | `ops/first-typing.sh` | 0 |

---

### Was diese Roadmap widerlegen wuerde

- `foreign_gmv_30d` bewegt sich ohne einen einzigen hoeherwertigen Auftrag: dann ist der
  Auftragswert nicht das Nadeloehr und die Produktzeile oben ist falsch.
- Ein fremder Agent liefert auf einen Auftrag, ohne dass wir ihn dorthin gefuehrt haben: dann ist
  die Marktseite lebendiger als gemessen und die Reihenfolge dreht sich.
- Die Anzeigenrechnung schlaegt um: dann ist der Kanal offen und diese Datei muss neu geschrieben
  werden, nicht ergaenzt.
