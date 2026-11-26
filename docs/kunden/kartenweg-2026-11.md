# Kartenweg: die Woche vor dem Release mit der Kartenzeile

kunden 15. Gemessen wird, wie viele Menschen den Kartenlink `/card/<paket>` öffnen, bevor die Runtime des Pakets ihrem Menschen
die Zeile „No crypto needed: pay by card, PayPal or Apple Pay at <Link>“ selbst ins Terminal schreibt. Das Folge-Glied misst
dasselbe ab dem Release unten mit demselben Werkzeug.

Gemessen: 2026-11-26T16:29:51Z

Werkzeug: `ops/card-visits.sh` (Caddy-Zugriffslog samt gedrehter Dateien über `ops/access-log.sh`, eigene Adressen über
`own_ips`, Selbsttest in beide Richtungen mit `--selftest`), dazu die erste Zeile von `ops/card-orders.sh`. Beides liest nur.

$ bash ops/card-visits.sh --since 2026-11-19T14:30:00Z --until 2026-11-26T14:30:00Z

```
CARD VISITS since 2026-11-19T14:30:00Z until 2026-11-26T14:30:00Z: 0 by people, 3 by bots, 3 from own addresses
MAINTAINED 402 since 2026-11-19T14:30:00Z until 2026-11-26T14:30:00Z: 4380 answers 402 on /v1/chat/completions to automaton-maintained runtimes
MAINTAINED 402 VERSION automaton-maintained/0.2.2-maintained.1: 4380
```

$ bash ops/card-orders.sh | head -1

```
card_orders live 0 test 9 booked 0 unassigned 0 pending_rate 0 reversed 0
```

Vorher: 0 Abrufe von /card durch Menschen, 3 durch Bots, 4380 Antworten 402 an Runtimes des Pakets, 0 Kartenkäufe live

Menschen und Bots stimmen mit dem Richtungs-Check vom 26.11.2026 überein (0 Menschen, 3 Abrufe eines Bots). Der Richtungs-Check
nennt 4395 Antworten 402, weil er bis 14:41 UTC zählte und dieses Fenster um 14:30 UTC endet: Mit
`bash ops/card-visits.sh --since 2026-11-19T14:30:00Z --until 2026-11-26T14:41:00Z` zählt das Werkzeug genau 4395, alle an die
Version `0.2.2-maintained.1`.

Release: v0.2.2-maintained.3
