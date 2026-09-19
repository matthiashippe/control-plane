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

## Kennzahl des 30-Tage-Tests

`db.automatons` ist die Messgröße (Ziel: 50 provisionierte Automatons in 30 Tagen).
`db.keys` zählt ausgestellte API-Keys, `db.day.topups` die Zahlungen des letzten Tages.
