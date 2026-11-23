Schwere: 3
Goal: betrieb 06
Befund: Der Rollback-Zweig und die Zeile „Rückweg bei Bedarf“ in `deploy/rollout-remote.sh` benennen die Spalte `handoffs.display_name` nicht zurück, also startet das alte Image mit grünem `/health`, kann aber keinen Handoff lesen oder schreiben.
Beleg: `grep -c 'RENAME COLUMN' deploy/rollout-remote.sh` -> 0 | deploy/rollout-remote.sh:265
Empfehlung: Der Zweig „Rollback auf $ROLLBACK_TAG“ stoppt den neuen Container, benennt mit demselben Skript wie in Schritt 8 von `deploy/README.md` zurück und startet erst dann das alte Image; die Zeile „Rückweg bei Bedarf“ (Zeile 362) nennt dieselben Schritte. Dazu startet der Kanarienvogel nach seiner Migration einmal das Rollback-Image gegen dieselbe `VACUUM INTO`-Kopie und schreibt dort einen Handoff, damit jede künftige Migration, die das alte Image nicht lesen kann, vor dem Umschalten auffällt.
MVP: Funktion.

`deploy/rollout-remote.sh` steht in `deny_paths`, der PR dazu geht deshalb zu Matthias.

Übernommen: Watch List in STATE.md; der Fall display_name ist zu, weil jedes Rollback-Image seit den Deploys nach konto 12 die Spalte kennt, die Probe des Rollback-Images gegen die Kopie ändert deploy/rollout-remote.sh (deny_paths, nur ein Mensch) und gehört zur nächsten Migration, die das alte Image nicht lesen kann (2026-11-23)
