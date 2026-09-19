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

Direkt nach jedem `up.sh` und nach jedem Ausrollen einer Caddyfile-Änderung `ops/smoke.sh` laufen
lassen: Der Rauchtest prüft in einem Durchgang Health, Status, Startseite, Impressum-Weiterleitung,
`/.well-known/x402`, `llms.txt`, die Sicherheits-Header, den CSP-Hash gegen das ausgelieferte
Inline-Skript, das Body-Limit und die 401 ohne API-Key, und endet mit `exit 1`, sobald eine dieser
Prüfungen fehlschlägt.

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

## Härtung in Caddy (19.09.2026, vor dem Launch)

- **`request_body max_size 1MB`.** Vorher nahm der Dienst beliebig große Bodies an; ein 3 MB großer
  Müll-Body an `/v1/auth/nonce` wurde mit 200 beantwortet. Geprüft: 2 MB an `/v1/auth/verify`
  ergeben jetzt 413, 500 KB laufen normal durch (400 "Malformed SIWE message").
- **Sicherheits-Header**: HSTS (ein Jahr, mit Subdomains), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` und eine CSP, die
  `default-src 'none'` setzt. Die Seite lädt nichts von außen.
- **Die CSP erlaubt das Inline-Skript per sha256-Hash**, nicht per `'unsafe-inline'`. Wer das
  Skript in `src/public/index.html` ändert, muss den Hash im Caddyfile nachziehen. Ein Test in
  `test/public.test.ts` rechnet den Hash nach und schlägt sonst fehl, weil der Browser sonst still
  blockiert und die Seite ohne Live-Zahlen dasteht.

**Achtung beim Ausrollen einer Caddyfile-Änderung:** `deploy/up.sh` und `docker compose up -d caddy`
reichen nicht. Der Caddyfile ist ein Datei-Bind-Mount, und rsync ersetzt die Datei durch eine neue
Inode, die der laufende Container nicht sieht; auch `caddy reload` liest dann noch die alte Fassung.
Nötig ist:

```
ssh -i ~/.ssh/id_ed25519_automaton root@76.13.144.207 \
  'cd /opt/control-plane/repo/deploy && docker compose -f docker-compose.prod.yml up -d --force-recreate caddy'
```

Vorher validieren, sonst startet Caddy nicht und der Dienst ist komplett weg:

```
docker run --rm -v /opt/control-plane/repo/deploy/Caddyfile:/etc/caddy/Caddyfile:ro \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

## Lastmessung (19.09.2026)

Gemessen mit `ab` auf der VM selbst, damit die eigene Leitung nicht das Ergebnis bestimmt:

| Ziel | Durchsatz |
|---|---|
| App direkt, Startseite | 7.814 req/s |
| App direkt, `/v1/status` (SQLite je Request) | 6.667 req/s |
| Durch Caddy mit TLS, neue Verbindungen | 348 req/s |

Während 2.000 Verbindungen mit 50 parallel von außen blieb die Last der VM bei 0,01 und der
Speicher bei 735 MB von 3.915. Der begrenzende Faktor ist der TLS-Handshake, nicht die Anwendung.
