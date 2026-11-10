Schwere: 2
Goal: abrechnung 03
Befund: `--compare` gleicht jede Caddy-Anfrage gegen alle Zeilen ab (O(n·m)) und bildet das Ende des Zeitraums mit `Math.max(...items)`, was ab etwa 10^5 Einträgen mit RangeError abbricht; das Caddy-Log seit dem Rollout wächst täglich.
Beleg: ops/timeout-quote.sh:148, ops/timeout-quote.sh:165
Empfehlung: Zeilen nach Zeit sortieren und mit einem gleitenden Fenster abgleichen, das Maximum mit `reduce` bilden; Selftest mit 200000 gepflanzten Zeilen unter 10 s.
MVP: Robustheit, weil der Vergleich nach sieben Tagen Verkehr der ist, der die Quote nach außen freigibt.
