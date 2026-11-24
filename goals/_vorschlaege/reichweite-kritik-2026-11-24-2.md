Schwere: 1
Goal: reichweite 04
Befund: `LEAD` verlinkt `/llms.txt` als Beleg für „one changed line, `conwayApiUrl`“ und die Karte, aber kein Test hält fest, dass `/llms.txt` das weiter sagt; ändert ein späteres Goal den Text dort, zeigen 26 Kommentare auf eine Seite, die ihren Satz nicht mehr trägt.
Beleg: `grep -rn 'conwayApiUrl' test/*.ts` prüft `/llms.txt` nicht gegen `relink_rules.LEAD`.
Empfehlung: Ein Test in `test/`, der `/llms.txt` per `app.request` holt und bei offenem Notschalter `conwayApiUrl` und `card, PayPal or Apple Pay` verlangt, bei eingeschaltetem nur `conwayApiUrl`, mit Verweis auf `ops/relink_rules.py`.
