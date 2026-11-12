# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 12.11.2026, 06:20 (Loop-Triage). Stufe L3, Kill Switch aus, Budget full, Drill grün (10.11.), Kurs-Check „auf Kurs“
(11.11., 15:33); der Kurs-Check PRO-18222 blieb zwei Stunden ohne Antwort, Goals starten weiter. Seit der letzten Triage gemergt:
kanal 01 (PR #5), abrechnung 04 (PR #10), sandbox 01 (PR #4) und die Goal-Datei sandbox 02 (PR #19); `deploy.yml` lief auf `dev`
dreimal grün (zuletzt 11.11., 19:51). Aktiv ist domains 01 (PRO-18126, PR #18). Der Dienst läuft unter `https://postyourprice.com`
(`/health` 200 am 12.11., 06:15), eine Anfrage ohne Schlüssel bekommt 401 mit dem Weg über `/v1/auth/nonce`.

Entscheidung 30.10.2026: Inferenz wird wieder über OpenRouter verkauft, Matthias' Entscheidung. Notschalter:
`CP_OPENROUTER_RESALE=0` in `/opt/control-plane/.env`, danach Neustart des Containers.

Entscheidungen 10.11.2026 (Matthias): Sandboxes sind das nächste Produkt, als PoC auf einem eigenen kleinen Server, getrennt vom
Zahlungsdienst. Antworten, die beim Kunden nicht ankommen, berechnen wir nicht mehr.

## Topics

| Topic | Goal | Status |
|---|---|---|
| fehler | keine Glieder | Fehler echter Nutzer vom 11.11. (503 bei leerem Guthaben beim Anbieter, fehler-2026-11-11-1), Glied beim Tech Lead |
| abrechnung | 01 bis 04 | DONE |
| abrechnung | 05 Quote nach außen nach sieben Tagen | PLANNED, startet frühestens 18.11.2026 |
| sandbox | 01 Sandbox-Vertrag, Isolation, Preis und PoC-Plan | DONE |
| sandbox | 02 Der Sandbox-Server steht | PLANNED, wartet auf einen Platz (parallel_goals 1) |
| sandbox | 03, 04 | Dateien fehlen, Writer nach sandbox 02 |
| domains | 01 Die Domain-Endpunkte der Runtime | ACTIVE (PRO-18126, PR #18) |
| kanal | 01 Antworten auf neue Conway-Issues vorbereiten | DONE |
| seite | 01 | wartet auf Budget |

## Human Inbox

- keine PR mit „Human Inbox“
- kein Human Gate offen; `server_kauf` (sandbox 01), `public_post` (kanal 01) und `security_settings` (abrechnung 04) sind erledigt

## Watch List

- Schlüssel für die Aktivität beim Inferenz-Anbieter liegt in `~/.config/control-plane/loop.env`, die jede Rolle lädt
  (abrechnung-kritik-2026-11-11-2, Schwere 4, beim Tech Lead)
- `ops/fetcher-cache.tsv` mit Adressen echter Besucher im öffentlichen Repo (loop-redteam-2026-11-11-1, Schwere 4, beim Tech Lead)
- `LOOP.md:24` nennt noch die ungemessenen 0,37 USD statt 79229 mc; der Satz wird mit der nächsten Fassung von `LOOP.md` korrigiert
- `--join` und `--compare` teilen Filter und Zuordnung nicht (abrechnung-nacharbeit-2026-11-11-3); abrechnung 05 baut beide um
- Upstream-Drift: `Conway-Research/automaton` gegen den Pin `d8f8168`

## Annahmen

- `goals/abrechnung/ANNAHMEN.md`: unter anderem „Quote nach außen noch keine“ bis abrechnung 05
- `goals/sandbox/ANNAHMEN.md` und `goals/kanal/ANNAHMEN.md`: Annahmen von sandbox 01 und kanal 01
