Schwere: 3
Goal: werbung 02
Befund: Der Fehler eines echten Nutzers (zwei 404 eines `Claude-User` auf `/docs` und `/pricing`) liegt als `werbung-fehler-2026-11-23-1.md`, `LOOP.md` verlangt für ihn `goals/_vorschlaege/fehler-<JJJJ-MM-TT>-<n>.md`, damit er als Glied an das Topic `fehler` (Prio 1) kommt.
Beleg: `LOOP.md:91`; `ls goals/_vorschlaege/ | grep -c '^fehler-2026-11-23'` -> 0
Empfehlung: Die Triage übernimmt `werbung-fehler-2026-11-23-1.md` als Glied des Topics `fehler`, vor jedem anderen Goal; künftige Fehler echter Nutzer heißen `fehler-<JJJJ-MM-TT>-<n>.md`, auch wenn ein anderes Goal sie findet. Umbenennen geht hier nicht, weil Punkt 8 dieses Goals nur `werbung-*.md` unter `goals/_vorschlaege/` zulässt.
MVP: Funktion, weil der Agent, der für einen Betreiber nachsah, bei uns weder Anleitung noch Preis fand.
