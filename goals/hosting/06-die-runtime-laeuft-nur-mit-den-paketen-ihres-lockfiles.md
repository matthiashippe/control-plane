# Hosting Goal 06: Die Runtime im Harness läuft nur mit den Paketen ihres Lockfiles

## Status
ACTIVE

## Active Objective
`ops/runtime-sandbox.sh` meldet die Runtime am Pin nur noch als unverändert, wenn neben `dist/` auch `node_modules/` genau die
Installation ist, die `build_runtime` nach `pnpm install --frozen-lockfile` gestempelt hat. Der Stempel bekommt eine dritte Summe
`deps_sum` über `node_modules/`, `runtime_state` einen eigenen Zustand `deps`, `judge` die Meldung
`RUNTIME SANDBOX FAIL node_modules/ is not the install at the pin`, und `build_runtime` installiert und baut bei abweichender Summe
neu. Der Selbsttest beweist das in beide Richtungen mit den Fällen `deps-changed`, `deps-added`, `deps-relinked`, `deps-old-stamp` und
`rebuild-changed-deps`, ein neuer Test `test/runtime-sandbox-deps.test.ts` hält ihn in `check`, rot vor dem Fix (`ROADMAP.md`,
hosting 06; übernimmt `goals/_vorschlaege/sandbox-kritik-2026-11-16-3.md`).
MVP: Funktion, weil `dist/conway/client.js` und `dist/agent/tools.js` der Runtime `viem` und `ulid` aus `node_modules/` laden und ein
verändertes `node_modules/` im Cache heute als Runtime am Pin durchläuft.

## Voraussetzungen
- hosting Goal 05 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein grüner Gang von `ops/runtime-sandbox.sh` heißt, dass die unveränderte Runtime eines Kunden bei uns läuft,
  nicht nur ein Cache, der zufällig passt; nur dann trägt er das Abschlusskriterium (ein fremder Automaton legt bei uns eine Sandbox
  an). Was dem nicht dient, gehört nicht in dieses Goal.
