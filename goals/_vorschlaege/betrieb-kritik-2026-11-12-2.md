Schwere: 2
Goal: betrieb 01
Befund: Der Verbrauch stieg binnen vier Stunden von 3,16 auf 3,26 USD je Tag, `--topup` rechnet jetzt 17 USD, eingestellt sind 16 USD, und nichts meldet, wenn die gerechnete Schwelle die eingestellte überholt.
Beleg: `grep -n "Wächst der Verbrauch" docs/betrieb/guthaben.md` -> Zeile 99 | docs/betrieb/guthaben.md:99
Empfehlung: `ops/watchdog.sh` (betrieb 02 rollt es ohnehin aus, oder ein eigenes Goal danach) vergleicht `--topup` einmal am Tag mit der eingestellten Schwelle aus einer Variable `CP_CREDIT_TOPUP_USD` und meldet über den Webhook, wenn die gerechnete Schwelle die eingestellte um mehr als 1 USD übersteigt; dann stellt Matthias den neuen Wert beim Anbieter ein.
Übernommen: Triage-Glieder 13.11. an den Tech Lead, Glied 2 (Vergleich gerechnete gegen eingestellte Schwelle; Verbrauch am 13.11. 3,44 USD je Tag) (2026-11-13)
