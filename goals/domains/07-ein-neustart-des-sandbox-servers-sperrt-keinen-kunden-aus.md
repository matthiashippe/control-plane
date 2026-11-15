# Domains Goal 07: Ein Neustart des Sandbox-Servers sperrt nach einem Schlüssel-Reset keinen Kunden aus

## Status
PLANNED

## Active Objective
`ops/sandbox/setup.sh --check <address>` bekommt den Fakt `cp_pub`: gewünscht `yes`, auf dem Sandbox-Server `yes`, wenn
`/etc/sandboxd/keys/cp.pub` liegt oder der Timer `cp-pub-restore` aktiv ist, sonst `no`. Damit meldet `--check` die Zeile
`CHANGE fact cp_pub want=yes have=no`, sobald `cp.pub` fehlt und kein Timer es zurücklegt, etwa nach einem Neustart zwischen Reset
und Ablauf des Timers, der als transiente Unit von `systemd-run` (`CP_PUB_TIMER`) mit dem Neustart wegfällt. Der Selbsttest bekommt
die Fälle `desired`, `gather`, `present`, `reboot` und `timer` mit je einer Zeile `selftest cp-pub-check: ok (<fall>)`, und
`test/sandbox-setup-selftest.test.ts` verlangt jede davon, rot vor dem Fix. Geändert werden nur `ops/sandbox/setup.sh`, der Test und
`ops/README.md`, kein Rollout (`ROADMAP.md`, domains 07; übernimmt `goals/_vorschlaege/domains-kritik-2026-11-14-3.md`).
MVP: Robustheit, weil ein Neustart im Fenster eines Resets selten ist, die Folge aber ein Ausfall jeder Anlage einer Sandbox für alle
Kunden ohne Frist, den bisher kein Lauf als fehlenden Schlüssel benennt.

## Voraussetzungen
- domains Goal 06 DONE

## Kontext für den Maker
- Ziel: Ein fremder Automaton, der bei uns Sandboxes anlegt, verliert seine Anlagen nicht unbemerkt, weil der nächste Lauf mit
  `--check` (der nächtliche Audit fährt `bash ops/sandbox/setup.sh --check <address> | tail -1` als Prüfung von sandbox 02) ein
  fehlendes `cp.pub` ohne laufenden Timer als `SETUP CHECK DRIFT` meldet und `CHANGE fact cp_pub want=yes have=no` sagt, was fehlt;
  danach hilft `--client-key`.
- Widerlegt ist das Glied nicht: `git grep -c 'fact cp_pub' origin/dev -- ops/sandbox/setup.sh` endet am 15.11.2026 mit Exit 1, und
  `GATHER` liest `cp.pub` nicht; ein fehlender Schlüssel zeigt sich heute nur als `key not accepted` im Log von `sandboxd` und als
  Ausfall der Anlage in `ops/live.sh`.
- Ein Schnipsel für beide Orte, wie `PIN_FUNCS`: eine Funktion `cp_pub_fact <root>` in einem Text `CP_PUB_FACT`, der vor `GATHER`
  steht und dort per Platzhalter eingesetzt wird (auf dem Host mit leerem Root-Präfix), und den der Selbsttest gegen ein Root-Präfix
  aus `mktemp -d` mit einem nachgebauten `systemctl` auf dem `PATH` fährt. `yes`, wenn `<root>/etc/sandboxd/keys/cp.pub` als Datei
  liegt oder `systemctl is-active -q cp-pub-restore.timer` gelingt, sonst `no`. Fail closed: Scheitert `systemctl` aus einem anderen
  Grund, gilt der Timer als nicht aktiv, weil ein falscher Alarm billiger ist als ein stiller Ausfall. Der Name der Unit kommt aus
  `RESTORE_UNIT`; steht die Variable dafür zu spät in der Datei, zieht sie vor `GATHER`, statt den Namen ein zweites Mal zu schreiben.
