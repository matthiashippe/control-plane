Schwere: 2
Goal: sandbox 02
Befund: Kein signierter Aufruf ist je über Caddy (`ctl.sbx.postyourprice.com`) gelaufen, die Messung signiert nur über SSH auf dem Loopback; ob Caddy den Pfad samt `?query` und Prozent-Kodierung byte-gleich an `sandboxd` reicht, wie `## Verbindung` es voraussetzt, ist nicht gemessen.
Beleg: ops/sandbox/probe.sh:111 (`http://127.0.0.1:8730$path` über `ssh_host`) | docs/sandbox/plan.md:156 („Caddy reicht ihn unverändert durch“)
Empfehlung: sandbox 03 bekommt einen Unit-Test des Clients mit kodiertem Pfad und Query (`/v1/sandboxes/<id>/files?path=%2Froot%2Fa%20b`) gegen `canonicalMessage` und in der Live-Prüfung nach dem Rollout einen signierten Aufruf über `ctl.sbx` aus dem Container `cp`, der 200 statt 401 bekommt.
MVP: Funktion, weil sandbox 03 sonst erst im Rollout merkt, dass jede Datei-Anfrage mit Sonderzeichen 401 bekommt.
