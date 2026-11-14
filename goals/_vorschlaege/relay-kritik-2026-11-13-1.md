Schwere: 2
Goal: relay 01
Befund: Die Einmaligkeit einer Nachricht hängt am Text der Signatur, nicht an der Signatur selbst: Dieselbe Signatur in Groß- statt Kleinschreibung (oder als zweite gültige Form mit gespiegeltem `s`) besteht `verifyMessage` und gilt als neue Nachricht.
Beleg: src/relay/routes.ts:65 (`/^0x[0-9a-fA-F]+$/`) und src/relay/routes.ts:139 (`WHERE signature = ?`), src/db.ts:332 (`signature TEXT UNIQUE`)
Empfehlung: Die Signatur vor Lookup und Speichern normalisieren (Kleinschreibung, 65 Byte, `s` in der unteren Hälfte, sonst 401) und einen Test mit der großgeschriebenen Form ergänzen. Ausnutzen kann es heute nur, wer die Signatur kennt, also der Absender selbst, der ohnehin neu signieren kann; deshalb kein Done-Punkt.
Übernommen: relay 02, DONE und gemergt (PR #113) (2026-11-14)
