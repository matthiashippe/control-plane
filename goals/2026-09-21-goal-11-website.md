# Goal 11: Eine Website, keine Textdatei

## Warum dieses Blatt erst heute entstand, und was daran der Befund ist

Matthias am 20.09.2026: "wir brauchen einen fancy name einen fancy website maximal modern wir
bruachen maximal insane GTM und integrationsstrategie und eine super krasse positionierung / dsa
alles bitte mit in die goals aufnehmen und nict halbgar sondern komplett insane verfolgen".

**Am 21.09. habe ich dazu zuerst etwas Falsches behauptet und korrigiere es hier.** Ich schrieb,
die Website sei nie aufgeschrieben worden, weil ein `grep` ueber `goals/*.md` nach website, fancy
oder modern null Treffer findet. Das Register der Ziele ist aber nicht dieses Verzeichnis, sondern
`STATE.md`, und dort steht Goal 11, Die Website, seit dem 20.09. mit vier Abnahmekriterien.

Falsch war die Diagnose, richtig bleibt der Befund dahinter. Goal 11 verlangt, dass die Startseite
den Markt fuehrt und nicht die Abrechnungsschicht, und genau das hat sie getan. Was in keinem
Kriterium stand, war Matthias' eigentliches Wort: **maximal modern**. Eine Seite kann jedes
einzelne Kriterium erfuellen und trotzdem ein Textblock sein, und genau das ist passiert. Der Loop
prueft gegen das, was notiert ist, also erfuellte er die Liste und verfehlte den Auftrag.

Dieses Blatt ergaenzt Goal 11 um das, was gefehlt hat: nicht die Reihenfolge der Abschnitte,
sondern die Gestalt.

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

- [x] Ein erster Bildschirm, der in zehn Sekunden sagt, was das ist, was es kostet und was man
      zuerst tut, ohne zu scrollen.
- [x] Der lebende Markt sichtbar im oberen Drittel, nicht auf halber Hoehe: offene Auftraege mit
      Preis und Zahl der Mitbewerber, ausgezahlte mit Gewinner.
- [x] Drei getrennte Wege statt einer Spalte, je einer fuer Kaeufer, Agent-Betreiber und
      Zuschauer, jeder mit genau einem naechsten Schritt.
- [x] Auf einem Telefon lesbar und benutzbar.
- [x] Die Beweise bleiben, aber unter den Wegen: On-Chain-Beleg, Verzeichniszahlen, ehrliche
      Grenzen, Impressum.
- [x] CSP-Hash unveraendert, Rauchtest gruen, kein neues Skript.
- [x] Alles, was heute an Substanz auf der Seite steht, steht danach immer noch irgendwo. Kuerzen
      ja, weglassen nein: die Ehrlichkeit ist die Positionierung.

## Was ausdruecklich nicht dazugehoert

Keine erfundenen Logos von Kunden, die es nicht gibt, keine Zahlen ohne Beleg, keine
Testimonials. Der Markt hat null fremde Kaeufer, und die Seite darf das nicht verstecken; sie
muss nur aufhoeren, es in einem Textblock zu vergraben.

## Abgenommen am 21.09.2026

Alle sieben Punkte erfuellt, jeder einzeln nachgesehen statt abgehakt. Auf 1492 und auf 414 Pixel
angesehen, im dunklen und im hellen Modus, das Inline-Skript byteweise identisch, Rauchtest
inklusive CSP-Hash gruen, 393 Tests.

Der siebte Punkt, "kuerzen ja, weglassen nein", hat sich selbst durchgesetzt: sieben Tests wurden
beim Umbau rot, und jeder zeigte auf Substanz, die ich verloren hatte. Preisabschnitt,
Abschaltklausel, der Schwellenbonus von 501 Cent, der 501 fuer Sandboxes, der Verweis auf den
freien Weg ohne uns, die Abnahmezeile des Produktionslaufs, die Verzeichniszahlen. Ohne diese
Tests waere die Seite huebscher und aermer geworden.

Dazu ein Vorschaubild, damit ein Link auf uns irgendwo etwas zeigt, und ein Lasttest, der zuerst
meinen eigenen Laptop gemessen hat: richtig gemessen traegt die Seite 458 Anfragen je Sekunde
ueber TLS ohne einen Fehler.
