# GOAL.md

## Status
ACTIVE

## Active Objective
Betrieb: Das Control Plane läuft unter `https://cp.hippe.eu` auf `srv1336627` mit Caddy (Let's
Encrypt), OpenRouter als Einkauf und PayAI als x402-Facilitator auf Base Mainnet; eine
Wegwerf-Wallet kauft mit 1 USDC Credits über den Betreiber-Tier 1, die Gutschrift ist im Ledger
und die Zahlung auf Basescan sichtbar.

## Done Condition
- [ ] `pnpm test` grün, `test/facilitator.test.ts` mit mindestens 5 Tests (fetch gestubbt):
      `/verify` und `/settle` bekommen den v1-Payload der Runtime 1:1 plus v1-Requirements mit
      `network: "base"`, `extra: { name: "USD Coin", version: "2" }`; `isValid: false` -> kein settle,
      Fehler; `success: false` -> Fehler mit `errorReason`; `success: true` -> txHash; Tiers aus
      `CP_TOPUP_TIERS_USD` (Default 5,25,100,500,1000,2500), Tier 1 nur wenn konfiguriert
      Prüfung: `pnpm test` exit 0, `grep -c "it(" test/facilitator.test.ts` >= 5
- [ ] DNS: `cp.hippe.eu` zeigt auf 76.13.144.207, DNS-only
      Prüfung: `dig +short cp.hippe.eu` = `76.13.144.207`
- [ ] Dienst läuft mit gültigem Zertifikat
      Prüfung: `curl -s https://cp.hippe.eu/health` -> `{"ok":true,...}` ohne `-k`
- [ ] `pnpm e2e:mainnet` grün (Stufe 1, Wegwerf-Wallet, 1 USDC, Tier 1)
      Prüfung: `pnpm e2e:mainnet` exit 0, Ausgabe `MAINNET OK tier=1 credits_cents=100 tx=0x...`,
      Transaktion auf `https://basescan.org/tx/<hash>` mit USDC-Transfer an
      `0x914102284463F4F58B1D2f6DB9aC80BFcaA7d614`
- [ ] Offline-Läufe bleiben grün
      Prüfung: `pnpm e2e` enthält `E2E OK`
- [ ] goal-verifier PASS

## Acceptance Criteria
- [ ] `src/payments/facilitator.ts`: `FacilitatorSettler` (`CP_SETTLER=facilitator`,
      `CP_FACILITATOR_URL`, Default `https://facilitator.payai.network`, optional
      `CP_FACILITATOR_AUTH` als Authorization-Header): erst `/verify`, dann `/settle`, Timeout 60 s,
      Fehler als `SettleResult { ok: false, error }`; kein eigenes On-Chain-Senden
- [ ] Tiers konfigurierbar (`CP_TOPUP_TIERS_USD`), Angebot und Validierung nutzen dieselbe Liste,
      `/v1/credits/pricing` zeigt sie
- [ ] `deploy/`: `docker-compose.prod.yml` (cp + caddy, Volumes für DB und Zertifikate),
      `Caddyfile` (`cp.hippe.eu` -> `cp:8402`), `.env.example` (alle CP_*-Variablen mit Kommentar,
      ohne Werte für Keys), `up.sh` (rsync + `docker compose up -d --build` über SSH),
      `README.md` (Erstinstallation, Update, Logs, Backup der SQLite)
- [ ] Auf der VM: Docker, Compose, UFW (22, 80, 443), Dienst per Compose mit `restart: unless-stopped`;
      Secrets nur in `/opt/control-plane/.env` (Mode 600), nie im Repo
- [ ] `harness/e2e/mainnet.ts`: erzeugt oder lädt eine Wegwerf-Wallet unter
      `harness/state/mainnet-wallet.json` (gitignored), zeigt Adresse und USDC-Saldo, wartet auf
      Guthaben, signiert x402 v1 wie der Runtime-Client, ruft `/pay/1/<addr>` gegen `CP_URL`,
      prüft 200, `credits_cents`, `tx_hash`, und liest den Saldo per SIWE-provisioniertem Key
- [ ] Stufe 2 (Runtime-Erstlauf mit 5 USDC gegen cp.hippe.eu) ist als `pnpm e2e:prod` vorbereitet,
      wird in diesem Goal aber nicht ausgeführt (Go von Matthias, STATE.md)
- [ ] docs/protocol.md: Facilitator-Abschnitt (PayAI v1, Gebühr ab 21.09.2026), Betreiber-Tiers

## Deny List
- Kein eigener On-Chain-Settler außerhalb von `harness/` (Regulatorik)
- Keine Änderung an Hanses VM `srv1327036`
- Keine Zahlung über 1 USDC ohne ausdrückliches Go
- Key-Werte (OpenRouter, Wallet-Keys) nie im Repo, nie im Chat, nie in Logs

## Budget
- max Zyklen: 8
- max Versuche pro Gap: 3
- Geld: 1 USDC (Stufe 1), kommt auf die payTo-Adresse

## Progress Log

## Blockers
- SSH auf `srv1336627` (76.13.144.207): `Permission denied (publickey)`; Matthias hinterlegt
  `~/.ssh/id_ed25519_automaton.pub` im Hostinger-hPanel (Stand 19.09.2026, 11:40)
