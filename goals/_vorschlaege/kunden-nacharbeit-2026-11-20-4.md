Schwere: 1
Goal: kunden 04
Befund: kunden 04 bringt `ops/traffic.sh` von 1415 auf 1511 Zeilen, ohne dass eine Commit-Message des Goal-Branches die Größe über 500 Zeilen begründet; der neue Block der Ankünfte liest das Log dabei in einer fünften eigenen Schleife (JSON-Zeile, eigene Adressen, erste Anfrage je Adresse).
Beleg: `git show e77dac76^1:ops/traffic.sh | wc -l; git show e77dac76:ops/traffic.sh | wc -l` -> `1415`, `1511`; `git log e77dac76^1..e77dac76^2 --format=%B | grep -ciE '500|Zeilen'` -> `0`; `git grep -c 'for raw in open(sys.argv\[1\]' -- ops/traffic.sh` -> `ops/traffic.sh:5` | ops/traffic.sh:306
Empfehlung: Den Block `ARRIVALS` als eigene Datei `ops/traffic-arrivals.py` ablegen, die `traffic.sh` aufruft; sonst die Größe in der nächsten Commit-Message an der Datei begründen. Die doppelte Liste der Hosts in demselben Block steht schon in `kunden-kritik-2026-11-19-6.md`.
MVP: Schönheit
Verworfen: MVP Schönheit, Größe von ops/traffic.sh ohne Fehler im Verhalten; die doppelte Host-Liste steht über kunden-kritik-2026-11-19-6 auf der Watch List (Loop-Triage PRO-25822) (2026-11-20)
