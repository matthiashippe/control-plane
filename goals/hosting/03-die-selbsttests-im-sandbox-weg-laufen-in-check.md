# Hosting Goal 03: Die Selbsttests der Live-Läufe im Sandbox-Weg laufen in check

## Status
PLANNED

## Active Objective
Die Selbsttests von `ops/automaton-live.sh` (Live-Prüfung des gehosteten Automatons, sandbox 08) und `ops/runtime-sandbox.sh`
(Gang der unveränderten Runtime samt Stempel über `dist/`, sandbox 10) laufen in `check`: `test/automaton-live-selftest.test.ts`
startet `bash ops/automaton-live.sh --selftest`, `test/runtime-sandbox-selftest.test.ts` startet `bash ops/runtime-sandbox.sh
--selftest`, beide ohne Netz nach dem Muster von `test/sandbox-setup-selftest.test.ts`, mit Exit 0, der letzten Zeile
`AUTOMATON LIVE SELFTEST OK` oder `RUNTIME SANDBOX SELFTEST OK`, keiner Zeile `FAIL ` und je Fall des Selbsttests einer Zeile
`ok   <fall>: `. Jeder Test ist rot gegen eine Kopie seines Skripts mit einem gebrochenen Fall und gegen eine Kopie, in der ein Fall
still fehlt. Ändert nur Tests, kein Rollout (`ROADMAP.md`, hosting 03; übernimmt
`goals/_vorschlaege/sandbox-nacharbeit-2026-11-17-1.md` und `goals/_vorschlaege/sandbox-nacharbeit-2026-11-17-8.md`).
MVP: Funktion, weil heute kein Test unter `test/` eines der beiden Skripte aufruft, also bleibt ein Merge grün, der die Live-Prüfung
des gehosteten Automatons oder den Stempel der Runtime bricht, und erst das nächste Audit nach dem Merge wird rot.

## Voraussetzungen
- hosting Goal 02 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Merge, der die Prüfung bricht, mit der wir belegen, dass der Automaton eines Kunden bei uns in einer
  Sandbox läuft und richtig abgerechnet wird, wird vor dem Merge rot statt nach dem Rollout. Was dem nicht dient, gehört nicht in
  dieses Goal.
- Stand heute (`dev` am 17.11.2026, `8d69937`): `git grep -c 'automaton-live.sh' -- test scripts package.json` und dasselbe für
  `runtime-sandbox.sh` finden nichts. Beide Selbsttests sind am Kopf von `dev` grün: `bash ops/automaton-live.sh --selftest` endet
  nach 16 s mit Exit 0, 25 Zeilen `ok   ` und `AUTOMATON LIVE SELFTEST OK`; `bash ops/runtime-sandbox.sh --selftest` endet nach
  2 s mit Exit 0, 27 Zeilen `ok   `, der Zeile `27 cases as expected` und `RUNTIME SANDBOX SELFTEST OK` (Messung Tech Lead auf dem
  code-host, Node 22).
