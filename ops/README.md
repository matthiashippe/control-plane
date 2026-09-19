# Betriebsbeobachtung (L1, report-only)

`ops/status.sh` liest den Zustand des laufenden Control Plane und gibt JSON aus: Health und
Zertifikatsrestlaufzeit über HTTPS, Compose-Zustand, Platte, Speicher, Neustarts und Fehlerzahl
der letzten 24 h auf der VM, Kennzahlen aus der SQLite (`ops/db-report.cjs`, read-only im
Container), OpenRouter-Guthaben und den USDC-Saldo der payTo-Adresse auf Base.

```
OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' ~/brain/connectors/secrets.env | cut -d= -f2) ops/status.sh
```

Das Skript ändert nichts und startet nichts. Es ist die Datenquelle für den Ops-Triage-Loop
(`/loop 1d Run $ops-triage`), der daraus die Abschnitte in `STATE.md` schreibt.

## Rauchtest nach dem Deploy

`ops/smoke.sh [BASIS_URL]` (Default `https://cp.hippe.eu`) prüft von außen, ob der Dienst nach
einem Deploy wirklich tut, was er soll: `/health`, `/v1/status` mit Modellen, Markup und der
Automaton-Zahl, die Startseite mit Link auf `ohne-control-plane.md` und Impressum-Anker, die 302
von `/impressum`, `/.well-known/x402` mit Zahlungsangebot, `/llms.txt` mit der Setup-Zeile, die
Sicherheits-Header, den CSP-Hash gegen das ausgelieferte Inline-Skript, das Body-Limit (1,1 MB an
`/v1/auth/verify` muss 413 geben) und die 401 von `/v1/credits/balance` ohne Key. Je Prüfung eine
Zeile, am Ende eine Zusammenfassung, `exit 1` bei jedem Fehler. Das Skript schreibt nichts und
braucht keinen API-Key.

Ein Standardlauf stellt **eine** Anfrage auf einen rate-limitierten Pfad (60 je Minute und Client,
`src/ratelimit.ts`) und zählt sie in der Zusammenfassung mit. Die Grenze selbst prüft nur
`--mit-ratelimit`, weil dieser Test den Aufrufer für den Rest der Minute aussperrt. `--ohne-proxy`
überspringt die drei Prüfungen, die an Caddy hängen (Header, CSP-Hash, Body-Limit); das ist für
einen lokalen Start gedacht und ersetzt den Lauf gegen den echten Endpunkt nicht.

## Schwellen, bei denen gehandelt werden muss

| Signal | Schwelle | Aktion |
|---|---|---|
| `health.status` | nicht 200 | sofort melden, Logs lesen, Compose-Zustand prüfen |
| `cert_days_left` | unter 20 | Caddy-Logs prüfen (ACME), DNS auf DNS-only kontrollieren |
| `vm.restarts` | steigt zwischen zwei Läufen | Logs der letzten Stunde lesen, Ursache in STATE.md |
| `vm.errors_24h` | über 0 | `provider_unavailable` (OpenRouter), `settlement_failed` (PayAI) unterscheiden |
| `db.stuck_payments` | über 0 | Payment hängt in `pending`: Nonce und Facilitator-Antwort prüfen |
| `openrouter.left` | unter 5 USD | Matthias fragen, ob nachgeladen wird; sonst droht 503 für alle Mandanten |
| `vm.disk_used` | über 80 % | Logs rotieren (json-file max 20m x 5), alte Images prüfen |
| `db.day.margin_mc` | negativ | Verkaufspreis deckt den Einkauf nicht: Markup oder Katalog prüfen |
| `db.zahlen_ohne_zu_denken` | ein Eintrag über 24 h | Kunde hat bezahlt und kauft keine Inferenz. Kein Alarm, aber nachsehen |

### Zahlen, ohne zu denken

Die Liste `db.zahlen_ohne_zu_denken` nennt jede Wallet mit Guthaben, die seit ihrer letzten
Aufladung **keinen einzigen Inferenz-Aufruf** gemacht hat, mit den Stunden seither und ob sie
überhaupt je gedacht hat. Das ist die stillste Art, einen Kunden zu verlieren: Das Guthaben liegt
da, die Runtime pollt vielleicht noch ihren Kontostand, und es passiert nichts.

