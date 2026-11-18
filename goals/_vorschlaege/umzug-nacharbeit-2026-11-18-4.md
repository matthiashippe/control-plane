Schwere: 2
Goal: umzug 03
Befund: `ops/soll-og.mjs` kopiert aus `ops/soll-konto.mjs`, `ops/soll-limit.mjs` und `ops/soll-money.mjs` das Abfangen fremder Anfragen und die Suche nach fremden Adressen in Attributen (`URLS`, `far`, `named`) ein weiteres Mal, statt sie aus einem gemeinsamen Modul zu holen.
Beleg: `git grep -c -F 'const URLS = new Set(["href", "src", "action", "formaction", "poster", "data", "background", "ping", "xlink:href", "cite"]);' origin/dev -- ops/` -> `ops/soll-konto.mjs:1 ops/soll-limit.mjs:1 ops/soll-money.mjs:1 ops/soll-og.mjs:1` | ops/soll-og.mjs:48 bis :58 und :84 bis :93
Empfehlung: Abfangen und Attributsuche als Funktionen in `ops/browser.mjs` oder `ops/soll-assess.mjs` legen (etwa `watchForeign(browser, sessionId, send)` und einen Ausdruck `FOREIGN_ATTRIBUTES_JS`), die alle SOLL-Werkzeuge nutzen; verwandt mit konto-nacharbeit-2026-11-17-3 (Browser-Treiber), aber eine andere Stelle.
MVP: Schönheit