- Muster ist `test/sandbox-setup-selftest.test.ts` (domains 06): `spawn` statt `spawnSync`, damit der vitest-Worker frei bleibt,
  `timeout: 240_000` am Kindprozess, Testtimeout `300_000`, stdout sammeln, stderr verwerfen, dann in dieser Reihenfolge prüfen:
  fehlende Fallzeilen gegen eine Liste (Ergebnis `[]`), keine Zeile mit `FAIL`, letzte Zeile, Exit 0, jede Assertion mit
  `run.stdout` als Nachricht. Kein Wert prüft die Dauer, weil der code-host geteilt ist.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 03` in `goals/hosting/ANNAHMEN.md`):
  1. **Jeder Fall beim Namen, nicht nur die letzte Zeile.** Beide Tests führen die Fälle ihres Selbsttests als Liste von Strings in
     doppelten Anführungszeichen und verlangen je Fall eine Zeile, die mit `ok   <fall>: ` beginnt (drei Leerzeichen nach `ok`, wie
     die Skripte drucken). Grund: Ein Fall, der beim Umbau still aus dem Selbsttest fällt, lässt die letzte Zeile `OK`, und genau
     die Fälle aus sandbox 10 sind der einzige Beleg der Done-Punkte von sandbox 10.
     - `ops/automaton-live.sh`, die 15 Läufe von `run_case`: `good`, `reboot`, `no-turn`, `credits-create`, `credits-exec`,
       `start-fail`, `foreign`, `foreign-unreadable`, `no-reboot`, `no-turn-after`, `wallet`, `hold`, `no-inference`,
       `claude-only`, `leak`. Die Zeilen `ok   guard …` deckt die Regel „keine Zeile `FAIL`“ ab.
     - `ops/runtime-sandbox.sh`, alle 27 Fälle: `ledger-query`, `ledger-wildcard`, `good`, `exec-wrong`, `expose-409`,
       `expose-payment-domain`, `remove-missing`, `retried-503`, `still-listed`, `ledger-0`, `ledger-2`, `ledger-none`,
       `hold-left`, `create-402`, `no-result`, `other-commit`, `changed-file`, `untracked-file`, `dist-changed`, `dist-added`,
       `dist-unstamped`, `dist-other-commit`, `rebuild-changed-dist`, `reuse-stamped-dist`, `rebuild-drops-stale`, `unbuilt`,
       `missing`. Darunter die sieben aus sandbox 10, die die ROADMAP nennt.
  2. **Nur Tests.** Die beiden Skripte bleiben, wie sie sind; Fallnamen, Ausgabe und letzte Zeile sind der Vertrag, den fertige
     Goals prüfen (sandbox 08 und sandbox 10). hosting 06 hängt an `test/runtime-sandbox-selftest.test.ts` später den Fall
     `deps-changed` an, deshalb steht die Liste der Fälle als eigene Konstante oben in der Datei.
  3. **Gegenprobe je Test in zwei Richtungen.** In einer Kopie des Repos im `mktemp`-Ordner wird das Skript gebrochen und nur der
     neue Test gefahren: einmal schlägt ein Fall fehl (Selbsttest endet mit `FAIL`), einmal fehlt ein Fall still (Selbsttest endet
     trotzdem mit `OK`). Beide Male muss der Test rot sein. Die Befehle stehen unten in den Punkten 1 und 2 und werden genau so
     gefahren; trifft ein `sed` nichts, bleibt der Test grün und die Gegenprobe zeigt 0, also schützt sie sich selbst.
  4. **Auch auf dem GitHub-Rechner grün.** `check` ist der Required Check auf `dev` und läuft dort im Job `check`. Ein Selbsttest,
     der nur auf dem code-host grün ist (fehlendes Werkzeug, Git ohne Benutzer), macht `dev` rot; deshalb zählt der grüne Job
     `check` des Goal-PR (Punkt 3). Braucht ein Selbsttest dort etwas, das fehlt, steht das mit Beleg in den Annahmen, und das
     Skript bleibt trotzdem unverändert (Punkt 4); dann ist der Punkt eine Ehrliche Lücke, keine Änderung am Skript.
- Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im
  Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Progress Log und Verdicts zitieren keine
  Suchausdrücke der Prüfbefehle wörtlich.
- Kein Lauf gegen die Produktion, den Sandbox-Server oder Conway; beide Skripte nur mit `--selftest`. Kein Rollout: Das Goal ändert
  keinen Pfad, den `plan` in `deploy.yml` zum Laufzeitpfad zählt.
- Ablauf: zuerst `test/automaton-live-selftest.test.ts` mit beiden Gegenproben (Punkt 1), dann `test/runtime-sandbox-selftest.test.ts`
  mit beiden Gegenproben (Punkt 2), dann `check` lokal und der Job `check` am PR (Punkt 3), dann Umfang und Annahmen (Punkte 4
  und 5). Nach jedem grünen Punkt Commit und Push.
- Widerlegt, wenn ein Test unter `test/` am Kopf von `dev` eines der beiden Skripte schon aufruft; dann endet das Goal mit dieser
  Messung in den Annahmen.
- Was danach schneller zu mehr zahlenden Automatons führt: hosting 04 legt die beiden Gutschriften der eigenen Live-Prüfung
  zusammen, hosting 05 meldet einen Ausfall des Sandbox-Servers, bevor ein Kunde ihn trifft; beide fahren dann gegen einen `check`,
  der die Live-Prüfung des gehosteten Automatons schon mitprüft.

## Done Condition
- [ ] `test/automaton-live-selftest.test.ts` startet `bash ops/automaton-live.sh --selftest` ohne Netz und verlangt Exit 0, die
      letzte Zeile `AUTOMATON LIVE SELFTEST OK`, keine Zeile mit `FAIL` und je Lauf von `run_case` eine Zeile `ok   <fall>: `; der
      Test ist rot gegen eine Kopie mit einem gebrochenen Fall und gegen eine Kopie, in der ein Fall still fehlt.
      MVP: Funktion, weil die Live-Prüfung des gehosteten Automatons sonst erst im Audit nach dem Merge rot wird und ein kaputtes
      Werkzeug den Release Manager einen Kunden-Automaton als gesund melden lässt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-live-selftest.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for c in good reboot no-turn credits-create credits-exec start-fail foreign foreign-unreadable no-reboot no-turn-after wallet hold no-inference claude-only leak; do grep -qF -- "\"$c\"" test/automaton-live-selftest.test.ts || echo "fehlt $c"; done` muss nichts ausgeben.
      Prüfung: `grep -cF "AUTOMATON LIVE SELFTEST OK" test/automaton-live-selftest.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/ withheld=4$/ withheld=5/' $T/ops/automaton-live.sh; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-live-selftest.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i '/^  run_case no-inference INF=0$/d; /^  expect no-inference /d' $T/ops/automaton-live.sh; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-live-selftest.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss 1 ausgeben.
- [ ] `test/runtime-sandbox-selftest.test.ts` startet `bash ops/runtime-sandbox.sh --selftest` ohne Netz und verlangt Exit 0, die
      letzte Zeile `RUNTIME SANDBOX SELFTEST OK`, keine Zeile mit `FAIL` und je Fall des Selbsttests, darunter die sieben aus
      sandbox 10, eine Zeile `ok   <fall>: `; der Test ist rot gegen eine Kopie mit einem gebrochenen Fall und gegen eine Kopie, in
      der ein Fall still fehlt.
      MVP: Funktion, weil sonst ein Merge, der den Stempel über `dist/` bricht, grün bleibt und der Gang eine Runtime als die am
      Pin meldet, die es nicht ist (Grundregel 13).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/runtime-sandbox-selftest.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for c in ledger-query ledger-wildcard good exec-wrong expose-409 expose-payment-domain remove-missing retried-503 still-listed ledger-0 ledger-2 ledger-none hold-left create-402 no-result other-commit changed-file untracked-file dist-changed dist-added dist-unstamped dist-other-commit rebuild-changed-dist reuse-stamped-dist rebuild-drops-stale unbuilt missing; do grep -qF -- "\"$c\"" test/runtime-sandbox-selftest.test.ts || echo "fehlt $c"; done` muss nichts ausgeben.
      Prüfung: `grep -cF "RUNTIME SANDBOX SELFTEST OK" test/runtime-sandbox-selftest.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/"builds=1 state=ok"/"builds=2 state=ok"/g' $T/ops/runtime-sandbox.sh; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/runtime-sandbox-selftest.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/echo "ok   rebuild-drops-stale: $got"/:/' $T/ops/runtime-sandbox.sh; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/runtime-sandbox-selftest.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss 1 ausgeben.
- [ ] `check` ist lokal grün, und der Job `check` des Goal-PR ist auf dem GitHub-Rechner grün.
      MVP: Funktion, weil `check` der Required Check auf `dev` ist und ein Selbsttest, der nur auf dem code-host läuft, jeden
      weiteren Merge des Loops blockiert.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/hosting-03 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="check") | .state'` muss `SUCCESS` ausgeben.
