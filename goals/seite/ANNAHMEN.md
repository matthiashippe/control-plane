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
- 2026-11-12 (seite 01, Punkt 6): Der Bildvergleich zählt Pixel statt Anteile, die Grenze ist 0 Pixel über der Kanaltoleranz von 8. Ein
  geänderter Preis bewegt rund 50 Pixel auf einer Seite mit über 2 Millionen, das deckt keine Grenze in Prozent ab. Das Rendern ist
  deterministisch: 12 parallele Läufe bei Load 70 ergaben je 0 px. Wird es auf einem anderen Rechner unruhig, steigt die Grenze auf
  eine kleine feste Zahl und nicht zurück auf Prozent.
- 2026-11-12 (seite 02): Sechs Tests außerhalb der Pfadliste von Punkt 6 hingen am alten Aufbau und widersprechen dem abgenommenen
  Bild: `test/landing-human.test.ts` (Katalog für Menschen und `top.png` vor jedem `.hero`), `test/catalog-page.test.ts` (Link auf
  `/katalog` vor `top.png`), `test/landing-german.test.ts`, `test/og-card.test.ts` und `test/readme.test.ts` (erstes `h1` der Seite
  gleich Überschrift, README und Vorschaukarte). Das Bild gilt, also prüfen sie ihre Regel am neuen Ort: der Umzug als einziger Block
  vor der Person, `top.png` im Umzug, das Versprechen ist das erste `h1` nach dem Umzug. README, `/llms.txt` und die Karte bleiben
  unverändert. Damit ist `check` grün und der erste Prüfbefehl von Punkt 6 nennt genau diese Dateien; Punkt 6 bleibt offen.
- 2026-11-12 (seite 02): `ops/landing-yield.sh` liest die eigenen Adressen nur aus `ops/own-ips.txt` (oder `CP_OWN_IPS`), nicht
  zusätzlich die Live-Adresse aus `ops/own-ips.sh` wie `ops/traffic.sh`. Eigene Läufe tragen keinen Referrer aus Conway-Issues und
  zählen deshalb nicht als Ankunft. Es liest `client_ip` und fällt auf `remote_ip` zurück; ohne `trusted_proxies` sind beide gleich.
- 2026-11-12 (seite 02, Kritik Tech Lead): Entscheidung: Der erste Prüfbefehl von Punkt 6 wird repariert, nicht abgeschwächt, weil er
  mit keinem Bau grün werden konnte. `goals/seite/` war mit `$` verankert und traf weder die Goal-Datei noch `ANNAHMEN.md` noch die
  Verdicts der Linsen, die erst im Abschluss auf den Branch kommen; jetzt `goals/seite/(verdicts/)?[A-Za-z0-9._-]+\.md`. Die fünf Tests
  `test/landing-human.test.ts`, `test/catalog-page.test.ts`, `test/landing-german.test.ts`, `test/og-card.test.ts` und
  `test/readme.test.ts` kommen in die Liste, weil das abgenommene Bild einen eigenen `h1` und `top.png` in den Umzug setzt und diese
  Tests ihre Regel am neuen Ort prüfen (Diff gelesen, kein Fall und keine Assertion weniger). Damit die Erweiterung nicht ungeprüft
  bleibt, sichert Punkt 7 diese fünf Tests wie Punkt 3 die ersten drei. Die Änderung am Vertrag schickt den Goal-PR in die Human
  Inbox; die liegt bei diesem Loop beim Tech Lead, der nach dieser Entscheidung nach `dev` merged.

## Abgelöst durch seite 03 (Maker, 2026-11-16)

- Abgelöst: seite 01 Punkt 1 durch seite 03 Punkt 1, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)
- Abgelöst: seite 01 Punkt 6 durch seite 03 Punkt 1, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)
- Abgelöst: seite 01 Punkt 3 durch seite 03 Punkt 2, Ausgabe dann genau `Exit 1, [ 'umzug', 'inhalt umzug' ]` (Tech Lead, 2026-11-14)
- Abgelöst: seite 02 Punkt 2 durch seite 03 Punkt 1, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)

## seite 03 (Maker, 2026-11-16)

