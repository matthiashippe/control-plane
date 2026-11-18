Schwere: 2
Goal: sandbox 11
Befund: Mehrere Prüfungen mit `(Netz)` messen fremde, laufend geänderte Daten (Nachbarn in `public_suffix_list.dat`, Überschriften und Kästchen der PR-Vorlage des PSL-Repos, Zahl 1 für `sandboxhost.de|herokuapp.com`); nach DONE wird das Loop-Audit rot, sobald die PSL einen Abschnitt zwischen Postman und prequalifyme einfügt, ihre Vorlage ändert oder `sandboxhost.de` aufnimmt, und der Loop Master macht daraus eine Reparatur ohne Ursache auf dev.
Beleg: goals/sandbox/11-die-sandbox-domain-kommt-auf-die-public-suffix-list.md:171, :178, :188, :189
Empfehlung: Kippt eine dieser Zeilen im Audit, entscheidet der Tech Lead mit einer Zeile `Abgelöst:` in `goals/sandbox/ANNAHMEN.md` statt einer Reparatur; Writer schreiben in künftigen Goals Netz-Prüfungen gegen fremde Listen als Messung am Tag des Goals in eine Datei des Repos und prüfen danach nur diese Datei.
Übernommen: ROADMAP.md, Glied sandbox 12 (2026-11-18)
