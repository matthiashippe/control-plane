Schwere: 2
Goal: sandbox 03
Befund: Ein `exec`, das länger als rund 125 s läuft, scheitert in der Runtime nach vier abgebrochenen Versuchen, und jeder Abbruch zählt für ihren Circuit Breaker.
Beleg: `src/conway/http-client.ts:115` am Pin d8f8168 (catch erhöht `consecutiveFailures`, `maxRetries` 3, Timeout 30 s) | src/sandbox/service.ts:507 (`timeoutMs: ms + 30_000`, das Control Plane hält die Anfrage bis zum Ende des Befehls)
Empfehlung: In sandbox 04 im Harness messen, wie die unveränderte Runtime ein `exec` von 60 s und von 180 s erlebt; danach entscheiden, ob das Control Plane lange Befehle als Hintergrundlauf mit sofortiger Antwort anbietet oder `timeout` über 120000 ms mit 400 und Klartext ablehnt. Die Zeile „höchstens rund 25 s“ im Kontext von Goal 03 hat keine Antwort, die die Runtime nicht als Fehler liest, und ist darum nicht gebaut; das Zusammenführen der Wiederholung mit demselben Schlüssel deckt alles bis rund 2 Minuten ab.
