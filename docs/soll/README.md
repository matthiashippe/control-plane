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
