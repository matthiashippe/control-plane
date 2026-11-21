# Messung Goal 14: Die Sperre der eigenen Liste und ihre Fehlerzeilen hält je ein Test fest

## Status
PLANNED

## Active Objective
messung 10 hat die Sperre „eine fehlende oder leere eigene Liste hält die Zählung an“ in `own_ips_checked` (`ops/own-ips.sh`)
gebündelt, aber am Kopf von `dev` (b81b347) stehen drei Lücken daneben. Erstens baut `ops/keyless-mints.sh` (Zeile 187 bis 196) die
Sperre als einziges Werkzeug noch selbst, mit `grep -v '^#' "$CP_OWN_IPS_FILE" | awk 'NF { found = 1 } …'` und danach
`own=$(own_ips 2>/dev/null)`, und steht deshalb in `READER_EXCEPTIONS` von `test/own-ips-readers.test.ts` (Zeile 34). Ändert sich
die Leseregel in `_own_ips_listed`, läuft diese Kopie auseinander, und der Wächter meldet es wegen der Ausnahme nicht. Zweitens
verlangen die Fälle „stops with exit 2 …“ in `test/timeout-quote-own-ips.test.ts` und `test/anzeigen-rechnung-own-ips.test.ts` bei
fehlender oder leerer Liste nur `own_ips` irgendwo in `stderr`; dass genau eine Zeile mit dem Präfix des Werkzeugs und
`own_ips_checked: ` kommt, hält kein Test fest, und dass `fetch_rows` in `ops/timeout-quote.sh` (Zeile 336 bis 339) bei nicht
lesbarem Ledger selbst mit 2 endet, prüft kein Fall. Drittens verlangt der Fall „every severity that ops/watchdog.sh reports counts
as its delivery“ in `test/status-alarm-received.test.ts` (Zeile 251) nur, dass jede Severity des Watchdogs zählt, nicht, dass
`WATCHDOG_SEVERITIES` in `ops/status.sh` (Zeile 157) keine weitere nennt. Fällt `WARNING` aus `ops/watchdog.sh` weg, zählt
`received` den alten Titel weiter, und ein anderer Sender mit diesem Titel setzt es still auf `ok`.
Nach diesem Goal ruft `ops/keyless-mints.sh` nur noch `own_ips_checked`, seine Ausnahme im Wächter fällt weg, die Fehlerzeilen der
anderen beiden Werkzeuge und der Abbruch am Ledger sind je durch einen Fall festgehalten, und der Fall zu den Severities verlangt
Gleichheit beider Mengen.
Widerlegt, wenn `ops/keyless-mints.sh` mit einer Liste `# no own address` am Kopf von `dev` schon eine Zeile
`keyless-mints: own_ips_checked: … names no address, so nothing is counted.` schreibt, oder wenn der Fall „every severity …“ mit
`STATUS_UNDER_TEST` auf einer Kopie von `ops/status.sh` mit sechster Severity `NOTICE` schon rot ist (der Maker prüft beides zuerst
mit dem ersten Prüfbefehl von Punkt 1 und dem zweiten von Punkt 4 an der Merge-Basis, heute `rc=2 0 1 0` und `rc=0`, und schreibt das
Ergebnis in die erste Zeile des Progress Log).
MVP: Funktion, weil die Zählung keyloser Mints, die fremde Automatons beim ersten Kontakt misst, sonst als einzige die eigene Liste
anders liest als alle anderen Werkzeuge, und weil `received` nach einer Änderung am Watchdog sonst fremde Meldungen als Zustellung
des Alarms zählen kann.

## Voraussetzungen
- messung Goal 10 DONE

