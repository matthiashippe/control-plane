# control-plane

Drop-in-Ersatz für `api.conway.tech`: Ein Server, der die Teilmenge der Conway-API bedient, die
die unveränderte Automaton-Runtime (`Conway-Research/automaton`) aufruft. Nutzer stellen in
`~/.automaton/automaton.json` nur `conwayApiUrl` um; Provisionierung per SIWE, Prepaid-Credits per
x402-Topup (USDC auf Base), Inferenz mit serverseitiger Abbuchung.

Protokoll: `docs/protocol.md`. Bauplan und Stand: `STATE.md`. Arbeitsweise: `LOOP.md`.

Status 18.09.2026: Goal 1 (Harness-Gerüst) in Arbeit. Nichts davon läuft öffentlich.
