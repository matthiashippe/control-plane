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
2. `ops/status.sh` mit `OPENROUTER_API_KEY` und `CP_ALERT_WEBHOOK` aus `secrets.env` ausführen, beide nur in der Umgebung
   dieses einen Aufrufs: kein export, kein Argument, den Wert nie ausgeben. Ohne `CP_ALERT_WEBHOOK` liest `ops/status.sh` das
   Thema nicht zurück, und `alarm_path.received` bleibt `unknown`.
   ```bash
   OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' ~/brain/connectors/secrets.env | cut -d= -f2) CP_ALERT_WEBHOOK=$(grep '^CP_ALERT_WEBHOOK=' ~/brain/connectors/secrets.env | cut -d= -f2-) ops/status.sh
   ```
   Schlägt es fehl (SSH, Timeout), ist das selbst der Befund.
3. Werte gegen die Schwellentabelle in `ops/README.md` halten und gegen den letzten Ops-Eintrag in
   `loop-run-log.md` (Neustarts, Automatons, Guthaben: Richtung zählt, nicht nur der Wert).
4. `STATE.md` schreiben: Abschnitt **Betrieb** mit einer Zeile je Befund, Stand und Uhrzeit.
   Alles Unauffällige in eine einzige Zeile (`Betrieb unauffällig: health 200, Zert 89 Tage,
   0 Fehler, 1 Automaton, OpenRouter 19,81 USD`).
5. Eine Zeile an `loop-run-log.md` anhängen: Zeitpunkt, Befunde, Eskalationen und `received <status>` mit dem Wert von
   `alarm_path.received.status`, damit der nächste Lauf den vorigen Wert findet.
6. Nur melden, wenn eine Entscheidung oder Aktion von Matthias nötig ist (Guthaben, Ausfall,
   negative Marge, keine Warnung kommt mehr an). Sonst schweigen; STATE.md ist der Bericht.

## Regeln

- Report-only. Kein `deploy/up.sh`, kein `docker restart`, keine Änderung an `/opt/control-plane/.env`.
- Keine Schlüssel, Salden Dritter oder Wallet-Adressen in Klartext in Chat-Ausgaben, außer der
  eigenen payTo-Adresse.
- Bei einem Befund immer die Zahl nennen, die ihn auslöst, nie nur "auffällig".
- Zwei Läufe mit demselben Befund ohne Entscheidung: in STATE.md unter High Priority hochziehen.
- `alarm_path.received.status` `red` ist ein Befund in `STATE.md` mit den Zahlen `last_delivered`, `last_message` und
  `last_alive` und dem Handgriff aus `ops/README.md` (Thema in der crontab der VM gegen `CP_ALERT_WEBHOOK` abgleichen). Er
  zählt als Meldung an Matthias nach Schritt 6, weil keine Warnung mehr ankommt.
- `alarm_path.received.status` `unknown` in zwei Läufen in Folge (der vorige Wert steht als `received <status>` in der letzten
  Zeile von `loop-run-log.md`) ist ein Hinweis in `STATE.md`; einmal `unknown` ist nichts.
- URL und Thema des Webhooks stehen nie in `STATE.md`, `loop-run-log.md` oder einer Chat-Ausgabe.
