# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 17.11.2026, 06:30 (Loop-Triage, PRO-23655, `origin/dev` c7c4487). Stufe L3, Kill Switch aus, Budget core (2 von 11 Konten
mit mindestens 20 % Weekly-Rest), 5 von 14 Plätzen frei, Drill grün (14.11., 13:01, Gate-Hash e291578e5235), bis zu zwei Goals
parallel. Kurs-Check vom 17.11., 02:30 „abgedriftet“ (PRO-23529): Die beiden Prio-1-Goals konto 05 und sandbox 11 stehen am Human
Gate, und die freien Plätze gingen an messung 11 und 12 (Test-Härtung), die er auf `PAUSED` gesetzt hat; Detail-Anteil 51,5 % (17
von 33 Maker-Runs in 24 Stunden, Schwelle 40 %).

Seit der letzten Triage gemergt: anmeldung 04 (PR #203), messung 08 (PR #205), sandbox 08 (PR #197), sandbox 09 (PR #210), konto 04
(PR #208), sandbox 10 (PR #213), messung 09 (PR #216), seite 03 (PR #222), messung 10 (PR #223), adressen 03 (PR #224), das Audit vom
16.11. (PR #209) mit seiner Reparatur (PR #211), die Nacharbeit vom 16. und 17.11. (PR #198, #232), das Red Team vom 17.11. (PR #231),
der Kurs-Check vom 17.11. (PR #229), die Nachfüllung der Kette mit hosting 01 und 02, konto 06, messung 13 und 14 (PR #227) und die
Goal-Dateien von sandbox 09 bis 11, messung 09 bis 12, anmeldung 04, konto 05, adressen 03 und hosting 01.

Der Deploy läuft wieder: Seit 16.11., 08:12 UTC rollt `deploy.yml` aus (PRO-22331 erledigt), zuletzt 802b9d3 (seite 03) um 22:47 UTC;
die Merges danach änderten den Laufzeitpfad nicht (Job `deploy` übersprungen). Der Release-Auftrag konto 03 (PRO-22217) ist erledigt.
Diese Triage hat die Produktion nicht gelesen.

Es baut hosting 01 (PRO-23556, `goal/hosting-01`, PR #230): ein Sweep räumt Sandboxes gehosteter Automatons ab, die nicht laufen und
trotzdem abrechnen. konto 05 und sandbox 11 warten bei Matthias, abrechnung 05 startet frühestens am 18.11.

Guthaben beim Inferenz-Anbieter: Die Aufladung ist seit 12.11., 21:35 eingeschaltet (16 USD Schwelle, 25 USD Betrag,
`docs/betrieb/guthaben.md`); ob sie hielt, misst betrieb 05 ab 27.11.

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
| sandbox | 07 bis 10 | DONE (07 PR #100, 08 PR #197, 09 PR #210, 10 PR #213) |
| sandbox | 11 Die Sandbox-Domain kommt auf die Public Suffix List | BLOCKED matthias auf `goal/sandbox-11` (PR #218, PRO-23235), Gates `public_post` und `server_kauf` |
| konto | 01 bis 04 | DONE (01 PR #88, 02 PR #97, 03 PR #104, 04 PR #208) |
| konto | 05 Ein- und Auszahlung live | BLOCKED matthias auf `goal/konto-05` (PR #220, PRO-23251), Gate `security_settings` |
| konto | 06 | Glied in `ROADMAP.md` (PR #227), Datei fehlt; wartet auf konto 05 |
| hosting | 01 Keine Sandbox rechnet ohne laufenden Automaton ab | ACTIVE auf `goal/hosting-01` (PR #230, PRO-23556) |
| hosting | 02 | Glied in `ROADMAP.md` (PR #227), Datei fehlt |
| relay | 01 bis 03 | DONE (02 PR #113, 03 PR #131) |
| relay | 04 Antworten an Konten ohne Wallet nur bei Bedarf | PLANNED, startet frühestens 21.11.2026 |
| anmeldung | 01 bis 04 | DONE (01 PR #169, 02 PR #185, 03 PR #194, 04 PR #203) |
| abrechnung | 01 bis 04 | DONE |
| abrechnung | 05 Quote nach außen nach sieben Tagen | PLANNED, startet frühestens 18.11.2026 |
| domains | 01 bis 06 | DONE (04 PR #116, 05 PR #132, 06 PR #155) |
| domains | 07 Ein Neustart des Sandbox-Servers sperrt keinen Kunden aus | PAUSED (Kurs-Check 15.11., PR #186) |
| kanal | 01 bis 04 | DONE (04 PR #106); Urteil über den Ertrag am 25.11. (`goals/kanal/ertrag.md`) |
| kanal | 05 Urteil je Antwort | PLANNED, startet frühestens 26.11.2026 |
| kanal | 06, 07 | Glieder in `ROADMAP.md`, laufen vor der nächsten Runde am Gate `public_post` |
| seite | 01 bis 03 | DONE (03 PR #222) |
| adressen | 01 bis 03 | DONE (01 PR #118, 02 PR #161, 03 PR #224) |
| messung | 01 bis 10 | DONE (07 PR #184, 08 PR #205, 09 PR #216, 10 PR #223) |
| messung | 11, 12 | PAUSED (Kurs-Check 17.11., PRO-23529) |
| messung | 13, 14 | Glieder in `ROADMAP.md` (PR #227), Dateien fehlen; starten hinter messung 12 |

## Human Inbox

- PR #220 (konto 05): Das Gate gibt ihn nicht frei, weil keine Verdicts von K und B im PR liegen; ob gemergt oder geschlossen wird,
  entscheidet der Tech Lead (Kommentar vom 16.11., 22:10 UTC).
- Kritik-PRs #204 (anmeldung 04), #215 (sandbox 10) und #219 (sandbox 11): Ihre Köpfe stammen laut Loop Master aus keinem Lauf des
  Growth Lead, deshalb kein Merge-Auftrag, mergen kann nur ein Mensch. #215 und #219 legen beide
  `goals/_vorschlaege/sandbox-kritik-2026-11-16-3.md` mit verschiedenem Inhalt an; der zweite Merge hat einen Konflikt.
- Zwei Human Gates offen, je eine Aufgabe für Matthias: sandbox 11 (Domain `sandboxhost.de` verlängern, dann den PR an die Public
  Suffix List freigeben, Asana 1220586742457641 seit 16.11., 21:40) und konto 05 (Ausnahme Hauptnetz in Regel 10 von
  `loop-constraints.md` eintragen und die Anfrage an Bridge für HTC senden, Asana 1220589939196464 seit 16.11., 23:41). Das Gate zum
  Deploy-Schlüssel (PRO-22331) ist erledigt.
- Gate-Abgleich: `gate.yaml` und `loop-constraints.md` seit 3f1ac20 (14.11.) unverändert; jede Pfadregel der Deny List hat ihren
  Eintrag in `deny_paths`. `src/payments/**` und `src/auth/**` sind nur bedingt gesperrt und keine Pfadregel des Gates (prüft Linse
  B); die Ausnahme Base Sepolia (Regel 10) nennt keinen Pfad. Kein neuer Vorschlag.

## Watch List

- `loop-constraints.md:122` bindet Opus für Maker, Linsen und Kritik, Linse B (`qa-scope`) läuft seit 16.11., 09:13 UTC auf Sonnet
  (code-host 394f8bc); seitdem kamen neun Goals mit einem PASS von B auf Sonnet nach `dev`, jedes auch mit PASS von K auf Opus.
  Angleichen oder zurückstellen kann nur Matthias (loop-redteam-2026-11-17-1).
- Kurs „abgedriftet“ (PRO-23529), Detail-Anteil 51,5 %; beide Prio-1-Goals hängen an Matthias, solange laufen nur hosting 01 und
  ab 18.11. abrechnung 05
- Audit vom 17.11. weder auf `dev` noch als Branch; die Audits vom 15. und 16.11. waren rot (16.11.: 19 rote Zeilen, Reparatur PR #211
  gemergt, 18 davon grün)
- Der Loop Master meldet `ROADMAP.md` Zeile 23 (messung) mit 6 statt 5 Spalten, ein `|` im Text schneidet die Zeile ab; die Kette
  messung 13 und 14 kann er deshalb falsch lesen, beheben kann es der Writer
- konto 05 verlangt eine neue Ausnahme in Regel 10 für das Hauptnetz; bis Matthias sie einträgt, darf kein Code auf Base (chainId
  8453) senden
- Exit 3 von `ops/deploy-window.sh` macht den Job in `deploy.yml:165` nicht rot (nur `::warning::`); nur ein Mensch ändert
  `.github/**`, der Watchdog holt den Alarm nach (messung 06)
- Der Zähler der Actions-Logs (`ops/actions-log-addresses.sh --workflow deploy.yml`) läuft nur von Hand
- `LOOP.md:24` nennt noch die ungemessenen 0,37 USD; den Satz ändert nur ein Mensch
- `--join` und `--compare` teilen Filter und Zuordnung nicht (abrechnung-nacharbeit-2026-11-11-3); abrechnung 05 baut beide um
- Der Pin `sandboxd-base-pin` hält das Basis-Image gegen den Prune-Cron des Mitbewohners; fällt `fact image_pin` in
  `ops/sandbox/setup.sh --check` auf `no`, scheitert nach 24 Stunden jede Anlage einer Sandbox mit 501
- Die Domain der freigegebenen Ports steht nicht auf der Public Suffix List; sandbox 11 bereitet den Eintrag vor (Gate `public_post`)
- Upstream-Drift: `Conway-Research/automaton` steht am 17.11. auf dem Pin `d8f8168` (0 Commits voraus)

## Annahmen

- `goals/abrechnung/ANNAHMEN.md`: unter anderem „Quote nach außen noch keine“ bis abrechnung 05
- `goals/sandbox/ANNAHMEN.md`: Domain, Registrar, Token, Notschalter und Public Suffix List für freigegebene Ports (sandbox 07), dazu
  die Annahmen von sandbox 08 bis 10
- `goals/konto/ANNAHMEN.md`: Turnkey für das Konto, Tagesgrenze über eine Coinbase Smart Wallet mit Spend Permission, Euro über
  Bridge; die Ablösungen der alten Prüfbefehle mit `--pruefen` durch seite 03 (Zeilen 189 bis 200)
- `goals/seite/ANNAHMEN.md`: Code auf Englisch, Entscheidung des Tech Lead zur Reihenfolge konto 04 vor seite 03 (Zeile 50)
- Goal-Dateien anmeldung 01 bis 04 (kein `ANNAHMEN.md` im Topic): `keys_left_today` nennt seit anmeldung 03 die freien Plätze der
  Grenze des Aufrufers
- `goals/betrieb/ANNAHMEN.md`, `goals/fehler/ANNAHMEN.md`, `goals/domains/ANNAHMEN.md`, `goals/kanal/ANNAHMEN.md`,
  `goals/messung/ANNAHMEN.md`, `goals/relay/ANNAHMEN.md` und `goals/adressen/ANNAHMEN.md`: Annahmen der Goals vom 12. bis 17.11.
