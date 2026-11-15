Schwere: 2
Goal: messung 05
Befund: `ops/status.sh` zählt jede Meldung, deren Titel mit `control-plane ` beginnt, als Zustellung des Watchdogs, also auch `control-plane backup failed` aus `ops/backup.sh`, obwohl der Kommentar in Zeile 138 und 139 das ausschließt. Ein gescheitertes Backup auf dem Thema kann `received` damit auf `ok` setzen, während der Watchdog selbst nichts zugestellt hat. Dass der Deploy-Alarm nicht mitzählt, hängt heute nur an seinem Titel `deploy-window 502` (Annahme messung 05) und an keinem Test.
Beleg: ops/status.sh:157 (`title.startswith("control-plane ")`) | ops/backup.sh:27 (`-H "Title: control-plane backup failed"`) | ops/status.sh:138-139 (Kommentar „not those of ops/backup.sh“)
Empfehlung: Ein Glied messung: `ops/status.sh` zählt nur die Titel, die `report` in `ops/watchdog.sh` setzt (`control-plane <severity>` mit genau dessen Severities), statt des Präfixes; ein Test legt auf dem nachgebauten Thema je eine Meldung `control-plane backup failed` und `deploy-window 502` ab, ohne eine Meldung des Watchdogs, und erwartet `received` rot, rot vor dem Fix.
MVP: Funktion, weil `received` sonst einen stummen Watchdog als gesund meldet, sobald ein Backup scheitert.
Übernommen: messung 09 in ROADMAP.md (Triage-Glieder PRO-21463) (2026-11-15)
