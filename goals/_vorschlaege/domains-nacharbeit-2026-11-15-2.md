Schwere: 1
Goal: domains 05
Befund: Das Muster gültiger Konten `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$` steht nach domains 05 dreimal im Repo, in `sandboxd.mjs` und zweimal in den eingebetteten Skripten von `setup.sh`, ohne Test, der die drei gleich hält.
Beleg: `git grep -c -F 'A-Za-z0-9._:-]{0,127}' origin/dev` -> `ops/sandbox/sandboxd.mjs:1`, `ops/sandbox/setup.sh:2`; `git grep -n OWNER_RE origin/dev -- test` -> keine Treffer | ops/sandbox/sandboxd.mjs:35, ops/sandbox/setup.sh:364, ops/sandbox/setup.sh:382
Empfehlung: Das Muster in `setup.sh` einmal als Shell-Variable führen und in beide Node-Skripte einsetzen, und im Selbsttest einen Fall ergänzen, der es mit `OWNER_RE` aus `ops/sandbox/sandboxd.mjs` vergleicht.
MVP: Schönheit

Linse Q, Frage 2 (Logik-Duplikat), Merge 8eab58d. Weitet `sandboxd` das Muster, verweigert `--client-key-reset` mit „the state of sandboxd is not readable“ statt zu zählen; das schlägt sicher fehl, kostet aber einen Lauf, bis jemand die Kopie findet. Die beiden Kopien in `setup.sh` laufen an verschiedenen Orten (code-host und `deploy-cp-1`), deshalb stehen sie als eingebetteter Text; ein gemeinsames Teilstück ändert daran nichts.
