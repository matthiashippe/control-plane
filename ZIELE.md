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

## Wie Teilziele entstehen

Nicht aus dem Bauch und nicht aus dem Backlog. Ein Workflow leitet sie aus den Zielen ab, mit
mehreren unabhaengigen Winkeln und einem Skeptiker pro Vorschlag, der die eine Frage stellt:
bewegt das die genannte Zahl, oder ist es wieder Reparatur. Der Lauf vom 23.09. heisst
`ziele-zu-teilzielen`. Neu abgeleitet wird, wenn ein Ziel erreicht ist, wenn ein Termin verstreicht,
oder wenn Matthias eine der sieben Sperren loest und damit ein Kanal aufgeht.