- `desired()` bekommt genau die Zeile `  echo "fact cp_pub yes"`, `GATHER` die Zeile `echo "fact cp_pub $(cp_pub_fact '')"`, beide am
  Ende ihres Blocks (nach den `dir`-Zeilen in `desired()`, nach `fact image_pin` in `GATHER`). Der offene PR #100 (sandbox 07,
  `BLOCKED matthias`) fügt `fact origin_cert` nach `fact caddy_valid` in beide Blöcke ein; am Ende bleibt der Abgleich klein.
- Neue Funktion `selftest_cp_pub_check` in einer eigenen Subshell, aufgerufen in `selftest()` als Schritt 7, mit diesen Fällen, jeder
  mit `selftest cp-pub-check: ok (<fall>)` oder `selftest cp-pub-check: FAIL <fall>: <warum>`:
  - `desired`: `desired` enthält genau eine Zeile `fact cp_pub yes`.
  - `gather`: `GATHER` enthält den Text von `CP_PUB_FACT` und genau eine Zeile `echo "fact cp_pub $(cp_pub_fact '')"`, damit der
    Selbsttest dasselbe prüft, was auf dem Host läuft.
  - `present`: `cp.pub` liegt, kein Timer: Fakt `yes`, `compare` gegen `desired` meldet `SETUP CHECK OK changed=0`.
  - `reboot`: `cp.pub` weg, `cp.pub.prev` da, kein Timer (der nachgebaute `systemctl` meldet die Unit inaktiv): Fakt `no`, `compare`
    meldet genau `CHANGE fact cp_pub want=yes have=no` und als letzte Zeile `SETUP CHECK DRIFT changed=1`.
  - `timer`: `cp.pub` weg, `cp.pub.prev` da, Timer aktiv: Fakt `yes`, `compare` meldet `SETUP CHECK OK changed=0`, also keine Zeile
    `CHANGE fact cp_pub`.
  Für `compare` nimmt der Fall die Datei aus `desired` und ersetzt nur die Zeile `fact cp_pub` durch das Ergebnis von `cp_pub_fact`,
  damit eine Abweichung genau aus diesem Fakt kommt.
- `test/sandbox-setup-selftest.test.ts`: eine Liste `CP_PUB_CHECK_CASES` mit `desired`, `gather`, `present`, `reboot` und `timer`,
  deren Zeilen wie die bisherigen wörtlich verlangt werden. Die übrigen Erwartungen bleiben, wie sie sind.
- Der Kopf von `setup.sh` (die Zeile zu `--check`) und `ops/README.md` nennen den Fakt `cp_pub` mit einem Halbsatz: Er meldet ein
  fehlendes `cp.pub` ohne laufenden Timer `cp-pub-restore`, etwa nach einem Neustart im Fenster eines Resets, und dann hilft
  `--client-key`.
- Ein Host vor dem ersten `--client-key` meldet danach ebenfalls `CHANGE fact cp_pub want=yes have=no`, auch am Ende von `apply`.
  Das ist gewollt, weil dort ebenfalls kein Kunde anlegen kann; der Satz steht in `goals/domains/ANNAHMEN.md`.
- Nicht Teil dieses Goals: eine Unit-Datei unter `/etc/systemd/system`, die den Timer über einen Neustart rettet, `sandboxd`, der
  Dienst unter `src/`, `ops/live.sh`, ein Lauf von `--check`, `apply`, `--client-key` oder `--client-key-reset` gegen den echten
  Sandbox-Server.

