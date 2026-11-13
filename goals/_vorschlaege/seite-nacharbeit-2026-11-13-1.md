Schwere: 1
Goal: seite 01
Befund: Die SOLL-Werkzeuge und die Startseite tragen deutsche Bezeichner und eine deutsche Log-Zeile (`--pruefen`, `umzugBottom`, `id="umzug"`, `data-soll="umzug"`, `soll: … Bilder, umzug oben …, … Mängel`), entgegen Grundregel 12.
Beleg: `git grep -n -E 'flag\("--pruefen"\)|Bilder, umzug oben|id="umzug"' origin/dev -- ops/ src/` -> `ops/soll-assess.mjs:114`, `ops/soll.mjs:23`, `src/public/index.html:899` | loop-constraints.md:59
Empfehlung: Im nächsten Goal des Topics seite Flag, Feld, Anker und Summenzeile englisch benennen (etwa `--check`, `moveBottom`, `id="move"`, `soll: 2 pictures, move top …, 0 defects`), die Prüfbefehle der Goal-Vorlage gleich mit, und Goal-Texte keine deutschen Bezeichner mehr vorgeben lassen.
MVP: Schönheit

Linse Q, Frage 5, dazu seite 02 (Merge 9b67824, `id="umzug"` in src/public/index.html und `ops/soll-live.mjs`, das `--pruefen` nutzt).
Die Namen geben die Goal-Dateien selbst vor (seite 01 Punkt 1 und 3, seite 02 Kontext Zeile 27); Verdict 01-z3-B nennt das und lässt es durch. Grundregel 12 gilt ausnahmslos für Bezeichner und Log-Zeilen, deshalb liegt der Fehler beim Goal-Text.
`umzugBottom` (ops/soll-assess.mjs:102, ops/soll.mjs:122) und `"fehlt"` (ops/soll-assess.mjs:112) gibt kein Goal vor.
