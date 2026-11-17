Schwere: 2
Goal: konto 04
Befund: konto 04 kopiert den Browser-Treiber (`findChrome`, `launch`) ein fünftes und sechstes Mal nach `ops/soll-limit.mjs` und `ops/konto/sepolia-limit-run.mjs`, und die Kopien laufen schon auseinander: Die Sperre gegen einen grünen Lauf nach einem beendeten Browser haben nur zwei der vier SOLL-Werkzeuge.
Beleg: `git grep -c 'if (gone) return fail(gone)' origin/dev -- ops/soll.mjs ops/soll-handoff.mjs ops/soll-konto.mjs ops/soll-limit.mjs` -> `ops/soll-handoff.mjs:1`, `ops/soll-limit.mjs:1` | ops/soll-limit.mjs:38 und :48, ops/konto/sepolia-limit-run.mjs:63 und :71, ops/soll.mjs:34 und :44, ops/soll-konto.mjs:38 und :48
Empfehlung: Den Treiber samt `gone`-Sperre in ein gemeinsames Modul unter `ops/` legen, das die vier SOLL-Werkzeuge und die beiden Sepolia-Läufe importieren.
MVP: Funktion, weil `ops/soll.mjs` und `ops/soll-konto.mjs` ohne die Sperre nach einem abgestürzten Browser 0 Mängel melden können.

Linse Q, Frage 2 (Logik-Duplikate), Merge c141093. `git grep -n -E '^(async )?function (launch|findChrome)' origin/dev -- ops` zeigt je sechs Definitionen.
