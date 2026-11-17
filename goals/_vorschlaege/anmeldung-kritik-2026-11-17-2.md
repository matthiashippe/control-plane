Schwere: 1
Goal: anmeldung 05
Befund: Der Fall „the 429 schema of POST /v1/auth/keyless lists exactly the codes the door answers with“ prüft an den echten 429-Körpern nur die Namen der Felder, nicht ihre Typen; würde `retryAfterSec` in `src/ratelimit.ts` eine Kommazahl, stünde im Dokument weiter `integer` und der Test bliebe grün. Die Kopfzeile `Retry-After`, die der Begrenzer setzt, nennt das Schema nicht.
Beleg: test/openapi-keyless.test.ts (Schleife über `required` und `properties`, keine Typprüfung) | src/ratelimit.ts:60 (`Math.ceil`) | src/app.ts:653 (`Retry-After`)
Empfehlung: Mit Vorschlag `anmeldung-kritik-2026-11-17-1.md` zusammen: je Körper `Number.isInteger(body.retry_after_seconds)` und `>= 0`, wenn das Feld da ist, und `headers: { "Retry-After": … }` an der Antwort 429.
MVP: Robustheit, weil das Schema sonst still vom Körper abweichen kann.

Kritik Tech Lead an anmeldung 05 (PR #259, PRO-24407). Nicht als Done-Punkt, weil `Math.ceil` heute eine ganze Zahl liefert und das Goal sein Ziel ohne den Punkt erreicht.
