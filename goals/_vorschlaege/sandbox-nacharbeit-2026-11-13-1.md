Schwere: 1
Goal: sandbox 02
Befund: Die Sandbox-Goals hinterlassen tote Verweise und ungenutzte Rückgaben: `src/db.ts` verweist für die Abrechnung auf `src/sandbox/billing.ts`, die es nie gab, `cloudflare.py` nennt eine Aktion `remove-aaaa`, die `plan()` nie liefert, und `sandboxd.mjs` wie `service.ts` geben Glieder zurück, die niemand liest.
Beleg: `git log --all --oneline -- src/sandbox/billing.ts | wc -l; git grep -n -E "ownerFor|remove-aaaa" origin/dev -- src ops; git grep -n -E "\.(verifier|seen)\b" origin/dev -- src test ops harness | grep -vc sandboxd.mjs` -> `0`, dann nur src/sandbox/service.ts:223, :443, :619 und ops/sandbox/cloudflare.py:64, dann `0` | src/db.ts:510, ops/sandbox/cloudflare.py:64, ops/sandbox/sandboxd.mjs:143 und :691, src/sandbox/service.ts:619
Empfehlung: In src/db.ts:510 `src/sandbox/service.ts` nennen; in cloudflare.py:64 `remove-aaaa` streichen (ein AAAA ergibt `conflict`); `seen` aus der Rückgabe von `createVerifier`, `verifier` und `config` aus der von `createSandboxd` und `ownerFor` aus der von `createSandboxService` nehmen.
MVP: Schönheit

Linse Q, Frage 3 (tote Pfade, ungenutzte Rückgaben), gebündelt über sandbox 02 (cloudflare.py, sandboxd.mjs) und sandbox 03 (db.ts, service.ts).
Den Verweis auf billing.ts haben die Linsen K und B schon an die Nacharbeit gegeben (goals/sandbox/verdicts/03-z4-K.md:28, 03-z4-B.md und 03-z3-K.md im Abschnitt Hinweis).
`ownerFor` wird nur intern in service.ts:443 gerufen; `d.config` liest weder ein Test noch der Harness.
Verworfen: Schwere 1, tote Verweise und ungenutzte Rückgaben ohne Wirkung beim Kunden (2026-11-14)
