# control-plane

Drop-in-Ersatz für `api.conway.tech`: Ein Server, der die Teilmenge der Conway-API bedient, die
die unveränderte Automaton-Runtime (`Conway-Research/automaton`) aufruft. Nutzer stellen in
`~/.automaton/automaton.json` nur `conwayApiUrl` um; Provisionierung per SIWE, Prepaid-Credits per
x402-Topup (USDC auf Base), Inferenz mit serverseitiger Abbuchung.

Protokoll: `docs/protocol.md`. Bauplan und Stand: `STATE.md`. Arbeitsweise: `LOOP.md`.

Status 18.09.2026: Phase 1 läuft im Docker-Harness komplett gegen die unveränderte Upstream-Runtime
(`pnpm e2e`: Provisionierung, Registrierung, Bootstrap-Topup über x402, fünf Turns, Schlaf, ohne
API-Fehler). Nichts davon läuft öffentlich; Goal 5 (Betrieb) wartet auf Domain, payTo-Wallet und
Einkaufsquelle.
