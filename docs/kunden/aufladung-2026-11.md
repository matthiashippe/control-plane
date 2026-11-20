# Warum Kunde 1 nach unserer 402 nicht auflädt (November 2026)

Ziel: Wir wissen gemessen, ob Kunde 1 nicht auflädt, weil ihm USDC fehlt oder weil unsere Antwort ihn nicht zur Aufladung führt,
und ob ein leeres Guthaben beim Anbieter heute einen zahlenden Kunden noch unbemerkt trifft. Goal:
`goals/kunden/05-warum-kunde-1-nach-unserer-402-nicht-auflaedt.md`. Kunde 1 ist derselbe wie in `docs/kunden/rueckgang-2026-11.md`
(erste Inferenz-Zeile im Fenster ab 05.11. am 2026-11-10T05:12:06Z, eine Adresse).

Gemessen: 2026-11-20T06:02:00Z

## Ergebnis

Unsere 402: src/inference/proxy.ts:343, Zweig Aufladung offen, Felder error INSUFFICIENT_CREDITS, message, docs, details.required_cents, details.current_balance_cents, details.model, details.topup_url, details.topup_tiers_usd, details.wallet, details.open_bounties und details.bounties_url (nur bei offenen Aufträgen)
USDC von Kunde 1: unter der kleinsten Stufe
Aufrufe von /pay/ durch Kunde 1 seit 13.11.: 0
Ursache: kein Geld, weil seine Wallet auf Base weniger USDC hält als die kleinste Stufe der Runtime von 5 USD (heute und schon am 13.11. um 06:00 UTC, eine Stunde nach seiner ersten 402), und die Runtime am Pin an allen drei Stellen, an denen sie auflädt, genau das verlangt; unsere 402 liest sie für die Inferenz gar nicht, sie lädt nach ihrem Saldo bei uns und ihrem USDC-Bestand auf, und beides sagt ihr richtig: Saldo leer, USDC zu wenig.

## Was die Runtime am Pin mit der 402 und dem Saldo tut

- Runtime: src/conway/client.ts:297 am Pin d8f8168, fragt den Saldo bei uns über `GET /v1/credits/balance` ab; das ist die Abfrage, die Kunde 1 seit 13.11. 26837 Mal stellte und jedes Mal mit 200 beantwortet bekam.
- Runtime: src/conway/topup.ts:24 am Pin d8f8168, die Stufen der Runtime sind 5, 25, 100, 500, 1000 und 2500 USD; unsere kleinste Stufe von 1 USD kennt sie nicht.
- Runtime: src/index.ts:350 am Pin d8f8168, beim Start ruft sie `bootstrapTopup` auf, das bei weniger als 5 USD Saldo die kleinste Stufe kaufen will.
- Runtime: src/conway/topup.ts:180 am Pin d8f8168, `bootstrapTopup` bricht ohne Aufruf von `/pay/` ab, wenn der USDC-Bestand unter der kleinsten Stufe von 5 USD liegt.
- Runtime: src/agent/loop.ts:444 am Pin d8f8168, mitten im Lauf lädt sie bei kritischem Saldo nur auf, wenn `financial.usdcBalance >= 5`.
- Runtime: src/heartbeat/tasks.ts:160 am Pin d8f8168, im Heartbeat lädt sie bei kritischem oder totem Saldo nur auf, wenn `balance >= MIN_TOPUP_USD` (5).
- Runtime: src/conway/topup.ts:97 am Pin d8f8168, nur `topupForSandbox` liest eine 402 mit `INSUFFICIENT_CREDITS` und `details.required_cents`, und es wird nur beim Anlegen einer Sandbox aufgerufen (`src/agent/loop.ts:259`), nie nach einer 402 der Inferenz.

Die 402 auf `POST /v1/chat/completions` wirft in der Runtime nur einen Fehler mit Status und Text (`src/conway/inference.ts:226`);
einen Weg von dieser 402 zu `/pay/` hat der Code am Pin nicht. Mit USDC ab 5 USD hätte jede der drei Stellen oben
aufgeladen, und vor dem 13.11. hat Kunde 1 so über `/pay/` aufgeladen (Zugriffslog, dieselbe Adresse, Antworten 402 und 200).

## Belege

Unsere 402 in der Produktion: `CP_PROVIDER=openrouter` und kein `CP_OPENROUTER_RESALE` im Container `deploy-cp-1` (`docker inspect`,
nur die Namen der Variablen), also verkauft `Catalog.forSale` (src/inference/proxy.ts:59) den ganzen Katalog, `sunsetting` und damit
`intakeClosed` in src/app.ts:469 sind falsch, und `handleChat` nimmt den Zweig ab src/inference/proxy.ts:343 statt den geschlossenen
ab Zeile 321. Gemessen bestätigt: `GET /pay/5/<Wallet von Kunde 1>` bekam von fremden Abrufern seit 13.11. bis heute 402 und nie
410 (src/app.ts:2445 antwortet bei geschlossener Aufnahme 410). Der Code der 402 ist seit 2026-11-10 unverändert
(`git log -1 -- src/inference/proxy.ts`), das laufende Image ist vom 2026-11-19T09:37:16Z.

