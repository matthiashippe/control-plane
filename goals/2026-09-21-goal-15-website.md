# Goal 15: Eine Website, keine Textdatei

## Warum es dieses Goal erst heute gibt, und das ist der Befund

Matthias am 20.09.2026: "wir brauchen einen fancy name einen fancy website maximal modern wir
bruachen maximal insane GTM und integrationsstrategie und eine super krasse positionierung / dsa
alles bitte mit in die goals aufnehmen und nict halbgar sondern komplett insane verfolgen".

Drei der vier wurden Goals. Der Name wurde Goal 10 und heisst Handsel. GTM wurde Goal 13 mit
Kill-Kriterium. Die Positionierung steht als Satz an jeder Stelle, an der jemand von uns erfaehrt.
**Die Website wurde nie aufgeschrieben.** Ein `grep` ueber `goals/*.md` nach website, fancy oder
modern findet am 21.09. null Treffer.

Die Folge ist keine Geschmacksfrage. Der Loop entscheidet jeden Zyklus, was am meisten bringt, und
er entscheidet aus dem, was aufgeschrieben ist. Zwanzig Zyklen lang sind Korrektheit, Messung und
Pruefung gewonnen, weil sie im Journey-Buch und im Backlog standen. Die Website stand nirgends,
also hat sie nie gewonnen. Ein Ziel, das nicht notiert ist, existiert fuer diesen Loop nicht.

Matthias am 21.09., nach einem Blick auf die ausgelieferte Seite: "das ist doch keine website das
ist ein text block. schau dir AI startups bei y cominator an."

Er hat recht. Was live steht, ist ein gut geschriebenes README als HTML: eine Spalte, Fliesstext,
Monospace-Tabellen, keine Hierarchie ausser Ueberschriftengroessen, nichts, das in zehn Sekunden
sagt, was das ist und was man tun soll.

## Was die Seite leisten muss

Zielgruppen sind USA und Dubai, und die Seite hat drei Leser mit drei verschiedenen Fragen. Das
Journey-Buch kennt sie als A1, B2 und A3:

1. **Der Kaeufer, der nie davon gehoert hat.** Frage: was ist das, was kostet es mich, was mache
   ich zuerst. Er entscheidet in zehn Sekunden, ob er weiterliest.
2. **Der Agent-Betreiber.** Frage: kann mein Agent hier Geld verdienen, und was muss ich dafuer
   tun. Er will eine Zeile Konfiguration sehen, nicht einen Aufsatz.
3. **Der Zuschauer.** Frage: ist das echt. Er will den Markt sehen, nicht die Behauptung, dass es
   einen gibt.

Alle drei bekommen heute denselben Fliesstext in derselben Reihenfolge.

## Harte Grenzen, die den Entwurf bestimmen

- **Kein neues JavaScript.** Die CSP im Caddyfile nagelt `script-src` auf den Hash des einen
  vorhandenen Inline-Skripts, und `deploy/**` wird ohne Matthias nicht angefasst. Ein Byte mehr in
  diesem Skript nimmt beim naechsten Deploy die Sicherheitsheader mit. `test/market-page.test.ts`
  vergleicht das ausgelieferte Skript deshalb Byte fuer Byte mit dem auf der Platte.
- **Keine Webfonts.** `default-src 'none'` ohne `font-src` heisst Systemschriften.
- **`style-src 'unsafe-inline'` ist offen.** CSS ist unbeschraenkt: Layout, Typografie,
  Farbverlaeufe, Animationen, Rasterlayouts.
- **`img-src 'self' data:`**: SVG inline oder als data-URI, keine fremden Bilder.
- **Serverseitig gerendert.** Was sich bewegt, kommt aus der Datenbank in den Koerper, so wie
  `src/public/market.ts` es seit dem 21.09. macht.

Das ist keine Einschraenkung, die eine moderne Seite verhindert. Sie verhindert eine Seite, die
ihre Modernitaet aus Skripten bezieht.

## Fertig heisst

- [ ] Ein erster Bildschirm, der in zehn Sekunden sagt, was das ist, was es kostet und was man
      zuerst tut, ohne zu scrollen.
- [ ] Der lebende Markt sichtbar im oberen Drittel, nicht auf halber Hoehe: offene Auftraege mit
      Preis und Zahl der Mitbewerber, ausgezahlte mit Gewinner.
- [ ] Drei getrennte Wege statt einer Spalte, je einer fuer Kaeufer, Agent-Betreiber und
      Zuschauer, jeder mit genau einem naechsten Schritt.
- [ ] Auf einem Telefon lesbar und benutzbar.
- [ ] Die Beweise bleiben, aber unter den Wegen: On-Chain-Beleg, Verzeichniszahlen, ehrliche
      Grenzen, Impressum.
- [ ] CSP-Hash unveraendert, Rauchtest gruen, kein neues Skript.
- [ ] Alles, was heute an Substanz auf der Seite steht, steht danach immer noch irgendwo. Kuerzen
      ja, weglassen nein: die Ehrlichkeit ist die Positionierung.

## Was ausdruecklich nicht dazugehoert

Keine erfundenen Logos von Kunden, die es nicht gibt, keine Zahlen ohne Beleg, keine
Testimonials. Der Markt hat null fremde Kaeufer, und die Seite darf das nicht verstecken; sie
muss nur aufhoeren, es in einem Textblock zu vergraben.
