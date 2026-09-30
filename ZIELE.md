# Ziele

> Diese Datei steht vor `loop-dauerauftrag.md`. Ein Zyklus fängt hier an, nicht im Backlog.
> Neu geschrieben am 29.09.2026 auf Matthias' Ansage, die Richtung zu drehen: der Käufer ist ein
> Mensch, die Erfahrung ist ein Katalog und ein Gespräch, und geliefert wird von Agentenketten.
> Die Fassung davor steht in `ZIELE-alt-bis-29-09.md` und ist nicht gelöscht, weil ihre Messungen
> die Begründung für diese hier sind.

## Warum die alten Ziele fallen

Sie maßen alle denselben Markt, und dieser Markt ist gemessen winzig. Conways Zahlungs-Endpunkt
hat in dreißig Tagen 430 USDC von 44 Wallets gesehen; 250.000 USDC im Monat wären das 568-fache
davon. Der Satz stand seit dem 23.09. in der alten Datei und wurde nie gezogen:

> Wenn das Geld bis Silvester kommen soll, kann es nicht aus dem x402-Markt kommen, sondern von
> Menschen, die normal bezahlen.

Dazu die zweite Messung, die zehn Tage gebraucht hat: die beiden einzigen zahlenden Fremden sind
Agenten, sie haben Inferenz gekauft und das Auftragsbrett kein einziges Mal geöffnet. Die
Angebotsseite zahlt, die Nachfrageseite ist leer. Und die dritte: 33 von 47 Aufträgen zahlten dem
Gewinner 0,9 Cent, während eine Antwort 0,5 bis 5,8 Cent kostet. Es gab nie einen Grund zu kommen.

## Die vier Ziele

| Bis | Ziel | Die Zahl |
|---|---|---|
| ~~**02.10.**~~ | ~~Ein Mensch kann hier kaufen, ohne Wallet, ohne Signatur, ohne USDC~~ | **erreicht am 30.09.2026, 03:07 UTC**, zwei Tage früher. Katalog, Gespräch und Kartenweg antworten live, alle drei von `ops/ziele.sh` gemessen |
| **10.10.** | Der erste zahlende Mensch, mindestens 11 EUR | `human_orders_paid_30d` ≥ 1 |
| **31.10.** | Zehn zahlende Menschen, 500 EUR im Monat | `human_buyers_30d` ≥ 10, `human_revenue_30d_cents` ≥ 50.000 |
| **31.12.** | 5.000 EUR im Monat, und mindestens ein fremder Agent liefert | `human_revenue_30d_cents` ≥ 500.000, `foreign_submissions_30d` ≥ 1 |

11 EUR ist keine runde Zahl, sondern die gemessene Untergrenze: unter Selbstlieferung liegt der
Break-even einer bezahlten Anzeige bei 11,13 EUR (`ops/anzeigen-rechnung.py`). Alles darunter
verkauft sich nur an Leute, die ohnehin gekommen wären.

## Was am 30.09.2026 erreicht wurde, und was es nicht heißt

Ein Mensch kann seit 03:07 UTC auf postyourprice.com ein Angebot wählen, im Gespräch sagen, was er
braucht, mit Karte bezahlen und drei Fassungen bekommen. Ohne Wallet, ohne Signatur, ohne USDC.
Gemessen, nicht behauptet: `/katalog` nennt drei Preise über 11,13 EUR, `POST /katalog/gespraech`
antwortet auf ein unvollständiges Anliegen mit einer Rückfrage, `POST /katalog/kaufen` antwortet 303
auf eine echte Stripe-Session, und in `deliveries` steht eine Zeile mit drei Fassungen.

**Was es nicht heißt.** Niemand hat gekauft. Die Zahlungen laufen im Testmodus, und `sent_at` ist
null: die Fassungen entstehen und erreichen niemanden, weil es keinen Mailweg gibt. Der Weg ist
gebaut, der Briefkasten fehlt.

## Die drei Versprechen, je Bestellung gemessen

Sie sind der Grund, warum jemand hier kauft statt woanders, also werden sie gemessen und nicht
behauptet:

| Versprechen | Die Zahl | Schwelle |
|---|---|---|
| Schnell | Minuten bis zur ersten Fassung, Median | ≤ 10 |
| Auswahl | Fassungen je Bestellung, Median | ≥ 3 |
| Nachbessern | Anteil Bestellungen mit mindestens einer Runde | ≥ 1 Bestellung |

## Was das heißt, gebaut

Die Reihenfolge ist die Reihenfolge des Käufers, nicht die der Technik:

1. **Katalog.** Was kann ich hier kaufen, was kostet es, was bekomme ich. Preise über 11 EUR.
2. **Gespräch.** Ein Chat, der die Anforderungen aufnimmt, Nachfragen stellt und daraus eine
   Bestellung macht. Kein Formular mit zwanzig Feldern.
3. **Bezahlen ohne Wallet.** Karte. Heute braucht ein Käufer ein Schlüsselpaar, eine
   Ethereum-Signatur und USDC, und das ist die eigentliche Absage an den Menschen.
4. **Liefern.** Drei Fassungen aus drei Modellen über `ops/compete.ts`, und auf der Seite steht,
   dass sie von uns sind, solange sie von uns sind.
5. **Nachbessern.** Steht seit dem 29.09.: Rückmeldung als Text, bis zu vier Runden, der Preis
   steigt dabei nicht.

## Verkäufer oder Marktplatz

Solange wir selbst liefern, sind wir Verkäufer und sagen das auf der Seite. Sobald ein fremder
Agent liefert, sind wir Marktplatz. Das ist die Wahl des Loops und keine Frage an Matthias
(`loop-constraints.md`, 29.09.2026).

## Was auf Matthias wartet

Gemessen von `ops/sperren.sh`, nicht hier aufgezählt. Der Stand steht in dessen Ausgabe, damit
diese Liste nicht wieder veraltet, während niemand nachmisst.

Offen und nur von ihm zu lösen: Stripe (Gewerbe, Steuer, Vertragspartner) und Search Console
plus Bing, sobald Chrome verbunden ist.
