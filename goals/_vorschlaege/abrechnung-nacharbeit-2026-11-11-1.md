Schwere: 1
Goal: abrechnung 01
Befund: Der Selbsttest von `ops/live.sh` belegt den Zweig „doppelt gutgeschrieben“ nicht, weil der Fall `split` statt zweier Hälften der richtigen Summe 2 mal 39614 = 79228 mc pflanzt und schon an der Summenprüfung scheitert.
Beleg: `git show origin/dev:ops/live.sh | sed 's/elif \[ "\$n" -gt 1 \]/elif false/' > ops/live-mut.sh && bash ops/live-mut.sh --selftest | tail -1` (im Checkout an origin/dev, danach `rm ops/live-mut.sh`) -> `LIVE SELFTEST OK` | ops/live.sh:108
Empfehlung: Im Fall `split` zwei Zeilen mit 39614 und 39615 mc pflanzen (der Plant-Schritt braucht dafür je Zeile einen eigenen Betrag), damit nur der Zweig `n -gt 1` sie als FAIL meldet.
MVP: Schönheit

Linse Q, Frage 1 (Randfall), dazu Grundregel 3 (Messwerkzeug in beide Richtungen bewiesen). Kommentar ops/live.sh:104 kündigt „two halves of the right sum“ an, 79229 ist ungerade.
Mit dem Zweig auf `false` melden `double` und `split` weiter FAIL, aber nur über „credit over 158458 mc“ bzw. „79228 mc“.
In der Produktion verhindert der Index `ledger_refund_once` eine zweite Zeile ohnehin, darum Schwere 1.
Hinweis stand schon im Verdict goals/abrechnung/verdicts/01-z4-K.md:39 als Vorschlag für die Nacharbeit.

Verworfen: MVP Schönheit, Schwere 1, in der Produktion verhindert ledger_refund_once die zweite Zeile (2026-11-12)
