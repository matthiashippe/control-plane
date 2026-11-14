# Messung Goal 05: Der Deploy-Alarm klingelt wie jeder andere Alarm

## Status
ACTIVE

## Active Objective
Seit messung 02 meldet `ops/deploy-window.sh` jeden 502 an eine fremde Anfrage nach einem Rollout über `ops/deploy-alarm.sh` an
den Webhook aus der Crontab. Der POST (Zeile 46, `curl -fsS -m 10 -d "$text" "$url"`) trägt aber weder `Title:` noch `Priority:`,
also kommt er bei ntfy mit Priorität `default` und ohne Titel an, während jeder Alarm von `ops/watchdog.sh` (Zeile 28 bis 37) und
der Ausfall von `ops/backup.sh` (Zeile 27) mit `Priority: high` klingeln. Ein 502 an einen zahlenden Kunden ist damit heute die
leiseste Meldung auf dem Thema. Nach diesem Goal sendet `ops/deploy-alarm.sh` die Kopfzeilen `Title: <fester Titel>` und
`Priority: high`, und `test/deploy-alarm.test.ts` prüft beide in den Argumenten des nachgebauten `curl`, rot vor dem Fix.
Widerlegt, wenn `ops/deploy-alarm.sh` am Kopf von `dev` beide Kopfzeilen schon sendet (der Maker prüft das zuerst mit
`grep -cE "Priority|Title" ops/deploy-alarm.sh`, heute `0`, und schreibt das Ergebnis in die erste Zeile des Progress Log).
MVP: Funktion, weil ein Alarm, der nicht klingelt, den zahlenden Kunden nach einem missglückten Rollout genauso wenig schützt
wie gar keiner.

## Voraussetzungen
- messung Goal 04 DONE

## Kontext für den Maker
- Ziel: Wer den Alarmweg abonniert hat, hört einen 502 nach einem Rollout so laut wie einen Ausfall des Dienstes und erkennt ihn am
  Titel, bevor er die Nachricht öffnet.
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 05; übernimmt `goals/_vorschlaege/messung-kritik-2026-11-14-3.md`.
- **`ops/deploy-alarm.sh`.** Der eine `curl`-Aufruf bekommt zusätzlich `-H "Title: <Titel>"` und `-H "Priority: high"`, sonst
  bleibt er, wie er ist: Text in `-d`, `-m 10`, stdout und stderr von `curl` verworfen, Exit-Codes 0, 1 und 2 wie heute. Der Titel
  ist ein fester englischer Text ohne Variable, ohne Adresse und ohne URL. Der Kopfkommentar nennt die beiden Kopfzeilen und dass
  sie denen von `ops/watchdog.sh` folgen.
- **Titel, Entscheidung des Maker.** Beginnt der Titel mit `control-plane ` (Vorschlag `control-plane DEPLOY 502`), zählt
  `ops/status.sh` (Zeile 157, `title.startswith("control-plane ")`) den Deploy-Alarm als Meldung auf dem Thema, und `received`
  im Alarmweg kann nach einem Deploy-Alarm `ok` melden, obwohl der Watchdog selbst nichts zugestellt hat. Heißt er anders
  (Vorschlag `deploy-window 502`), zählt `ops/status.sh` ihn nicht. Der Maker wählt und schreibt eine Zeile
  in `goals/messung/ANNAHMEN.md`, die mit `- messung 05 (Engineer CP, <Datum>):` beginnt, den Titel wörtlich nennt und sagt, ob
  `ops/status.sh` ihn zählt und warum das so gewollt ist. Hinweis für die Wahl: `ops/backup.sh` titelt schon heute `control-plane backup failed` und wird damit gezählt, obwohl der
  Kommentar in `ops/status.sh` Zeile 138 und 139 das Gegenteil sagt. `ops/status.sh` und `ops/backup.sh` bleiben in diesem Goal
  unverändert; wer den Widerspruch angehen will, schreibt einen Vorschlag.
- **Test `test/deploy-alarm.test.ts`**, ohne Netz, mit dem vorhandenen Helfer `alarm` und dem nachgebauten `curl`, der jedes
  Argument als eigene Zeile notiert. Die fünf vorhandenen Fälle bleiben Zeichen für Zeichen, wie sie sind; dazu kommen:
  - `it("sends a title and priority high like the watchdog")`: Crontab mit `CRON_LINE`; Exit 0, genau ein Aufruf, in dessen
    Argumenten folgt auf ein `-H` das Argument `Priority: high`, und auf ein `-H` ein Argument, das mit `Title: ` beginnt und nach
    `Title: ` nicht leer ist;
  - `it("the title names no address and no URL")`: der Titel aus dem Fall davor passt nicht auf `/(\d{1,3}\.){3}\d{1,3}/` und
    enthält weder `planted-topic` noch `alarm.invalid` noch `://`;
  - `it("sends the headers also when the POST fails")`: `curlExit` 22; Exit 1, genau ein Aufruf mit `Priority: high` hinter einem
    `-H`.
  Rot vor dem Fix sind alle drei Fälle (heute hat der Aufruf kein `-H`); die Zeile im Progress Log nennt das mit Zahl.
