Schwere: 1
Goal: wache 03
Befund: Der Rückfall `heldFor ?? "card checkout closed"` in `src/payments/digistore.ts:348` greift nie: Eine Zeile mit Status `held` entsteht nur über das INSERT desselben Aufrufs mit gesetztem `heldFor`, und eine Wiederholung mit `held` kehrt schon im Zweig ab `:343` zurück.
Beleg: `git grep -n -E 'const status = heldFor|if \(!inserted && row.status !== "pending_rate"\)|heldFor \?\? "card checkout closed"' origin/dev -- src/payments/digistore.ts` -> `:334: const status = heldFor ? "held" : payable;`, `:343: if (!inserted && row.status !== "pending_rate") {`, `:348: log(... ${heldFor ?? "card checkout closed"})` | src/payments/digistore.ts:348
Empfehlung: `${heldFor}` ohne Rückfall loggen und die Bedingung in `:347` auf `if (heldFor)` stellen, damit der Zweig sichtbar an dem Wert hängt, der ihn erzeugt.
MVP: Schönheit

Linse Q, Frage 3.
