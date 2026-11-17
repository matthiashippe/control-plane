Schwere: 3
Goal: umzug 01
Befund: Die Middleware entfernt Port und Punkt am Ende aus dem Host (`postyourprice.com:443`, `automatonhost.com.`), aber kein Fall prüft das; fällt die Normalisierung bei einem Umbau weg, sieht ein Besucher dieselbe Seite wieder unter zwei Namen.
Beleg: `src/app.ts` Zeile mit `.replace(/\.$/, "").replace(/:\d+$/, "")`; `grep -n ':443\|com\.\"' test/automatonhost.test.ts` findet nichts
Empfehlung: Im nächsten umzug-Goal zwei Fälle in `test/automatonhost.test.ts`: Host mit `:443` und Host mit Punkt am Ende werden wie der nackte Host weitergeleitet.
