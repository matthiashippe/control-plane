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

Abgeleitet am 23.09. vom Workflow `ziele-zu-teilzielen`: 40 Agenten, sechs Winkel, ein Skeptiker
auf jeden einzelnen Vorschlag. **Von 30 abgeleiteten Teilzielen hat keines den Skeptiker
ueberstanden, null von dreissig.** Der Plan unten ist deshalb aus den Ablehnungsbegruendungen
gebaut und nicht aus den Vorlagen: in jeder Begruendung stand der bessere Zug.

### Ziel 26.09. -- der erste fremde Kaeufer

- [x] **T1.1 "Fremd" an die Geldherkunft binden, bevor der Einstieg billiger wird.** Erledigt
      23.09., Commit `00998a9`. `grant_funded_gmv_30d_mc` steht neben `foreign_gmv_30d_mc`, und die
      Zielzahl verlangt jetzt eine `topup`-Zeile beim Kaeufer; die Provision ebenso, denn eine
      Provision aus dem eigenen Topf ist kein Umsatz. Drei Faelle, Gegenprobe gelaufen. Die Zahl
      steht heute bei 0 und 0, was richtig ist: es hat noch keinen fremden Auftrag gegeben.
      **Damit kann T1.2 gebaut werden, ohne die Zahl zu faelschen.**
      (alter Text) **T1.1** Zahl: keine,
      und genau deshalb zuerst, denn es verhindert, dass T1.2 die Zielzahl faelscht. Neben
      `foreign_gmv_30d_mc` kommt `grant_funded_gmv_30d_mc`, und ein Auftrag, dessen Kaeufer bei der
      Vergabe keine `topup`-Zeile im Ledger hat, zaehlt dort statt in der Zielzahl. Erster Schritt:
      die Query in `ops/db-report.cjs:269` um `not exists (select 1 from ledger where address =
      b.creator and kind = 'topup')` ergaenzen, Fall in `test/db-report.test.ts`. 1 h.
- [x] **T1.2 Der erste Auftrag einer fremden Adresse laeuft aus dem Topf.** Erledigt 23.09.,
      Commit `b3df7f2`, ausgerollt 12:11 UTC. Der Zuschuss deckt genau die Luecke des Auftrags, bis
      50 Cent, und gehoert dem **Auftrag**: endet er ohne Vergabe, geht das Guthaben an den Topf
      zurueck statt auf die Wallet. Ohne diese zweite Haelfte waere es ein Weg gewesen, den Topf in
      Inferenz zu verwandeln, zum dreifachen Agentensatz, und die Adresse haette trotzdem in
      `foreign_buyers` gestanden. Vier neue Faelle, Gegenprobe in beide Richtungen.
      **Offene Kante, bewusst:** wer zurueckzieht, hat seinen einen Zuschuss verbraucht. Das zu
      heilen verlangt, den Unique-Index zu verschieben, also eine Migration auf einem laufenden
      Ledger, und das gehoert nicht in denselben Commit wie eine Geldfluss-Aenderung.
      (alter Text) Zahl: `foreign_buyers`
      0 auf bis zu 4, `grant_funded_gmv_30d` 0 auf bis zu 2 USD, `foreign_gmv_30d` bewusst
      unberuehrt. 15 Cent tragen keinen Auftrag, den ein Agent ernst nimmt; der Erstauftrag einer
      Adresse ohne eigenes USDC bekommt 50. Der Preis steht dazu: 215 Cent im Topf sind entweder
      14 Agenten-Grants oder vier Kaeufer-Erstauftraege, nicht beides. 2 h.
