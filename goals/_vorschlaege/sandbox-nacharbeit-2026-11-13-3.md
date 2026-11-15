Schwere: 1
Goal: sandbox 04
Befund: `ops/runtime-sandbox.sh` meldet die Runtime als unverändert, prüft aber nur Commit und `git status --porcelain`, während der Gang aus dem ignorierten `dist/` lädt, das nur gebaut wird, wenn es fehlt; ein veränderter oder alter Build im Cache läuft als „Runtime am Pin“ durch.
Beleg: `f=$(git show origin/dev:ops/runtime-sandbox.sh | sed -n '/^runtime_state()/,/^}/p'); d=$(mktemp -d); bash -c 'eval "$1"; cd "$2" && git init -q && printf "dist\n" >.gitignore && git add .gitignore && git -c user.name=x -c user.email=x@invalid commit -qm p && mkdir -p dist/conway dist/agent && echo changed >dist/conway/client.js && : >dist/agent/tools.js && runtime_state "$2" "$(git rev-parse --short=7 HEAD)"' _ "$f" "$d"` -> `ok` | ops/runtime-sandbox.sh:10, :65, :86, :109
Empfehlung: `build_runtime` baut `dist/` bei jedem Live-Lauf neu (oder vergleicht eine Prüfsumme über `dist/` mit der beim Bau am Pin geschriebenen), und der Selbsttest bekommt einen Fall „dist verändert“, der mit FAIL endet.
MVP: Funktion, weil ein `RUNTIME SANDBOX OK` danach nur mit dem Build vom Pin kommt und damit Grundregel 13 belegt, vorher auch mit einem beliebigen `dist/` im Cache.

Linse Q, Frage 1 (prüfen die neuen Tests Verhalten, Randfall). Der Selbsttest (18 Fälle) pflanzt geänderte und ungetrackte Quelldateien, aber nie ein geändertes `dist/`, also kann die Aussage „unchanged“ aus Zeile 10 nicht rot werden (`loop-constraints.md`, Grundregel 3). Linse K hat es in `goals/sandbox/verdicts/04-z2-K.md` (Hinweis 2) an Linse Q gegeben.
Übernommen: Triage-Glieder 14.11. an den Tech Lead, Glied 8 (`dist/` der Runtime gegen den Pin prüfen, Grundregel 13) (2026-11-14)
