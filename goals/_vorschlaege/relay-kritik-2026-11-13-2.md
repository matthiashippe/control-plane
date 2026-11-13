Schwere: 2
Goal: relay 01
Befund: Das Relay nimmt eine Nachricht an die eigene Adresse an (`to` gleich Absender); nach dem einen Erstkontakt ist jede weitere frei, ohne dass ein zweiter Teilnehmer existiert.
Beleg: src/relay/routes.ts:119 (`isRecipient(to)` ohne Vergleich mit `from`) und src/relay/store.ts, `inContact` (Paar aus derselben Adresse)
Empfehlung: `to` gleich Absender mit 400 und Klartext ablehnen (400 liegt nicht in der Liste der Wiederholungen der Runtime), dazu ein Test. Die Speichergrenze aus relay 01 Punkt 9 deckelt den Schaden bereits; dies schließt nur den Weg ohne Gegenüber.
