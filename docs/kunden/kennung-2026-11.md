# Kennung: die gepflegten Runtimes seit dem Release v0.2.2-maintained.3

kunden 17. Gemessen wird, welche Kennungen `automaton-maintained/<version>` seit dem Release `v0.2.2-maintained.3`
(veröffentlicht 2026-11-26T17:28:50Z, `gh release view v0.2.2-maintained.3 -R matthiashippe/automaton`) Antworten 402 bekamen,
bevor die 402 an eine ältere Kennung den Befehl zum Update nennt. Das ist die Zahl vorher; das Folge-Glied misst mit demselben
Werkzeug ab dem Rollout dieses Goals.

Gemessen: 2026-11-27T20:06:41Z. Ende des Fensters ist der Start des Goals (Child PRO-32052 angelegt 2026-11-27T19:56:12Z).

Werkzeug: `ops/card-visits.sh` (Caddy-Zugriffslog samt gedrehter Dateien über `ops/access-log.sh`, eigene Adressen über
`own_ips`), liest nur. Vorher in beide Richtungen bewiesen mit `bash ops/card-visits.sh --selftest`: Exit 0, letzte Zeile
`SELFTEST OK: every planted case counted or left out as planted, in both directions`, darunter die Fälle „the same 402 to
automaton-maintained is counted, so the agent rule is what keeps node out“ und „two versions are counted separately, in natural
order, the query does not change the path“. Eine neue Kennung wäre also als eigene Zeile erschienen.

$ bash ops/card-visits.sh --since 2026-11-26T17:28:50Z --until 2026-11-27T19:56:12Z 2>&1

```
card-visits: 14135 log line(s) in the window, 335422 read, 0 not access lines
CARD VISITS since 2026-11-26T17:28:50Z until 2026-11-27T19:56:12Z: 0 by people, 0 by bots, 0 from own addresses
MAINTAINED 402 since 2026-11-26T17:28:50Z until 2026-11-27T19:56:12Z: 1780 answers 402 on /v1/chat/completions to automaton-maintained runtimes
MAINTAINED 402 VERSION automaton-maintained/0.2.2-maintained.1: 1780
```

Exit-Code 0. Die Zeilen ohne Einrückung, damit `grep` sie am Zeilenanfang findet:

MAINTAINED 402 since 2026-11-26T17:28:50Z until 2026-11-27T19:56:12Z: 1780 answers 402 on /v1/chat/completions to automaton-maintained runtimes
MAINTAINED 402 VERSION automaton-maintained/0.2.2-maintained.1: 1780

Neue Kennung seit dem Release: nein, 0 Antworten 402 an 0.2.2-maintained.2 oder neuer

Alle 1780 Antworten 402 an gepflegte Runtimes in den gut 26 Stunden seit dem Release gingen an die alte Kennung
`0.2.2-maintained.1`, wie die 4380 der Woche davor (`docs/kunden/kartenweg-2026-11.md`). Keine Runtime hat sich auf die Fassung
mit der Kartenzeile gebracht, und niemand hat den Kartenlink geöffnet. Leitzahl vorher: 1780 Antworten 402 an ältere Kennungen
ohne Befehl zum Update, 0 gepflegte Runtimes mit der neuen Kennung.
