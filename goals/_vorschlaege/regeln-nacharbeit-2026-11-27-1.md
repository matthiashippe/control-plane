Schwere: 2
Goal: regeln 03
Befund: Die Migration `ALTER TABLE konto_payouts ADD COLUMN retire_destination` (`src/db.ts:751`) prüft kein Test, weil jede Test-Datenbank die Tabelle frisch mit `CREATE TABLE` samt Spalte anlegt; fiele die Zeile weg, scheiterte `finishPayout` an einer bestehenden Produktionsdatenbank, und alle Tests blieben grün.
Beleg: `git grep -n -i -E 'create table (if not exists )?konto_payouts' origin/dev -- test src harness` -> nur `src/db.ts:705`; `git grep -n -E 'payoutColumns' origin/dev -- src` -> `src/db.ts:744`, `:746`, `:749`, `:751` | src/db.ts:751
Empfehlung: Einen Test in `test/konto-payout.test.ts` anlegen, der eine Datei mit `konto_payouts` im Schema vor konto 11 (ohne `retire_revoke` und `retire_destination`) und einer Zeile anlegt, dann `openDb` darauf öffnet und erwartet, dass beide Spalten da sind, die Zeile erhalten bleibt und `retire_destination` NULL ist. Damit ist auch der gleiche Fall für `retire_revoke` (`src/db.ts:749`) belegt.
MVP: Funktion, weil die Auszahlung bestehender Konten nach dem nächsten Rollout nur mit dieser Migration läuft und Kompatibilität keine Schönheit ist.

Linse Q, Frage 1. Der Fall „retires a row from before retire_destination“ in `test/konto-payout.test.ts` setzt die Spalte nur auf NULL, die Spalte selbst fehlt dort nie; Linse K hat die Migration im Verdict `goals/regeln/verdicts/03-z2-K.md:36` nur mit einer Probe von Hand belegt.
