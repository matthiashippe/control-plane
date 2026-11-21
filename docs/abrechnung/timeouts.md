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

Ergebnis der Widerlegung: ja, beide Messungen zählen im Zeitraum dieselben 46 Anfragen und dieselben 0 Timeouts, Abweichung 0 bei Anfragen und Timeouts.

Die Quote nach außen dieses Abschnitts (noch keine, weil 0 Timeouts in 46 Anfragen in gut zweieinhalb Stunden keine Besserung tragen)
ist abgelöst: Sie steht seit abrechnung 05 im Abschnitt `## Nach sieben Tagen`, gemessen über sieben Tage mit der Messung `service`.

**Gegenprobe:** `bash ops/timeout-quote.sh --selftest` pflanzt Zeilen ohne Netz und verlangt bei gleich zählenden Zeilen Abweichung 0 und
jede Ursache 0, bei einer bedienten Wiederholung und einem Paar mit 59,7 s im Log und 58,9 s `duration_ms` genau `cause coalesced: 1` und
`cause clock: 1`, und eine Zeile außerhalb von `TQ_SINCE` und `TQ_UNTIL` zählt in keiner Messung. Eine Anfrage ohne Zeile mit 59,9 s und
Status 0, die eine fremde Buchung überdeckt und 20 s nach jeder Anfrage mit Zeile endet, ergibt `cause unmatched: 1` (Zeilen
`compare overlap`). `test/timeout-quote-compare.test.ts` verlangt dazu, dass `service` je Modell dieselben Anfragen und Timeouts zählt
wie `--rows` mit demselben `TQ_SINCE`. Gegen die echten Daten: An Kopien von Log
und Ledger angehängt, eine Wiederholung während der letzten Buchung und ein Paar mit 59,7 s im Log und 58,9 s `duration_ms` heben die
Abweichung auf 1 bei Anfragen und 1 bei Timeouts, mit `cause coalesced: 1` und `cause clock: 1`.

## Nach sieben Tagen

Gemessen am 18.11.2026 um 00:17 UTC, nur lesend, vom code-host aus mit

```
TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/timeout-quote.sh --compare
```

**Zeitraum:** 10.11.2026 20:27:18 UTC (erste Buchung mit `duration_ms`, Rollout von abrechnung 02) bis 17.11.2026 23:59:59 UTC, fest,
damit die Zahl wiederholbar ist. Das Caddy-Log deckt ihn ganz ab, seine erste Zeile ist vom 01.10.2026 14:59 UTC (`ops/access-log.sh`
liest auch die gedrehten Dateien). Exit 0.

**Ausfall im Zeitraum:** Vom 11.11.2026 02:01 UTC bis 12.11.2026 08:22 UTC war das Guthaben beim Anbieter leer, und der Dienst
antwortete auf `POST /v1/chat/completions` 1393 Mal mit 503 (fehler 01; gezählt aus `bash ops/access-log.sh`, Status 503 auf diesem
Pfad ab `TQ_SINCE`). Diese Anfragen sind weder Timeout noch Abbruch und zählen in keiner Messung, weil nur Status 200 und 0 zählen.

| Modell | Messung | Anfragen | Timeouts | Quote |
|---|---|---:|---:|---:|
| openai/gpt-5-mini | caddy | 994 | 0 | 0,0 % |
| openai/gpt-5-mini | service | 995 | 0 | 0,0 % |
| openai/gpt-5.2 | caddy | 224 | 0 | 0,0 % |
| openai/gpt-5.2 | service | 225 | 0 | 0,0 % |
| unattributed | caddy | 2 | 0 | 0,0 % |
| unattributed | service | 0 | 0 | - |

**Abweichung** (caddy minus service): Anfragen 0 (1220 gegen 1220), Timeouts 0 (0 gegen 0).

Die Gegenrechnung (`--join` und `--rows` über dieselben Eingaben und denselben Zeitraum, ohne die Klassen des Vergleichs) zählt gleich:

