Schwere: 3
Goal: betrieb 03
Befund: `ops/claim-keyless.sh` liest die eigenen Adressen direkt aus `ops/own-ips.txt` statt über `own_ips`, und kanal 05 plant dasselbe; beide sehen weder die live gesehene Adresse noch die Adressen, die `own_ips` nach betrieb 03 Punkt 4 außerhalb des Checkouts merkt, und zählen eigene Anfragen der letzten Wochen als fremde.
Beleg: ops/claim-keyless.sh:71 (`own_ips=$(cat ops/own-ips.txt …)`) | ROADMAP.md, Zeile kanal, Glied 05 („gegen `ops/own-ips.txt` gehalten“) | `git log -1 --format=%ad -- ops/own-ips.txt` -> 2026-09-23
Empfehlung: `ops/claim-keyless.sh` sourct `ops/own-ips.sh` und nimmt `own_ips`, Test mit nachgebautem `ssh` und einer Adresse nur in der Datei aus `CP_OWN_IPS_SEEN`, rot vor dem Fix; das Glied kanal 05 nennt `own_ips` statt der Datei.
MVP: Funktion, weil eine eigene Anfrage, die als fremde zählt, genau die Zahl verfälscht, an der kanal und seite ihren Ertrag messen.
