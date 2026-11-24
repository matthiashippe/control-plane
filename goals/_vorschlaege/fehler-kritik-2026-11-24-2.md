Schwere: 2
Goal: fehler 12
Befund: Seit Zyklus 3 (Commit bac4b74) prüft `/pricing` den Zustand `intakeClosed` nicht mehr. Bei Sunset (`sunsetting`, also Katalog da und Datum erreicht) nennt die Seite deshalb weiter die Stufen über USDC, den Link `/pay/{usd}/{wallet}` und bei Notschalter aus auch die Pakete per Karte, obwohl `/llms.txt` „Credits are no longer sold here.“ sagt und `/v1/discovery` `topup_tiers_usd: []` liefert.
Beleg: `git show bac4b74 -- src/app.ts` streicht `!intakeClosed` aus `cardOpen` und den Zweig `intakeClosed ? ["- Credits are no longer sold here."]`; `src/app.ts:495` `const intakeClosed = sunsetting;`, `src/app.ts:2103` `topup_tiers_usd: intakeClosed ? [] : …`.
Empfehlung: Eigenes Goal mit Done-Punkt und Test: bei Sunset kein `/card/`, kein `/pay/` auf `/pricing`, dafür derselbe Satz wie in `/llms.txt`. Zusammen mit Vorschlag `fehler-kritik-2026-11-24-1.md` umsetzen, weil beide dieselben Sätze aus einer Funktion holen sollten.
