# Domains Goal 06: Der Selbsttest der Sandbox-Einrichtung hält in check

## Status
DONE

## Active Objective
`test/sandbox-setup-selftest.test.ts` startet `bash ops/sandbox/setup.sh --selftest` ohne Netz und verlangt Exit 0, die letzte Zeile
`SETUP SELFTEST OK` und jede Zeile `selftest image-pin: ok (…)` und `selftest client-key-reset: ok (…)`, rot mit einem gepflanzten
Label `sandboxd=1` in `pin_image`. `client_key_reset` fragt `foreign_sandboxes` nach dem Verschieben ein zweites Mal ab und legt
`cp.pub.prev` sofort zurück, wenn jetzt eine fremde Sandbox läuft (letzte Zeile `SETUP CLIENT-KEY-RESET FAIL: foreign sandbox
started`), mit einem Selbsttestfall `late`, rot vor dem Fix. Geändert werden nur `ops/sandbox/setup.sh`, der neue Test und
`ops/README.md`, `sandboxd` bleibt, wie er ist (`ROADMAP.md`, domains 06; übernimmt `goals/_vorschlaege/domains-nacharbeit-2026-11-14-1.md`
und `goals/_vorschlaege/domains-kritik-2026-11-14-2.md`).
MVP: Funktion, weil danach `check` vor dem Merge rot wird, wenn ein Goal den Pin des Basis-Images oder den Schlüssel-Reset bricht,
statt dass der nächste Prune um 00:26 UTC das Image löscht und jede Anlage einer Sandbox mit 501 antwortet, und weil ein Reset
keinen Kunden mehr aussperrt, dessen Anlage gerade startet.

## Voraussetzungen
- domains Goal 05 DONE

## Kontext für den Maker
- Ziel: Ein fremder Automaton, der bei uns Sandboxes anlegt, bekommt jede Anlage, weil kein Merge den Pin des Basis-Images oder den
  Schlüssel-Reset unbemerkt bricht und weil ein Reset auch eine Anlage sieht, die gerade startet.
- Widerlegt ist das Glied nicht: Kein Test und kein Skript in `check` ruft `setup.sh` auf
  (`git grep -n "setup.sh" origin/dev -- test scripts .github package.json` endet mit Exit 1), und `client_key_reset` fragt
  `foreign_sandboxes` nur einmal vor dem Verschieben ab (`grep -n 'client_key_reset()' -A22 ops/sandbox/setup.sh`). Den Selbsttest
  fährt heute nur der nächtliche Loop-Audit, also erst nach dem Merge.
- Der Test im Muster von `test/live-selftest.test.ts`: `spawn` statt `spawnSync`, damit der Worker von vitest nicht blockiert, mit
  großzügigem Zeitlimit (der Selbsttest brauchte am 14.11.2026 auf dem code-host 9 s, unter Last mehr); Geduld, keine Schwelle, kein
  Assert auf die Dauer. Er verlangt Exit 0, die letzte Zeile `SETUP SELFTEST OK`, die vier Zeilen `selftest image-pin: ok (desired)`,
  `(fresh)`, `(rebuild)`, `(again)` und die zehn Zeilen `selftest client-key-reset: ok (<fall>)` für `moved`, `again`, `reinstall`,
  `foreign`, `unknown`, `no-timer`, `ours`, `restore`, `keep` und `late`, jede wörtlich, damit ein umbenannter oder fehlender Fall rot
  wird. `check` findet den Test von selbst; `scripts/check.mjs` bleibt gesperrt.
