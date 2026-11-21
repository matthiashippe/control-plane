# Hosting Goal 07: Eine Sandbox, die der Sweep nicht löschen kann, fällt auf

## Status
ACTIVE

## Active Objective
`sweepAutomatons` in `src/automaton/sweep.ts` meldet jedes gescheiterte Löschen der Sandbox eines Automatons mit Status `failed`
mit der Zeile `[automaton] <id>: sweep could not delete sandbox <sandbox_id> (<status>), retrying next round`, zählt es als `failed`
im Rückgabewert und merkt sich den ersten Fehlschlag in einer neuen Tabelle `sweep_failures`. `ops/db-report.cjs`, das
`ops/status.sh` auf dem Zahlungsserver ausführt, gibt die Zahl der Automatons aus, deren Sandbox seit mehr als einer Stunde so steht
(`db.undeleted_sandboxes`), und `ops/README.md` nennt dafür die Schwelle, die die Ops-Triage liest. Ein neuer Test mit dem
nachgebauten `sandboxd` ist rot vor dem Fix (`ROADMAP.md`, hosting 07; übernimmt `goals/_vorschlaege/hosting-kritik-2026-11-17-1.md`).
MVP: Funktion, weil heute eine Sandbox, deren Löschen `sandboxd` dauerhaft ablehnt, ohne jede Spur weiter Credits des Kunden abbucht.

## Voraussetzungen
- hosting Goal 06 DONE

## Kontext für den Maker
- Ziel in einem Satz: Kein Kunde zahlt für die Sandbox eines Automatons, der nicht mehr läuft, ohne dass der Betrieb es am selben Tag
  sieht. Was dem nicht dient, gehört nicht in dieses Goal.
