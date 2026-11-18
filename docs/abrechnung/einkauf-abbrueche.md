# Einkauf abgebrochener Anfragen gegen die Abrechnung des Anbieters (abrechnung 04)

Gemessen am 11.11.2026 um 09:32 UTC, nur lesend, vom code-host aus mit

```
bash ops/abort-purchase.sh
```

Das Werkzeug holt bei OpenRouter die Aktivität des Kontos (`GET /api/v1/activity`, Management-Key seit dem 13.11.2026 nur aus
`~/.config/control-plane/openrouter-management.env` mit Rechten 0600, sonst kein Aufruf beim Anbieter) und liest Ledger (`kind = 'inference'`) und `inference_aborts`
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

## Grundlinie je Modell

Die Lücke gibt es auch ohne jeden Abbruch (Rundung je Buchung, Buchungen über Mitternacht). Damit sie nicht einem einzelnen Abbruch als
Einkauf zufällt, zieht das Werkzeug je Modell die Grundlinie ab, den Median der Lücken an den Tagen ohne Abbruch ohne Antwort und ohne
`noise` (ohne solchen Tag 0); `je Abbruch mc` und `purchase without sale` rechnen mit Lücke minus Grundlinie, die Spalte `Lücke mc` bleibt
roh. Nachgemessen am 11.11.2026 um 10:31 UTC mit demselben Befehl, gleiche Tabelle:

| Modell | Grundlinie mc | Tage ohne Abbruch |
|---|---:|---:|
| openai/gpt-5-mini | 783 | 1 |
| openai/gpt-5.2 | -160 | 1 |

Beide Grundlinien stehen auf einem einzigen Tag und sind darum noch grob; mit jedem weiteren Tag wird der Median stabiler.

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

Am 10.11.2026 gab es bei beiden Modellen keine Zahl je Abbruch ohne Antwort, weil es an diesem Tag keinen solchen Abbruch gab; die
0 mc oben stehen auf einem Tag ohne einen einzigen. Gemessen über sieben Tage ist der Einkauf je Abbruch im Abschnitt
`## Nach sieben Tagen`.

## Nach sieben Tagen

Gemessen am 18.11.2026 um 00:18 UTC, nur lesend, vom code-host aus über dieselben ganzen UTC-Tage wie `--compare` in
`docs/abrechnung/timeouts.md` (10. bis 17.11.2026; die Aktivität des Anbieters kennt nur ganze Tage, der Rollout-Tag zählt ganz) mit

```
AP_SINCE=2026-11-10 AP_NOW=2026-11-18T00:00:00Z bash ops/abort-purchase.sh
```

| Tag | Modell | Anbieter mc | Einkauf mc | Lücke mc | ohne Antwort | je Abbruch mc |
|---|---|---:|---:|---:|---:|---:|
| 2026-11-10 | openai/gpt-5-mini | 37675 | 36892 | 783 | 0 | - |
| 2026-11-10 | openai/gpt-5.2 | 1601660 | 1597907 | 3753 | 0 | - |
| 2026-11-11 | openai/gpt-5-mini | 11849 | 11575 | 274 | 0 | - |
| 2026-11-11 | openai/gpt-5.2 | 47383 | 47399 | -16 | 0 | - |
| 2026-11-12 | openai/gpt-5-mini | 271050 | 271390 | -340 | 2 | 0 |
| 2026-11-12 | openai/gpt-5.2 | 366344 | 358570 | 7774 | 1 | 7783 |
| 2026-11-13 | openai/gpt-5-mini | 82631 | 82728 | -97 | 0 | - |
| 2026-11-14 | openai/gpt-5-mini | 15926 | 15951 | -25 | 1 | 0 |
| 2026-11-14 | openai/gpt-5.2 | 27090 | 27092 | -2 | 0 | - |
| 2026-11-15 | openai/gpt-5-mini | 13466 | 13488 | -22 | 0 | - |
| 2026-11-16 | openai/gpt-5-mini | 8593 | 8605 | -12 | 0 | - |
| 2026-11-16 | openai/gpt-5.2 | 32025 | 32037 | -12 | 10 | 0 |
| 2026-11-17 | openai/gpt-5-mini | 5066 | 5073 | -7 | 0 | - |
| 2026-11-17 | openai/gpt-5.2 | 24015 | 23249 | 766 | 9 | 86 |