USDC von Kunde 1: `balanceOf` des USDC-Vertrags auf Base über `mainnet.base.org`, gerechnet auf dem code-host, die Adresse nur im
Speicher aus `ops/db-report.cjs` (`CP_REPORT=decline`, `readonly: true`, Kunde 1 wie in `ops/customer-decline.sh` nummeriert).
Ausgegeben wird nur das Wort. Gegenprobe in beide Richtungen: Mit der Schwelle 0 sagt dasselbe Werkzeug `über der kleinsten Stufe`,
an einem früheren Block, an dem die Wallet nachweislich vor einer Aufladung stand, ebenfalls; der Bestand liegt auch unter 1 USD,
also reichte er nicht einmal für unsere kleinste Stufe.

Aufrufe von `/pay/`: das ganze Zugriffslog über `ops/access-log.sh` (252072 Zeilen), die Adresse von Kunde 1 zugeordnet wie in
`ops/customer-decline.sh` (Inferenz-Zeile und Logzeile mit 200 höchstens 5 s auseinander). Seit 2026-11-13T00:00:00Z stellte sie
26837 Mal `GET /v1/credits/balance` (200), 11260 Mal `POST /v1/chat/completions` mit 402, 177 Mal dasselbe mit 200 (bis
13.11. 05:05) und 1044 Mal `GET /bounties.json`, letzte Zeile 2026-11-20T05:57:35Z; kein `/pay/`. Gegenprobe: Mit einer gepflanzten
Zeile `GET /pay/5` von ihrer Adresse zählt dasselbe Werkzeug 1.

Nebenbefund: Den Pfad `/pay/5/<Wallet von Kunde 1>`, wie ihn unsere 402 in `details.topup_url` nennt, riefen seit 13.11. 56 fremde
Adressen 572 Mal ab, fast alle Verzeichnisse und Prüfer für x402 (der größte Teil mit dem User-Agent `PayAI-Bazaar/1.0`). Die
Wallet eines Kunden steht damit in fremden öffentlichen Verzeichnissen; Vorschlag
`goals/_vorschlaege/kunden-kritik-2026-11-20-1.md`. Mit der Aufladung von Kunde 1 hat das nichts zu tun, er selbst rief den Pfad
nicht auf.

Befehle (Werte bleiben auf dem code-host): `bash ops/access-log.sh`, `docker exec -i -e CP_REPORT=decline deploy-cp-1 node -` mit
`ops/db-report.cjs`, ein `eth_call` von `balanceOf` an `mainnet.base.org`, `docker inspect deploy-cp-1` (nur Namen und
`CP_PROVIDER`).

## Vor der ersten 503

Watchdog: letzter Lauf 2026-11-20T06:00:01Z, credit OK
Alarmweg: received unknown
Aufladung: Schwelle passt
Ergebnis vor der ersten 503: gemeldet, weil der Watchdog auf dem Server alle 5 Minuten den Rest beim Anbieter liest (Crontab, letzte Zeile `CREDIT RUNWAY OK: 30.86 USD, 30.8 days at 1.00 USD per day, threshold 5.00 USD`), unter der Schwelle von 5 USD einmal `CREDIT RUNWAY LOW` meldet und erst danach `credit empty` (`test/credit-before-503.test.ts`), seine POSTs an den Webhook ankommen (`alarm_path.status ok`, 0 Fehlschläge in 24 Stunden, letzte Zustellung 2026-11-20T00:00:01Z) und die Aufladung beim Anbieter bei 16 USD einsetzt, über der gerechneten Schwelle von 7 USD und damit lange vor 0.

Woher die Zeilen kommen:

- Watchdog: `ssh` auf den Server, `tail /var/log/cp-watchdog.log` (Zeilen `credit`), dazu `crontab -l` (Lauf alle 5 Minuten mit
  Webhook). Seit 12.11.2026 steht dort keine Zeile `[WARN] credit` (`grep -c` gibt 0).
- Alarmweg: `bash ops/status.sh` am 2026-11-20T06:00:53Z, `alarm_path.received.status` ist `unknown`, weil der code-host das Topic
  nicht zurückliest (ohne `CP_ALERT_WEBHOOK` in `~/.config/control-plane/loop.env` bleibt `ALARM_TOPIC_RC` leer). Dass eine
  Meldung am Telefon ankommt, ist damit nicht belegt, nur dass der Webhook sie annimmt.
- Aufladung: `bash ops/credit-runway.sh --topup` auf dem code-host gibt `AUTO TOPUP: threshold 7 USD, amount 10 USD, warn threshold
  5.00 USD, 1.00 USD per day`; eingestellt ist beim Anbieter die Schwelle von 16 USD aus `docs/betrieb/guthaben.md`
  (`CP_CREDIT_TOPUP_USD` steht nicht in der Umgebung des code-hosts, es gilt der Standard 16). 16 liegt über 7, also passt sie. Ob die
  Aufladung wirklich bucht, misst betrieb 05 ab 26.11.
- Test: `pnpm -s vitest run test/credit-before-503.test.ts` fährt `ops/watchdog.sh` mit dem unveränderten `ops/credit-runway.sh`
  über sechs Läufe von 9,37 USD auf 0; rot, wenn die Schwelle 0 ist (`CP_CREDIT_WARN_USD=0`, `CP_CREDIT_WARN_DAYS=0`).

## Ende
