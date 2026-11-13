# Keine Anfrage scheitert am Neustart

Jeder Rollout startet `cp` neu, und rund 16 Sekunden lang hört niemand auf `cp:8402`. Bis zu diesem Goal antwortete Caddy in dieser
Zeit sofort mit 502. Seit betrieb 02 stehen im Block `reverse_proxy cp:8402` von `deploy/Caddyfile` die Zeilen `lb_try_duration 30s`
und `lb_try_interval 250ms`: Caddy hält eine Anfrage, deren Verbindung scheitert, bis zu 30 Sekunden und versucht es alle 250 ms
erneut, bis der neue Prozess antwortet. Eine Anfrage, deren Verbindung schon stand, wiederholt Caddy nur für `GET`; ein
`lb_retry_match` gibt es nicht, damit keine abgerissene Inferenz ein zweites Mal beim Anbieter eingekauft wird. Den lokalen Beweis
führt `PATH=$HOME/.local/bin:$PATH bash ops/caddy-retry.sh --selftest`.

## Vorher

Je Rollout seit 2026-11-10 00:00 UTC, dessen Job `deploy` grün lief, eine Zeile. Die Zeit ist der Start des Containers aus dem Log des
Laufs, das Fenster reicht 60 s davor bis 180 s danach.

- 2026-11-10 18:53:58 UTC: 0 mal 502 an fremde Adressen, 25 Anfragen von außen
- 2026-11-10 20:27:07 UTC: 2 mal 502 an fremde Adressen, 22 Anfragen von außen
- 2026-11-12 05:57:56 UTC: 0 mal 502 an fremde Adressen, 15 Anfragen von außen
- 2026-11-12 16:41:02 UTC: 3 mal 502 an fremde Adressen, 67 Anfragen von außen
- 2026-11-12 18:15:46 UTC: 1 mal 502 an fremde Adressen, 99 Anfragen von außen
- 2026-11-12 22:43:42 UTC: 1 mal 502 an fremde Adressen, 52 Anfragen von außen

Summe vorher: 7 mal 502 in 6 Fenstern

Gemessen am 12.11.2026 um 22:54 UTC, je Fenster mit genau einem dieser Befehle (Zahlen aus der Zeile `BAD GATEWAY <n> of <m> request(s)
from outside answered 502`):

```
set -a; . ~/.config/control-plane/loop.env; set +a
bash ops/deploy-window.sh --at 2026-11-10T18:53:58
bash ops/deploy-window.sh --at 2026-11-10T20:27:07
bash ops/deploy-window.sh --at 2026-11-12T05:57:56
bash ops/deploy-window.sh --at 2026-11-12T16:41:02
bash ops/deploy-window.sh --at 2026-11-12T18:15:46
bash ops/deploy-window.sh --at 2026-11-12T22:43:42
```

Die Liste der Rollouts kommt aus `gh run list -R matthiashippe/control-plane --workflow deploy.yml --branch dev --created '>=2026-11-10'`
(54 Läufe), je Lauf `gh run view <id> --json jobs` (Job `deploy` mit `success`, 6 Läufe) und `gh run view <id> --log` (Zeile
`deploy   <Zeit> UTC, taken from the container start`).

Die 502 trafen `POST /v1/chat/completions` (2 mal am 10.11. um 20:27) und `GET /v1/credits/balance` (5 mal am 12.11.). Die 4 mal 503 auf
`POST /v1/chat/completions` im Fenster vom 12.11. um 05:57:56 kamen aus dem Dienst selbst, weil das Guthaben beim Anbieter leer war
(fehler 01): Das ist kein Neustart und verschwindet mit diesem Goal nicht.

## Nachher

Eine reine Änderung am Caddyfile startet `cp` nicht neu, nur Caddy (`deploy/README.md`, Was rollout.sh tut, Schritt 4); gemessen wird
deshalb im Fenster der Rollouts nach betrieb 02, die `cp` neu starteten. Der Schritt „Deploy-Fenster“ von `deploy.yml` misst 21 s nach
dem Start des Containers, wenn vom Fenster noch 158 s fehlen, und meldet deshalb nur `PARTIAL`. Das ganze Fenster
misst erst `ops/deploy-window.sh --at` danach, und nur diese Zahlen stehen hier.

- 2026-11-13 00:48:29 UTC: 0 mal 502 an fremde Adressen, 53 Anfragen von außen
- 2026-11-13 09:55:22 UTC: 0 mal 502 an fremde Adressen, 104 Anfragen von außen

Summe nachher: 0 mal 502 in 2 Fenstern

Gemessen am 13.11.2026 um 17:06 UTC, je Fenster mit genau einem dieser Befehle (Zahlen aus der Zeile `BAD GATEWAY <n> of <m> request(s)
from outside answered 502`):

```
set -a; . ~/.config/control-plane/loop.env; set +a
bash ops/deploy-window.sh --at 2026-11-13T00:48:29
bash ops/deploy-window.sh --at 2026-11-13T09:55:22
```

