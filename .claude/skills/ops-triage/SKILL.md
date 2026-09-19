---
name: ops-triage
description: >
  Betriebs-Triage für das laufende Control Plane auf cp.hippe.eu. Liest ops/status.sh, vergleicht
  mit den Schwellen in ops/README.md und dem letzten Lauf, schreibt STATE.md und loop-run-log.md.
  Report-only: keine Änderung an der VM, kein Deploy, kein Neustart.
user_invocable: true
---

# Ops-Triage (L1)

## Ablauf

1. `loop-constraints.md` lesen (bindend). Wenn `loop-pause-all` in STATE.md steht: sofort beenden.
2. `OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' ~/brain/connectors/secrets.env | cut -d= -f2) ops/status.sh`
   ausführen. Schlägt es fehl (SSH, Timeout), ist das selbst der Befund.
3. Werte gegen die Schwellentabelle in `ops/README.md` halten und gegen den letzten Ops-Eintrag in
   `loop-run-log.md` (Neustarts, Automatons, Guthaben: Richtung zählt, nicht nur der Wert).
4. `STATE.md` schreiben: Abschnitt **Betrieb** mit einer Zeile je Befund, Stand und Uhrzeit.
   Alles Unauffällige in eine einzige Zeile (`Betrieb unauffällig: health 200, Zert 89 Tage,
   0 Fehler, 1 Automaton, OpenRouter 19,81 USD`).
5. Eine Zeile an `loop-run-log.md` anhängen: Zeitpunkt, Befunde, Eskalationen.
6. Nur melden, wenn eine Entscheidung oder Aktion von Matthias nötig ist (Guthaben, Ausfall,
   negative Marge). Sonst schweigen; STATE.md ist der Bericht.

## Regeln

- Report-only. Kein `deploy/up.sh`, kein `docker restart`, keine Änderung an `/opt/control-plane/.env`.
- Keine Schlüssel, Salden Dritter oder Wallet-Adressen in Klartext in Chat-Ausgaben, außer der
  eigenen payTo-Adresse.
- Bei einem Befund immer die Zahl nennen, die ihn auslöst, nie nur "auffällig".
- Zwei Läufe mit demselben Befund ohne Entscheidung: in STATE.md unter High Priority hochziehen.
