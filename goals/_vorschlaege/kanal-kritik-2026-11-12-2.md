Schwere: 1
Goal: kanal 02
Befund: Beide Skripte importieren `answers_args` über das Skriptverzeichnis in `sys.path`. Unter `python3 -I` oder mit `PYTHONSAFEPATH` fehlt es, der Lauf endet mit `ModuleNotFoundError` (Exit 1, nichts gesendet, also sicher, aber ohne `REFUSED`-Zeile), und `--send` direkt nach einem Post liest den Kommentar nicht zurück.
Beleg: `python3 -I ops/post-the-answers.py --selftest` ergibt `ModuleNotFoundError: No module named 'answers_args'`; die Sendeschleife schreibt nach dem POST nur `ops/posted-answers.log`.
Empfehlung: `sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))` vor dem Import in beiden Skripten, und nach jedem erfolgreichen POST derselbe Vergleich wie `--verify-posted` für genau diese Zeile, mit `DIFFERS` und Exit 1, wenn der Kommentar nicht der gesendete Text ist.
MVP: Robustheit, weil der Abgleich sonst erst im nächsten Goal läuft und nicht im Lauf, der postet.
