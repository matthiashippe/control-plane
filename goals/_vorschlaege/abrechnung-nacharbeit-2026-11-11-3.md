Schwere: 1
Goal: abrechnung 03
Befund: `--compare` kopiert den Filter der Caddy-Anfragen und die Zuordnung Anfrage zu eigener Zeile wörtlich aus dem Join, dazu die Shell-Funktion `production()` als `compare()`, statt beides zu teilen.
Beleg: `git grep -n -F 'if (x.used || x.t < r.start - 1 || x.t > r.end + 15) continue;' origin/dev -- ops/` -> `ops/timeout-quote.sh:101` und `ops/timeout-quote.sh:152` | ops/timeout-quote.sh:93 und :138 (Filter), :254 bis :267 und :269 bis :282 (Shell)
Empfehlung: Filter und Zuordnung als eine Funktion in `COUNT_JS` (etwa `chatRequests(text)` und `ownRow(r, rs)`), die `join` und `compare` beide rufen; `production()` und `compare()` auf eine Funktion mit dem Modus als Argument.
MVP: Schönheit

Linse Q, Frage 2. Das Goal heißt „auf derselben Grundlage“: Ändert ein späteres Goal das Fenster (2 s, 15 s) nur in einem Modus, zählen `--join` und die Spalte `caddy` still verschieden.
Abgrenzung: abrechnung-kritik-2026-11-10-5 verlangt eine Gegenrechnung `caddy` gegen `--join`, abrechnung-kritik-2026-11-10-6 die Laufzeit des Abgleichs; die Kopie nennt keiner.

Übernommen: Watch List in STATE.md, abrechnung 05 baut join und compare gemeinsam um (2026-11-12)