Genau diesen Fall gab es am 19.09.2026 mit dem ersten zahlenden Kunden, und aufgefallen ist er nur,
weil jemand zufällig ins Ledger sah. Die Ursache lag außerhalb unseres Codes (die Runtime kaufte
ihre Turns nicht bei uns, siehe `docs/research/`), aber das ändert nichts daran, dass wir es
merken müssen.

Bewusst **kein Alarm**: Ein frisch aufgeladener Automat, der gerade schläft, ist normal, und ein
Wecker, der jede Nacht klingelt, wird abgeschaltet. Ab einem Eintrag, der älter als 24 Stunden ist,
lohnt der Blick in die Caddy-Logs: Kommen von der Adresse überhaupt noch Anfragen, und mit welchem
Statuscode? Wenn ja und alles 200, liegt es an seiner Seite. Wenn nein, ist er weg.

## Watchdog auf der VM

`ops/watchdog.sh` läuft dort per Cron alle fünf Minuten (`/var/log/cp-watchdog.log`) und ist die
einzige Instanz, die einen Ausfall bemerkt, ohne dass jemand hinschaut. Er prüft `/health` von
außen (zwei Versuche mit 20 s Abstand, damit ein einzelner Aussetzer nicht alarmiert) und die
Restlaufzeit des Zertifikats. Gemeldet wird der **Wechsel** des Zustands, nicht jeder Lauf: ein
Ausfall meldet einmal, die Rückkehr meldet einmal.

Ohne `CP_ALERT_WEBHOOK` schreibt er nur ins Log. Mit gesetzter URL (ntfy, Slack, Discord, egal)
schickt er eine Zeile Text dorthin. Damit die Zustellung greift, die Variable in den Cron-Eintrag
aufnehmen:

```
*/5 * * * * CP_ALERT_WEBHOOK=https://ntfy.sh/<zufälliges-topic> /opt/control-plane/repo/ops/watchdog.sh >> /var/log/cp-watchdog.log 2>&1
```

Die Zustellung ist seit dem 19.09.2026 scharf: Der Crontab auf `srv1336627` setzt
`CP_ALERT_WEBHOOK` auf ein ntfy-Topic. **Die URL steht nicht in diesem Repo, weil es öffentlich
ist**: Wer das Topic kennt, liest die Meldungen mit und kann selbst welche senden. Sie liegt in
`~/brain/connectors/secrets.env` als `CP_ALERT_WEBHOOK` und im Crontab der VM.

Geprüft am 19.09.2026: Ein simulierter Ausfall (`CP_URL` auf einen 404-Pfad) löste von der VM aus
eine Meldung mit Priorität `high` aus, die über ntfy abrufbar war.

## Backup

`ops/backup.sh` läuft täglich um 3:17 UTC per Cron auf der VM (`/var/log/cp-backup.log`), schreibt
nach `/opt/control-plane/backups/` und hält 14 Tage vor. Schlägt es fehl, geht eine Meldung über
denselben Webhook raus wie beim Watchdog.

Es benutzt `VACUUM INTO` aus der laufenden Anwendung heraus, **nicht** `cp cp.db`: Die Datenbank
läuft im WAL-Modus, die `.db`-Datei trägt nur den Stand des letzten Checkpoints, alles danach steht
im `-wal` daneben. Bei dem Verkehr, den dieser Dienst hat, läuft tagelang kein Checkpoint. Am
19.09.2026 lokal nachgestellt: Nach Schema, fünf Wallets, zehn Zahlungen und den zugehörigen
Buchungen war `cp.db` 86 KB groß und enthielt **null Zeilen**, der gesamte Inhalt lag in den 943 KB
des `-wal`. Eine Kopie der `.db` allein bestand `PRAGMA integrity_check` trotzdem mit "ok". Bei mehr
Schreiblast greift der automatische Checkpoint, dann ist die Kopie nicht leer, sondern auf dem Stand
von irgendwann vorher: in derselben Übung 1141 statt 1747 Ledgerzeilen.

Der Node-Teil steht seit dem 19.09.2026 in `ops/backup-vacuum.cjs` und wird in den laufenden
Container eingespeist (`docker compose exec -T cp node - < ops/backup-vacuum.cjs`, wie bei
`db-report.cjs`). Er räumt Reste des letzten Laufs weg, schreibt den Snapshot und prüft ihn, solange
er noch im Volume liegt: `integrity_check`, Salden gegen Ledgersummen und die Zeilenzahlen gegen die
Quelle. Zwei Fehler des alten Skripts sind damit weg:

