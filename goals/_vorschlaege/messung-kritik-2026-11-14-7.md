Schwere: 2
Goal: messung 04
Befund: Der Wächter `test/own-ips-readers.test.ts` sucht nur den Dateinamen `own-ips.txt`. Ein Werkzeug, das `ops/own-ips.sh` sourct und dann die Datei aus `$CP_OWN_IPS_FILE` selbst mit `awk`, `grep` oder `open` liest, umgeht `own_ips` genauso (ohne live gesehene Adresse, ohne `CP_OWN_IPS_SEEN`) und bleibt grün. Heute tut das `ops/deploy-window.sh` im Weg `--log` (Zeile 191); `ops/actions-log-addresses.sh` tut es bewusst (Annahme in messung 04).
Beleg: `grep -rn 'CP_OWN_IPS_FILE' ops --include=*.sh | grep -v '^ops/own-ips.sh'` zeigt `ops/deploy-window.sh:191` mit `awk '!/^#/ && NF {print $1}' "$CP_OWN_IPS_FILE"`.
Empfehlung: Ein späteres Glied messung: `ops/deploy-window.sh --log` zählt zusätzlich die Adressen aus `CP_OWN_IPS_SEEN` (ohne ssh), und der Wächter meldet auch jede Zeile außerhalb eines Kommentars, die `CP_OWN_IPS_FILE` an `awk`, `grep`, `cat` oder `open` gibt, mit einer benannten Ausnahmeliste (`ops/actions-log-addresses.sh`, die Prüfung der Liste in `ops/timeout-quote.sh` und `ops/anzeigen-rechnung.py`).
MVP: Funktion, weil das Fenster nach einem Rollout sonst eine eigene Prüfung von gestern als Fremden mit Fehler melden kann.
