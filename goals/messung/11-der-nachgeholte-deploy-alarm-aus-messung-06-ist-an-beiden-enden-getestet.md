# Messung Goal 11: Der nachgeholte Deploy-Alarm aus messung 06 ist an beiden Enden getestet

## Status
PLANNED

## Active Objective
Der Weg eines Deploy-Alarms, der nach einem 502 nicht rausging, hängt am Kopf von `dev` (595798e) an zwei Stellen, die kein Test
festhält. Erstens bilden `ops/deploy-alarm.sh` (Zeile 56, `pending="${state:-/var/lib/cp-watchdog.state}.deploy-502"`) und
`ops/watchdog.sh` (Zeile 20, `STATE_FILE="${CP_WATCHDOG_STATE:-/var/lib/cp-watchdog.state}"`) den Pfad der Merkdatei aus zwei
getrennt geschriebenen Standardwerten. Die Crontab aus `ops/README.md` setzt kein `CP_WATCHDOG_STATE`, in der Produktion gelten
also genau diese beiden Werte, und jeder Fall in `test/deploy-alarm-pending.test.ts` setzt `CP_WATCHDOG_STATE` selbst; ändert
jemand einen der beiden Werte, schreibt der Deploy-Alarm in eine Datei, die der Watchdog nie liest, und `check` bleibt grün.
Zweitens schwärzt `ops/deploy-window.sh` (Zeile 465) jede Rückmeldung von `ops/deploy-alarm.sh` zu `<url>` und `<address>`, weil
sie im öffentlichen Log des Deploy-Jobs landet, aber jeder nachgebaute `ssh` in `test/deploy-window-rollout.test.ts` und
`test/deploy-alarm-pending.test.ts` antwortet auf `bash -s` ohne Ausgabe; ein Umbau, der `alarm_out` ungeschwärzt druckt, bleibt
grün.
Nach diesem Goal hat `test/deploy-alarm-pending.test.ts` einen Fall, der beide Standardwerte aus den Skripten liest und Gleichheit
verlangt, und `test/deploy-window-rollout.test.ts` einen Fall, dessen `ssh` auf `bash -s` eine Dokumentations-URL und eine
Dokumentationsadresse ausgibt und mit 255 endet. Beide sind grün am Kopf von `dev` und rot gegen eine Kopie der Skripte mit
geändertem Pfad oder ohne die Schwärzung. Das Goal ändert nur diese zwei Testdateien.
Widerlegt, wenn einer der beiden Fälle am Kopf von `dev` ohne Änderung an den Skripten rot ist (dann ist ein Skript kaputt, und
das wird ein Glied von `fehler` statt eines Tests; der Maker schreibt das Ergebnis des zweiten Prüfbefehls von Punkt 1 und des
zweiten von Punkt 2, gefahren vor jeder anderen Änderung, in die erste Zeile des Progress Log).
MVP: Funktion, weil ein Deploy-Alarm, der in eine ungelesene Datei geht, den 502 an einen zahlenden Kunden wieder niemandem meldet,
und eine Adresse oder der Webhook im öffentlichen Job-Log Grundregel 8 bricht.

## Voraussetzungen
- messung Goal 10 DONE

## Kontext für den Maker
- Ziel: Wer einen der beiden Pfade der Merkdatei oder die Schwärzung in `ops/deploy-window.sh` ändert, macht `check` rot, bevor
  ein nachgeholter Alarm in einer Datei landet, die niemand liest, oder eine Adresse im öffentlichen Job-Log steht.
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 11; übernimmt `goals/_vorschlaege/messung-nacharbeit-2026-11-15-5.md` (gleicher
  Pfad der Merkdatei) und `goals/_vorschlaege/messung-nacharbeit-2026-11-15-1.md` (Schwärzung getestet).
- **Skripte unter Test.** Beide neuen Fälle lesen die Skripte aus dem Verzeichnis `OPS_UNDER_TEST` (Pfad, sonst `ops/` des Repos),
  wie `test/own-ips-checked.test.ts` aus messung 10, damit die Prüfbefehle unten eine geänderte Kopie unterschieben können, ohne
  `ops/` anzufassen. Unter `ops/` ändert sich nichts.
