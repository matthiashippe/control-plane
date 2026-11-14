Schwere: 2
Goal: konto 01
Befund: Die Entscheidung Konto: Turnkey trägt nur, wenn eine von Turnkey signierte UserOperation eine Coinbase Smart Wallet auf Base Sepolia steuert und `SpendPermissionManager` als Eigentümer hinzufügt. konto 02 baut die Handy-Seite schon auf `@turnkey/core`, konto 03 prüft den Lauf erst danach.
Beleg: docs/konto/anbieter.md, Abschnitt „Für die nächsten Goals“, konto 03 („baut das selbst und belegt es als Erstes“)
Empfehlung: konto 03 beginnt mit einem Done-Punkt im Harness ohne Netz (Fork von Base Sepolia, etwa anvil): Smart Wallet mit einer secp256k1-Adresse als Eigentümer anlegen, `SpendPermissionManager` hinzufügen, `approve` und `spend()` bis zur Grenze, dann der Revert `ExceededSpendPermission`. Der Writer prüft beim Schreiben von konto 02, ob es vor konto 02 laufen soll.
Übernommen: konto 03, BLOCKED matthias (PRO-20104, Draft-PR #104) (2026-11-14)
