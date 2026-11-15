Schwere: 2
Goal: konto 03
Befund: Ist die Tagesgrenze verbraucht oder die Erlaubnis abgelaufen, fragt jede Anfrage mit API-Schlüssel und wenig Guthaben den RPC erneut (`getCurrentPeriod`), ohne Pause bis zur nächsten Periode.
Beleg: src/app.ts:2610 (`opts.konto?.topUp?.(address)` nach jeder Anfrage) und src/konto/topup.ts:99 (`spentThisPeriod` vor `period_used_up`)
Empfehlung: Je Konto das Ende der aktuellen Periode aus `getCurrentPeriod` merken und bis dahin ohne Aufruf ans Netz `period_used_up` melden; eine abgelaufene Erlaubnis (`end` vorbei) gar nicht mehr fragen. Sonst trifft ein Agent mit leerem Konto das Ratenlimit des RPC, über den auch die Anmeldung neuer Konten ihre Unterschrift prüft.
MVP: Funktion
