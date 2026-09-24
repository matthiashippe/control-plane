# GOAL.md

## Status
ACTIVE

## Active Objective

**Goal 17: In den x402-Katalog kommen, mit der Form, die die Spezifikation verlangt.**

Nennt ausdruecklich **`src/payments/**`**, weil dort der Bazaar-Block und der Facilitator-Aufruf
liegen und `loop-constraints.md` den Pfad nur so oeffnet.

### Was gestern falsch war, und wie es auffiel

Am 23.09. stand im Kopf von `ops/own-x402-listing.sh` das Ergebnis von sieben Messungen:
*"So the same thing is true of both: we have settled, we are in neither, and neither publishes a
way in. The loop has no door it can walk through."* Das war falsch, und zwar an der Stelle, an der
nicht gemessen, sondern geschlossen wurde.

**Gemessen am 24.09.:** zwischen dem 21.09. und heute sind **141 Hosts neu in die beiden Kataloge
gekommen**, 93 bei CDP, 48 bei PayAI, also rund 47 am Tag. Zehn davon sprechen x402 Version 1 wie
wir, darunter zwei ephemere `trycloudflare.com`-Tunnel, die niemand crawlen wuerde. Die Tuer ist
offen und wird taeglich benutzt.

**Und die Spezifikation beschreibt sie.** `coinbase/x402`, `docs/extensions/bazaar.mdx`:
*"Services are discoverable when they include the bazaar extension in their route configuration."*
Die Form dort ist

    extensions: { bazaar: { discoverable: true, inputSchema: {...}, outputSchema: {...} } }

Unsere ist `extensions.bazaar.info.{input,output}` und enthaelt `discoverable` nirgends. Die
gelisteten Dienste zeigen dieselbe Sache auf der Leitung: ihre 402 traegt
`accepts[].outputSchema.input.discoverable = true`, unsere traegt kein `outputSchema`.

**Dazu der Beleg, den wir nie gelesen haben.** Dieselbe Seite: nach einer Zahlung mit
Bazaar-Erweiterung antwortet der Facilitator mit dem Header `EXTENSION-RESPONSES`, base64-JSON mit
`bazaar.status` aus `success`, `processing` oder `rejected` und im Ablehnungsfall
`bazaar.rejectedReason`. `FacilitatorClient.post()` in `src/payments/facilitator.ts` gibt nur den
geparsten Rumpf zurueck und wirft die Header weg. Wir haben ein bis neun Abrechnungen bei PayAI
und haben nie erfahren, was dieser Header dazu gesagt hat.

### Die Arbeit

1. `src/payments/bazaar.ts` auf die Form der Spezifikation: `discoverable: true`, `inputSchema`,
   `outputSchema`. Dazu `routeTemplate`, weil `/pay/{usd}/{address}` eine parametrisierte Route
   ist und der Katalog sonst je Zahler eine eigene Zeile bekaeme; die Spezifikation nennt
   `routeTemplate` ausdruecklich als Katalogschluessel.
2. `post()` gibt die Header mit zurueck, `settle` und `verify` lesen `EXTENSION-RESPONSES`,
   dekodieren es und schreiben Status und Ablehnungsgrund ins Log. **Das ist der eigentliche
   Gewinn:** ab da sagt uns der Facilitator selbst, ob es gewirkt hat, statt dass wir den Katalog
   raten.
3. Der Tagesscan bekommt die Differenz: welche Hosts sind seit gestern neu. Ohne die Zahl waere
   heute nicht aufgefallen, dass die Tuer benutzt wird.

### Done, gemessen und nicht behauptet

1. Eine Abrechnung laeuft und der `EXTENSION-RESPONSES`-Header wird gelesen und protokolliert.
   Steht dort `rejected`, ist der Grund die naechste Arbeit und das Ziel ist trotzdem erreicht:
   wir wissen zum ersten Mal, warum.
2. `ops/own-x402-listing.sh` findet unseren Host im Tagesscan. Das ist die Zielzahl fuer den
   02.10. und sie steht heute auf 0 von 23.512 Zeilen.
3. Der Katalog fuehrt uns mit **einer** Zeile und nicht mit einer je Zahler.

### Blockers
Keine. Alles daran ist Code und Messung.

(Historie: Goal 16 in `goals/2026-09-23-goal-16-schluessellos.md`.)
