# Loop State: control-plane

Last run: 2026-09-18 22:52 (Goal 4 DONE, Phase 1 im Harness komplett)

## High Priority (Build-Queue, ein Goal je Zeile, Reihenfolge bindend)

1. **Goal 1, Harness-Gerüst**: Docker-Compose mit Anvil (chainId 8453, USDC-Mock an der
   Mainnet-Adresse), Control Plane hinter TLS (eigene CA), Upstream-Runtime `d8f8168` unverändert.
   Done: `pnpm e2e:smoke` grün: `/health` über TLS aus dem Runtime-Container, `automaton --provision`
   liefert einen `cnwy_k_`-Key. Status: DONE 18.09.2026, `goals/2026-09-18-goal-1-harness-geruest.md`
2. **Goal 2, Topup** (DONE 18.09.2026, `goals/2026-09-18-goal-2-topup.md`): `/pay/5/<addr>` als x402-v1-Seller mit lokalem Settler gegen Anvil;
   Bootstrap-Topup der Runtime verbucht 500 Cents; dieselbe Signatur zweimal = eine Gutschrift.
3. **Goal 3, Inferenz** (DONE 18.09.2026, `goals/2026-09-18-goal-3-inferenz.md`; Fund: Runtime fragt `gpt-5.2`/`gpt-5-mini` aus der Routing-Matrix, Katalog-Aliase nötig): `/v1/chat/completions` Proxy mit Mock-Provider und serverseitiger
   Abbuchung (Listenpreis x 1,3); fünf Turns der Runtime, Ledger-Summe = Abbuchung, 402-Format bei
   leerem Konto.
4. **Goal 4, Rest von Phase 1** (DONE 18.09.2026, `goals/2026-09-18-goal-4-phase-1-komplett.md`): `/v1/automatons/register` (EIP-712-Prüfung),
   `/v1/credits/pricing`, Sandbox-Stubs, `/v1/credits/transfer` vorerst 501 (Entscheidung unten);
   kompletter Erstlauf der Upstream-Runtime grün (`pnpm e2e`).
5. **Goal 5, Betrieb** (WARTET auf Entscheidungen, kein GOAL.md angelegt): Anthropic als erster echter Provider, Deploy auf `srv1336627` mit Caddy,
   Facilitator CDP oder PayAI, Statusseite, einmalige Abnahme mit Wegwerf-Wallet auf Base Mainnet.
   Braucht Entscheidungen: Domain, payTo-Wallet.

## Entscheidungen bei Matthias

- **Credit-Transfer** (`POST /v1/credits/transfer`, Runtime-Tools `transfer_credits`, `fund_child`):
  Handoff-Leitplanke sagt "nicht übertragbar" (E-Geld-Abgrenzung, Recherche 6.2), Constraints
  erlauben Transfer innerhalb des Control Plane. Phase 1 antwortet 501; Solo-Automatons brauchen
  ihn nicht. Option für später: Transfer nur zwischen Wallets desselben `creator_address`.
- Domain und Markenname, payTo-Wallet (HTC), Inferenz-Einkauf im Betrieb: unverändert offen
  (siehe Goal 5).

## Watch List

- Upstream-Drift: `Conway-Research/automaton` main gegen `d8f8168` (Protokolländerungen an
  provision.ts, topup.ts, x402.ts, conway/client.ts, conway/inference.ts).
- Conway-Issues #339, #377 (Onboarding kaputt), #393 (doppelte Abbuchung) als GTM-Einstieg,
  erst nach Goal 5.
- Facilitator-Preise: PayAI ab 21.09.2026 0,00212 USD je Settlement; CDP 1.000 frei pro Monat.

## Recent Noise (ignored this run)

---
Run log: loop-run-log.md