- Blieb `backup-tmp.db` nach einem misslungenen Abtransport liegen, scheiterte **jedes weitere
  Backup** an `output file already exists`, jeden Tag aufs Neue, und im Log stand nur
  "VACUUM INTO im Container fehlgeschlagen" ohne den Grund. Die Fehlerausgabe des Containers steht
  jetzt in der Meldung.
- Die Prüfung "Ausgabe größer als 20 KB" konnte den Fehler nicht fangen, für den sie gedacht war:
  Das Schema allein wiegt rund 80 KB, eine inhaltsleere Kopie liegt weit darüber. Stattdessen
  vergleicht `ops/backup.sh` die Größe der abtransportierten Datei mit der, die der Container
  gemeldet hat, und der Container prüft den Inhalt. Weicht sie ab, wird die Datei verworfen statt
  als Torso im Bestand zu liegen.

Der Node-Teil hängt in `test/backup.test.ts`, die Bash darum herum lief am 19.09.2026 gegen eine
Docker-Attrappe (ein `docker` im PATH, das die beiden Aufrufe lokal nachbildet): Normalfall,
Container-Teil scheitert, Abtransport scheitert, Abtransport bricht mitten drin ab. In allen vier
Fällen steht der Grund im Log, und der Lauf danach kommt wieder durch.

## Ein Backup zurückspielen

Am 19.09.2026 einmal vollständig nachgespielt, weil es bis dahin niemand getan hatte. Nachgespielt
wurde lokal gegen eine SQLite mit dem Schema aus `src/db.ts`, gefüllt mit Wallets, Zahlungen in
allen drei Zuständen, Ledgerzeilen aller vier Arten, API-Keys, Automatons und einem `-wal`, das
nicht leer war, mit einem zweiten Prozess, der während des Backups weiterschrieb. Was dabei
herauskam, steht unten unter "Die vier Fallen". Die Docker-Zeilen selbst sind auf der VM **nicht**
gelaufen, der Weg dazwischen schon.

**1. Backup aussuchen und prüfen, bevor der Dienst angefasst wird.** Das Prüfskript liest nur, der
Dienst läuft dabei weiter:

```
ls -la /opt/control-plane/backups/
docker run --rm -v /opt/control-plane/backups:/bak:ro -v /opt/control-plane/repo/ops:/ops:ro \
  -e NODE_PATH=/app/node_modules --entrypoint node control-plane:latest \
  /ops/restore-pruefen.cjs /bak/<datei>.db
```

`ops/restore-pruefen.cjs` prüft `integrity_check`, `foreign_key_check`, ob jede Wallet mit der Summe
ihrer Ledgerzeilen übereinstimmt, ob jede `settled`-Zahlung ihre `topup`-Zeile hat und ob eine
x402-Nonce mehr als eine Gutschrift trägt. Es endet mit `exit 1`, sobald eine dieser Prüfungen
fehlschlägt. Erst wenn es durchläuft, ist der Ausfall gerechtfertigt.

**2. Dienst stoppen.** Ab hier sieht jeder Aufrufer 502, auch der zahlende Kunde:

```
cd /opt/control-plane/repo/deploy
docker compose -f docker-compose.prod.yml stop cp
```

**3. Den alten Stand vollständig wegschieben, nicht überschreiben.** Alle drei Dateien zusammen,
sonst ist der alte Stand entwertet und das Zurückspielen unumkehrbar:

```
docker run --rm -v deploy_cp-data:/data alpine sh -c \
  'mkdir -p /data/vor-restore && mv /data/cp.db /data/cp.db-wal /data/cp.db-shm /data/vor-restore/ 2>/dev/null; ls -la /data /data/vor-restore'
```

**4. Backup einspielen:**

```
docker run --rm -v deploy_cp-data:/data -v /opt/control-plane/backups:/bak:ro alpine \
  sh -c "cp /bak/<datei>.db /data/cp.db && ls -la /data"
```

Im Verzeichnis dürfen danach nur `cp.db` und `vor-restore/` liegen. Liegt dort noch ein `cp.db-wal`
oder `cp.db-shm`, nicht starten, sondern Schritt 3 nachholen.

**5. Starten und von außen prüfen:**

