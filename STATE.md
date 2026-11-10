# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 10.11.2026, Seed des Paperclip-Loops. Der Dienst läuft unter `https://postyourprice.com` (auch `cp.hippe.eu`) auf
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
| abrechnung | 01 Keine Abbuchung ohne angekommene Antwort | PLANNED |
| abrechnung | 02 Schnellere Anbieter über das Provider-Routing | PLANNED, nach abrechnung 01 |
| sandbox | 01 Sandbox-Vertrag, Isolation, Preis und PoC-Plan | PLANNED, wartet auf abrechnung 01 |
| sandbox | 02 bis 04 | Dateien fehlen, Writer nach sandbox 01 |
| domains | 01 Die Domain-Endpunkte der Runtime | PLANNED, wartet auf sandbox 01 |
| kanal | 01 Antworten auf neue Conway-Issues vorbereiten | PLANNED, wartet auf abrechnung 01 |

## Human Inbox

- keine

## Watch List

- Der erste Rollout aus `deploy.yml` (abrechnung 01): Drift-Prüfung, E2E und Rauchtest gegen `https://postyourprice.com`.
- Server-Kauf für sandbox 01 (Human Gate `server_kauf`).
- Upstream-Drift: `Conway-Research/automaton` gegen den Pin `d8f8168`.

## Annahmen

- keine
