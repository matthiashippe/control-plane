# Startgutschrift vor dem ersten Denken (kunden 06)

Gemessen: 2026-11-20T07:58:16Z

Frage: Welche Anfragen stellten die neuen fremden Runtimes ohne Startgutschrift nach dem Anlegen ihres Schlüssels, und
welchen Aufruf macht die Runtime am Pin `d8f8168` vor ihrem ersten Denken? Gemessen nur lesend auf dem code-host: die
Datenbank mit `readonly: true` über `ops/db-report.cjs` (`CP_REPORT=starter-paths`) im Container `cp`, das ganze
Zugriffslog über `ops/access-log.sh`, eigene Adressen über `ops/own-ips.sh`. Das Fenster sind die 28 Tage bis zur Messung.

## Messung

```
bash ops/starter-paths.sh --since 2026-10-23T07:58:00Z --until 2026-11-20T07:58:00Z --own-check
```

```
STARTER since 2026-10-23T07:58:00Z until 2026-11-20T07:58:00Z: 9 new runtimes, 6 granted
RUNTIME 1: key 2026-10-26T17:56:12Z, granted no, ips 1
PATH 1 POST /v1/auth/api-keys: 1
RUNTIME 2: key 2026-10-30T11:43:11Z, granted yes, ips 0
RUNTIME 3: key 2026-11-10T05:07:22Z, granted yes, ips 1
RUNTIME 4: key 2026-11-10T08:44:38Z, granted yes, ips 1
RUNTIME 5: key 2026-11-12T13:22:38Z, granted no, ips 1
PATH 5 GET /v1/credits/balance: 1104
PATH 5 POST /v1/chat/completions: 492
PATH 5 POST /v1/auth/api-keys: 6
PATH 5 POST /v1/auth/nonce: 5
PATH 5 POST /v1/auth/verify: 5
PATH 5 GET /pay/5/:address: 2
PATH 5 POST /v1/sandboxes: 1
RUNTIME 6: key 2026-11-12T14:06:44Z, granted yes, ips 1
RUNTIME 7: key 2026-11-12T22:27:06Z, granted yes, ips 1
RUNTIME 8: key 2026-11-14T14:33:33Z, granted yes, ips 1
RUNTIME 9: key 2026-11-16T23:38:42Z, granted no, ips 1
PATH 9 POST /v1/auth/api-keys: 1
PATH 9 GET /v1/credits/balance: 1
PATH 9 GET /v1/models: 1
UNMATCHED: 1 runtimes without a log line within 5 s
OWN WOULD GRANT: 0
```

Die Zahlen stimmen mit dem Trichter überein (`docs/kunden/trichter.md`: 9 neue Runtimes, 6 mit Startgutschrift). Das
Werkzeug ist in beide Richtungen bewiesen: `bash ops/starter-paths.sh --selftest` endet mit `SELFTEST OK`, mit gepflanzter
eigener Adresse, gepflanztem Pfad, gepflanzter Runtime ohne Zuordnung und gepflanztem eigenen Lauf, je mit Gegenprobe.

Die drei Runtimes ohne Gutschrift:

- Runtime 1 (26.10.) legte ihren Schlüssel an und rief danach in 24 Stunden nichts mehr auf. Kein Auslöser hätte sie
  erreicht.
- Runtime 5 (12.11.) teilt ihre Adresse mit einer anderen Wallet, die schon Guthaben hatte: Ihre eigene Wallet hat keine
  Ledger-Zeile, und `grantOnFirstUse` hätte bei einem Chat mit ihrem eigenen Schlüssel die Gutschrift gegeben. Die 492
  Chats und 1104 Saldo-Abfragen ihrer Adresse gehören also zur anderen Wallet; welche ihr Schlüssel stellte, zeigt das
  Zugriffslog nicht.
- Runtime 9 (16.11.) las nach dem Schlüssel genau einmal `GET /v1/credits/balance`, bekam einen leeren Saldo, fragte
  einmal `GET /v1/models` und ging. Die Gutschrift für wartende Runtimes verlangt drei Abfragen über mehr als eine
  Minute, die Gutschrift beim ersten Denken einen Chat; beide griffen nicht.

## Die Runtime am Pin

Nach der Anmeldung (`automaton --provision` oder der erste Start mit `--run`) ruft die Runtime in dieser Reihenfolge:

- Runtime: src/identity/provision.ts:144 am Pin d8f8168, `POST /v1/auth/api-keys` legt den Schlüssel an, das Ende der Anmeldung.
- Runtime: src/conway/client.ts:454 am Pin d8f8168, `POST /v1/automatons/register`, nur solange die Runtime sich nicht als registriert gespeichert hat (`registerAutomaton` aus `src/index.ts`).
- Runtime: src/index.ts:349 am Pin d8f8168, `conway.getCreditsBalance()` vor `bootstrapTopup`, also der erste Saldo nach dem Schlüssel.
- Runtime: src/conway/client.ts:297 am Pin d8f8168, `getCreditsBalance` ist `GET /v1/credits/balance` und liest `balance_cents`.
- Runtime: src/agent/loop.ts:956 am Pin d8f8168, `getFinancialState` liest den Saldo zu Beginn der Schleife ein zweites Mal, vor dem ersten `inference.chat`.

Erster Aufruf vor dem ersten Denken: GET /v1/credits/balance

Messung und Code passen zusammen: Runtime 9 rief `POST /v1/automatons/register` nicht auf, was der Code nur auslässt,
wenn die Runtime sich schon als registriert gespeichert hat, und las den Saldo genau dort, wo der Code ihn liest. Mit einem leeren Saldo hätte sie danach über `bootstrapTopup` USDC gebraucht,
die sie nicht hatte.

Ergebnis: Auslöser GET /v1/credits/balance, weil die Runtime am Pin diesen Aufruf als ersten nach dem Schlüssel und noch einmal vor dem ersten Denken macht und Runtime 9 genau nach einem solchen Aufruf mit leerem Saldo ging.

## Der neue Auslöser

`grantOnFirstRead` in `src/credits/starter.ts`, gerufen aus `GET /v1/credits/balance` in `src/app.ts`: Liest ein Schlüssel
namens `conway-automaton` einer über SIWE angelegten Adresse einen Saldo von 0, bekommt die Adresse die Gutschrift über
`grantOnFirstUse`, einmal je Adresse, mit Pool und Tageslimit wie bisher, nie bei geschlossener Aufnahme, nie für eine
Adresse aus `OURS` oder mit einem Schlüssel aus `OUR_KEY_NAMES`, nie für eine Adresse der schlüssellosen Anmeldung. Die
Antwort trägt `balance_cents` an erster Stelle, dazu `granted_cents` und `hint`. Die beiden bisherigen Auslöser bleiben;
erfüllt eine Abfrage die Bedingung der wartenden Runtime, behält sie ihre bisherige Antwort. Belegt mit
`test/starter-first-call.test.ts`.

## Schutz des Pools

`OWN WOULD GRANT` zählt die Läufe der 14 Tage vor der Messung, deren Anmeldezeilen im Abstand von 5 s alle von eigenen
Adressen kamen und die von dort in den 24 Stunden nach dem Schlüssel `GET /v1/credits/balance` lasen, bevor ihre Wallet
Geld oder eine Gutschrift hatte.

Schutz des Pools: 0 eigene Läufe hätten gezogen
