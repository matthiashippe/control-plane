# Annahmen seite

- 2026-11-12 (seite 01): Der Umzug oben ist englisch, weil die Leser aus Conway-Issues englisch schreiben. Der deutsche erste
  Bildschirm (`germanFirstScreen` in `src/app.ts`, bei deutschem `Accept-Language`) gehört nicht zu diesem Goal; die Quelle ist der
  Stand für einen englischen Browser.
- 2026-11-12 (seite 01): Die Quelle stammt aus `createApp` mit leerer Datenbank (`app.request("/")`, kein Port). Markt und Fußzeile
  zeigen deshalb den leeren Stand („Nothing is open right now“, „nobody has paid yet“). Das ist Platzhalter im Bild, keine Messung;
  seite 02 rendert sie live.
- 2026-11-12 (seite 01): Weggelassen, weil sie nichts zeigen oder eine Anfrage auslösen: HTML-Kommentare, die Zählpixel `/px/*.png`,
  beide Skripte (JSON-LD und Statusabfrage), `<noscript>`, der Canonical-Link. Die Statuszeile zeigt den Normalfall „online“.
- 2026-11-12 (seite 01): Die Konfiguration steht auf zwei Zeilen (`{ "conwayApiUrl":` und die Adresse), weil sie bei 390 px sonst auf
  drei Zeilen bricht und der Umzug unter den ersten Bildschirm rutscht. Das JSON bleibt gültig.
- 2026-11-12 (seite 01): Chromium läuft mit `--no-sandbox` wie unter Playwright, weil der code-host keine User-Namespaces erlaubt; geladen
  wird nur die eigene Datei, jede andere Anfrage scheitert und zählt als Mangel.
