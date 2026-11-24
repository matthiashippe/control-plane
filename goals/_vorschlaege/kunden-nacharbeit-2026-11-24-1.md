Schwere: 2
Goal: kunden 13
Befund: `HOUSE_RUNTIME_KEY_NAME` in `src/bounties/house.ts` ist nach kunden 13 ein toter Export: Die Datei selbst nutzt nur noch `RUNTIME_KEY_NAME`, und weder ein Test noch ein Werkzeug liest den Alias, auch nicht vor kunden 13, obwohl die Goal-Datei ihn behält, „damit bestehende Tests unverändert laufen“.
Beleg: `git grep -n HOUSE_RUNTIME_KEY_NAME origin/dev -- src test ops scripts` -> nur `src/bounties/house.ts:56: export const HOUSE_RUNTIME_KEY_NAME = RUNTIME_KEY_NAME;` und `git grep -n HOUSE_RUNTIME_KEY_NAME 354a326^1 -- test ops scripts` -> keine Ausgabe | src/bounties/house.ts:56
Empfehlung: Den Alias samt Kommentar in `src/bounties/house.ts:52` bis `:56` streichen, damit der Name des Runtime-Schlüssels nur noch als `RUNTIME_KEY_NAME` in `src/credits/starter.ts` steht.

Zwei Namen für denselben Wert laden ein späteres Goal ein, wieder den falschen zu importieren; genau diese Lücke hatte kunden-kritik-2026-11-22-4 beschrieben.

Linse Q, Frage 3.
