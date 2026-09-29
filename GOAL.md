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

### Done, gemessen und nicht behauptet

1. `/pay/1` antwortet 402 mit `maxAmountRequired: "1000000"`, live.
2. `/.well-known/x402` und `/openapi.json` nennen die neue Stufe.
3. Die Zahl der fremden Adressen auf `/pay/` mit einer Signatur steigt ueber null. **Das ist die
   Zahl, an der dieses Goal gemessen wird**, und sie kann auch nein sagen: bleibt sie nach sieben
   Tagen bei null, waren die 220 Adressen doch nur Indexer und der Preis war nie die Wand.

### Blockers
Keine.

(Historie: Goal 18 in `goals/2026-09-29-goal-18-die-tuer.md`.)
