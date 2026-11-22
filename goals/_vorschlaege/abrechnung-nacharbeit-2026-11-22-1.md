Schwere: 2
Goal: abrechnung 07
Befund: `ops/answer-quote.sh` kopiert die Zeitraumregel (`TQ_SINCE`, `TQ_UNTIL`) und den Filter auf `POST /v1/chat/completions` aus `ops/timeout-quote.sh` als eigene Fassung, und beide weichen schon ab: `parseEdge` lehnt `TQ_UNTIL=2026-11-17` mit Exit 2 ab, `parseIso` nimmt es als 17.11. 00:00 UTC, obwohl der Kopf von `answer-quote.sh` verspricht, dass beide Zeilen mit einem Satz Variablen gemessen werden.
Beleg: `git grep -n -E 'const (parseIso|parseEdge) = ' origin/dev -- ops/` -> `ops/answer-quote.sh:40`, `ops/timeout-quote.sh:101`; der Filter steht in `ops/answer-quote.sh:62` und `ops/timeout-quote.sh:97` | ops/timeout-quote.sh:104 (`(T|$)` lässt ein Datum ohne Uhrzeit durch)
Empfehlung: Zeitraum und Routenfilter einmal in eine Datei unter `ops/` legen (etwa `ops/quote-period.cjs` mit `parseEdge` und `isCall`), die beide `COUNT_JS` per `require` laden; damit gilt die strengere Regel aus abrechnung 07 auch für die Timeout-Quote, was `abrechnung-kritik-2026-11-18-3.md` (Übernommen, auf `origin/dev` noch offen) verlangt. Selbsttest beider Skripte mit `TQ_UNTIL=2026-11-17`, rot vor dem Fix.

Linse Q, Frage 2.
