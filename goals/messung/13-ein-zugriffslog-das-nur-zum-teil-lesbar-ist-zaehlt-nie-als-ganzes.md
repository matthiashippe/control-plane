# Messung Goal 13: Ein Zugriffslog, das nur zum Teil lesbar ist, zählt nie als ganzes

## Status
PAUSED

## Active Objective
`ops/access-log.sh` liest am Kopf von `dev` (e506bf8) alle rotierten Dateien und dann `access.log` in einem Aufruf über ssh. In
`INNER` (Zeile 39) darf `gzip -dc "$f" 2>/dev/null` scheitern, ohne dass es jemand merkt, und der Exit der entfernten Pipe
(`docker exec deploy-caddy-1 sh -c '$INNER' | gzip -c`, Zeile 84) ist der von `gzip -c`, also 0. Eine abgeschnittene oder kaputte
`.gz` liefert deshalb ihren lesbaren Anfang, die übrigen Dateien laufen weiter, und das Werkzeug endet mit 0 und einem Log, dem ein
Stück Historie fehlt. Jeder Leser auf `ops/access-log.sh` (Anzeigen-Rechnung, `ops/timeout-quote.sh`, `ops/keyless-mints.sh`,
`ops/landing-yield.sh`, `ops/github-yield.sh`, `ops/deploy-window.sh`) zählt diesen Teil als ganzes Log; messung 08 fängt in
`ops/anzeigen-rechnung.py` nur einen Exit ungleich 0 und sieht den Fall nie. Dazu verwirft `ops/check-all.sh:294` die `stderr` von
`ops/anzeigen-rechnung.py` und filtert `stdout` mit `grep`: Ist das Log unlesbar, steht unter „tragen Anzeigen schon?“ gar nichts,
und ein leerer Abschnitt sieht aus wie „nichts zu melden“.
Nach diesem Goal merkt sich `INNER` einen gescheiterten `gzip -dc` einer rotierten Datei und endet dann mit 4; ein Marker am Ende
des Stroms trägt den Exit von `INNER` durch die entfernte Pipe, `ops/access-log.sh` prüft ihn und schneidet ihn ab. Bei 4 (und bei
jedem anderen Wert ungleich 0 im Marker) endet `ops/access-log.sh` mit 2, leerem `stdout` und genau einer Zeile auf `stderr`.
`ops/check-all.sh` gibt unter „tragen Anzeigen schon?“ bei Exit 2 von `ops/anzeigen-rechnung.py` dessen Zeile
`anzeigen-rechnung: …` aus `stderr` aus, über einen neuen Helfer `ops/ads-case.sh`, den ein Test ohne Netz fährt.
Widerlegt, wenn `ops/access-log.sh` am Kopf von `dev` mit einer abgeschnittenen rotierten `.gz` schon mit 2 endet (der Maker prüft
das zuerst mit dem ersten Prüfbefehl von Punkt 1 an der Merge-Basis, heute `rc=0` mit über 700 Zeilen, und schreibt das Ergebnis in
die erste Zeile des Progress Log).
MVP: Funktion, weil jedes Werkzeug, das fremde Automatons, Anmeldungen, Timeouts oder Ankünfte zählt, über `ops/access-log.sh` liest
und eine kaputte Rotation sonst still weniger fremde Kunden zählt, als da waren.

## Voraussetzungen
- messung Goal 08 DONE

## Kontext für den Maker
- Ziel: Wer eine Zahl aus dem Zugriffslog liest (der Loop im Zyklus über `ops/check-all.sh`, jeder Kurs-Check), bekommt entweder die
  ganze Historie oder ein lautes „nicht lesbar“, nie still eine kürzere Historie, und sieht unter „tragen Anzeigen schon?“ den Grund,
  wenn die Rechnung nichts zählen konnte.
- Herkunft: Zeile messung in ROADMAP.md, Glied 13. Übernimmt goals/_vorschlaege/messung-kritik-2026-11-16-1.md,
  goals/_vorschlaege/messung-kritik-2026-11-16-2.md und goals/_vorschlaege/messung-kritik-2026-11-16-3.md (Kritik zu messung 08).
  Baut auf messung 08 auf (`AccessLogUnreadable` und Exit 2 in `ops/anzeigen-rechnung.py`), nicht auf messung 11 oder 12, die auf
  `PAUSED` stehen; deshalb nennt `## Voraussetzungen` nur messung 08.