- Stand heute (`dev` am 21.11.2026, `63f14ac`): `runtime_state` prüft Klon, Pin, `git status --porcelain`, die zwei gebauten Dateien
  und den Stempel `<HEAD> <dist_sum>` in `$(git rev-parse --absolute-git-dir)/control-plane-dist.sha256`. `node_modules/` ist in der
  Runtime von Git ignoriert und kommt in keiner Prüfung vor; `pnpm install --frozen-lockfile` läuft nur beim Neubau. Der Selbsttest hat
  27 Fälle und braucht rund 2 s. Der Cache `~/.cache/control-plane/automaton-d8f8168` auf dem code-host hat 19 371 Dateien in
  `node_modules/` (236 MB) und heute keinen Stempel, also baut der nächste Gang dort ohnehin neu.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 06` in `goals/hosting/ANNAHMEN.md`):
  1. **Die Summe deckt ganz `node_modules/`, nicht nur die Pakete, die `dist/` lädt.** `deps_sum <dir>` nimmt jede reguläre Datei unter
     `node_modules/` mit Inhalt und Pfad relativ zum Klon wie `dist_sum`, dazu jeden symbolischen Link mit Pfad und Ziel
     (`find node_modules -type l -printf '%p -> %l\n'`), sortiert mit `LC_ALL=C`, und `sha256sum` über beides. Grund: welche Pakete
     `viem` transitiv lädt, zeigt erst ein Lauf, und eine Obermenge kann keines verfehlen; `node_modules/.pnpm/lock.yaml` gegen
     `pnpm-lock.yaml` sieht nur eine veraltete Installation, keine veränderte Datei, und `node_modules/.modules.yaml` ändert sich bei einer
     veränderten Datei gar nicht. pnpm legt die Pakete als Links in den virtuellen Store `node_modules/.pnpm/`, deshalb zählen die Links
     mit: Ein Link auf eine andere Version ändert keine Datei. Die Kosten misst der Maker am Cache (Punkt 4); eine Messung im Writer-Lauf
     ergab 1,4 s.
  2. **Der Stempel bekommt ein drittes Feld.** `write_dist_stamp` schreibt `<HEAD> <dist_sum> <deps_sum>` in dieselbe Datei.
     `runtime_state` gibt `dist` zurück, wenn `<HEAD> <dist_sum>` nicht passt (wie heute), sonst `deps`, wenn das dritte Feld fehlt oder
     nicht `deps_sum` ist, sonst `ok`. Ein Stempel im alten Format mit zwei Feldern ist also `deps` (Fall `deps-old-stamp`) und führt
     einmal zum Neubau. Die Zeile `echo deps; return` steht genau einmal in `ops/runtime-sandbox.sh`, in dieser Prüfung, damit die
     Gegenprobe in Punkt 3 sie trifft.
  3. **Neubau bei `deps` von Grund auf.** `build_runtime` löscht bei `deps` `node_modules/` und `dist/` des Klons und ruft dann wie heute
     `pnpm install --frozen-lockfile` und `pnpm build`, danach `write_dist_stamp`. Grund: pnpm erkennt eine veränderte Datei unter
     `node_modules/` nicht und meldet sonst nur, alles sei aktuell. Bei `unbuilt` und `dist` bleibt `build_runtime` wie heute, damit der
     Fall `reuse-stamped-dist` weiter keinen Aufruf von `pnpm` zählt.
  4. **Selbsttest.** Der gepflanzte Klon bekommt `node_modules` in `.gitignore`, eine Datei `node_modules/.pnpm/viem@0.0.0/index.js`
     und den Link `node_modules/viem` auf dieses Verzeichnis, vor dem ersten `write_dist_stamp`. Neue Fälle, jeder mit Meldung
     `RUNTIME SANDBOX FAIL node_modules/ is not the install at the pin` außer dem letzten: `deps-changed` (Inhalt einer Datei unter
     `node_modules/` geändert), `deps-added` (eine Datei dazu), `deps-relinked` (der Link zeigt auf ein anderes Verzeichnis mit gleichem
     Inhalt), `deps-old-stamp` (Stempel mit nur `<HEAD> <dist_sum>`); `rebuild-changed-deps` mit dem nachgebauten `pnpm` aus
     `build_case`, der bei `install` die gepflanzten Pakete neu schreibt: nach einer veränderten Datei unter `node_modules/` genau ein
     `install` und ein `build`, die Veränderung ist weg, der Zustand danach `ok`. Jeder Fall stellt den Klon danach wieder her. Die 27
     bestehenden Fälle bleiben mit ihren Zeilen, auch `reuse-stamped-dist` mit `pnpm_calls=0`.
  5. **Test.** `test/runtime-sandbox-deps.test.ts` nach dem Muster von `test/live-selftest.test.ts` (`spawn` mit `timeout`, ohne den
     Worker zu blockieren) startet `bash ops/runtime-sandbox.sh --selftest` und verlangt Exit 0, als letzte Zeile
     `RUNTIME SANDBOX SELFTEST OK`, keine Zeile mit `FAIL ` am Anfang, je neuem Fall und je Fall aus sandbox 10 (`dist-changed`,
     `dist-added`, `dist-unstamped`, `dist-other-commit`, `rebuild-changed-dist`, `reuse-stamped-dist`, `rebuild-drops-stale`) eine
     Zeile `ok   <fall>: `. Bestehende Tests unter `test/` ändern sich nicht.
- Abweichung von `ROADMAP.md`: Die Zeile nennt `test/runtime-sandbox-selftest.test.ts` aus hosting 03. hosting 03 steht seit dem
  Kurs-Check vom 17.11. auf `PAUSED`, die Datei gibt es auf `dev` nicht. Deshalb bringt dieses Goal seinen eigenen, schmalen Test;
  startet hosting 03 wieder, verlangt sein Test die Zeile `ok   deps-changed: ` laut `ROADMAP.md` ohnehin. Der Maker schreibt das als
  Annahme unter `## Goal 06`.
- Kein Lauf gegen die Produktion: `bash ops/runtime-sandbox.sh` ohne `--selftest` legt dort eine Sandbox an und bleibt der
  Live-Prüfung vorbehalten. Am echten Cache misst der Maker nur lesend: Anzahl der Dateien und Links unter `node_modules/` und die Dauer
  von `deps_sum` (etwa `bash -c 'source <(sed -n "/^deps_sum()/,/^}/p" ops/runtime-sandbox.sh); time deps_sum ~/.cache/control-plane/automaton-d8f8168'`),
  ohne `pnpm`, ohne Löschen, ohne Stempel zu schreiben.
- Rollout: `ops/runtime-sandbox.sh` läuft nur auf dem code-host. Der Merge rollt über `ops/**` wie jeder andere mit dem Release aus,
  dieses Goal braucht keinen eigenen Schritt auf einem Server.
- Doku: Der Kopfkommentar von `ops/runtime-sandbox.sh` (Zeilen 1 bis 25) und der Absatz zum Stempel in `docs/sandbox/e2e.md` nennen
  `node_modules/` und das dritte Feld.
