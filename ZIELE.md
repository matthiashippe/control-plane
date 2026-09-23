# Ziele

> Diese Datei steht vor `loop-dauerauftrag.md`. Ein Zyklus faengt hier an, nicht im Backlog.
> Matthias am 23.09.2026: "das muss um den faktor 10 schneller gehen, alle diese Ziele innerhalb
> dieses Jahres, sonst gibt es keine Traction." Und: "du arbeitest die ganze Zeit nur an Bugs und
> nicht an der Vision."

## Die vier Ziele, Faktor 10, alle in 2026

Die alten Termine waren 23.10., 22.12., 09/2027 und 09/2029. Das sind 30, 90, 365 und 1.096 Tage
ab dem 23.09. Durch zehn: 3, 9, 36 und 110 Tage. Nur das letzte landet elf Tage nach Silvester und
ist deshalb auf den 31.12. gezogen, also Faktor 11.

| Bis | Ziel | Die Zahl | Stand 23.09. |
|---|---|---|---|
| **26.09.** | Fuenf fremde Adressen hinterlegen Geld, und bei einem Auftrag gehoert weder Kaeufer noch Gewinner uns | `paying_wallets` fremd, `foreign_gmv_30d` | 1 zahlende fremde Wallet, `foreign_gmv_30d` = 0 |
| **02.10.** | Eine feste Resource-URL im x402-Verzeichnis, 1.000 bezahlte Aufrufe von 25 fremden Wallets | Zeilen mit unserem Host im Tagesscan | 0 von 22.494 |
| **29.10.** | 5.000 USDC fremdes Auftragsvolumen im Monat, 500 USDC Provision | `foreign_gmv_30d`, `foreign_fee_30d` | 0 und 0 |
| **31.12.** | 250.000 USDC im Monat, unter den zehn meistgerufenen x402-Diensten | `foreign_gmv_30d`, Rang im Verzeichnis | 0, nicht gelistet |

**Die eine Zahl, wenn nur eine bliebe:** `foreign_gmv_30d`. Sie setzt alle drei Ereignisse voraus:
ein Fremder hat hinterlegt, ein Agent hat geliefert, der Kaeufer hat vergeben.

## Wo die Arithmetik bricht, einmal gesagt

250.000 USDC im Monat sind das 568-fache des gesamten gemessenen Marktes, in den wir verkaufen:
Conways Zahlungs-Endpunkt hat in 30 Tagen 440 USDC von 44 Wallets gesehen. Platz zehn bei x402
liegt dagegen bei grob 51.000 Aufrufen im Monat und ist erreichbar. **Wenn das Geld bis Silvester
kommen soll, kann es nicht aus dem x402-Markt kommen, sondern von Menschen, die normal bezahlen.**
Und dann ist die erste Aenderung nicht Marketing, sondern der Einstieg: ein Kaeufer braucht heute
ein Schluesselpaar, eine Ethereum-Signatur und USDC, um einen Auftrag zu stellen.

## Teilziele

<!-- Wird vom Workflow `ziele-zu-teilzielen` gefuellt und von jedem Zyklus fortgeschrieben.
     Abgearbeitete Zeilen bleiben stehen und werden abgehakt, mit dem, was die Zahl danach sagte. -->

### Ziel 02.10. -- im x402-Verzeichnis stehen

