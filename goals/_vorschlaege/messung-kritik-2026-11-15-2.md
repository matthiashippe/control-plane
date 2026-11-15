Schwere: 2
Goal: messung 07
Befund: Der Wächter in `test/own-ips-readers.test.ts` prüft je Zeile, ob `CP_OWN_IPS_FILE` und ein Leser zusammen stehen; ein Werkzeug, das den Pfad erst einer Variable gibt (`f="$CP_OWN_IPS_FILE"` und eine Zeile später `awk … "$f"`), liest die Liste an `own_ips` vorbei und bleibt grün, so wie heute `ops/timeout-quote.sh:62` und `ops/actions-log-addresses.sh:48`, die nur als benannte Ausnahme gedeckt sind.
Beleg: test/own-ips-readers.test.ts (`readsListFileDirectly`, Prüfung je Zeile) | ops/conway-arrivals.sh:26 (`file="${CP_OWN_IPS:-$CP_OWN_IPS_FILE}"`)
Empfehlung: Ein Glied messung: Der Wächter verfolgt je Datei die Variablen, denen `CP_OWN_IPS_FILE` zugewiesen wird, und meldet jeden Leser auf einer dieser Variablen außerhalb von `own_ips`-Aufrufen und der Ausnahmeliste; Matcher-Test mit dem Zwei-Zeilen-Fall, rot vor dem Fix.
MVP: Funktion, weil das Ziel aus messung 07 („kein künftiges Werkzeug liest die Liste an own_ips vorbei“) sonst an der Schreibweise des nächsten Werkzeugs hängt.
