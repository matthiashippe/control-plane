Schwere: 2
Goal: messung 05
Befund: `test/deploy-alarm.test.ts` prüft vom neuen Titel nur, dass er da und nicht leer ist, weder den Wert `deploy-window 502` noch die Annahme aus messung 05, dass er nicht mit `control-plane ` beginnt; ein Titel `control-plane DEPLOY 502` in `ops/deploy-alarm.sh` bleibt in allen Tests grün und ließe `ops/status.sh` den Deploy-Alarm als Zustellung des Watchdogs zählen.
Beleg: `git grep -c "deploy-window 502" origin/dev -- test/deploy-alarm.test.ts` -> keine Ausgabe, Exit 1 | test/deploy-alarm.test.ts:100 (`.not.toBe("")`), test/deploy-alarm-pending.test.ts:81 (der nachgebaute `curl` dort schreibt keine Argumente mit), ops/deploy-alarm.sh:75, ops/status.sh:157
Empfehlung: Im Fall „sends a title and priority high like the watchdog“ den Titel genau mit `Title: deploy-window 502` vergleichen und zusätzlich verlangen, dass er nicht mit `Title: control-plane ` beginnt; rot vor dem Fix mit der Mutation `control-plane DEPLOY 502` in ops/deploy-alarm.sh:75.
MVP: Funktion, weil `received` im Alarmweg sonst nach jedem Deploy-Alarm einen stummen Watchdog als gesund melden kann.

Linse Q, Frage 1 (Verhalten der neuen Tests), Merge 7bb6d62. messung-kritik-2026-11-14-9 sichert die Seite von `ops/status.sh` ab (Präfix statt genauer Titel); dieser Vorschlag sichert die Seite des Senders, beide Tests zusammen schließen die Lücke.
Übernommen: Triage-Glieder PRO-21518 an den Tech Lead, Glied 3 (Titel des Deploy-Alarms genau geprüft, mit messung 09) (2026-11-15)