- [~] **T1.3 gestrichen, mit Begruendung.** Der Workflow hat vorgeschlagen, die neun Antworten zum
      **Auftrag** aufzurufen statt zum Guthaben. Beim Lesen der Entwuerfe faellt es durch: wer ein
      Conway-Issue liest, hat keinen Auftrag, er hat einen kaputten Agenten. Und die Entwuerfe sind
      bewusst zurueckhaltend, erst die zwei kostenlosen Wege, unser Angebot als drittes, und genau
      das hat den einen Menschen gebracht, der je gescrollt hat. Eine Offenlegung, die zum Aufruf
      wird, liest sich als Anzeige. **Der richtige Ort dafuer ist die Seite, auf der er landet,
      nicht der Kommentar**, also T1.4.
      (Urspruenglich) **T1.3 Die neun Antworten rufen zum Auftrag, nicht zum Guthaben.** Die Entwuerfe schicken den
      Leser heute zu Credits; die Handlung, die die Zielzahl zaehlt, ist der Auftrag. Erster
      Schritt: `ops/stranger-client.sh` vom Issue-Link bis zum offenen Auftrag durchlaufen und jede
      Abbruchstelle protokollieren. 1 h, reiner Text.
- [x] **T1.4 `/fix` schaerfen**, erledigt 23.09., Commit folgt. **Die Marke ausgewertet, und sie
      sagt etwas Hartes:** vierzehn fremde Adressen haben `/fix` geoeffnet, zwei haben die obere
      Marke erreicht, zwei die Marken bei "stop it buying" und "make it think", und **genau eine**
      hat `fix-us` erreicht, den einzigen Schritt, der diesen Dienst nennt. Die Versuchung waere,
      das Angebot nach oben zu ziehen. Die Seite stellt es mit Absicht an dritte Stelle, weil die
      zwei kostenlosen Wege davor es glaubwuerdig machen, und vierzehn Adressen, von denen eine
      gescrollt ist, sind viel zu duenn, um eine Seite danach umzubauen.
      Gebaut ist stattdessen das, was fehlte: **Schritt 3 sagte, wie der Agent wieder denkt, und
      kein Wort davon, dass es hier bezahlte Arbeit gibt.** Jetzt nennt er das Brett mit den Zahlen
      von heute, und bei leerem Brett sagt er nichts, weil "komm und konkurriere" ueber einer
      leeren Liste mehr kostet als es bringt.
      (Urspruenglich) **T1.4 `/fix` schaerfen**, die einzige Seite ausser der Startseite mit echten Lesern (11
      Besuche von 10 Adressen). Host auf `postyourprice.com`, heutiger Brettwert aus
      `openBounties` hineingerendert, Marke `fix-us` auswerten. 0,5 h.

**Wartet auf Matthias:** Punkt 1 (Antworten raus), ohne den T1.1 bis T1.4 bei null bleiben, weil
sie einen Weg fertig machen und keinen Zulauf erzeugen. Danach Punkt 2 (Caddyfile), danach 20
Minuten Loop-Arbeit.

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

## Die Position, in einem Satz

Matthias am 23.09.: **"Das Ziel ist ja, dass im Marketplace Waehrung keine Rolle spielt, sondern
dass man einfach handeln kann."**

Daran gemessen ist die Haelfte schon gebaut und die andere fehlt ganz.

**Gebaut: die Rechnungseinheit ist bereits waehrungsfrei.** Preise stehen in Cent, Salden in
Millicent, und ein Cent ist hier eine Recheneinheit und keine Waehrung. Ein Auftrag kostet 150,
der Gewinner bekommt 135, die Provision sind 15. Nichts davon sagt, in was jemand bezahlt hat oder
bezahlt bekommt. Das ist die richtige Grundlage und sie muss nicht angefasst werden.

**Es fehlen die Schienen.** Herein gibt es heute genau eine: USDC ueber x402 auf Base. Hinaus gibt
es keine, Credits sind nicht auszahlbar. "Waehrung spielt keine Rolle" heisst: viele Schienen
herein, und mindestens eine hinaus.

**Und genau dort liegt die Grenze.** Wer viele Schienen herein und eine hinaus hat und dazwischen
das Geld haelt, ist eine Wechselstube. Heute halten wir: der Preis verlaesst das Guthaben des
Kaeufers beim Ausschreiben und liegt bei uns, bis vergeben wird. Solange nichts hinausgeht, ist
das unproblematisch; mit einer Schiene hinaus ist es der Kern des Problems.

