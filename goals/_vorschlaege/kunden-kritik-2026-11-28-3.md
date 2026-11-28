Schwere: 2
Goal: kunden 19
Befund: In der Shell von Claude Code auf dem code-host ist `grep` eine Funktion auf ugrep, die `$` mitten im Muster als Zeilenende liest. Der Prüfbefehl `grep -c "json_extract(meta, '\$.usd')" ops/db-report.cjs` gibt dort 0 statt 2 (GNU grep), ein Maker oder eine Linse kann so einen grünen Punkt als rot lesen oder umgekehrt. `docs/loop-fallen.md` nennt die Falle nicht.
Beleg: Progress Log von `goals/kunden/19-bringen-der-befehl-zum-update-und-die-stufe-1-usd-eine-zahlung.md`, Zyklus 2 | `goals/kunden/ANNAHMEN.md`, letzte Zeile kunden 19
Empfehlung: Ein Absatz in `docs/loop-fallen.md`: Prüfbefehle mit `grep` in der Shell von Claude Code mit `/usr/bin/grep` oder `command grep` fahren; neue Goal-Dateien schreiben `/usr/bin/grep` in Prüfbefehle mit `$`, `\b` oder `\|`.
MVP: Funktion, weil ein falsch gelesener Prüfbefehl eine Linse zu einem falschen Urteil bringt und einen Zyklus kostet.
