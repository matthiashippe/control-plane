Schwere: 1
Goal: domains 01
Befund: `test/domains.test.ts` führt den deutschen Bezeichner `VERTRAG` und sechs Kommentare mit deutschem Text aus den Zellen von `docs/sandbox/vertrag.md`, obwohl Bezeichner und Kommentare nach Grundregel 12 ausnahmslos Englisch sind.
Beleg: `git grep -n -E "VERTRAG|ein 402 löst|nur Status 2xx" origin/dev -- test/domains.test.ts` -> `:26 const VERTRAG = ...`, `:35`, `:190 // vertrag.md row: Fehler an das Werkzeug ...; ein 402 löst hier kein Topup aus.`, `:235 // vertrag.md row: nur Status 2xx; ...` | test/domains.test.ts:26, :142, :164, :190, :210, :223, :235
Empfehlung: `VERTRAG` in `CONTRACT_FILE` umbenennen (dieselbe Kopie in `test/sandbox-api.test.ts:19` gleich mit) und die sechs Kommentare als englische Paraphrase mit Verweis auf `docs/sandbox/vertrag.md:21` bis `:25` schreiben.
MVP: Schönheit

Linse Q, Frage 5 (Bezeichner und Kommentare Englisch), Regelstelle `loop-constraints.md`, Grundregel 12.
Linse B hat die Zitate in `goals/domains/verdicts/01-z3-B.md:23` als Quelle gewertet und selbst notiert, eine englische Paraphrase mit Zeilenverweis wäre sauberer; den Bezeichner `VERTRAG` nennt das Verdict nicht.
domains 01 hat `VERTRAG` eingeführt (c369e08), sandbox 03 hat ihn nach `test/sandbox-api.test.ts:19` übernommen.
Übernommen: Triage-Glieder 14.11. an den Tech Lead, Glied 9 (Grundregel 12, deutsche Bezeichner und Kommentare) (2026-11-14)
