Schwere: 2
Goal: wache 01
Befund: Der Knopf „Pay by card“ im Block `#move` steht außerhalb der Marken `<!--CARD-->`, deshalb bleibt er bei eingeschaltetem Notschalter auf der Startseite stehen und springt auf den Anker `#card`, den `stripCardWay` dann entfernt hat (toter Pfad, sichtbar für jeden Besucher).
Beleg: `git show e423d4d:src/public/index.html | grep -n 'href="#card"\|CARD-->'` -> `922: <a class="btn btn-2" href="#card">Pay by card</a>`, `938:<!--CARD-->`, `957:<!--/CARD-->` | src/public/index.html:922
Empfehlung: Den Knopf mit einer eigenen Marke (etwa `<!--CARD-LINK-->`) in `stripCardWay` mit entfernen und in `test/card-way-pages.test.ts` beim Fall „drops the card block of the start page while the breaker is on“ zusätzlich `not.toContain('href="#card"')` prüfen.

Die Goal-Datei sagt in Zeile 13, dass die Startseite den Weg zur Kasse bei Fall (a) ganz weglässt. Der Maker hat die Lücke in goals/wache/ANNAHMEN.md:17 festgehalten, weil der Prüfbefehl von Punkt 3 genau ein Markenpaar verlangt; eine Ausnahme in verifier.md oder loop-constraints.md gibt es dafür nicht.

Übernommen: Glied 3 an den Tech Lead, PRO-28123, als Kritik-Punkt in werbung 01 (PR #397) (2026-11-23)
