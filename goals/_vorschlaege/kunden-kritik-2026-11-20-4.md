Schwere: 3
Goal: kunden 06
Befund: Von den drei Auslösern der Startgutschrift schreibt nur der neue einen Grund ins Ledger (`trigger: "first balance read"`); `grantOnFirstUse` aus `src/inference/proxy.ts` und `grantToWaitingRuntime` buchen ohne `trigger`. Der Block `runtime_funnel` zählt nur, ob eine Runtime eine Gutschrift bekam, nicht auf welchem Aufruf. Nach einer Woche zeigt die Leitzahl dann, ob mehr Runtimes eine Gutschrift bekommen, aber nicht, ob der erste Lesezugriff das bewirkt oder nur die Gutschrift vorzieht, die die Runtime beim ersten Denken ohnehin bekommen hätte.
Beleg: `grep -n "grantOnFirstUse(db" src/inference/proxy.ts src/credits/starter.ts` -> nur `src/credits/starter.ts:486` übergibt `{ trigger: ... }`.
Empfehlung: Die beiden bisherigen Auslöser schreiben `trigger: "first use"` und `trigger: "kept asking"`, und `runtime_funnel` in `ops/db-report.cjs` gibt je Woche die Zahl der Gutschriften je `trigger` aus (fehlt der Grund, zählt er als `unknown`). So beantwortet der Lauf von `ops/status.sh` eine Woche nach dem Rollout, ob der neue Auslöser Runtimes hält, die vorher gingen.

Übernommen: Glied 2 an den Tech Lead, kunden 09 (PRO-26356) (2026-11-21)
