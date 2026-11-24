Schwere: 3
Goal: werbung 02
Befund: Der wöchentliche Takt aus `werbung-probe-takt-2026-11-23-1.md` fährt `bash ops/traffic.sh 168` ganz und schneidet den Block erst danach mit `sed` heraus, und der volle Bericht über 168 Stunden lief im ersten Lauf über 10 Minuten, ohne fertig zu werden.
Beleg: `goals/werbung/02-empfehlen-uns-agenten.md`, Progress Log Zyklus 1 („lief nach dem Block in seinen bestehenden Abschnitten über 10 Minuten und wurde abgebrochen“)
Empfehlung: Ein neuer Schalter `ops/traffic.sh --agents <h>`, der nur den Block `-- Agent fetches --` ausgibt (bestehende Blöcke und Schalter bleiben), mit Test gegen `ops/fixtures/traffic-agent-fetchers.log` und einer Laufzeitgrenze; der Takt nennt dann diesen Befehl.
MVP: Funktion, weil ein Wochenlauf, der in seinem Zeitlimit stirbt, die Zahl der Woche nicht schreibt.
Übernommen: Glied 4 an den Tech Lead, PRO-28911 (24.11.2026)
