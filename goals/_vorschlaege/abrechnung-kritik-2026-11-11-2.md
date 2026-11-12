Schwere: 4
Goal: abrechnung 04
Befund: Das Human Gate von abrechnung 04 lässt Matthias einen OpenRouter-Management-Key in `~/.config/control-plane/loop.env` eintragen, die laut LOOP.md jeder Agent in seine Umgebung lädt; ein Management-Key kann Schlüssel und Limits des Kontos anlegen und ändern, „nur lesen“ sichert allein eine grep-Prüfung im eigenen Skript.
Beleg: origin/goal/abrechnung-04:goals/abrechnung/04-einkauf-abgebrochener-anfragen-gegen-die-abrechnung-des-anbieters.md:34-43 | LOOP.md:60 (`set -a; . ~/.config/control-plane/loop.env; set +a`)
Empfehlung: Tech Lead ändert das Gate vor der Asana-Karte: Der Key liegt in einer eigenen Datei (0600), die nur `ops/abort-purchase.sh` liest und kein Agent sourct; oder das Goal misst mit `/api/v1/key` (der vorhandene Schlüssel bekommt dort 200, Nutzung je Schlüssel) und braucht keinen Management-Key; sonst Punkte 3 und 4 als nicht messbar schließen.

Loop-Kritik 2026-11-11, Growth Lead.

Übernommen: Tech Lead, Glied am Topic abrechnung, Schlüssel in eigene Datei außerhalb von loop.env (2026-11-12)
