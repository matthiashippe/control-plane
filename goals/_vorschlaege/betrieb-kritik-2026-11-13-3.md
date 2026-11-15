Schwere: 2
Goal: betrieb 04
Befund: Der Schritt „Deploy-Fenster“ von `deploy.yml` misst rund 20 s nach dem Start des Containers und meldet deshalb bei jedem Rollout nur `PARTIAL`; das ganze Fenster misst niemand von selbst, ein Rückfall von betrieb 02 fiele erst bei einer Nachmessung von Hand auf.
Beleg: `grep -n "Deploy-Fenster" -A1 .github/workflows/deploy.yml` -> Zeile 164 und 165, Aufruf ohne Warten | docs/betrieb/neustart.md, Abschnitt `## Nachher` auf goal/betrieb-04 (im Lauf `PARTIAL` mit 0 von 25 und 0 von 91 Anfragen)
Empfehlung: `deploy.yml` misst das Fenster nach dem Rollout ganz, etwa mit einem eigenen Job, der 180 s nach dem Start des Containers `ops/deploy-window.sh --at <Start>` aufruft und bei `BAD GATEWAY` größer 0 über den Alarmweg meldet; Selftest mit nachgebautem Log.
MVP: Funktion, weil ein Rückfall beim Neustart sonst wieder zahlende Kunden trifft, bevor jemand nachmisst.
Übernommen: messung 02 in ROADMAP.md (Jeder Rollout belegt selbst, dass der Neustart keine Anfrage verliert) (2026-11-14)
