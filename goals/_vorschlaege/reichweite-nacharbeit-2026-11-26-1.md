Schwere: 1
Goal: reichweite 05
Befund: `test/llms-txt-lead.test.ts` baut zwei Hilfen ein weiteres Mal: Es lädt `LEAD` und `LEAD_NO_CARD` mit eigenem `spawn` von `python3 -I` (`:38`), obwohl dasselbe Goal dafür `leads()` in `test/breaker-comments-sandbox.ts:110` anlegt, und es legt `tripBreaker` als vierte Kopie neben `test/card-way-pages.test.ts`, `test/docs-pricing.test.ts` und `test/werbung.test.ts` an.
Beleg: `git grep -n -E "^beforeAll|^export async function leads|^function tripBreaker" origin/dev -- test/llms-txt-lead.test.ts test/breaker-comments-sandbox.ts test/card-way-pages.test.ts test/docs-pricing.test.ts test/werbung.test.ts` -> `test/breaker-comments-sandbox.ts:110`, `test/card-way-pages.test.ts:28`, `test/docs-pricing.test.ts:28`, `test/llms-txt-lead.test.ts:38`, `test/llms-txt-lead.test.ts:57`, `test/werbung.test.ts:34`; `git grep -n "VALUES ('TRIP'" origin/dev -- test` -> dieselbe Anweisung in allen vier Dateien | test/llms-txt-lead.test.ts:57
Empfehlung: In `test/llms-txt-lead.test.ts` `leads()` aus `test/breaker-comments-sandbox.ts` importieren und `tripBreaker(db, address)` in eine gemeinsame Datei unter `test/` ziehen, die alle vier Testdateien nutzen, beim nächsten Goal an der Kasse per Karte oder an den Kommentaren.
MVP: Schönheit

Linse Q, Frage 2. Ändert ein Goal die Regel des Notschalters in `cardBreaker` (Fenster, Status oder Modus der Bestellung), müssen vier gleiche INSERT-Anweisungen mitgehen; bleibt eine zurück, prüft ihr Fall den eingeschalteten Notschalter nicht mehr und bleibt trotzdem grün, wenn er nur das Fehlen der Karte erwartet.
