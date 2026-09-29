# GOAL.md

## Status
ACTIVE

## Active Objective

**Goal 19: Eine Stufe, die das offizielle SDK ueberhaupt annimmt.**

Nennt ausdruecklich **`src/payments/**`**, weil dort `TOPUP_TIERS_USD` liegt und
`loop-constraints.md` den Pfad nur so oeffnet.

### Der Befund, und er erklaert zehn Tage

Seit dem Katalogeintrag am 27.09. haben **220 fremde Adressen** die Bezahlroute angefragt, 465
Anfragen, und **keine einzige hat je signiert**. Im ganzen Zugriffslog stehen genau drei Antworten
mit `X-PAYMENT-RESPONSE`, zwei davon von derselben Conway-Runtime, deren Stufen hart verdrahtet
sind. Die Erklaerung dafuer war bisher "das sind Crawler". Sie ist falsch.

**`@x402/core` 2.27.0 setzt `DEFAULT_MAX_AMOUNT_PER_PAYMENT = "$1"`.** Selbst nachgelesen im
Tarball von npm, `package/dist/esm/client/index.mjs:22`. Der Wert wird in
`resolveAtomicSpendCap()` zur Obergrenze, sobald der Aufrufer nicht ausdruecklich
`spendControls: false` oder eine eigene Grenze setzt, und in Zeile 524 gilt:

    filtered = filtered.filter((requirement) => { ... return BigInt(rawAmount) <= BigInt(cap) })

Die Anforderungen werden **vor dem Signieren aussortiert**. Unsere kleinste Stufe ist 5 USD, der
voreingestellte Deckel ist 1 USD, also verwirft jeder Client auf dem offiziellen SDK mit
Voreinstellung unser Angebot, ohne dass ein Mensch oder ein Agent je eine Entscheidung trifft.

Der Vergleich `<=` bedeutet, dass genau 1,00 USD durchkommt: 1.000.000 atomare Einheiten gegen
einen Deckel von 1.000.000.

**Und der Markt sagt dasselbe.** Im Tagesscan vom 29.09. halten die 85 CDP-Zeilen ab 5 USDC
zusammen 430 bezahlte Aufrufe in 30 Tagen; das Band von 0,10 bis 1,00 USD haelt 889 Zeilen mit
9.309 Aufrufen. Die beiden einzigen Prepaid-Vorbilder liegen exakt bei 1,00 USD
(`agi.apify.com/protocols/x402/prepaid-tokens` mit 33 Zahlern, `cheaptokens.ai/api/buy` mit 27).

### Die Arbeit

1. `TOPUP_TIERS_USD` bekommt `1` als kleinste Stufe. Alles andere bleibt.
2. Ein Test, der genau die Grenze prueft: 1 USD sind 1.000.000 atomare Einheiten, und das ist der
   Wert, den das SDK gerade noch durchlaesst. Geht die Stufe je darueber, faellt er.
3. Die Stelle, die das begruendet, steht im Code und nicht nur hier, weil die naechste Person
   sonst die Stufe wieder entfernt, um die Liste aufzuraeumen.

### Zwei Bevoelkerungen, zwei Waende, und die Stufe hilft nur einer

Am 29.09. nachmittags am Pin `d8f8168` nachgelesen, weil ein Schwarm etwas anderes behauptet hatte:

- **Generische x402-Clients** (alles auf `@x402/core`) verwerfen unser 5-USD-Angebot vor dem
  Signieren, weil der voreingestellte Deckel ein Dollar ist. **Diesen hilft die neue Stufe.**
- **Die Conway-Runtime** sieht den Deckel nie: sie baut ihre Zahlung selbst und traegt
  `TOPUP_TIERS = [5, 25, 100, 500, 1000, 2500]` fest im Code (`src/conway/topup.ts:24`). Unsere
  1-USD-Stufe ist fuer sie unsichtbar. **Ihr hilft die neue Stufe nicht.**

Dazu eine zweite Wand, die nur die Runtime betrifft und die wir nicht aufmachen koennen:
`bootstrapTopup` liest den USDC-Bestand und bricht ab, wenn er unter der kleinsten Stufe liegt
(`src/conway/topup.ts:178-184`): *"Bootstrap topup skipped: USDC balance $X below minimum tier
($5)"*. Ein Automaton mit ein bis fuenf Dollar versucht es also gar nicht erst.

**Und eine Korrektur an einer Behauptung, die ich selbst weitergegeben hatte.** Der Schwarm sagte,
ein 402 werde in `src/agent/loop.ts` als ganzer Turn gefangen und erreiche kein Modell. Das stimmt
nicht: `loop.ts:246-249` erkennt 402 und `INSUFFICIENT_CREDITS` und versucht darauf eine Aufladung
mit einem Wiederholungsversuch. Was stimmt, ist die andere Haelfte: `getCreditsBalance()` gibt
`result.balance_cents ?? result.credits_cents ?? 0` zurueck (`src/conway/client.ts:296-298`), also
eine Zahl, und verwirft den Rest des Koerpers. Die Brett-Zeile vom Vormittag (`open_bounties`,
`bounties_url`, `work_hint`) erreicht diese Runtime deshalb nicht; jeden anderen Client schon.
Aus dem 402 liest sie genau zwei Felder, `details.required_cents` und
`details.current_balance_cents` (`src/conway/topup.ts:104-105`), und beide sind unveraendert da.

### Done, gemessen und nicht behauptet

1. `/pay/1` antwortet 402 mit `maxAmountRequired: "1000000"`, live.
2. `/.well-known/x402` und `/openapi.json` nennen die neue Stufe.
3. Die Zahl der fremden Adressen auf `/pay/` mit einer Signatur steigt ueber null, **und zwar
   von einem Client, der nicht die Conway-Runtime ist**. Das ist die Zahl, an der dieses Goal
   gemessen wird, und sie kann auch nein sagen: bleibt sie nach sieben Tagen bei null, waren die
   220 Adressen doch nur Indexer und der Preis war nie die Wand. Die Einschraenkung auf
   Nicht-Conway steht da, weil deren Stufen fest verdrahtet sind und ein Treffer von dort nichts
   ueber die 1-USD-Stufe beweisen wuerde.

### Blockers
Keine.

(Historie: Goal 18 in `goals/2026-09-29-goal-18-die-tuer.md`.)