- [x] **T2.1 Herausfinden, was einen Verkaeufer ueberhaupt in den Katalog bringt.** Zahl: keine
      direkt, aber jede weitere Stunde an diesem Ziel haengt daran. Erledigt am 23.09.
      **Ergebnis: sieben Ursachen ausgeschlossen, und die Frage hat sich umgedreht.** Der Katalog
      wird **nicht** aus Abrechnungen gebaut: drei von zehn gelisteten Eintraegen haben null
      Abrechnungen, `api.paysponge.com` steht mit templatiertem Pfad und ohne eine einzige drin.
      Wir haben die Abrechnung und keinen Eintrag, die haben den Eintrag und keine Abrechnung.
      Ausgeschlossen: Wallet im Pfad (75 Gegenbeispiele), Version 1 (1.408 Eintraege, 126 davon in
      30 Tagen), templatierter Pfad (nur 190 von 6.792), unsere Kombination nicht unterstuetzt
      (`/supported` fuehrt `{v1, exact, base}` und die `bazaar`-Erweiterung), vergessene
      Registrierung (die OpenAPI hat elf Endpunkte, zwei davon schreiben: `/verify` und
      `/settle`), unvollstaendiger Scan (6.799 im Katalog, 6.792 gelesen), und ein
      Statistik-Endpunkt, der alles bejaht (erfundene Ressourcen bekommen `0`, unsere `1-9`).
      Die Ausschlussliste steht im Kopf von `ops/own-x402-listing.sh`.
- [ ] **T2.2 Ein Merchant-Konto bei PayAI.** Zahl: Zeilen mit unserem Host im Tagesscan, 0 -> mind. 1.
      **Wartet auf Matthias, neuer Punkt 8.** Die OpenAPI des Facilitators nennt
      `https://merchant.payai.network` als den Ort, an dem ein Haendler einen API-Schluessel
      anlegt; die Seite antwortet mit 200. Das ist die einzige Tuer in der oeffentlichen
      Oberflaeche, die nicht `/verify` oder `/settle` ist, und sie ist eine weit kleinere Bitte als
      die Aenderung an `src/payments/**`, auf die dieses Ziel vorher zeigte.
      Erster Schritt danach: Konto anlegen, Schluessel in `.env` auf der VM, und der naechste
      Tagesscan sagt, ob es gewirkt hat.

## Fiat, und wo die Grenze liegt

Matthias am 23.09.: "auch Fiat-Waehrung im Kopf behalten. Fiat fuer Agents, Fiat fuer Customer,
oder Customer zahlt in Fiat und Agent bekommt Crypto."

Das ist die Entscheidung, an der die Ziele am 29.10. und 31.12. haengen, denn aus dem x402-Markt
koennen 5.000 oder 250.000 USDC im Monat nicht kommen. Drei Formen, und sie kosten sehr
unterschiedlich viel.

**A. Fiat fuer Agenten.** Wir zahlen dem Gewinner Euro aus. Das verlangt eine Identitaetspruefung
je Agent, Bankwege und ist ohne Umweg ein Auszahlungsgeschaeft. Dazu der praktische Einwand: die
Gewinner sind Software, und die wenigsten haben ein Konto. Schwerste Form, geringster Nutzen.

**B. Fiat fuer Kaeufer.** Der Kaeufer zahlt mit Karte und bekommt Credits, alles danach bleibt wie
es ist. Credits bleiben nicht auszahlbar, `/terms` bleibt unveraendert, und es entsteht keine neue
regulatorische Flaeche ueber den normalen Verkauf von Dienstguthaben hinaus. **Das trifft den
gemessenen Engpass:** 43 von 43 Besuchern brauchten ein Schluesselpaar, eine Ethereum-Signatur und
USDC, und null sind durchgekommen. Braucht: Matthias' Stripe-Konto, Punkt 4 unten.

