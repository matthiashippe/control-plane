# GOAL.md

## Status
ACTIVE

## Active Objective
Rest von Phase 1: `/v1/automatons/register` mit EIP-712-Prüfung, `/v1/credits/pricing`,
Sandbox-Stubs, `/v1/credits/transfer` als 501; der komplette Erstlauf der unveränderten
Upstream-Runtime (Provisionierung, Registrierung, Bootstrap-Topup, fünf Turns, Schlaf) läuft ohne
einen einzigen Conway-API-Fehler im Runtime-Log durch.

## Done Condition
- [ ] `pnpm test` grün, `test/register.test.ts` mit mindestens 6 Tests: gültige Registrierung
      (Payload-Hash nachgerechnet, EIP-712-Signatur wie im Runtime-Client) -> 200 `{ automaton }`;
      manipulierter Payload-Hash -> 400; fremde Signatur -> 401; `automaton_address` ungleich
      Key-Wallet -> 403; zweite Registrierung derselben ID mit anderer Adresse -> 409; Wiederholung
      mit gleicher Adresse -> 200 idempotent; `/v1/credits/pricing` -> `{ tiers: [] }`-kompatibel;
      `/v1/credits/transfer` -> 501
      Prüfung: `pnpm test` exit 0, `grep -c "it(" test/register.test.ts` >= 6
- [ ] `pnpm e2e` grün (kompletter Erstlauf)
      Prüfung: `pnpm e2e` exit 0, Ausgabe enthält `E2E OK turns=5 registered=true api_errors=0
      ledger_consistent=true`; das Runtime-Log enthält `Automaton identity registered.` und keine
      Zeile mit `Conway API error` oder `registration failed`
- [ ] Alle bisherigen E2E-Läufe bleiben grün
      Prüfung: `pnpm e2e:inference` enthält `INFERENCE OK`, `pnpm e2e:topup` enthält `TOPUP OK`,
      `pnpm e2e:smoke` enthält `SMOKE OK`
- [ ] Nach den E2E-Läufen ist die Umgebung abgeräumt
      Prüfung: `docker compose -f harness/docker-compose.yml ps -q` ist leer
- [ ] goal-verifier PASS

## Acceptance Criteria
- [ ] Register gemäß docs/protocol.md: `payload_hash` = keccak256 des JSON der alphabetisch
      sortierten Felder `automaton_id, automaton_address, creator_address, name, bio`
      (+ `genesis_prompt_hash`, falls gesendet) wird serverseitig nachgerechnet; Signatur EIP-712
      Domain `{ name: "AIWS Automaton", version: "1", chainId: 8453 }`, Typ
      `Register(string automatonId, string nonce, bytes32 payloadHash)` gegen `automaton_address`
- [ ] Tabelle `automatons` (id, address, creator, name, bio, genesis_prompt_hash, registered_at);
      Antwort `{ automaton: { automaton_id, automaton_address, creator_address, name, bio, registered_at } }`
- [ ] `GET /v1/credits/pricing` -> `{ tiers: [], topup_tiers_usd: [5, 25, 100, 500, 1000, 2500] }`
- [ ] `POST /v1/credits/transfer` und `/v1/credits/transfers` -> `501 { error: "not_implemented",
      reason: ... }` (Entscheidung in STATE.md); kein Transfer-Code
- [ ] `harness/e2e/full.sh` zählt `Conway API error`- und `registration failed`-Zeilen im
      Runtime-Log und prüft `Automaton identity registered.`
- [ ] docs/protocol.md Abschnitt Registry um die serverseitige Prüfung ergänzt

## Deny List
- Kein Transfer-Code, kein echter Provider, kein `deploy/`, kein Patch an der Runtime

## Budget
- max Zyklen: 8
- max Versuche pro Gap: 3

## Progress Log
- 2026-09-18 22:40 Zyklus 1: src/registry.ts (Hash nachrechnen, EIP-712, 403 bei fremder Adresse, 409/idempotent), Tabelle automatons, /v1/credits/pricing, Transfer 501 auf beiden Pfaden, 8 Unit-Tests (register.test.ts), full.sh mit Fehlerzählung, protocol.md Registry/Pricing/Transfer. Eigene Läufe: E2E OK turns=5 registered=true api_errors=0 ledger_consistent=true balance_cents=489; INFERENCE OK, TOPUP OK, SMOKE OK; 38 Unit-Tests. Verifier ausstehend.

## Blockers
