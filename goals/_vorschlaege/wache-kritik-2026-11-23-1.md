Schwere: 4
Goal: wache 01
Befund: Der Notschalter sperrt nur die Wege des Dienstes; wer einmal auf `/card/5` klickt, sieht in der 302 die Kasse von Digistore24 mit `custom=<wallet>` und kann sie mit jeder neuen Wallet direkt aufrufen, und die IPN schreibt auch dann gut, wenn der Notschalter an ist.
Beleg: src/payments/card-way.ts:72 (`checkoutUrl` legt Produkt und `custom` offen) und src/payments/digistore.ts:328 (die IPN liest `custom`, ohne `cardBreaker` zu fragen).
Empfehlung: Glied wache 02: Kommt eine Zahlung, während der Notschalter an ist oder die Wallet schon eine Erstattung hatte, schreibt die IPN nichts gut, erstattet die Bestellung über die API von Digistore24 und meldet sie über `CP_ALERT_WEBHOOK`; so verliert kein Käufer Geld und kein Guthaben verlässt den Dienst. Braucht einen API-Schlüssel von Digistore24 mit dem Recht zu erstatten, den nur Matthias anlegen kann. Bis dahin misst die Leitzahl die Umgehung: Eine neue Live-Bestellung nach dem Auslösen widerlegt das Goal.
