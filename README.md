# control-plane

Drop-in-Ersatz für `api.conway.tech`: Ein Server, der die Teilmenge der Conway-API bedient, die
die unveränderte Automaton-Runtime (`Conway-Research/automaton`) aufruft. Nutzer stellen in
`~/.automaton/automaton.json` nur `conwayApiUrl` um; Provisionierung per SIWE, Prepaid-Credits per
x402-Topup (USDC auf Base), Inferenz mit serverseitiger Abbuchung.

Protokoll: `docs/protocol.md`. Bauplan und Stand: `STATE.md`. Arbeitsweise: `LOOP.md`.

Status 19.09.2026: Phase 1 läuft im Docker-Harness komplett gegen die unveränderte Upstream-Runtime
(`pnpm e2e`: Provisionierung, Registrierung, Bootstrap-Topup über x402, fünf Turns, Schlaf, ohne
API-Fehler; `pnpm e2e:live` dasselbe mit OpenRouter als echtem Einkauf). Nichts davon läuft
öffentlich; Goal 5b (Betrieb) wartet auf Domain und payTo-Wallet.

Einkauf: OpenRouter (`CP_PROVIDER=openrouter`), Verkauf = tatsächliche Einkaufskosten x 1,3,
Saldo intern in Millicents. Die Runtime fragt `gpt-5.2` und `gpt-5-mini` aus ihrer Routing-Matrix;
der Katalog bedient sie als Aliase auf `openai/gpt-5.2` und `openai/gpt-5-mini`.

E2E-Läufe: `pnpm e2e:smoke`, `pnpm e2e:topup`, `pnpm e2e:inference`, `pnpm e2e` (alle offline,
Mock-Provider, Anvil), `pnpm e2e:openrouter` und `pnpm e2e:live` (brauchen `OPENROUTER_API_KEY`
in der Umgebung, kosten Cent-Beträge).
