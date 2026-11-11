Schwere: 3
Goal: abrechnung 03
Befund: Die Quote nach außen hängt an einem neuen `--compare` frühestens am 17.11.2026, aber kein Kettenglied und keine Zeile in `docs/kette.md` oder `ROADMAP.md` plant diese Messung, also nennt sie niemand.
Beleg: `grep -n "17.11\|--compare" docs/kette.md ROADMAP.md` -> keine Zeile; docs/abrechnung/timeouts.md:83
Empfehlung: Kettenglied abrechnung 04: `--compare` vom Rollout von abrechnung 02 bis mindestens 17.11.2026, danach `Quote nach außen:` mit Zahl, Zeitraum und Anfragen oder mit Grund für weiter keine.
MVP: Funktion, weil die Zahl für kanal und Seite sonst nie entsteht.
