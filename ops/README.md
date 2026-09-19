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
läuft im WAL-Modus, die `.db`-Datei ist wenige Kilobyte groß und der Inhalt steht im `-wal` daneben.
Ein `cp` der `.db` allein ergibt ein leeres Backup, das erst auffällt, wenn man es braucht. Genau
so stand es bis zum 19.09.2026 in `deploy/README.md`. Das Skript prüft deshalb selbst, ob die
Ausgabe größer als 20 KB ist, und meldet sonst einen Fehler.

Ein Backup zurückspielen (der Dienst muss dabei stehen):

```
ssh -i ~/.ssh/id_ed25519_automaton root@76.13.144.207
cd /opt/control-plane/repo/deploy
docker compose -f docker-compose.prod.yml stop cp
docker run --rm -v deploy_cp-data:/data -v /opt/control-plane/backups:/bak alpine \
  sh -c "cp /bak/<datei>.db /data/cp.db && rm -f /data/cp.db-wal /data/cp.db-shm"
docker compose -f docker-compose.prod.yml start cp
```

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
