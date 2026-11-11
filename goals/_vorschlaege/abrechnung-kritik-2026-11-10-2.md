Schwere: 2
Goal: abrechnung 01
Befund: Die Summe „0,37 USD“ für die Abbrüche vom 10.11.2026 in `LOOP.md` (Stand) und im Goal-Text ist nicht gemessen; gegen die Produktion sind es fünf berechnete Abbrüche über zusammen 79229 mc (Grundregel 3).
Beleg: `docker exec deploy-caddy-1 grep -h /v1/chat/completions /var/log/caddy/access.log*` (lesend, ausgewertet auf Status 0) -> fünf Zeilen vom selben Client am 10.11.2026 (05:16:27, 05:18:17, 05:25:58, 05:36:46, 05:37:53 UTC); die passenden Ledger-Zeilen `kind = 'inference'` (Generation-ID beginnt mit der Startzeit) summieren sich auf -79229 mc
Empfehlung: Ein Mensch korrigiert den Satz in `LOOP.md` auf die gemessene Zahl mit Befehl, denn `LOOP.md` ändert kein Agent.
MVP: Funktion, weil der Kanal (kanal 01) dem Kunden sonst eine falsche Gutschrift nennt.

Übernommen: abrechnung 03 korrigierte docs/kette.md auf 79229 mc; den Satz in LOOP.md:24 bekommt der Tech Lead als Human Inbox (2026-11-11)
