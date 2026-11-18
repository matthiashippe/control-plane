Schwere: 2
Goal: anmeldung 04
Befund: Die Antwort 429 von `POST /v1/auth/keyless` in `/openapi.json` nennt nur `ERROR_SCHEMA` mit freiem `error`, nicht die zwei Codes `daily_limit` und `crawler_daily_limit`, die die Route tatsächlich setzt; ein Agent, der nur das Dokument liest, kann nicht vorab unterscheiden, ob die Grenze für alle oder die eigene Crawler-Grenze voll ist.
Beleg: `grep -n '"crawler_daily_limit"\|"daily_limit"' src/auth/keyless.ts` -> Zeile 210 und 224 | src/public/openapi.ts:135 (429 mit `JSON_CONTENT(ERROR_SCHEMA)`)
Empfehlung: Ein Goal gibt der Antwort 429 von `/v1/auth/keyless` ein eigenes Schema mit `error` als `enum: ["daily_limit", "crawler_daily_limit"]` und `hint`, und ein Test löst beide 429 in `createApp` mit `:memory:` und kleinen Grenzen aus der Umgebung aus und verlangt, dass jeder Code im `enum` steht, rot vor dem Fix.
MVP: Funktion, weil ein Agent nach 429 dann aus dem Dokument weiß, ob ein Wechsel auf den Weg mit Wallet nötig ist oder nur seine Kennung zählt.

Kritik Tech Lead an anmeldung 04 (PR #203). Nicht als Done-Punkt, weil die Antwort 429 auf der Deny List dieses Goals steht.
Übernommen: auf dev erledigt mit anmeldung 05 (PR #259), `src/public/openapi.ts:79` nennt das `enum` (2026-11-18)