- Prüfbefehle ohne Netz, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Progress Log und Verdicts zitieren keine Suchausdrücke der Prüfbefehle wörtlich.
- Ablauf: zuerst `deps_sum`, Stempel, Zustand und Neubau mit den Fällen im Selbsttest (Punkt 1), dann der Test (Punkt 2) und die
  Gegenproben (Punkt 3), dann Messung und Annahmen (Punkt 4), Doku (Punkt 5) und Umfang (Punkt 6), zuletzt `check` lokal und der Job
  am PR (Punkt 7). Nach jedem grünen Punkt Commit und Push.
- Widerlegt, wenn `runtime_state` am Kopf von `dev` `node_modules/` schon prüft; dann endet das Goal mit dieser Messung in den
  Annahmen.

## Done Condition
- [x] `runtime_state` erkennt ein verändertes, ergänztes oder umgelinktes `node_modules/` und einen Stempel im alten Format als `deps`,
      `judge` meldet das, und `build_runtime` installiert und baut dann neu.
      MVP: Funktion, weil die Runtime ihre Pakete aus `node_modules/` lädt und ein grüner Gang sonst eine veränderte Runtime bestätigt.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/runtime-sandbox.sh --selftest | tail -n 1` muss `RUNTIME SANDBOX SELFTEST OK` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/runtime-sandbox.sh --selftest | grep -cE '^ok   (deps-changed|deps-added|deps-relinked|deps-old-stamp|rebuild-changed-deps): '` muss 5 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/runtime-sandbox.sh --selftest | grep -cE '^ok   (deps-changed|deps-added|deps-relinked|deps-old-stamp): RUNTIME SANDBOX FAIL node_modules/ is not the install at the pin'` muss 4 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/runtime-sandbox.sh --selftest | grep -cE '^ok   (dist-changed|dist-added|dist-unstamped|dist-other-commit|rebuild-changed-dist|reuse-stamped-dist|rebuild-drops-stale): '` muss 7 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/runtime-sandbox.sh --selftest | grep -cE '^ok   reuse-stamped-dist: pnpm_calls=0 state=ok$'` muss 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/runtime-sandbox.sh --selftest | grep -c '^FAIL '` muss 0 ausgeben.
      Prüfung: `for w in 'deps_sum()' 'node_modules/ is not the install at the pin' 'frozen-lockfile' 'type l'; do grep -qF -- "$w" ops/runtime-sandbox.sh || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'echo deps; return' ops/runtime-sandbox.sh` muss 1 ausgeben.
- [x] `test/runtime-sandbox-deps.test.ts` hält den Selbsttest samt den neuen Fällen in `check`.
      MVP: Funktion, weil ein Merge, der die Prüfung bricht, sonst erst im nächsten Audit auffällt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/runtime-sandbox-deps.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in deps-changed deps-added deps-relinked deps-old-stamp rebuild-changed-deps dist-changed reuse-stamped-dist rebuild-drops-stale "RUNTIME SANDBOX SELFTEST OK" --selftest timeout; do grep -qF -- "$w" test/runtime-sandbox-deps.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Der neue Test ist rot gegen den Stand vor dem Fix und gegen eine Kopie, in der ein abweichendes `node_modules/` als `ok` gilt.
      MVP: Funktion, weil ein Test, der ohne die Prüfung grün bleibt, die Runtime am Pin nicht schützt.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; git show $(git merge-base origin/dev HEAD):ops/runtime-sandbox.sh > $T/ops/runtime-sandbox.sh; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/runtime-sandbox-deps.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/echo deps; return/echo ok; return/' $T/ops/runtime-sandbox.sh; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/runtime-sandbox-deps.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 1 ausgeben.
