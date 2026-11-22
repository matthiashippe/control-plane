Schwere: 3
Goal: kunden 08
Befund: kunden 08, das einzige Goal am einzigen zahlenden fremden Automaton, wartet auf den Kurs-Check PRO-26380, dessen Korrektur-Branch seit 06:44 UTC nicht gemergt ist, und seit 18 Stunden ist kein Goal mit Prio 1 oder 2 gemergt.
Beleg: `tools/loop-master status control-plane --json` -> waiting „kunden 08: Kurs-Check PRO-26380“, Phase `correction` | `git diff origin/dev...origin/loop/kurs/2026-11-21-0644 --stat` -> 1 Datei, 3 Zeilen
Empfehlung: Den Korrektur-Branch `loop/kurs/2026-11-21-0644` mergen, damit kunden 08 startet.
MVP: Kauf, weil kunden 08 am einzigen zahlenden Kunden misst.

Verworfen: erledigt, der Korrektur-Branch loop/kurs/2026-11-21-0644 ist gemergt (PR #327) und kunden 08 ist gemergt (PR #329) (2026-11-22)
