Schwere: 2
Goal: messung 02
Befund: Die Schwärzung der Rückmeldung von `ops/deploy-alarm.sh` in `ops/deploy-window.sh` (URL und Adresse werden zu `<url>` und `<address>`, weil die Zeilen im öffentlichen Job-Log landen) läuft in keinem Test, denn jeder nachgebaute `ssh` antwortet auf `bash -s` ohne Ausgabe; ein Umbau, der `alarm_out` ungeschwärzt druckt, bleibt grün.
Beleg: `git grep -n '"bash -s"' origin/dev -- test/deploy-window-rollout.test.ts test/deploy-alarm-pending.test.ts` -> `test/deploy-window-rollout.test.ts:51` (schreibt nur Argumente und stdin weg), `test/deploy-alarm-pending.test.ts:48` (`cat > /dev/null; exit ...`) | ops/deploy-window.sh:441
Empfehlung: Einen Fall in `test/deploy-window-rollout.test.ts` ergänzen, dessen `ssh` auf `bash -s` eine Zeile mit einer Dokumentations-URL und einer Dokumentationsadresse ausgibt und mit 255 endet; erwartet werden `<url>`, `<address>`, `ALARM NOT SENT: exit 255`, Exit 3 und keine Zeile mit der URL oder der Adresse. Rot vor dem Fix mit einer Mutation, die den `sed` an Zeile 441 entfernt.
MVP: Funktion, weil der Webhook im öffentlichen Repo als Secret gilt (Grundregel 8) und die Schwärzung die zweite Sperre davor ist.

Linse Q, Frage 1 (Verhalten der neuen Tests), Merge cedf1da. `test/deploy-alarm.test.ts` prüft nur die erste Sperre (keine URL in der Ausgabe von `ops/deploy-alarm.sh` selbst); die Schwärzung im Aufrufer bleibt ungeprüft. Nebenbei erfasst das Muster an Zeile 441 weder IPv6 noch einen Host ohne Schema, was ein solcher Test mit festhalten kann.
Übernommen: Triage-Glieder PRO-21518 an den Tech Lead, Glied 6 (Schwärzung in `ops/deploy-window.sh` getestet) (2026-11-15)
