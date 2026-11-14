Schwere: 2
Goal: messung 02
Befund: `ops/deploy-alarm.sh` postet ohne `Title:` und ohne `Priority:`, also kommt ein 502 an einen zahlenden Kunden bei ntfy mit Priorität `default` an, während jeder Alarm von `ops/watchdog.sh` mit `high` klingelt; der Rückfall, für den das Goal gebaut ist, ist damit die leiseste Meldung auf dem Topic.
Beleg: `grep -cE "Priority|Title" ops/deploy-alarm.sh` -> 0 | ops/watchdog.sh:31 (`*) priority=high`)
Empfehlung: In `ops/deploy-alarm.sh` dieselben Kopfzeilen wie der Watchdog senden, `Title: control-plane DEPLOY 502` und `Priority: high`, und `test/deploy-alarm.test.ts` prüft beide in den Argumenten des nachgebauten `curl`. Der Titel beginnt mit `control-plane `, also zählt `ops/status.sh` (Zeile 138) ihn als Meldung des Watchdogs; entweder ist das gewollt (der Alarmweg gilt dann auch nach einem Deploy-Alarm als gelesen) oder der Titel heißt `deploy-window 502`, das entscheidet der Maker mit einer Zeile in `goals/messung/ANNAHMEN.md`.
MVP: Funktion, weil ein Alarm, der nicht klingelt, den Kunden genauso wenig schützt wie gar keiner.
