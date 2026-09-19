# GOAL.md

## Status
DONE (2026-09-19 17:20, Verifier PASS im dritten Zyklus)

## Active Objective
Betrieb: Das Control Plane läuft unter `https://cp.hippe.eu` auf `srv1336627` mit Caddy (Let's
Encrypt), OpenRouter als Einkauf und PayAI als x402-Facilitator auf Base Mainnet; eine
Wegwerf-Wallet kauft mit 1 USDC Credits über den Betreiber-Tier 1, die Gutschrift ist im Ledger
und die Zahlung auf Basescan sichtbar.

## Done Condition
- [x] `pnpm test` grün, `test/facilitator.test.ts` mit mindestens 5 Tests (fetch gestubbt):
      `/verify` und `/settle` bekommen den v1-Payload der Runtime 1:1 plus v1-Requirements mit
      `network: "base"`, `extra: { name: "USD Coin", version: "2" }`; `isValid: false` -> kein settle,
      Fehler; `success: false` -> Fehler mit `errorReason`; `success: true` -> txHash; Tiers aus
      `CP_TOPUP_TIERS_USD` (Default 5,25,100,500,1000,2500), Tier 1 nur wenn konfiguriert
      Prüfung: `pnpm test` exit 0, `grep -c "it(" test/facilitator.test.ts` >= 5
- [x] DNS: `cp.hippe.eu` zeigt auf 76.13.144.207, DNS-only
      Prüfung: `dig +short cp.hippe.eu` = `76.13.144.207`
- [x] Dienst läuft mit gültigem Zertifikat
      Prüfung: `curl -s https://cp.hippe.eu/health` -> `{"ok":true,...}` ohne `-k`
- [x] `pnpm e2e:mainnet` grün (Stufe 1, Wegwerf-Wallet, 1 USDC, Tier 1); ausgeführt am 19.09.2026,
      16:20, Ausgabe im Progress Log; die Wallet ist danach leer, der Lauf wird nicht wiederholt
      Prüfung (ohne Geld): `eth_getTransactionReceipt` für
      `0xab5932250f3ad00e2efbbc5adb74defd045b4d719f9759baedc1b2ae3440733a` über
      `https://mainnet.base.org` hat `status 0x1` und ein USDC-Transfer-Log (Topic
      `0xddf252ad...`) von `0xd24f37d0838e62621ed24111164485ded0f0924f` an
      `0x914102284463f4f58b1d2f6db9ac80bfcaa7d614` über 1000000; auf der VM liefert
      `docker compose -f docker-compose.prod.yml exec -T cp node -e ...` (siehe deploy/README, Abnahme)
      ein Payment `settled` mit diesem tx_hash und eine Ledger-Zeile `topup` 100000 mc
- [x] Offline-Läufe bleiben grün
      Prüfung: `pnpm e2e` enthält `E2E OK`
- [x] goal-verifier PASS

## Acceptance Criteria
- [x] `src/payments/facilitator.ts`: `FacilitatorSettler` (`CP_SETTLER=facilitator`,
      `CP_FACILITATOR_URL`, Default `https://facilitator.payai.network`, optional
      `CP_FACILITATOR_AUTH` als Authorization-Header): erst `/verify`, dann `/settle`, Timeout 60 s,
      Fehler als `SettleResult { ok: false, error }`; kein eigenes On-Chain-Senden
- [x] Tiers konfigurierbar (`CP_TOPUP_TIERS_USD`), Angebot und Validierung nutzen dieselbe Liste,
      `/v1/credits/pricing` zeigt sie
- [x] `deploy/`: `docker-compose.prod.yml` (cp + caddy, Volumes für DB und Zertifikate),
      `Caddyfile` (`cp.hippe.eu` -> `cp:8402`), `.env.example` (alle CP_*-Variablen mit Kommentar,
      ohne Werte für Keys), `up.sh` (rsync + `docker compose up -d --build` über SSH),
      `README.md` (Erstinstallation, Update, Logs, Backup der SQLite)
- [x] Auf der VM: Docker, Compose, UFW (22, 80, 443), Dienst per Compose mit `restart: unless-stopped`;
      Secrets nur in `/opt/control-plane/.env` (Mode 600), nie im Repo
      (SSH: `ssh -i ~/.ssh/id_ed25519_automaton root@76.13.144.207`)
- [x] `harness/e2e/mainnet.ts`: erzeugt oder lädt eine Wegwerf-Wallet unter
      `harness/state/mainnet-wallet.json` (gitignored), zeigt Adresse und USDC-Saldo, wartet auf
      Guthaben, signiert x402 v1 wie der Runtime-Client, ruft `/pay/1/<addr>` gegen `CP_URL`,
      prüft 200, `credits_cents`, `tx_hash`, und liest den Saldo per SIWE-provisioniertem Key
