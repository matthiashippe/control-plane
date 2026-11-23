Schwere: 1
Goal: betrieb 06
Befund: Schritt 8 verlangt die Rückbenennung nach jedem Rückweg, nötig ist sie aber nur, wenn das Rollback-Image älter als konto 12 ist; ab dem zweiten Deploy nach konto 12 kennt auch das Rollback-Image `display_name`, und die Rückbenennung kostet nur einen Stopp, weil dessen `openDb` die Spalte gleich wieder vorwärts umbenennt.
Beleg: `grep -c 'RENAME COLUMN automaton_name TO display_name' src/db.ts` -> 1 | deploy/README.md:70
Empfehlung: Schritt 8 nennt als Bedingung zusätzlich, dass das Rollback-Image vor konto 12 gebaut wurde (`docker image inspect control-plane:rollback --format '{{.Created}}'` gegen das Datum des Deploys von konto 12), der Wächter bleibt unverändert.
MVP: Detail.

Verworfen: Detail ohne Kundenschaden, die Rückbenennung kostet nur einen Stopp, und jedes heutige Rollback-Image ist jünger als konto 12 (2026-11-23)
