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

## Vorher und nachher auf derselben Grundlage

Gemessen am 10.11.2026 um 23:26 UTC und mit der 2-s-Regel für `coalesced` um 23:46 UTC erneut, nur lesend, vom code-host aus mit

```
bash ops/timeout-quote.sh --compare
```

Das Werkzeug zählt beide Messungen über denselben Zeitraum: `caddy` ist der Join aus Caddy-Zugriffslog und Ledger (Dauer auf Caddys
Uhr, jede Anfrage, auch Wiederholungen), `service` ist die Datenbank allein wie `--since-rollout` (Dauer `duration_ms` des Dienstes ab
dem Aufruf beim Anbieter, eine Zeile je Buchung oder Abbruch). Den Zeitraum setzen `TQ_SINCE` und `TQ_UNTIL` (ISO-Zeit in UTC); ohne sie
beginnt er bei der ersten Buchung mit `duration_ms` und endet mit der letzten Zeile. Timeout ab 59,5 Sekunden auf beiden Uhren.

**Zeitraum:** 10.11.2026 20:27:18 UTC (erste Buchung mit `duration_ms`, Rollout von abrechnung 02) bis 10.11.2026 23:01:33 UTC (letzte
Zeile). Alle 46 Anfragen kamen von fremden Adressen (`--join` auf denselben Zeitraum beschnitten).

| Modell | Messung | Anfragen | Timeouts | Quote |
|---|---|---:|---:|---:|
| openai/gpt-5-mini | caddy | 24 | 0 | 0,0 % |
| openai/gpt-5-mini | service | 24 | 0 | 0,0 % |
| openai/gpt-5.2 | caddy | 22 | 0 | 0,0 % |
| openai/gpt-5.2 | service | 22 | 0 | 0,0 % |

**Abweichung** (caddy minus service): Anfragen 0 (46 gegen 46), Timeouts 0 (0 gegen 0). Je Ursache die Zahl der Anfragen, die sie trifft:

- coalesced: 0, Anfragen im Caddy-Log ohne eigene Zeile, deren Ende höchstens 2 s neben dem Ende einer Anfrage mit eigener Zeile liegt, weil der Coalescer beiden dieselbe Antwort im selben Moment gibt; der Join zählt sie, die Datenbank nicht. Eine Anfrage ohne Zeile, die nur eine fremde Buchung überdeckt, ist `unmatched`, damit ein Timeout ohne Abbruchzeile nicht verschwindet.
- clock: 0, Anfragen mit eigener Zeile, die auf Caddys Uhr Timeout sind und nach `duration_ms` nicht oder umgekehrt, weil die Uhr des Dienstes erst beim Aufruf des Anbieters startet.
- unmatched: 0, Anfragen im Caddy-Log ohne jede Zeile und Zeilen ohne Anfrage im Zeitraum; sie zählen mit Vorzeichen, damit die Ursachen zusammen genau die Abweichung ergeben.

Ergeben die Ursachen nicht genau die Abweichung, bricht das Werkzeug mit Exit 3 ab und nennt keine Ursache.

Widerlegt: ja, beide Messungen zählen im Zeitraum dieselben 46 Anfragen und dieselben 0 Timeouts, Abweichung 0 bei Anfragen und Timeouts.

Quote nach außen: noch keine. Nennen dürfen kanal und Seite später die Messung `service` (`bash ops/timeout-quote.sh --since-rollout`),
weil sie im Vergleich dasselbe zählt wie der Join und ohne Caddy-Log auskommt, und immer mit Zeitraum und Zahl der Anfragen. Heute sind es
46 Anfragen in gut zweieinhalb Stunden (10.11.2026 20:27 bis 23:01 UTC) ohne einen Timeout; vorher waren es 3 Timeouts in 224 Anfragen an
einem Tag. Aus 0 von 46 folgt keine Besserung, darum frühestens nach sieben Tagen ab dem Rollout (17.11.2026, `docs/kette.md`,
abrechnung 02) und erst nach einem neuen `--compare` über denselben Zeitraum.

**Gegenprobe:** `bash ops/timeout-quote.sh --selftest` pflanzt Zeilen ohne Netz und verlangt bei gleich zählenden Zeilen Abweichung 0 und
jede Ursache 0, bei einer bedienten Wiederholung und einem Paar mit 59,7 s im Log und 58,9 s `duration_ms` genau `cause coalesced: 1` und
`cause clock: 1`, und eine Zeile außerhalb von `TQ_SINCE` und `TQ_UNTIL` zählt in keiner Messung. Eine Anfrage ohne Zeile mit 59,9 s und
Status 0, die eine fremde Buchung überdeckt und 20 s nach jeder Anfrage mit Zeile endet, ergibt `cause unmatched: 1` (Zeilen
`compare overlap`). `test/timeout-quote-compare.test.ts` verlangt dazu, dass `service` je Modell dieselben Anfragen und Timeouts zählt
wie `--rows` mit demselben `TQ_SINCE`. Gegen die echten Daten: An Kopien von Log
und Ledger angehängt, eine Wiederholung während der letzten Buchung und ein Paar mit 59,7 s im Log und 58,9 s `duration_ms` heben die
Abweichung auf 1 bei Anfragen und 1 bei Timeouts, mit `cause coalesced: 1` und `cause clock: 1`.

## Einkauf ohne Verkauf

Bisher rechnete die Quote jeden Abbruch ohne Antwort mit Einkauf 0, weil `inference_aborts` dort `purchase_mc = 0` schreibt. Die
Kostenzahl kommt jetzt aus der Aktivität des Anbieters (`docs/abrechnung/einkauf-abbrueche.md`, `bash ops/abort-purchase.sh`, gemessen
am 11.11.2026 um 09:32 UTC) für denselben Zeitraum, den abgeschlossenen UTC-Tag 10.11.2026. Timeouts sind die Anfragen ab 59,5 Sekunden
an diesem Tag (Abschnitt „Quote vorher je Modell“; nach dem Rollout um 20:27 UTC 0 bei beiden Modellen,
`TQ_UNTIL=2026-11-11T00:00:00Z bash ops/timeout-quote.sh --since-rollout`).

| Modell | Timeouts | Abbrüche ohne Antwort | Einkauf ohne Verkauf mc |
|---|---:|---:|---:|
| openai/gpt-5-mini | 0 | 0 | 0 |
| openai/gpt-5.2 | 3 | 0 | 0 |

Die drei Timeouts bei `openai/gpt-5.2` liegen vor dem Rollout von `inference_aborts`, wurden gebucht und stehen mit ihrem Einkauf im
Ledger, darum keine Zeile ohne Antwort. Die Lücke zwischen Anbieter und Ledger liegt bei beiden Modellen innerhalb der Toleranz (783 mc
und -160 mc), also kauft keine Anfrage unbemerkt ein.

Anbieterwahl: Das Routing `{ sort: "throughput", allow_fallbacks: true }` aus abrechnung 02 bleibt, weil der Einkauf ohne Verkauf im Zeitraum bei beiden Modellen 0 mc ist und seit dem Rollout kein Timeout auftrat; eine Zahl, die für ein anderes Routing spräche, gibt es nicht.
