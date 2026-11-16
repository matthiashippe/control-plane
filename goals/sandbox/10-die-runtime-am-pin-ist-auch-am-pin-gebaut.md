# Sandbox Goal 10: Die Runtime am Pin ist auch am Pin gebaut

## Status
ACTIVE

## Active Objective
`ops/runtime-sandbox.sh` meldet `RUNTIME SANDBOX OK` nur noch, wenn `dist/` der Runtime genau der Build ist, den `build_runtime` am
Pin `d8f8168` erzeugt hat. Heute prüft `runtime_state` nur Commit, `git status --porcelain` und ob zwei Dateien in `dist/` bestehen,
und `build_runtime` baut nur, wenn eine davon fehlt; `dist/` ist in der Runtime ignoriert, also läuft ein veränderter oder alter Build
im Cache `~/.cache/control-plane/automaton-d8f8168` als „Runtime am Pin“ durch. Gemessen am 2026-11-16 um 16:32 UTC auf dem
code-host mit dem Beleg aus `goals/_vorschlaege/sandbox-nacharbeit-2026-11-13-3.md` (ein Clone mit `echo changed >dist/conway/client.js`
bei sauberem `git status`): `runtime_state` gibt `ok`. Damit ist die Widerlegung aus `ROADMAP.md` nicht eingetreten. Nach dem Goal
schreibt `build_runtime` nach jedem Bau einen Stempel aus Commit und Prüfsumme über `dist/`, baut neu, wenn der Stempel fehlt oder nicht
passt, und `runtime_state` meldet bei jeder Abweichung einen eigenen Zustand, der mit `RUNTIME SANDBOX FAIL` endet (`ROADMAP.md`,
sandbox 10; übernimmt `goals/_vorschlaege/sandbox-nacharbeit-2026-11-13-3.md`).
MVP: Funktion, weil `RUNTIME SANDBOX OK` der Beleg ist, dass ein Automaton mit der unveränderten Runtime bei uns läuft
(`loop-constraints.md`, Grundregel 13); stammt `dist/` nicht vom Pin, belegt der Gang nichts, und ein Fehler unserer API fiele erst beim
nächsten zahlenden Automaton auf.

## Voraussetzungen
- sandbox Goal 09 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer `RUNTIME SANDBOX OK` liest, kann sich darauf verlassen, dass der Gang mit dem Build vom Pin lief und mit
  keinem anderen. Was dem nicht dient, gehört nicht in dieses Goal.
