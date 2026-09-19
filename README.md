# control-plane

Drop-in-Ersatz für `api.conway.tech`: Ein Server, der die Teilmenge der Conway-API bedient, die
die unveränderte Automaton-Runtime (`Conway-Research/automaton`) aufruft. Nutzer stellen in
`~/.automaton/automaton.json` nur `conwayApiUrl` um; Provisionierung per SIWE, Prepaid-Credits per
x402-Topup (USDC auf Base), Inferenz mit serverseitiger Abbuchung.

Protokoll: `docs/protocol.md`. Bauplan und Stand: `STATE.md`. Arbeitsweise: `LOOP.md`.

Status 19.09.2026: **Läuft öffentlich unter `https://cp.hippe.eu`** (VM `srv1336627`, Caddy mit
Let's Encrypt, OpenRouter als Einkauf, PayAI als x402-Facilitator auf Base Mainnet; `deploy/`).
Beide Abnahmestufen bestanden (19.09.2026): Stufe 1 (`pnpm e2e:mainnet`) mit SIWE-Provisionierung
und Tier-1-Topup, Settlement `0xab5932…0733a`; Stufe 2 (`pnpm e2e:prod`) mit dem Erstlauf der
unveränderten Upstream-Runtime als Container auf der VM, Bootstrap-Topup 5 USD (Settlement
`0x6cde28b0…54dc68`, 3 s), Registrierung, fünf Turns auf `gpt-5.2`, Schlaf, ohne API-Fehler.
Im Docker-Harness läuft Phase 1 komplett offline (`pnpm e2e`) und mit echtem Einkauf
(`pnpm e2e:live`).

Einkauf: OpenRouter (`CP_PROVIDER=openrouter`), Verkauf = tatsächliche Einkaufskosten x 1,3,
Saldo intern in Millicents. Die Runtime fragt `gpt-5.2` und `gpt-5-mini` aus ihrer Routing-Matrix;
der Katalog bedient sie als Aliase auf `openai/gpt-5.2` und `openai/gpt-5-mini`.

E2E-Läufe: `pnpm e2e:smoke`, `pnpm e2e:topup`, `pnpm e2e:inference`, `pnpm e2e` (alle offline,
Mock-Provider, Anvil), `pnpm e2e:openrouter` und `pnpm e2e:live` (brauchen `OPENROUTER_API_KEY`
in der Umgebung, kosten Cent-Beträge), `pnpm e2e:mainnet` (Stufe 1 gegen `CP_URL`, 1 USDC) und
`pnpm e2e:prod` (Stufe 2 auf der VM, 5 USDC, nichts lokal).
