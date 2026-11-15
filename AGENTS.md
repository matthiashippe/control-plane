# AGENTS.md

Conway-kompatibles Control Plane: Server, der die Teilmenge der Conway-API nachbaut, die die
unveränderte Automaton-Runtime aufruft, damit Nutzer nur `conwayApiUrl` umstellen. Protokoll in
`docs/protocol.md`. Seit dem 10.11.2026 läuft die Arbeit als Paperclip-Loop: zuerst `LOOP.md`, dann `loop-constraints.md`
(bindend), `ROADMAP.md`, `docs/kette.md`, `STATE.md` und die Goal-Datei unter `goals/<topic>/`. `GOAL.md` ist Geschichte.
Erprobte Wege und Fallen beim Prüfen, Messen und Testen auf dem code-host stehen in `docs/loop-fallen.md`.

## Befehle

- `pnpm install`, `pnpm build`, `pnpm typecheck`
- `pnpm test`: Unit (vitest), ohne Docker
- `pnpm e2e:smoke`: Harness hochfahren (Docker Compose), Provisionierung prüfen, runterfahren
- `pnpm e2e`: kompletter Erstlauf der Upstream-Runtime gegen das Control Plane
- `pnpm dev`: Control Plane lokal auf 127.0.0.1:8402 ohne TLS (nur für Unit-nahe Handarbeit)

Auf dem code-host, wo die Loop-Rollen arbeiten, gibt es kein Docker: `pnpm e2e`, `pnpm e2e:smoke` und jeder
Caddy-Container fallen dort aus, und `docker: command not found` kommt erst nach dem Aufsetzen. `pnpm e2e` läuft deshalb im
Job `e2e` auf GitHub-Rechnern (`check.yml`, `deploy.yml`). Lokal prüft man mit `pnpm dev` auf freiem Port (`CP_PORT`),
`CP_PROVIDER=mock`, einer Test-Adresse in `CP_PAY_TO` und `CP_DB_PATH` unter `/tmp`. Was erst Caddy liefert
(Sicherheits-Header, CSP-Hash, `request_body max_size`), fehlt dabei: `ops/smoke.sh <url> --no-proxy` überspringt genau diese
Prüfungen, und wer sie lokal braucht, setzt einen eigenen kleinen Proxy davor, der die Werte aus `deploy/Caddyfile` liest (am
19.09.2026 reichte ein Node-Wegwerf-Skript).

## Konventionen

- Node 22, TypeScript ESM, Hono + `@hono/node-server`, better-sqlite3, viem, siwe. Keine weiteren
  Frameworks ohne Grund in GOAL.md.
- Geld-Beträge als Integer-Cents (Credits) bzw. bigint atomare USDC (6 Dezimalen). Nie float.
- Jede Gutschrift und Abbuchung ist eine Ledger-Zeile in derselben SQLite-Transaktion wie der
  Saldo. Idempotenz über den Schlüssel, den der Client liefert (x402-Nonce, Idempotency-Key).
- Harness (`harness/`) ist die einzige Stelle, die selbst on-chain settlet. Produktionscode nutzt
  ausschließlich einen externen Facilitator.
- Deutsch in Doku und Commit-Messages, Code-Bezeichner Englisch.
- Unmittelbar vor jeder Handlung nach außen (ein freigegebener Kommentar über `ops/post-the-answers.py`, eine Testbestellung,
  die Wiederholung einer Vorführung) liest die Rolle den Issue-Thread per API neu, nicht nur den Weckruf vom Laufbeginn. Am 29.
  und 30.09.2026 kam ein STOPP mitten im Lauf, und beide Male lief die Außenwirkung trotzdem.
- Texte mit Backticks (Commit, PR, Kommentar) nur über ein gequotetes Heredoc (`<<'EOF'`) oder eine Datei übergeben: In einem
  ungequoteten Heredoc führt die Shell einen Befehl in Backticks wie `ops/deploy.sh` aus.
