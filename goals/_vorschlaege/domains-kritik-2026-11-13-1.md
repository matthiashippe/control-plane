Schwere: 2
Goal: domains 02
Befund: `domains_search_live` und `sandbox_live` in `ops/live.sh` schreiben `LIVE_SANDBOX_KEY` in eine Header-Datei aus `mktemp` und löschen sie erst nach `curl`; ein SIGTERM oder SIGINT während des Aufrufs (Timeout des Release-Manager-Laufs, bis zu 15 s bei domains-search, 150 s je Aufruf bei sandbox) lässt den Schlüssel in `/tmp` liegen.
Beleg: ops/live.sh:151 (`hdr="$(mktemp)"`, `rm -f "$hdr"` erst nach `curl`), ops/live.sh:311; kein `trap` in `live()`, nur `trap 'rm -rf "$dir"' RETURN` im Selbsttest (ops/live.sh:377).
Empfehlung: Im nächsten Goal, das `ops/live.sh` berührt, legen beide Funktionen ihre Dateien in ein Verzeichnis aus `mktemp -d`, das ein `trap ... EXIT INT TERM` in `live()` löscht; Selbsttest: ein `curl`-Stub, der schläft, wird per `kill -TERM` beendet, danach ist das Verzeichnis leer.
Übernommen: Triage-Glieder 13.11. an den Tech Lead, Glied 5 (Temp-Dateien mit Schlüssel in `ops/live.sh:151` und `:311` ohne `trap`) (2026-11-13)
