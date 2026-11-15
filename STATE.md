# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 15.11.2026, 07:40 (Loop-Triage, PRO-21451). Stufe L3, Kill Switch aus, Budget core (2 von 11 Konten mit mindestens 20 %
Weekly-Rest), 5 von 14 Plätzen frei, Drill grün (14.11., 13:01, nach der Gate-Änderung 3f1ac20), Kurs-Check „auf Kurs“ (15.11.,
03:44, PRO-21390), bis zu zwei Goals parallel. Seit der letzten Triage gemergt: fehler 08 bis 10, messung 01 bis 06, relay 03,
domains 05 und 06, adressen 01 und 02, anmeldung 01, dazu 15 Reparaturen aus dem Audit vom 14.11., die Goal-Dateien von seite 03,
relay 04 und fehler 11 und die Nacharbeit vom 15.11. (PR #175). `deploy.yml` lief zuletzt am 15.11. um 06:53 grün (PR #175), davor
für messung 06 (03:15). Das Audit vom 15.11. ist noch nicht auf `dev`.

Stillstand: Seit dem Merge von messung 06 (03:15) baut kein Goal. Unter Budget core starten nur Topics mit Prio 1 bis 3, anmeldung
(Prio 6) und messung (Prio 5) warten deshalb. Der Roadmap-PR #176 des Tech Leads (PRO-21463: anmeldung Prio 1, messung Prio 2,
domains 07, konto 04 Englisch) ist seit 06:32 grün, ein Merge-Auftrag fehlt, weil der Loop Master control-plane im letzten Takt aus
Zeitbudget nicht las (Load um 150); beim Tech Lead als Glied 1 von PRO-21518.

Guthaben beim Inferenz-Anbieter: Die Aufladung ist seit 12.11., 21:35 eingeschaltet (16 USD Schwelle, 25 USD Betrag,
`docs/betrieb/guthaben.md`); ob sie hielt, misst betrieb 05 ab 27.11. Diese Triage hat die Produktion nicht gelesen.

Entscheidung 30.10.2026: Inferenz wird wieder über OpenRouter verkauft, Matthias' Entscheidung. Notschalter:
`CP_OPENROUTER_RESALE=0` in `/opt/control-plane/.env`, danach Neustart des Containers.

Entscheidungen 10.11.2026 (Matthias): Sandboxes sind das nächste Produkt, als PoC auf einem eigenen kleinen Server, getrennt vom
Zahlungsdienst. Antworten, die beim Kunden nicht ankommen, berechnen wir nicht mehr. 12.11.2026: Neue zahlende Kunden und alles, was
die zahlenden hält, haben Vorrang (Topic betrieb); zwei Goals parallel. 13.11.2026: Fast track für sandbox, konto und relay; Regel 10
erlaubt on-chain nur auf Base Sepolia im Topic konto.

## Topics