- **Fall in `test/deploy-alarm-pending.test.ts`**, Name genau
  `it("deploy-alarm and watchdog default to the same state path")`, in einem neuen `describe` am Ende der Datei. Er liest
  `deploy-alarm.sh` und `watchdog.sh` als Text aus `OPS_UNDER_TEST` und zieht je den Standardwert heraus: aus `deploy-alarm.sh` den
  Teil nach `${state:-` bis vor `}` in der Zuweisung an `pending=`, aus `watchdog.sh` den Teil nach `${CP_WATCHDOG_STATE:-` bis vor
  `}` in der Zuweisung an `STATE_FILE=`. Jede der beiden Zuweisungen muss genau einmal außerhalb eines Kommentars stehen und einen
  nicht leeren Wert liefern, sonst ist der Fall rot (ein Umbau, der die Zuweisung umbenennt, fällt also auf und wird nicht still
  grün); dann `expect(<Wert aus deploy-alarm.sh>).toBe(<Wert aus watchdog.sh>)`. Kein Lauf der Skripte, kein Schreiben unter
  `/var/lib`.
- **Fall in `test/deploy-window-rollout.test.ts`**, Name genau
  `it("blanks the url and the address the alarm prints and ends with exit 3 when ssh fails")`, im bestehenden `describe`.
  `rollout()` bekommt eine Option (etwa `alarm?: { out: string; exit: number }`), mit der der nachgebaute `ssh` auf `bash -s`
  nach dem Wegschreiben von Argumenten und stdin `out` ausgibt und mit `exit` endet; ohne die Option bleibt er, wie er ist. Dazu
  kopiert `rollout()` die vier Skripte aus `COPIES` aus `OPS_UNDER_TEST` (dort unter ihrem Dateinamen), wenn es gesetzt ist, sonst
  wie heute aus dem Repo. Der Fall nimmt `ALARM_LOG`, `out` ist eine Zeile mit `https://ntfy.example.com/planted-topic` und
  `203.0.113.9` (etwa `POST https://ntfy.example.com/planted-topic from 203.0.113.9 failed`), `exit` 255. Erwartet: Exit 3, eine
  Zeile mit `<url>`, eine Zeile mit `<address>`, keine Zeile mit `ntfy.example.com`, `planted-topic` oder `203.0.113.9`, die Zeile
  `ALARM NOT SENT: exit 255`.
- Die bestehenden Fälle beider Dateien bleiben Zeichen für Zeichen; in `test/deploy-alarm-pending.test.ts` kommen nur Zeilen dazu,
  in `test/deploy-window-rollout.test.ts` ändern sich außer neuen Zeilen nur Zeilen in `rollout()`.
- Annahme (Tech Lead, 16.11.2026): Das Muster der Schwärzung erfasst weder IPv6 noch einen Host ohne Schema
  (`messung-nacharbeit-2026-11-15-1.md`, Hinweis). Das bleibt hier offen, weil das Goal nur Tests ändert und die ROADMAP genau eine
  IPv4-Adresse und eine URL mit Schema nennt; eine Erweiterung der Schwärzung ist ein Vorschlag für die Kritik.
- Annahme (Tech Lead, 16.11.2026): Der Fall liest die Standardwerte als Text, statt `ops/deploy-alarm.sh` und `ops/watchdog.sh`
  ohne `CP_WATCHDOG_STATE` laufen zu lassen, weil beide dann unter `/var/lib` schreiben oder lesen würden; ein gemeinsames `source`
  scheidet aus, weil `ops/deploy-alarm.sh` per `bash -s` über stdin auf der VM läuft.
- Kein Rollout. Kein Test und kein Prüfbefehl ruft die VM, ssh, ntfy oder das echte Zustandsverzeichnis auf; Adressen und URLs nur
  aus den Dokumentationsbereichen (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `example.com`).
- Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich. Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein `pkill -f`. Eine Entscheidung, die
  dieser Text offen lässt, schreibt der Maker als Zeile `- messung 11 (Engineer CP, <Datum>): …` in `goals/messung/ANNAHMEN.md`.

