Schwere: 1
Goal: kanal 04
Befund: Der Kommentar über der Reihenfolge nennt noch die Sendezeile ohne `--approved`; wer sie kopiert, bekommt `REFUSED: --send needs --approved`.
Beleg: `ops/post-the-answers.py:284`: `#   ops/post-the-answers.py --send 3 --only 335,373,385`
Empfehlung: Zeile auf `--send 3 --only 335,373,385 --approved 335:<sha12>,373:<sha12>,385:<sha12>` ändern, wie im Docstring oben.
MVP: Schönheit
Übernommen: Triage-Glieder 14.11. an den Tech Lead, Glied 4 (Kommentar `ops/post-the-answers.py:284` mit `--approved`) (2026-11-14)
