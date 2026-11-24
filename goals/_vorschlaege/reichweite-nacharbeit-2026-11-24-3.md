Schwere: 2
Goal: reichweite 03
Befund: `ops/video-starts.mjs` kopiert aus `ops/error-pages-arrivals.mjs` `ownIpsOf`, `first`, die Regeln `CHECKER` und `CRAWLER`, `parseArgs` und das Lesen von Log und eigenen Adressen in `main`, obwohl `ownIpsOf` dort schon exportiert ist und sich ohne Änderung an der gesperrten Datei importieren ließe.
Beleg: `git grep -n -E '^(export function ownIpsOf|function parseArgs|const CRAWLER)' origin/dev -- ops/video-starts.mjs ops/error-pages-arrivals.mjs` -> `ops/error-pages-arrivals.mjs:31`, `:46`, `:111`, `ops/video-starts.mjs:30`, `:34`, `:92`; `comm -12` über beide Dateien (Zeilen ab 26 Zeichen) -> `49` gleiche Zeilen | ops/video-starts.mjs:34
Empfehlung: `ops/video-starts.mjs` importiert `ownIpsOf` aus `./error-pages-arrivals.mjs`; die Regel, wer als fremd zählt (eigene Adressen, Checker, Crawler), kommt beim nächsten Goal an einer der beiden Leitzahlen in eine gemeinsame Datei unter `ops/`, die beide importieren.

Beide Werkzeuge liefern Leitzahlen (Ankünfte auf den Fehlerseiten, Starts des Videos) aus demselben Zugriffslog. Ändert ein Goal die Crawler-Regel nur in einem, zählen die zwei Zahlen dieselben Besucher verschieden.

Linse Q, Frage 2.
Übernommen: Watch List in STATE.md, beim nächsten Goal an einer der beiden Leitzahlen aus dem Zugriffslog (24.11.2026)
