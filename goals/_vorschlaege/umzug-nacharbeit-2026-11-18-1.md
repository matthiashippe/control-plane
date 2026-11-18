Schwere: 2
Goal: umzug 01
Befund: `ops/site-dns.py` kopiert das Lesen des Cloudflare-Tokens aus `secrets.env` und den HTTP-Aufruf samt Fehlerbehandlung fast Zeile für Zeile aus `ops/sandbox/cloudflare.py` (`token`, `call`), statt beides zu teilen.
Beleg: `git grep -n -F 'codes = [(e.get("code"), e.get("message")) for e in out.get("errors") or []]' origin/dev -- ops/` -> `ops/sandbox/cloudflare.py:87`, `ops/site-dns.py:57` | ops/site-dns.py:29 bis :58 gegen ops/sandbox/cloudflare.py:61 bis :89
Empfehlung: Token und Aufruf in ein gemeinsames Modul unter `ops/` legen (etwa `ops/cloudflare_api.py` mit `token(name)` und `call(name, method, path, body)`), das beide Skripte importieren; die Sperre auf GET und POST bleibt in `ops/site-dns.py` als Hülle um den gemeinsamen Aufruf.
MVP: Schönheit
Verworfen: MVP: Schönheit ohne belegten Fehler; die Kopie ändert kein Verhalten (2026-11-18)
