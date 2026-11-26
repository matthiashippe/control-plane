# Warum der erste Sandbox-Kunde nach einem Tag aufhört (November 2026)

Ziel: Wir wissen gemessen, warum der einzige Kunde, der Sandbox und Inferenz bezahlt hat, nach einem Tag aufhörte, und beheben
eine Ursache bei uns als Nächstes, statt weiter für Kunden zu bauen, die noch nicht da sind. Goal:
`goals/kunden/16-warum-der-erste-sandbox-kunde-nach-10-usd-aufhoert.md`.

Gemessen: 2026-11-26T19:31:37Z
Gelesen wurde nur: das Ledger über `ops/db-report.cjs` mit `CP_REPORT=sandbox-customer` (`readonly: true`, im Container `cp`) und
das Caddy-Zugriffslog über `ops/access-log.sh`. Adressen, Wallet, Sandbox-ID und Beträge je Kunde stehen nicht in der Ausgabe und
nicht in diesem Dokument (`loop-constraints.md`, Grundregel 8).

## Befehl und Ausgabe

$ bash ops/sandbox-customer.sh --since 2026-11-21T00:00:00Z

```
SANDBOX CUSTOMERS since 2026-11-21T00:00:00Z until 2026-11-26T19:31:37Z: 1 foreign customers with a sandbox
CUSTOMER 1: first sandbox 2026-11-21T02:27:10Z, sandboxes 1, ips 1, balance covers hold
SANDBOX 1.1: tier medium, created 2026-11-21T02:27:10Z, status stopped, stop credit, steps 50, last step 2026-11-21T07:21:36Z
LEDGER 1: grant 1, inference 304, sandbox 50, topup 2, last inference 2026-11-21T16:25:30Z
AFTER 1 halt 2026-11-21T07:21:36Z: 662 requests
PATH 1 halt GET /v1/credits/balance 200 x451
PATH 1 halt POST /v1/chat/completions 402 x86
PATH 1 halt GET /pay/5/{address} 402 x1
PATH 1 halt GET /pay/5/{address} 200 x1
PATH 1 halt POST /v1/chat/completions 200 x117
PATH 1 halt GET /v1/domains/search 501 x2
PATH 1 halt POST /v1/chat/completions 404 x1
PATH 1 halt POST /v1/chat/completions 0 x3
AFTER 1 last-inference 2026-11-21T16:25:30Z: 32 requests
PATH 1 last-inference GET /v1/credits/balance 200 x16
PATH 1 last-inference POST /v1/chat/completions 402 x16
LAST 1: 2026-11-23T03:39:36Z POST /v1/chat/completions 402
QUIET 1: 87 hours without a request before 2026-11-26T19:31:37Z
WEEK: 2 foreign payments in the 7 days before 2026-11-26T19:31:37Z
```

Leitzahl: 2 fremde Zahlungen in den 7 Tagen bis 2026-11-26

## Was die Runtime am Pin tut

Runtime: harness/runtime/src/agent/tools.ts:361 (Quelle der Runtime am Pin d8f8168, die `harness/runtime/Dockerfile` klont) legt
eine Sandbox nur an, wenn das Modell das Werkzeug `create_sandbox` aufruft; eine gehaltene Sandbox ruft die Runtime nie von selbst
wieder auf und legt auch keine neue an, ihre eigene Sandbox-ID ist je Prozess fest (harness/runtime/src/conway/client.ts:42).

Runtime: harness/runtime/src/conway/topup.ts:179 entscheidet über die Aufladung: Die kleinste Stufe ist 5 USD, und liegt das
USDC-Guthaben der Wallet darunter, kauft die Runtime nichts (`Bootstrap topup skipped`); dieselbe Grenze gilt im Takt der Schleife
(harness/runtime/src/agent/loop.ts:444, `financial.usdcBalance >= 5`). Eine 402 auf Inferenz löst keine Aufladung aus und wird nicht
wiederholt (`retryableStatuses` ohne 402, harness/runtime/src/types.ts:616). Der Prozess beendet sich nur auf SIGTERM oder SIGINT
(harness/runtime/src/index.ts:391); solange er läuft, fragt der Heartbeat jede Minute `GET /v1/credits/balance`.

## Befund

- Halt der Sandbox: Sie lief ab 02:27 UTC 50 Schritte aus Credits und hielt um 07:21:36 für Credits (`stop credit`). Danach rief
  der Kunde nie wieder einen Pfad unter `/v1/sandboxes/` auf: Keine Zeile `PATH 1 halt` nennt ihn. Das passt zur Fundstelle oben,
  die Runtime kommt auf eine gehaltene Sandbox nicht von selbst zurück.
