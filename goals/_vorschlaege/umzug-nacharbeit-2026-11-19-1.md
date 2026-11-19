Schwere: 1
Goal: umzug 04
Befund: Der Zweig `if (!isOgCardName(card)) throw` in `withCard` ist nie erreichbar, weil beide Aufrufer einen `OgCardName` übergeben (`page()` mit `card: OgCardName = "og.png"` und die Route `/` mit dem Literal `"og.png"`); Wächter und `isOgCardName` verengen nur den zu weit gefassten Parametertyp `card: string`.
Beleg: `git show b8d9341:src/app.ts | sed -n '813,814p;910p;1725p'` -> `withCard = (head: string, card: string)`, `if (!isOgCardName(card)) throw`, `card: OgCardName = "og.png"`, `withCard(indexHtml, "og.png")` | src/app.ts:813
Empfehlung: `withCard(head: string, card: OgCardName)` typisieren, Wächter und `isOgCardName` streichen und den Kommentar über `withCard` anpassen; eine Karte ohne Eintrag fängt dann schon `tsc` in `check` ab.
