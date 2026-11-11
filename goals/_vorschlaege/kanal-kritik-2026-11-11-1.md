Schwere: 2
Goal: kanal 01
Befund: `ops/post-the-answers.py` erkennt nur `--folder <ordner>`, die Form `--folder=<ordner>`, die das Gatter annimmt, übergeht es still und postet aus dem Standardordner `.scratch/gtm/issue-antworten/` statt aus dem genannten.
Beleg: ops/post-the-answers.py:126 (`if "--folder" in argv`) gegen ops/before-the-answers.py:46 (`a.startswith("--folder=")`)
Empfehlung: Beide Skripte teilen eine Argument-Funktion, oder `post-the-answers.py` lehnt jedes unbekannte Argument mit Exit 1 ab; ein Test in `test/answers-folder.test.ts` mit `--folder=goals/kanal/antworten --send 1` zeigt, dass der Entwurf aus diesem Ordner gepostet wird oder der Aufruf abbricht.
MVP: Funktion, weil das Werkzeug unter Matthias' GitHub-Konto öffentlich postet und nie einen anderen Text senden darf als den freigegebenen.
