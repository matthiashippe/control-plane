# AGENTS.md

Conway-kompatibles Control Plane: Server, der die Teilmenge der Conway-API nachbaut, die die
unveränderte Automaton-Runtime aufruft, damit Nutzer nur `conwayApiUrl` umstellen. Protokoll in
`docs/protocol.md`, Bauplan in `STATE.md`, aktives Ziel in `GOAL.md`, Regeln in `loop-constraints.md`.

## Befehle

- `pnpm install`, `pnpm build`, `pnpm typecheck`
- `pnpm test`: Unit (vitest), ohne Docker
- `pnpm e2e:smoke`: Harness hochfahren (Docker Compose), Provisionierung prüfen, runterfahren
- `pnpm e2e`: kompletter Erstlauf der Upstream-Runtime gegen das Control Plane
- `pnpm dev`: Control Plane lokal auf 127.0.0.1:8402 ohne TLS (nur für Unit-nahe Handarbeit)

## Konventionen

- Node 22, TypeScript ESM, Hono + `@hono/node-server`, better-sqlite3, viem, siwe. Keine weiteren
  Frameworks ohne Grund in GOAL.md.
- Geld-Beträge als Integer-Cents (Credits) bzw. bigint atomare USDC (6 Dezimalen). Nie float.
- Jede Gutschrift und Abbuchung ist eine Ledger-Zeile in derselben SQLite-Transaktion wie der
  Saldo. Idempotenz über den Schlüssel, den der Client liefert (x402-Nonce, Idempotency-Key).
- Harness (`harness/`) ist die einzige Stelle, die selbst on-chain settlet. Produktionscode nutzt
  ausschließlich einen externen Facilitator.
- Deutsch in Doku und Commit-Messages, Code-Bezeichner Englisch.
