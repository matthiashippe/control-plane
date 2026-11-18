# Annahmen im Topic anmeldung

## Abgelöst durch anmeldung 05 (Tech Lead, 2026-11-18)

- Abgelöst: anmeldung 04 Punkt 2 durch anmeldung 05 Punkt 2, Ausgabe dann genau `Exit 1, 0` (Tech Lead, 2026-11-18)
- Abgelöst: anmeldung 04 Punkt 3 durch anmeldung 05 Punkt 1, Ausgabe dann genau `Exit 1, 0` (Tech Lead, 2026-11-18)
- Entscheidung (Tech Lead, 2026-11-18, PRO-25126): anmeldung 05 hat die Import-Zeile in `src/public/openapi.ts` um `KEYLESS_LIMIT_CODES` erweitert (Punkt 4 lässt das zu) und die 429-Antwort von `ERROR_SCHEMA` mit „The day's mints are used up“ auf `KEYLESS_LIMIT_SCHEMA` umgestellt, weil die Antwort seitdem beide Gründe nennt; die beiden Zähler aus anmeldung 04 geben deshalb 0. anmeldung 05 Punkt 2 prüft die neue Import-Zeile und Punkt 1 die neue 429-Antwort samt `test/openapi-keyless.test.ts` (5 passed), beide ohne Netz unter Node 22 am Kopf des Reparatur-Branches gemessen.
