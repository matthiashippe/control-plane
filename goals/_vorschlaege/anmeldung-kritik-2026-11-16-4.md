Schwere: 1
Goal: anmeldung 04
Befund: Der Text von `POST /v1/auth/keyless` in `/openapi.json` beschreibt die Regel für einen erklärten Crawler („a user agent with a link and one of the words crawler, bot or indexer“) als Prosa, getrennt von `isDeclaredCrawler`; ändert sich die Regel, bleibt das Dokument still falsch, weil kein Test die beiden verbindet.
Beleg: src/public/openapi.ts:127 | src/auth/keyless.ts:162 bis 166 (`isDeclaredCrawler`)
Empfehlung: Die Wörter der Regel als exportierte Konstante in `src/auth/keyless.ts` (etwa `CRAWLER_WORDS`), aus der `isDeclaredCrawler` und der Text der OpenAPI lesen; ein Fall in `test/openapi-keyless.test.ts` verlangt jedes Wort im Text.
MVP: Robustheit, weil `test/keyless-crawler.test.ts` heute nur Route und `ops/keyless-mints.sh` gleich hält, nicht das Dokument.

Kritik Tech Lead an anmeldung 04 (PR #203). Nicht als Done-Punkt, weil `src/auth/**` auf der Deny List dieses Goals steht.
Verworfen: MVP: Schönheit ohne belegten Fehler; der Text der OpenAPI ist Prosa, und ein Bruch der Regel selbst fiele in den Tests der Anmeldung auf (2026-11-18)
