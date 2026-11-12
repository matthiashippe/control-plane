# Ankünfte aus Conway-Issues auf der Startseite

Gemessen am 12.11.2026 um 21:03 UTC gegen die Produktion, vor dem Rollout von seite 02 (Umzug als erster Block auf `/`).

Vorher: 1 kamen auf / von github.com/Conway-Research, 0 binnen 24 Stunden angemeldet, 0 noch in den 24 Stunden, 1 vom Telefon, 2026-11-02T00:00:00Z bis 2026-11-12T21:00:00Z
Befehl: `bash ops/landing-yield.sh --since 2026-11-02T00:00:00Z --until 2026-11-12T21:00:00Z`

Das Fenster hatte 79125 Zeilen im Zugriffslog und 2247 fremde Adressen; das Log reicht bis zum 01.10.2026 zurück, deckt das Fenster
also ganz ab. Eine Ankunft ist die erste Anfrage `GET /` einer fremden Adresse mit Referrer `https://github.com/Conway-Research/…`,
angemeldet heißt `POST /v1/auth/verify` mit 200 von derselben Adresse binnen 24 Stunden. Das Werkzeug beweist sich mit
`bash ops/landing-yield.sh --selftest` in beide Richtungen.

Die Zahl ist eine Untergrenze: Ein Automaton ruft `/v1/auth/verify` oft von einer anderen Adresse als der Browser seines Betreibers,
eine solche Anmeldung zählt hier nicht als angemeldet.

Widerlegt, wenn 14 Tage nach dem Rollout Ankünfte aus Conway-Issues da sind und sich keine binnen 24 Stunden anmeldet. Das Urteil
fällt im nächsten Glied mit demselben Befehl, `--since` ab dem Rollout.