## Kontext für den Maker
- Ziel: Wer im Loop oder im Kurs-Check eine Zahl zu fremden Automatons liest, bekommt sie aus Werkzeugen, die die eigene Liste
  alle nach derselben Regel lesen und bei einer fehlenden Liste gleich laut anhalten; eine spätere Änderung an `own_ips_checked`,
  an den Fehlerzeilen oder an den Severities des Watchdogs fällt in einem Test auf statt in einer falschen Zahl.
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 14. Übernimmt `goals/_vorschlaege/messung-kritik-2026-11-16-4.md` (Severities),
  `goals/_vorschlaege/messung-kritik-2026-11-16-5.md` (`ops/keyless-mints.sh`) und `goals/_vorschlaege/messung-kritik-2026-11-16-6.md`
  (Fehlerzeilen und Ledger).
- Baut auf messung 10 auf (`own_ips_checked`, die Zeilen `TIMEOUT QUOTE FAIL: <Zeile>, so nothing is counted.` und
  `anzeigen-rechnung: {exc}, so nothing is counted.`), das wieder auf messung 09 (`WATCHDOG_SEVERITIES`). messung 11, 12 und 13
  stehen auf `PAUSED`, und keiner der drei Teile braucht sie: messung 12 würde `_own_ips_listed` ändern, und genau dann wirkt die
  neue Regel nach diesem Goal auch in `ops/keyless-mints.sh`. Deshalb nennt `## Voraussetzungen` nur messung 10.
- **`ops/keyless-mints.sh`.** Zeile 187 bis 196 (die eigene Prüfung mit `grep -v '^#' … | awk …` und der Aufruf von `own_ips`)
  werden ein Aufruf von `own_ips_checked "$CP_OWN_IPS_FILE"` nach `source ops/own-ips.sh`. Hält sie an (Rückgabe ungleich 0), endet
  das Werkzeug mit 2, leerem `stdout` und genau einer Zeile auf `stderr`: `keyless-mints: <Zeile von own_ips_checked>, so nothing is
  counted.`, nach dem Muster von `own_list` in `ops/timeout-quote.sh`. Ein Weg, der ohne Datei auskommt: `own_ips_checked` schreibt
  bei Erfolg nichts auf `stderr` und beim Anhalten nichts auf `stdout`, also liefert `own=$(own_ips_checked "$CP_OWN_IPS_FILE" 2>&1)`
  im ersten Fall die Adressen, im zweiten die Zeile. Sonst bleibt alles, wie es ist: `KM_OWN="$own"`, die Tabelle, `own addresses
  left out: <n>`, die übrigen Exit-Codes, `--selftest` (sein Fall „exit 2 when the own list names no address“ verlangt `own_ips` in
  `stderr`, das bleibt wahr) und der Kopfkommentar außer dem Kommentar über der Sperre, der danach auf `own_ips_checked` verweist.
  Keine Zeile außerhalb eines Kommentars gibt `CP_OWN_IPS_FILE` an `grep`, `awk`, `cat` oder eine Umleitung.
- **`test/own-ips-readers.test.ts`.** Der Eintrag `{ path: "ops/keyless-mints.sh", … }` in `READER_EXCEPTIONS` fällt weg; der Eintrag
  zu `ops/actions-log-addresses.sh` bleibt, damit „every named exception is a file under ops/ with a reason“ weiter etwas prüft.
  Sonst ändert sich in der Datei nichts.
- **`test/keyless-mints.test.ts`**, ein neuer Fall
  `it("stops with exit 2 and counts nothing when own_ips ends with exit 1")`: Kopie von `ops/keyless-mints.sh` und `ops/own-ips.sh`
  in `<mkdtemp>/ops/` (das Werkzeug wechselt in `dirname "$0"/..` und sourct `ops/own-ips.sh` von dort), an die Kopie von
  `ops/own-ips.sh` angehängt `own_ips() { echo 198.51.100.7; return 1; }`, gefüllte Liste mit einer Adresse aus `203.0.113.0/24`,
  ein Log mit einer Zeile auf `POST /v1/auth/keyless` von einer fremden Adresse, Lauf mit `--file`. Erwartung: Exit 2, keine Zeile
  von `stdout` beginnt mit `|`, `stderr` ist genau eine nicht leere Zeile, die mit `keyless-mints: own_ips_checked: ` beginnt, und
  keine Ausgabe nennt eine gepflanzte Adresse. Der Fall ist auch am Kopf von `dev` grün (heute fängt `! own=$(own_ips …)` den Exit
  1); er hält fest, dass der Umbau diesen Weg nicht verliert. Die bestehenden zwölf Fälle bleiben Zeichen für Zeichen.
