Schwere: 2
Goal: fehler 12
Befund: Bei Sunset (`intakeClosed`, also Katalog da und Datum erreicht) nennen `/pricing` und `/llms.txt` weiter die Pakete per Karte, solange der Notschalter aus ist, und `/card/:package` prüft `intakeClosed` nicht. Stufen und `/pay/` fallen dort seit fehler 12 Zyklus 4 (Commit 16e90f6) schon weg, die Karte nicht.
Beleg: `src/app.ts` `const cardOpen = !cardBreaker(db, …).on;` in `/llms.txt` und in `pricing`, beide ohne `intakeClosed`; `app.get("/card/:package", …)` ohne `intakeClosed`.
Empfehlung: Eigenes Goal: entscheiden, ob Credits per Karte nach dem Sunset noch verkauft werden. Wenn nein, die Karte in `/llms.txt`, `/pricing` und `/card/:package` an `!intakeClosed` knüpfen, mit Test. Zusammen mit Vorschlag `fehler-kritik-2026-11-24-1.md`, weil beide dieselben Sätze betreffen.