**Die Form, die den Satz einloest, ohne Wechselstube zu werden:** wir halten nicht, wir vermitteln.
Der Kaeufer zahlt, davon geht unsere Provision an uns und der Rest an den Gewinner, auf der
Schiene, die der Gewinner gewaehlt hat. Das ist die uebliche Marktplatz-Bauform, und es gibt sie
fertig: Stripe Connect nimmt beim Bezahlen eine Anwendungsgebuehr fuer die Plattform und schreibt
den Rest dem Verkaeufer gut, samt Identitaetspruefung und Auszahlungswegen. Wer Krypto will, nimmt
dieselbe Bauform mit einem Krypto-Auszahler, und wer gar nichts will, behaelt Credits und kauft
davon Inferenz.

Damit ist der Unterschied zwischen den drei Fiat-Formen unten kein Geschmack mehr, sondern die
Frage, ob wir halten oder vermitteln. **Das ist die Entscheidung, und sie gehoert Matthias.**
- [x] **T2.3 Welche Tuer fuehrt in den CDP-Katalog?** Erledigt 23.09. **Antwort: keine, die der
      Loop gehen kann.** Vier Messungen, und die erste korrigiert die Frage.
      **Die Praemisse war ein Artefakt.** Dass alle 107 Zeilen mit mindestens 25 Zahlern
      CDP-Zeilen sind, sieht nach Nachfrage in einem Katalog aus und ist keine:
      **PayAI veroeffentlicht ueberhaupt keine Zahlerzahlen**, 0 von 6.792 Zeilen tragen eine.
      Der Vergleich laesst sich nicht anstellen. Veroeffentlicht ist dazu nichts Falsches,
      `x402-metrics.py` rechnet absichtlich nur ueber CDP und `/x402` sagt
      *"services with published demand"*.
      **133 Hosts stehen in beiden Katalogen**, Zugehoerigkeit haengt also nicht daran, ueber
      welchen Facilitator jemand abrechnet. **CDP nimmt Version 1 weiter auf**, 202 seiner 204
      v1-Zeilen wurden in den letzten 30 Tagen aktualisiert, die neueste heute. Und **CDPs
      Discovery liest ohne Schluessel, jeder andere Pfad dort antwortet 401**, es gibt also nicht
      einmal eine oeffentliche Registrierungsflaeche zum Nachlesen.
      **Damit gilt fuer beide dasselbe:** wir haben abgerechnet, wir stehen in keinem, und keiner
      veroeffentlicht einen Weg hinein. Die Entscheidung ist **Punkt 8** als billigster Test, ein
      Konto. Bringt er eine Zeile im Tagesscan, heisst der Mechanismus "als Haendler registrieren"
      und **Punkt 9** ist derselbe Zug fuer den groesseren Katalog. Bringt er keine, hat das Ziel
      am 02.10. keinen Weg und der Termin faellt.
      (Urspruenglich) **T2.3** Zahl: Zeilen mit unserem Host im Tagesscan,
      0 auf mindestens 1. Die 94 Dienste mit mindestens 25 Zahlern sind ausnahmslos CDP-Zeilen auf
      38 Hosts. Fuer diese 38 pruefen, ueber welchen Facilitator sie abrechnen und ob der Eintrag
      daran haengt. Ergebnis ist eine Entscheidung, nicht eine Liste: entweder eine Tuer, durch die
      der Loop selbst geht, oder Punkt 9 fuer Matthias (CDP-Schluessel fuer `CP_FACILITATOR_AUTH`).
      2 h.
