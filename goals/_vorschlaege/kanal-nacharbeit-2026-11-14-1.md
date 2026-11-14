Schwere: 2
Goal: kanal 04
Befund: Kein Test hält fest, dass `--send` den freigegebenen Text aus dem Speicher postet; liest die Sendeschleife den Entwurf vor dem POST wieder aus der Datei, bleiben alle Fälle grün, und ein in den 90 s zwischen zwei Posts geänderter Entwurf ginge unter Matthias' Namen raus.
Beleg: `git show origin/dev:test/answers-approved.test.ts | grep -n "s.write("` -> `62:` und `69:`, beide zwischen zwei Läufen, keiner während eines Sendelaufs | ops/post-the-answers.py:368 (`body = bodies[number]`), goals/kanal/verdicts/04-z2-K.md:30
Empfehlung: Der Fake-`gh` in `test/answers-sandbox.ts` bekommt einen Schalter (etwa `FAKE_EDIT_ON_POST=<datei>`), der beim ersten POST den zweiten Entwurf im Ordner ändert; ein Fall in `test/answers-approved.test.ts` sendet zwei freigegebene Entwürfe und verlangt, dass der zweite POST genau `OTHER_BODY` trägt. Mit `body = body_to_send((FOLDER / f"{number}.md").read_text())` in Zeile 368 muss er rot werden.
MVP: Funktion, weil danach ein Rückfall auf das zweite Lesen der Datei in `check` rot wird; vorher ginge er grün durch und der zweite Kommentar eines Pakets wäre nicht mehr an Matthias' „ok“ gebunden.

Linse Q, Frage 1 (Randfall). Selbst nachgestellt in einer Wegwerfkopie am Merge d8f319b: Zeile 368 durch das Nachlesen der Datei ersetzt, `vitest run test/answers-approved.test.ts test/answers-folder.test.ts` -> 24 von 24 grün.
Linse K (Mutation M4) und Linse B haben den Fall im Hinweis an die Nacharbeit gegeben. Das Rücklesen nach dem POST fängt ihn nicht, weil es mit dem gesendeten und nicht mit dem freigegebenen Text vergleicht.
Der Code am Stand origin/dev ist richtig (Zeile 339 und 368), es fehlt nur der Test, der ihn hält.