## Done Condition
- [ ] `test/deploy-alarm-pending.test.ts` hält die Standardwerte des Zustandspfads in `ops/deploy-alarm.sh` und `ops/watchdog.sh`
      gleich; der Fall ist grün am Kopf und rot mit einem geänderten Pfad in einem der beiden Skripte.
      Prüfung: `grep -c 'it("deploy-alarm and watchdog default to the same state path"' test/deploy-alarm-pending.test.ts` muss 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH timeout 300 pnpm -s vitest run test/deploy-alarm-pending.test.ts -t "deploy-alarm and watchdog default to the same state path"` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); cp ops/deploy-alarm.sh ops/watchdog.sh $T/; sed -i 's#cp-watchdog\.state}#cp-watchdog.moved}#' $T/watchdog.sh; PATH=/usr/bin:$PATH OPS_UNDER_TEST=$T timeout 300 pnpm -s vitest run test/deploy-alarm-pending.test.ts -t "deploy-alarm and watchdog default to the same state path" > $T/out 2>&1; echo "exit $? failed $(grep -cE 'Tests +1 failed' $T/out) moved $(grep -c 'cp-watchdog.moved}' $T/watchdog.sh)"` muss genau `exit 1 failed 1 moved 1` ausgeben.
      Prüfung: `T=$(mktemp -d); cp ops/deploy-alarm.sh ops/watchdog.sh $T/; sed -i 's#cp-watchdog\.state}#cp-watchdog.moved}#' $T/deploy-alarm.sh; PATH=/usr/bin:$PATH OPS_UNDER_TEST=$T timeout 300 pnpm -s vitest run test/deploy-alarm-pending.test.ts -t "deploy-alarm and watchdog default to the same state path" > $T/out 2>&1; echo "exit $? failed $(grep -cE 'Tests +1 failed' $T/out) moved $(grep -c 'cp-watchdog.moved}' $T/deploy-alarm.sh)"` muss genau `exit 1 failed 1 moved 1` ausgeben.
- [ ] `test/deploy-window-rollout.test.ts` prüft die Schwärzung der Rückmeldung des Alarms und Exit 3 bei gescheitertem ssh; der
      Fall ist grün am Kopf und rot ohne den `sed` der Schwärzung in `ops/deploy-window.sh`.
      Prüfung: `grep -c 'it("blanks the url and the address the alarm prints and ends with exit 3 when ssh fails"' test/deploy-window-rollout.test.ts` muss 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH timeout 300 pnpm -s vitest run test/deploy-window-rollout.test.ts -t "blanks the url and the address the alarm prints and ends with exit 3 when ssh fails"` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); cp ops/deploy-window.sh ops/own-ips.sh ops/access-log.sh ops/deploy-alarm.sh $T/; sed -i '/<<<"\$alarm_out"/s/^ *sed -E .* <<</    cat <<</' $T/deploy-window.sh; PATH=/usr/bin:$PATH OPS_UNDER_TEST=$T timeout 300 pnpm -s vitest run test/deploy-window-rollout.test.ts -t "blanks the url and the address the alarm prints and ends with exit 3 when ssh fails" > $T/out 2>&1; echo "exit $? failed $(grep -cE 'Tests +1 failed' $T/out) cat $(grep -c '^    cat <<<"\$alarm_out"' $T/deploy-window.sh)"` muss genau `exit 1 failed 1 cat 1` ausgeben.
- [ ] Beide Testdateien sind ganz grün, ihre bestehenden Fälle bleiben unverändert, und das Goal ändert außer ihnen nur
      `goals/messung/`.
      Prüfung: `PATH=/usr/bin:$PATH timeout 300 pnpm -s vitest run test/deploy-alarm-pending.test.ts test/deploy-window-rollout.test.ts test/deploy-alarm.test.ts test/watchdog` muss Exit-Code 0 haben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- test/deploy-alarm-pending.test.ts | grep -E '^-' | grep -vc '^--- '` muss 0 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- test/deploy-window-rollout.test.ts | grep -E '^-' | grep -v '^--- ' | grep -cE 'it\(|expect\(|describe\('` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(test/(deploy-alarm-pending|deploy-window-rollout)\.test\.ts|goals/messung/(11-[a-z0-9-]+\.md|ANNAHMEN\.md|verdicts/[^/]+\.md))$'` muss 0 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH timeout 900 node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die erste Zeile im Progress Log nennt, dass beide Fälle am Kopf von `dev` ohne Änderung an den Skripten grün waren.
- [ ] Kein Test und keine Ausgabe nennt eine Adresse oder URL außerhalb der Dokumentationsbereiche.
- [ ] Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- jede Datei unter `ops/`, vor allem `ops/deploy-window.sh`, `ops/deploy-alarm.sh`, `ops/watchdog.sh`, `ops/README.md` und
  `ops/own-ips.txt`
- jeder Test unter `test/` außer `test/deploy-alarm-pending.test.ts` und `test/deploy-window-rollout.test.ts`
- `goals/kanal/**`, die Goal-Dateien von messung 10 und 12
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), `/var/lib`, die VM, ssh, ntfy und jede Datei auf dem Server;
  Produktion weder lesend noch schreibend, kein Rollout
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log

## Blockers
- keine
