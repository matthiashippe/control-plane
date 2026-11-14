# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 14.11.2026, 06:15 (Loop-Triage, PRO-20383). Stufe L3, Kill Switch aus, Budget full (3 von 11 Konten mit mindestens 20 %
Weekly-Rest), Drill grün (10.11.), Kurs-Check „auf Kurs“ (14.11., 05:24), bis zu zwei Goals parallel. Seit der letzten Triage
gemergt: sandbox 05, fehler 05 bis 07, betrieb 03 und 04, konto 01 und 02, relay 01 und 02, domains 03 und 04, kanal 04, dazu die
Goal-Dateien der Goals seitdem und acht Reparaturen aus dem Audit vom 13.11. sandbox 06 ist gemergt, steht aber auf `BLOCKED
fachlich` (Mindestzahl der Nachfrage); sandbox 07 löst es ab. `deploy.yml` lief zuletzt am 14.11. um 05:53 grün (PR #115), davor für
domains 04 (05:13), fehler 07 (02:44) und relay 02 (02:04). Die Audits vom 12. und 13.11. waren rot; die roten Zeilen repariert der
Loop, zwei davon sind Lesarten des Audits (loop-audit-2026-11-13-1 und -2, beim Tech Lead).

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
| fehler | 01 bis 07 | DONE (05 PR #75, 06 PR #91, 07 PR #114) |
| fehler | 08 Keine Prüfung in `check` hängt an Schreibweise oder Uhr | ACTIVE, Abschluss gemeldet, Kritik ohne neue Punkte (PRO-20361, PR #120) |
| betrieb | 01 bis 04 | DONE (03 PR #79, 04 PR #96) |
| betrieb | 05 Die Aufladung ist belegt und bleibt passend | PLANNED, startet frühestens 27.11.2026 |
| sandbox | 01 bis 05 | DONE (05 PR #62) |
| sandbox | 06 Freigegebene Ports unter einer eigenen Domain | BLOCKED fachlich, abgelöst durch 07 |
| sandbox | 07 Freigegebene Ports ohne Warten auf Nachfrage | BLOCKED matthias, Gate `server_kauf` (PRO-20022, Draft-PR #100) |
| sandbox | 08, 09 | Glieder in `ROADMAP.md`, Datei fehlt |
| konto | 01, 02 | DONE (01 PR #88, 02 PR #97) |
| konto | 03 Konto und Abbuchung auf Base Sepolia | BLOCKED matthias, Turnkey-Zugang und Test-Geld (PRO-20104, Draft-PR #104) |
| konto | 04, 05 | Glieder in `ROADMAP.md`, Datei fehlt |
| relay | 01, 02 | DONE (01 PR #102, 02 PR #113) |
| domains | 01 bis 04 | DONE (03 PR #103, 04 PR #116) |
| abrechnung | 01 bis 04 | DONE |
| abrechnung | 05 Quote nach außen nach sieben Tagen | PLANNED, startet frühestens 18.11.2026 |
| kanal | 01 bis 04 | DONE (04 PR #106); Urteil über den Ertrag am 25.11. (`goals/kanal/ertrag.md`) |
| kanal | 05 Urteil je Antwort | PLANNED, startet frühestens 26.11.2026 |
| seite | 01, 02 | DONE |
| adressen | 01 Besucheradressen aus den Actions-Logs und im Gate gesperrt | BLOCKED matthias, Gate `delete_data` (PRO-20298, Draft-PR #118) |
| messung | 01 Eigene Anfragen zählen nie als fremde | Abschluss gemeldet, Kritik ohne neue Punkte, in Prüfung (PRO-20314, PR #119) |
| messung | 02 Jeder Rollout belegt den Neustart | Glied in `ROADMAP.md`, Datei fehlt |

## Human Inbox

- keine PR mit „Human Inbox“
- drei Human Gates offen, je eine Asana-Aufgabe: sandbox 07 `server_kauf` (Domain und Zonen-Token, seit 13.11., 21:02), konto 03
  (Turnkey-Zugang und Test-Geld auf Base Sepolia, seit 13.11., 23:21), adressen 01 `delete_data` (Logs der sechs `deploy`-Läufe
  löschen und `ops/fetcher-cache.tsv` in `deny_paths`, seit 14.11., 03:32)
- Gate-Abgleich: `gate.yaml` (zuletzt efa72f5, 10.11.) hat `ops/fetcher-cache.tsv` weiter nicht in `deny_paths`; die Lücke trägt
  adressen 01 am Gate, sonst deckt jede Pfadregel aus `loop-constraints.md` ein Eintrag. Die Ausnahme Base Sepolia (Regel 10, 13.11.)
  nennt keinen Pfad im Repo.

## Watch List

- `ops/fetcher-cache.tsv` fehlt in `deny_paths` von `gate.yaml` (Grundregel 8); bis Matthias es mit adressen 01 einträgt, halten
  `.gitignore:16` und der Test aus fehler 04
- `LOOP.md:24` nennt noch die ungemessenen 0,37 USD; den Satz ändert nur ein Mensch
- `--join` und `--compare` teilen Filter und Zuordnung nicht (abrechnung-nacharbeit-2026-11-11-3); abrechnung 05 baut beide um
- Der Pin `sandboxd-base-pin` hält das Basis-Image gegen den Prune-Cron des Mitbewohners (domains 04 Punkt 6); fällt `fact image_pin`
  in `ops/sandbox/setup.sh --check` auf `no`, scheitert nach 24 Stunden jede Anlage einer Sandbox mit 501
- Audit rot an zwei Nächten in Folge; zwei Zeilen sind Lesarten des Audits (`grep -c` mit Erwartung 0, zweiter Befehl einer Zeile),
  beim Tech Lead als Glied 5 der Triage-Glieder 14.11.
- Upstream-Drift: `Conway-Research/automaton` gegen den Pin `d8f8168`, am 14.11. kein neuerer Commit

## Annahmen

- `goals/abrechnung/ANNAHMEN.md`: unter anderem „Quote nach außen noch keine“ bis abrechnung 05
- `goals/sandbox/ANNAHMEN.md`: Wildcard `*.postyourprice.com` nur bis zur eigenen Domain für freigegebene Ports (sandbox 07)
- `goals/konto/ANNAHMEN.md`: Turnkey für das Konto, Tagesgrenze über eine Coinbase Smart Wallet mit Spend Permission, Euro über Bridge
- `goals/betrieb/ANNAHMEN.md`, `goals/fehler/ANNAHMEN.md`, `goals/domains/ANNAHMEN.md`, `goals/kanal/ANNAHMEN.md`,
  `goals/relay/ANNAHMEN.md` und `goals/seite/ANNAHMEN.md`: Annahmen der Goals vom 12. bis 14.11.
