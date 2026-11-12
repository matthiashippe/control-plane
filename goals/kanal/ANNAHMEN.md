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
- 2026-11-12, kanal 01 Punkt 4 (Reparatur Audit 2026-11-12 Zeile 94): Beide Prüfbefehle des Punkts messen den Diff des Goal-Branches
  gegen `merge-base origin/dev HEAD`. Auf `dev` nach dem Merge ist die Merge-Basis `HEAD` selbst, der Diff leer, die erste Prüfung gibt
  dort immer 0 aus und kann nie grün werden. Am Merge-Commit gemessen hält der Punkt: `M=3e0f8c2; git diff $(git merge-base $M^1 $M^2)
  $M^2 -- ops/posted-answers.log | grep -cE "^\+[0-9]{4}-"` gibt 3 aus (434, 430, 427), die zweite Prüfung in derselben Form nichts. Auf
  `dev` belegt `grep -cE "^[0-9]{4}-.* (434|430|427) " ops/posted-answers.log` 3, und zu jeder der drei Nummern liegt der Entwurf in
  `goals/kanal/antworten/`. Code und Log auf `dev` sind richtig, die Goal-Datei ist eingefroren; die Lösung gehört ins Audit
  (`goals/_vorschlaege/loop-audit-2026-11-12-1.md`).
