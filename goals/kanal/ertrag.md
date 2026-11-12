# Kanal: was die erste Runde Antworten gebracht hat

Runde 1 sind die drei Antworten vom 2026-11-11 (#434 um 07:04:50 UTC, #430 um 07:06:23 UTC, #427 um 07:07:57 UTC, Zeilen in
`ops/posted-answers.log`). Gemessen am 2026-11-12 um 17:18 UTC gegen die Produktion, nur lesend, nur Summen.

Ertrag Runde 1: 0 kamen von github.com/Conway-Research, 0 angemeldet, 0 gezahlt, Zeitraum 2026-11-11T07:04:50Z bis 2026-11-12T17:18:46Z
Alle neuen: 283 Wallets, 1 zahlend, Zeitraum 2026-11-11T07:04:50Z bis 2026-11-12T17:18Z

Befehl, aus dem beide Zeilen stammen:

```
set -a; . ~/.config/control-plane/loop.env; set +a
bash ops/github-yield.sh --since 2026-11-11T07:04:50Z
```

Ausgabe am 2026-11-12T17:18:43Z:

```
GITHUB YIELD since 2026-11-11T07:04:50Z: 0 arrived from github.com/Conway-Research, 0 signed in, 0 paid
ALL NEW since 2026-11-11T07:04:50Z: 283 new wallets, 1 paying wallets
BARE GITHUB REFERRER since 2026-11-11T07:04:50Z: 0 arrived from https://github.com/ without a path, 0 signed in, 0 paid
WINDOW since 2026-11-11T07:04:50Z: 24304 log line(s), 512 foreign address(es), up to 2026-11-12T17:18:46Z UTC
```

Die erste Zeile ist die untere Grenze: Sie zählt nur Adressen, deren erste Anfrage im Zeitraum den Referrer eines Issues von
Conway-Research trug. Ein Betreiber, der nur `conwayApiUrl` umstellt, ohne die Seite zu öffnen, fehlt darin. Die zweite Zeile ist die
obere Grenze: jede Wallet, die im Zeitraum angelegt wurde, darunter unsere eigenen Prüfläufe (`ops/smoke.sh` und weitere Werkzeuge
melden sich mit Wegwerf-Wallets an), davon zahlend jede mit mindestens einer Ledger-Zeile `topup`.

Die Null ist gemessen und nicht blind, in beide Richtungen belegt am selben Tag:

- Dasselbe Werkzeug gegen die Produktion ab 2026-10-01 (`bash ops/github-yield.sh --since 2026-10-01T00:00:00Z | head -1`) zählt
  7 Ankünfte von github.com/Conway-Research, 0 angemeldet, 0 gezahlt. Das Zugriffslog reicht bis 2026-10-01 zurück und trägt den
  Referrer, das Werkzeug sieht ihn.
- Eine Kopie des Produktionslogs (`ops/access-log.sh`) mit einer angehängten Ankunft von einer Dokumentationsadresse mit Referrer
  `https://github.com/Conway-Research/automaton/issues/434` und einem `POST /v1/auth/verify` mit 200 ergibt
  `1 arrived from github.com/Conway-Research, 1 signed in, 0 paid`, dieselbe Kopie ohne die zwei Zeilen
  `0 arrived from github.com/Conway-Research, 0 signed in, 0 paid`.
- Im Zeitraum trägt keine einzige Zeile des Logs einen Referrer mit `github`, auch nicht den nackten `https://github.com/`.

Regel: Bringen die Posts vom 2026-11-11 bis 2026-11-25 keine Anmeldung mit diesem Referrer (untere Zahl, Spalte angemeldet), ist die
nächste Runde kein Antwortpaket, sondern ein anderer Kanal. Der Zwischenstand oben spricht bisher dafür (0 Ankünfte nach gut 34
Stunden); das Urteil fällt am 2026-11-25 im nächsten Glied mit demselben Befehl.
