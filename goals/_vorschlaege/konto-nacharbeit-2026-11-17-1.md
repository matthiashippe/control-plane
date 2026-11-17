Schwere: 2
Goal: konto 04
Befund: `parseLimit` in `src/konto/limit.ts` wiederholt Zeile für Zeile das exportierte `parseUsdc` aus `src/handoff/routes.ts`, damit steht die Prüfregel für Geldbeträge in atomaren USDC zweimal und kann getrennt auseinanderlaufen.
Beleg: `git grep -n 'n > 0n && n % 10_000n === 0n ? n : null' origin/dev -- src` -> `src/handoff/routes.ts:103`, `src/konto/limit.ts:82` | src/konto/limit.ts:79, src/handoff/routes.ts:100
Empfehlung: `parseLimit` streichen und `parseUsdc` importieren, oder beide Aufrufer auf eine Funktion in einem gemeinsamen Modul unter `src/konto/` umstellen.
MVP: Funktion, weil das Limit des Kontos und der Betrag des Handoffs sonst bei der nächsten Änderung verschiedene Beträge annehmen.

Linse Q, Frage 2 (Logik-Duplikate), Merge c141093. Kein späterer Commit auf `origin/dev` hat die beiden Stellen geändert.
Übernommen: PRO-23679 Glied 2 (2026-11-17)
