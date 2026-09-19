# Betrieb auf srv1336627 (cp.hippe.eu)

Stack: Control Plane als Container (Image aus `harness/cp/Dockerfile`), Caddy davor mit
Let's-Encrypt-Zertifikat, SQLite unter dem Volume `cp-data`. Secrets liegen nur in
`/opt/control-plane/.env` auf der VM.

## Erstinstallation

1. SSH-Key `~/.ssh/id_ed25519_automaton.pub` im Hostinger-hPanel für die VM hinterlegen.
2. `deploy/setup-vm.sh` (Docker, UFW 22/80/443, Verzeichnis).
3. `.env` nach `/opt/control-plane/.env` (Vorlage `.env.example`), `chmod 600`.
4. DNS: `cp.hippe.eu` A-Record auf die VM, DNS-only (Cloudflare-Proxy aus, sonst kein HTTP-01).
5. `deploy/up.sh`. Caddy holt das Zertifikat beim ersten Request.
6. `curl -s https://cp.hippe.eu/health`.

## Update

`deploy/up.sh` (rsync des Repo-Stands, `docker compose up -d --build`). Die DB bleibt im Volume.

## Logs

```
ssh -i ~/.ssh/id_ed25519_automaton root@76.13.144.207 \
  'cd /opt/control-plane/repo/deploy && docker compose -f docker-compose.prod.yml logs -f --tail 100 cp'
```

## Backup der SQLite

```
ssh -i ~/.ssh/id_ed25519_automaton root@76.13.144.207 \
  'docker run --rm -v control-plane_cp-data:/data -v /opt/control-plane:/out alpine \
   sh -c "cp /data/cp.db /out/cp-$(date +%F).db"'
```
Die Datei enthält nur Key-Hashes, Salden und Ledger, keine Klartext-Keys.

## Abnahme

Stufe 1: `CP_URL=https://cp.hippe.eu pnpm e2e:mainnet` (Wegwerf-Wallet, 1 USDC, Tier 1).
Stufe 2: `pnpm e2e:prod` (Upstream-Runtime als Container auf der VM gegen cp.hippe.eu, Wegwerf-
Wallet aus Stufe 1 mit 5 USDC; baut, läuft, räumt den Container wieder ab), nur nach Go.
Danach `CP_TOPUP_TIERS_USD` in `.env` wieder ohne Tier 1 setzen und `deploy/up.sh`.
