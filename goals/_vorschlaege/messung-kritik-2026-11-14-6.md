Schwere: 1
Goal: messung 03
Befund: `CP_OWN_IPS` heißt zweierlei: `ops/own-ips.sh` liest es als Liste von Adressen, `ops/landing-yield.sh` und `ops/github-yield.sh` (über `conway_own_list` in `ops/conway-arrivals.sh`) als Pfad einer Datei. Wer für `ops/claim-keyless.sh` oder einen anderen Aufrufer von `own_ips` eine Adresse in `CP_OWN_IPS` setzt, bekommt von beiden Ertragswerkzeugen Exit 2 („own_ips has no list“), ohne zu sehen warum. Das zählt nichts falsch, kostet aber einen Lauf und lädt dazu ein, die Variable wegzulassen.
Beleg: `grep -n 'CP_OWN_IPS:-' ops/own-ips.sh ops/conway-arrivals.sh` zeigt `printf '%s\n' "${CP_OWN_IPS:-}" | tr ' ' '\n'` neben `file="${CP_OWN_IPS:-$CP_OWN_IPS_FILE}"`.
Empfehlung: In einem späteren Goal die Datei der Werkzeuge auf `CP_OWN_IPS_FILE` umstellen (Selftests und Tests mit), `CP_OWN_IPS` dort an `own_ips` durchreichen wie überall sonst; bis dahin nennt die stderr-Zeile von `conway_own_list`, dass `CP_OWN_IPS` hier eine Datei sein muss.
