# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 18.11.2026, 06:10 (Loop-Triage, PRO-24867, `origin/dev` 90e20f7). Stufe L3, Kill Switch aus, Budget core (2 von 11 Konten
mit mindestens 20 % Weekly-Rest), 4 von 14 Plätzen frei, Drill grün (14.11., Gate-Hash e291578e5235), bis zu zwei Goals parallel.
Kurs-Check vom 18.11., 06:00 „auf Kurs“ (PRO-24859): Detail-Anteil 13,3 % (2 von 15 Maker-Runs in 24 Stunden, Schwelle 40 %), kein
Goal über dem doppelten Mittel von 3,18 Zyklen.

Seit der letzten Triage gemergt: hosting 01 (PR #230), hosting 02 (PR #240), konto 05 (PR #220), konto 06 (PR #247), konto 07
(PR #251), konto 08 (PR #257), konto 09 (PR #261), konto 10 (PR #264), konto 11 (PR #269), umzug 01 (PR #244), umzug 02 (PR #252),
umzug 03 (PR #268), anmeldung 05 (PR #259), abrechnung 05 (PR #266); dazu das Audit vom 17.11. (PR #242, 4 rote Zeilen) mit seiner
Reparatur (PR #245), die Kritik-PRs #204, #215, #219 und #241, die Nacharbeit vom 18.11. (PR #270), der Kurs-Check vom 17.11., 15:53
(PR #248, hosting 03 pausiert), die Nachfüllungen (PR #235, #254, #263), die Glieder der letzten Triage (PR #234), die Kette umzug
(PR #238), `CP_PUBLIC_URL` auf `automatonhost.com` (PR #255) und die Ausnahme Hauptnetz in Regel 10 (PR #236, Commit 5f77e64), alle
drei von Matthias.

Der Deploy läuft: `deploy.yml` rollte zuletzt 90e20f7 (konto 11) um 04:42 UTC aus, alle Läufe seit 17.11., 23:51 UTC grün; Merges
ohne Änderung am Laufzeitpfad übersprangen den Job `deploy`. Diese Triage hat die Produktion nicht gelesen.

Es baut kein Goal. sandbox 11 wartet bei Matthias (PRO-23235), die Kette ist leer: konto 12 hängt am Merge seiner Goal-Datei
(PR #271), hosting 04 bis 07 stehen hinter dem pausierten hosting 03, sandbox 12 hinter sandbox 11. Der nächste Nachfüll-Auftrag
kommt frühestens 18.11., 06:21. relay 04 startet frühestens 21.11., kanal 05 am 26.11., betrieb 05 am 27.11.

Guthaben beim Inferenz-Anbieter: Die Aufladung ist seit 12.11., 21:35 eingeschaltet (16 USD Schwelle, 25 USD Betrag,
`docs/betrieb/guthaben.md`); ob sie hielt, misst betrieb 05 ab 27.11.

Entscheidung 30.10.2026: Inferenz wird wieder über OpenRouter verkauft, Matthias' Entscheidung. Notschalter:
`CP_OPENROUTER_RESALE=0` in `/opt/control-plane/.env`, danach Neustart des Containers.

Entscheidungen 10.11.2026 (Matthias): Sandboxes sind das nächste Produkt, als PoC auf einem eigenen kleinen Server, getrennt vom
Zahlungsdienst. Antworten, die beim Kunden nicht ankommen, berechnen wir nicht mehr. 12.11.2026: Neue zahlende Kunden und alles, was
die zahlenden hält, haben Vorrang (Topic betrieb); zwei Goals parallel. 13.11.2026: Fast track für sandbox, konto und relay; Regel 10
erlaubt on-chain nur auf Base Sepolia im Topic konto. 17.11.2026: Nach außen heißt das Angebot Automatons, der Dienst zieht auf
`automatonhost.com` um (Topic umzug); Regel 10 erlaubt auf Base (chainId 8453) nur die Geldwege von konto 05, eingeschaltet allein
mit `CP_KONTO_MAINNET=1`, das nur Matthias setzt.

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
| sandbox | 11 Die Sandbox-Domain kommt auf die Public Suffix List | BLOCKED matthias auf `goal/sandbox-11` (PR #218, PRO-23235), Gates `public_post` und `server_kauf`; auf `dev` PLANNED |
| sandbox | 12 | Glied in `ROADMAP.md`, Datei fehlt; wartet auf sandbox 11 |
| konto | 01 bis 11 | DONE (04 PR #208, 05 PR #220, 06 PR #247, 07 PR #251, 08 PR #257, 09 PR #261, 10 PR #264, 11 PR #269) |
| konto | 12 Der Name des Kontos heißt im Code so | Goal-Datei in PR #271 (`loop/goal/konto-12`), wartet auf den Merge |
| hosting | 01, 02 | DONE (01 PR #230, 02 PR #240) |
| hosting | 03 Die Selbsttests im Sandbox-Weg laufen in `check` | PAUSED (Kurs-Check 17.11., 15:53, PR #248) |
| hosting | 04 bis 07 | Glieder in `ROADMAP.md`, Dateien fehlen; starten hinter hosting 03 |
| umzug | 01 bis 03 | DONE (01 PR #244, 02 PR #252, 03 PR #268) |
| relay | 01 bis 03 | DONE (02 PR #113, 03 PR #131) |
| relay | 04 Antworten an Konten ohne Wallet nur bei Bedarf | PLANNED, startet frühestens 21.11.2026 |
| anmeldung | 01 bis 05 | DONE (03 PR #194, 04 PR #203, 05 PR #259) |
| abrechnung | 01 bis 05 | DONE (05 PR #266) |
| domains | 01 bis 06 | DONE (04 PR #116, 05 PR #132, 06 PR #155) |
| domains | 07 Ein Neustart des Sandbox-Servers sperrt keinen Kunden aus | PAUSED (Kurs-Check 15.11., PR #186) |
| kanal | 01 bis 04 | DONE (04 PR #106); Urteil über den Ertrag am 25.11. (`goals/kanal/ertrag.md`) |
| kanal | 05 Urteil je Antwort | PLANNED, startet frühestens 26.11.2026 |
| kanal | 06, 07 | Glieder in `ROADMAP.md`, laufen vor der nächsten Runde am Gate `public_post` |
| seite | 01 bis 03 | DONE (03 PR #222) |
| adressen | 01 bis 03 | DONE (01 PR #118, 02 PR #161, 03 PR #224) |
| messung | 01 bis 10 | DONE (07 PR #184, 08 PR #205, 09 PR #216, 10 PR #223) |
| messung | 11, 12 | PAUSED (Kurs-Check 17.11., PRO-23529) |
| messung | 13, 14 | Glieder in `ROADMAP.md`, Dateien fehlen; starten hinter messung 12 |

## Human Inbox

- Kritik-PR #260 (anmeldung 05, zwei Vorschläge): Sein Kopf d193cfd stammt laut Loop Master aus keinem Lauf des Growth Lead,
  deshalb kein Merge-Auftrag, mergen kann nur ein Mensch.
- Ein Human Gate offen: sandbox 11 (Domain `sandboxhost.de` verlängern, dann den PR an die Public Suffix List freigeben, Asana
  1220586742457641 seit 17.11., 11:00); PRO-23235 steht in Stufe review. Das Gate von konto 05 ist erledigt (PR #220 gemergt, Regel 10
  mit Ausnahme Hauptnetz seit 5f77e64).
- Keine PR mit Kommentar „Human Inbox“ offen (`gh pr list --search "Human Inbox in:comments"` leer).
- Gate-Abgleich: `loop-constraints.md` änderte sich mit 5f77e64 (17.11., Ausnahme Hauptnetz in Regel 10), `gate.yaml` nicht. Die
  Ausnahme nennt wie die Ausnahme Base Sepolia keinen Pfad; jede Pfadregel der Deny List hat weiter ihren Eintrag in `deny_paths`,
  `src/payments/**` und `src/auth/**` sind nur bedingt gesperrt (prüft Linse B). Kein neuer Vorschlag.

## Watch List

- `loop-constraints.md:127` bindet Opus für Maker, Linsen und Kritik, Linse B (`qa-scope`) läuft weiter auf Sonnet
  (`paperclip/company/.paperclip.yaml:288` im code-host, d4aab78). Angleichen oder zurückstellen kann nur Matthias
  (loop-redteam-2026-11-17-1).
- Kette leer und vier Plätze frei: Die offenen Glieder hängen an hosting 03 (PAUSED), sandbox 11 (Matthias) und am Merge von PR #271
  (konto 12); ohne Nachfüllung oder Merge baut der Loop nichts
- Audit vom 18.11. weder auf `dev` noch als Branch (06:10); die Audits vom 16. und 17.11. waren rot, die 4 roten Zeilen vom 17.11.
  repariert PR #245
- Die Ausnahme Hauptnetz läuft nur mit `CP_KONTO_MAINNET=1`, das nur Matthias setzt; ob ein Widerruf auf der Kette wirklich
  durchgeht, belegt bisher nur ein nachgebauter Knoten (PRO-24877 Glied 4)
- Bridge dokumentiert kein Abschalten einer Auszahladresse; ob das Löschen des alten Bankkontos sie stilllegt, ist offen
  (konto-nacharbeit-2026-11-18-12), das Geld schützt schon der Widerruf aus konto 11
- Exit 3 von `ops/deploy-window.sh` macht den Job in `deploy.yml:165` nicht rot (nur `::warning::`); nur ein Mensch ändert
  `.github/**`, der Watchdog holt den Alarm nach (messung 06)
- Der Zähler der Actions-Logs (`ops/actions-log-addresses.sh --workflow deploy.yml`) läuft nur von Hand
- `LOOP.md:24` nennt noch die ungemessenen 0,37 USD; den Satz ändert nur ein Mensch
- Der Pin `sandboxd-base-pin` hält das Basis-Image gegen den Prune-Cron des Mitbewohners; fällt `fact image_pin` in
  `ops/sandbox/setup.sh --check` auf `no`, scheitert nach 24 Stunden jede Anlage einer Sandbox mit 501
- Die Domain der freigegebenen Ports steht nicht auf der Public Suffix List; sandbox 11 bereitet den Eintrag vor (Gate `public_post`)
- Upstream-Drift: `Conway-Research/automaton` steht am 18.11. auf dem Pin `d8f8168` (0 Commits voraus)

## Annahmen

- `goals/abrechnung/ANNAHMEN.md`: die Quote nach außen seit abrechnung 05 (`docs/abrechnung/timeouts.md`, Abschnitt „Nach sieben
  Tagen“)
- `goals/sandbox/ANNAHMEN.md`: Domain, Registrar, Token, Notschalter und Public Suffix List für freigegebene Ports (sandbox 07), dazu
  die Annahmen von sandbox 08 bis 10
- `goals/konto/ANNAHMEN.md`: Turnkey für das Konto, Tagesgrenze über eine Coinbase Smart Wallet mit Spend Permission, Euro über
  Bridge, dazu die Annahmen von konto 07 bis 11 und die Ablösungen durch konto 06, umzug 02 und umzug 03
- `goals/umzug/ANNAHMEN.md`: Umzug auf `automatonhost.com` (umzug 01 bis 03) samt ihren Ablösungen
- `goals/hosting/ANNAHMEN.md`: Sweep und lange Befehle (hosting 01 und 02)
- `goals/seite/ANNAHMEN.md`: Code auf Englisch, Entscheidung des Tech Lead zur Reihenfolge konto 04 vor seite 03 (Zeile 50)
- Goal-Dateien anmeldung 01 bis 05 (kein `ANNAHMEN.md` im Topic): `keys_left_today` nennt seit anmeldung 03 die freien Plätze der
  Grenze des Aufrufers
- `goals/betrieb/ANNAHMEN.md`, `goals/fehler/ANNAHMEN.md`, `goals/domains/ANNAHMEN.md`, `goals/kanal/ANNAHMEN.md`,
  `goals/messung/ANNAHMEN.md`, `goals/relay/ANNAHMEN.md` und `goals/adressen/ANNAHMEN.md`: Annahmen der Goals vom 12. bis 17.11.
