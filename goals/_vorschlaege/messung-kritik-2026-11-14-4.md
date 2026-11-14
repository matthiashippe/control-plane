Schwere: 2
Goal: messung 02
Befund: Scheitert der Alarm nach einem Rollout mit 502 (ssh weg, keine Zeile `CP_ALERT_WEBHOOK` in der Crontab, POST rot), schreibt `ops/deploy-window.sh` nur `ALARM NOT SENT: exit <k>` und behält Exit 1, den `deploy.yml` (Zeile 165) in eine Warnung im Job-Log verwandelt; genau dieser Fall erreicht also wieder niemanden.
Beleg: ops/deploy-window.sh:442 (`echo "ALARM NOT SENT: exit $k"`) | .github/workflows/deploy.yml:165 (`|| echo "::warning::…"`)
Empfehlung: Ein eigener Exit-Code für „502 und Alarm nicht raus“ (etwa 3) in `ops/deploy-window.sh` mit Test, dazu ein eigener PR, der im Schritt „Deploy-Fenster“ von `deploy.yml` bei Exit 3 den Job rot macht; der geht in die Human Inbox, weil `.github/**` für Goals gesperrt ist.
MVP: Funktion, weil der Alarm nur zählt, wenn auch sein Ausfall jemanden erreicht.
