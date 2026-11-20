Schwere: 2
Goal: kunden 04
Befund: Die Leitzahl zählt jede fremde Adresse als Ankunft, auch Scanner und Crawler. Bei der ersten Messung kamen 2530 von 2615 Ankünften ohne Referrer, 2155 davon allein über postyourprice.com. Die Wochenzahl misst deshalb vor allem Verkehr von Maschinen. Für einen Kanal taugt nur die Aufteilung nach Referrer (12 über `www.google.com`, 3 über `github.com`), und die geht in der Gesamtzahl unter.
Beleg: docs/kunden/besucher.md, Block `-- Arrivals per host --` | `ops/traffic.sh` Block `ARRIVALS` filtert nur `CP_OWN_IPS_RESOLVED`, nicht das Kriterium aus `-- Who of them behaved like a person, over the whole log --`
Empfehlung: Wenn ein späteres Glied am Topic `kunden` einen Kanal an Ankünften misst: je Host zusätzlich die Ankünfte zählen, die das Personen-Kriterium des Skripts erfüllen (Seite geladen und Seitenskript gelaufen), mit einer Fixture, in der ein Scanner ohne Referrer nicht mitzählt. Leitzahl dann: Ankünfte von Personen je Woche und Herkunft.
MVP: Funktion, weil der Loop sonst einen Kanal an einer Zahl misst, die zu 97 % aus Anfragen ohne Referrer besteht.
Übernommen: Watch List in STATE.md, Ankünfte von Personen statt aller Adressen; wird Teil des Glieds, das einen Kanal an Ankünften misst (Loop-Triage PRO-25822) (2026-11-20)
