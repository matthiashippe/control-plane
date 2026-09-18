# GOAL.md

## Status
DONE (2026-09-18 21:52, Verifier PASS)

## Active Objective
Harness-Gerüst: Die unveränderte Upstream-Runtime (`Conway-Research/automaton@d8f8168`) erreicht das
Control Plane in Docker über TLS und provisioniert sich per SIWE einen API-Key.

## Done Condition
- [x] `pnpm test` grün (Unit: SIWE-Verify lehnt falsche Signatur, fremde Domain, verbrauchte und
      unbekannte Nonce ab; akzeptiert eine korrekte Message; api-keys nur mit gültigem access_token)
      Prüfung: `pnpm test` exit 0, mindestens 6 Tests in `test/auth.test.ts`
- [x] `pnpm e2e:smoke` grün
      Prüfung: `pnpm e2e:smoke` exit 0 und Ausgabe enthält `SMOKE OK key_prefix=cnwy_k_`
- [x] Der Smoke-Test läuft gegen die unveränderte Upstream-Revision
      Prüfung: `grep -n "d8f8168" harness/runtime/Dockerfile` trifft, und `harness/runtime/` enthält
      keine Patches an `src/` der Runtime (nur Dockerfile, entrypoint, setup-Skript, setup.json)
- [x] Nach dem Smoke-Test ist die Umgebung abgeräumt
      Prüfung: `docker compose -f harness/docker-compose.yml ps -q` ist leer
- [x] goal-verifier PASS

## Acceptance Criteria
- [x] `POST /v1/auth/nonce`, `POST /v1/auth/verify`, `POST /v1/auth/api-keys` gemäß `docs/protocol.md`
- [x] Key wird nur als sha256-Hash gespeichert, `key_prefix` im Klartext, Wallet-Adresse verknüpft
- [x] `GET /v1/credits/balance` mit dem frischen Key liefert `200 { "balance_cents": 0 }`; ohne oder mit
      falschem Key `401`
- [x] `GET /health` liefert `200 { "ok": true, "version": ... }`
- [x] TLS über eigene CA (`harness/gen-certs.sh`), Runtime-Container mit `NODE_EXTRA_CA_CERTS`
- [x] Runtime-Konfiguration nur über `automaton.json` (`conwayApiUrl`) und `CONWAY_API_URL` für
      `--provision`, keine Änderung am Runtime-Code

## Deny List
- `harness/runtime/` darf keinen Runtime-Quellcode enthalten oder patchen
- Kein Anvil, kein `/pay`, keine Inferenz in diesem Goal (Goal 2 und 3)
- Keine Änderung an `deploy/`

## Budget
- max Zyklen: 8
- max Versuche pro Gap: 3

## Progress Log
- 2026-09-18 21:43 Zyklus 1: Server (Hono, SQLite, SIWE nonce/verify/api-keys, balance, sandbox-stubs), 10 Unit-Tests, Harness (CA-Zertifikate, cp- und runtime-Image mit d8f8168, smoke.sh). Eigener Smoke-Lauf: SMOKE OK key_prefix=cnwy_k_83ce4b96. Verifier ausstehend.
- 2026-09-18 21:52 Verifier (Sonnet): PASS. Eigener Smoke-Lauf des Verifiers: SMOKE OK key_prefix=cnwy_k_d5198f47; 10/10 Unit-Tests; keine Mocks/Skips; Scope sauber. Hinweis: Kommentar in siwe.ts zur URI-Prüfung war falsch, korrigiert.

## Blockers
