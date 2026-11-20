Schwere: 2
Goal: konto 18
Befund: konto 18 baut nur ein Prüfwerkzeug für das Gate von konto 15 genauer, ohne Messauftrag und für einen Fall (Dienst unten), den der Watchdog schon als OUTAGE meldet, während der Richtungs-Check Matthias empfiehlt, das Konto vor konto 15 einzufrieren.
Beleg: `git show origin/dev:ops/watchdog.sh | grep -n OUTAGE` -> `177:  if [[ "$PREVIOUS" == "down" ]] || report "OUTAGE" "HTTP $CODE, twice in a row"; then` | docs/richtung/2026-11-19.md:107
Empfehlung: konto 18 bleibt PAUSED, bis Matthias über das Einfrieren des Kontos entschieden hat und konto 15 durch ist; danach nur wieder PLANNED, wenn am Gate ein gestoppter Dienst wirklich zu einer falschen Suche geführt hat.

`LOOP.md:36`: Prüfwerkzeuge ohne Messauftrag werden kein Done-Punkt, sondern ein Vorschlag. Das Topic konto hat 0 Konten in der Produktion (`docs/richtung/2026-11-19.md`, Tabelle, Zeile „Konten ohne Wallet“).
