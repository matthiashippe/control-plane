Schwere: 1
Goal: sandbox 08
Befund: `grantLiveAutomaton` in `src/automaton/grant.ts` ist eine Kopie von `grantLiveSandbox` aus `src/sandbox/grant.ts` samt eigenem Typ `GrantOutcome`, nur Ref, Betrag und Text in `meta` unterscheiden sich.
Beleg: `git grep -n 'export type GrantOutcome' origin/dev -- src` -> `src/automaton/grant.ts:28`, `src/sandbox/grant.ts:21` | src/automaton/grant.ts:30, src/sandbox/grant.ts:23
Empfehlung: Eine gemeinsame Funktion für interne Gutschriften der eigenen Live-Prüfung (Ref, Betrag, Grund als Argument) mit einem Typ `GrantOutcome`, die beide Gutschriften mit ihrer Konstante aufrufen.
MVP: Funktion, weil eine Gutschrift eine Ledger-Zeile ist und eine Korrektur der Idempotenz sonst nur in einer der beiden Kopien landet.

Linse Q, Frage 2 (Logik-Duplikate), Merge 792a490.
Übernommen: PRO-23679 Glied 6 (2026-11-17)
