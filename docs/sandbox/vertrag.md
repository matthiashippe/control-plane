# Sandbox-Vertrag: was die Runtime am Pin `d8f8168` für Sandboxes und Domains aufruft

Quelle ist die unveränderte Runtime `Conway-Research/automaton` am Pin `d8f8168`, gelesen am 10.11.2026 in einem Klon aus
`mktemp -d`. Jeder Aufruf geht durch eine Funktion, `request()` in `src/conway/client.ts:45`; alle Fundstellen unten liegen in
dieser Datei. Was sandbox 03 und domains 01 bauen, misst sich an dieser Tabelle und an der unveränderten Runtime im Harness.

## Endpunkte

`{id}` ist die Sandbox-ID aus `sandboxId` in `~/.automaton/automaton.json` (eigene Sandbox) oder aus der Antwort von
`POST /v1/sandboxes` (Kind-Sandbox über `createScopedClient`). Felder der Antwort mit „oder“ liest die Runtime in dieser Reihenfolge.

| Methode | Pfad | Anfrage | Antwort, die die Runtime liest | Fundstelle | Bei Fehler |
|---|---|---|---|---|---|
| POST | `/v1/sandboxes` | JSON `name`, `vcpu` (Standard 1), `memory_mb` (512), `disk_gb` (5), `region` (meist leer); die Kind-Stufen sind 512/1/5, 1024/1/10, 2048/2/20, 4096/2/40, 8192/4/80 (`src/replication/spawn.ts:21`) | `id` oder `sandbox_id` (Pflicht), `status` (Standard `running`), `region`, `vcpu`, `memory_mb`, `disk_gb`, `terminal_url`, `created_at` | `src/conway/client.ts:255` | 402 mit `details.required_cents` und `details.current_balance_cents` (oder `INSUFFICIENT_CREDITS` im Text): Topup per x402 aus der eigenen Wallet, danach ein zweiter Versuch (`src/conway/topup.ts:81`); jeder andere Fehler: lokaler Worker statt Sandbox (`src/agent/loop.ts:304`) |
| GET | `/v1/sandboxes` | keine | Array oder `sandboxes[]`, je Eintrag `id` oder `sandbox_id`, `status`, `region`, `vcpu`, `memory_mb`, `disk_gb`, `terminal_url`, `created_at` | `src/conway/client.ts:280` | Fehler geht an das Werkzeug `list_sandboxes` und an die Suche nach wiederverwendbaren Sandboxes beim Spawn |
| POST | `/v1/sandboxes/{id}/exec` | JSON `command` (immer mit `cd /root && ` davor), `timeout` in ms (etwa 120000 für `apt-get`); Header `Idempotency-Key` (ULID, gleich bei jeder Wiederholung) | `stdout`, `stderr`, `exit_code` oder `exitCode` (sonst -1) | `src/conway/client.ts:142` | 403: Abbruch, kein lokaler Ersatz; andere: Fehler an den Aufrufer. Der HTTP-Timeout bleibt 30 s, auch wenn `timeout` größer ist |
| POST | `/v1/sandboxes/{id}/files/upload/json` | JSON `path`, `content` (Text) | nur Status 2xx, Inhalt egal | `src/conway/client.ts:185` | 403: Abbruch, kein lokaler Ersatz; andere: Fehler an den Aufrufer |
| GET | `/v1/sandboxes/{id}/files/read?path=<urlencoded>` | Query `path` | Text der Datei, oder bei JSON das Feld `content` | `src/conway/client.ts:208` | kein Wiederholen bei 404 (`retries404: 0`); 403: Abbruch, kein lokaler Ersatz |
| POST | `/v1/sandboxes/{id}/ports/expose` | JSON `port` | `port`, `public_url` oder `publicUrl` oder `url` | `src/conway/client.ts:235` | Fehler an das Werkzeug `expose_port` und an die Agent-Card der Registry |
| DELETE | `/v1/sandboxes/{id}/ports/{port}` | keine | nur Status 2xx | `src/conway/client.ts:247` | Fehler an das Werkzeug `remove_port` |
| GET | `/v1/domains/search?query=<q>&tlds=<liste>` | Query `query`, optional `tlds` (etwa `com,io,ai`) | `results[]` oder `domains[]`, je Eintrag `domain`, `available` oder `purchasable`, `registration_price` oder `purchase_price` (Cent, angezeigt als Dollar), `renewal_price`, `currency` (Standard `USD`) | `src/conway/client.ts:465` | Fehler an das Werkzeug `search_domains`; 404 wird dreimal wiederholt |
| POST | `/v1/domains/register` | JSON `domain`, `years` (Standard 1) | `domain`, `status` (Standard `registered`), `expires_at` oder `expiry`, `transaction_id` oder `id` | `src/conway/client.ts:480` | Fehler an das Werkzeug `register_domain`; ein 402 löst hier kein Topup aus |
| GET | `/v1/domains/{domain}/dns` | keine | `records[]` oder Array, je Eintrag `id` oder `record_id`, `type`, `host` oder `name`, `value` oder `answer`, `ttl`, `distance` oder `priority` | `src/conway/client.ts:495` | Fehler an das Werkzeug `manage_dns` |
| POST | `/v1/domains/{domain}/dns` | JSON `type`, `host`, `value`, `ttl` (Standard 3600) | `id` oder `record_id`, `type`, `host`, `value`, `ttl` | `src/conway/client.ts:517` | Fehler an das Werkzeug `manage_dns` |
| DELETE | `/v1/domains/{domain}/dns/{record}` | keine | nur Status 2xx | `src/conway/client.ts:535` | Fehler an das Werkzeug `manage_dns` |