```
docker compose -f docker-compose.prod.yml start cp
docker compose -f docker-compose.prod.yml logs --tail 50 cp
docker compose -f docker-compose.prod.yml exec -T cp node - < /opt/control-plane/repo/ops/restore-pruefen.cjs
/opt/control-plane/repo/ops/smoke.sh
```

Im Log stehen die Meldungen, die der erste Start auf einer zurückgespielten Datei erzeugt, und sie
gehören gelesen, nicht überflogen: jede Zahlung, die im Backup `pending` war, wird auf `failed`
gesetzt und einzeln protokolliert. Sie stammt aus einem Request, den es nicht mehr gibt, und wenn
ihre Autorisierung on-chain durchlief, hat jemand bezahlt, ohne Credits zu bekommen. Reservierungen
(`reserved_mc`) setzt der Start auf 0.

**6. Den Preiskatalog im Blick behalten.** Der Fallback-Katalog steht in der `kv`-Tabelle. Nach
einem Backup, das älter ist als die Tabelle, ist er weg: gemessen mit `CP_PROVIDER=openrouter` und
einem Preisabruf, der nicht durchkam, startete der Dienst dann gar nicht
("Preisabruf fehlgeschlagen und kein Katalog gespeichert. Start nicht möglich."), während dieselbe
Datei mit einem Eintrag im `kv` normal hochkam und `/v1/status` die gespeicherten Preise auslieferte.
Ist OpenRouter beim Start erreichbar, füllt sich der Eintrag von selbst wieder.

**7. Aufräumen,** wenn der Dienst ein paar Tage sauber läuft: `vor-restore/` aus dem Volume löschen.

### Die vier Fallen

**Die `-wal` und `-shm` der alten Datenbank bleiben liegen.** Das ist die schwerste und die
wahrscheinlichste, denn der Prozess hat keinen SIGTERM-Handler und schließt die SQLite-Verbindung
nie: Nach jedem `stop` liegt garantiert ein nicht-leerer `-wal` im Volume (gemessen: SIGTERM bis
Prozessende 54 ms, danach 8 KB `-wal` und 32 KB `-shm`, mit der einzigen geschriebenen Zeile darin).
Kopiert man das Backup darüber, ohne die beiden zu entfernen, legt SQLite die alten WAL-Frames über
die neue Datei. Das Ergebnis ist keine Fehlermeldung, sondern eine Datenbank, die oben heil aussieht
und unten kaputt ist: `wallets` und `ledger` zeigen den alten Stand,
`select count(*) from payments where status='settled'` liefert **0 ohne Fehler**, `api_keys` wirft
`database disk image is malformed`, und `integrity_check` meldet
`btreeInitPage() returns error code 11`. Dieselbe Datei mit entfernten Begleitdateien ist in
Ordnung. Festgehalten in `test/backup.test.ts`.

**Der Dienst läuft beim Zurückspielen noch.** Das sieht zunächst nach Erfolg aus: Direkt nach dem
Kopieren meldet die Datei `integrity_check: ok` und exakt den Backup-Stand, und der laufende Prozess
schreibt ohne eine einzige Fehlermeldung weiter. Erst sein nächster Checkpoint schreibt seine alten
Seiten über die neue Datei, und dann ist sie malformed, mit `settled` auf 0. Wer nach dem Kopieren
prüft und zufrieden ist, prüft zu früh. Deshalb steht der Stop vor dem Kopieren und die Prüfung
danach.

**Das Backup ist älter als die letzte Migration.** Der harmloseste Fall, gegen die Erwartung. Ein
Backup ohne `wallets.reserved_mc`, ohne `payments.balance_after_mc` und ohne die `kv`-Tabelle wurde
beim Start in 0,94 Sekunden migriert, die Spalten und die Tabelle kamen dazu, der Index
`ledger_topup_ref` ebenfalls, die Salden blieben unverändert, `/health` und `/v1/status` antworteten
normal. `ops/restore-pruefen.cjs` meldet fehlende Spalten als Hinweis und lehnt das Backup nicht ab.
Zwei Nachwirkungen bleiben: Der Preiskatalog im `kv` ist leer (Schritt 6), und enthält das alte
Backup eine x402-Nonce mit zwei Gutschriften, lässt sich `ledger_topup_ref` nicht anlegen. Der Start
läuft dann weiter und meldet es nur ins Log, wo es niemand sieht. Genau dafür prüft
`restore-pruefen.cjs` auf doppelte Gutschriften.

