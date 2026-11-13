# SOLL-Bilder

Hier liegen die SOLL-Bilder der Website (`LOOP.md`, Fläche nur nach SOLL-Bild). Ein Goal, das eine Fläche baut, baut 1:1 nach dem Bild
derselben Fläche.

## Startseite `/`

| Breite | Bild | erster Bildschirm |
|---|---|---|
| 390 | `startseite-390.png` | 390 x 844 |
| 1440 | `startseite-1440.png` | 1440 x 900 |

Quelle ist `src/startseite.html`: der gerenderte Stand von `/` (englisch, `CP_PUBLIC_URL=https://postyourprice.com`, leere
Datenbank), ohne Kommentare, Zählpixel und Skripte, mit dem Umzug für Conway-Betreiber als erstem Block (`data-soll="umzug"`). Der
Block `#agents` vom Seitenende ist dorthin gewandert. Markt und Fußzeile zeigen den leeren Stand der Renderer, keine Zahl aus der
Produktion; seite 02 füllt sie mit den echten Renderern.

Bauen und prüfen, ohne Netz, mit dem Chromium aus `~/.cache/ms-playwright/`:

```
node ops/soll.mjs            # Bilder neu schreiben
node ops/soll.mjs --pruefen  # neu rendern und vergleichen, Exit 1 bei jedem Mangel
```

Mängel: ein einziger Pixel weicht vom neuen Render ab (über der Kanaltoleranz von 8), waagrechter Überlauf (auch abgeschnittener Inhalt), Gedankenstrich im
sichtbaren Text, Anfrage an eine fremde Adresse, Umzug endet unter dem ersten Bildschirm. Die Auswertung steht in
`ops/soll-assess.mjs` und wird von `test/soll.test.ts` ohne Browser geprüft.

## Neue Bausteine

Keine. Der Umzug nutzt nur Klassen aus dem `<style>` von `src/public/index.html`: `hero`, `hero-in`, `hero-text`, `pill`,
`live-dot`, `h1-line`, `sub`, `prose`, `cta`, `btn`, `btn-1`, `demo`, `eyebrow`, `code`, `pr`, `fine`.

## Abnahme

Abnahme-Issue: PRO-18819

## Handoff /h/{code}

Die Seite, die ein Mensch auf dem Handy öffnet, wenn sein Terminal einen Schritt freigeben lassen will (goals/konto/02). Eine Fläche
in drei Zuständen, je zwei Bilder:

| Zustand | 390 | 1440 | Quelle |
|---|---|---|---|
| `freigabe` | `handoff-freigabe-390.png` | `handoff-freigabe-1440.png` | `src/handoff-freigabe.html` |
| `erledigt` | `handoff-erledigt-390.png` | `handoff-erledigt-1440.png` | `src/handoff-erledigt.html` |
| `ungueltig` | `handoff-ungueltig-390.png` | `handoff-ungueltig-1440.png` | `src/handoff-ungueltig.html` |

`freigabe` zeigt, was freigegeben wird (Name des Automatons, Tageslimit, erste Zahlung), und drei Zahlen als Knöpfe in einem
Formular ohne Skript; der Block `data-soll="freigabe"` endet im ersten Bildschirm (390 x 844 und 1440 x 900). `erledigt` schickt
zurück ins Terminal. `ungueltig` zeigt den abgelaufenen Code; schon benutzt, falsche Zahl und unbekannt tauschen nur die Zeile unter
der Überschrift. Die Werte im Bild sind erfunden (`Atlas`, 5.00 USD), keine Kundendaten.

Bauen und prüfen, ohne Netz, mit dem Chromium aus `~/.cache/ms-playwright/`:

```
node ops/soll-handoff.mjs                          # Bilder neu schreiben
node ops/soll-handoff.mjs --pruefen                # neu rendern und vergleichen, Exit 1 bei jedem Mangel
node ops/soll-handoff.mjs --pruefen --source <dir> # dieselbe Prüfung gegen die drei Quellen in <dir>
```

Mängel wie bei der Startseite, dazu: Block `freigabe` endet unter dem ersten Bildschirm, und ein Wort, das der Leser erst übersetzen
muss (`handoff`, `phishing`, `token`, `SSE`), steht im sichtbaren Text. Die Auswertung ist `assessHandoff` in `ops/soll-assess.mjs`,
geprüft von `test/soll-handoff.test.ts` ohne Browser.

Neue Bausteine, im zweiten `<style>` der Quellen und später der Seite, weil `src/public/index.html` sich in diesem Goal nicht ändert:

- `.grant`: Abstand um das Feld mit Tageslimit und erster Zahlung (`.stats`), weil `.stats` selbst keinen Abstand hat und die
  Startseite es nur in Abschnitten mit eigenem Abstand nutzt.
- `.choices`: die drei Zahlen als gleich große Knöpfe in einer Reihe, 76 px hoch, Ziffern in Tabellenbreite, weil ein Daumen sie
  treffen muss und `.btn` auf einem `<button>` sonst den Hintergrund des Browsers trägt.

Abnahme-Issue handoff: PRO-19925
