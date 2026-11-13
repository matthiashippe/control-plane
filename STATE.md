# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 13.11.2026, 06:20 (Loop-Triage). Stufe L3, Kill Switch aus, Budget full (4 von 11 Konten mit mindestens 20 % Weekly-Rest),
Drill grün (10.11.), Kurs-Check „auf Kurs“ (13.11., 04:23, PRO-19241), bis zu zwei Goals parallel. Seit der letzten Triage gemergt:
fehler 01 bis 04, betrieb 01 und 02, sandbox 02 bis 04, domains 01 und 02, kanal 02 und 03, seite 01 und 02, dazu die Goal-Datei
sandbox 05 (PR #59). domains 02 kam um 06:08 nach `dev` (PR #58); `loop-master status` zeigte es um 06:05 noch als ACTIVE. Es läuft
sandbox 05 (PRO-19284, Draft-PR #62, `check` grün). `deploy.yml` rollte zuletzt am 13.11. um 01:45 aus (betrieb 02, nur
`deploy/Caddyfile`, `cp` lief weiter); der letzte Rollout mit Neustart von `cp` war am 12.11. um 23:40 (seite 02). `/health` antwortet
200 (13.11., 06:19).

Guthaben beim Inferenz-Anbieter: Die Warnung aus fehler 01 und 03 läuft auf dem Server, der Watchdog schreibt alle fünf Minuten eine
Zeile `[INFO] credit` (13.11., 06:15: 32,68 USD, 9,4 Tage bei 3,44 USD je Tag, Warnschwelle 10,33 USD; gelesen per `ssh`, nur
lesend). Die Aufladung beim Anbieter ist seit 12.11., 21:35 eingeschaltet (16 USD Schwelle, 25 USD Betrag, `docs/betrieb/guthaben.md`).

Entscheidung 30.10.2026: Inferenz wird wieder über OpenRouter verkauft, Matthias' Entscheidung. Notschalter:
`CP_OPENROUTER_RESALE=0` in `/opt/control-plane/.env`, danach Neustart des Containers.

Entscheidungen 10.11.2026 (Matthias): Sandboxes sind das nächste Produkt, als PoC auf einem eigenen kleinen Server, getrennt vom
Zahlungsdienst. Antworten, die beim Kunden nicht ankommen, berechnen wir nicht mehr. 12.11.2026: Neue zahlende Kunden und alles, was
die zahlenden hält, haben Vorrang (Topic betrieb); zwei Goals parallel.

## Topics

| Topic | Goal | Status |
|---|---|---|
| fehler | 01 bis 04 | DONE; Fehler echter Nutzer im Rollout-Fenster vom 12.11. (fehler-2026-11-12-1, Schwere 5), Glied beim Tech Lead |
| betrieb | 01, 02 | DONE; Nachmessungen (Aufladung ab 26.11., 502 beim nächsten Neustart von `cp`) beim Tech Lead |
| abrechnung | 01 bis 04 | DONE |
| abrechnung | 05 Quote nach außen nach sieben Tagen | PLANNED, startet frühestens 18.11.2026 |
| sandbox | 01 bis 04 | DONE |
| sandbox | 05 Lange Befehle scheitern nicht an der Runtime | ACTIVE (PRO-19284, Draft-PR #62) |
| sandbox | 06 Freigegebene Ports unter einer eigenen Domain | Datei fehlt, Writer nach sandbox 05 |
| domains | 01, 02 | DONE (02 am 13.11., 06:08, PR #58) |
| kanal | 01 bis 03 | DONE; Urteil über den Ertrag am 25.11. (`goals/kanal/ertrag.md`) |
| seite | 01, 02 | DONE |

## Human Inbox

- keine PR mit „Human Inbox“
- kein Human Gate offen; `server_kauf` der Aufladung (betrieb 01) ist erledigt

## Watch List

- Offene Pflege-PRs der Nachtläufe von heute, von der Triage nicht angefasst: #61 Loop-Nacharbeit (zehn Vorschläge, Schwere 1 und 2),
  #60 Red Team (betrieb-redteam-2026-11-13-1, Schwere 3)
- `gate.yaml` hat `ops/fetcher-cache.tsv` noch nicht in `deny_paths`, obwohl fehler 02 den Eintrag vorsieht (loop-triage-2026-11-13-1,
  Schwere 4, ändert nur ein Mensch); bis dahin halten `.gitignore:16` und der Test aus fehler 04
- `ops/abort-purchase.sh` liest den Management-Key noch aus der Umgebung oder `loop.env`; der Schlüssel liegt seit 12.11. in
  `~/.config/control-plane/openrouter-management.env` (0600), `loop.env` trägt ihn nicht mehr, das Skript zieht mit abrechnung 05 nach
- `LOOP.md:24` nennt noch die ungemessenen 0,37 USD statt 79229 mc; der Satz wird mit der nächsten Fassung von `LOOP.md` korrigiert
- `--join` und `--compare` teilen Filter und Zuordnung nicht (abrechnung-nacharbeit-2026-11-11-3); abrechnung 05 baut beide um
- Verbrauch beim Inferenz-Anbieter steigt (12.11. 3,16, 13.11. 3,44 USD je Tag); die eingestellte Schwelle der Aufladung von 16 USD
  vergleicht noch niemand mit der gerechneten (betrieb-kritik-2026-11-12-2, beim Tech Lead)
- Upstream-Drift: `Conway-Research/automaton` gegen den Pin `d8f8168`, am 13.11. kein neuerer Commit

## Annahmen

- `goals/abrechnung/ANNAHMEN.md`: unter anderem „Quote nach außen noch keine“ bis abrechnung 05
- `goals/sandbox/ANNAHMEN.md`: Wildcard `*.postyourprice.com` nur bis zur eigenen Domain für freigegebene Ports (sandbox 06)
- `goals/betrieb/ANNAHMEN.md`, `goals/fehler/ANNAHMEN.md`, `goals/domains/ANNAHMEN.md`, `goals/kanal/ANNAHMEN.md` und
  `goals/seite/ANNAHMEN.md`: Annahmen der Goals vom 12. und 13.11.
