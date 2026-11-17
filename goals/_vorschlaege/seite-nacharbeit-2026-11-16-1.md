Schwere: 2
Goal: konto 02
Befund: Die Blöcke `freigabe` und `passkey` und die Zustände `freigabe`, `erledigt` und `ungueltig` der Handoff-Bilder tragen nach seite 03 weiter deutsche Namen in Dateinamen und in der Summenzeile von `ops/soll-handoff.mjs` (`soll handoff: 6 pictures, freigabe top …`), weil sie in den Dateinamen abgenommener Bilder des Topics konto stehen.
Beleg: `git ls-files 'docs/soll/handoff-*'` -> handoff-erledigt, handoff-freigabe, handoff-ungueltig je 390 und 1440 | ops/soll-assess.mjs (`HANDOFF_FILES`)
Empfehlung: Im nächsten konto-Goal mit neuer Abnahme durch den Design Reviewer umbenennen (Dateien, `HANDOFF_FILES`, `HANDOFF_BLOCK_MARKS`, Summenzeile) und die alten Prüfbefehle von konto 02 bis 04 als abgelöst eintragen.
Übernommen: ROADMAP.md, Glied konto 06 (PR #227) (2026-11-17)