- `test/deploy-window-rollout.test.ts` vergleicht die Eingabe von `ssh` byte-genau mit `ops/deploy-alarm.sh` aus dem Repo und
  bleibt damit unverändert grün.
- Kein Rollout. Die Änderung erreicht die VM beim nächsten regulären Deploy über `ops/deploy-window.sh`, das die Datei per
  `bash -s` schickt. Kein Test, kein Selftest und kein Prüfbefehl ruft die VM, `crontab -l` oder einen echten Webhook auf.
- Code, Kommentare und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich. Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout; neue Dateien vor `check` mit `git add` stagen.
  Kein `pkill -f`.

## Done Condition
- [x] `ops/deploy-alarm.sh` sendet die Kopfzeilen `Title:` mit einem festen Titel und `Priority: high`, sonst unverändert.
      Prüfung: `grep -cE "^[^#]*-H [\"']?Priority: high" ops/deploy-alarm.sh` muss 1 ausgeben.
      Prüfung: `grep -cE "^[^#]*-H [\"']?Title: [A-Za-z]" ops/deploy-alarm.sh` muss 1 ausgeben.
      Prüfung: `grep -E '^[^#]*-H' ops/deploy-alarm.sh | grep -oE "Title: [^\"']+" | grep -cE '\$|://|([0-9]{1,3}\.){3}[0-9]{1,3}'` muss 0 ausgeben.
      Prüfung: `grep -cE "^[^#]*curl -fsS -m 10( |$)" ops/deploy-alarm.sh` muss 1 ausgeben.
- [x] `test/deploy-alarm.test.ts` prüft beide Kopfzeilen in den Argumenten des nachgebauten `curl`, auch bei rotem POST, und die
      fünf bisherigen Fälle bleiben unverändert.
      Prüfung: `pnpm -s vitest run test/deploy-alarm.test.ts test/deploy-window-rollout.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "sends a title and priority high like the watchdog|the title names no address and no URL|sends the headers also when the POST fails" test/deploy-alarm.test.ts` muss 3 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- test/deploy-alarm.test.ts | grep -cE '^-([^-]|$)'` muss 0 ausgeben.
- [x] Der gewählte Titel steht mit Begründung in `goals/messung/ANNAHMEN.md`.
      Prüfung: `grep -cE '^- messung 05 ' goals/messung/ANNAHMEN.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -E '^[^#]*-H' ops/deploy-alarm.sh | grep -oE "Title: [^\"']+" | head -n 1 | cut -c8- | grep -cFf - goals/messung/ANNAHMEN.md` muss mindestens 1 ausgeben.
- [x] `check` ist grün, gesperrte Pfade bleiben unverändert, und unter `ops/` ändert sich nur `ops/deploy-alarm.sh`.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE '^(\.github|deploy|src|harness|scripts|docs)/|^goals/kanal/|^test/deploy-window-rollout\.test\.ts$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops | grep -vcE '^ops/deploy-alarm\.sh$'` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die drei neuen Fälle waren vor dem Fix rot; die Zeile im Progress Log nennt sie und womit.
- [ ] Keine Ausgabe von `ops/deploy-alarm.sh` und kein Titel nennt eine Adresse oder die URL des Webhooks.
- [ ] Kein bestehender Fall in `test/deploy-alarm.test.ts` oder `test/deploy-window-rollout.test.ts` verliert eine Erwartung oder
      einen Exit-Code.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/fixtures/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- jede andere Datei unter `ops/` außer `ops/deploy-alarm.sh`, vor allem `ops/watchdog.sh`, `ops/status.sh`, `ops/backup.sh` und
  `ops/deploy-window.sh`
- `test/deploy-window-rollout.test.ts`; in `test/deploy-alarm.test.ts` nur neue Zeilen
- `goals/kanal/**`
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), die Crontab und jede Datei auf dem Server; Produktion weder
  lesend noch schreibend, kein Rollout, kein POST an einen echten Webhook
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Widerlegungsprobe am Kopf von `dev` (9d904ba): `grep -cE "Priority|Title" ops/deploy-alarm.sh` -> 0, das Goal gilt.
- 2026-11-14 Zyklus 1: Punkte 1, 2, 3, 4 gebaut, `ops/deploy-alarm.sh` sendet `Title: deploy-window 502` und `Priority: high`, drei neue Fälle in `test/deploy-alarm.test.ts` (vor dem Fix 3 failed, 5 passed mit `pnpm -s vitest run test/deploy-alarm.test.ts`), Titel in `ANNAHMEN.md`. Prüfbefehle: Punkt 1 grep 1, 1, 0, 1; Punkt 2 vitest Exit 0 (13 passed), grep 3, Diff 0; Punkt 3 grep 1, 1; Punkt 4 `node scripts/check.mjs` Exit 0 (1821 passed), Pfade 0, ops 0, Zustand 0.

## Blockers
- keine
