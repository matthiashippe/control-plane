Schwere: 2
Goal: paket 01
Befund: Die Startseite nennt das gepflegte Paket der Runtime nicht, obwohl es ab paket 01 der kürzeste Weg für einen neuen Betreiber ist (ein Befehl, keine Einstellung).
Beleg: `cat src/public/index.html src/public/startpage.ts | grep -c 'github:matthiashippe/automaton#'` -> 0 | goals/paket/01-die-runtime-kommt-mit-unserer-adresse.md, Kontext für den Maker („Die Startseite bleibt unverändert“)
Empfehlung: Ein Goal mit SOLL-Bild (390 und 1440 Pixel) unter `docs/soll/`, das den Installationsbefehl aus `docs/paket/anleitung.md` auf der Startseite zeigt, sobald paket 02 die erste Anmeldung mit der Kennung des Pakets gemessen hat.
MVP: Kauf, weil jeder Besucher der Startseite mit einem Befehl zu einer Runtime kommt, die sich bei uns anmeldet.

Übernommen: Watch List in STATE.md, Glied an seite, sobald paket 02 (frühestens 07.12.) die erste Anmeldung mit der Kennung des Pakets gemessen hat (2026-11-23)
