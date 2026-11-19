Schwere: 3
Goal: sandbox 12
Befund: `evaluate` in `probe.sh` kennt für jede Prüfung der Art `allow` nur den Grund `FAIL not reached`. Bei `cookie_domain` heißt FAIL aber fast immer, dass die Cookies ankamen und `Domain` noch trugen; die Zeile `Vorher: PROBE cookie_domain FAIL not reached` in `docs/sandbox/ports.md` sagt darum das Gegenteil dessen, was gemessen wurde, und der Maker musste die Wahrheit über stderr (`cookie_domain got: …`) nachreichen.
Beleg: docs/sandbox/ports.md, Abschnitt `## Cookies`, Zeile `Vorher:` | goals/sandbox/ANNAHMEN.md, `## Goal 12`, „Angekommene Cookies auf stderr“
Empfehlung: `RAW <name> allow <0|1> [<grund>]` mit optionalem Grund, den `evaluate` statt `not reached` druckt; `cookie_domain` meldet `domain kept`, `missing` oder `changed`, der Selbsttest deckt jeden Grund ab.