- [ ] Das Goal ändert nur die beiden neuen Tests und `goals/hosting/`, weder die beiden Skripte noch `src/`, Betrieb, Runtime, Deploy
      oder CI, und bringt keinen Schlüssel ins Repo.
      MVP: Funktion, weil die Ausgabe der Skripte der Vertrag fertiger Goals ist (sandbox 08 und 10), das Repo öffentlich ist
      (Grundregel 8) und ein Goal ohne Pfad des Laufzeitpfads den Kunden keinen Rollout kostet (Grundregel 5).
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vcE '^(test/automaton-live-selftest\.test\.ts|test/runtime-sandbox-selftest\.test\.ts|goals/hosting/)'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- ops src harness deploy .github scripts package.json pnpm-lock.yaml | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5})'` muss 0 ausgeben.
- [ ] Die Entscheidungen stehen mit Grund unter `## Goal 03` in `goals/hosting/ANNAHMEN.md`, samt den Gegenproben und ihrem
      Ergebnis.
      MVP: Funktion, weil hosting 06 den Fall `deps-changed` an denselben Test hängt und wissen muss, warum jeder Fall beim Namen
      steht.
      Prüfung: `awk '/^## Goal 03/{f=1} f' goals/hosting/ANNAHMEN.md | grep -ciE "Gegenprobe|beim Namen|deps-changed|GitHub|spawn"` muss mindestens 4 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede Gegenprobe war rot, wie sie soll; die Zeile im Progress Log nennt je Test, womit (gebrochener Fall, still fehlender Fall).
- [ ] Die beiden Skripte und ihre Ausgabe bleiben Byte für Byte, wie sie am Kopf von `dev` sind.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Annahmen Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `ops/sandbox/**`, `ops/automaton-live.sh`, `ops/runtime-sandbox.sh`, `src/**`, `ops/conway-series.sh`,
  `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `/root/.automaton/wallet.json` in jeder Sandbox: nie lesen, kopieren oder ausgeben
- der Zahlungsserver `76.13.144.207` und der Sandbox-Server `srv1327036`: kein Zugriff in diesem Goal, kein Rollout, kein Neustart;
  beide Skripte laufen nur mit `--selftest`
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
Keine.
