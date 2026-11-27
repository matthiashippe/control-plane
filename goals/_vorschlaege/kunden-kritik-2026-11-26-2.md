Schwere: 3
Goal: kunden 14
Befund: Vier Glieder der Kette kunden (08, 11, 13, 14) bauen darauf, dass Kunde 1 über Hausaufträge Guthaben verdient, und kunden 14 zeigt jetzt gemessen, dass die unveränderte Runtime am Pin `d8f8168` kein Werkzeug für Aufträge hat und Kunde 1 trotz Schrittguthaben und 10 bezahlten Antworten nie einreichte; die Empfehlung des Goals führt die Kette trotzdem am selben Kunden und Weg weiter.
Beleg: goals/_vorschlaege/kunden-kritik-2026-11-26-1.md:17 auf origin/goal/kunden-14 (`grep -rni bount src` im Klon findet keine Zeile) | docs/kunden/einreichen-2026-11.md:24 bis 26 auf origin/goal/kunden-14 (288 Lesungen, 0 Aufrufe zum Einreichen in 48 Stunden) | ROADMAP.md:18 (Leitzahl fremde Inferenz-Ausgabe 24,77 USD, dann 7,61 USD je Woche; an Conway fließen weiter 215 USDC von 16 Wallets in 30 Tagen)
Empfehlung: Das Folge-Glied von kunden 14 baut nicht weiter am Hausauftrag für Kunde 1, sondern setzt an den Wallets an, die bei Conway noch aufladen, oder an einem Weg, den die unveränderte Runtime von selbst geht (402 mit Aufladung); der Tech Lead entscheidet das vor dem Schreibauftrag für kunden 15.

Das Produkt verspricht, dass eine unveränderte Runtime bei uns ohne Änderung weiterläuft (`LOOP.md`, Produkt in einem Satz). Ein Weg, auf dem ihr Modell einen Auftrag erst über `exec` oder `x402_fetch` selbst erfinden muss, erreicht keinen weiteren Kunden und bei Kunde 1 nach vier Gliedern keine Zahlung.
Übernommen: Tech Lead, PRO-31352 Glied 3 (2026-11-27)
