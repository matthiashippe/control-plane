# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 11.11.2026, 06:00 (Loop-Triage). Stufe L3, Kill Switch aus, Budget core, Drill grün (10.11.), Kurs-Check „auf Kurs“
(11.11., 01:51). Gemergt: abrechnung 01, 02, 03; `deploy.yml` lief auf `dev` viermal grün (zuletzt 11.11., 02:11). Seed vom 10.11.2026: Der Dienst läuft unter `https://postyourprice.com` (auch `cp.hippe.eu`) auf
`srv1336627`, Container seit dem Rollout vom 30.10.2026. Gemessen am 10.11.2026: 6 registrierte Automatons, davon 4 fremde,
8 Zahlungen über zusammen 36 USDC. Conway antwortet seit Wochen mit 500.

Entscheidung 30.10.2026: Inferenz wird wieder über OpenRouter verkauft, Matthias' Entscheidung. Notschalter:
`CP_OPENROUTER_RESALE=0` in `/opt/control-plane/.env`, danach Neustart des Containers.

Entscheidungen 10.11.2026 (Matthias): Sandboxes sind das nächste Produkt, als PoC auf einem eigenen kleinen Server, getrennt vom
Zahlungsdienst. Antworten, die beim Kunden nicht ankommen, berechnen wir nicht mehr.

Drift Server gegen Repo am 10.11.2026: 391 Dateien geprüft, drei unterscheiden sich nur in Kommentaren und stehen in
`deploy/drift-ok.txt`; die Fassung im Repo gilt und ersetzt sie mit dem ersten Rollout.

## Topics

| Topic | Goal | Status |
|---|---|---|
| fehler | keine Glieder | leer, der Writer hängt Fehler echter Nutzer an |
| abrechnung | 01 Keine Abbuchung ohne angekommene Antwort | DONE |
| abrechnung | 02 Schnellere Anbieter über das Provider-Routing | DONE |
| abrechnung | 03 Timeout-Quote vorher und nachher auf derselben Grundlage | DONE |
| abrechnung | 04 Einkauf abgebrochener Anfragen gegen die Abrechnung des Anbieters | BLOCKED matthias (PRO-17684, PR #10) |
| sandbox | 01 Sandbox-Vertrag, Isolation, Preis und PoC-Plan | BLOCKED matthias (PRO-17522, PR #4) |
| sandbox | 02 bis 04 | Dateien fehlen, Writer nach sandbox 01 |
| domains | 01 Die Domain-Endpunkte der Runtime | PLANNED, wartet auf sandbox 01 |
| kanal | 01 Antworten auf neue Conway-Issues vorbereiten | BLOCKED matthias (PRO-17542, PR #5) |
| seite | 01 | wartet auf Budget (Stufe core, nur Prio 1 bis 3) |

## Human Inbox

- keine PR mit „Human Inbox“
- Human Gate sandbox 01 (`server_kauf`): VPS KVM 1 bei Hostinger, Karte auf seinem privaten Board seit 10.11., 23:10
- Human Gate kanal 01 (`public_post`): drei Antworten in Conway-Issues, wartet auf sein „ok“ seit 10.11., 23:50
- Human Gate abrechnung 04 (`security_settings`): Management-Key bei OpenRouter, seit 11.11., 03:54; Punkte ohne Schlüssel
  baut der Maker vorher

## Watch List

- Quote nach außen frühestens ab 17.11.2026 nach einem neuen `--compare`; das Glied dafür fehlt in der Kette
  (abrechnung-kritik-2026-11-10-4, beim Tech Lead), `--compare` skaliert vorher nicht (abrechnung-kritik-2026-11-10-6)
- `LOOP.md:24` nennt noch die ungemessenen 0,37 USD statt 79229 mc; ändern darf das nur ein Mensch (beim Tech Lead als
  Human Inbox des Loops)
- Server-Kauf für sandbox 01 (Human Gate `server_kauf`).
- Upstream-Drift: `Conway-Research/automaton` gegen den Pin `d8f8168`.

## Annahmen

- `goals/abrechnung/ANNAHMEN.md`: unter anderem „Quote nach außen noch keine“ (0 Timeouts in 46 Anfragen sind kein Beleg)