- [x] Wahl der Summe, Messung am Cache und die Abweichung von `ROADMAP.md` stehen mit Grund unter `## Goal 06` in
      `goals/hosting/ANNAHMEN.md`, mit einer Zeile ab Spalte 0 `Messung: deps_sum <n> Dateien, <m> Links, <s> s, <JJJJ-MM-TT>`.
      MVP: Funktion, weil die Summe bei jedem Gang läuft und ihre Kosten belegt sein müssen, bevor sie jemand verkleinert.
      Prüfung: `awk '/^## Goal 06/{f=1;next} /^## /{f=0} f' goals/hosting/ANNAHMEN.md | grep -cE '^Messung: deps_sum [0-9]+ Dateien, [0-9]+ Links, [0-9]+([.,][0-9]+)? s, 20[0-9]{2}-[0-9]{2}-[0-9]{2}$'` muss 1 ausgeben.
      Prüfung: `for w in lock.yaml .modules.yaml node_modules/.pnpm deps-old-stamp "hosting 03" frozen-lockfile; do awk '/^## Goal 06/{f=1;next} /^## /{f=0} f' goals/hosting/ANNAHMEN.md | grep -qF -- "$w" || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Kopfkommentar von `ops/runtime-sandbox.sh` und `docs/sandbox/e2e.md` nennen `node_modules/` und das dritte Feld des Stempels.
      MVP: Funktion, weil wer eine Meldung `node_modules/ is not the install at the pin` liest, ohne Suche wissen muss, was neu gebaut wird.
      Prüfung: `sed -n '1,25p' ops/runtime-sandbox.sh | grep -c 'node_modules'` muss mindestens 1 ausgeben.
      Prüfung: `grep -c 'node_modules' docs/sandbox/e2e.md` muss mindestens 1 ausgeben.
- [x] Das Goal ändert nur seine eigenen Dateien, weder `src/`, `harness/` noch bestehende Tests, bringt keinen Schlüssel ins Repo, und
      seine Texte sind ohne Gedankenstrich.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8) und jede weitere Datei auf dem Laufzeitpfad einen Rollout ohne Nutzen
      für den Kunden auslöst (Grundregel 5).
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(ops/runtime-sandbox\.sh|docs/sandbox/e2e\.md|test/runtime-sandbox-deps\.test\.ts|goals/hosting/.+)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only --diff-filter=MD $(git merge-base origin/dev HEAD) HEAD -- test/ | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}|0x[0-9a-fA-F]{64})'` muss 0 ausgeben.
      Prüfung: `cat ops/runtime-sandbox.sh docs/sandbox/e2e.md test/runtime-sandbox-deps.test.ts goals/hosting/ANNAHMEN.md | grep -c $'\xe2\x80\x93\|\xe2\x80\x94'` muss 0 ausgeben.
- [ ] `check` ist lokal grün, und der Job `check` des Goal-PR ist auf dem GitHub-Rechner grün.
      MVP: Funktion, weil erst der Gang auf dem GitHub-Rechner zeigt, dass der Selbsttest dort ohne den Cache des code-host läuft.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/hosting-06 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="check") | .state'` muss `SUCCESS` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Gegenproben waren rot, wie sie sollen; die Zeile im Progress Log nennt, womit.
- [ ] Die 27 Fälle des Selbsttests von `dev` stehen mit unveränderter Meldung weiter in seiner Ausgabe.
- [ ] Code, Kommentare, Testnamen und Meldungen Englisch, Goal-Datei und Annahmen Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/**`, `ops/sandbox/**`, `ops/watchdog.sh`, `ops/live.sh`, `ops/automaton-live.sh`, `ops/status.sh`,
  `package.json`, `pnpm-lock.yaml`, bestehende Dateien unter `test/`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `bash ops/runtime-sandbox.sh` ohne `--selftest` (legt eine Sandbox in der Produktion an); `~/.config/control-plane/live-sandbox.env`
  und `~/.config/control-plane/loop.env` liest dieses Goal nicht
- der Cache `~/.cache/control-plane/automaton-d8f8168`: nur lesen, kein `pnpm`, kein Löschen, kein Stempel
- der Zahlungsserver `76.13.144.207` und der Sandbox-Server `72.62.51.224`: kein Zugriff
- Kauf, Aufladung, Wallet-Bewegung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-21 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut (Summe über `node_modules/` mit Links als drittes Feld des Stempels, Zustand `deps`, Neubau von Grund auf, fünf neue Fälle im Selbsttest, eigener Test, Messung und Annahmen, Doku); Punkt 7 lokal grün, der Job `check` am PR steht noch aus. Prüfbefehle: Selbsttest 32 Fälle, letzte Zeile OK, Zähler 5, 4, 7 und 1 wie verlangt, keine Zeile FAIL, Wortsuche leer, Zeile des Zustands 1; vitest des neuen Tests Exit 0, Wortsuche leer; Gegenprobe gegen das Skript der Merge-Basis 1 roter Test, gegen die Kopie mit `ok` statt `deps` 1 roter Test; Annahmen Messzeile 1, Wortsuche leer; Kopfkommentar 3 Treffer, Doku 5; Umfang 0, 0, 0, 0, Gedankenstriche 0; `node scripts/check.mjs` Exit 0 (243 Dateien, 2537 Tests). Beim Bau zusätzlich rot gesehen: der neue Test vor den Fällen, `deps-relinked` ohne Links in der Summe, `rebuild-changed-deps` ohne Löschen von `node_modules/` und ohne `deps` im Neubau.

## Blockers
Keine.
