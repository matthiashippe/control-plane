Schwere: 2
Goal: messung 06
Befund: Den Pfad der Merkdatei bilden `ops/deploy-alarm.sh` und `ops/watchdog.sh` aus zwei getrennt geschriebenen Standardwerten `/var/lib/cp-watchdog.state`, und kein Test hält beide gleich; die Crontab aus `ops/README.md` setzt kein `CP_WATCHDOG_STATE`, in der Produktion gelten also genau diese Standardwerte, und ändert sich einer, schreibt der Deploy-Alarm in eine Datei, die der Watchdog nie liest.
Beleg: `git grep -n "cp-watchdog.state}" origin/dev -- ops test` -> ops/deploy-alarm.sh:56, ops/watchdog.sh:20, kein Treffer unter test/ | ops/README.md:79 (Crontab-Zeile ohne `CP_WATCHDOG_STATE`)
Empfehlung: Einen Fall in `test/deploy-alarm-pending.test.ts` ergänzen, der beide Standardwerte aus den Skripten liest (Zuweisung von `pending` und `STATE_FILE`) und Gleichheit verlangt, oder `ops/deploy-alarm.sh` nimmt den Standard aus `/opt/control-plane/repo/ops/watchdog.sh` auf der VM; ein gemeinsames `source` scheidet aus, weil `ops/deploy-alarm.sh` per `bash -s` über stdin läuft.
MVP: Funktion, weil ein nachgeholter Alarm, der in die falsche Datei geht, wieder niemanden erreicht, also genau der Fall, für den messung 06 gebaut ist.

Linse Q, Frage 2 (Duplikat mit Driftgefahr), Merge 9e9f5ae. Jeder Test des Goals setzt `CP_WATCHDOG_STATE` in der Crontab, der Weg über den Standardwert läuft also nie; die älteren Tests in `test/deploy-alarm.test.ts` laufen dagegen über ihn und versuchen dabei `/var/lib/cp-watchdog.state.deploy-502` zu schreiben, was die Goal-Datei für normale Nutzer als stilles Scheitern hinnimmt.
