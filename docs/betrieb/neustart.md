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
deshalb im Fenster des nächsten Rollouts, der `cp` neu startet, über die Zeile `BAD GATEWAY` im Schritt „Deploy-Fenster“ von
`deploy.yml`.
