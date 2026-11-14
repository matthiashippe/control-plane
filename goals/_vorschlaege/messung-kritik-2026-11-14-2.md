Schwere: 1
Goal: messung 01
Befund: `test/claim-keyless-own-ips.test.ts` legt je Fall einen Ordner unter `tmpdir()` an und löscht ihn nie; jeder Lauf von `check` lässt vier Ordner mit einer Kopie von `ops/own-ips.txt` liegen, auf dem code-host und in CI.
Beleg: `grep -c "rmSync(root" test/claim-keyless-own-ips.test.ts` -> 0 | `ls -d $TMPDIR/claim-keyless-* | wc -l` -> 4 nach einem Lauf
Empfehlung: Die Ordner in einem `afterEach` mit `rmSync(root, { recursive: true, force: true })` entfernen, ohne die Assertions zu ändern.
MVP: Schönheit
