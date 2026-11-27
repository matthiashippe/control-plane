Schwere: 3
Goal: regeln 04
Befund: Das Goal begründet seine Wirkung mit „Das Konto geht mit konto 15 in die Produktion“, aber konto 15 ruht (PAUSED), und die Migration hängt die Spalten seit regeln 03 idempotent an, sodass jede Datenbank, die `openDb` seitdem geöffnet hat, sie schon trägt.
Beleg: `git show origin/dev:goals/konto/15-das-konto-ist-in-der-produktion-an.md | sed -n 4p` -> `PAUSED` | ROADMAP.md:15 („konto 15 ruht“) | goals/regeln/04-die-migration-von-konto-payouts-ist-getestet.md:26 und :29 (Platz vor konto 15) | src/db.ts:744 bis :751
Empfehlung: Das Goal ruht, bis konto 15 wieder PLANNED ist; dann zurück auf PLANNED und die Zeile „Was danach schneller zu mehr zahlenden fremden Automatons führt“ auf das schreiben, was wirklich bleibt (Schutz einer Datenbank, die vor regeln 03 gesichert wurde). Ob regeln 03 in der Produktion ausgerollt ist, kann der Maker nur lesend mit `PRAGMA table_info(konto_payouts)` belegen.
