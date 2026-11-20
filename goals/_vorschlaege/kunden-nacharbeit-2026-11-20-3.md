Schwere: 1
Goal: kunden 03
Befund: `ops/db-report.cjs` wächst mit kunden 01, 02 und 03 von 708 über 770 und 827 auf 901 Zeilen, ohne dass eine Commit-Message der drei Goal-Branches die Größe über 500 Zeilen begründet.
Beleg: `for m in 36608126 ecf0a4a8 10d02e83; do git show $m^1:ops/db-report.cjs | wc -l; git show $m:ops/db-report.cjs | wc -l; done` -> `708 770`, `770 827`, `827 901`; `git log 10d02e83^1..10d02e83^2 --format=%B | grep -ciE '500|Zeilen'` -> `0` (ebenso für 36608126 und ecf0a4a8) | ops/db-report.cjs:262
Empfehlung: Die beiden JSON-Berichte `CP_REPORT=decline` und `CP_REPORT=wallets` (Zeilen 262 bis 378) in eigene Dateien unter `ops/` ziehen, die `oursClause` und die Hilfen aus einer gemeinsamen Datei holen; das passt zu `kunden-nacharbeit-2026-11-20-1.md` und `-2.md`. Sonst die Größe in der nächsten Commit-Message an der Datei begründen.
MVP: Schönheit
Verworfen: MVP Schönheit, Größe von ops/db-report.cjs ohne Fehler im Verhalten (Loop-Triage PRO-25822) (2026-11-20)
