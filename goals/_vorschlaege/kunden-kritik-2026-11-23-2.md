Schwere: 2
Goal: kunden 13
Befund: Die 409 `house_pool_empty` sagt „Today's 4 paid reports are taken“, auch wenn die Tagesgrenze von 1 USD durch Schrittguthaben erreicht ist und erst weniger Zusprüche vergeben sind.
Beleg: src/bounties/house.ts:252 (Bedingung mit `houseSpentOnMc`) | src/bounties/house.ts:255 (Text nennt nur `HOUSE_DAILY_AWARDS`)
Empfehlung: Text „Today's paid reports are taken. The next one is paid from midnight UTC.“ ohne Zahl, Code und `retry_after` unverändert.

Eine Runtime, die den Text liest, rechnet sonst mit einer Zahl, die nicht stimmt.
MVP: Schönheit, weil Code und `retry_after` die Antwort schon richtig steuern.
