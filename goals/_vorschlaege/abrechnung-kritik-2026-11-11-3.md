Schwere: 2
Goal: keines
Befund: Die Vorschläge abrechnung-kritik-2026-11-10-4 bis -6 stehen auf „Übernommen: Tech Lead, neues Glied nach abrechnung 04“, aber in ROADMAP.md und docs/kette.md gibt es dieses Glied nicht; den Vergleich `--compare` ab 17.11., der die Timeout-Quote für kanal und seite liefert, plant damit niemand.
Beleg: `git show origin/dev:ROADMAP.md | grep -n "abrechnung 05\|17.11\|compare"` -> keine Zeile | goals/_vorschlaege/abrechnung-kritik-2026-11-10-4.md:8
Empfehlung: Writer oder Tech Lead trägt abrechnung 05 (Vergleich ab 17.11., Gegenrechnung, Abgleich im gleitenden Fenster) als Kettenglied in ROADMAP.md und docs/kette.md ein.

Loop-Kritik 2026-11-11, Growth Lead.