- Annahme (Tech Lead, 21.11.2026): Die Anzeigen-Rechnung bleibt, also auch der Teil zu `ops/check-all.sh`. Kein Kurs-Check seit dem
  17.11.2026 hat sie gestrichen (der Kurs-Check vom 17.11. pausierte messung 11 und 12, der Richtungs-Check vom 19.11. nennt sie
  nicht), und `ROADMAP.md` führt `ops/anzeigen-rechnung.py` weiter als Messwerkzeug (Abschnitt „Anzeigen, Stand 29.09.“ und die
  Tabelle der Messfragen). Streicht ein späterer Kurs-Check sie vor dem Start, entfallen Punkt 3 und der Test `test/ads-case.test.ts`.
- **`ops/access-log.sh`.**
  - `INNER` setzt eine Variable auf 0, setzt sie auf 4, wenn ein `gzip -dc` einer rotierten Datei mit einem Exit ungleich 0 endet,
    liest trotzdem die übrigen Dateien und `access.log` wie heute und endet mit dieser Variable. `cd /var/log/caddy … || exit 3` und
    `cat access.log 2>/dev/null` bleiben, wie sie sind; ein fehlendes `access.log` ändert den Exit nicht.
  - Der entfernte Befehl hängt nach dem Strom von `INNER` genau eine Zeile `access-log-end <Exit von INNER>` an, auf eigener Zeile,
    auch wenn `access.log` nicht mit einem Zeilenumbruch endet, und gibt alles wie heute über `| gzip -c` zurück. Er enthält weiter
    `docker exec deploy-caddy-1 sh -c` und endet mit `| gzip -c`, weil die nachgebauten `ssh` in `test/claim-keyless-own-ips.test.ts`,
    `test/own-ips-write.test.ts`, `test/deploy-window-rollout.test.ts` und `test/deploy-alarm-pending.test.ts` auf diese Zeichenfolge
    passen.
  - Nach dem Empfang prüft `ops/access-log.sh` die letzte Zeile: Ist sie `access-log-end 0`, schneidet es sie ab und gibt den Rest
    aus. Ist sie `access-log-end <n>` mit `n` ungleich 0, endet es mit 2, leerem `stdout` und genau einer Zeile auf `stderr`: bei 4
    `access-log: a rotated file could not be unpacked, so the log is not whole. This says nothing about traffic.`, sonst die heutige
    Zeile `access-log: could not read the log. This says nothing about traffic.` Keine Ausgabe nennt Host, Schlüssel oder Dateinamen
    des Servers. `--span` und `--stats` bleiben, wie sie sind; `--span` endet mit dem Fix bei einer kaputten Rotation von selbst mit 2.
  - Annahme (Tech Lead, 21.11.2026): Fehlt die Zeile `access-log-end`, gilt der Strom wie heute (leer heißt Exit 2, sonst Ausgabe),
    weil die vier Tests oben den Strom ohne Marker nachbauen und kein bestehender Test sich ändern soll; ein unterwegs abgerissener
    Strom endet schon heute über `pipefail` mit einem Exit ungleich 0 von `ssh` oder `gunzip`.
  - Annahme (Tech Lead, 21.11.2026): Leser, die den Exit von `ops/access-log.sh` nicht prüfen (`ops/claim-keyless.sh:64`,
    `ops/sperren.sh:65`, `ops/crawlers.sh:61`, `ops/failures.sh:71`, `ops/check-all.sh:367`), bleiben unverändert. Sie bekommen bei
    einer kaputten Rotation nach dem Fix denselben leeren Strom wie heute bei einem unlesbaren Log, keinen neuen stillen Fall;
    braucht einer davon einen eigenen Abbruch, wird das ein Vorschlag.
- **Neuer Helfer `ops/ads-case.sh`** (ausführbar, `#!/usr/bin/env bash`, Kommentarkopf Englisch): liest wie heute
  `./ops/status.sh 2>/dev/null | python3 ./ops/anzeigen-rechnung.py` aus dem Repo-Wurzelverzeichnis (`cd "$(dirname "$0")/.."`).
  Bei Exit 0 oder 1 der Rechnung gibt er genau die Zeilen aus, die heute `grep -E "^  (fremde Zahler|Wert je Kunde|TRAEGT|Der andere
  Weg|Auftrag rund)"` durchlässt; bei Exit 2 die Zeilen aus ihrer `stderr`, die mit `anzeigen-rechnung: ` beginnen, und sonst nichts.
  Er endet immer mit 0, weil der Abschnitt in `ops/check-all.sh` heute mit `|| true` nie den Lauf rot macht.