**C. Kaeufer zahlt Fiat, Agent bekommt Krypto.** Die Bruecke, und die groesste Reichweite auf
beiden Seiten. Sie stoesst frontal gegen vier Stellen, die heute das Gegenteil sagen: `/terms`
("Credits are not redeemable for money"), `/v1/credits/pricing` (`redeemable: false`), `llms.txt`,
und `loop-constraints.md` ("Credits sind nie auszahlbar... Jede Auszahlbarkeit ist ein
REJECT-Grund"). Geld von A nehmen und an B auszahlen ist der Punkt, an dem Finanzaufsicht
anfaengt. **Das entscheidet kein Loop.** Es braucht Rat, und zwar bevor eine Zeile dafuer entsteht.

**Und die vierte Sache, die nichts kostet und vielleicht den groessten Teil der Wirkung hat.**
Ein Agent, der heute gewinnt, bekommt Guthaben, das er nur hier ausgeben kann, und die Seiten
beschreiben es ausschliesslich ueber das, was es **nicht** ist. Fuer einen Agenten, dessen einzige
Kosten Inferenz sind, kauft dieses Guthaben genau das, was er braucht. Aus unserem eigenen Ledger
gemessen am 23.09.: vierzig Inferenz-Buchungen, im Schnitt **0,81 Cent je Antwort**, die letzten
zwanzig zwischen 0,04 und 1,07. Ein Preis von 135 Cent sind damit rund **165 Antworten**. Auf
`/jobs` steht "135 ¢ to the winner" und kein Wort davon.

**Empfehlung:** B jetzt, sobald das Stripe-Konto da ist. Die Formulierung heute, sie kostet nichts.
C nur mit Rat, und dann als eigene Entscheidung mit eigenem Datum.

- [x] **T4.1 Der Preis steht in der Einheit, in der ein Agent rechnet.** Commit `1c89045`,
      **committet, noch nicht ausgerollt.** `/jobs` sagte "135 ¢ to the winner" und sonst nichts;
      jetzt dazu, was diese Cents kaufen, aus dem eigenen Ledger gerechnet statt aus dem Tarif.
      Unter zehn Buchungen sagt die Seite nichts. Der Rollout am 23.09. um 11:20 und 11:26 UTC ist
      zweimal abgelehnt worden, weil `registry-1.docker.io` von dieser Maschine nicht erreichbar
      ist und die e2e-Strecke ihr Basisimage nicht ziehen kann. **Nicht mit `--no-e2e` umgangen:**
      die Aenderung liegt auf dem Laufzeitpfad, und die Zeile hilft einem fremden Agenten, von
      denen es null gibt, also kostet Warten nichts und das Umgehen kostet die Regel.
      Naechster Zyklus: `ops/deploy.sh` erneut.

## Was auf Matthias wartet

Sieben Saetze, und alles andere laeuft. Stand 23.09., nichts davon darf der Loop selbst tun.

1. **"Antworten raus"** -- neun gepruefte Issue-Antworten, `ops/post-the-answers.py --send 3`.
   Der einzige Kanal, der je einen Leser gebracht hat.
2. **"Caddyfile ja"** -- `git apply ops/caddyfile-pending.patch`, von Caddy validiert. Danach hat
   `/check` ein Textfeld, und die Adresszeile speichert keine Entwuerfe mehr.
3. **"Name weg"** -- `handsel.dev` ist ein laufender Wettbewerber mit fast gleicher Beschreibung.
4. **Stripe-Konto** -- damit ein Kaeufer ohne Wallet zahlen kann. Bedingung fuer jedes Umsatzziel.
5. **Search Console und Bing** -- sein Login, den DNS-Eintrag setzt der Loop selbst.
6. **Eine Zahl fuer Anzeigen** -- Empfehlung: 20 Euro am Tag fuer zwei Wochen.
7. **Tailscale neu anmelden** -- der code-host nimmt sonst keine Auftraege.
8. **Ein Konto bei `merchant.payai.network`** -- nach der Untersuchung vom 23.09. die einzige noch
   offene Tuer in den x402-Katalog, und damit die Bedingung fuer das Ziel am 02.10. Siehe T2.2.

## Wie Teilziele entstehen

Nicht aus dem Bauch und nicht aus dem Backlog. Ein Workflow leitet sie aus den Zielen ab, mit
mehreren unabhaengigen Winkeln und einem Skeptiker pro Vorschlag, der die eine Frage stellt:
bewegt das die genannte Zahl, oder ist es wieder Reparatur. Der Lauf vom 23.09. heisst
`ziele-zu-teilzielen`. Neu abgeleitet wird, wenn ein Ziel erreicht ist, wenn ein Termin verstreicht,
oder wenn Matthias eine der sieben Sperren loest und damit ein Kanal aufgeht.
