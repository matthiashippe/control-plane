Schwere: 1
Goal: abrechnung 04
Befund: `ops/abort-purchase.sh` setzt `ROOT` und liest die Variable nirgends, und `--help` schneidet den Kopfkommentar nach Zeile 40 ab, sodass der Absatz zu Management-Key und `readonly: true` fehlt.
Beleg: `git show origin/dev:ops/abort-purchase.sh | grep -c ROOT` -> `1` | ops/abort-purchase.sh:48 (einzige Fundstelle) und :304 (`sed -n '2,40p'`, der Kommentar reicht bis :45)
Empfehlung: Zeile 48 streichen und `--help` auf `sed -n '2,45p'` setzen oder den Kopf bis zur ersten Nicht-Kommentarzeile ausgeben.
MVP: Schönheit

Linse Q, Frage 3 (tote Pfade, ungenutzte Variablen). `ROOT` wird vor `set -a` gesetzt, also auch nicht exportiert, und weder `calc` noch `production` noch `selftest` lesen es. Die abgeschnittene Hilfe sieht man mit `bash ops/abort-purchase.sh --help | tail -2` (am Merge 24cc376): nach dem Satz zu `purchase without sale` folgt nur eine Leerzeile, der Absatz „The provider is asked once …“ kommt nicht mehr.
