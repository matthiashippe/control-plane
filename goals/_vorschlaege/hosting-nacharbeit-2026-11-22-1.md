Schwere: 1
Goal: hosting 05
Befund: `imageHealth` in `ops/sandbox/sandboxd.mjs` schreibt die Regel von `pin_fact` aus `ops/sandbox/setup.sh` (Image vorhanden, Pin ist ein nie gestarteter Container genau dieser Image-ID ohne Label `sandboxd=1`) ein zweites Mal ab, und kein Test hält beide Fassungen gleich; ändert jemand die Regel in `setup.sh`, meldet `--check` dort `yes`, während der Watchdog `image unpinned` alarmiert, oder umgekehrt.
Beleg: `git grep -n -E 'status === "created"|"\$status" = created' origin/dev -- ops/sandbox/` -> `ops/sandbox/sandboxd.mjs:330` und `ops/sandbox/setup.sh:160` mit derselben Bedingung | ops/sandbox/sandboxd.mjs:328
Empfehlung: Eine gemeinsame Falltabelle (Image fehlt, Pin fehlt, Pin einer alten ID, Pin `exited` oder `running`, Pin mit Label `sandboxd=1`, alles passt) in `test/sandboxd-image.test.ts` gegen `imageHealth` und gegen `pin_fact` mit dem nachgebauten `docker` aus dem Selbsttest von `setup.sh` (`fake pin_fact`, `ops/sandbox/setup.sh:937`) laufen lassen, damit eine Abweichung rot wird.

Linse Q, Frage 2.

Übernommen: Watch List in STATE.md, beim nächsten Goal an ops/sandbox/setup.sh oder sandboxd.mjs (2026-11-22)