- Maßgeblich sind `ops/runtime-sandbox.sh` (Kopf, `runtime_state`, `judge`, `build_runtime`, `selftest`), `docs/sandbox/e2e.md` und
  `goals/sandbox/ANNAHMEN.md` unter `## Goal 04`. Was dieses Goal entscheidet oder misst, steht mit Grund unter `## Goal 10` in
  `goals/sandbox/ANNAHMEN.md`, nie nur im Code.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 10` in `goals/sandbox/ANNAHMEN.md`):
  1. **Prüfsumme statt Neubau bei jedem Lauf.** Ein Neubau bei jedem Live-Lauf kostet `pnpm install` und `pnpm build` je Lauf und
     lässt sich im Selbsttest ohne Netz und ohne Bau nicht als FAIL zeigen; ein Stempel lässt sich in beide Richtungen pflanzen.
  2. **Die Prüfsumme.** `dist_sum <dir>` gibt 64 Hexzeichen aus: `sha256sum` über jede reguläre Datei unter `<dir>/dist`, mit Pfad
     relativ zu `<dir>`, nach Pfad sortiert mit `LC_ALL=C`, und darüber noch einmal `sha256sum`. So ändert eine geänderte, eine neue
     und eine gelöschte Datei die Summe. Nur `find`, `sort`, `xargs` und `sha256sum`.
  3. **Der Stempel.** `write_dist_stamp <dir>` schreibt genau eine Zeile `<git rev-parse HEAD, 40 Zeichen> <dist_sum>` nach
     `"$(git -C <dir> rev-parse --absolute-git-dir)/control-plane-dist.sha256"`. Er liegt im Git-Verzeichnis des Clones, damit
     `git status --porcelain` leer bleibt und der Stempel mit dem Clone wandert.
  4. **Der Zustand.** `runtime_state` prüft nach `unbuilt` den Stempel: fehlt er, nennt er einen anderen Commit als `HEAD` oder eine
     andere Summe als `dist_sum`, ist der Zustand `dist`. `judge` macht daraus genau die Zeile
     `RUNTIME SANDBOX FAIL dist/ is not the build at the pin`. Die anderen Zustände bleiben unverändert.
  5. **Der Bau.** `build_runtime` baut, wenn `runtime_state` nach dem Checkout des Pins `unbuilt` oder `dist` meldet: zuerst
     `rm -rf "$RUNTIME_DIR/dist"` (nur, wenn `$RUNTIME_DIR/.git` besteht), dann `pnpm install --frozen-lockfile` und `pnpm build` wie
     heute, danach `write_dist_stamp`. Bei `ok` baut es nicht. Der erste Live-Lauf nach dem Merge baut den Cache darum einmal neu,
     weil er noch keinen Stempel hat.
  6. **Der Selbsttest.** Der gepflanzte Clone bekommt seinen Stempel über `write_dist_stamp`, also über denselben Code wie im Live-Lauf.
     Neue Fälle, je eine Zeile `ok   <Name>: …`: `dist-changed` (geändertes `dist/conway/client.js` bei leerem `git status`),
     `dist-added` (neue Datei unter `dist/`), `dist-unstamped` (Stempel gelöscht), `dist-other-commit` (Stempel mit einem anderen
     Commit), alle mit `RUNTIME SANDBOX FAIL dist/ is not the build at the pin`; dazu `rebuild-changed-dist` (`build_runtime` in einer
     Subshell mit `PIN` und `RUNTIME_DIR` auf den gepflanzten Clone und einem `pnpm`, das bei `build` die beiden Dateien schreibt und
     seine Aufrufe zählt: bei verändertem `dist/` genau ein Aufruf `build`, danach `runtime_state` gleich `ok`) und
     `reuse-stamped-dist` (gleiche Subshell bei passendem Stempel: kein Aufruf von `pnpm`). Außerhalb dieser Subshells bleibt `pnpm`
     im Selbsttest die Sperre, die mit 99 endet; kein Netz, kein echter Bau.
- Vorher und nachher: Zuerst kommen die sechs neuen Fälle in den Selbsttest, und der Lauf gegen das heutige `runtime_state` und
  `build_runtime` muss rot sein (mindestens `dist-changed` mit `FAIL`); die Zeile im Progress Log nennt die Ausgabe. Dann der Fix.
- Kopfkommentar des Skripts: Der Satz, nach Pin und leerem `git status --porcelain` sei die Runtime unverändert, nennt danach auch
  den Stempel. In `docs/sandbox/e2e.md` steht die neue Zahl der Fälle statt „18 Fälle“ und ein Satz zum Stempel.
- Kein Lauf gegen die Produktion in diesem Goal: `bash ops/runtime-sandbox.sh` ohne `--selftest` legt eine Sandbox in der Produktion
  an und läuft hier nicht. Prüfbefehle ohne Netz, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` im Vordergrund mit eigenem
  Timeout. Progress Log und Verdicts zitieren keine Suchausdrücke der Prüfbefehle wörtlich.
- Ablauf: Punkt 1 (rot, dann Fix), Punkt 2 (Mutation), Punkt 3 (Doku und Annahmen), dann Punkte 4 und 5. Nach jedem grünen Punkt
  Commit und Push.
- Was danach schneller zu mehr zahlenden Automatons führt: sandbox 11 schützt die Dienste der Kunden auf der Ports-Domain voreinander,
  konto 04 gibt Menschen ohne Wallet die Terminal-Tools für ihren Automaton.

