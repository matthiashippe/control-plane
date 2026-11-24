Schwere: 2
Goal: reichweite 04
Befund: Schaltet der Notschalter der Karte ein, merkt das nur `ops/watchdog.sh`; niemand bekommt den Auftrag, die 26 Kommentare mit `LEAD` auf `LEAD_NO_CARD` zu stellen, und sie versprechen weiter Karte, PayPal und Apple Pay.
Beleg: `ops/card-breaker.sh --container` wird von `ops/watchdog.sh` gelesen; `/llms.txt` lässt die Kartenzeile dann weg (`src/app.ts`, `cardOpen`), die Kommentare auf GitHub nicht.
Empfehlung: Ein Goal, das `ops/watchdog.sh` ändern darf: Beim Wechsel `breaker off` auf `on` (und zurück) legt die Wache ein Issue an den Tech Lead mit dem Trockenlauf `ops/relink-comments.py --name --no-card` (oder `--name`), damit er mit `ok name` freigibt und der Maker sendet.
