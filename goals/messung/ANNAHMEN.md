# Annahmen im Topic messung

- messung 03 (Engineer CP, 14.11.2026): Die Fixture `ops/fixtures/github-yield-own-ips.txt` trifft mit ihrem Namen das Muster
  `own-ips\.txt` aus Punkt 1. Der Selftest von `ops/github-yield.sh` setzt den Pfad deshalb aus dem Stamm
  `github-yield-own-ips` und `.txt` zusammen, mit einem Kommentar, der die Datei voll nennt. Gelesen wird dieselbe Fixture wie
  vorher, und `ops/own-ips.txt` liest das Werkzeug nur über `own_ips`.
- messung 03 (Engineer CP, 14.11.2026): Der Selftest von `ops/landing-yield.sh` verschiebt die Anmeldung von `192.0.2.11` nach
  Methode `POST` statt nach dem Pfad, damit der Pfad der Anmeldung nur in `ops/conway_arrivals.py` steht. In der Fixture hat diese
  Adresse genau eine Zeile mit `POST`, die Anmeldung; die Summen bleiben gleich.
- messung 03 (Engineer CP, 14.11.2026): Ist die Liste da, nennt `own_ips` aber keine Adresse, endet es unter `pipefail` mit 1.
  `conway_own_list` unterscheidet deshalb selbst: fehlt die Datei, eine stderr-Zeile „own_ips has no list“, sonst nach dem Aufruf
  „own_ips named no own address“, beide mit Exit 2. Die stderr von `own_ips` wird verworfen, weil sie die live gesehene Adresse
  nennen kann.
- messung 03 (Engineer CP, 14.11.2026): `test/landing-yield.test.ts` kopiert in den beiden Fällen mit einer Kopie des Werkzeugs
  zusätzlich `ops/conway-arrivals.sh`, `ops/conway_arrivals.py` und `ops/own-ips.sh` daneben, weil das Werkzeug sie sourct und
  importiert. Erwartete Summen und Exit-Codes bleiben unverändert.
- messung 05 (Engineer CP, 14.11.2026): Der Deploy-Alarm titelt fest `deploy-window 502`. `ops/status.sh` zählt ihn nicht, weil
  der Titel nicht mit `control-plane ` beginnt (Zeile 157). Das ist gewollt: `received` im Alarmweg soll belegen, dass die Posts
  von `ops/watchdog.sh` ankommen, und ein Deploy-Alarm auf dem Thema darf dort kein `ok` melden, wenn der Watchdog selbst nichts
  zugestellt hat. Der Titel nennt die Quelle (`ops/deploy-window.sh`) und den Fehler, keine Adresse und keine URL.
- messung 06 (Engineer CP, 15.11.2026): Der Watchdog liest die Merkdatei vor dem POST und löscht nach einem zugestellten POST nur,
  was er gesendet hat. Hängt `ops/deploy-alarm.sh` während des POST eine Zeile an, bleibt genau diese Zeile für den nächsten Lauf
  stehen. In den Text kommen nur Zeilen der Form `<count> <HH:MM:SS>`; eine Datei ohne lesbare Zeile wird trotzdem gesendet
  (Text „its lines are not readable“) und erst danach gelöscht, damit kein Weg sie ohne zugestellten POST entfernt.
- messung 07 (Engineer CP, 2026-11-15): `own_ips_offline` endet bei leerer Liste mit 2 ohne stderr-Zeile, weil die Goal-Datei „druckt nichts“ sagt; `ops/deploy-window.sh --log` nennt den Grund selbst. Einen anderen Exit als 0, 1 oder 2 der Funktion meldet `--log` als „COULD NOT TELL: the list of our own addresses was not readable.“ mit Exit 2.
- messung 07 (Engineer CP, 2026-11-15): `existsSync` kommt in `test/own-ips-readers.test.ts` als eigene Import-Zeile dazu, weil Punkt 4 keine entfernte Zeile im Diff erlaubt. Der Selftest legt eine Merkdatei mit `192.0.2.44` für alle Läufe an, damit auch der Fall `own-list-empty` zeigt, dass eine Adresse nur in der Merkdatei die leere Liste nicht ersetzt.
- messung 08 (Engineer CP, 2026-11-16): Zwei Fälle, die die Goal-Datei nicht nennt, enden wie die drei genannten mit Exit 2 und einer `stderr`-Zeile: ein `./ops/access-log.sh`, das von einem Signal beendet wird (negativer Returncode), mit dem Grund `./ops/access-log.sh was stopped by signal <n>`, und eine Ausgabe, die kein UTF-8 ist (`UnicodeDecodeError`, bisher still 0 über `except Exception`), mit `./ops/access-log.sh printed a log that is not text`. Sonst stünde dort ein Traceback mit Exit 1, der wie „trägt nicht“ aussieht.
- messung 08 (Engineer CP, 2026-11-16): `CP_ACCESS_LOG_TIMEOUT` gilt nur als endliche Zahl größer 0 (`nan`, `inf`, `0`, `-3`, `abc` enden mit Exit 2); die Zeile nennt den Wert selbst nicht. Geprüft wird der Wert nach `own_addresses()` und vor dem Start des Logs, damit eine fehlende eigene Liste weiter zuerst gemeldet wird.
- Abgelöst: messung 07 Punkt 4 durch messung 10 Punkt 3, Ausgabe dann genau `2` (Tech Lead, 2026-11-17)
- Abgelöst: messung 04 Punkt 1 durch messung 10 Punkt 2, Ausgabe dann genau `0` (Tech Lead, 2026-11-17)
