Schwere: 2
Goal: kunden 11
Befund: Wer einen Bericht an einen Hausauftrag schickt, der inzwischen zugesprochen oder abgelaufen ist, bekommt 409 `not_open` ohne die id des neuen Hausauftrags und muss das Brett neu lesen; bei vier Zusprüchen am Tag wechselt die id bis zu viermal.
Beleg: src/app.ts:3434 (`isHouseJob` gilt auch für den geschlossenen Auftrag) | src/bounties/store.ts:427 (`not_open` ohne Verweis)
Empfehlung: Im Hauszweig von `POST /v1/submissions` trägt die Antwort `not_open` und `deadline_passed` zusätzlich `open_house_job` mit der id aus `openHouseJob`, Test ohne Netz.

Übernommen: Glied 1 an den Tech Lead, PRO-28123, mitzunehmen an derselben Stelle (2026-11-23)
