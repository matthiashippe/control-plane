Schwere: 3
Goal: adressen 01
Befund: Das Repo hält Logs der Actions weiter 90 Tage, die Datenschutzerklärung sagt die Löschung nach 30 Tagen zu. adressen 01 räumt nur die sechs bekannten Läufe; gibt ein künftiger Lauf wieder eine Adresse aus, bleibt sie 90 Tage öffentlich lesbar, bis jemand sie findet.
Beleg: `gh api repos/matthiashippe/control-plane/actions/permissions/artifact-and-log-retention` -> `{"days":90,"maximum_allowed_days":90}` (14.11.2026)
Empfehlung: Ein Goal im Topic adressen mit Human Gate `security_settings`: Matthias setzt die Aufbewahrung von Artefakten und Logs auf 30 Tage (`gh api -X PUT repos/matthiashippe/control-plane/actions/permissions/artifact-and-log-retention -F days=30`), der Done-Punkt prüft mit Netz `... --jq .days` auf höchstens 30, und `docs/adressen/actions-logs.md` nennt die Einstellung.
