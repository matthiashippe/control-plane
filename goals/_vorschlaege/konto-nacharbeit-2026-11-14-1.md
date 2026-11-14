Schwere: 1
Goal: konto 02
Befund: Die Handy-Seite /h/{code} führt ihre Zustände im Code unter deutschen Bezeichnern (`"freigabe"`, `"erledigt"`, `"ungueltig"`, Funktion `freigabe`, Testkonstanten `ERLEDIGT` und `UNGUELTIG`) und die Summenzeile `soll handoff:` (ops/soll-assess.mjs:151, ausgegeben von `ops/soll-handoff.mjs`) ist deutsch (`Bilder, freigabe oben`, `fehlt`, `Mängel`), entgegen Grundregel 12.
Beleg: `git grep -n -E '"freigabe"|"erledigt"|"ungueltig"|const freigabe|ERLEDIGT =|UNGUELTIG =|Bilder, freigabe oben|"fehlt"' origin/dev -- src/ ops/soll-assess.mjs test/handoff-page.test.ts | wc -l` -> 24 | src/public/handoff.ts:21, src/handoff/routes.ts:78, ops/soll-assess.mjs:151, test/handoff-page.test.ts:11, loop-constraints.md:63
Empfehlung: Die Zustände in Code und Test englisch benennen (etwa `approve`, `approved`, `invalid`, `APPROVED`, `INVALID`, `data-soll="approve"`) und die Summenzeile mit dem Umbau aus seite-nacharbeit-2026-11-13-1 englisch fassen; die Dateinamen der SOLL-Bilder dürfen bleiben, nur der Code liest sie dann über eine Zuordnung.
MVP: Schönheit

Linse Q, Frage 5 (Bezeichner und Log-Zeilen Englisch), Regelstelle `loop-constraints.md:63` (Grundregel 12, ausnahmslos).
Die Goal-Datei gibt nur Dateinamen der Bilder und die Summenzeile vor (Done-Punkt 1); `state: "freigabe"` in src/public/handoff.ts:21 bis :23 und `freigabe()` in src/handoff/routes.ts:78 gibt sie nicht vor.
Gleiche Klasse wie seite-nacharbeit-2026-11-13-1 (Startseite, `umzug`), fehler-nacharbeit-2026-11-13-2 und domains-nacharbeit-2026-11-13-1, alle offen; deren Empfehlung, Goal-Texte keine deutschen Bezeichner vorgeben zu lassen, hat konto 02 noch nicht erreicht.