- [x] **T2.4 Der Weg des ankommenden Agenten ohne Menschen.** Erledigt 23.09., Commit `f2178db`,
      ausgerollt. Den Weg abgegangen: `robots.txt` nennt `llms.txt`, `llms.txt` und
      `/bounties.json` beschreiben den Markt, die Auftraege tragen Preis, Gewinn, Gebuehr, Frist
      und Zahl der Mitbewerber, `/v1/status` die Stufen und den Zuschuss, `/.well-known/x402` die
      Zahlungsbedingungen. Alles JSON oder Klartext, nichts braucht einen Menschen.
      **Die Kette bricht an genau einer Stelle**, und es ist die, die entscheidet, ob ein Agent
      ueberhaupt konkurrieren kann: er signiert eine SIWE-Nachricht, deren Domain `conway.tech`
      ist und nicht dieser Host. `llms.txt` nannte das *"the one detail nobody guesses"* und
      verwies dann auf ein Markdown auf GitHub, also auf Prosa.
      `POST /v1/auth/nonce` gab `{nonce}` heraus, was fuer die Conway-Runtime reicht, weil die den
      Rest fest verdrahtet hat. Jetzt gibt er Nonce, Domain, chainId, Gueltigkeit, naechsten Aufruf
      und Doku-Link heraus, **gelesen aus `siweCfg`, demselben Objekt, gegen das `verifySiwe`
      prueft**. Nur Domain und chainId, weil nur die beiden geprueft werden; ein Test haelt fest,
      dass nichts ueber `statement` und `uri` behauptet wird.
      (Urspruenglich) **T2.4** Zahl: bezahlte Aufrufe fremder
      Wallets, 0 auf 1. Vier KI-Crawler waren am 23.09. da, und `/llms.txt` hat 557 Abrufe von drei
      eigenen Adressen. `/llms.txt`, `/bounties.json` und `/.well-known/x402` muessen zusammen
      einen vollstaendigen Pfad bis zum ersten bezahlten Aufruf ergeben, ohne dass ein Mensch
      dazwischentritt. 1,5 h.

### Ziel 29.10. -- 5.000 USDC fremdes Volumen

- [x] **T3.1 `1c89045` ausrollen.** Erledigt 23.09. um 12:11 UTC, zusammen mit T1.2. Nach vier
      Fehlschlaegen (dreimal Registry, einmal die Vorpruefung aus M10) lief der fuenfte durch.
      Live auf `/jobs`: *"Credits here, not cash: they buy about 177 more answers at the 0.76 ¢ an
      answer this service has averaged so far."*
      (alter Text) Die einzige Zeile auf der Angebotsseite, die nichts kostet.
      Am 23.09. dreimal abgelehnt (Registry), danach einmal an einer falschen Vorpruefung. 0,5 h.
- [x] **T3.2 Aus Punkt 4 eine Entscheidung machen statt einer Besorgung.** Erledigt 23.09.
      Steht in `.scratch/gtm/stripe-entscheidung.md` und nicht hier, weil es Matthias'
      Geschaeftsangelegenheiten sind und dieses Repo oeffentlich ist. Drei Fragen, je **eine**
      Antwort, plus die vierte, die in keiner Liste stand. Kurzform: Rechtsform, weil zehn Prozent
      Provision auf fremdes Volumen eine gewerbliche Taetigkeit sind, sobald der erste fremde
      Kaeufer vergibt; Umsatzsteuer, wo die Grenzbetraege ausdruecklich als **zu pruefen** und
      nicht als Tatsache stehen; und wer Vertragspartner des Kaeufers ist, wenn ein Agent liefert,
      was zugleich entscheidet, ob Stripe uns als Marktplatz oder als Verkaeufer fuehrt. Die
      vierte: **ein Kaeufer mit Karte hat keine Wallet und kann keine SIWE-Nachricht signieren,
      hat also heute keinen Weg zu einem Schluessel.** Ein Konto ohne Identitaetsweg oeffnet
      nichts. Am Ende eine Tabelle, was ein Ja je Frage binnen eines Zyklus ausloest.
      (Urspruenglich) **T3.2** Eine halbe Seite mit
      den drei Fragen, die das Stripe-Konto wirklich blockieren: Rechtsform, weil der Dienst privat
      ohne Gewerbe laeuft und 10 Prozent Provision auf fremdes Volumen gewerblich sind;
      Steuerstatus samt Kleinunternehmerregelung; und wer Vertragspartner des Kaeufers ist, wenn
      ein Agent liefert. Je Frage **eine** Antwortoption, nicht drei. 1 h.