- `ops/soll-limit.mjs` (konto 04) nimmt weiter `--pruefen` und bleibt unverändert, weil Punkt 7 diese Datei nicht zum Ändern zulässt; deshalb bleibt Punkt 6 offen. Der Tech Lead entscheidet nach Vorschlag seite-kritik-2026-11-16-1, ob seite 03 sie mit umbenennt.
- `docs/soll/README.md` nennt für `ops/soll-limit.mjs` weiter `--pruefen`, weil das Werkzeug es so nimmt; mit `--check` würde es die Bilder neu schreiben, statt zu prüfen.
- Die Live-Werkzeuge `ops/soll-live.mjs`, `ops/soll-live-handoff.mjs` und `ops/soll-live-konto.mjs` melden ihren Fortschritt auf stderr, damit stdout nur die Summenzeilen trägt, die Punkt 1 verlangt.
- Abgelöst steht je Goal, Punkt und neuer Ausgabe eine Zeile; mehrere Befehle desselben Punkts mit derselben neuen Ausgabe teilen sie (konto 04 Punkt 2: drei Befehle, konto 03 Punkt 4 und konto 04 Punkt 4: je zwei).
- Entscheidung (Tech Lead, Kritik seite 03, 2026-11-16): `ops/soll-limit.mjs` und `ops/soll-live-limit.mjs` gehören in die Umbenennung, weil konto 04 schon auf dev liegt und Punkt 6 sonst nie kippt; Punkt 7 lässt beide Dateien zu, der neue Punkt 8 prüft das vierte Werkzeug wie Punkt 1 die drei anderen, und Punkt 5 nimmt Abgelöst-Zeilen durch Punkt 8 an. Der Prüfbefehl von Punkt 4 nimmt `$(mktemp -u)` statt `$(mktemp)`, weil der Test eine vorhandene Cache-Datei, auch eine leere, als ausdrücklich genannten Cache liest; gemeint war ein Lauf ohne den Cache des Hosts wie in CI, der Test bleibt unverändert (Vorschläge seite-nacharbeit-2026-11-16-2 und seite-kritik-2026-11-16-1).
- Nach der Kritik (Zyklus 3) nimmt `ops/soll-limit.mjs` wie die drei anderen Werkzeuge `--check` und lehnt jedes andere Argument vor dem Rendern ab; die beiden Zeilen oben zu `ops/soll-limit.mjs` und `docs/soll/README.md` gelten damit nicht mehr, und `ops/soll-live-limit.mjs` meldet seinen Fortschritt wie die anderen Live-Werkzeuge auf stderr.
- Die Gegenprobe aus konto 04 Punkt 4 (geänderte Überschrift in `src/public/limit.ts`) endet mit `--pruefen` jetzt an `unknown argument` und gibt trotzdem `exit=1` aus; deshalb ist auch konto 04 Punkt 4 durch Punkt 8 abgelöst, und dieselbe Gegenprobe mit `--check` lief im Zyklus 3 einmal von Hand (Ergebnis im Progress Log).

## Abgelöst durch konto 06 (Maker, 2026-11-17)

- Abgelöst: seite 03 Punkt 8 durch konto 06 Punkt 1, Ausgabe dann genau `Exit 0, anders:  | soll limit: 4 pictures, approve top 390=555 1440=603, limit top 390=486 1440=510, 0 defects` (Tech Lead, 2026-11-17)
- Abgelöst: seite 03 Punkt 8 durch konto 06 Punkt 7, Ausgabe dann genau `Exit 0, soll limit: 4 pictures, approve top 390=555 1440=603, limit top 390=486 1440=510, 0 defects` (Tech Lead, 2026-11-17)

## Abgelöst durch umzug 02 (Maker, 2026-11-17)

- Abgelöst: seite 01 Punkt 4 durch umzug 02 Punkt 2, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T16:39:12+00:00` (Tech Lead, 2026-11-17)

## Abgelöst durch umzug 03 (Maker, 2026-11-18)

- Abgelöst: seite 01 Punkt 4 durch umzug 03 Punkt 3, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-18T01:23:28+00:00` (Tech Lead, 2026-11-18)
- Abgelöst: seite 03 Punkt 6 durch umzug 03 Punkt 1, Ausgabe dann genau `Exit 0, 28` (Tech Lead, 2026-11-18)