- **`ops/check-all.sh`.** Zeile 294 wird `./ops/ads-case.sh || true`; die Überschrift `printf -- '\n-- tragen Anzeigen schon? --\n'`,
  der Kommentar darüber und `run "the ad case can say yes as well as no" python3 ./ops/anzeigen-rechnung.py --selftest` bleiben
  Zeichen für Zeichen. Sonst ändert sich in der Datei nichts.
- **Neuer Test `test/access-log-whole.test.ts`**, ohne Netz, fährt `bash ops/access-log.sh` aus dem Repo mit `HOME` in `mkdtemp`
  und einem `PATH`, vorn ein Ordner mit zwei Nachbauten: `ssh` führt sein letztes Argument mit `sh -c` aus, `docker` lässt die
  ersten vier Argumente (`exec deploy-caddy-1 sh -c`) fallen und führt das Skript mit `sh -c` aus, nachdem es `/var/log/caddy` durch
  einen Fixture-Ordner in `mkdtemp` ersetzt hat (so läuft das echte `INNER` und die echte entfernte Pipe). Fixtures: eine heile
  rotierte Datei `access-2026-11-01T00-00-00.000-size.log.gz`, eine abgeschnittene `access-2026-11-02T00-00-00.000-size.log.gz`
  (die ersten 2000 Bytes der gzip-Ausgabe von 4000 JSON-Zeilen) und `access.log`; die Zeilen tragen nur `ts` und Zähler, keine
  Adressen.
  - `it("a rotated file that does not unpack ends ops/access-log.sh with exit 2, an empty stdout and one line on stderr")`: Exit 2,
    `stdout` leer, `stderr` genau eine Zeile, die mit `access-log: ` beginnt und `rotated` nennt.
  - `it("--span ends with 2 when a rotated file does not unpack")`: dieselben Fixtures, `bash ops/access-log.sh --span`, Exit 2
    (heute 3).
  - `it("rotated files and the current file come out oldest first with no end marker when every file unpacks")`: zwei heile
    rotierte Dateien und `access.log`; Exit 0, `stdout` sind genau ihre Zeilen in dieser Reihenfolge, keine Zeile nennt
    `access-log-end`.
  - `it("a current file without a final newline still ends with its own last line and no end marker")`: `access.log` ohne
    abschließenden Zeilenumbruch; Exit 0, die letzte nicht leere Zeile von `stdout` ist die letzte Zeile von `access.log`.
  - `it("a missing log directory ends ops/access-log.sh with exit 2")`: `docker` ersetzt `/var/log/caddy` durch einen Ordner, den es
    nicht gibt; Exit 2, `stdout` leer.
  Rot vor dem Fix sind die ersten beiden Fälle (heute Exit 0 mit dem lesbaren Teil, und Exit 3); die letzten drei sind schon heute
  grün und halten fest, dass der Marker nie nach draußen kommt.
- **Neuer Test `test/ads-case.test.ts`**, ohne Netz, nach dem Muster von `test/anzeigen-rechnung-access-log.test.ts` (Kopie von
  `ops/ads-case.sh`, `ops/anzeigen-rechnung.py` und `ops/own-ips.sh` in `mkdtemp`, ein nachgebautes `ops/status.sh`, das
  `{"db":{"market":{"foreign_payers":1}}}` ausgibt, ein nachgebautes `ops/access-log.sh`, `ssh` vorn im `PATH` mit Exit 255, eigene
  Liste mit einer Adresse aus `203.0.113.0/24`):
  - `it("prints the reason line of ops/anzeigen-rechnung.py when the access log ends with exit 1")`: `access-log.sh` endet mit 1;
    Exit 0, `stdout` ist genau eine Zeile `anzeigen-rechnung: ./ops/access-log.sh ended with exit 1, so nothing is counted.`
  - `it("prints the same lines as the old pipe in ops/check-all.sh when the access log can be read")`: `access-log.sh` gibt zwei
    Zeilen auf `/pay/` aus; `stdout` ist Zeichen für Zeichen die Ausgabe der Pipe aus Zeile 294 der Merge-Basis
    (`./ops/status.sh 2>/dev/null | python3 ./ops/anzeigen-rechnung.py 2>/dev/null | grep -E "^  (fremde Zahler|Wert je Kunde|TRAEGT|Der andere Weg|Auftrag rund)"`)
    im selben Ordner.
  - `it("ops/check-all.sh calls ops/ads-case.sh under the heading and no longer drops the stderr of ops/anzeigen-rechnung.py")`:
    liest `ops/check-all.sh`; die Zeile nach der Überschrift ruft `./ops/ads-case.sh`, keine Zeile außerhalb eines Kommentars
    enthält `anzeigen-rechnung.py 2>/dev/null`.
  Keine Ausgabe eines Falls nennt die gepflanzte Adresse.
