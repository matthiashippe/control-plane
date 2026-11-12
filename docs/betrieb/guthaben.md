# Guthaben beim Inferenz-Anbieter

Am 11.11.2026 war das Guthaben beim Inferenz-Anbieter leer, und ein zahlender fremder Automaton bekam ab 02:01 UTC auf
`POST /v1/chat/completions` 503, bis jemand nachsah (`goals/_vorschlaege/fehler-2026-11-11-1.md`). Seit fehler 01 rechnet
`ops/credit-runway.sh` aus, wie lange das Guthaben reicht, und `ops/watchdog.sh` meldet über den Webhook, wenn die Reichweite unter
die Schwelle fällt und wenn sie zurückkommt.

## Rechnung

- Rest: `data.total_credits` minus `data.total_usage` aus `GET https://openrouter.ai/api/v1/credits`.
- Verbrauch je Tag: `data.usage_weekly` aus `GET https://openrouter.ai/api/v1/key` geteilt durch 7, mindestens
  `CP_CREDIT_MIN_DAILY_USD` (Standard 1 USD), damit ein Ausfall ohne Verbrauch die Reichweite nicht unendlich macht.
- Reichweite: Rest geteilt durch Verbrauch je Tag.
- Schwelle: das Größere aus `CP_CREDIT_WARN_USD` (Standard 5 USD) und `CP_CREDIT_WARN_DAYS` (Standard 3) mal Verbrauch je Tag.
  Liegt der Rest darunter oder bei 0, ist es `LOW`.

Beide Abfragen beantworten den normalen Schlüssel `OPENROUTER_API_KEY`; ein Management-Key wird nicht gelesen. Auf dem code-host
geht der Schlüssel über stdin an curl, auf dem Server fragt `--container` aus dem Container `deploy-cp-1` heraus, so verlässt der
Schlüssel den Container nicht. Ausgegeben werden nur Zahlen.

## Messung am 12.11.2026

Gemessen um 10:51:33 UTC auf dem code-host mit dem Schlüssel aus `~/.config/control-plane/loop.env`:

```
$ bash ops/credit-runway.sh
CREDIT RUNWAY OK: 9.37 USD, 3.7 days at 2.49 USD per day, threshold 7.46 USD
```

Dieselbe Zahl um 10:51:35 UTC aus dem Container der Produktion, nur lesend (das Skript läuft über stdin, auf dem Server wird keine
Datei angelegt):

```
$ ssh -i "$CP_SSH_KEY" "$CP_HOST" 'bash -s -- --container' < ops/credit-runway.sh
CREDIT RUNWAY OK: 9.37 USD, 3.7 days at 2.49 USD per day, threshold 7.46 USD
```

| Größe | Wert |
|---|---|
| Rest | 9,37 USD |
| Verbrauch je Tag | 2,49 USD (17,41 USD in 7 Tagen) |
| Reichweite | 3,7 Tage |
| Schwelle | 7,46 USD (3 Tage mal 2,49 USD, größer als 5 USD) |
| Uhrzeit | 12.11.2026, 10:51:33 UTC |

Der Rest liegt 1,91 USD über der Schwelle; beim Verbrauch von heute fällt er in weniger als einem Tag darunter.

## Watchdog

`ops/watchdog.sh` ruft bei jedem Lauf (Cron auf dem Server, alle 5 Minuten) `ops/credit-runway.sh --container` und meldet nur den
Wechsel: einmal `[WARN] credit CREDIT RUNWAY LOW: …` mit dem Weg zum Aufladen `https://openrouter.ai/settings/credits`, wenn LOW
beginnt, noch einmal `[WARN] credit empty, … USD left, …`, wenn der Rest danach auf 0 oder darunter fällt (der Zustand vom
11.11.2026), und einmal `[OK] credit CREDIT RUNWAY OK: …`, wenn es endet. Ist der Rest schon beim ersten Lauf 0, kommt nur die
Meldung `empty`. Zwischen den Wechseln steht im Log je Lauf eine Zeile `[INFO] credit …`. Ist die Antwort nicht lesbar oder kommt
sie nicht binnen `CP_CREDIT_TIMEOUT` Sekunden (Standard 45, danach läuft die Gesundheit trotzdem), steht `[WARN] credit
unreadable` im Log, über den Webhook höchstens einmal am Tag, und der gespeicherte Zustand (`<CP_WATCHDOG_STATE>.credit`) bleibt. Auf dem Server wirkt das mit dem nächsten Rollout des Laufzeitpfads,
denn `ops/` rollt nicht allein aus (`LOOP.md`, Release).

Selbsttest ohne Netz: `bash ops/credit-runway.sh --selftest`.
