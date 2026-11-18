Schwere: 2
Goal: konto 05
Befund: `renderAt` in `ops/soll-money.mjs` ist eine wörtliche Kopie der 71 Zeilen von `renderAt` in `ops/soll-limit.mjs`; konto 08 ließ `renderAt` je Werkzeug mit der Begründung stehen, es unterscheide sich je Fläche, was für diese beiden nicht zutrifft.
Beleg: `for f in soll-limit soll-money; do git show origin/dev:ops/$f.mjs | awk '/^async function renderAt\(/,/^}/' | md5sum; done` -> zweimal `1a34ec8f95cf73fc676d7bc303d0cb9b` | ops/soll-money.mjs:54, ops/soll-limit.mjs:43, goals/konto/08-ein-browser-treiber-fuer-alle-soll-werkzeuge.md:70
Empfehlung: `renderAt(browser, width, url, block)` einmal nach `ops/browser.mjs` (oder `ops/soll-assess.mjs`) legen und aus `ops/soll-limit.mjs` und `ops/soll-money.mjs` importieren; `node ops/soll-limit.mjs --check` und `node ops/soll-money.mjs --check` bleiben bei 0 Mängeln.
MVP: Schönheit
Verworfen: MVP: Schönheit ohne belegten Fehler; die Kopie ändert kein Verhalten, beide Werkzeuge prüfen mit `--check` (2026-11-18)
