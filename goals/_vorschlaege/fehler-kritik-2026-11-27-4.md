Schwere: 3
Goal: fehler 14
Befund: `test/no-customer-revenue.test.ts` lässt jeden Betrag hinter „Summe aller …: “ durch, auch wenn die Summe nur einen Kunden umfasst; ein Bericht kann so den Betrag eines einzelnen Kunden mit diesem Vorsatz nach `dev` bringen.
Beleg: test/no-customer-revenue.test.ts, Konstante `ALLOWED_BEFORE`, Eintrag `Summe (?:aller|über alle) [^.;:]*: $`
Empfehlung: Eine Summe gilt nur als Summe über alle, wenn derselbe Absatz die Zahl der Adressen oder Zahler mit mindestens 2 nennt oder die Summe hinter „Summe aller“ auf eine Zählung ab 2 verweist; Gegenprobe mit „Summe aller fremden Kunden: <Betrag> (1 Adresse)“ als Treffer.
Übernommen: Tech Lead, PRO-32469 Glied 1 (2026-11-28)
