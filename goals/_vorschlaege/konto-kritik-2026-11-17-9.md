Schwere: 3
Goal: konto 09
Befund: Nach einem Schlüsselwechsel wegen Leck bleibt jede mit `other_caller` verworfene alte Erlaubnis freigeschaltet, und wer den alten Gasschlüssel hat, kann über die alte Weiterleitung bis zur Grenze je Periode an die alte Auszahladresse des Kunden bei Bridge zahlen; den Widerruf überlässt das Goal dem Passkey des Kunden, den der Handoff aber nicht anbietet.
Beleg: `docs/konto/euro.md`, Abschnitt `## Wechsel des Gasschlüssels`, letzter Absatz; `src/konto/payout.ts` (`sendPayout`, Zweig `other_caller` schreibt nur die Log-Zeile)
Empfehlung: Im Handoff, der nach 409 `payout_needs_phone` ohnehin einen Passkey verlangt, die alte Erlaubnis im selben Schritt mit `revoke` des SpendPermissionManager über die Smart Wallet des Kunden widerrufen lassen (eine Unterschrift mehr, keine zweite Seite), und vorher klären, ob Bridge eine verwaiste Auszahladresse abschaltet und was dann mit USDC geschieht, das dort noch ankommt.
Übernommen: auf dev erledigt mit konto 11 (PR #269) (2026-11-18)
