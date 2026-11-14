Schwere: 2
Goal: anmeldung 01
Befund: `ops/keyless-mints.sh` überspringt eine Zeile auf `POST /v1/auth/keyless` still, wenn `ts` oder `status` nicht als Zahl lesbar ist. Ändert sich das Zeitformat des Caddy-Logs (etwa `iso8601`), fällt jede Anfrage heraus, und das Werkzeug meldet eine leere Tabelle mit Exit 0. Genau das liest der Release Manager in den 14 Tagen nach dem Rollout als „keine Ablehnung“, also als Bestätigung statt als Blindheit. Der Selbsttest deckt das nicht ab, weil er sein eigenes Log mit Zahlen baut.
Beleg: ops/keyless-mints.sh:70
Empfehlung: Im nächsten Goal des Topics anmeldung die übersprungenen Zeilen auf dem Pfad zählen und mit Exit 2 und einer stderr-Zeile enden, sobald eine davon nicht lesbar war; dazu ein Fall im Selbsttest und in `test/keyless-mints.test.ts` mit `"ts":"2026-11-11T12:00:00Z"`, der Exit 2 verlangt.
