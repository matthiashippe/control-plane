Schwere: 2
Goal: kanal 02
Befund: Die Freigabe am Gate `public_post` ist nicht an den Text gebunden. `--send` liest den Entwurf erst beim Senden aus dem Ordner; wird `goals/kanal/antworten/<n>.md` zwischen Matthias' „ok“ und dem Lauf geändert, geht der geänderte Text raus, und `--verify-posted` meldet danach `same`, weil es gegen denselben geänderten Entwurf vergleicht.
Beleg: `ops/post-the-answers.py`, Sendeschleife: `body = body_to_send((FOLDER / f"{number}.md").read_text())` ohne Vergleich mit einem Wert aus der Freigabe; `verify_posted` vergleicht ebenfalls mit `body_to_send` des aktuellen Entwurfs.
Empfehlung: Der Trockenlauf druckt je Entwurf `sha256` von `body_to_send` (die ersten 12 Zeichen), die Schritte für Matthias am Gate nennen ihn, und `--send` nimmt `--approved <n>:<sha12>,…` und sendet nur bei gleichem Wert, sonst Exit 1 ohne POST; Test mit den Fakes aus `test/answers-folder.test.ts`: geänderter Entwurf nach dem Trockenlauf ergibt Exit 1 und keinen POST.
MVP: Funktion, weil „postet nur den freigegebenen Text“ erst dann gilt, wenn der freigegebene Text selbst und nicht der Dateiname das Senden erlaubt.
Übernommen: Triage-Glieder 13.11. an den Tech Lead, Glied 6 (Freigabe an den Text binden, vor dem nächsten `public_post`) (2026-11-13)