- **`test/timeout-quote-own-ips.test.ts`.**
  - Die Fälle „stops with exit 2 when the own list names no address even with a live address and a seen address“ und „stops with
    exit 2 when the own list is missing“ verlangen statt `toContain("own_ips")`, dass `stderr` genau eine nicht leere Zeile ist und
    sie mit `TIMEOUT QUOTE FAIL: own_ips_checked: ` beginnt. Namen und übrige Erwartungen bleiben.
  - Ein neuer Fall
    `it("stops with exit 2, an empty stdout and exactly the line TIMEOUT QUOTE FAIL: ledger not readable when ssh fails at the ledger")`:
    `--since-rollout` (der Weg, der nur `fetch_rows` ruft) mit `CP_HOST=cp.invalid` und `CP_SSH_KEY=<root>/key`, das nachgebaute
    `ssh` des Sandkastens endet bei jeder Frage außer `SSH_CLIENT` mit 255. Erwartung: Exit 2, `stdout` leer, `stderr` nach `trim()`
    genau `TIMEOUT QUOTE FAIL: ledger not readable`, und `<root>/ssh-calls` nennt `deploy-cp-1` (der Fall erreicht die Abfrage des
    Ledgers wirklich). Heute schon grün; die Gegenprobe in Punkt 3 zeigt, dass er eine geänderte Zeile fängt.
  `ops/timeout-quote.sh` selbst ändert sich nicht.
- **`test/anzeigen-rechnung-own-ips.test.ts`.** Die Fälle „stops with exit 2 when the own list names no address even with a live
  address and a seen address“ und „stops with exit 2 when the own list is missing“ verlangen statt `toContain("own_ips")`, dass
  `stderr` genau eine nicht leere Zeile ist und sie mit `anzeigen-rechnung: own_ips_checked: ` beginnt. `ops/anzeigen-rechnung.py`
  ändert sich nicht.
- **`test/status-alarm-received.test.ts`.** Der Fall „every severity that ops/watchdog.sh reports counts as its delivery“ behält
  Namen und bisherige Erwartungen und liest zusätzlich die Zeile `WATCHDOG_SEVERITIES = (…)` aus der Kopie von `ops/status.sh`, die
  der Test prüft (`STATUS_UNDER_TEST`, sonst `ops/status.sh`); er verlangt, dass die Menge der dort genannten Severities gleich der
  Menge aus `watchdogSeverities()` ist, und meldet sonst beide Mengen. `ops/status.sh` und `ops/watchdog.sh` ändern sich nicht. Der
  Kommentar am Kopf der Datei sagt in einem Satz, dass dieser Fall die Gleichheit verlangt.
- Gegenproben ändern Dateien unter `ops/` nur für die Dauer eines Prüfbefehls und stellen sie mit `cp` wieder her; jeder dieser
  Befehle endet mit `git status --porcelain -- ops | wc -l`, das 0 ausgeben muss.
- Kein Rollout. `ops/` liegt im Release-Pfad, die eine Änderung an `ops/keyless-mints.sh` kommt mit dem nächsten fälligen Rollout auf
  den Server; die Cron-Läufe dort ändert dieses Goal nicht. Nichts gegen die Produktion: Kein Test und kein Prüfbefehl ruft die VM,
  das echte ssh, `docker` auf dem Server, `ops/status.sh` gegen den Server oder einen Webhook auf, liest die echte Merkdatei unter
  `~/.local/state/control-plane/` oder schreibt `ops/own-ips.txt`.
- Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich. Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein `pkill -f`. Eine Entscheidung, die
  dieser Text offen lässt, schreibt der Maker als Zeile `- messung 14 (Engineer CP, <Datum>): …` in `goals/messung/ANNAHMEN.md`.

## Done Condition
- [ ] `ops/keyless-mints.sh` hält über `own_ips_checked` an, mit genau einer Zeile `keyless-mints: own_ips_checked: …`, und baut
      keine eigene Sperre mehr.
      Prüfung: `T=$(mktemp -d); mkdir $T/bin; printf '#!/bin/sh\nexit 255\n' > $T/bin/ssh; chmod +x $T/bin/ssh; printf '# no own address\n' > $T/own.txt; : > $T/c.jsonl; env PATH=$T/bin:/usr/bin:/bin HOME=$T CP_OWN_IPS_FILE=$T/own.txt CP_OWN_IPS_SEEN=$T/seen.txt bash ops/keyless-mints.sh --file $T/c.jsonl >$T/out 2>$T/err; echo "rc=$? $(wc -l <$T/out) $(wc -l <$T/err) $(grep -c '^keyless-mints: own_ips_checked: .*names no address, so nothing is counted\.$' $T/err)"` muss genau `rc=2 0 1 1` ausgeben (heute `rc=2 0 1 0`).
      Prüfung: `T=$(mktemp -d); mkdir $T/bin; printf '#!/bin/sh\nexit 255\n' > $T/bin/ssh; chmod +x $T/bin/ssh; : > $T/c.jsonl; env PATH=$T/bin:/usr/bin:/bin HOME=$T CP_OWN_IPS_FILE=$T/missing.txt CP_OWN_IPS_SEEN=$T/seen.txt bash ops/keyless-mints.sh --file $T/c.jsonl >$T/out 2>$T/err; echo "rc=$? $(wc -l <$T/out) $(wc -l <$T/err) $(grep -c '^keyless-mints: own_ips_checked: .*is missing, so nothing is counted\.$' $T/err) $(test -e $T/missing.txt && echo created || echo absent)"` muss genau `rc=2 0 1 1 absent` ausgeben (heute `rc=2 0 1 0 absent`).
      Prüfung: `grep -cE '^[^#]*own_ips_checked "\$CP_OWN_IPS_FILE"' ops/keyless-mints.sh` muss mindestens 1 ausgeben (heute 0).
      Prüfung: `grep -cF "grep -v '^#' \"\$CP_OWN_IPS_FILE\"" ops/keyless-mints.sh` muss 0 ausgeben (heute 1).
      Prüfung: `grep -cE '^[^#]*\$\(own_ips[ )]' ops/keyless-mints.sh` muss 0 ausgeben (heute 1).
      Prüfung: `bash ops/keyless-mints.sh --selftest 2>&1 | tail -1` muss genau `KEYLESS MINTS SELFTEST OK` ausgeben.
- [ ] Die Ausnahme für `ops/keyless-mints.sh` im Wächter fällt weg, der Wächter fängt die alte Sperre, und ein Fall hält fest, dass
      ein `own_ips` mit Exit 1 nichts zählt.
      Prüfung: `grep -cF 'path: "ops/keyless-mints.sh"' test/own-ips-readers.test.ts` muss 0 ausgeben (heute 1).
      Prüfung: `pnpm -s vitest run test/own-ips-readers` muss Exit-Code 0 haben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); cp ops/keyless-mints.sh "$T/a"; git show "$B:ops/keyless-mints.sh" > ops/keyless-mints.sh; pnpm -s vitest run test/own-ips-readers --reporter=json --outputFile="$T/r.json" >/dev/null 2>&1; echo "rc=$? failed=$(node -e 'console.log(require(process.argv[1]).numFailedTests)' "$T/r.json")"; cp "$T/a" ops/keyless-mints.sh; git status --porcelain -- ops | wc -l` muss `rc=1 failed=1` und danach 0 ausgeben.
      Prüfung: `grep -cF 'it("stops with exit 2 and counts nothing when own_ips ends with exit 1"' test/keyless-mints.test.ts` muss genau 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/keyless-mints` muss Exit-Code 0 haben.