- Der Required Check läuft auf `ubuntu-latest` mit `actions/setup-node` (Node 22) und totem Proxy, nicht auf dem code-host.
  `setup.sh` ruft an sieben Stellen `/usr/bin/node` fest auf, und der Selbsttest lädt `src/bounties/ours.ts` direkt mit Node
  (Type-Stripping). Ob es `/usr/bin/node` auf dem GitHub-Rechner gibt und welche Version es ist, ist nicht belegt: Der letzte Done-Punkt
  verlangt den grünen Required Check am PR, nicht nur den Lauf hier. Fehlt dort etwas, darf `setup.sh` für die lokalen Aufrufe einen
  Node wählen, der den Code auf dem Sandbox-Server nicht berührt; den Weg hältst du in `goals/domains/ANNAHMEN.md` fest. Der Test
  setzt keinen Pfad zu Node für den Selbsttest fest, der nur auf dem code-host stimmt.
- Die zweite Abfrage: nach `sbx_reset_cp_pub` und vor der Zeile `SETUP CLIENT-KEY-RESET OK …` ruft `client_key_reset` dieselbe Funktion
  `foreign_sandboxes` noch einmal. Läuft jetzt eine fremde Sandbox, legt es `cp.pub.prev` mit dem Snippet `CP_PUB_RESTORE` sofort
  zurück (nur wenn `cp.pub` fehlt, `mv -n`, ein neuerer Schlüssel gewinnt wie beim Timer) und endet mit
  `SETUP CLIENT-KEY-RESET FAIL: foreign sandbox started`, Exit ungleich 0. Fail closed wie in domains 05: Kann es eine Seite beim
  zweiten Mal nicht lesen, legt es ebenfalls sofort zurück und endet mit einer Zeile `SETUP CLIENT-KEY-RESET FAIL: …`, weil ein Reset,
  den man nicht prüfen kann, einen Kunden aussperren kann. Der Timer darf danach stehen bleiben, weil er bei vorhandenem `cp.pub`
  nichts tut. `moved=0` braucht keine zweite Abfrage, weil nichts verschoben wurde.
- Die Anlagen in der Map `pending` von `sandboxd` (`ops/sandbox/sandboxd.mjs:294`) sieht nur `sandboxd`; sie zu zeigen hieße den Dienst
  ändern, und der ist hier gesperrt. Die zweite Abfrage schließt das Fenster nicht ganz, sie verkürzt es auf die Zeit zwischen
  Verschieben und Abfrage; das steht in `goals/domains/ANNAHMEN.md`.
- Selbsttestfall `late` in `selftest_client_key_reset`: Die Attrappe von `sbx_state` liefert beim ersten Lesen nur eigene oder keine
  laufenden Sandboxes und beim zweiten eine fremde laufende. Erwartet: letzte Zeile `SETUP CLIENT-KEY-RESET FAIL: foreign sandbox
  started`, Exit ungleich 0, `cp.pub` mit demselben Hash wie vor dem Reset, `sandboxd` liest wieder genau `cp.pub` und den
  Prüfschlüssel. Dazu im selben Fall eine Variante, in der das zweite Lesen scheitert: FAIL, `cp.pub` wieder da. Zeile
  `selftest client-key-reset: ok (late)` oder `FAIL late: <warum>`. Die übrigen Fälle bleiben, wie sie sind, und bleiben grün.
- Konflikte klein halten: Der offene PR #100 (sandbox 07, `BLOCKED matthias`) ändert `setup.sh` ebenfalls und nimmt den neuen Test
  beim Abgleich mit `dev` mit. Ändere nur `client_key_reset`, `selftest_client_key_reset`, den Kopf und wenn nötig die Wahl von Node;
  `pin_image` bleibt unverändert, weil die Gegenprobe des ersten Done-Punkts dort `--label sandboxd.pin=1` sucht.
- `ops/README.md`: in der Zeile zu `--client-key-reset` ein Halbsatz, dass der Reset nach dem Verschieben noch einmal prüft und bei
  einer gerade gestarteten fremden Sandbox sofort zurücklegt.
- Nicht Teil dieses Goals: `sandboxd`, der Dienst unter `src/`, `ops/live.sh`, ein Reset oder eine Einrichtung auf dem echten
  Sandbox-Server.

