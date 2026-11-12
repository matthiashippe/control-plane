Schwere: 3
Goal: fehler 01
Befund: Scheitert der POST an den Webhook genau im Lauf, in dem LOW beginnt, speichert `check_credit` trotzdem `low`, und die Warnung kommt nie wieder, bis das Guthaben OK ist.
Beleg: ops/watchdog.sh:57 (`report` schluckt den Fehler von curl, Zeile 27 `|| echo "$TS [WARN] webhook unreachable"`, danach schreibt Zeile 58 `low`)
Empfehlung: `report` gibt bei gescheitertem POST einen Exit-Code ungleich 0 zurück, und `check_credit` speichert `low` erst nach erfolgreichem POST; dasselbe für die Gesundheit. Test mit Fake-`curl`, dessen erster POST scheitert: der nächste Lauf postet LOW.