```
noise 2026-11-10 openai/gpt-5.2: 3753
baseline openai/gpt-5-mini: -9
baseline openai/gpt-5.2: -9
purchase without sale openai/gpt-5-mini: 0 (answered late 0, estimated 0 for 3 aborts without answer)
purchase without sale openai/gpt-5.2: 0 (no estimate for 20 aborts without answer: noise on 1 days)
other models at the provider: 0 (0 mc)
```

Im Zeitraum stehen 23 Abbrüche ohne Antwort in `inference_aborts`, alle nach dem Ausfall: 3 bei `openai/gpt-5-mini`, 20 bei
`openai/gpt-5.2`. Vom 11.11.2026 02:01 UTC bis 12.11.2026 08:22 UTC war das Guthaben beim Anbieter leer und der Dienst antwortete auf
Inferenz mit 503 (fehler 01); diese Anfragen sind keine Abbrüche und kaufen nichts ein, darum sind die Beträge am 11.11. klein.

Der 10.11.2026 ist bei `openai/gpt-5.2` `noise`: 3753 mc Lücke ohne einen Abbruch ohne Antwort, über der Toleranz von 1000 mc. Am
11.11.2026 maß dasselbe Werkzeug für diesen Tag beim Anbieter 1597747 mc und eine Lücke von -160 mc; der Anbieter meldet den Tag heute
um 3913 mc höher. Mit `noise` an einem Tag schätzt das Werkzeug für das ganze Modell keinen Einkauf ohne Verkauf, weil die Lücke dort
nicht nur unsere ist. Zum Vergleich ohne den 10.11. (`AP_SINCE=2026-11-11 AP_NOW=2026-11-18T00:00:00Z bash ops/abort-purchase.sh`,
gleich danach gemessen): kein `noise`, `purchase without sale openai/gpt-5.2: 8558 (answered late 0, estimated 8558 for 20 aborts
without answer)`, davon 7783 mc an dem einen Abbruch vom 12.11.2026, und bei `openai/gpt-5-mini` 0 für 3 Abbrüche.

Einkauf je Abbruch ohne Antwort: keine Zahl, weil das Werkzeug für openai/gpt-5.2 wegen `noise` am 10.11.2026 (3753 mc Lücke ohne einen Abbruch) nicht schätzt; ohne den 10.11. sind es bei openai/gpt-5.2 8558 mc für 20 Abbrüche (428 mc je Abbruch, davon 7783 mc an einem Abbruch am 12.11.) und bei openai/gpt-5-mini 0 mc für 3 Abbrüche.

## Gegenprobe des Werkzeugs

`bash ops/abort-purchase.sh --selftest` rechnet ohne Netz in beide Richtungen: gleiche Beträge ergeben Lücke 0 und keine `noise`-Zeile,
zwei Abbrüche ohne Antwort mit 300 mc mehr beim Anbieter ergeben 150 je Abbruch, ein Tag ohne Abbruch mit 5000 mc mehr ergibt `noise`.
Zwei Tage ohne Abbruch mit 700 und 900 mc Lücke ergeben die Grundlinie 800 und an einem Tag mit einem Abbruch und 1100 mc Lücke 300 je
Abbruch statt 1100. Mit `AP_TOLERANCE_MC=1000000` wird der Selftest rot. Die Abfrage der Produktion (`ROWS_JS` aus dem Werkzeug) liefert an einer Kopie mit
einer gepflanzten Zeile `answered = 0` genau diese Zeile und an der leeren Tabelle keine, die leere Liste der Produktion ist also keine
falsche Null.