## Done Condition
- [x] `check` hält den Selbsttest von `setup.sh`: Der neue Test ist grün, und ein gepflanztes Label `sandboxd=1` in `pin_image` oder
      ein umbenannter Fall des Schlüssel-Resets macht ihn rot.
      Prüfung: `node_modules/.bin/vitest run test/sandbox-setup-selftest.test.ts` muss Exit-Code 0 haben.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; sed -i "s/--label sandboxd.pin=1/--label sandboxd=1 --label sandboxd.pin=1/" "$d/ops/sandbox/setup.sh"; grep -c -- "--label sandboxd=1 --label sandboxd.pin=1" "$d/ops/sandbox/setup.sh"; (cd "$d" && node_modules/.bin/vitest run test/sandbox-setup-selftest.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; sed -i "s/ok (keep)/ok (kept)/" "$d/ops/sandbox/setup.sh"; grep -c "ok (kept)" "$d/ops/sandbox/setup.sh"; (cd "$d" && node_modules/.bin/vitest run test/sandbox-setup-selftest.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
- [x] Der Schlüssel-Reset prüft nach dem Verschieben ein zweites Mal und legt `cp.pub` sofort zurück, wenn jetzt eine fremde Sandbox
      läuft oder eine Seite nicht lesbar ist.
      Prüfung: `bash ops/sandbox/setup.sh --selftest | grep -cE '^selftest client-key-reset: ok \(late\)$'` muss `1` ausgeben.
      Prüfung: `grep -c 'SETUP CLIENT-KEY-RESET FAIL: foreign sandbox started' ops/sandbox/setup.sh` muss mindestens `1` ausgeben.
- [x] Die bisherigen Fälle bleiben grün, und der ganze Selbsttest ist grün.
      Prüfung: `bash ops/sandbox/setup.sh --selftest | grep -cE '^selftest client-key-reset: ok \((moved|again|reinstall|foreign|unknown|no-timer|ours|restore|keep)\)$'` muss `9` ausgeben.
      Prüfung: `bash ops/sandbox/setup.sh --selftest | grep -cE '^selftest image-pin: ok \((desired|fresh|rebuild|again)\)$'` muss `4` ausgeben.
      Prüfung: `bash ops/sandbox/setup.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `SETUP SELFTEST OK` ausgeben.
- [x] `ops/README.md` nennt die zweite Prüfung des Resets.
      Prüfung: `grep -c 'foreign sandbox started' ops/README.md` muss mindestens `1` ausgeben.
- [x] Das Goal ändert nur `ops/sandbox/setup.sh`, den neuen Test, `ops/README.md` und Dateien unter `goals/domains/`.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cvE '^(ops/sandbox/setup\.sh|ops/README\.md|test/sandbox-setup-selftest\.test\.ts|goals/domains/.*)$'` muss `0` ausgeben.
- [x] `check` ist grün, hier und im Required Check am PR auf dem GitHub-Rechner.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `gh pr checks goal/domains-06 -R matthiashippe/control-plane --required --json name,bucket --jq '.[] | select(.name=="check") | .bucket'` muss `pass` ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der Fall `late` war vor dem Fix rot (der alte `client_key_reset` meldete `moved=1` und ließ `cp.pub` weg); die Zeile im Progress
      Log nennt, womit.
- [ ] Gepflanzte Gegenproben sind rot und im Progress Log genannt: ein Reset ohne zweite Abfrage, ein Reset, der bei unlesbarer zweiter
      Abfrage nicht zurücklegt, ein Zurücklegen, das einen neueren `cp.pub` überschreibt, und ein Test, der einen fehlenden Fall nicht
      bemerkt.
- [ ] `goals/domains/ANNAHMEN.md` nennt den Weg zu Node im Required Check und das verbleibende Fenster zwischen Verschieben und zweiter
      Abfrage.
- [ ] Keine Ausgabe nennt ein Konto, eine Adresse eines Kunden oder `CP_HOST`.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `test/**` außer `test/sandbox-setup-selftest.test.ts`, `ops/sandbox/**` außer `ops/sandbox/setup.sh`,
  `ops/live.sh`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `~/.config/control-plane/**` (nur lesen)
- kein `--client-key-reset`, `--client-key` oder `apply` gegen den echten Sandbox-Server in diesem Goal
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut: neuer Test `test/sandbox-setup-selftest.test.ts` (spawn, 240 s Geduld) verlangt Exit 0, letzte Zeile `SETUP SELFTEST OK`, keine Zeile mit ` FAIL` und jede der vier Zeilen `selftest image-pin: ok (…)` und zehn Zeilen `selftest client-key-reset: ok (…)` wörtlich; `client_key_reset` fragt nach dem Verschieben (`moved=1`) `foreign_sandboxes` ein zweites Mal ab und legt über `cp_pub_back` (Schnipsel `CP_PUB_RESTORE`, `mv -n`) sofort zurück, bei fremder Sandbox mit der letzten Zeile `SETUP CLIENT-KEY-RESET FAIL: foreign sandbox started`, bei unlesbarer Seite mit `SETUP CLIENT-KEY-RESET FAIL: second check: …`; Selbsttestfall `late` mit vier Varianten (fremde Sandbox gestartet, `state.json` weg, Zahlungsserver weg, neuerer Schlüssel vor dem Zurücklegen); die sieben lokalen Node-Aufrufe nehmen `LOCAL_NODE` (`SETUP_NODE`, `/usr/bin/node`, Node auf dem `PATH`, der erste mit `node:sqlite` und Type-Stripping), Weg und verbleibendes Fenster in `goals/domains/ANNAHMEN.md`, `ops/README.md` nennt die zweite Prüfung. Rot vor dem Fix: der neue Test ohne Fall `late` (`selftest client-key-reset: ok (late)` fehlte), dann `late` gegen den alten `client_key_reset` (`FAIL late: exit 0, last line SETUP CLIENT-KEY-RESET OK moved=1, 1 reads of state.json, want 2`). Gepflanzt und rot: Reset ohne zweite Abfrage (`FAIL late`), unlesbare zweite Abfrage ohne Zurücklegen (`FAIL late: no state.json: cp.pub not back`), Zurücklegen mit `mv -f` ohne Prüfung auf `cp.pub` (`FAIL keep`, `FAIL late: newer key`; die erste Fassung mit gleichem Schlüsselinhalt blieb grün und wurde ersetzt), Test ohne fehlenden Fall (Punkt 1, `ok (kept)`: `exit 1`); Node-Wahl: mit `SETUP_NODE` auf Node 24 `SETUP SELFTEST OK`, ein unbrauchbarer `SETUP_NODE` fällt auf `/usr/bin/node` zurück. Prüfbefehle: P1 Exit 0, `1` `exit 1`, `1` `exit 1`; P2 `1`, `4`; P3 `9`, `4`, Exit 0 mit `SETUP SELFTEST OK`; P4 `1`; P5 `0`; P6 `node scripts/check.mjs` Exit 0 (1781 Tests grün, mit Node 22 auf dem `PATH`), Required Check am PR folgt im Kommentar.
- 2026-11-14 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, nach Merge von `origin/dev` (9d7d99e) in den Goal-Branch. Prüfbefehle: P1 Exit 0, `1` `exit 1`, `1` `exit 1`; P2 `1`, `4`; P3 `9`, `4`, Exit 0 mit `SETUP SELFTEST OK`; P4 `1`; P5 `0`; P6 `node scripts/check.mjs` Exit 0 (154 Dateien, 1781 Tests grün, Node 22), Required Check `check` am PR im Kommentar.
- 2026-11-14 Release: PASS K und B (Zyklus 2), DONE.

## Blockers
