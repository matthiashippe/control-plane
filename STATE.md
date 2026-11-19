# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 19.11.2026, 06:40 (Loop-Triage, PRO-25197, `origin/dev` 3e9375a). Stufe L3, Kill Switch aus, Budget full (4 von 11 Konten
mit mindestens 20 % Weekly-Rest), Drill grün (14.11., Gate-Hash e291578e5235). Seit 18.11., 20:40 läuft der Loop auf kleiner Flamme:
ein Goal gleichzeitig, `share: 1` (Matthias, PR #284), deshalb meldet der Status 0 von 14 Plätzen frei.

Kurs-Check vom 19.11., 06:22 „abgedriftet“ (PRO-25202): Detail-Anteil 50 % (3 von 6 Maker-Runs in 24 Stunden, Schwelle 40 %), alle
drei in der Audit-Reparatur PRO-25099 (PR #285, nur Doku und ANNAHMEN). Bis die Korrektur `loop/kurs/2026-11-19-0610` gemergt ist,
längstens bis 08:22, startet kein neues Goal. Ein Teil der 46 roten Zeilen des Audits vom 18.11. kam aus dem Audit selbst (Worktree am
Verdict-Commit ohne `node_modules`, `git show origin/dev` nicht ersetzt; loop-audit-2026-11-19-1 und -2, Glied 5 an den Tech Lead).

Seit der letzten Triage gemergt: konto 12 (PR #276), umzug 04 (PR #280), sandbox 11 als `BLOCKED fachlich` ohne Code (PR #218), die
Goal-Datei konto 13 (PR #282), das Audit vom 18.11. (PR #281, 46 rote Zeilen) samt Reparatur (PR #285), die Abgelöst-Zeilen des Tech
Lead (PRO-25107, PRO-25126), die Nacharbeit vom 19.11. (PR #287), die Glieder der letzten Triage (PR #273), dazu von Matthias die
kleine Flamme (PR #284) und sandbox 12 als Cookie-Schutz im Proxy statt PSL-Eintrag (PR #283).

Der Deploy läuft: `deploy.yml` grün für 61c7221, fe1291e und 3e9375a (19.11., 01:14 bis 05:25 UTC). Diese Triage hat die Produktion
nicht gelesen.

Es baut konto 13 (PRO-25121, PR #286, Checks grün). Die Goal-Datei sandbox 12 liegt in PR #288 und wartet auf den Merge. Das
Nachfüllen hängt: Es wartet seit 18.11., 06:33 auf `loop/roadmap/nachfuellen-2026-11-18-0633` (PR #275), der seit PR #273 im
Konflikt steht und dieselben Glieder anders formuliert (Glied 2 an den Tech Lead). relay 04 und abrechnung 06 starten frühestens
21.11., kanal 05 am 26.11., betrieb 05 am 27.11.

Das Konto ist in der Produktion aus (kein `CP_KONTO_*` auf dem Server laut konto 05), aber `README.md:13` verspricht den Start aus
Claude Code; kein Glied führt das Einschalten zu Matthias (konto-kritik-2026-11-18-4, Glied 1 an den Tech Lead).

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

18.11.2026: kleine Flamme, PropertyPilot braucht die Kapazität (ein Goal, `share: 1`); kein PR an die Public Suffix List, den Schutz
gegen Cookies über Sandbox-Grenzen baut sandbox 12 im eigenen Proxy.

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
| sandbox | 11 Die Sandbox-Domain kommt auf die Public Suffix List | BLOCKED fachlich (PR #218, 19.11.): Matthias gibt keinen PR an die PSL frei |
| sandbox | 12 Ein Cookie bleibt in seiner Sandbox | Goal-Datei in PR #288 (`loop/goal/sandbox-12`), wartet auf den Merge |
| konto | 01 bis 12 | DONE (05 PR #220, 06 PR #247, 07 PR #251, 08 PR #257, 09 PR #261, 10 PR #264, 11 PR #269, 12 PR #276) |
| konto | 13 Der Widerruf trifft nur die Erlaubnis, die der Kunde ablöst | ACTIVE (PRO-25121, PR #286) |
| konto | 14, 15 | Glieder in `ROADMAP.md`, Dateien fehlen |
| hosting | 01, 02 | DONE (01 PR #230, 02 PR #240) |
| hosting | 03 Die Selbsttests im Sandbox-Weg laufen in `check` | PAUSED (Kurs-Check 17.11., 15:53, PR #248) |
| hosting | 04 bis 07 | Glieder in `ROADMAP.md`, Dateien fehlen; starten hinter hosting 03 |
| umzug | 01 bis 04 | DONE (01 PR #244, 02 PR #252, 03 PR #268, 04 PR #280) |
| relay | 01 bis 03 | DONE (02 PR #113, 03 PR #131) |
| relay | 04 Antworten an Konten ohne Wallet nur bei Bedarf | PLANNED, startet frühestens 21.11.2026 |
| anmeldung | 01 bis 05 | DONE (03 PR #194, 04 PR #203, 05 PR #259) |
| abrechnung | 01 bis 05 | DONE (05 PR #266) |
| abrechnung | 06 Der Zeitraum der Quote stimmt | PLANNED, startet frühestens 21.11.2026 |
| abrechnung | 07 | Glied in `ROADMAP.md`, Datei fehlt |
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

- Keine PR mit Kommentar „Human Inbox“ offen (`gh pr list --search "Human Inbox in:comments"` leer), kein Human Gate offen; sandbox
  11 hat Matthias am 18.11. abgelehnt, die Asana-Aufgabe 1220586742457641 hat damit keinen Zweck mehr.
- Kritik-PR #260 (anmeldung 05, zwei Vorschläge): Sein Kopf d193cfd stammt laut Loop Master aus keinem Lauf des Growth Lead,
  deshalb kein Merge-Auftrag, mergen kann nur ein Mensch.
- Gate-Abgleich: `gate.yaml` und `loop-constraints.md` seit 5f77e64 (17.11.) unverändert, jede Pfadregel der Deny List hat ihren
  Eintrag in `deny_paths`. Kein neuer Vorschlag.

## Watch List

- `loop-constraints.md:127` bindet Opus für Maker, Linsen und Kritik, Linse B (`qa-scope`) läuft weiter auf Sonnet
  (`paperclip/company/.paperclip.yaml:288` im code-host). Angleichen oder zurückstellen kann nur Matthias
  (loop-redteam-2026-11-17-1).
- Nachfüllen hängt an PR #275 im Konflikt (Glied 2); ohne Merge von #288 oder neue Nachfüllung baut nach konto 13 nur, was ab 21.11.
  startet
- Audit vom 19.11. weder auf `dev` noch als Branch (06:40); drei rote Audits in Folge (16. bis 18.11.), das vom 18.11. teils aus dem
  Audit-Ablauf selbst (Glied 5)
- konto 12 Punkt 3 (kein Ansammeln von `exit`-Listenern) prüft nur der Prüfbefehl der Goal-Datei, kein Test unter `test/`
  (konto-nacharbeit-2026-11-19-1)
- Rückweg nach konto 12: Das alte Image kann `handoffs` nach der Umbenennung `automaton_name` zu `display_name` nicht lesen; bis Glied
  4 gemergt ist, braucht ein Rollback die Spalte von Hand zurück (konto-kritik-2026-11-18-5)
- Die Ausnahme Hauptnetz läuft nur mit `CP_KONTO_MAINNET=1`, das nur Matthias setzt; ob ein Widerruf auf der Kette wirklich
  durchgeht, belegt bisher nur ein nachgebauter Knoten (konto 15)
- Bridge dokumentiert kein Abschalten einer Auszahladresse; ob das Löschen des alten Bankkontos sie stilllegt, ist offen
  (konto-nacharbeit-2026-11-18-12), das Geld schützt schon der Widerruf aus konto 11
- Exit 3 von `ops/deploy-window.sh` macht den Job in `deploy.yml:165` nicht rot (nur `::warning::`); nur ein Mensch ändert
  `.github/**`, der Watchdog holt den Alarm nach (messung 06)
- Der Zähler der Actions-Logs (`ops/actions-log-addresses.sh --workflow deploy.yml`) läuft nur von Hand
- `LOOP.md:24` nennt noch die ungemessenen 0,37 USD; den Satz ändert nur ein Mensch
- Der Pin `sandboxd-base-pin` hält das Basis-Image gegen den Prune-Cron des Mitbewohners; fällt `fact image_pin` in
  `ops/sandbox/setup.sh --check` auf `no`, scheitert nach 24 Stunden jede Anlage einer Sandbox mit 501
- `ROADMAP.md` Zeile 18: 6 statt 5 Spalten, ein `|` im Text schneidet die Zeile ab (Hinweis des Loop Masters)

## Annahmen

- `goals/abrechnung/ANNAHMEN.md`: die Quote nach außen seit abrechnung 05 (`docs/abrechnung/timeouts.md`, Abschnitt „Nach sieben
  Tagen“)
- `goals/sandbox/ANNAHMEN.md`: Domain, Registrar, Token, Notschalter und Public Suffix List für freigegebene Ports (sandbox 07), die
  Annahmen von sandbox 08 bis 11
- `goals/konto/ANNAHMEN.md`: Turnkey für das Konto, Tagesgrenze über eine Coinbase Smart Wallet mit Spend Permission, Euro über
  Bridge, die Annahmen von konto 07 bis 12 und die Ablösungen durch konto 06, umzug 02 und umzug 03
- `goals/umzug/ANNAHMEN.md`: Umzug auf `automatonhost.com` (umzug 01 bis 04) samt ihren Ablösungen
- `goals/hosting/ANNAHMEN.md`: Sweep und lange Befehle (hosting 01 und 02)
- `goals/seite/ANNAHMEN.md`: Code auf Englisch, Reihenfolge konto 04 vor seite 03, Ablösungen von seite 02 und 03 (Tech Lead, 18.11.)
- `goals/anmeldung/ANNAHMEN.md`: `keys_left_today` nennt seit anmeldung 03 die freien Plätze der Grenze des Aufrufers, Ablösung von
  anmeldung 04 (Tech Lead, 18.11.)
- `goals/betrieb/ANNAHMEN.md`, `goals/fehler/ANNAHMEN.md`, `goals/domains/ANNAHMEN.md`, `goals/kanal/ANNAHMEN.md`,
  `goals/messung/ANNAHMEN.md`, `goals/relay/ANNAHMEN.md` und `goals/adressen/ANNAHMEN.md`: Annahmen der Goals vom 12. bis 18.11.
