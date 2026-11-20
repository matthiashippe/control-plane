Schwere: 3
Goal: konto 14
Befund: `ops/konto-ready.sh` meldet `key_file unreadable`, wenn der Container `cp` nicht läuft oder `docker compose exec` aus einem anderen Grund scheitert, und vermischt damit „Schlüssel fehlt“ mit „Dienst ist unten“. Der Test prüft außerdem die echten SSH-Optionen nicht: Das nachgebaute `ssh` führt nur das letzte Argument aus, `-o BatchMode=yes` und `-i "$KEY"` könnten wegfallen, ohne dass ein Fall rot wird.
Beleg: `ops/konto-ready.sh` (Zweig `docker compose -f "$COMPOSE_FILE" exec -T cp test -r`), `test/konto-ready.test.ts` (Stand-in `ssh` mit `cmd="${@: -1}"`).
Empfehlung: Eine eigene Zeile `container down` mit Exit 1, wenn `docker compose … ps --status running cp` leer ist; das nachgebaute `ssh` schreibt seine Argumente in eine Datei im mkdtemp-Ordner, und ein Fall prüft `BatchMode=yes` und `-i`. Gehört nicht in konto 14, weil konto 15 mit `ops/status.sh` ohnehin sieht, ob der Dienst läuft.
Übernommen: Glied 4 an den Tech Lead (PRO-25825), weil Matthias ops/konto-ready.sh am Human Gate von konto 15 benutzt; Punkt in konto 15 oder Glied konto 16 (Loop-Triage PRO-25822) (2026-11-20)
