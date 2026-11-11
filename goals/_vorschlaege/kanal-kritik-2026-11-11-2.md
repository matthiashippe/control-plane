Schwere: 2
Goal: kanal 01
Befund: Dass der Live-Kommentar genau der freigegebene Text ist, prüft kein Befehl im Repo; der Maker hat es in kanal 01 von Hand abgeglichen, die Linsen können es nur aus seinem Kommentar übernehmen.
Beleg: goals/kanal/01-antworten-auf-neue-conway-issues-vorbereiten.md, Punkt 4: beide Prüfungen lesen nur `ops/posted-answers.log`; Abgleich Tech Lead 2026-11-11 über `gh api repos/Conway-Research/automaton/issues/comments/<id> --jq .body` gegen `goals/kanal/antworten/<n>.md` ohne Kopfnotiz -> 434, 430, 427 identisch
Empfehlung: `ops/post-the-answers.py --verify-posted` (Netz) liest je Zeile aus `ops/posted-answers.log` den Kommentar und vergleicht ihn mit `body_to_send` des Entwurfs, Exit 1 bei Abweichung; das nächste kanal-Goal nimmt den Befehl als Prüfung seines Postpunkts.
MVP: Funktion, weil jede künftige Freigabe am Gate public_post nur so nachprüfbar wird.
