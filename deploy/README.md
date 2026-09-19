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

**`deploy/rollout.sh`.** Die DB bleibt im Volume.

| Lage | Skript |
|---|---|
| Dienst läuft und ist gesund, neuer Stand soll raus | `deploy/rollout.sh` |
| Nur der Caddyfile hat sich geändert | `deploy/rollout.sh` (erkennt das und lässt den Dienst in Ruhe) |
| Erstinstallation, oder der Dienst liegt bereits am Boden | `deploy/up.sh` |
| Container hängt, Code unverändert | `docker compose -f docker-compose.prod.yml up -d --force-recreate cp` |

`deploy/up.sh` fährt `up -d --build`: Es zerstört den alten Container, bevor feststeht, ob der neue
hochkommt. Am 19.09.2026 war der Dienst dreimal deswegen weg. Für den Kaltstart ist das richtig,
für ein Update nicht.

### Was rollout.sh tut, und warum in dieser Reihenfolge

1. **Von außen prüfen, ob der Dienst überhaupt gesund ist.** Ist er es nicht, bricht das Skript ab.
   Sonst wird ein Ausfall, der schon vorher da war, dem Deploy zugeschrieben.
2. **rsync**, wie bei `up.sh`.
3. **Bauen als eigener Schritt.** Ein fehlgeschlagener Build endet hier, ohne dass irgendein
   Container angefasst wurde. Das alte Image bekommt vorher das Tag `control-plane:rollback`,
   sonst verliert es beim Neu-Taggen von `:latest` seinen Namen und ist nach dem nächsten
   `docker image prune` weg.
4. **Ist das Image identisch, passiert am Dienst nichts.** Eine reine Caddyfile-Änderung führt so
   zu null Neustarts des Control Plane.
5. **Kanarienvogel.** Der neue Container startet neben dem alten, aber gegen eine `VACUUM INTO`-
   Kopie der Datenbank und ohne Anschluss an das Compose-Netz, damit Caddy ihn unter keinen
   Umständen sieht. Er beweist: Das Image startet, die Migrationen laufen über den echten
   Datenbestand, der Preisabruf bei OpenRouter klappt, `/health` antwortet. Genau diese Stelle hing
   am 19.09. zweimal. Wird er nicht gesund, endet der Deploy, und der alte Container läuft weiter.
6. **Ruhiges Fenster abwarten.** Vor dem Umschalten wird die DB read-only gefragt, ob eine Zahlung
   in `pending` steht oder ein Wallet eine Reservierung hält. Eine frische `pending`-Zahlung
   **blockiert** den Deploy: Zwischen dem `INSERT ... 'pending'` und `status='settled'` in
   `src/payments/pay.ts` liegt der On-Chain-Settle, und wer dort abschneidet, riskiert geflossene
   USDC ohne Gutschrift. Eine laufende Inferenz verzögert nur und wird nach Ablauf der Frist mit
   einer Warnung überfahren, weil ein Abbruch dort den Kunden nichts kostet (gebucht wird erst
   nach der Provider-Antwort, `src/inference/proxy.ts`).
7. **Umschalten** mit `up -d --no-deps --force-recreate cp`, dann warten, bis der neue Prozess
   antwortet, und danach, bis Docker ihn `healthy` nennt. Der zweite Teil ist kein Ausfall, aber
   er muss abgewartet werden: Solange der Container unhealthy ist, greift autoheal zu.
8. **Geht der Start gegen die echte DB doch schief**, wird auf `control-plane:rollback`
   zurückgetaggt und neu gestartet. Die Logs des gescheiterten Containers stehen vorher im
   Protokoll, denn der Container überlebt das Rollback nicht.
9. **Caddyfile** zuletzt, siehe unten.
10. **Von außen nachsehen**, ob `https://cp.hippe.eu/health` 200 antwortet. `docker ps` beweist das
    nicht, weil Caddy und TLS dazwischen liegen.

Der Ablauf selbst steht in `deploy/rollout-remote.sh` und läuft auf der VM. Getrennte Datei, damit
er gegen ein beliebiges Compose-Projekt gefahren und damit lokal geprüft werden kann
(`CP_COMPOSE_DIR`, `CP_COMPOSE_FILE`); ein Deploy-Ablauf, den man nur in Produktion ausprobieren
kann, ist keiner.

### Warum kein echtes Blau/Grün

Naheliegend wäre, den neuen Container neben dem alten auf **derselben** Datenbank laufen zu lassen
und Caddy danach umzuhängen. Das geht hier nicht, und zwar wegen dessen, was der Start in
`src/db.ts` tut:

- `migrate()` setzt `UPDATE wallets SET reserved_mc = 0 WHERE reserved_mc <> 0`. Der Kommentar an
  der Stelle sagt selbst, dass das nur korrekt ist, solange genau ein Prozess auf der Datei
  arbeitet. Startet der neue Container, während der alte eine Inferenz bedient, verschwindet deren
  Reservierung, `getAvailableMc()` meldet zu viel, und ein paralleler Call kommt an Guthaben, das
  bereits vergeben ist. Genau dieses Rennen wurde am 19.09. geschlossen (1 USD Guthaben, 200
  parallele Requests, rund 65 USD echte Einkaufskosten).
- Derselbe Startpfad setzt **alle** Zahlungen in `pending` auf `failed`. Für einen echten Neustart
  ist das richtig, denn sonst blockiert die Nonce dauerhaft mit 409. Neben einem laufenden Prozess
  ist es falsch: Er kippt eine Zahlung, die gerade on-chain settelt, und öffnet den Retry-Pfad für
  eine Autorisierung, die noch in Arbeit ist.
