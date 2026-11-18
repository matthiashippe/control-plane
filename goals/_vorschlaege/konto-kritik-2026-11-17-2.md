Schwere: 3
Goal: konto 06
Befund: `finishPayout` verwirft bei einer neuen IBAN die alte zweite Erlaubnis ohne `retire`, wenn `permission_approved` 0 ist. Das kann falsch sein: Bricht in `sendPayout` das Warten auf die Quittung von `approveWithSignature` ab, ist die Erlaubnis on-chain freigeschaltet, `permission_approved` bleibt aber 0. Dann gilt die alte Weiterleitung weiter, und niemand widerruft sie.
Beleg: `finishPayout` in `src/konto/payout.ts` (`before.permission && before.forwarder && before.permission_approved ? … : retire_*`), `confirm` setzt `permission_approved = 1` erst nach einer erfolgreichen Quittung.
Empfehlung: `finishPayout` merkt jede alte Erlaubnis als `retire_*` vor, und `sendPayout` fragt vor dem `retire` mit `isApproved`, ob es überhaupt etwas zu widerrufen gibt (nicht freigeschaltet heißt: verwerfen ohne Transaktion). Ein Testfall: Quittung von `approveWithSignature` wirft, neue IBAN, die nächste Auszahlung sendet zuerst `retire` an die alte Weiterleitung.
Übernommen: auf dev erledigt mit konto 09 (PR #261) (2026-11-18)
