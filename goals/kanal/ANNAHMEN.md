# Annahmen im Topic kanal

- 2026-11-10, kanal 01: „Neue Issues seit dem letzten Eintrag in `ops/posted-answers.log`“ gelesen als offene Issues mit Anmelde- oder
  Zahlungsfehler ohne Kommentar unseres Kontos. Der letzte Eintrag (2026-11-10T14:06:24Z) liegt nach jedem offenen Fehler-Issue, wörtlich
  genommen wäre die Liste leer und Punkt 3 unerreichbar; ein Issue mit unserer Antwort bekommt ohnehin keinen zweiten Kommentar.
- 2026-11-10, kanal 01: `--folder` muss ein vorhandener Ordner innerhalb des Repos sein (Wurzel ist der Ordner über `ops/`), sonst
  `REFUSED` mit Exit 1, bevor das Gatter ins Netz geht. Ohne `--folder` bleibt `.scratch/gtm/issue-antworten/` der Standard, damit sich für
  bestehende Aufrufe nichts ändert.
- 2026-11-10, kanal 01: `ops/post-the-answers.py` ruft das Gatter und schreibt `ops/posted-answers.log` jetzt über den Pfad des Skripts
  statt über das Arbeitsverzeichnis; vom Repo-Wurzelordner aus ist das derselbe Pfad.
- 2026-11-10, kanal 01: Die Entwürfe tragen keine interne Notiz über die Fragenden, nur Issue und Fehlerart, weil der Ordner öffentlich ist.
