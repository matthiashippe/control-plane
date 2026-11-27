Schwere: 5
Goal: fehler 14
Befund: Die Goal-Datei kunden 02 (DONE, eingefroren, im Scan von `test/no-customer-revenue.test.ts`) nennt in Zeile 8 die eine fremde Zahlung einer Woche als Betrag, also den Betrag eines einzelnen Kunden (Grundregel 8); fehler 14 darf sie nicht ändern, und der neue Punkt 6 fängt die Form „eine fremde Zahlung über <Betrag>“ nicht.
Beleg: `git grep -c -E 'eine fremde Zahlung über [0-9]' origin/dev -- goals/kunden/02-wer-bei-conway-noch-zahlt.md` -> 1 | goals/kunden/02-wer-bei-conway-noch-zahlt.md:8
Empfehlung: Folge-Glied an fehler: den Betrag in kunden 02 Zeile 8 wie in Entscheidung 2 von fehler 14 als `*.**` maskieren (Grundregel 8 geht dem Einfrieren vor, kein Prüfbefehl von kunden 02 nennt ihn) und im Test `eine (fremde )?Zahlung über <Betrag>` als Betrag je Kunde melden, Gegenprobe mit erfundenem Betrag.