## Done Condition
- [ ] `check` hält den neuen Fakt: Der Test ist grün, und ein gestrichener Fakt in `desired()` oder ein umbenannter Fall macht ihn rot.
      Prüfung: `node_modules/.bin/vitest run test/sandbox-setup-selftest.test.ts` muss Exit-Code 0 haben.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; grep -c "^  echo \"fact cp_pub yes\"$" "$d/ops/sandbox/setup.sh"; sed -i "/^  echo \"fact cp_pub yes\"$/d" "$d/ops/sandbox/setup.sh"; (cd "$d" && node_modules/.bin/vitest run test/sandbox-setup-selftest.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; sed -i "s/ok (reboot)/ok (restart)/" "$d/ops/sandbox/setup.sh"; grep -c "ok (restart)" "$d/ops/sandbox/setup.sh"; (cd "$d" && node_modules/.bin/vitest run test/sandbox-setup-selftest.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
- [ ] `--check` meldet ein fehlendes `cp.pub` ohne Timer und schweigt bei aktivem Timer.
      Prüfung: `bash ops/sandbox/setup.sh --selftest | grep -cE '^selftest cp-pub-check: ok \((desired|gather|present|reboot|timer)\)$'` muss `5` ausgeben.
      Prüfung: `grep -c 'CHANGE fact cp_pub want=yes have=no' ops/sandbox/setup.sh` muss mindestens `1` ausgeben.
- [ ] Die bisherigen Fälle bleiben grün, und der ganze Selbsttest ist grün.
      Prüfung: `bash ops/sandbox/setup.sh --selftest | grep -cE '^selftest client-key-reset: ok \((moved|again|reinstall|foreign|unknown|no-timer|ours|restore|keep|late)\)$'` muss `10` ausgeben.
      Prüfung: `bash ops/sandbox/setup.sh --selftest | grep -cE '^selftest image-pin: ok \((desired|fresh|rebuild|again)\)$'` muss `4` ausgeben.
      Prüfung: `bash ops/sandbox/setup.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `SETUP SELFTEST OK` ausgeben.
- [ ] `ops/README.md` nennt den Fakt.
      Prüfung: `grep -c 'cp_pub want=yes have=no' ops/README.md` muss mindestens `1` ausgeben.
- [ ] Das Goal ändert nur `ops/sandbox/setup.sh`, den Test, `ops/README.md` und Dateien unter `goals/domains/`.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cvE '^(ops/sandbox/setup\.sh|ops/README\.md|test/sandbox-setup-selftest\.test\.ts|goals/domains/.*)$'` muss `0` ausgeben.
- [ ] `check` ist grün, hier und im Required Check am PR auf dem GitHub-Rechner.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `gh pr checks goal/domains-07 -R matthiashippe/control-plane --required --json name,bucket --jq '.[] | select(.name=="check") | .bucket'` muss `pass` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der neue Test war vor dem Fix rot (die Zeilen `selftest cp-pub-check: ok (…)` fehlten); die Zeile im Progress Log nennt, womit.
- [ ] Gepflanzte Gegenproben sind rot und im Progress Log genannt: ein `cp_pub_fact`, der den Timer nicht fragt (`FAIL timer`), einer,
      der nur `cp.pub.prev` sucht oder immer `yes` sagt (`FAIL reboot`), und ein `GATHER` mit eigener Kopie der Prüfung statt des
      Schnipsels (`FAIL gather`).
- [ ] Scheitert der nachgebaute `systemctl` mit einem anderen Fehler als „inaktiv“, ist der Fakt `no`; der Weg steht im Progress Log.
- [ ] `goals/domains/ANNAHMEN.md` nennt, dass ein Host vor dem ersten `--client-key` den Fakt ebenfalls als Abweichung meldet, und dass
      der Timer über einen Neustart weiter verloren geht und nur gemeldet wird.
- [ ] Keine Ausgabe nennt ein Konto, eine Adresse eines Kunden oder `CP_HOST`.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `test/**` außer `test/sandbox-setup-selftest.test.ts`, `ops/sandbox/**` außer `ops/sandbox/setup.sh`,
  `ops/live.sh`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `~/.config/control-plane/**` (nur lesen)
- kein `--check`, `apply`, `--client-key`, `--client-key-reset` oder `--foreign-sandboxes` gegen den echten Sandbox-Server in diesem Goal
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
