# Schlüsselwechsel in der Produktion gemessen (domains 04, 14.11.2026)

Gemessen wurde, ob die Live-Prüfung nach einem neuen Client-Schlüssel lange genug wartet, damit `POST /v1/sandboxes` nicht in die
`RECHECK_MS` fällt, in denen der Dienst nach einem gescheiterten Aufruf an `sandboxd` sofort 501 antwortet. Weil ein Wechsel von
selbst praktisch nie kommt, hat das Goal ihn für die eigene Adresse ausgelöst (`goals/domains/ANNAHMEN.md`, domains 04).

Messung: reset=2026-11-14T01:35:20Z last_401=2026-11-14T01:35:58Z wait=2026-11-14T01:36:49Z create=2026-11-14T01:38:05Z changed=1 sandbox=OK live=OK run_s=124

Abstände: Die Anlage kam 127 s nach der letzten Zeile `key not accepted` (`RECHECK_MS` sind 60 s) und 76 s nach der Zeile `WAIT`
(`CLIENT_KEY_WAIT_S` sind 75 s). Zwischen Reset und Warten scheiterte genau ein Aufruf, der Abrechnungstakt `GET /v1/sandboxes`
um 01:35:58. Der neue Schlüssel lag um 01:36:48 wieder auf dem Sandbox-Server (`stat` von `cp.pub`), der nächste Takt ging durch.
Fremde Sandboxes liefen vor dem Lauf keine (`active=0 foreign=0`).

## Ablauf

Auf dem code-host im Worktree des Goals, nach grünem `bash ops/live.sh --selftest` und `bash ops/sandbox/setup.sh --selftest`,
in einem Zug:

```
date -u +%FT%TZ
bash ops/sandbox/setup.sh --client-key-reset 72.62.51.224      # SETUP CLIENT-KEY-RESET OK moved=1
date -u +%FT%TZ                                                # reset (Ende des Befehls)
node -e 'setTimeout(() => {}, 70000)'                          # mindestens 65 s, damit der Takt einmal scheitert
start=$(date +%s)
bash ops/live.sh 2>&1 | while IFS= read -r l; do printf '%s %s\n' "$(date -u +%FT%TZ)" "$l"; done
echo "run_s=$(( $(date +%s) - start ))"
```

Ausgabe der Live-Prüfung mit Zeitstempel je Zeile:

```
2026-11-14T01:36:31Z OK health: /health 200
2026-11-14T01:36:32Z OK status: /v1/status 200
2026-11-14T01:36:33Z OK domains: /v1/domains/search 401 without a key, the route is there
2026-11-14T01:36:34Z OK domains-search: /v1/domains/search with a key 501 not_implemented, livecheck.com named, nothing called taken
2026-11-14T01:36:36Z OK refund: credited once, 79229 mc
2026-11-14T01:36:38Z OK timeout-quote: since 2026-11-10T20:27:18.047Z: openai/gpt-5-mini 0/877 (0.0 %), openai/gpt-5.2 0/168 (0.0 %)
2026-11-14T01:36:44Z OK handoff: POST /v1/handoff 201, /h/{code} shows match among three numbers, the stream says pending; nothing approved
2026-11-14T01:36:49Z WAIT sandbox: new client key, 75 s before the create
2026-11-14T01:38:34Z OK sandbox: client key set, ctl.sbx 200, created, exec ok, background exec ok, files ok, deleted, ledger rows: 1
2026-11-14T01:38:35Z OK sandbox-foreign: 0 foreign accounts with a sandbox row
2026-11-14T01:38:35Z LIVE OK
```

`changed=1` zeigt die Zeile `WAIT`: `sandbox_live` gibt sie nur nach `SETUP CLIENT-KEY OK changed=1` aus.

## Woher jeder Wert stammt

- `reset`: `date -u` direkt nach `--client-key-reset` (oben).
- `wait`: Zeitstempel der Zeile `WAIT sandbox:` in der Ausgabe oben.
- `run_s`: Sekunden von `bash ops/live.sh` (oben).
- `last_401`: letzte Zeile mit `key not accepted` im Log des Dienstes vor `create`, auf Sekunden abgeschnitten (01:35:58.140):

  ```
  set -a; . ~/.config/control-plane/loop.env; set +a
  ssh -i "$CP_SSH_KEY" -o BatchMode=yes "$CP_HOST" \
    'docker logs --timestamps --since 2026-11-14T01:35:00Z --until 2026-11-14T01:39:00Z deploy-cp-1 2>&1 | grep -E "\[sandbox\]"'
  ```

  Ausgabe: genau eine Zeile `2026-11-14T01:35:58.140990209Z [sandbox] GET /v1/sandboxes: key not accepted (401)`.
