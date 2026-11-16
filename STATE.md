# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 16.11.2026, 06:10 (Loop-Triage, PRO-22455). Stufe L3, Kill Switch aus, Budget core (2 von 11 Konten mit mindestens 20 %
Weekly-Rest), 4 von 14 Plätzen frei, Drill grün (14.11., 13:01, Gate-Hash e291578e5235), Kurs-Check „auf Kurs“ (16.11., 03:00,
PRO-22336), bis zu zwei Goals parallel. Seit der letzten Triage gemergt: anmeldung 02 (PR #185) und 03 (PR #194), messung 07
(PR #184), konto 03 (PR #104), sandbox 07 (PR #100), das Audit vom 15.11. (PR #183) mit vier Reparaturen (PR #189 bis #192), der
Kurs-Check vom 15.11. (PR #186), die Goal-Dateien von domains 07, messung 08, anmeldung 03, konto 04 und sandbox 08 und die Kritik an
anmeldung 03 (PR #195).

Kein Rollout seit 16.11., 00:32 UTC: Der Zahlungsserver lehnt seit dem Umzug des code-host den Deploy-Schlüssel ab, `deploy.yml`
scheitert im Job `deploy` mit `Permission denied (publickey)` (sechs rote Läufe von c1d7f74 bis ebe2dd3, `plan`, `test` und `e2e`
grün). Der letzte grüne Rollout ist 2044f8b (15.11., 22:48 UTC). Damit laufen konto 03 und sandbox 07 noch nicht in der Produktion,
der Release-Auftrag konto 03 (PRO-22217) wartet. Das Human Gate dazu ist PRO-22331 (Schritte für Matthias stehen dort), die
Reparatur wartet in PRO-22338 und den sechs Reparatur-Issues am Kopf von `dev` (PRO-22218 bis PRO-22345, alle `blocked`).

Es baut kein Goal: sandbox 08 steht auf `BLOCKED matthias` (Punkt 7 braucht denselben Schlüssel), konto 04 wartet auf sandbox 08,
messung 08, seite 03 und adressen 03 warten auf Budget core (nur Prio 1 bis 3), die übrigen auf ihr Startdatum. Diese Triage hat die
Produktion nicht gelesen.

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
| sandbox | 07 Freigegebene Ports ohne Warten auf Nachfrage | DONE (PR #100), nicht ausgerollt |
| sandbox | 08 Ein ganzer Automaton läuft in einer Sandbox | BLOCKED matthias auf `goal/sandbox-08` (Draft-PR #197), Punkt 7 wartet auf den Schlüssel (PRO-22351) |
| sandbox | 09, 10 | Glieder in `ROADMAP.md`, Datei fehlt; warten hinter sandbox 08 |
| konto | 01 bis 03 | DONE (01 PR #88, 02 PR #97, 03 PR #104), 03 nicht ausgerollt |
| konto | 04 Die Terminal-Tools | PLANNED, wartet auf sandbox 08 |
| konto | 05 | Glied in `ROADMAP.md`, Datei fehlt |
| relay | 01 bis 03 | DONE (02 PR #113, 03 PR #131) |
| relay | 04 Antworten an Konten ohne Wallet nur bei Bedarf | PLANNED, startet frühestens 21.11.2026 |
| domains | 01 bis 06 | DONE (04 PR #116, 05 PR #132, 06 PR #155) |
| domains | 07 Ein Neustart des Sandbox-Servers sperrt keinen Kunden aus | PAUSED (Kurs-Check 15.11., PR #186) |
| abrechnung | 01 bis 04 | DONE |
| abrechnung | 05 Quote nach außen nach sieben Tagen | PLANNED, startet frühestens 18.11.2026 |
| kanal | 01 bis 04 | DONE (04 PR #106); Urteil über den Ertrag am 25.11. (`goals/kanal/ertrag.md`) |
| kanal | 05 Urteil je Antwort | PLANNED, startet frühestens 26.11.2026; PRO-22463 Glieder 3 und 4 ändern die Regel vorher |
| kanal | 06, 07 | Glieder in `ROADMAP.md`, laufen vor der nächsten Runde am Gate `public_post` |
| seite | 01, 02 | DONE |
| seite | 03 Code auf Englisch | PLANNED, wartet auf Budget core (Prio 4) |
| adressen | 01, 02 | DONE (01 PR #118, 02 PR #161) |
| adressen | 03 | Glied in `ROADMAP.md`, Datei fehlt, wartet auf Budget core (Prio 5) |
| messung | 01 bis 07 | DONE (01 PR #119, 02 PR #143, 03 PR #162, 04 PR #165, 05 PR #171, 06 PR #173, 07 PR #184) |
| messung | 08 Der Nenner der Anzeigen-Konversion | PLANNED, wartet auf Budget core (Prio 4) |
| messung | 09 | Glied in `ROADMAP.md`, Datei fehlt |
| anmeldung | 01 bis 03 | DONE (01 PR #169, 02 PR #185, 03 PR #194), 03 nicht ausgerollt |

## Human Inbox

- keine PR mit „Human Inbox“ (16.11. frisch abgefragt)
- ein Human Gate offen, eine Aufgabe für Matthias: Deploy-Schlüssel nach dem Umzug des code-host auf dem Zahlungsserver wieder
  zulassen (PRO-22331, Gate `security_settings`, seit 16.11., 01:49); sandbox 08 hängt an derselben Aufgabe (Asana 1220551812466503
  seit 16.11., 04:50, PRO-22408). Die Gates von sandbox 07 (`server_kauf`) und konto 03 (Turnkey und Test-Geld) sind erledigt, beide
  Goals DONE.
- Gate-Abgleich: `gate.yaml` und `loop-constraints.md` seit 3f1ac20 (14.11.) unverändert; jede Pfadregel der Deny List hat ihren
  Eintrag in `deny_paths`. `src/payments/**` und `src/auth/**` sind nur bedingt gesperrt und keine Pfadregel des Gates (prüft Linse
  B); die Ausnahme Base Sepolia (Regel 10) nennt keinen Pfad. Kein neuer Vorschlag.

## Watch List

- Kein Rollout seit 16.11., 00:32 UTC (Deploy-Schlüssel, PRO-22331); der erste grüne Lauf nach dem Handgriff rollt alle Merges seit
  2044f8b auf einmal aus, danach Live-Prüfung für konto 03 (PRO-22217) und sandbox 07
- Kurs-Signal Detail-Anteil 80 % (16 von 20 Maker-Runs in 24 Stunden, Schwelle 40 %), gestern 62,5 %
- Audit vom 16.11. weder auf `dev` noch als PR; die Audits vom 14. und 15.11. waren rot, ihre Reparaturen sind gemergt
- Nacharbeit vom 16.11. (PR #198, drei Vorschläge) noch offen; die nächste Triage entscheidet sie
- Exit 3 von `ops/deploy-window.sh` macht den Job in `deploy.yml:165` nicht rot (nur `::warning::`); nur ein Mensch ändert
  `.github/**`, der Watchdog holt den Alarm nach (messung 06)
- Der Zähler der Actions-Logs (`ops/actions-log-addresses.sh --workflow deploy.yml`) läuft nur von Hand
- `LOOP.md:24` nennt noch die ungemessenen 0,37 USD; den Satz ändert nur ein Mensch
- `--join` und `--compare` teilen Filter und Zuordnung nicht (abrechnung-nacharbeit-2026-11-11-3); abrechnung 05 baut beide um
- Der Pin `sandboxd-base-pin` hält das Basis-Image gegen den Prune-Cron des Mitbewohners; fällt `fact image_pin` in
  `ops/sandbox/setup.sh --check` auf `no`, scheitert nach 24 Stunden jede Anlage einer Sandbox mit 501
- Die Domain der freigegebenen Ports steht nicht auf der Public Suffix List (PRO-22463, Glied 9)
- Upstream-Drift: `Conway-Research/automaton` steht am 16.11. auf dem Pin `d8f8168` (0 Commits voraus)

## Annahmen

- `goals/abrechnung/ANNAHMEN.md`: unter anderem „Quote nach außen noch keine“ bis abrechnung 05
- `goals/sandbox/ANNAHMEN.md`: Domain, Registrar, Token, Notschalter und Public Suffix List für freigegebene Ports (sandbox 07)
- `goals/konto/ANNAHMEN.md`: Turnkey für das Konto, Tagesgrenze über eine Coinbase Smart Wallet mit Spend Permission, Euro über Bridge
- Goal-Dateien anmeldung 01 bis 03 (kein `ANNAHMEN.md` im Topic): `keys_left_today` nennt seit anmeldung 03 die freien Plätze der
  Grenze des Aufrufers
- `goals/betrieb/ANNAHMEN.md`, `goals/fehler/ANNAHMEN.md`, `goals/domains/ANNAHMEN.md`, `goals/kanal/ANNAHMEN.md`,
  `goals/messung/ANNAHMEN.md`, `goals/relay/ANNAHMEN.md`, `goals/adressen/ANNAHMEN.md` und `goals/seite/ANNAHMEN.md`: Annahmen der
  Goals vom 12. bis 16.11.
