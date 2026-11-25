Schwere: 1
Goal: reichweite 04
Befund: `ops/relink-comments.py` hat nach reichweite 04 drei Trockenläufe (`dry_run`, `dry_run_name`, `dry_run_no_card`) und drei Prüfungen (`verify`, `verify_name`, `verify_no_card`) mit derselben Schleife über Threads und eigene Kommentare, demselben Aufbau von `values` und derselben Ausgabe, nur der Planer und die Zähler wechseln.
Beleg: `git grep -n -E 'for c in own_comments\(number\):|^def (dry_run|dry_run_name|dry_run_no_card|verify|verify_name|verify_no_card)\(' origin/dev -- ops/relink-comments.py` -> `:229`, `:233`, `:247`, `:251`, `:269`, `:273`, `:378`, `:385`, `:392` | ops/relink-comments.py:229
Empfehlung: Ein `dry_run(planner)` mit dem Planer als Argument, wie `send` ihn schon wählt (`planner, log, label`), und ein `verify(planner, log, label)`; die Zähler `already` und `kept` von `--name` kommen als Rückgabe des Planers, beim nächsten Goal an den Kommentaren.
MVP: Schönheit

Linse Q, Frage 2. Ein vierter Modus müsste sonst Schleife, Ausgabe und Prüfung ein viertes Mal kopieren.

Übernommen: Watch List in STATE.md (2026-11-25)