**Das Backup ist leer und niemand merkt es.** Eine Kopie der `.db` ohne `-wal` hat vollständiges
Schema, 86 KB Größe und `integrity_check: ok`, aber keine einzige Zeile. Keine Größenschwelle fängt
das, und beim Zurückspielen stünde jeder Kunde auf 0 Credits. Deshalb zählt `backup-vacuum.cjs` die
Zeilen im Backup gegen die Quelle, und deshalb läuft `restore-pruefen.cjs` vor dem Einspielen.

### Dauer und Ausfall

Lokal gemessen, `VACUUM INTO` aus einem lesenden Prozess bei parallel schreibendem zweiten Prozess,
Start mit `CP_PROVIDER=mock` über `tsx`:

| Datenbank | Backup | `VACUUM INTO` | Kopieren und Aufräumen | Start bis `/health` 200 |
|---|---|---|---|---|
| 1,3 MB | 1,3 MB | 13 ms | 7 ms | 0,92 s |
| 11 MB | 11 MB | 82 ms | 18 ms | 0,86 s |
| 101 MB | 97 MB | 750 ms | 503 ms | 0,92 s |

Der Dateiteil des Zurückspielens liegt also selbst bei 100 MB unter einer Sekunde. Den Ausfall
bestimmt nicht er, sondern der Container-Wechsel drumherum, der bei den Deploys am 19.09.2026 rund
16 Sekunden ohne Antwort kostete. Dazu kommt im Container der Preisabruf beim Start, der am
19.09. zweimal hing; mit gefülltem `kv` fällt er auf den gespeicherten Katalog zurück. Realistisch
zu planen ist eine halbe Minute 502 für jeden Aufrufer, und die Prüfung des Backups aus Schritt 1
gehört davor, nicht hinein.

### Was hinterher stimmen muss

`ops/restore-pruefen.cjs` prüft das alles und endet mit `exit 1`, sobald etwas davon nicht gilt:

- `PRAGMA integrity_check` ist `ok`, `foreign_key_check` ist leer.
- Für jede Wallet gilt `balance_mc` gleich der Summe ihrer `ledger.delta_mc`, und die Gesamtsummen
  beider Seiten stimmen überein.
- Jede `settled`-Zahlung hat ihre `topup`-Ledgerzeile, und keine x402-Nonce hat zwei.
- Die Zahlen aus `ops/status.sh` (`db.wallets`, `db.keys`, `db.automatons`) passen zum letzten Lauf
  vor dem Ausfall, abzüglich dessen, was seit dem Backup dazugekommen war.
- `ops/smoke.sh` läuft von außen durch.

## Selbstheilung

Der `autoheal`-Dienst im Compose startet Container neu, die der Healthcheck als `unhealthy`
markiert. Das ist nötig, weil Docker von sich aus nur bei einem beendeten Prozess neu startet:
Am 19.09.2026 hing der Startprozess still, der Container blieb "Up" und unhealthy, und der Dienst
war 502, bis jemand von Hand eingriff. Geprüft mit SIGSTOP auf den Node-Prozess: nach 90 Sekunden
`unhealthy`, nach 120 Sekunden automatisch neu gestartet.

## Kennzahl des 30-Tage-Tests

**Ziel: fünf zahlende fremde Betreiber in 30 Tagen** (Stand 19.09.2026, nach der Nachfragemessung
von 50 nach unten korrigiert). Unter drei am 19.10.2026 wird abgeschaltet, mit zwei Wochen Vorlauf
auf der Startseite.

Die Zahl in `/v1/status` zählt **distinkte Wallets mit mindestens einer Gutschrift**, nicht
Registrierungen und nicht Automatons. Beides wäre manipulierbar: Ein API-Key kostet nichts, eine
Registrierung auch, und selbst mit Zahlung könnte eine einzige Wallet 25 Automatons anlegen und die
Kennzahl verfünfundzwanzigfachen. Wer die Zahl bewegen will, muss zahlen, und genau das ist der
Punkt der Messung. Der eigene Automat ist in der Zahl enthalten, für die Messgröße also eins
abziehen.
`db.keys` zählt ausgestellte API-Keys, `db.day.topups` die Zahlungen des letzten Tages.