- [ ] Die Fehlerzeilen von `ops/timeout-quote.sh` und `ops/anzeigen-rechnung.py` bei fehlender oder leerer Liste und der Abbruch am
      Ledger sind je durch einen Fall festgehalten.
      Prüfung: `T=$(mktemp -d); cp ops/timeout-quote.sh "$T/a"; sed -i 's/"TIMEOUT QUOTE FAIL: \$err, so/"$err, so/' ops/timeout-quote.sh; pnpm -s vitest run test/timeout-quote-own-ips -t "stops with exit 2 when the own list" --reporter=json --outputFile="$T/r.json" >/dev/null 2>&1; echo "rc=$? failed=$(node -e 'console.log(require(process.argv[1]).numFailedTests)' "$T/r.json")"; cp "$T/a" ops/timeout-quote.sh; git status --porcelain -- ops | wc -l` muss `rc=1 failed=2` und danach 0 ausgeben (heute `rc=0 failed=0`).
      Prüfung: `T=$(mktemp -d); cp ops/anzeigen-rechnung.py "$T/a"; sed -i 's/f"anzeigen-rechnung: {exc}, so/f"{exc}, so/' ops/anzeigen-rechnung.py; pnpm -s vitest run test/anzeigen-rechnung-own-ips -t "stops with exit 2 when the own list" --reporter=json --outputFile="$T/r.json" >/dev/null 2>&1; echo "rc=$? failed=$(node -e 'console.log(require(process.argv[1]).numFailedTests)' "$T/r.json")"; cp "$T/a" ops/anzeigen-rechnung.py; git status --porcelain -- ops | wc -l` muss `rc=1 failed=2` und danach 0 ausgeben (heute `rc=0 failed=0`).
      Prüfung: `grep -cF 'it("stops with exit 2, an empty stdout and exactly the line TIMEOUT QUOTE FAIL: ledger not readable when ssh fails at the ledger"' test/timeout-quote-own-ips.test.ts` muss genau 1 ausgeben.
      Prüfung: `T=$(mktemp -d); cp ops/timeout-quote.sh "$T/a"; sed -i 's/ledger not readable"/ledger unreadable"/' ops/timeout-quote.sh; pnpm -s vitest run test/timeout-quote-own-ips -t "ledger not readable" --reporter=json --outputFile="$T/r.json" >/dev/null 2>&1; echo "rc=$? failed=$(node -e 'console.log(require(process.argv[1]).numFailedTests)' "$T/r.json")"; cp "$T/a" ops/timeout-quote.sh; git status --porcelain -- ops | wc -l` muss `rc=1 failed=1` und danach 0 ausgeben (heute `rc=0 failed=0`).
      Prüfung: `T=$(mktemp -d); mkdir $T/bin; printf '#!/bin/sh\nexit 255\n' > $T/bin/ssh; chmod +x $T/bin/ssh; env PATH=$T/bin:/usr/bin:/bin HOME=$T CP_HOST=cp.invalid CP_SSH_KEY=$T/key bash ops/timeout-quote.sh --since-rollout >$T/out 2>$T/err; echo "rc=$? $(wc -c <$T/out) $(cat $T/err)"` muss genau `rc=2 0 TIMEOUT QUOTE FAIL: ledger not readable` ausgeben.
      Prüfung: `pnpm -s vitest run test/timeout-quote-own-ips test/anzeigen-rechnung-own-ips` muss Exit-Code 0 haben.