- `create`: Feld `ts` der Zeile `POST /v1/sandboxes` von der eigenen Adresse im Zugriffslog von `deploy-caddy-1`, auf Sekunden
  abgeschnitten (01:38:05.850, Status 201, `duration` 0,89 s, also Beginn 01:38:04.96):

  ```
  bash ops/access-log.sh > access.jsonl
  node -e 'const me = process.argv[2].trim();
    for (const l of require("fs").readFileSync(process.argv[1], "utf8").split("\n")) {
      if (!l.startsWith("{")) continue; const j = JSON.parse(l), r = j.request || {};
      if (r.uri === "/v1/sandboxes" && r.method === "POST" && j.ts > Date.parse("2026-11-14T01:35:00Z") / 1000)
        console.log(new Date(j.ts * 1000).toISOString(), j.status, j.duration, (r.client_ip || r.remote_ip) === me ? "own" : "other"); }' \
    access.jsonl "$(curl -s --max-time 5 https://api.ipify.org)"
  ```

  Ausgabe: genau eine Zeile `2026-11-14T01:38:05.850Z 201 0.889392311 own`.
- Fremde Sandboxes vor dem Lauf: Zahl der Zeilen in `sandboxes` mit Status `creating`, `running` oder `stopped`, und davon die
  Konten außerhalb von `src/bounties/ours.ts` (Adressen und `OUR_KEY_NAMES`), mit `readonly: true` in `deploy-cp-1`. Ausgabe
  `active=0 foreign=0`.

Gegenproben der Messwerkzeuge: Der Filter auf `key not accepted` fand im ersten Lauf (unten) die Zeile um 01:28:58 und über die
zwei Stunden davor `0`. Der Filter auf das Zugriffslog fand die beiden 501 um 01:17:54 und 01:31:04 (erster Lauf) und
im zweiten Lauf die 201; die Adresse beider 501 ist die des code-host (`api.ipify.org`). Die Abfrage auf fremde Sandboxes gab auf
einer Kopie mit gepflanzten Zeilen (eine eigene laufende, eine fremde laufende, eine fremde gelöschte) `active=2 foreign=1`.

## Der erste Lauf war rot, aus einem anderen Grund

Ein erster Lauf um 01:28 (Reset 01:28:26, `WAIT` 01:29:48, Anlage 01:31:04, `run_s=89`) endete mit `FAIL sandbox: POST
/v1/sandboxes answered 501`. Gewartet hatte er richtig: Der Aufruf kam 126 s nach dem 401 von 01:28:58 bei `sandboxd` an. Dort
scheiterte `docker run` mit `Unable to find image 'sandboxd-base:1' locally` (`journalctl -u sandboxd` auf dem Sandbox-Server),
der Dienst schrieb `[sandbox] POST /v1/sandboxes: status 500` und antwortete 501. Das Basis-Image fehlte seit 00:26 UTC: Der Cron
`/etc/cron.d/docker-image-prune` des Mitbewohners auf dem Host läuft täglich `docker image prune -af --filter "until=24h"` und
löscht jedes Image ohne Container, das älter als 24 Stunden ist (`journalctl` zeigt den Lauf um 00:26:01, die letzte Sandbox
endete um 00:17:39, das erste `Unable to find image` kam um 01:17:53). `bash ops/sandbox/setup.sh --check 72.62.51.224` meldete
nur `CHANGE fact image`, `bash ops/sandbox/setup.sh 72.62.51.224` baute das Image um 01:35:02 neu und meldete danach
`SETUP CHECK OK changed=0`. Erst danach lief die Messung oben. Der Befund steht als Vorschlag in
`goals/_vorschlaege/sandbox-nacharbeit-2026-11-14-1.md`.

## Danach

`bash ops/sandbox/setup.sh --client-key 72.62.51.224 | tail -n 1` gibt `SETUP CLIENT-KEY OK changed=0`, also liegt wieder genau
der Schlüssel des Dienstes als `cp.pub` auf dem Sandbox-Server. `cp.pub.prev` mit demselben öffentlichen Schlüssel bleibt liegen;
`sandboxd` liest ihn nicht, weil er nicht auf `.pub` endet.