- Kein bestehender Test unter `test/` ändert sich, vor allem nicht `test/anzeigen-rechnung-access-log.test.ts`,
  `test/anzeigen-rechnung-own-ips.test.ts`, `test/claim-keyless-own-ips.test.ts`, `test/own-ips-write.test.ts`,
  `test/deploy-window-rollout.test.ts`, `test/deploy-alarm-pending.test.ts`, `test/landing-yield.test.ts`,
  `test/keyless-mints.test.ts` und `test/conway-arrivals.test.ts`; läuft einer rot, ist das ein Gap dieses Goals.
- Kein Rollout. `ops/` liegt im Release-Pfad und kommt mit dem nächsten fälligen Rollout auf den Server; die Cron-Läufe dort ändert
  dieses Goal nicht. Nichts gegen die Produktion: Kein Test und kein Prüfbefehl ruft die VM, das echte ssh, `docker` auf dem Server,
  `ops/status.sh` gegen den Server oder einen Webhook auf, liest die echte Merkdatei unter `~/.local/state/control-plane/` oder
  schreibt `ops/own-ips.txt`; `ops/check-all.sh` selbst läuft in keinem Prüfbefehl, nur `bash -n`.
- Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich. Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout; neue Dateien vor `check` mit `git add`
  stagen. Kein `pkill -f`. Eine Entscheidung, die dieser Text offen lässt, schreibt der Maker als Zeile `- messung 13 (Engineer CP,
  <Datum>): …` in `goals/messung/ANNAHMEN.md`.

## Done Condition
- [ ] `ops/access-log.sh` endet mit 2, leerem `stdout` und einer Zeile auf `stderr`, wenn eine rotierte Datei nicht entpackt; der
      Marker kommt nie nach draußen, und heile Logs kommen wie vorher.
      Prüfung: `T=$(mktemp -d); mkdir -p $T/bin $T/caddy; printf '#!/bin/sh\nfor a; do last=$a; done\nexec sh -c "$last"\n' > $T/bin/ssh; printf '#!/bin/sh\nshift 4\nexec sh -c "$(printf "%%s" "$1" | sed "s#/var/log/caddy#%s#g")"\n' "$T/caddy" > $T/bin/docker; chmod +x $T/bin/ssh $T/bin/docker; printf '{"ts":1794300000}\n' | gzip -c > $T/caddy/access-2026-11-01T00-00-00.000-size.log.gz; seq 1 4000 | sed 's/.*/{"ts":1794310000,"n":&,"pad":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}/' | gzip -c | head -c 2000 > $T/caddy/access-2026-11-02T00-00-00.000-size.log.gz; printf '{"ts":1794320000}\n' > $T/caddy/access.log; env PATH=$T/bin:$PATH HOME=$T bash ops/access-log.sh >$T/out 2>$T/err; echo "rc=$? $(wc -l <$T/out) $(grep -c '^access-log: ' $T/err)"` muss genau `rc=2 0 1` ausgeben (heute `rc=0` mit über 700 Zeilen und `0`).
      Prüfung: `T=$(mktemp -d); mkdir -p $T/bin $T/caddy; printf '#!/bin/sh\nfor a; do last=$a; done\nexec sh -c "$last"\n' > $T/bin/ssh; printf '#!/bin/sh\nshift 4\nexec sh -c "$(printf "%%s" "$1" | sed "s#/var/log/caddy#%s#g")"\n' "$T/caddy" > $T/bin/docker; chmod +x $T/bin/ssh $T/bin/docker; printf '{"ts":1794300000}\n' | gzip -c > $T/caddy/access-2026-11-01T00-00-00.000-size.log.gz; seq 1 4000 | sed 's/.*/{"ts":1794310000,"n":&}/' | gzip -c | head -c 2000 > $T/caddy/access-2026-11-02T00-00-00.000-size.log.gz; printf '{"ts":1794320000}\n' > $T/caddy/access.log; env PATH=$T/bin:$PATH HOME=$T bash ops/access-log.sh --span >/dev/null 2>&1; echo "rc=$?"` muss genau `rc=2` ausgeben (heute `rc=3`).
      Prüfung: `T=$(mktemp -d); mkdir -p $T/bin $T/caddy; printf '#!/bin/sh\nfor a; do last=$a; done\nexec sh -c "$last"\n' > $T/bin/ssh; printf '#!/bin/sh\nshift 4\nexec sh -c "$(printf "%%s" "$1" | sed "s#/var/log/caddy#%s#g")"\n' "$T/caddy" > $T/bin/docker; chmod +x $T/bin/ssh $T/bin/docker; printf '{"ts":1794300000}\n' | gzip -c > $T/caddy/access-2026-11-01T00-00-00.000-size.log.gz; printf '{"ts":1794310000}\n' | gzip -c > $T/caddy/access-2026-11-02T00-00-00.000-size.log.gz; printf '{"ts":1794320000}' > $T/caddy/access.log; env PATH=$T/bin:$PATH HOME=$T bash ops/access-log.sh 2>/dev/null > $T/out; echo "rc=$? $(grep -c . $T/out) $(grep -c access-log-end $T/out) $(sed -n '$p' $T/out)"` muss genau `rc=0 3 0 {"ts":1794320000}` ausgeben.
      Prüfung: `grep -cF 'gzip -dc "$f" 2>/dev/null; done' ops/access-log.sh` muss 0 ausgeben (heute 1).
      Prüfung: `grep -cE "^[^#]*docker exec deploy-caddy-1 sh -c .*\| gzip -c" ops/access-log.sh` muss mindestens 1 ausgeben.
