Schwere: 3
Goal: konto 03
Befund: Ein Fehler des RPC beim Prüfen der Unterschrift verbrennt den Handoff wie eine abgelehnte Erlaubnis, obwohl der Mensch auf dem Handy alles richtig gemacht und bei Turnkey schon ein Konto angelegt hat.
Beleg: src/konto/permission.ts:107 (`catch { return false; }`) und src/handoff/routes.ts:331 (`refuse` ruft `burnMatched`)
Empfehlung: Einen Fehler des Transports von einer ungültigen Unterschrift trennen: `signatureValid` bleibt bei false für eine ungültige Unterschrift, ein Transportfehler geht als eigener Ausgang an die Route, die dann 503 mit „noch einmal tippen“ antwortet und den Handoff auf `matched` lässt; mit einem Test, dessen `verifyClient` wirft.
MVP: Funktion

Folge heute: ein zweiter Passkey und eine zweite Sub-Organisation bei Turnkey für denselben Menschen. Gehört nach konto 04 oder 05, bevor echte Kunden die Seite sehen.
Übernommen: Triage-Glieder 16.11. an den Tech Lead, Glied 5 (PRO-22463, RPC-Fehler verbrennt den Handoff nicht) (2026-11-16)
