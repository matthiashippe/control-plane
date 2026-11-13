Schwere: 3
Goal: betrieb 01
Befund: Dass die Aufladung mit 16 USD Schwelle und 25 USD Betrag läuft, belegt nur die Antwort „schon erledigt“ am Gate, die weder Zahlen noch Uhrzeit nennt; die Widerlegung nach 14 Tagen prüft heute niemand.
Beleg: `grep -n "schon erledigt" docs/betrieb/guthaben.md` -> Zeile 86 | docs/betrieb/guthaben.md:86
Empfehlung: Ein Kettenglied betrieb ab 26.11.2026 misst mit `bash ops/credit-runway.sh --container` und zählt im Log des Watchdogs die Zeilen `[WARN] credit` seit 2026-11-12 20:35 UTC; ein Sprung von `total_credits` um 25 USD ohne Kauf von Hand belegt die erste Aufladung. Steht dort eine Warnung oder fehlt der Sprung, obwohl der Rest unter 16 USD lag, ist betrieb 01 widerlegt und die Einstellung beim Anbieter falsch.
Übernommen: Triage-Glieder 13.11. an den Tech Lead, Glied 2 (Nachmessung der Aufladung ab 26.11.) (2026-11-13)