| Topic | Goal | Status |
|---|---|---|
| fehler | 01 bis 10 | DONE (08 PR #120, 09 PR #139, 10 PR #154) |
| fehler | 11 Der Abgleich mit dem Fetcher-Cache läuft auch in CI | PAUSED (Kurs-Check 14.11., reine Testnacharbeit) |
| betrieb | 01 bis 04 | DONE (03 PR #79, 04 PR #96) |
| betrieb | 05 Die Aufladung ist belegt und bleibt passend | PLANNED, startet frühestens 27.11.2026 |
| sandbox | 01 bis 05 | DONE (05 PR #62) |
| sandbox | 06 Freigegebene Ports unter einer eigenen Domain | BLOCKED fachlich, abgelöst durch 07 |
| sandbox | 07 Freigegebene Ports ohne Warten auf Nachfrage | BLOCKED matthias, Gate `server_kauf` (PRO-20022, Draft-PR #100) |
| sandbox | 08 bis 10 | Glieder in `ROADMAP.md`, Datei fehlt; warten hinter sandbox 07 |
| konto | 01, 02 | DONE (01 PR #88, 02 PR #97) |
| konto | 03 Konto und Abbuchung auf Base Sepolia | BLOCKED matthias, Turnkey-Zugang und Test-Geld (PRO-20104, Draft-PR #104) |
| konto | 04, 05 | Glieder in `ROADMAP.md`, Datei fehlt; konto 04 nennt mit PR #176 die englischen Namen der Handy-Seite |
| relay | 01 bis 03 | DONE (02 PR #113, 03 PR #131) |
| relay | 04 Antworten an Konten ohne Wallet nur bei Bedarf | PLANNED, startet frühestens 21.11.2026 |
| domains | 01 bis 06 | DONE (04 PR #116, 05 PR #132, 06 PR #155) |
| domains | 07 Ein Neustart des Sandbox-Servers sperrt nach einem Schlüssel-Reset keinen Kunden aus | Glied im offenen PR #176 |
| abrechnung | 01 bis 04 | DONE |
| abrechnung | 05 Quote nach außen nach sieben Tagen | PLANNED, startet frühestens 18.11.2026 |
| kanal | 01 bis 04 | DONE (04 PR #106); Urteil über den Ertrag am 25.11. (`goals/kanal/ertrag.md`) |
| kanal | 05 Urteil je Antwort | PLANNED, startet frühestens 26.11.2026 |
| kanal | 06, 07 | Glieder in `ROADMAP.md`, laufen vor der nächsten Runde am Gate `public_post` |
| seite | 01, 02 | DONE |
| seite | 03 Code auf Englisch | PLANNED, wartet auf konto 03 |
| adressen | 01, 02 | DONE (01 PR #118, 02 PR #161) |
| messung | 01 bis 06 | DONE (01 PR #119, 02 PR #143, 03 PR #162, 04 PR #165, 05 PR #171, 06 PR #173) |
| messung | 07 bis 09 | Glieder in `ROADMAP.md`, Datei fehlt; 07 wartet auf Budget (Prio 5, mit PR #176 Prio 2) |
| anmeldung | 01 Ein Crawler leert die schlüssellose Anmeldung nicht für alle | DONE (PR #169) |
| anmeldung | 02 Die Zählung der Anmeldungen wird nie still blind | Glied in `ROADMAP.md`, Datei fehlt, wartet auf Budget (Prio 6, mit PR #176 Prio 1) |

## Human Inbox

- keine PR mit „Human Inbox“ (15.11. frisch abgefragt)
- zwei Human Gates offen, je eine Asana-Aufgabe: sandbox 07 `server_kauf` (Domain und Zonen-Token, seit 13.11., 21:02), konto 03
  (Turnkey-Zugang und Test-Geld auf Base Sepolia, seit 13.11., 23:21); das Gate `delete_data` von adressen 01 ist erledigt (DONE,
  PR #118)
- Gate-Abgleich: `gate.yaml` hat seit 3f1ac20 (14.11., 10:25) `ops/fetcher-cache.tsv` in `deny_paths`, damit ist die Lücke vom
  13.11. geschlossen; jede Pfadregel der Deny List aus `loop-constraints.md` hat einen Eintrag. `src/payments/**` und `src/auth/**`
  sind nur bedingt gesperrt (nur in einem Goal, dessen Datei sie nennt) und keine Pfadregel des Gates, das prüft Linse B; die
  Ausnahme Base Sepolia (Regel 10) nennt keinen Pfad im Repo.

## Watch List

- PR #176 grün ohne Merge-Auftrag; erst nach dem Merge bekommt der Writer anmeldung 02 und messung 07 (PRO-21518, Glied 1)
- Kurs-Signal Detail-Anteil 62,5 % (20 von 32 Maker-Runs in 24 Stunden, Schwelle 40 %); die Glieder aus der Nacharbeit vom 15.11.
  sind kleine Testglieder
- Exit 3 von `ops/deploy-window.sh` macht den Job in `deploy.yml:165` nicht rot; nur ein Mensch ändert `.github/**`, der Watchdog
  holt den Alarm nach (messung 06)
- Der Zähler der Actions-Logs (`ops/actions-log-addresses.sh --workflow deploy.yml`) läuft nur von Hand
- `LOOP.md:24` nennt noch die ungemessenen 0,37 USD; den Satz ändert nur ein Mensch
- `--join` und `--compare` teilen Filter und Zuordnung nicht (abrechnung-nacharbeit-2026-11-11-3); abrechnung 05 baut beide um
- Der Pin `sandboxd-base-pin` hält das Basis-Image gegen den Prune-Cron des Mitbewohners; fällt `fact image_pin` in
  `ops/sandbox/setup.sh --check` auf `no`, scheitert nach 24 Stunden jede Anlage einer Sandbox mit 501
- Audit vom 14.11. rot (19 Zeilen), 15 Reparaturen gemergt; das Audit vom 15.11. steht noch aus
- Upstream-Drift: `Conway-Research/automaton` gegen den Pin `d8f8168`

## Annahmen

- `goals/abrechnung/ANNAHMEN.md`: unter anderem „Quote nach außen noch keine“ bis abrechnung 05
- `goals/sandbox/ANNAHMEN.md`: Wildcard `*.postyourprice.com` nur bis zur eigenen Domain für freigegebene Ports (sandbox 07)
- `goals/konto/ANNAHMEN.md`: Turnkey für das Konto, Tagesgrenze über eine Coinbase Smart Wallet mit Spend Permission, Euro über Bridge
- `goals/anmeldung/01-ein-crawler-leert-die-schluessellose-anmeldung-nicht-fuer-alle.md`, Annahme des Tech Leads: `keys_left_today`
  mit unveränderter Formel (dazu PRO-21518, Glied 2)
- `goals/betrieb/ANNAHMEN.md`, `goals/fehler/ANNAHMEN.md`, `goals/domains/ANNAHMEN.md`, `goals/kanal/ANNAHMEN.md`,
  `goals/messung/ANNAHMEN.md`, `goals/relay/ANNAHMEN.md`, `goals/adressen/ANNAHMEN.md` und `goals/seite/ANNAHMEN.md`: Annahmen der
  Goals vom 12. bis 15.11.
