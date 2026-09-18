# GOAL.md

## Status
ACTIVE

## Active Objective
Harness-Gerüst: Die unveränderte Upstream-Runtime (`Conway-Research/automaton@d8f8168`) erreicht das
Control Plane in Docker über TLS und provisioniert sich per SIWE einen API-Key.

## Done Condition
- [ ] `pnpm test` grün (Unit: SIWE-Verify lehnt falsche Signatur, fremde Domain, verbrauchte und
      unbekannte Nonce ab; akzeptiert eine korrekte Message; api-keys nur mit gültigem access_token)
      Prüfung: `pnpm test` exit 0, mindestens 6 Tests in `test/auth.test.ts`
- [ ] `pnpm e2e:smoke` grün
      Prüfung: `pnpm e2e:smoke` exit 0 und Ausgabe enthält `SMOKE OK key_prefix=cnwy_k_`
- [ ] Der Smoke-Test läuft gegen die unveränderte Upstream-Revision
      Prüfung: `grep -n "d8f8168" harness/runtime/Dockerfile` trifft, und `harness/runtime/` enthält
      keine Patches an `src/` der Runtime (nur Dockerfile, entrypoint, setup-Skript, setup.json)
- [ ] Nach dem Smoke-Test ist die Umgebung abgeräumt
      Prüfung: `docker compose -f harness/docker-compose.yml ps -q` ist leer
- [ ] goal-verifier PASS

## Acceptance Criteria
- [ ] `POST /v1/auth/nonce`, `POST /v1/auth/verify`, `POST /v1/auth/api-keys` gemäß `docs/protocol.md`
- [ ] Key wird nur als sha256-Hash gespeichert, `key_prefix` im Klartext, Wallet-Adresse verknüpft
- [ ] `GET /v1/credits/balance` mit dem frischen Key liefert `200 { "balance_cents": 0 }`; ohne oder mit
      falschem Key `401`
- [ ] `GET /health` liefert `200 { "ok": true, "version": ... }`
- [ ] TLS über eigene CA (`harness/gen-certs.sh`), Runtime-Container mit `NODE_EXTRA_CA_CERTS`
- [ ] Runtime-Konfiguration nur über `automaton.json` (`conwayApiUrl`) und `CONWAY_API_URL` für
      `--provision`, keine Änderung am Runtime-Code

## Deny List
- `harness/runtime/` darf keinen Runtime-Quellcode enthalten oder patchen
- Kein Anvil, kein `/pay`, keine Inferenz in diesem Goal (Goal 2 und 3)
- Keine Änderung an `deploy/`

## Budget
- max Zyklen: 8
- max Versuche pro Gap: 3

## Progress Log

## Blockers