- [ ] `test/access-log-whole.test.ts` belegt die fünf Fälle, und die ersten beiden sind mit dem Stand von `ops/access-log.sh` an der
      Merge-Basis rot.
      Prüfung: `grep -cE 'it\("(a rotated file that does not unpack ends ops/access-log.sh with exit 2, an empty stdout and one line on stderr|--span ends with 2 when a rotated file does not unpack|rotated files and the current file come out oldest first with no end marker when every file unpacks|a current file without a final newline still ends with its own last line and no end marker|a missing log directory ends ops/access-log.sh with exit 2)"' test/access-log-whole.test.ts` muss 5 ausgeben.
      Prüfung: `pnpm -s vitest run test/access-log-whole` muss Exit-Code 0 haben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); cp ops/access-log.sh "$T/a"; git show "$B:ops/access-log.sh" > ops/access-log.sh; pnpm -s vitest run test/access-log-whole.test.ts --reporter=json --outputFile="$T/r.json" >/dev/null 2>&1; echo "rc=$? failed=$(node -e 'console.log(require(process.argv[1]).numFailedTests)' "$T/r.json")"; cp "$T/a" ops/access-log.sh; git status --porcelain -- ops | wc -l` muss `rc=1 failed=2` und danach 0 ausgeben.
- [ ] Unter „tragen Anzeigen schon?“ steht bei Exit 2 von `ops/anzeigen-rechnung.py` dessen Zeile `anzeigen-rechnung: …`, über
      `ops/ads-case.sh`; bei lesbarem Log stehen dieselben Zeilen wie vorher.
      Prüfung: `T=$(mktemp -d); mkdir -p $T/ops $T/bin; cp ops/ads-case.sh ops/anzeigen-rechnung.py ops/own-ips.sh $T/ops/; printf '#!/bin/sh\nexit 255\n' > $T/bin/ssh; printf '#!/bin/sh\nexit 1\n' > $T/ops/access-log.sh; printf '%s\n' '{"db":{"market":{"foreign_payers":1}}}' > $T/m.json; printf '#!/bin/sh\ncat %s\n' $T/m.json > $T/ops/status.sh; chmod +x $T/bin/ssh $T/ops/*.sh; printf '203.0.113.99 2026-11-21\n' > $T/own.txt; (cd $T && env PATH=$T/bin:$PATH HOME=$T CP_OWN_IPS_FILE=$T/own.txt CP_OWN_IPS_SEEN=$T/seen.txt bash ops/ads-case.sh) > $T/out 2>/dev/null; echo "rc=$? $(cat $T/out)"` muss genau `rc=0 anzeigen-rechnung: ./ops/access-log.sh ended with exit 1, so nothing is counted.` ausgeben.
      Prüfung: `git ls-files -s ops/ads-case.sh | cut -c1-6` muss genau `100755` ausgeben.
      Prüfung: `grep -cF 'anzeigen-rechnung.py 2>/dev/null' ops/check-all.sh` muss 0 ausgeben (heute 1).
      Prüfung: `grep -A1 -F -- "-- tragen Anzeigen schon? --" ops/check-all.sh | grep -cE '^\./ops/ads-case\.sh'` muss genau 1 ausgeben.
      Prüfung: `grep -cF 'run "the ad case can say yes as well as no" python3 ./ops/anzeigen-rechnung.py --selftest' ops/check-all.sh` muss genau 1 ausgeben.
      Prüfung: `bash -n ops/check-all.sh && bash -n ops/ads-case.sh && echo ok` muss genau `ok` ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- ops/check-all.sh | grep -cE '^[-+][^-+]'` muss genau 2 ausgeben.
- [ ] `test/ads-case.test.ts` belegt die drei Fälle.
      Prüfung: `grep -cE 'it\("(prints the reason line of ops/anzeigen-rechnung.py when the access log ends with exit 1|prints the same lines as the old pipe in ops/check-all.sh when the access log can be read|ops/check-all.sh calls ops/ads-case.sh under the heading and no longer drops the stderr of ops/anzeigen-rechnung.py)"' test/ads-case.test.ts` muss 3 ausgeben.
      Prüfung: `pnpm -s vitest run test/ads-case` muss Exit-Code 0 haben.
- [ ] Die bestehenden Tests der Leser von `ops/access-log.sh` bleiben unverändert grün.
      Prüfung: `pnpm -s vitest run test/anzeigen-rechnung test/claim-keyless-own-ips test/own-ips-write test/deploy-window-rollout test/deploy-alarm-pending test/landing-yield test/keyless-mints test/conway-arrivals` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- test | grep -vcE '^test/(access-log-whole|ads-case)\.test\.ts$'` muss 0 ausgeben.
      Prüfung: `python3 ops/anzeigen-rechnung.py --selftest >/dev/null 2>&1; echo "rc=$?"` muss genau `rc=0` ausgeben.
- [ ] `check` ist grün, nur die genannten Dateien ändern sich, und kein Lauf schreibt Zustand.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(ops/(access-log|check-all|ads-case)\.sh|test/(access-log-whole|ads-case)\.test\.ts|goals/messung/.+)$'` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die ersten beiden Fälle von `test/access-log-whole.test.ts` und alle drei von `test/ads-case.test.ts` waren vor dem Fix rot;
      die Zeile im Progress Log nennt sie und womit.
- [ ] Eine rotierte Datei, die nicht entpackt, macht `ops/access-log.sh` laut (Exit 2, eine Zeile auf `stderr`), und kein Leser
      bekommt ihren lesbaren Anfang als Log; ein heiles Log kommt Zeichen für Zeichen wie vorher, ohne Marker.
- [ ] Unter „tragen Anzeigen schon?“ steht nie mehr nichts: entweder die Zahlen oder der Grund, warum nichts gezählt wurde; keine
      Zeile nennt Host, Adresse oder Schlüssel.
- [ ] Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/fixtures/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- `ops/conway-series.sh` und `ops/conway-money-series.sh` (Cron-Läufe auf dem Server)
- jede andere Datei unter `ops/` außer `ops/access-log.sh`, `ops/check-all.sh` (nur Zeile 294) und dem neuen `ops/ads-case.sh`, vor
  allem `ops/anzeigen-rechnung.py`, `ops/own-ips.sh`, `ops/own-ips.txt`, `ops/status.sh`, `ops/claim-keyless.sh`, `ops/sperren.sh`,
  `ops/crawlers.sh`, `ops/failures.sh`, `ops/deploy-window.sh`, `ops/landing-yield.sh` und `ops/github-yield.sh`
- jeder bestehende Test unter `test/`; neu sind nur `test/access-log-whole.test.ts` und `test/ads-case.test.ts`
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
Pause: Kurs-Check 2026-11-21, Härtung eines Messwerkzeugs gegen eine kaputte Log-Rotation, die noch nie aufgetreten ist, ohne Schutz für Geld, Daten oder Rechte der Kunden; vor ihm braucht der Loop das Glied, mit dem Kunde 1 wieder zahlt (Vorschlag kunden-kritik-2026-11-21-3)