- Stand heute (`dev` am 21.11.2026, `15007b0`): Im Weg für Zeilen `failed` ruft der Sweep `sandboxes.remove` und kehrt bei einer
  Antwort ungleich 200 ohne Log-Zeile zurück; im Weg für Zeilen `active` ohne `started_at` ebenso, wenn die Abfrage mit
  `PROBE_COMMAND` nicht mit 200 antwortet. Der Rückgabewert zählt nur `removed` und `interrupted`. `remove` in
  `src/sandbox/service.ts` faltet jede Antwort von `sandboxd` außer 200 und 404 (also auch 409 und 500) und jede Unerreichbarkeit in
  dieselbe Antwort 501 `sandbox_server_unreachable`. `ops/status.sh` reicht die JSON-Ausgabe von `ops/db-report.cjs` unverändert als
  Block `db` durch; die Ops-Triage vergleicht sie mit der Tabelle „Thresholds that call for action“ in `ops/README.md`.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 07` in `goals/hosting/ANNAHMEN.md`):
  1. **Log-Zeile und Zähler.** Antwortet `sandboxes.remove` im Weg für Zeilen `failed` nicht mit 200, schreibt der Sweep genau die
     Zeile `[automaton] ${id}: sweep could not delete sandbox ${sandbox_id} (${res.status}), retrying next round` und erhöht `failed`.
     `<status>` ist der Status der Antwort von `sandboxes.remove`, heute also 501 für Ablehnung wie für Unerreichbarkeit. Grund: Die
     Unterscheidung zwischen 409, 500 und Ausfall braucht der Betrieb nicht, um zu handeln; nach einer Stunde ist beides ein Befund,
     und die Ursache steht im Log von `sandboxd`. `remove` in `src/sandbox/service.ts` bleibt unverändert, weil seine 501 auch die
     Antwort von `DELETE /v1/automatons/{id}` ist. Der Rückgabewert von `sweepAutomatons` und von `sweep()` in
     `src/automaton/service.ts` wird `{ removed, interrupted, failed }`.
  2. **Abfrage im Weg `active`.** Antwortet die Abfrage mit `PROBE_COMMAND` nicht mit 200, schreibt der Sweep die Zeile
     `[automaton] ${id}: sweep could not ask sandbox ${sandbox_id} (${res.status}), retrying next round`. Sie zählt nicht in `failed`,
     weil dort noch keine Sandbox als verwaist feststeht; die Zeile bleibt `active` wie heute.
  3. **Wo der erste Fehlschlag steht.** Eine neue Tabelle `sweep_failures (automaton_id TEXT PRIMARY KEY, sandbox_id TEXT NOT NULL,
     first_failed_at TEXT NOT NULL, last_status INTEGER NOT NULL)` in `src/db.ts` mit `CREATE TABLE IF NOT EXISTS`. Der Sweep legt
     beim ersten gescheiterten Löschen eine Zeile an und lässt `first_failed_at` bei jedem weiteren stehen (nur `last_status` neu);
     er löscht die Zeile, sobald das Löschen gelingt oder die Sandbox in `sandboxes` nicht mehr besteht. Grund für eine eigene Tabelle
     statt einer Spalte in `hosted_automatons`: Der Fall „changes no row and does not throw while sandboxd does not answer“ in
     `test/automaton-sweep.test.ts` verlangt, dass `hosted_automatons` und `sandboxes` bei Ausfall von `sandboxd` unverändert bleiben,
     und das bleibt wahr.
  4. **Zahl im Status.** `ops/db-report.cjs` gibt `undeleted_sandboxes` aus: die Zahl der Zeilen in `sweep_failures`, deren
     `first_failed_at` mehr als 3600 s vor jetzt liegt und deren Automaton in `hosted_automatons` noch `failed` ist (Join, damit ein
     inzwischen gelöschter Automaton nicht ewig zählt). Fehlt die Tabelle (Produktion vor dem Deploy, `db-report.cjs` öffnet
     `readonly`), ist der Wert `null` und der Rest des Berichts bleibt unberührt. `ops/status.sh` ändert sich nicht, weil es den Block
     `db` durchreicht; die Zeile in `ROADMAP.md` nennt `ops/status.sh`, gemeint ist seine Ausgabe.
  5. **Schwelle.** Eine neue Zeile der Tabelle „Thresholds that call for action“ in `ops/README.md`: Signal `db.undeleted_sandboxes`,
     Schwelle „above 0“, Aktion: eine Sandbox bucht weiter Credits ohne laufenden Automaton; die Zeilen `sweep could not delete
     sandbox` im Log von `cp` lesen, den Zustand von `sandboxd` auf dem Sandbox-Server prüfen, die Ursache in `STATE.md`; `null` heißt
     vor dem Deploy dieses Goals und ist kein Befund.
  6. **Test.** `test/automaton-sweep-undeleted.test.ts` mit `automatonWorld` aus `test/automaton-world.ts` und einem umschaltbaren
     `answer`, nach dem Muster von `test/automaton-sweep.test.ts`. Fälle: (a) Start scheitert, `DELETE` antwortet 500: `sweep()` gibt
     `{ removed: 0, interrupted: 0, failed: 1 }`, die Log-Zeile steht genau so mit `(501)`, `sweep_failures` hat eine Zeile; (b) dasselbe
     mit 409; (c) ein zweiter Sweep eine Stunde später lässt `first_failed_at` stehen; (d) antwortet `DELETE` wieder 200, gibt `sweep()`
     `{ removed: 1, interrupted: 0, failed: 0 }`, die Zeile in `sweep_failures` ist weg, und eine halbe Stunde Abrechnung danach bringt
     keine weitere Ledger-Zeile dieser Sandbox; (e) die Abfrage im Weg `active` antwortet nicht mit 200: die Zeile `could not ask`,
     `failed` 0; (f) `ops/db-report.cjs` wie in `test/db-report.test.ts` (Skript, `CP_DB_PATH`): `undeleted_sandboxes` ist 1 für einen
     Fehlschlag vor zwei Stunden, 0 für einen vor 30 Minuten, 0, wenn der Automaton inzwischen `deleted` ist, und `null` nach
     `DROP TABLE sweep_failures`, mit dem übrigen Bericht unverändert lesbar.
  7. **Bestehende Tests.** In `test/automaton-sweep.test.ts` kommt nur `failed: <n>` in die erwarteten Rückgabewerte; jede andere Zeile
     und jeder andere bestehende Test unter `test/` bleibt, wie er ist.
- Kein Lauf gegen die Produktion oder den Sandbox-Server, `ops/status.sh` nur im Test über `ops/db-report.cjs` mit eigener Datenbank.
- Rollout mit dem nächsten fälligen Deploy (`src/**`). Die Tabelle entsteht beim ersten Öffnen der Datenbank nach dem Deploy; bis
  dahin meldet der Status `null`. Der Release Manager prüft nach dem Deploy lesend, dass `db.undeleted_sandboxes` in der Ausgabe von
  `ops/status.sh` eine Zahl ist.
- Doku: Der Abschnitt „Ein Start, der nicht fertig wurde“ in `docs/sandbox/automaton.md` nennt die Log-Zeile und `db.undeleted_sandboxes`,
  der Kopfkommentar von `src/automaton/sweep.ts` den Zähler und die Tabelle.
- Prüfbefehle ohne Netz, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Progress Log und Verdicts zitieren keine Suchausdrücke der Prüfbefehle wörtlich.
- Ablauf: zuerst Tabelle, Sweep und Rückgabewert mit dem Test (Punkte 1 und 2), dann `ops/db-report.cjs` und Schwelle (Punkt 3), die
  Gegenproben (Punkt 4), Annahmen und Doku (Punkt 5), Umfang (Punkt 6), zuletzt `check` lokal und die Jobs am PR (Punkt 7). Nach
  jedem grünen Punkt Commit und Push.
- Widerlegt, wenn `sweepAutomatons` am Kopf von `dev` ein gescheitertes Löschen schon im Rückgabewert zählt; dann endet das Goal mit
  diesem Befund in den Annahmen.

## Done Condition
- [x] Der Sweep schreibt je gescheitertem Löschen und je gescheiterter Abfrage eine Log-Zeile, zählt gescheiterte Löschungen als
      `failed` und hält den ersten Fehlschlag in `sweep_failures`, bis das Löschen gelingt.
      MVP: Funktion, weil eine Sandbox, deren Löschen `sandboxd` dauerhaft ablehnt, sonst unbemerkt weiter Credits des Kunden bucht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-sweep-undeleted.test.ts test/automaton-sweep.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in 'sweep could not delete sandbox' 'sweep could not ask sandbox' 'retrying next round' 'sweep_failures' 'first_failed_at'; do grep -qF -- "$w" src/automaton/sweep.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'CREATE TABLE IF NOT EXISTS sweep_failures' src/db.ts` muss 1 ausgeben.
- [x] `test/automaton-sweep-undeleted.test.ts` deckt Ablehnung mit 500 und 409, den ersten Fehlschlag, die Rückkehr, die Abfrage und
      die Zahl im Bericht ab.
      MVP: Funktion, weil ein Merge, der die Meldung bricht, sonst erst auffällt, wenn eine Sandbox schon Tage bucht.
      Prüfung: `for w in 'sweep could not delete sandbox' 'sweep could not ask sandbox' '(501), retrying next round' 'status: 500' 'status: 409' 'failed: 1' 'failed: 0' first_failed_at undeleted_sandboxes 'DROP TABLE sweep_failures' CP_DB_PATH ops/db-report.cjs; do grep -qF -- "$w" test/automaton-sweep-undeleted.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] `ops/db-report.cjs` gibt `undeleted_sandboxes` aus, und `ops/README.md` nennt die Schwelle dafür.
      MVP: Funktion, weil die Ops-Triage nur sieht, was `ops/status.sh` ausgibt und `ops/README.md` als Schwelle nennt.
      Prüfung: `grep -c 'undeleted_sandboxes' ops/db-report.cjs` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '^\| .db\.undeleted_sandboxes. \| above 0 \|' ops/README.md` muss 1 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops/status.sh | wc -l` muss 0 ausgeben.
- [x] Der neue Test ist rot gegen den Sweep und gegen den Bericht vom Stand vor dem Fix.
      MVP: Funktion, weil ein Test, der ohne die Meldung grün bleibt, keinen Kunden vor einer verwaisten Sandbox schützt.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; git show $(git merge-base origin/dev HEAD):src/automaton/sweep.ts > $T/src/automaton/sweep.ts; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-sweep-undeleted.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; git show $(git merge-base origin/dev HEAD):ops/db-report.cjs > $T/ops/db-report.cjs; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-sweep-undeleted.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 1 ausgeben.
- [x] Die Entscheidungen 1 bis 7 stehen mit Grund unter `## Goal 07` in `goals/hosting/ANNAHMEN.md`, und `docs/sandbox/automaton.md`
      nennt die Log-Zeile und `db.undeleted_sandboxes`.
      MVP: Funktion, weil wer die Zeile im Log oder die Zahl im Status liest, ohne Suche wissen muss, was zu tun ist.
      Prüfung: `for w in 'sweep_failures' '(501)' 'could not ask' 'readonly' 'null' 'hosted_automatons'; do awk '/^## Goal 07/{f=1;next} /^## /{f=0} f' goals/hosting/ANNAHMEN.md | grep -qF -- "$w" || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `for w in 'sweep could not delete sandbox' 'undeleted_sandboxes'; do grep -qF -- "$w" docs/sandbox/automaton.md || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Das Goal ändert nur seine eigenen Dateien, an bestehenden Tests nur die erwarteten Rückgabewerte in
      `test/automaton-sweep.test.ts`, bringt keinen Schlüssel ins Repo, und seine Texte sind ohne Gedankenstrich.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8) und jede weitere Datei auf dem Laufzeitpfad einen Rollout ohne Nutzen
      für den Kunden auslöst (Grundregel 5).
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(src/automaton/sweep\.ts|src/automaton/service\.ts|src/db\.ts|ops/db-report\.cjs|ops/README\.md|docs/sandbox/automaton\.md|test/automaton-sweep\.test\.ts|test/automaton-sweep-undeleted\.test\.ts|goals/hosting/.+)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only --diff-filter=MD $(git merge-base origin/dev HEAD) HEAD -- test/ | grep -vc '^test/automaton-sweep\.test\.ts$'` muss 0 ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); diff <(git diff -U0 $B HEAD -- test/automaton-sweep.test.ts | grep '^-[^-]' | cut -c2-) <(git diff -U0 $B HEAD -- test/automaton-sweep.test.ts | grep '^+[^+]' | cut -c2- | sed -E 's/, failed: [0-9]+//')` muss nichts ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}|0x[0-9a-fA-F]{64})'` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- . | grep '^+' | grep -c $'\xe2\x80\x93\|\xe2\x80\x94'` muss 0 ausgeben.
- [ ] `check` ist lokal grün, und die Jobs `check` und `e2e` des Goal-PR sind auf dem GitHub-Rechner grün.
      MVP: Funktion, weil der Sweep auf dem Laufzeitpfad liegt und erst `e2e` zeigt, dass der Start der unveränderten Runtime weiter geht.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/hosting-07 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="check") | .state'` muss `SUCCESS` ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/hosting-07 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Gegenproben waren rot, wie sie sollen; die Zeile im Progress Log nennt, womit.
- [ ] Der Fall „changes no row and does not throw while sandboxd does not answer“ bleibt bis auf `failed: <n>` unverändert grün.
- [ ] Code, Kommentare, Testnamen und Meldungen Englisch, Goal-Datei und Annahmen Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `ops/sandbox/**`, `ops/status.sh`, `ops/watchdog.sh`, `src/sandbox/**`, `src/payments/**`, `src/auth/**`,
  `src/index.ts`, `package.json`, `pnpm-lock.yaml`, bestehende Dateien unter `test/` außer den erwarteten Rückgabewerten in
  `test/automaton-sweep.test.ts`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `ops/status.sh` ohne nachgebaute Umgebung (ruft Zahlungsserver, OpenRouter und Base); `~/.config/control-plane/loop.env` liest dieses
  Goal nicht
- der Zahlungsserver `76.13.144.207` und der Sandbox-Server `72.62.51.224`: kein Zugriff, kein Rollout, kein Neustart
- Kauf, Aufladung, Wallet-Bewegung, Gutschrift oder Löschen einer Sandbox von Hand (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log

## Blockers
Keine.
