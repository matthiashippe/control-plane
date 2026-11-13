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

## Zone der Zahlung

In der Zone `postyourprice.com` löscht das Goal genau den Eintrag `*.postyourprice.com`; alle anderen Einträge und der SSL-Modus
bleiben. Fingerabdruck vor dem Löschen, gemessen am 2026-11-13 um 19:32 UTC mit
`python3 ops/sandbox/cloudflare.py zone-digest postyourprice.com` (sha256 über die sortierten Einträge außer `*.postyourprice.com`
und den SSL-Modus, erste 12 Zeichen; zweimal gemessen, gleich):

Zone vorher: 29c9eb2596f4

Die Zone hatte zu diesem Zeitpunkt vier Einträge: die Wurzel, `www`, `ctl.sbx` und den Wildcard. Im Caddy-Zugriffslog des
Zahlungsservers (137065 Zeilen bis 2026-11-13 19:26 UTC) kommt kein anderer Name der Zone vor als die Wurzel, also hing kein Dienst
am Wildcard.