- Nach dem Halt arbeitete er weiter: 662 Anfragen, darunter 117 beantwortete Inferenzen und um 14:50 eine zweite Aufladung über
  `/pay/5/{address}` (erst 402, dann 200).
- Die letzte Ledger-Zeile ist die Inferenz um 16:25:30 (`last inference`); danach bekam jede seiner 16 Inferenzen eine 402. Laut
  Zugriffslog kamen sie in Salven am 21.11. um 20:51 und 20:57, dazwischen und bis 20:59:40 die Abfrage des Guthabens im Minutentakt
  des Heartbeats, danach nichts mehr bis zu einer einzelnen 402 am 23.11. um 03:39:36 (`LAST 1`). Seitdem 87 Stunden Ruhe.
- Warum 402, obwohl die Zeile `CUSTOMER 1` `covers hold` sagt: `covers hold` ist der Hold der Sandbox (`HOLD_MC`, 1000 mc). Eine
  Inferenz reserviert dagegen den Preis von geschätztem Prompt und `max_tokens` (`src/inference/proxy.ts`, `reserveMc`). Die Runtime
  fragt mit 4096 Tokens (`maxTokensPerTurn`, harness/runtime/src/types.ts:83), und die Prompts seiner letzten 30 Inferenzen hatten
  26652 bis 33638 Tokens. Gelesen mit `readonly: true` im Container: Sein verfügbares Guthaben liegt unter der Reservierung für den
  kleinsten dieser Prompts mit 4096 Tokens (`avail < reservation(prompt min, 4096): true`) und über der für den Prompt allein, also
  deckte es keine Anfrage mehr, wie die Runtime sie stellt. Seit 16:25:30 gibt es keine Ledger-Zeile mehr, das Guthaben war also bei
  jeder dieser 402 dasselbe.
- Seine Wallet hält nach öffentlichen Daten auf Base (`balanceOf` des USDC-Vertrags über `https://mainnet.base.org`, Gegenprobe
  `totalSupply` desselben Vertrags) unter 5 USD, also unter der kleinsten Stufe der Aufladung.
- Die drei Abbrüche auf `/v1/chat/completions` (Status 0, `PATH 1 halt … 0 x3`) stehen in `inference_aborts` mit `answered = 0`;
  berechnet wurde keiner. Die 404 auf `/v1/chat/completions` und die zwei 501 auf `/v1/domains/search` nach dem Halt hielten ihn
  nicht an, nach ihnen kamen weitere beantwortete Inferenzen; als Fehler eines echten Nutzers stehen sie in
  `goals/_vorschlaege/fehler-2026-11-26-1.md` mit Schwere 5.

## Ursache

- Kunde 1: Sandbox medium, 50 Schritte, Halt credit, letzte Anfrage 2026-11-23, Ursache: kein Geld, weil nach der letzten Inferenz um 16:25:30 alle 16 Inferenzen eine 402 bekamen (`PATH 1 last-inference POST /v1/chat/completions 402 x16`), sein Guthaben die Reservierung einer Anfrage mit 4096 Tokens nicht mehr deckte, danach keine Aufladung kam und seine Wallet unter den 5 USD der kleinsten Stufe liegt.

Ergebnis: kein Fehler bei uns, weil der Kunde aufhörte, als sein Guthaben die nächste Inferenz nicht mehr deckte und seine Wallet für die kleinste Aufladung nicht reichte; die 402 rechnete mit der Reservierung, die jeder Kunde bekommt, und nach der letzten 402 hörte sein Betreiber auf (der Prozess fragte ab 20:59:40 nicht mehr im Minutentakt).

Widerlegt: nein, weil 662 Anfragen nach dem Halt kamen

Für das nächste Glied: Er hat für eine Sandbox und rund 300 Inferenzen zweimal 5 USD gezahlt und dann aufgehört, als die Wallet
leer war. Ob er bei einem anderen Preis der Sandbox wiederkäme, sagt diese Messung nicht; sie sagt nur, dass ihm das Geld ausging,
nicht dass ihn eine Antwort des Servers stoppte. Offen bleibt, dass ein Rest unter einer Reservierung, aber über den tatsächlichen
Kosten der meisten seiner Anfragen, ungenutzt liegen bleibt.
