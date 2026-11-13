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

## Konto /h/{code}

Der Schritt Konto derselben Handy-Seite (goals/konto/03): Nach der richtigen Zahl legt der Mensch per Passkey sein Konto an und
erlaubt die tägliche Abbuchung. Zwei Zustände, je zwei Bilder:

| Zustand | 390 | 1440 | Quelle |
|---|---|---|---|
| `passkey` | `konto-passkey-390.png` | `konto-passkey-1440.png` | `src/konto-passkey.html` |
| `fehlgeschlagen` | `konto-fehlgeschlagen-390.png` | `konto-fehlgeschlagen-1440.png` | `src/konto-fehlgeschlagen.html` |

`passkey` sagt in der Überschrift, was beim Tippen passiert, darunter in einer Zeile, was wir abbuchen dürfen (Tageslimit und für
welchen Automaton), zwei Haken dazu, wer das Konto öffnen kann, und einen Knopf über die ganze Breite; der Block
`data-soll="passkey"` endet im ersten Bildschirm (390 x 844 und 1440 x 900). `fehlgeschlagen` zeigt den abgebrochenen Passkey und
schickt zurück ins Terminal für einen neuen Code; Anbieter nicht erreichbar und abgelehnte Erlaubnis tauschen nur die Zeile unter
der Überschrift. Die Werte im Bild sind erfunden (`Atlas`, 5.00 USD), keine Kundendaten. `freigabe`, `erledigt` und `ungueltig`
bleiben die Bilder aus dem Abschnitt Handoff.

Bauen und prüfen, ohne Netz, mit dem Chromium aus `~/.cache/ms-playwright/`:

```
node ops/soll-konto.mjs                          # Bilder neu schreiben
node ops/soll-konto.mjs --pruefen                # neu rendern und vergleichen, Exit 1 bei jedem Mangel
node ops/soll-konto.mjs --pruefen --source <dir> # dieselbe Prüfung gegen die zwei Quellen konto-<zustand>.html in <dir>
```

Mängel wie beim Handoff, dazu: Block `passkey` fehlt oder endet unter dem ersten Bildschirm, eine fremde Adresse in einem Attribut
(Link, Formularziel, Stil), auch wenn nichts sie lädt, und ein Wort, das der Leser erst übersetzen muss (`handoff`, `token`,
`wallet`, `smart`, `permission`, `sepolia`, `turnkey`, `erc`), im sichtbaren Text; „passkey“ ist ein bekanntes Wort und steht. Die
Auswertung ist `assessKonto` in `ops/soll-assess.mjs`, geprüft von `test/soll-konto.test.ts` ohne Browser.

Die Quellen nutzen die Klassen der Startseite (die Haken-Liste feats, cta um den Knopf) und den Baustein grant aus dem Abschnitt
Handoff als Abstand um die Haken-Liste. Neu, im zweiten `<style>` der Quellen und später der Seite:

- `.wide`: der Knopf Passkey über die ganze Spalte und 56 px hoch, weil er der einzige Schritt der Seite ist, ein Daumen ihn auf
  dem Handy sofort treffen soll und der Knopf der Startseite sonst nur so breit wie sein Text ist.
- `.balanced`: bricht die Überschrift in zwei gleich lange Zeilen (`text-wrap: balance`), weil sonst bei 1440 „passkey“ und bei 390
  „a passkey“ allein in der zweiten Zeile stehen; als Klasse am Block um die Überschrift, weil die Überschrift selbst ein nacktes
  `<h1>` bleibt (Punkt 4 ändert sie zur Gegenprobe).
