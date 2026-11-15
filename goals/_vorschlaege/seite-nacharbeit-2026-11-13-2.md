Schwere: 1
Goal: seite 02
Befund: `ops/landing-yield.sh` zählt Ankünfte aus Conway-Research und ihre Anmeldung mit eigenem Python-Kern, obwohl `ops/github-yield.sh` (kanal 03, vor dem Merge von seite 02 auf `dev`) dieselbe Regel für Referrer, Adresse, eigene Liste und `POST /v1/auth/verify` mit 200 schon enthält.
Beleg: `git grep -n -F 'Conway-Research(/|$)' origin/dev -- ops/` -> `ops/github-yield.sh:74` und `ops/landing-yield.sh:40` | ops/github-yield.sh:58 bis :67, :95, :114 gegen ops/landing-yield.sh:69 bis :76, :103, :134
Empfehlung: Die gemeinsame Regel (Log lesen, Adresse aus `client_ip` oder `remote_ip`, eigene Liste, Referrer, Anmeldung) in einen Helfer unter `ops/` ziehen, den beide Werkzeuge rufen; je Werkzeug bleibt nur Fenster, Frist und Ausgabe.
MVP: Schönheit

Linse Q, Frage 2 (Logik-Duplikate). Die Kopien laufen schon auseinander: github-yield prüft den Referrer mit `re.I` (:74), landing-yield ohne; github-yield bricht bei leerer eigener Liste mit Exit 2 ab (:66 bis :67), landing-yield zählt dann eigene Adressen als fremd. Das Urteil im nächsten Glied (`docs/seite/conway-ankuenfte.md`) und der Ertrag von kanal 03 messen damit dieselbe Ankunft nach zwei Regeln.
Abgrenzung: kanal-kritik-2026-11-12-3 und -4 betreffen Issue-Pfad und Wallet-Zählung in github-yield, nicht die Kopie.
Übernommen: Triage-Glieder 14.11. an den Tech Lead, Glied 7 (`ops/landing-yield.sh` liest die eigene Liste direkt und bricht bei leerer Liste nicht ab) (2026-11-14)
