Schwere: 3
Goal: keines
Befund: Sieben Skripte unter `ops/` prüfen mit `printf '%s' "$x" | grep -q` unter `set -o pipefail`; endet `grep -q` nach dem Treffer, bekommt `printf` SIGPIPE, und die Bedingung kippt unter Last, obwohl die Zeile da ist.
Beleg: `git grep -nE "printf '%s' \"\\\$[^\"]+\" \| (/usr/bin/)?grep -q" -- ops` -> Treffer in ops/conway-zustand.sh:44 und 52, ops/cron-points-somewhere.sh:32, ops/jobs.sh:26, ops/own-briefs.sh:32, ops/sperren.sh:34, ops/stranger-client.sh:42, 44, 56 und 66, ops/visibility.sh:182 | ops/traffic.sh:118 (dasselbe Muster machte `check` an PR #334 rot, Lauf 44889180559; nachgestellt mit 4 Bahnen auf `taskset -c 0`: 13 von 6000 Läufen rot)
Empfehlung: An jeder Stelle `grep -q … <<<"$x"` statt der Pipe, wie in PR #335 für ops/traffic.sh. In ops/conway-zustand.sh:44 kann das Race ein `PROVISIONIERUNG FAIL` verschlucken; das ist ein Messwerkzeug, das in eine Richtung blind wird.
MVP: Funktion, weil ein Messwerkzeug, das unter Last ein FAIL verschluckt, eine falsche Null liefert (Vorfall 22.09.2026).
