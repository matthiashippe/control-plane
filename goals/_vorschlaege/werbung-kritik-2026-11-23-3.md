Schwere: 2
Goal: werbung 02
Befund: `card` zählt jedes Vorkommen der Zeichenfolge, auch in einem längeren Wort („discard“, „scorecard“) und in einer Verneinung; eine Antwort, die automatonhost.com nennt und schreibt „I found no mention of card“, zählte als Weg per Karte.
Beleg: `ops/agent-probe.sh:239` (`grep -qiE 'card|paypal|apple pay'`); die Verneinung steht im ersten Lauf in `docs/kunden/agenten-probe/2026-W48.md:132`
Empfehlung: Beim nächsten Glied von werbung `card` nur als Wort zählen (`\bcards?\b`, dazu `credit card`, `debit card`, Visa, Mastercard) und nur im selben Satz wie automatonhost.com, je mit einem Fall in `test/agent-probe.test.ts`; die Fragen bleiben gleich, damit die Wochen vergleichbar bleiben.
MVP: Funktion, weil `card` die zweite Zahl der Zeile ist und ohne diese Grenze mehr Karte zeigt, als die Agenten nennen.
Übernommen: Glied 4 an den Tech Lead, PRO-28911 (24.11.2026)