- Das Rate Limiting hält seine Zähler im Prozess (`src/ratelimit.ts`, ausdrücklich so entschieden,
  weil der Dienst ein Container ist). Zwei Prozesse bedeuten das doppelte Limit.
- `better-sqlite3` arbeitet synchron. Zwei schreibende Prozesse warten im Busy-Timeout aufeinander,
  und dieses Warten blockiert den Event-Loop, also auch den Healthcheck. Ein blockierter
  Healthcheck ruft autoheal auf den Plan.

Echter Parallelbetrieb setzt also erst einen Umbau voraus: entweder ein Startpfad, der die
aufräumenden Schritte überspringen kann, oder der Zustand raus aus der prozesslokalen SQLite. Bis
dahin ist der kürzestmögliche Wechsel das Ehrliche, und `rollout.sh` macht genau den: Das Image ist
vorher gebaut und bewiesen, im Ausfallfenster steckt nur noch der Prozessstart.

### Was an rollout.sh geprüft ist (19.09.2026, lokal)

Gefahren gegen ein Compose-Projekt, das `docker-compose.prod.yml` nachbaut (cp mit demselben
Dockerfile und Healthcheck, Caddy mit Datei-Bind-Mount davor), mit einem curl-Ausfallmesser im
50-ms-Takt. Nicht gegen die VM.

| Fall | Ergebnis |
|---|---|
| Kein Unterschied | Kein Neustart, kein Ausfall |
| Nur Caddyfile geändert | Erkannt, validiert, angewendet; cp unberührt; ~0,3 s abgelehnte Verbindungen |
| Caddyfile mit Syntaxfehler | `caddy validate` bricht ab, alte Fassung läuft weiter |
| Neues Image startet nicht (Start hängt) | Kanarienvogel fängt es, nicht umgeschaltet, alter Container läuft weiter |
| Frische `pending`-Zahlung | Deploy blockiert mit Hinweis auf das Settlement, nicht umgeschaltet |
| Neues Image gut | Umgeschaltet, 2 Fehlschläge im 50-ms-Takt gemessen |
| Kanarienvogel grün, Start gegen die echte DB tot | Rollback auf das alte Image, Dienst wieder gesund |

**Ungeprüft und bewusst so benannt:** Die Inode-Falle selbst lässt sich auf macOS nicht nachstellen,
weil Docker Desktop den Bind-Mount über den Pfad auflöst und der Container die neue Fassung sofort
sieht; deshalb das zweite Signal über die Stempeldatei. Die gemessenen Ausfallzeiten laufen durch
den Port-Proxy von Docker Desktop, der kurze Lücken verschlucken kann, und der Start hatte lokal
keinen OpenRouter-Preisabruf zu erledigen. In Produktion ist das Fenster deshalb eher ein paar
Sekunden als ein Bruchteil davon. Und der erste echte Lauf gegen die VM steht aus.

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

### Ausrollen einer Caddyfile-Änderung

**`deploy/rollout.sh` macht das mit.** Von Hand ist es fehleranfällig, und es hat am 19.09.2026
Zeit gekostet: `deploy/up.sh` und `docker compose up -d caddy` reichen **nicht**. Der Caddyfile ist
ein Datei-Bind-Mount und hängt unter Linux an der Inode. rsync ersetzt die Datei durch eine neue
Inode, die der laufende Container nicht sieht; auch `caddy reload` liest dann noch die alte Fassung.
Nur `--force-recreate` des Caddy-Containers hilft.

`rollout.sh` erkennt eine Änderung an zwei Signalen, weil eines allein nicht reicht:

1. **Was liest der Container gerade?** `sha256sum /etc/caddy/Caddyfile` im laufenden Container gegen
   die Datei auf der Platte. Weicht es ab, sitzt der Container auf der alten Inode. Das fängt auch
   den Fall, dass eine frühere Änderung nie wirksam wurde.
2. **Mit welchem Hash wurde Caddy zuletzt absichtlich erzeugt?** Steht in
   `/opt/control-plane/caddyfile.sha256`, bewusst außerhalb von `/opt/control-plane/repo/`, damit
   `rsync --delete` die Datei nicht wegräumt. Sie fängt den umgekehrten Fall: Datei im Container
   aktuell, aber Caddy hat sie nie geladen, weil es seither nicht neu gestartet ist. Caddy liest den
   Caddyfile nur beim Start.

Danach `caddy validate` in einem Wegwerf-Container (ein Syntaxfehler lässt Caddy gar nicht erst
starten, und dann ist alles weg, nicht nur die Änderung), dann `up -d --no-deps --force-recreate
caddy`, dann die Gegenprobe, dass der neue Container wirklich die neue Fassung liest. Wenn nicht,
wird die vorherige Fassung zurückgespielt, die vorher **aus dem laufenden Container** gesichert
wurde und nicht aus git: Was der Container liest, kann von jedem Stand im Repo abweichen, genau
darum geht es hier. Der Caddy-Container wird dabei ersetzt, das kostet rund eine halbe Sekunde
abgelehnter Verbindungen; der Control Plane bleibt unberührt.

Von Hand, falls es einmal sein muss:

```
docker run --rm -v /opt/control-plane/repo/deploy/Caddyfile:/etc/caddy/Caddyfile:ro \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate caddy
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