Die Zeiten sind der Start des Containers aus `gh run view <id> -R matthiashippe/control-plane --log` (Zeile
`deploy   <Zeit> UTC, taken from the container start`): Lauf 43339659780 (Merge von PR #54, betrieb 02) für 00:48:29 und Lauf
43404327407 (Merge von PR #62, sandbox 05, der erste Rollout danach, der `cp` neu startete) für 09:55:22. Seit dem 13.11.2026 00:00 UTC
hatten nur diese zwei Läufe einen grünen Job `deploy`. Im Lauf meldete der Schritt `PARTIAL` mit 0 von 25 und 0 von 91 Anfragen.

Das erste Fenster ist `CLEAN`. Das zweite meldet `AFFECTED` mit 21 Antworten mit 4xx (400 und 405 auf `/pay/…`, 400 auf
`POST /v1/auth/verify`, 429 auf `POST /v1/auth/keyless`, 402 auf `POST /v1/chat/completions`): Kein 502 ist darunter, und keine
dieser Antworten kommt vom Neustart.

In den 10 s nach dem Start fiel in keines der zwei Fenster eine Anfrage von außen:

- 2026-11-13 00:48:29 UTC: 0 Anfragen von außen in den 10 s nach dem Start
- 2026-11-13 09:55:22 UTC: 0 Anfragen von außen in den 10 s nach dem Start

Gemessen am 13.11.2026 um 17:23 UTC mit diesem Befehl, der je Fenster die Anfragen von Adressen außerhalb von `own_ips` mit
Zeitstempel bis 10 s nach dem Start zählt:

```
set -a; . ~/.config/control-plane/loop.env; set +a; . ops/own-ips.sh; o=$(own_ips 2>/dev/null); bash ops/access-log.sh | python3 -c 'import sys,json,datetime as D;own=set(sys.argv[1].split());w={t:D.datetime.fromisoformat("2026-11-13T"+t+"+00:00").timestamp() for t in sys.argv[2:]};rs=[json.loads(l) for l in sys.stdin if l.startswith("{")];[print(t,sum(1 for r in rs if s<=r["ts"]<=s+10 and r.get("request",{}).get("remote_ip") not in own)) for t,s in w.items()]' "$o" 00:48:29 09:55:22
```

Warum gerade diese 10 s zählen, ob das Zugriffslog die Fenster überhaupt abdeckt und ob der Zähler einen Treffer findet, zeigt der
folgende Befehl, gemessen am 13.11.2026 um 18:18 UTC. Er gibt je Start die Einträge des Zugriffslogs in den 5 Minuten davor und
danach, die Anfragen von außen in den 10 s nach dem Start und den Abstand jedes 502 an eine fremde Adresse zum Start in Sekunden
aus, für die zwei Fenster nachher, die sechs Fenster unter `## Vorher` und als leere Kontrolle einen Zeitpunkt ohne Log:

```
set -a; . ~/.config/control-plane/loop.env; set +a; . ops/own-ips.sh; o=$(own_ips 2>/dev/null); bash ops/access-log.sh | python3 -c 'import sys,json,datetime as D;own=set(sys.argv[1].split());rs=[json.loads(l) for l in sys.stdin if l.startswith("{")];T=lambda t:D.datetime.fromisoformat(t+"+00:00").timestamp();x=lambda r:r.get("request",{}).get("remote_ip") not in own;[print(t,sum(1 for r in rs if abs(r["ts"]-T(t))<=300),sum(1 for r in rs if 0<=r["ts"]-T(t)<=10 and x(r)),*["%.1f"%(r["ts"]-T(t)) for r in rs if 0<=r["ts"]-T(t)<=180 and r.get("status")==502 and x(r)]) for t in sys.argv[2:]]' "$o" 2026-11-13T00:48:29 2026-11-13T09:55:22 2026-11-10T18:53:58 2026-11-10T20:27:07 2026-11-12T05:57:56 2026-11-12T16:41:02 2026-11-12T18:15:46 2026-11-12T22:43:42 2030-01-01T00:00:00
```

Ausgabe:

```
2026-11-13T00:48:29 162 0
2026-11-13T09:55:22 606 0
2026-11-10T18:53:58 327 0
2026-11-10T20:27:07 103 3 0.2 1.4
2026-11-12T05:57:56 75 0
2026-11-12T16:41:02 225 4 2.4 3.3 5.1
2026-11-12T18:15:46 204 13 2.6
2026-11-12T22:43:42 175 13 1.8
2030-01-01T00:00:00 0 0
```

Alle 7 mal 502 unter `## Vorher` kamen also 0,2 bis 5,1 s nach dem Start, alle in den 10 s, die der Zähler oben prüft. Der Zähler
findet dort Anfragen von außen (3, 4, 13 und 13 in den Fenstern mit 502), das Zugriffslog deckt beide Fenster nachher mit 162 und 606
Einträgen ab, und am Zeitpunkt ohne Log gibt er 0 und 0 aus. Die zwei Nullen nachher heißen deshalb, dass keine Anfrage von außen
kam, nicht, dass das Log blind war.

Ergebnis: betrieb 02 hält, aber keine Anfrage von außen in die Sekunden des Neustarts fiel, deshalb steht der Beleg für den Retry noch aus; seit dem Merge bekam in beiden Fenstern keine fremde Adresse ein 502 am Neustart von `cp` (vorher 7 in 6 Fenstern).
