Schwere: 1
Goal: kanal 03
Befund: Die obere Zahl in `goals/kanal/ertrag.md` (283 neue Wallets, 1 zahlend in 34 Stunden) besteht laut derselben Datei überwiegend aus unseren eigenen Prüfläufen mit Wegwerf-Wallets. Als obere Grenze trägt sie damit kein Urteil: Ob die eine zahlende Wallet ein Kunde oder ein eigener Topup ist, sagt sie nicht.
Beleg: `WALLETS_JS` in `ops/github-yield.sh` zählt alle Zeilen aus `wallets` mit `created_at` im Fenster; `ops/smoke.sh` und weitere Werkzeuge melden sich mit frischen Wallets an.
Empfehlung: Eigene Wallets erkennbar machen, etwa über die Adresse der Anfrage beim ersten `POST /v1/auth/verify` gegen `ops/own-ips.txt` (Join im Werkzeug, Ausgabe nur Summe) oder über die Quelle des Topups, und die zweite Zeile als `<w> new wallets (<o> ours), <p> paying (<q> ours)` ausgeben.
MVP: Robustheit, weil die obere Grenze sonst mit jedem Smoke-Lauf wächst und ein zahlender Kunde darin nicht von uns zu unterscheiden ist.
