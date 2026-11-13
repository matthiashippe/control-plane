Schwere: 1
Goal: sandbox 04
Befund: sandbox 04 kopiert die Ledger-Abfrage der Sandbox aus `ops/live.sh` nach `ops/runtime-sandbox.sh` (samt Rückfall auf `node:sqlite`, Prüfung der id und `ssh`-Zeile) und die Liste der Status, die die Runtime wiederholt, aus `test/sandbox-world.ts` nach `harness/e2e/sandbox-walk.mjs`, statt sie zu teilen.
Beleg: `git grep -n -F 'FROM ledger WHERE kind = ? AND ref LIKE ?").get("sandbox", "sandbox:" + id + ":%")' origin/dev -- ops/` -> `ops/live.sh:133`, `ops/runtime-sandbox.sh:37`; `git grep -n -F '[429, 500, 502, 503, 504];' origin/dev -- harness test` -> `harness/e2e/sandbox-walk.mjs:24`, `test/domains.test.ts:29`, `test/sandbox-world.ts:21` | ops/runtime-sandbox.sh:115 gegen ops/live.sh:279
Empfehlung: Die Abfrage der Sandbox-Zeilen einmal unter `ops/` ablegen (etwa eine Datei mit dem JS, die `ops/live.sh` und `ops/runtime-sandbox.sh` lesen, `runtime-sandbox.sh` ergänzt nur `hold_mc`), und `RETRIED` nur in `harness/e2e/sandbox-walk.mjs` führen, das `test/sandbox-world.ts` und `test/domains.test.ts` importieren.
MVP: Schönheit

Linse Q, Frage 2 (Logik-Duplikate). Ändert sich das Format `sandbox:<id>:<n>` aus `src/sandbox/service.ts:265`, müssen `ops/live.sh`, `ops/runtime-sandbox.sh` und `harness/e2e/full.sh:107` einzeln nachgezogen werden. Die `ssh`-Zeile gehört zur Klasse aus `abrechnung-nacharbeit-2026-11-12-1` (gemeinsamer Lesehelfer), neu ist hier die kopierte Abfrage. `test/domains.test.ts:29` (domains 01) kam vor `test/sandbox-world.ts`, die Kopie in `sandbox-walk.mjs:24` ist die dritte.
