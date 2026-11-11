# Einkauf abgebrochener Anfragen gegen die Abrechnung des Anbieters (abrechnung 04)

Gemessen am 11.11.2026 um 09:32 UTC, nur lesend, vom code-host aus mit

```
bash ops/abort-purchase.sh
```

Das Werkzeug holt bei OpenRouter die Aktivität des Kontos (`GET /api/v1/activity`, Management-Key aus
`~/.config/control-plane/loop.env`, sonst kein Aufruf beim Anbieter) und liest Ledger (`kind = 'inference'`) und `inference_aborts`
mit `readonly: true` im Container. Je abgeschlossenem UTC-Tag und Modell stellt es den Betrag des Anbieters gegen unseren Einkauf und
verteilt die Lücke auf die Abbrüche ohne Antwort desselben Tages und Modells. 1 mc sind 0,00001 USD. Toleranz 1000 mc je Tag und Modell
(`goals/abrechnung/ANNAHMEN.md`, Goal 04).

**Zeitraum:** abgeschlossene UTC-Tage ab dem 10.11.2026 (Rollout von `inference_aborts`) bis vor dem 11.11.2026, also nur der
10.11.2026. Der laufende Tag fehlt in der Aktivität des Anbieters und zählt nicht.

## Je Tag und Modell

| Tag | Modell | Anbieter mc | Einkauf mc | Lücke mc | ohne Antwort | je Abbruch mc |
|---|---|---:|---:|---:|---:|---:|
| 2026-11-10 | openai/gpt-5-mini | 37675 | 36892 | 783 | 0 | - |
| 2026-11-10 | openai/gpt-5.2 | 1597747 | 1597907 | -160 | 0 | - |

`noise`-Zeilen: keine. Beide Lücken liegen innerhalb der Toleranz, obwohl der Tag keinen Abbruch ohne Antwort hat; das ist die
Gegenprobe aus echten Daten, dass Ledger und Anbieter je Modell dasselbe zählen. Andere Modelle beim Anbieter an diesem Tag: 0 mc.

## Einkauf ohne Verkauf je Modell

| Modell | mc | USD |
|---|---:|---:|
| openai/gpt-5-mini | 0 | 0,00 |
| openai/gpt-5.2 | 0 | 0,00 |

Beide Zahlen sind 0, weil `inference_aborts` bei der Messung keine einzige Zeile hat, weder mit noch ohne Antwort (Abfrage lesend über
`docker exec deploy-cp-1`, gruppiert nach Tag, Modell und `answered`: leere Liste). Das Caddy-Zugriffslog bestätigt es: Seit dem Rollout
(10.11.2026 20:27 UTC) lief kein `POST /v1/chat/completions` 55 Sekunden oder länger, also brach kein Client vor der Antwort ab. Die
drei Timeouts vom 10.11.2026 (05:25 bis 05:37 UTC) liegen vor dem Rollout, stehen als Buchung im Ledger und zählen dort zum Einkauf.

Widerlegt: ja, an jedem Tag und Modell liegt die Lücke innerhalb der Toleranz (783 mc und -160 mc), der Einkauf eines Abbruchs ohne Antwort ist im Zeitraum 0.

Einkauf je Abbruch ohne Antwort: openai/gpt-5-mini keine Zahl, weil es im Zeitraum keinen Abbruch ohne Antwort gab.
Einkauf je Abbruch ohne Antwort: openai/gpt-5.2 keine Zahl, weil es im Zeitraum keinen Abbruch ohne Antwort gab.

## Gegenprobe des Werkzeugs

`bash ops/abort-purchase.sh --selftest` rechnet ohne Netz in beide Richtungen: gleiche Beträge ergeben Lücke 0 und keine `noise`-Zeile,
zwei Abbrüche ohne Antwort mit 300 mc mehr beim Anbieter ergeben 150 je Abbruch, ein Tag ohne Abbruch mit 5000 mc mehr ergibt `noise`.
Mit `AP_TOLERANCE_MC=1000000` wird der Selftest rot. Die Abfrage der Produktion (`ROWS_JS` aus dem Werkzeug) liefert an einer Kopie mit
einer gepflanzten Zeile `answered = 0` genau diese Zeile und an der leeren Tabelle keine, die leere Liste der Produktion ist also keine
falsche Null.
