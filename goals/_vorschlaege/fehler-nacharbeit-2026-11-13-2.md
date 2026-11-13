Schwere: 1
Goal: fehler 02
Befund: Die Goals schreiben Deutsch in Code: fehler 02 einen deutschen Kommentar in `.gitignore`, fehler 04 die Arten `erfunden` und `eigene` der Adressliste, die so auch in Testname, Regex und Fehlermeldung von `test/known-ips.test.ts` stehen.
Beleg: `git grep -n -E '\b(erfunden|eigene)\b' origin/dev -- test/known-ips.test.ts ops/known-ips.txt ops/README.md | wc -l` -> 14; `git show origin/dev:.gitignore | grep -c '^# Cache von ops/fetchers.py'` -> 1 | test/known-ips.test.ts:31, .gitignore:15
Empfehlung: Die Arten in `invented` und `own` umbenennen, in `ops/known-ips.txt` (Zeilen 6, 7, 10, 21), `test/known-ips.test.ts` (Zeilen 13, 31, 32, 194, 199, 202, 217) und der Tabelle in `ops/README.md` (Zeilen 857, 858, 868), in einem Commit, damit Liste und Test zusammen grün bleiben; den Kommentar in `.gitignore:15` (und den älteren in Zeile 12) auf Englisch.
MVP: Schönheit

Linse Q, Frage 5 (Bezeichner, Dateien und Kommentare Englisch), Regelstelle `loop-constraints.md` Grundregel 12 (Bezeichner, Kommentare, Testnamen, Fehlermeldungen Englisch, ausnahmslos). Goals: fehler 02 (`.gitignore:15`, Commit c200a87), fehler 04 (Adressliste und Test).
Der Testname in test/known-ips.test.ts:199 lautet „leaves an address of kind erfunden …“, die Meldung in Zeile 217 nennt „kind erfunden“, der Regex in Zeile 31 erlaubt nur `erfunden|eigene`.
Die deutschen Arten kommen aus fehler-kritik-2026-11-12-3 und der Goal-Datei von fehler 04 (Punkt 1), deshalb hat Linse B sie in 04-z4-B durchgelassen; Goal-Datei und Vorschlag dürfen Deutsch bleiben.
Prüfbefehl nach der Umbenennung: beide Einzeiler oben geben 0 aus, `pnpm -s vitest run test/known-ips.test.ts` Exit 0.
