Schwere: 2
Goal: anmeldung 03
Befund: Die OpenAPI-Beschreibung von `POST /v1/auth/keyless` nennt für 201 kein Schema, also weder `key` noch `keys_left_today`, und sagt „Capped per day across the instance“, obwohl seit anmeldung 01 ein erklärter Crawler eine eigene Grenze hat und seit anmeldung 03 die Antwort die freien Plätze der Grenze des Aufrufers nennt. Ein Agent, der die Schnittstelle aus `/openapi.json` liest statt aus einer Antwort, erfährt von beidem nichts.
Beleg: `git show origin/dev:src/public/openapi.ts | sed -n '103,110p'` -> `201: { description: "The key" }`, „Capped per day across the instance.“ | src/app.ts:1786 bis 1795 (Felder der Antwort 201)
Empfehlung: Ein Goal gibt der Antwort 201 in `src/public/openapi.ts` ein Schema mit `key`, `key_prefix`, `address`, `keys_left_today` (integer, minimum 0, „places of the caller's cap left today after this key, refills at midnight UTC“) und `docs`, und der Text nennt die eigene Grenze erklärter Crawler; ein Test vergleicht die Felder des Schemas mit den Schlüsseln einer echten Antwort aus `createApp` mit `:memory:`, rot vor dem Fix.
MVP: Funktion, weil ein Agent die Tagesgrenze und ihren Rest dann vor dem ersten Aufruf aus der Schnittstelle lesen kann.

Kritik Tech Lead an anmeldung 03 (PR #194). Nicht als Done-Punkt, weil `src/public/openapi.ts` auf der Deny List dieses Goals steht (unter `src/` nur `src/auth/keyless.ts` und die Route).
