Schwere: 3
Goal: abrechnung 02
Befund: Quote vorher und Quote nachher zählen nicht dasselbe. Vorher zählt jede Anfrage im Caddy-Log (auch Wiederholungen, die der Coalescer mit einer laufenden Antwort bedient), nachher nur Zeilen in Ledger und `inference_aborts`, die je Leader genau eine Zeile haben; die Grenze 59,5 s gilt vorher auf Caddys Uhr, nachher auf der Uhr des Dienstes, die erst nach Auth und Reservierung startet.
Beleg: `ops/timeout-quote.sh` Zeile 97 (Join auf Caddy-Zeilen) gegen Zeile 106 (nur Datenbankzeilen); `src/inference/proxy.ts` Zeile 399 (`startedAt` nach der Reservierung).
Empfehlung: Beim ersten Vergleich nach dem Rollout beide Messungen nebeneinander fahren (`bash ops/timeout-quote.sh` mit Join und `--since-rollout` über denselben Zeitraum) und die Abweichung in `docs/abrechnung/timeouts.md` nennen, bevor kanal 01 oder die Seite eine Quote nennt.
MVP: Funktion, weil die Zahl nachher die ist, die nach außen geht.

Übernommen: abrechnung 03 (DONE, docs/abrechnung/timeouts.md) (2026-11-11)
