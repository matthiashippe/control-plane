# Freigegebene Ports einer Sandbox

Ein Automaton gibt mit `expose_port` einen Port seiner Sandbox frei und bekommt eine Adresse
`https://sbx-<id>-<port>.<domain>` unter einer eigenen Domain, die nicht die der Zahlung ist (Goal sandbox 07).

## Vorher

Wie viele fremde Adressen haben seit dem Rollout von sandbox 03 einen Port freigeben wollen und 409
`port_exposure_unavailable` bekommen? Gemessen am 2026-11-13 um 19:26 UTC vom code-host, nur lesend über das
Caddy-Zugriffslog des Zahlungsservers samt rotierter Dateien:

```
set -a; . ~/.config/control-plane/loop.env; set +a
bash ops/ports-demand.sh --since '2026-11-12 18:12:46'
PORTS DEMAND: 0 foreign addresses, 0 calls, since 2026-11-12 18:12:46 UTC
```

- fremde Adressen mit 409 auf ports/expose seit 2026-11-12 18:12:46 UTC: 0 (Aufrufe: 0)

Der Zeitpunkt ist der Start des Deploy-Laufs zum Merge von sandbox 03 (PR #36, Commit `96440e4`), aus
`gh run list -R matthiashippe/control-plane --workflow deploy.yml --json headSha,startedAt`. Das Werkzeug ist in beide
Richtungen bewiesen: `bash ops/ports-demand.sh --selftest` endet mit `PORTS DEMAND SELFTEST OK`, mit `status == 410` statt
`409` im Zähler endet er mit `PORTS DEMAND SELFTEST FAILED (7)`, und eine Kopie desselben Logs (137065 Zeilen) mit einer
gepflanzten Zeile einer Dokumentationsadresse ergibt mit `--log` `PORTS DEMAND: 1 foreign addresses, 1 calls`. Im
Zeitraum steht genau ein Aufruf mit 409 auf einem Port-Pfad im Log, von einer eigenen Adresse.

Die 0 hält das Goal nicht auf: Ein Automaton aus sandbox 08 kann ohne freigegebenen Port nichts verkaufen (Fast track in
`ROADMAP.md`, Matthias 13.11.2026).

## Domain

Vorschlag für die Adressen freigegebener Ports, bei Cloudflare Registrar im Konto der Zone `postyourprice.com`:

Vorschlag: sandboxhost.dev
Preis: 12.20 USD im Jahr
Frei: RDAP der Registry von .dev antwortet 404 (nicht registriert), 2026-11-13 19:27 UTC

- Die Adressen lauten dann `https://sbx-<id>-<port>.sandboxhost.dev`: Wer sie liest, sieht eine Sandbox und nicht die Zahlung.
- `.dev` steht auf der HSTS-Preload-Liste, jeder Aufruf geht nur über HTTPS.
- Preis laut Preisliste von Cloudflare Registrar (Selbstkostenpreis, Verlängerung 12.20 USD, erstes Jahr dort 8.20 USD), gelesen am
  2026-11-13 auf `https://cfdomainpricing.com/`; maßgeblich ist der Preis, den der Registrar beim Kauf zeigt.
- Ausweichnamen, beide am 2026-11-13 um 19:27 UTC frei (RDAP 404), gleicher Preis: `runsandbox.dev`, `sbxhost.dev`.
- Abfrage, nur lesend:
  `curl -s -o /dev/null -w '%{http_code}' https://pubapi.registry.google/rdap/domain/sandboxhost.dev` (404 heißt frei;
  `agentsandbox.dev` als Gegenprobe gibt 200, vergeben).

Gekauft: sandboxhost.de, 2026-11-15

Entscheidung Matthias, 15.11.2026: Gekauft wird `sandboxhost.de` bei INWX (etwa 6 € im Jahr), weil Cloudflare Registrar keine
`.de` verkauft. Die Zone liegt im Cloudflare-Konto von HTC (Nameserver `dolly.ns.cloudflare.com` und `kobe.ns.cloudflare.com`),
der Token `sbx-ports` gilt nur für sie. Die Adressen lauten `https://sbx-<id>-<port>.sandboxhost.de`.

- `sandboxhost.de` war am 2026-11-15 um 16:49 UTC noch frei: `curl -s -o /dev/null -w '%{http_code}' https://rdap.denic.de/domain/sandboxhost.de`
  gibt 404, `denic.de` als Gegenprobe 200. Status der Zone zur selben Zeit `pending` (Nameserver noch nicht bei INWX gesetzt).
- `.de` steht nicht auf der HSTS-Preload-Liste. Den Ersatz trägt die Zone: „Always Use HTTPS“ an, gesetzt von
  `cloudflare.py ports-apply` und geprüft von `ports-check`, damit jeder Aufruf über `http://` auf HTTPS umgeleitet wird.
- Nach dem Kauf (Zone `active`, Token `sbx-ports` eingetragen) am 2026-11-15 vor 17:03 UTC: `python3 ops/sandbox/cloudflare.py
  ports-check 72.62.51.224` meldete vorher drei Abweichungen (`create A *.sandboxhost.de`, `ssl want=strict have=full`,
  `https want=on have=off`), `ports-apply` legte sie an, danach `PORTS DNS OK`, erneut um 17:10 UTC.
- Um 17:10 UTC: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://sbx-zz9-8080.sandboxhost.de/` gibt
  `301 https://sbx-zz9-8080.sandboxhost.de/`, derselbe Name über HTTPS `404` (kein solcher Port, Antwort von Caddy über Cloudflare).

## Zone der Zahlung

In der Zone `postyourprice.com` löscht das Goal genau den Eintrag `*.postyourprice.com`; alle anderen Einträge und der SSL-Modus
bleiben. Fingerabdruck vor dem Löschen, gemessen am 2026-11-13 um 19:32 UTC mit
`python3 ops/sandbox/cloudflare.py zone-digest postyourprice.com` (sha256 über die sortierten Einträge außer `*.postyourprice.com`
und den SSL-Modus, erste 12 Zeichen; zweimal gemessen, gleich):

Zone vorher: 29c9eb2596f4

Die Zone hatte zu diesem Zeitpunkt vier Einträge: die Wurzel, `www`, `ctl.sbx` und den Wildcard. Im Caddy-Zugriffslog des
Zahlungsservers (137065 Zeilen bis 2026-11-13 19:26 UTC) kommt kein anderer Name der Zone vor als die Wurzel, also hing kein Dienst
am Wildcard.

Am 2026-11-14 um 16:07 UTC legte ein Lauf vom Stand `dev` den Eintrag wieder an (sandbox 02 misst ihn dort,
`goals/sandbox/ANNAHMEN.md`, Audit 2026-11-14 Zeile 465). Nach dem Kauf löschte ihn dieses Goal am 2026-11-15 um 17:04 UTC erneut mit
`python3 ops/sandbox/cloudflare.py dns-apply 72.62.51.224` (`deleted A *.postyourprice.com`, `CF DNS OK changed=0`). Fingerabdruck
davor und danach `29c9eb2596f4`, also gleich `Zone vorher`.
