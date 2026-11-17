Schwere: 5
Goal: konto 04
Befund: konto 04 schreibt dem neuen Werkzeug `ops/soll-limit.mjs` das deutsche Flag `--pruefen` vor, obwohl Grundregel 12 Code ausnahmslos Englisch verlangt und seite 03 genau dieses Flag bei den drei bestehenden SOLL-Werkzeugen als Regelbruch zu `--check` umbenennt.
Beleg: `grep -n -- '--pruefen' goals/konto/04-die-terminal-tools.md` -> Zeilen 89, 127, 147 für `ops/soll-limit.mjs` | loop-constraints.md:63, goals/seite/03-code-auf-englisch.md:41
Empfehlung: Der Tech Lead stellt konto 04 vor dem Start so um, dass `ops/soll-limit.mjs` das Flag `--check` nimmt (Kontext Zeile 89, Prüfungen Zeilen 127 und 147); die Summenzeile `soll limit: 4 images, … 0 defects` ist schon Englisch und bleibt.

konto 04 läuft noch nicht (PLANNED, kein Branch `goal/konto-04`, wartet auf sandbox 08). Jetzt kostet die Änderung zwei Wörter in der Goal-Datei, nach dem Merge eine weitere Umbenennung mit Ablösungszeilen in `goals/konto/ANNAHMEN.md`, wie seite 03 sie für die drei alten Werkzeuge braucht.
Übernommen: auf dev erledigt mit konto 04 (PR #208), `ops/soll-limit.mjs` nimmt `--check` (2026-11-17)
