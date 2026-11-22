Schwere: 1
Goal: kunden 08
Befund: Der Eingang `CP_CUSTOMER_ADDRESSES` im Zweig `customer-work` von `ops/db-report.cjs` ist ein toter Pfad: Der einzige Aufrufer setzt ihn leer, der Produktionslauf übergibt ihn gar nicht, und kein Test führt den Zweig mit Adressen aus.
Beleg: `git grep -n CP_CUSTOMER_ADDRESSES origin/dev -- ops src test` -> nur `ops/customer-work.sh:174` (`CP_CUSTOMER_ADDRESSES=""`) und die Lesestellen `ops/db-report.cjs:440` und `:470` | ops/db-report.cjs:470
Empfehlung: Den Eingang samt Kommentarsatz in Zeile 440 streichen und die Wallet nur aus `CP_CUSTOMER` wählen, wie es `goals/kunden/ANNAHMEN.md` für den Produktionslauf festhält; wird die Adressliste später gebraucht, kommt sie mit ihrem eigenen Selbsttestfall zurück.

Linse Q, Frage 3.

Übernommen: Watch List in STATE.md, beim nächsten Goal an ops/db-report.cjs (2026-11-22)