```
check caddy: compare 1220 0, join 1220 0
check service openai/gpt-5-mini: compare 995 0, rows 995 0
check service openai/gpt-5.2: compare 225 0, rows 225 0
```

Je Ursache die Zahl der Anfragen und Zeilen, die sie trifft:

- Ursache coalesced: 0, keine Wiederholung, die der Coalescer mit der Antwort einer anderen Anfrage bediente.
- Ursache clock: 0, keine Anfrage, die auf einer Uhr Timeout ist und auf der anderen nicht.
- Ursache unmatched: 4, je zwei Anfragen ohne eigene Zeile (12.11.2026 15:00:57 und 14.11.2026 14:52:21 UTC) und zwei Zeilen ohne Anfrage, je
  1 ms neben der Anfrage geschrieben. Die Generation beim Anbieter startete 3,5 s und 2,4 s nach dem Beginn der Anfrage im Log, also
  außerhalb der 2 s, mit denen eine Anfrage ihre Zeile findet. Mit Vorzeichen heben sie sich auf (Anfragen 0, Timeouts 0); darum
  stehen die beiden Anfragen als `unattributed` und ihre Zeilen bei ihrem Modell.

Die längsten Anfragen im Zeitraum liefen 48,9 bis 53,9 s, sieben ab 45 s, alle am 12.11.2026 zwischen 14:22 und 14:48 UTC, kurz nach
dem Ausfall; eine davon brach der Client nach 48,9 s ab.

Widerlegt: nein, der Vergleich zählt gleich: beide Messungen und beide Gegenrechnungen zählen im Zeitraum dieselben 1220 Anfragen und dieselben 0 Timeouts, und
jede Abweichung einer einzelnen Anfrage hat eine Ursache.

Quote nach außen: 0,0 % (0 von 1220 Anfragen, 10.11.2026 20:27 bis 17.11.2026 23:59 UTC, Messung service), vorher 1,3 % (3 von 224 Anfragen am 10.11.2026 vor dem Rollout, Messung caddy). Aus 0 von 1220 folgt mit 95 % Sicherheit eine Quote unter 0,25 % (3 durch 1220). Die 503 des Ausfalls (oben) zählen nicht mit.
Antwortquote nach außen: 45,8 % (1197 von 2613 Anfragen, 10.11.2026 20:27 bis 17.11.2026 23:59 UTC, ohne 4xx), davon 1393 mit 503 während des Ausfalls 11.11. 02:01 bis 12.11.2026 08:22 UTC.
Regel nach außen: Nach außen steht „Quote nach außen“ nur zusammen mit „Antwortquote nach außen“ oder für einen Zeitraum ohne Ausfall; ein Ausfall ist jede Stunde mit einer Antwort 5xx auf `POST /v1/chat/completions`.

**Gegenprobe:** `bash ops/timeout-quote.sh --selftest` verlangt bei gleich zählenden Zeilen die `check`-Zeilen mit gleichen Zahlen
(`compare check equal`) und bei einem Paar, dessen Anfrage 5 s vor `TQ_UNTIL` endet und dessen Zeile 3 s danach geschrieben wird,
Exit 0 (`compare check boundary`); mit einem Join, der nach dem Ende der Anfrage einordnet, ist genau diese Zeile rot
(`check caddy: compare 1 0, join 2 0`, Exit 3). `test/timeout-quote-compare.test.ts` verfälscht in einer Kopie des Werkzeugs die
Klassifikation (eine bediente Wiederholung zählt als Paar, also auch in `service`) und verlangt Exit 3 mit
`independent check failed: service openai/gpt-5.2`; die Summenprobe der Ursachen bleibt dabei stumm, weil Ursachen und Abweichung aus
denselben falschen Klassen gezählt werden. `bash ops/timeout-quote.sh --selftest-scale` fährt 200000 gepflanzte Anfragen samt Zeilen in
wenigen Sekunden durch den Vergleich; der Abgleich bis abrechnung 04 brauchte dafür 3 min 52 s und endete mit `RangeError`.

**Antwortquote:** Gemessen am 21.11.2026 um 08:38 UTC, nur lesend, vom code-host aus über denselben Zeitraum mit

