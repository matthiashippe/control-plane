Schwere: 2
Goal: fehler 09
Befund: An einem ruhigen Tag ist die letzte Zustellung das Lebenszeichen kurz nach 00:00 UTC, also prüft alarm_path.received das Thema nur zwischen etwa 00:05 und 11:05 UTC und meldet danach unknown.
Beleg: ops/status.sh: `if delivered_age is not None and delivered_age <= 11 * 3600:` mit dem einen Lebenszeichen je UTC-Tag aus ops/watchdog.sh (ops/README.md, Absatz zum Lebenszeichen)
Empfehlung: Entweder die Ops-Triage am Vormittag UTC einplanen, oder ops/watchdog.sh ein zweites Lebenszeichen um 12:00 UTC senden lassen, damit jede Stunde des Tages eine Zustellung jünger als 11 h hat. Prüfung: Test mit CP_NOW 18:00 UTC und nur Lebenszeichen ergibt received.status ok oder red, nie unknown.
