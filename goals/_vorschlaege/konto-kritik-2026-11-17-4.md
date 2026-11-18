Schwere: 2
Goal: konto 06
Befund: Der Handoff eines `limit` speichert den Namen des Kontos in der Spalte `automaton_name` und im Feld `automatonName`; derselbe Bezeichner meint je nach Schritt den Automaton oder das Konto, und `accountNameOf` in `src/handoff/routes.ts` übersetzt das erst beim Rendern (Grundregel 12: ein Name sagt, was er meint).
Beleg: `src/handoff/routes.ts` (`shownName = readAccountName(db, limit.account) ?? ""` geht als `automatonName` in `createHandoff`; `accountNameOf`), `goals/konto/ANNAHMEN.md` Abschnitt `## Goal 06` (Grund: `src/db.ts` stand auf der Deny List).
Empfehlung: Beim nächsten Goal, das `src/db.ts` ohnehin anfasst, die Spalte in `display_name` umbenennen (oder für `limit` ein eigenes `account_name`), `Handoff.automatonName` entsprechend, und `accountNameOf` entfällt.
Übernommen: ROADMAP.md, Glied konto 12 (Goal-Datei PR #271) (2026-11-18)