## Done Condition
- [x] `runtime_state` meldet `dist`, wenn `dist/` nicht der gestempelte Build am Pin ist, `judge` endet dann mit
      `RUNTIME SANDBOX FAIL dist/ is not the build at the pin`, und `build_runtime` baut genau dann neu; der Selbsttest zeigt beide
      Richtungen und war vor dem Fix rot.
      MVP: Funktion, weil sonst ein beliebiges `dist/` im Cache als Runtime am Pin durchläuft.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/runtime-sandbox.sh --selftest | tail -n 1` muss `RUNTIME SANDBOX SELFTEST OK` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/runtime-sandbox.sh --selftest | grep -cE '^ok   (dist-changed|dist-added|dist-unstamped|dist-other-commit|rebuild-changed-dist|reuse-stamped-dist): '` muss 6 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/runtime-sandbox.sh --selftest | grep -cE '^ok   (dist-changed|dist-added|dist-unstamped|dist-other-commit): RUNTIME SANDBOX FAIL dist/ is not the build at the pin'` muss 4 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/runtime-sandbox.sh --selftest | grep -cE '^[0-9]+ cases as expected$'` muss 1 ausgeben.
      Prüfung: `for w in 'dist_sum()' 'write_dist_stamp()' control-plane-dist.sha256 'rev-parse --absolute-git-dir' 'dist/ is not the build at the pin'; do grep -qF -- "$w" ops/runtime-sandbox.sh || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Der Selbsttest fällt, wenn die Prüfsumme nichts prüft oder der Bau den Stempel nicht prüft.
      MVP: Funktion, weil ein Selbsttest, der mit einer konstanten Summe grün bliebe, die Aussage „Build am Pin“ nicht belegt
      (`loop-constraints.md`, Grundregel 3).
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$T/ops/runtime-sandbox.sh; if ! grep -q '^dist_sum() {' $f; then echo "fehlt dist_sum"; else sed -i 's/^dist_sum() {/dist_sum() { echo 0; }\ndist_sum_orig() {/' $f; PATH=/usr/bin:$PATH bash $f --selftest 2>/dev/null | tail -n 1 | grep -q 'SELFTEST OK' && echo "gruen mit konstanter Summe"; fi; rm -rf $T` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$T/ops/runtime-sandbox.sh; if ! grep -q '^build_runtime() {' $f; then echo "fehlt build_runtime"; else sed -i 's/^build_runtime() {/build_runtime() { git -C "$RUNTIME_DIR" checkout -q "$PIN"; return 0; }\nbuild_runtime_orig() {/' $f; PATH=/usr/bin:$PATH bash $f --selftest 2>/dev/null | tail -n 1 | grep -q 'SELFTEST OK' && echo "gruen ohne Neubau"; fi; rm -rf $T` muss nichts ausgeben.
- [x] Kopf des Skripts, Doku und Annahmen nennen den Stempel, die Entscheidungen stehen mit Grund unter `## Goal 10`, und die Messung
      von vorher steht dabei.
      MVP: Funktion, weil der Betrieb bei `RUNTIME SANDBOX FAIL dist/ …` wissen muss, dass der nächste Lauf den Cache neu baut.
      Prüfung: `sed -n '1,25p' ops/runtime-sandbox.sh | grep -c 'control-plane-dist.sha256'` muss mindestens 1 ausgeben.
      Prüfung: `grep -c 'control-plane-dist.sha256' docs/sandbox/e2e.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -c '18 Fälle' docs/sandbox/e2e.md` muss 0 ausgeben.
      Prüfung: `awk '/^## Goal 10/{f=1} f' goals/sandbox/ANNAHMEN.md | grep -ciE 'dist_sum|control-plane-dist.sha256|Prüfsumme|vorher|rebuild|Neubau'` muss mindestens 4 ausgeben.
- [x] Das Goal ändert nur `ops/runtime-sandbox.sh`, `docs/sandbox/e2e.md` und `goals/sandbox/`, rollt nichts aus und bringt keinen
      Schlüssel ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8) und `ops/runtime-sandbox.sh` nur auf dem code-host läuft, also kein
      Rollout nötig ist.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cvE '^(ops/runtime-sandbox\.sh|docs/sandbox/e2e\.md|goals/sandbox/.*)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5})'` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Selbsttest-Fall war vor dem Fix rot oder zeigt die Gegenrichtung (`reuse-stamped-dist`); die Zeile im Progress Log
      nennt, womit.
- [ ] Der Selbsttest erreicht kein Netz und baut nichts: `curl`, `ssh` und `pnpm` bleiben außerhalb der beiden Bau-Subshells gesperrt.
- [ ] Keine Sandbox-ID, kein Schlüssel und keine Adresse in Doku, Annahmen oder Progress Log.
- [ ] Code, Kommentare und Fallnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `deploy/**`,
  `harness/**`, `src/**`, `test/**`, `ops/sandbox/**`, `ops/live.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `bash ops/runtime-sandbox.sh` ohne `--selftest` (legt eine Sandbox in der Produktion an); `~/.config/control-plane/live-sandbox.env`
  und `~/.config/control-plane/loop.env` nicht lesen
- der Cache `~/.cache/control-plane/automaton-d8f8168` nur lesen, nie löschen oder neu bauen; gepflanzte Clones nur unter `mktemp -d`
- der Zahlungsserver `76.13.144.207` und der Sandbox-Server: kein Zugriff, kein Rollout, kein Neustart
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung (`loop-constraints.md`, Grundregeln 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut, Stempel über dist/ im Git-Verzeichnis, runtime_state meldet dist, build_runtime baut dann neu; vorher rot mit SELFTEST FAIL (5 of 26 cases), rot waren die vier dist-Fälle (OK statt FAIL) und rebuild-changed-dist (builds=0). Prüfbefehle: Punkt 1 SELFTEST OK, 6, 4, 1, nichts fehlt; Punkt 2 beide Mutationen ohne Ausgabe (konstante Summe macht 3 Fälle rot, Bau ohne Stempel 2); Punkt 3 1, 1, 0, 10; Punkt 4 0, 0, 0; Punkt 5 check Exit 0 (grün in 98 s, 2067 Tests).

## Blockers
- keine
