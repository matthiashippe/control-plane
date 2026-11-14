Schwere: 1
Goal: sandbox 05
Befund: Der Pfadfilter `BG_ANSWER_JS` der Live-Prüfung `sandbox` lässt nur Dateien unter `/root/.exec/` in eine URL, aber der einzige Gegenfall im Test scheitert schon an der Endung; ein auf `^/.*` geweitetes Präfix bleibt grün.
Beleg: `git show origin/dev:test/live-selftest.test.ts | sed -n 222p` -> einziger fremder Pfad `exit_code_file: "/etc/passwd"`, ohne Endung `.exit`; `printf '{"running":true,"exit_code":-1,"exit_code_file":"/etc/x.exit","output_file":"/root/.exec/a.out"}' | bash ops/live.sh --judge sandbox-bg 200` -> `nofiles` | ops/live.sh:455, test/live-selftest.test.ts:222
Empfehlung: In `test/live-selftest.test.ts` neben `/etc/passwd` je einen fremden Pfad mit passender Endung prüfen (`exit_code_file: "/etc/x.exit"` und `output_file: "/tmp/a.out"`), beide müssen `nofiles` ergeben.
MVP: Schönheit

Linse Q, Frage 1 (Randfall). Nachgestellt in einer Wegwerfkopie von ops/live.sh am Stand origin/dev: Präfix auf `^/.*` geweitet, dann ergibt `/etc/x.exit` `files /etc/x.exit /root/.exec/a.out`, `/etc/passwd` weiter `nofiles`, der Test bliebe also grün.
Linse K hat den Fall im Hinweis an die Nacharbeit gegeben (goals/sandbox/verdicts/05-z3-K.md, Abschnitt Hinweis, erster Punkt).
