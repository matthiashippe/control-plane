Schwere: 2
Goal: anmeldung 05
Befund: Der Begrenzer je Adresse antwortet auf `POST /v1/auth/nonce`, `/v1/auth/verify` und `/v1/auth/api-keys` mit 429 `rate_limited` und `retry_after_seconds`, aber `/openapi.json` nennt für diese drei Pfade kein 429; nach anmeldung 05 steht es nur an `POST /v1/auth/keyless`. Ein Agent auf dem Weg mit Wallet, der nur das Dokument liest, hält ein echtes 429 für undokumentiert.
Beleg: src/app.ts:633 (`OPEN_PATHS`) und 652 bis 667 | src/public/openapi.ts:127 bis 147 (Antworten nur 200, 201, 401)
Empfehlung: Ein gemeinsames `RATE_LIMITED_SCHEMA` (`error` mit `enum: ["rate_limited"]`, `message`, `docs`, `retry_after_seconds`) als Antwort 429 an jedem Pfad aus `OPEN_PATHS`, der im Dokument steht, dazu die Kopfzeile `Retry-After` unter `headers`; ein Test liest `OPEN_PATHS` und verlangt für jeden dokumentierten Pfad ein 429, rot vor dem Fix.
MVP: Funktion, weil die Anmeldung mit Wallet sonst nach einem 429 abbricht statt nach `retry_after_seconds` neu zu fragen.

Kritik Tech Lead an anmeldung 05 (PR #259, PRO-24407). Nicht als Done-Punkt, weil die Deny List von anmeldung 05 jeden Pfad außer `/v1/auth/keyless` sperrt.
