Schwere: 2
Goal: werbung 03
Befund: Zwei gleichzeitige Aufrufe von `bash ops/agent-probe.sh --week` in derselben Woche fragen beide fünf Sessions, weil die Wochensperre erst nach dem Lauf eine Zeile schreibt und kein Lock hält.
Beleg: `ops/agent-probe.sh` (Sperre liest nur `CP_PROBE_OUT` und `<Zustand>/<JJJJ-Www>/line`, beide entstehen erst nach der fünften Session)
Empfehlung: `flock -n "<Zustand>/.lock"` um den Lauf mit Sessions; ein zweiter Aufruf gibt dann `probe of <JJJJ-Www> is running` aus, Exit 0, mit einem Test, der den Lock von außen hält.
MVP: Schönheit, weil der Richtungs-Check den Befehl nur einmal je Woche fährt und ein doppelter Lauf nur Sessions kostet, keine Zahl verfälscht.

Übernommen: Watch List in STATE.md (2026-11-25)
