Schwere: 2
Goal: messung 07
Befund: `own_ips`, `own_ips_offline` und die Vorprüfungen in `ops/timeout-quote.sh` und `ops/keyless-mints.sh` zählen jede Zeile der Liste, die nicht in Spalte 0 mit `#` beginnt, als Adresse; eine eingerückte Kommentarzeile `  # alt` liefert `#` als eigene Adresse, und eine Liste, die nur noch solche Zeilen trägt, endet nicht mit 2, sondern mit 0 und den Adressen aus `CP_OWN_IPS` und der Merkdatei.
Beleg: `printf '  # x\n' > $T/l; printf '192.0.2.44 d\n' > $T/s; env -u CP_OWN_IPS CP_OWN_IPS_FILE=$T/l CP_OWN_IPS_SEEN=$T/s bash -c 'source ops/own-ips.sh; own_ips_offline'; echo $?` -> `# 192.0.2.44 0` | ops/own-ips.sh (`_own_ips_listed`, `grep -v '^#'`)
Empfehlung: Ein Glied messung: `_own_ips_listed` und `_own_ips_seen` geben nur ein erstes Feld weiter, das eine IPv4- oder IPv6-Adresse ist, und die Vorprüfungen der drei Werkzeuge nutzen dieselbe Regel; ein Test mit eingerückter Kommentarzeile und Kopfzeile erwartet Exit 2 bei sonst leerer Liste, rot vor dem Fix.
MVP: Funktion, weil eine geleerte Liste sonst still als vollständige gelesen wird und eigene Prüfungen als Fremde zählen.