- [x] **T3.3 erster Schritt erledigt, und er war das ganze Nadeloehr.** Am 23.09. als **Goal 16**
      gebaut (GOAL.md nennt `src/auth/**`, wie `loop-constraints.md` es verlangt). Ein Mensch
      stellt einen Auftrag ein, ohne Wallet, ohne Signatur, ohne USDC: `mintKeylessIdentity` macht
      eine Kennung (`key:` plus 40 Hex, ausdruecklich keine Ethereum-Adresse), `POST /start` legt
      den Auftrag an, der Topf zahlt ihn, und der Schluessel ist das ganze Konto.
      **Gegen Produktion abgegangen, nicht behauptet:** `ops/keyless-walk.sh`, sieben Schritte ueber
      HTTP, erster Lauf 15:00 UTC, alle sieben gruen. Damit fallen Done-Kriterium 1 und 3 von
      Goal 16 und der Satz, der 43 von 43 Besuchern die Tuer zugehalten hat ("They do need a
      wallet, in the sense of a key pair on your own machine").
      Offen bleibt von T3.3: der Kartenweg selbst hinter `CP_CHECKOUT` (Betrag reservieren,
      Vergabe und Provision buchen, Storno, Rechnung, gegen einen Fake-Provider), und der haengt
      weiter an Punkt 4.
      (Urspruenglich) **T3.3 Den Kartenweg bis an die gesperrte Grenze bauen, hinter `CP_CHECKOUT`.** Alles
      ausserhalb von `src/payments/**` und `src/auth/**`: Betrag reservieren, Vergabe und Provision
      buchen, Storno, Rechnung, gegen einen Fake-Provider getestet. Dabei faellt eine Frage an, die
      heute in keiner Liste steht: `createApiKey` verlangt eine Session, die nur `verifySiwe`
      schreibt, ein Kaeufer ohne Wallet braucht also eine Identitaet ohne SIWE, und die liegt im
      gesperrten Pfad. Erster Schritt ist genau diese Ergaenzung zu Punkt 4. 4 h, erst nach T3.2.

### Ziel 31.12. -- 250.000 USDC im Monat

- [ ] **T4.2 Den Tagesscan als Ware behandeln, nicht als Seite.** Wir haben genau ein Gut, das
      sonst niemand hat: den taeglichen Abzug beider x402-Verzeichnisse mit Nachfragezahlen. Als
      Zeile in einer Issue-Antwort ("dein Dienst, eine zahlende Wallet, zwei Aufrufe in 30 Tagen")
      trifft er einen Leser; als neue Seite haette er keinen, weil ausser der Startseite und
      `/fix` jede Seite dieses Dienstes null Browser-Besuche hat. 2 h, ausdruecklich nicht vor dem
      02.10.

## Geht das aus? Vier ehrliche Zeilen

**26.09.: nein, nicht durch den Loop.** Fuenf fremde Einzahler in 72 Stunden sind elf Prozent aller
44 Wallets, die der gemessene Conway-Markt insgesamt hat. T1.1 bis T1.4 machen den Weg fertig und
senken den Einstieg, sie erzeugen keinen Zulauf. Es haengt an Punkt 1.

**02.10.: zur Haelfte.** Eine Zeile im Tagesscan ist erreichbar und haengt an Punkt 8 oder an dem,
was T2.3 findet. Die zweite Haelfte faellt: 1.000 bezahlte Aufrufe von 25 fremden Wallets schaffen
13 bis 14 von rund 15.700 gelisteten Diensten in dreissig Tagen, und wir haetten neun.
**Der Termin gehoert gestrichen, die Richtung bleibt.**

**29.10.: nein, solange Punkt 4 offen ist.** 5.000 USDC sind bei 120 USDC je Auftrag rund 42 fremde
Kaeufer in 36 Tagen, ausgehend von null, und die Identitaetsfrage aus T3.3 liegt im gesperrten
Pfad. Jede Hochrechnung darueber ist Arithmetik ueber der leeren Menge, solange `foreign_gmv_30d`
nicht ein einziges Mal groesser als null war.

**31.12.: nein, und nicht knapp.** Erreichbar bleibt der zweite Teil, Platz zehn bei x402 bei grob
51.000 Aufrufen im Monat, und der haengt vollstaendig am Katalogeintrag vom 02.10.

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

## Wochenplan 24.09. bis 30.09.

Abgeleitet am 23.09. vom Workflow `nachfrage-finden`: 23 Agenten, sechs Winkel auf die Frage, wo
die Nachfrageseite sich aufhaelt, ein Skeptiker auf jede Population. Er ersetzt keinen der vier
Termine. Er misst die Vorstufe, die bisher fehlt: **ob ein Mensch, der Texte braucht, freiwillig
etwas in ein Feld tippt.**

**Die eine Zahl der Woche: fremde Laeufe mit eigenem Text.** Ein Lauf zaehlt, wenn er ueber das
Formular kommt, seine Wortzahl auf keines unserer Beispiele passt und die Adresse keine von uns
ist. Heute 0, Ziel bis Mittwochabend 10. Nicht `foreign_gmv_30d`, weil diese Woche strukturell
kein Umsatz entstehen kann, solange Punkt 4 offen ist. Nicht Besuche, weil 16 der 46 Adressen vom
22./23.09. eine Abruf-Flotte waren und ein Crawler keine 40 Woerter tippt. Das Einfuegen ist die
erste Handlung im Trichter, die Aufwand kostet, die keine Maschine faelscht und die weder Wallet
noch Karte noch Stripe voraussetzt.

**Das Gate vom 23.09. steht**, und zwar vollstaendig: der Check liest Deutsch (`3973d92` und
`f8f7a77`), antwortet auf Deutsch, die Seite traegt `lang="de"`, der Wallet-Satz ist weg, der
Knopf "Als Auftrag einstellen" steht darunter und der Weg dahinter ist gegen Produktion
abgegangen. Das Gate ist **vollstaendig abgearbeitet**, und an einer Stelle anders als vorgeschlagen.

Der Plan wollte einen inhaltsfreien Zaehler in der Datenbank. Der ist nicht gebaut, weil er nicht
noetig ist: Caddy schreibt die URI ohnehin ins Zugriffslog und `deploy/Caddyfile` loescht daraus
genau `brief`. Also faehrt alles, was die Zaehlung braucht, in der Adresse mit. Das Textfeld traegt
ein verstecktes `via=form`, die Beispiel-Links `src=ex1`/`ex2`, ein Kanal seinen eigenen `src`.
`ops/first-typing.sh` zaehlt daraus getippte Laeufe, Personen, Wiederkommer, Beispiel-Klicks und
Karten-Scans, mit `--selftest` als Gegenprobe. **Damit bleibt der Satz "nichts gespeichert"
wortgleich wahr,** und dieser Satz ist mehr wert als die Zahl: er ist der Grund, warum jemand
echte Arbeit einfuegt.

`/b?src=nit` ist gebaut und gegen Produktion geprueft (302 auf `/check?src=nit`, deutsche Seite
mit Textfeld, `via` und `src` stehen drin). Die A6-Karte liegt in `ops/nit-card.html`; sie erzeugt
den QR-Code im Browser mit einer bekannten Bibliothek, **nicht mit einem selbstgeschriebenen
Encoder**, weil ein QR-Code das eine Stueck auf der Karte ist, das sich nicht durch Hinsehen
pruefen laesst, und ein Encoder, den hier niemand nachrechnen kann, schlechter ist als kein
QR-Code. Die Karte sagt auf sich selbst, dass sie vor dem Drucken einmal gescannt werden muss.

| Tag | Was gemessen wird | Heute | Ziel |
|---|---|---|---|
| Do 24.09. | eigene Laeufe aus 20 Gespraechen am NIT, dazu Aufrufe von `/b?src=nit` | 0 | 3 |
| Fr 25.09. | Antworten, die Betrag und Menge nennen | 0 | 3 |
| Sa 26.09. | 50 bezahlte deutsche Textauftraege durch `reviewBrief`: wie viele falschen Befunde | unbekannt | hoechstens 2 |
| So 27.09. | Abbruchstellen `/check` bis offener Auftrag ohne Wallet | **0, vorgezogen erledigt** | 0 |
| Mo 28.09. | eigene Laeufe aus 10 persoenlichen Nachrichten | 0 | 4 |
| Di 29.09. | Antworten von IVD Nord und VDIV Nord | 0 | 1 |
| Mi 30.09. | Menschen, die binnen 72 Stunden **ungebeten** einen zweiten Lauf starten | 0 | 2 |

**Der ehrliche Fruehindikator liegt am Samstagmittag, nicht am Mittwoch,** und er hat zwei
Auspraegungen, die man nicht verwechseln darf. Steht in der Strichliste "20 Gespraeche, 0
Einfuegungen", traegt der Haken nicht. Steht dort "4 Gespraeche", hat der Kanal nie stattgefunden
und die Woche hat gar nichts gemessen. Sichtbar ist das schon am Donnerstag um 12:30.

**Wenn am Mittwoch 0 von 20 herauskommt, ist es nicht der Ort.** Naeher als acht Stunden im selben
Saal kommt kein Kanal an diese Leute heran. Dann ist der Haken falsch und nicht die Bevoelkerung,
und der naechste Zug ist der Haken: weg vom Auftrag, der schon abgeschickt ist, hin zum Text, der
gerade rausgeht, mit `src/check/fabrication.ts` als Mechanismus.

## Was auf Matthias wartet

Sieben Saetze, und alles andere laeuft. Stand 23.09., nichts davon darf der Loop selbst tun.

1. **"Antworten raus"** -- neun gepruefte Issue-Antworten, `ops/post-the-answers.py --send 3`.
   Der einzige Kanal, der je einen Leser gebracht hat.
2. **"Caddyfile ja"** -- `git apply ops/caddyfile-pending.patch`, von Caddy validiert. Danach hat
   `/check` ein Textfeld, und die Adresszeile speichert keine Entwuerfe mehr.
3. **"Name weg"** -- `handsel.dev` ist ein laufender Wettbewerber mit fast gleicher Beschreibung.
4. **Stripe-Konto** -- damit ein Kaeufer ohne Wallet zahlen kann. Bedingung fuer jedes Umsatzziel.
   **Es ist keine Besorgung, sondern drei Entscheidungen plus eine Sperre**, aufgeschrieben in
   `.scratch/gtm/stripe-entscheidung.md`: Rechtsform, Umsatzsteuer, Vertragspartner, und der
   gesperrte Pfad fuer eine Identitaet ohne Ethereum-Signatur.
5. **Search Console und Bing** -- sein Login, den DNS-Eintrag setzt der Loop selbst.
6. **Eine Zahl fuer Anzeigen** -- Empfehlung: 20 Euro am Tag fuer zwei Wochen.
7. **Tailscale neu anmelden** -- der code-host nimmt sonst keine Auftraege.
9. **Norddeutscher Immobilientag, Donnerstag 24.09., Empire Riverside: Karte ja oder nein.**
   Zwei Minuten, und es ist heute faellig. 300 Hausverwalter, acht Stunden, "KI-Use-Cases in der
   Hausverwaltung" im Programm, in seiner Stadt. Der Preis steht auf der Anmeldeseite und der Loop
   kennt ihn nicht, deshalb ist es seine Frage. **Ohne diesen Tag haengen 10 von 10 Laeufen am
   Adressbuch**, und ein Adressbuch ist nach einmal Fragen verbraucht. Ersatz am selben Tag, falls
   nein: eine Mail an den VDIV Nord zum Prompting-Seminar (Do 14 bis 16 Uhr, online), Zahl dann
   Antworten statt Laeufe.
8. **Ein Konto bei `merchant.payai.network`** -- nach der Untersuchung vom 23.09. die einzige noch
   offene Tuer in den x402-Katalog, und damit die Bedingung fuer das Ziel am 02.10. Siehe T2.2.

## Wie Teilziele entstehen

Nicht aus dem Bauch und nicht aus dem Backlog. Ein Workflow leitet sie aus den Zielen ab, mit
mehreren unabhaengigen Winkeln und einem Skeptiker pro Vorschlag, der die eine Frage stellt:
bewegt das die genannte Zahl, oder ist es wieder Reparatur. Der Lauf vom 23.09. heisst
`ziele-zu-teilzielen`. Neu abgeleitet wird, wenn ein Ziel erreicht ist, wenn ein Termin verstreicht,
oder wenn Matthias eine der sieben Sperren loest und damit ein Kanal aufgeht.
