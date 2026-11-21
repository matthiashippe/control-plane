Schwere: 1
Goal: abrechnung 07
Befund: `ops/answer-quote.sh --help` druckt als letzte Zeile `set -uo pipefail`, weil `sed -n '2,29p'` eine Zeile über den Kopfkommentar hinaus liest.
Beleg: `bash ops/answer-quote.sh --help | tail -1` -> set -uo pipefail | ops/answer-quote.sh:200
Empfehlung: Beim nächsten Goal, das `ops/answer-quote.sh` ohnehin ändert, den Kopf bis zur ersten Zeile ohne `#` lesen (`sed -n '2,/^[^#]/p' "$0" | sed '$d'`) statt fester Zeilennummern; kein eigenes Goal.
MVP: Schönheit, weil nur die Hilfe betroffen ist.
