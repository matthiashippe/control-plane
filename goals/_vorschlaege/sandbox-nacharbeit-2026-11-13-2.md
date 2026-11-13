Schwere: 2
Goal: sandbox 03
Befund: Zwei Tests in `test/sandbox-api.test.ts` brechen den ersten Aufruf nach festen 200 ms ab und verlangen, dass er bis dahin bei `sandboxd` angekommen ist, darum können sie unter Last bei korrektem Code rot werden.
Beleg: `git show origin/dev:test/sandbox-api.test.ts | sed -n '351,352p;423,424p'` -> je `AbortSignal.timeout(200)` und gleich danach `expect(w.execs().length).toBe(1)` bzw. `expect(creates(w)).toBe(1)` | test/sandbox-api.test.ts:351, :352, :423, :424; goals/sandbox/verdicts/03-z4-K.md:27 (Linse K: bei Load 87 bis 113 rot in 2 von 10 Läufen, `expected +0 to be 1` in Zeile 424)
Empfehlung: Statt `AbortSignal.timeout(200)` einen eigenen `AbortController` nehmen und erst abbrechen, wenn der nachgebaute `sandboxd` den Aufruf gesehen hat (auf `creates(w) === 1` bzw. `w.execs().length === 1` warten, etwa über ein Promise im `respond`-Haken, der ohnehin am `gate` hängt); danach dieselben Erwartungen.
MVP: Funktion, weil `check` und Linse K danach unter Last nicht mehr bei korrektem Code rot werden und kein Zyklus an einem Test hängt, der nur die Uhr misst.

Linse Q, Frage 1: Die Tests prüfen das richtige Verhalten, ihr Ausgang hängt aber an der Zeit bis zum ersten Treffer bei `sandboxd`.
Linse K hat die Fehlrate im Abschluss gemessen und an die Nacharbeit verwiesen. Nachlauf am Merge 96440e4 bei Load um 115: 4 von 4 grün, die Rate hängt an der Last.
Die Testdatei ist seit dem Merge 96440e4 unverändert, der Befund gilt am Stand origin/dev.