- [x] Stufe 2 (`pnpm e2e:prod`, Runtime-Erstlauf als Container auf der VM gegen cp.hippe.eu mit
      5 USDC) ist ausgeführt (Go von Matthias am 19.09.2026, "ums Geld soll's nicht gehen")
      Prüfung (ohne Geld): `harness/e2e/prod.sh` und Skript `e2e:prod` in package.json existieren;
      `eth_getTransactionReceipt` für
      `0x6cde28b017fa62b14ed9f3425cbc417dd56137e2d4a4022161f880478954dc68` hat status 0x1 und ein
      USDC-Transfer-Log über 5000000 von der Wegwerf-Wallet an payTo; VM-Ledger zeigt zwei Payments
      `settled` (100000 und 500000 mc) und mindestens fünf Inferenz-Zeilen für die Wegwerf-Wallet;
      auf der VM existieren weder Container `abnahme` noch Volume `abnahme-home` noch
      `/opt/control-plane/abnahme`; `/opt/control-plane/.env` enthält Tier 1 nicht mehr
      (`curl -s -o /dev/null -w '%{http_code}' https://cp.hippe.eu/pay/1/<addr>` = 400)
- [x] docs/protocol.md: Facilitator-Abschnitt (PayAI v1, Gebühr ab 21.09.2026), Betreiber-Tiers

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
- 2026-09-19 11:55 Zyklus 1 (Teil ohne VM): FacilitatorSettler (PayAI v1 pass-through, 7 Unit-Tests), Tiers konfigurierbar (CP_TOPUP_TIERS_USD), DNS cp.hippe.eu -> 76.13.144.207 gesetzt und aufgelöst, deploy/ (Compose prod, Caddyfile, .env.example, setup-vm.sh, up.sh, README), harness/e2e/mainnet.ts (Stufe 1), protocol.md Facilitator-Abschnitt. 54 Unit-Tests, E2E OK offline. Offen: VM-Setup, Deploy, Stufe 1 (braucht SSH-Key und 1 USDC auf der Wegwerf-Wallet). Verifier erst nach Deploy.
- 2026-09-19 15:45 VM: alten openclaw-Container samt Volumes, /root/outlook-bridge und Compose-Verzeichnis entfernt (Freigabe von Matthias), setup-vm.sh (Docker 29.2.1 vorhanden, UFW aktiv), .env per SSH-stdin mit OpenRouter-Key (Mode 600), up.sh: cp healthy, Caddy mit LE-Zertifikat; `curl https://cp.hippe.eu/health` 200 ssl_verify=0; 402-Angebot für Tier 1 korrekt.
- 2026-09-19 16:20 Stufe 1: Matthias hat 2 USDC von Arbitrum nach Base gebridged und 1 USDC an die Wegwerf-Wallet 0xd24F…924F gesendet. `CP_URL=https://cp.hippe.eu pnpm e2e:mainnet` -> `MAINNET OK tier=1 credits_cents=100 tx=0xab5932250f3ad00e2efbbc5adb74defd045b4d719f9759baedc1b2ae3440733a`. Receipt: status 0x1, Block 51518599, Relayer 0xc6699d2aada6c36dfea5c248dd70f9cb0235cb63 (PayAI), Transfer 1,0 USDC an payTo. VM-Ledger: payment settled mit tx_hash, topup 100000 mc. Verifier ausstehend.
- 2026-09-19 17:05 Verifier (Sonnet, 2. Lauf): REJECT, ein Gap: README beschrieb Stufe 2 noch als "vorbereitet" (der Live-Stand-Commit lag vor dem Stufe-2-Lauf).
- 2026-09-19 17:10 Zyklus 3: README auf beide bestandenen Abnahmestufen korrigiert. Verifier-Nachprüfung: PASS (Sonnet). Beide On-Chain-Receipts, VM-Zustand, Tier-1-Sperre, Aufräumen und Deny-List belegt.
- 2026-09-19 16:35 Verifier (Sonnet): REJECT. Gaps: `pnpm e2e:prod` fehlte, Repo-README auf altem Stand.
- 2026-09-19 16:50 Zyklus 2: harness/e2e/prod.sh + setup.prod.json (Runtime-Container auf der VM, Wegwerf-Wallet als Runtime-Wallet, Aufräumen inklusive), README auf Live-Stand. Zwei Anläufe (fehlendes Zielverzeichnis für rsync; uid des Runtime-Users ist nicht 1000), dann `PROD OK topup=true registered=true turns=5 api_errors=0 ledger_consistent=true uncollected_mc=0 tx=0x6cde28b017fa62b14ed9f3425cbc417dd56137e2d4a4022161f880478954dc68`. Bootstrap-Topup 3 s (Timeout der Runtime 15 s). Danach Tier 1 aus .env entfernt, up.sh, /pay/1 -> 400. Verifier ausstehend.
- 2026-09-19 17:05 Verifier (Sonnet, 2. Lauf): REJECT, ein Gap: README beschrieb Stufe 2 noch als "vorbereitet" (der Live-Stand-Commit lag vor dem Stufe-2-Lauf).
- 2026-09-19 17:10 Zyklus 3: README auf beide bestandenen Abnahmestufen korrigiert. Verifier-Nachprüfung: PASS (Sonnet). Beide On-Chain-Receipts, VM-Zustand, Tier-1-Sperre, Aufräumen und Deny-List belegt.

## Blockers
- (erledigt 19.09.2026, 15:40) SSH-Key im hPanel hinterlegt, Zugang geht.