```
TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/answer-quote.sh
```

```
period 2026-11-10T20:27:18.000Z to 2026-11-17T23:59:59.000Z
status 0: 23
status 200: 1197
status 401: 4002
status 402: 7965
status 404: 1
status 503: 1393
answers: 1197 of 2613 (45.8 %), excluded 4xx 11968
```

Exit 0. Gezählt wird jede Anfrage `POST /v1/chat/completions` nach ihrem Ende: Status 200 zählt für uns, Status 0 (der Client
brach ab) und jeder 5xx gegen uns, 4xx (401 ohne Anmeldung, 402 ohne Guthaben, 404) fällt heraus, weil es eine Antwort über die
Anfrage selbst ist. Die 1197 Antworten mit 200 und die 23 Abbrüche sind zusammen die 1220 Anfragen der Quote; die 1393 mit 503 sind
dieselben wie im Absatz „Ausfall im Zeitraum“ und liegen alle zwischen 11.11.2026 02:01:29 und 12.11.2026 08:22:49 UTC, einen anderen
5xx gab es im Zeitraum nicht.

**Gegenprobe der Antwortquote:** `jq` zählt über dieselbe Kopie des Logs je Status dieselben Zahlen. Vier gepflanzte Zeilen (503 und
402 im Zeitraum, 200 genau auf `TQ_UNTIL`, 503 eine Sekunde danach) ergeben `answers: 1198 of 2615 (45.8 %), excluded 4xx 11969`,
und dieselbe Kopie erst ab 11.11.2026 12:26 UTC endet mit Exit 2 (`access log starts after TQ_SINCE`). `bash ops/answer-quote.sh --selftest`
pflanzt je Regel einen Fall, `test/answer-quote.test.ts` verfälscht die Statusregel in zwei Kopien (503 fällt heraus, 4xx zählt mit)
und verlangt je den passenden `FAIL` mit Exit 1.

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

Über sieben Tage (10. bis 17.11.2026, `AP_SINCE=2026-11-10 AP_NOW=2026-11-18T00:00:00Z bash ops/abort-purchase.sh`) steht die Messung
in `docs/abrechnung/einkauf-abbrueche.md`, Abschnitt `## Nach sieben Tagen`:

Einkauf je Abbruch ohne Antwort: keine Zahl, weil das Werkzeug für openai/gpt-5.2 wegen `noise` am 10.11.2026 (3753 mc Lücke ohne einen Abbruch) nicht schätzt; ohne den 10.11. sind es bei openai/gpt-5.2 8558 mc für 20 Abbrüche (428 mc je Abbruch, davon 7783 mc an einem Abbruch am 12.11.) und bei openai/gpt-5-mini 0 mc für 3 Abbrüche.

Anbieterwahl: Das Routing `{ sort: "throughput", allow_fallbacks: true }` aus abrechnung 02 bleibt nach der Messung vom 10.11.2026 20:27 bis 17.11.2026 23:59 UTC (Abschnitt `## Nach sieben Tagen` hier und in `docs/abrechnung/einkauf-abbrueche.md`): Die Quote nach außen ist 0,0 % (0 Timeouts von 1220 Anfragen, Messung service), und der Einkauf je Abbruch ohne Antwort ist keine Zahl wegen `noise` am 10.11.; ohne den 10.11. kauft openai/gpt-5.2 8558 mc für 20 Abbrüche ohne Antwort ein, das sind 1,8 % seines Einkaufs von 488347 mc im selben Zeitraum, und 7783 mc davon entfallen auf einen einzigen Abbruch am 12.11., bei openai/gpt-5-mini sind es 0 mc für 3 Abbrüche (`AP_SINCE=2026-11-11 AP_NOW=2026-11-18T00:00:00Z bash ops/abort-purchase.sh`, gemessen 18.11.2026). Ein anderes Routing senkt diesen Einkauf nur, wenn es Abbrüche ohne Antwort verhindert, und ohne einen einzigen Timeout im Zeitraum zeigt keine Zahl dorthin.
