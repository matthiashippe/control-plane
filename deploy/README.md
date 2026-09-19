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

Das Volume heißt `deploy_cp-data` (Compose leitet den Projektnamen vom Verzeichnis `deploy/` ab),
nicht `control-plane_cp-data`; letzteres existiert auch, ist aber leer. Und die DB läuft im
WAL-Modus: `cp.db` ist nur wenige Kilobyte groß, der Inhalt steht im `-wal`. Ein `cp` der `.db`
allein ergibt ein leeres Backup. Deshalb über die laufende Anwendung sichern:

```
ssh -i ~/.ssh/id_ed25519_automaton root@76.13.144.207 \
  'cd /opt/control-plane/repo/deploy && docker compose -f docker-compose.prod.yml exec -T cp \
   node -e "const D=require(\"better-sqlite3\");new D(process.env.CP_DB_PATH,{readonly:true}).exec(\"VACUUM INTO '"'"'/data/backup-tmp.db'"'"'\")"
   docker run --rm -v deploy_cp-data:/data -v /opt/control-plane:/out alpine \
     sh -c "mv /data/backup-tmp.db /out/cp-$(date +%F-%H%M).db"'
```

Prüfen, dass das Backup nicht leer ist: Es sollte deutlich größer als 4 KB sein und die Tabellen
`wallets`, `automatons` und `payments` enthalten.
Die Datei enthält nur Key-Hashes, Salden und Ledger, keine Klartext-Keys.

## Abnahme

Stufe 1: `CP_URL=https://cp.hippe.eu pnpm e2e:mainnet` (Wegwerf-Wallet, 1 USDC, Tier 1).
Stufe 2: `pnpm e2e:prod` (Upstream-Runtime als Container auf der VM gegen cp.hippe.eu, Wegwerf-
Wallet aus Stufe 1 mit 5 USDC; baut, läuft, räumt den Container wieder ab), nur nach Go.
Danach `CP_TOPUP_TIERS_USD` in `.env` wieder ohne Tier 1 setzen und `deploy/up.sh`.