Nicht aufgerufen: `DELETE /v1/sandboxes/{id}`. `deleteSandbox` ist am Pin leer, weil Conway das Löschen abgeschaltet hat
(`src/conway/client.ts:274`). Eine Sandbox endet also nie durch die Runtime; Ende und Aufräumen regelt der Plan.

## Für alle Aufrufe gleich

- Header `Authorization: <API-Key>` ohne `Bearer`, dazu `Content-Type: application/json` (`src/conway/client.ts:59`).
- Antwort als JSON nur bei `content-type` mit `application/json`, sonst als Text (`src/conway/client.ts:83`).
- 404 wiederholt `request()` dreimal nach 1, 2 und 3 s, weil Conways Load Balancer valide Pfade mit 404 beantwortete
  (`src/conway/client.ts:51`). Ein echter 404 kommt deshalb viermal im Log an.
- 429, 500, 502, 503 und 504 wiederholt der HTTP-Client dreimal mit Backoff ab 1 s; fünf Fehler in Folge öffnen den
  Circuit Breaker für 60 s, danach scheitert jeder Aufruf sofort, auch Credits und Inferenz (`src/types.ts:613`).
- Timeout 30 s je Versuch, auch bei `exec` mit größerem `timeout`; ein abgebrochener Versuch wird mit demselben
  `Idempotency-Key` wiederholt (`src/conway/http-client.ts:75`). Ein `exec` über 30 s muss deshalb an der Wiederholung mit
  demselben Schlüssel das Ergebnis des schon laufenden Befehls liefern, ohne ihn ein zweites Mal zu starten oder zu berechnen.
- Ohne `sandboxId` führt die Runtime `exec`, Dateien und Ports lokal aus und ruft keinen dieser Pfade (`src/conway/client.ts:109`).

## Aufrufe in der Produktion

Gemessen am 10.11.2026 im Caddy-Zugriffslog des Zahlungsservers, Zeitraum des Logs 2026-10-01T14:59Z bis 2026-11-10T20:52Z
(74952 Zeilen, die ältere Rotation ist gelöscht). Alle Treffer kamen von fremden Adressen (nicht in `ops/own-ips.txt`), von zwei
verschiedenen Adressen, an zwei Tagen: 18 am 2026-10-08, 23 am 2026-11-10.

| Methode | Pfad | Status | Zahl |
|---|---|---|---|
| GET | `/v1/domains/search` | 404 | 20 |
| GET | `/v1/sandboxes` | 200 | 1 |
| GET | `/v1/sandboxes/{id}/files/read` | 501 | 1 |
| POST | `/v1/sandboxes` | 401 | 1 |
| POST | `/v1/sandboxes` | 501 | 2 |
| POST | `/v1/sandboxes/{id}/exec` | 501 | 13 |
| POST | `/v1/sandboxes/{id}/files/upload/json` | 501 | 3 |

Die 20 Treffer auf `/v1/domains/search` sind fünf Suchen, weil die Runtime jeden 404 dreimal wiederholt. Die 501 auf `exec` und
Dateien kamen von einer Runtime, die eine `sandboxId` gesetzt hat und deshalb nicht lokal ausführt.

Befehl (auf dem code-host, die Adressen verlassen die Pipeline nicht):

```sh
set -a; . ~/.config/control-plane/loop.env; set +a
ssh -i "$CP_SSH_KEY" "$CP_HOST" \
  'docker exec deploy-caddy-1 sh -c "zcat /var/log/caddy/access-*.log.gz; cat /var/log/caddy/access.log"' > "$S/access.jsonl"
jq -r --rawfile own ops/own-ips.txt '
  ($own | split("\n") | map(select(test("^[0-9a-f.:]+ ")) | split(" ")[0])) as $ips
  | select((.request.uri // "") | test("^/v1/(sandboxes|domains)"))
  | [ .request.method,
      (.request.uri | sub("\\?.*"; "")
         | sub("^/v1/sandboxes/[^/]+"; "/v1/sandboxes/{id}")
         | sub("/ports/[0-9]+$"; "/ports/{port}")
         | sub("^/v1/domains/(?<d>[^/]+)/dns"; "/v1/domains/{domain}/dns")
         | sub("/dns/[^/]+$"; "/dns/{record}")),
      (.status | tostring),
      (if ((.request.client_ip // .request.remote_ip) as $c | $ips | index($c)) then "eigen" else "fremd" end) ]
  | @tsv' "$S/access.jsonl" | sort | uniq -c
```

Gegenprobe am selben Tag: zwei gepflanzte Zeilen an das Log gehängt, `DELETE /v1/domains/x.dev/dns/r1` mit 404 von einer
Dokumentationsadresse und `POST /v1/sandboxes/abc/ports/expose` mit 501 von der ersten Adresse aus `ops/own-ips.txt`. Die Pipeline
zählte beide: `DELETE /v1/domains/{domain}/dns/{record} 404 fremd` und `POST /v1/sandboxes/{id}/ports/expose 501 eigen`, je 1. Sie
sieht also Pfade, die im echten Log fehlen, und trennt eigene von fremden Adressen.
