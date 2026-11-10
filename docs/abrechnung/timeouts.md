# Timeout-Quote vor dem Provider-Routing (abrechnung 02)

Gemessen am 10.11.2026 um 19:24 UTC, nur lesend, vom code-host aus mit

```
bash ops/timeout-quote.sh
```

Das Werkzeug liest das ganze Caddy-Zugriffslog (`ops/access-log.sh`, auch die gedrehten Dateien) und die Zeilen `inference` des Ledgers
samt `inference_aborts` (Datenbank mit `readonly: true` im Container) und ordnet jeder Anfrage ihr Modell über die Generation-ID zu.
Gezählt wird jeder `POST /v1/chat/completions` mit Status 200 oder Abbruch (Status 0). Fremd ist jede Adresse, die nicht in
`ops/own-ips.txt` steht; Adressen stehen weder hier noch in der Ausgabe.

**Zeitraum:** Das Log reicht vom 01.10.2026 14:59 UTC bis zur Messung. Inferenz-Anfragen gibt es darin erst seit dem 30.10.2026 12:02 UTC
(Verkauf über OpenRouter wieder an, Matthias' Entscheidung vom 30.10.2026). Bei der Messung: 231 Anfragen, alle einem Modell zugeordnet.

**Was als Timeout zählt:** Die Runtime bricht nach 60 Sekunden auf ihrer eigenen Uhr ab. Die läuft schon, bevor Caddy die Anfrage sieht,
darum enden ihre Timeouts im Log bei 59,9 Sekunden. Gezählt wird deshalb ab 59,5 Sekunden im Log (`TQ_LIMIT_S`, Vorgabe 59.5). Streng über
60,0 Sekunden lief keine einzige Anfrage (`TQ_LIMIT_S=60 bash ops/timeout-quote.sh`: 0 bei jedem Modell); das wäre die falsche Null.

## Quote vorher je Modell

| Modell | Tag | Herkunft | Anfragen | über 60 s (Timeout der Runtime) | Quote |
|---|---|---|---:|---:|---:|
| openai/gpt-5.2 | 10.11.2026 | fremd | 224 | 3 | 1,3 % |
| openai/gpt-5.2 | gesamt | fremd | 224 | 3 | 1,3 % |
| openai/gpt-5.2 | gesamt | eigen | 0 | 0 | 0,0 % |
| openai/gpt-5-mini | 30.10.2026 | eigen | 5 | 0 | 0,0 % |
| openai/gpt-5-mini | 10.11.2026 | fremd | 2 | 0 | 0,0 % |
| openai/gpt-5-mini | gesamt | fremd | 2 | 0 | 0,0 % |
| openai/gpt-5-mini | gesamt | eigen | 5 | 0 | 0,0 % |

Die drei Timeouts sind die Abbrüche von 05:25:58, 05:36:46 und 05:37:53 UTC aus abrechnung 01, alle bei `openai/gpt-5.2`, alle von
fremden Adressen. Knapp darunter liegen weitere lange Anfragen: Ab 45 Sekunden im Log sind es bei `openai/gpt-5.2` 13 von 226 (5,8 %,
`TQ_LIMIT_S=45 bash ops/timeout-quote.sh`, wenige Sekunden später gemessen, darum zwei Anfragen mehr).

## Gegenprobe

`bash ops/timeout-quote.sh --selftest` pflanzt Zeilen ohne Netz und verlangt an einer langen Anfrage eine Quote über 0 und an Zeilen ohne
lange Anfrage genau 0. Gegen die echten Daten: Eine gepflanzte fremde Anfrage über 70 Sekunden auf `openai/gpt-5-mini` samt Ledger-Zeile,
an Kopien von Log und Ledger angehängt, hebt deren Zeile von 0 von 2 auf 1 von 3 (33,3 %); ohne die Zeile im Ledger landet sie als
`unattributed` mit Quote 100 %, geht also nicht verloren.

## Nachher

Seit abrechnung 02 trägt jede Buchung `duration_ms` und `upstream` in den Meta-Daten der Ledger-Zeile, jeder Abbruch beides in
`inference_aborts`. Die Quote ab dem Rollout zeigt `bash ops/timeout-quote.sh --since-rollout` aus der Datenbank allein und `ops/live.sh`
in der Live-Prüfung des Release Managers.