- [ ] Der Fall „every severity …“ verlangt Gleichheit von `WATCHDOG_SEVERITIES` in `ops/status.sh` und den Severities von `report`
      in `ops/watchdog.sh`.
      Prüfung: `grep -c WATCHDOG_SEVERITIES test/status-alarm-received.test.ts` muss mindestens 1 ausgeben (heute 0).
      Prüfung: `T=$(mktemp -d); sed 's/("ALIVE", "OK", "OUTAGE", "WARN", "WARNING")/("ALIVE", "OK", "OUTAGE", "WARN", "WARNING", "NOTICE")/' ops/status.sh > "$T/status.sh"; STATUS_UNDER_TEST="$T/status.sh" pnpm -s vitest run test/status-alarm-received -t "every severity" >/dev/null 2>&1; echo "rc=$? $(grep -c NOTICE "$T/status.sh")"` muss genau `rc=1 1` ausgeben (heute `rc=0 1`).
      Prüfung: `grep -cF 'it("every severity that ops/watchdog.sh reports counts as its delivery"' test/status-alarm-received.test.ts` muss genau 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/status-alarm-received` muss Exit-Code 0 haben.
- [ ] `check` ist grün, nur die genannten Dateien ändern sich, kein bestehender Fall fällt weg, und kein Lauf schreibt Zustand.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(ops/keyless-mints\.sh|test/(keyless-mints|own-ips-readers|timeout-quote-own-ips|anzeigen-rechnung-own-ips|status-alarm-received)\.test\.ts|goals/messung/.+)$'` muss 0 ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); for f in test/keyless-mints.test.ts test/own-ips-readers.test.ts test/timeout-quote-own-ips.test.ts test/anzeigen-rechnung-own-ips.test.ts test/status-alarm-received.test.ts; do echo "$f $(git show $B:$f | grep -cE '^\s*it\(') $(grep -cE '^\s*it\(' $f)"; done | paste -sd' '` muss genau `test/keyless-mints.test.ts 12 13 test/own-ips-readers.test.ts 6 6 test/timeout-quote-own-ips.test.ts 7 8 test/anzeigen-rechnung-own-ips.test.ts 4 4 test/status-alarm-received.test.ts 14 14` ausgeben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Prüfbefehle, die oben „heute“ nennen, lieferten an der Merge-Basis genau diesen Stand; die erste Zeile im Progress Log
      nennt sie.
- [ ] Jedes Werkzeug, das die eigene Liste braucht, hält über `own_ips_checked` an, und keine Datei unter `ops/` außer
      `ops/own-ips.sh` und `ops/actions-log-addresses.sh` liest `CP_OWN_IPS_FILE` selbst.
- [ ] Eine geänderte Fehlerzeile, ein geänderter Abbruch am Ledger und eine Severity, die nur `ops/status.sh` nennt, machen je einen
      Test rot; keine Ausgabe nennt Host, Adresse oder Schlüssel.
- [ ] Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/fixtures/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- `ops/conway-series.sh` und `ops/conway-money-series.sh` (Cron-Läufe auf dem Server)
- jede Datei unter `ops/` außer `ops/keyless-mints.sh`, vor allem `ops/own-ips.sh`, `ops/own-ips.txt`, `ops/timeout-quote.sh`,
  `ops/anzeigen-rechnung.py`, `ops/status.sh`, `ops/watchdog.sh` und `ops/access-log.sh` (Gegenproben ändern sie nur für die Dauer
  ihres Prüfbefehls)
- jeder Test unter `test/` außer `test/keyless-mints.test.ts`, `test/own-ips-readers.test.ts`, `test/timeout-quote-own-ips.test.ts`,
  `test/anzeigen-rechnung-own-ips.test.ts` und `test/status-alarm-received.test.ts`; in diesen fällt kein bestehender Fall weg
- `goals/kanal/**` und jede Goal-Datei außer dieser
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), die VM, ssh, `docker` auf dem Server und jede Datei dort;
  Produktion weder lesend noch schreibend, kein Rollout, kein Lauf von `ops/check-all.sh` oder `ops/status.sh` gegen den Server, kein
  POST an einen echten Webhook
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log

## Blockers
- keine
