Schwere: 5
Goal: fehler 14
Befund: Das Goal verlangt, echte Beträge des Sandbox-Kunden als gepflanzte Testtexte dauerhaft in `test/no-customer-revenue.test.ts` zu schreiben, und nennt sie selbst schon in seiner Goal-Datei auf `dev`, entgegen Grundregel 8 (Umsatz je Kunde nie ins öffentliche Repo).
Beleg: goals/fehler/14-kein-umsatz-je-kunde-im-oeffentlichen-repo.md:61 und :85 (Entscheidung 5 und Prüfbefehl nennen zwei Beträge, die auch in docs/richtung/2026-11-26.md:21 und docs/kunden/sandbox-kunde-2026-11.md:151 als Ausgaben und Aufladungen des Kunden stehen) | loop-constraints.md:39
Empfehlung: Vor dem Start Entscheidung 5 und den Prüfbefehl in Zeile 85 auf erfundene Beträge umstellen (etwa „Kunde 9 gab 12,34 USD aus“, „dreimal 7 USD gezahlt“) und die beiden Stellen in der Goal-Datei selbst maskieren; danach das Goal sofort zurück auf PLANNED.

Der Scan aus Entscheidung 4 deckt `test/` und `goals/fehler/` nicht ab, das Goal würde den Fehler, den es beheben soll, also in einer neuen Datei festschreiben, an der kein Test anschlägt. Dieser Vorschlag nennt die Beträge bewusst nicht. Bis zur Korrektur ist das Goal pausiert.
