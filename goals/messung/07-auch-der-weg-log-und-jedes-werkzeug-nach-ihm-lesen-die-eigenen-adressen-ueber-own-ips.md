# Messung Goal 07: Auch der Weg `--log` und jedes Werkzeug nach ihm lesen die eigenen Adressen über `own_ips`

## Status
DONE

## Active Objective
Seit messung 04 liest kein Messwerkzeug `ops/own-ips.txt` an `own_ips` vorbei, aber der Wächter `test/own-ips-readers.test.ts`
sucht nur den Dateinamen `own-ips.txt`. `ops/deploy-window.sh` liest im Weg `--log` die Liste selbst (Zeile 196,
`awk '!/^#/ && NF {print $1}' "$CP_OWN_IPS_FILE"`) und kennt die Adressen aus `CP_OWN_IPS_SEEN` nicht. Eine eigene Prüfung von
gestern, deren Adresse nur dort steht, zählt im Fenster nach einem Rollout als Fremder mit Fehler, und der Wächter bleibt grün.
Nach diesem Goal zählt `ops/deploy-window.sh --log` die Adressen aus der Liste, aus `CP_OWN_IPS` und aus der Datei in
`CP_OWN_IPS_SEEN` als eigene, ohne ssh, über eine Funktion `own_ips_offline` in `ops/own-ips.sh`, und der Wächter meldet jede Zeile
außerhalb eines Kommentars, die `CP_OWN_IPS_FILE` an `awk`, `grep`, `cat` oder `open` gibt, mit einer benannten Ausnahmeliste.
Widerlegt, wenn eine Adresse nur in der Datei aus `CP_OWN_IPS_SEEN` schon heute im Weg `--log` nicht als fremde zählt (der Maker
prüft das zuerst mit `grep -c 'CP_OWN_IPS_SEEN' ops/deploy-window.sh`, heute `0`, und
`grep -cE '^[^#]*awk .*CP_OWN_IPS_FILE' ops/deploy-window.sh`, heute `1`, und schreibt das Ergebnis in die erste Zeile des
Progress Log).
MVP: Funktion, weil das Fenster nach einem Rollout sonst eine eigene Prüfung von gestern als Fremden mit Fehler melden kann und der
Alarm aus messung 05 und 06 dann für einen 502 klingelt, den kein Kunde bekommen hat.

## Voraussetzungen
- messung Goal 06 DONE

## Kontext für den Maker
- Ziel: Die Zahl `BAD GATEWAY <n> of <m>`, die der Loop nach jedem Rollout liest, zählt nur fremde Anfragen, auch wenn ein Mensch
  ein vergangenes Fenster aus einer Log-Datei liest; und kein künftiges Werkzeug kann die Liste an `own_ips` vorbei lesen, ohne dass
  `check` rot wird.
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 07; übernimmt `goals/_vorschlaege/messung-kritik-2026-11-14-7.md` (dort noch
  Zeile 191, heute 196).
- **`own_ips_offline` in `ops/own-ips.sh`.** Druckt wie `own_ips` die eigenen Adressen, sortiert, eindeutig und durch Leerzeichen
  getrennt: die aus `CP_OWN_IPS`, die aus der Liste in `CP_OWN_IPS_FILE` (Zeile ohne `#` am Anfang, erstes Feld) und die aus der
  Datei in `CP_OWN_IPS_SEEN` mit demselben Standard wie `own_ips`
  (`${XDG_STATE_HOME:-$HOME/.local/state}/control-plane/own-ips-seen.txt`). Sie ruft kein ssh, fragt keine live Adresse ab und
  schreibt weder die Liste noch die Merkdatei. Fehlt die Liste, endet sie mit 1 und schreibt dieselbe stderr-Meldung wie `own_ips`;
  nennt die Liste selbst keine Adresse, endet sie mit 2 und druckt nichts, auch wenn `CP_OWN_IPS` oder die Merkdatei Adressen
  nennen, weil eine geleerte Liste nie als „keine eigenen Adressen“ gelesen werden darf (dieselbe Regel wie in
  `ops/timeout-quote.sh` und `ops/keyless-mints.sh`). `own_ips` und `own_ips_offline` lesen Liste und Merkdatei mit derselben
  Hilfsfunktion, damit die Regel an einer Stelle steht; das Verhalten von `own_ips` bleibt, wie es ist, und die bestehenden Tests
  `test/own-ips-*.test.ts` und die Tests der Werkzeuge, die `own_ips` rufen, bleiben unverändert grün. Der Kopfkommentar nennt die
  neue Funktion in der Zeile `source ops/own-ips.sh; …`.
- **`ops/deploy-window.sh --log`.** Statt `awk` auf `CP_OWN_IPS_FILE` ruft der Weg `own_ips_offline` und verwirft ihre stderr.
  Exit 1 der Funktion wird wie heute `COULD NOT TELL: the list of our own addresses is not there; …` mit Exit 2, Exit 2 der
  Funktion wie heute `COULD NOT TELL: the list of our own addresses names no address; …` mit Exit 2. Kein ssh, wie heute (Fall
  `no-ssh` des Selftests). Der Weg ohne `--log` bleibt bei `own_ips` mit geschwärzter stderr. Der Kopfkommentar (heute Zeile 19
  und 20, „come only from CP_OWN_IPS_FILE“) und der Abschnitt „Did the deploy cost a stranger an answer“ in `ops/README.md` nennen,
  dass `--log` die Liste, `CP_OWN_IPS` und `CP_OWN_IPS_SEEN` liest und keine live Adresse.
- **Selftest von `ops/deploy-window.sh`.** `run()` und der Fall `own-list-empty` setzen `CP_OWN_IPS_SEEN` auf eine Datei im
  Temp-Ordner, damit der Selftest nie die Merkdatei der Maschine liest. Neuer Fall `own-seen`: ein 502 von `192.0.2.44`, einer
  Adresse nur in dieser Datei, ergibt Exit 0, `ours     1 request` und keine Zeile `BAD GATEWAY`; die Datei bleibt Zeichen für
  Zeichen.
- **Test `test/deploy-window-own-seen.test.ts`**, neu, ohne Netz, nach dem Muster von `test/deploy-window.test.ts` (nachgebautes
  `ssh` vorn im `PATH`, das nur eine Markierung anlegt, `HOME` und alle Dateien in `mkdtemp`, Adressen nur aus den
  Dokumentationsbereichen), jeder Lauf mit `--at` und `--log`:
  - `it("--log counts an address only in CP_OWN_IPS_SEEN as ours, not as a stranger")`: Liste mit `192.0.2.10`, Merkdatei mit
    `192.0.2.44 2026-11-14`, Log mit einem 502 von `192.0.2.44` im Fenster; Exit 0, eine Zeile `ours     1 request`, keine Zeile
    `BAD GATEWAY`;
  - `it("--log without CP_OWN_IPS_SEEN reads the seen file under XDG_STATE_HOME")`: derselbe Fall ohne `CP_OWN_IPS_SEEN`, die
    Merkdatei unter `<XDG_STATE_HOME>/control-plane/own-ips-seen.txt`; Exit 0, keine Zeile `BAD GATEWAY`;
  - `it("--log still counts an address only in the list as ours")`: 502 von `192.0.2.10`, Merkdatei leer; Exit 0, keine Zeile
    `BAD GATEWAY`;
  - `it("--log refuses with exit 2 when the list names no address, even if CP_OWN_IPS_SEEN does")`: Liste nur mit Kommentar,
    Merkdatei mit `192.0.2.44`; Exit 2, eine Zeile, die mit `COULD NOT TELL: ` beginnt, keine Zeile `BAD GATEWAY`;
  - `it("--log reads CP_OWN_IPS_SEEN but never writes it and never calls ssh")`: nach dem ersten Fall ist die Merkdatei Zeichen für
    Zeichen gleich, die Liste auch, und die Markierung des nachgebauten `ssh` fehlt.
  Rot vor dem Fix sind die Fälle 1 und 2 (heute Exit 1 mit `BAD GATEWAY 1 of 1`); die Zeile im Progress Log nennt das mit Zahl.
- **Wächter `test/own-ips-readers.test.ts`.** Die beiden bestehenden Fälle bleiben Zeichen für Zeichen; neu kommen dazu:
  - `it("no file under ops/ besides ops/own-ips.sh and the named exceptions gives CP_OWN_IPS_FILE to awk, grep, cat or open outside a comment")`:
    dieselbe Dateiliste wie der erste Fall (ohne `ops/fixtures`, ohne `ops/own-ips.sh`), dazu ohne die Ausnahmen. Eine Zeile ist
    ein Treffer, wenn sie kein Kommentar ist (dieselbe Regel `COMMENT`), `CP_OWN_IPS_FILE` nennt und `awk`, `grep` oder `cat` als
    eigenes Wort oder `open(` enthält. Rot vor dem Fix mit `ops/deploy-window.sh:196`.
  - `it("the reader matcher trips on awk, grep, cat and open with CP_OWN_IPS_FILE and passes a test, an assignment and a comment")`:
    Treffer sind die heutige Zeile 196 von `ops/deploy-window.sh`, `cat "$CP_OWN_IPS_FILE"`,
    `grep -v '^#' "$CP_OWN_IPS_FILE"` und `own = open(os.environ["CP_OWN_IPS_FILE"]).read()`; kein Treffer sind
    `[[ ! -f "$CP_OWN_IPS_FILE" ]]`, `OWN="$CP_OWN_IPS_FILE"`, `CP_OWN_IPS_FILE="$dir/own.txt" bash "$HERE/x.sh"`,
    `# awk '!/^#/' "$CP_OWN_IPS_FILE"` und `concatenate "$CP_OWN_IPS_FILE"`.
  - `it("every named exception is a file under ops/ with a reason")`: jede Ausnahme hat einen Pfad, der existiert, und einen nicht
    leeren Grund.
  Die Ausnahmeliste steht im Test als Liste aus Pfad und Grund, genau diese vier: `ops/actions-log-addresses.sh` (zählt Fremde in
  öffentlichen Logs, nicht Kunden, und braucht nur den Pfad ohne live Abfrage, messung 04), `ops/timeout-quote.sh`,
  `ops/keyless-mints.sh` und `ops/anzeigen-rechnung.py` (je die Prüfung, dass die Liste selbst eine Adresse nennt, bevor `own_ips`
  gefragt wird). Heute treffen davon `ops/keyless-mints.sh:168` und `ops/anzeigen-rechnung.py:36`; die beiden anderen lesen die
  Liste über eine Variable und treffen nicht, bleiben aber benannt, damit eine spätere direkte Zeile dort kein neuer Befund ist.
- Kein anderer bestehender Test unter `test/` ändert sich. `test/deploy-window.test.ts` setzt kein `CP_OWN_IPS_SEEN`, aber `HOME`
  auf einen Temp-Ordner, also findet `own_ips_offline` dort keine Merkdatei; läuft ein bestehender Fall trotzdem rot, ist das ein
  Gap dieses Goals, kein Grund, den alten Fall zu ändern.
- Kein Rollout. `ops/deploy-window.sh` und `ops/own-ips.sh` laufen auf dem Runner von `deploy.yml` und am code-host aus dem
  Checkout; der Weg ohne `--log` ändert sich nicht. Kein Test, kein Selftest und kein Prüfbefehl ruft die VM, ssh, `crontab -l`
  oder einen Webhook auf oder liest die echte Merkdatei unter `~/.local/state/control-plane/`.
- Code, Kommentare, Log-Zeilen und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich. Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout; neue Dateien vor `check` mit `git add`
  stagen. Kein `pkill -f`. Eine Entscheidung, die dieser Text offen lässt, schreibt der Maker als Zeile `- messung 07 (Engineer CP,
  <Datum>): …` in `goals/messung/ANNAHMEN.md`.

## Done Condition
- [x] `ops/own-ips.sh` hat `own_ips_offline`, die Liste, `CP_OWN_IPS` und die Merkdatei liest, ohne ssh, und bei fehlender oder
      leerer Liste mit 1 oder 2 endet.
      Prüfung: `grep -cE '^own_ips_offline\(\)' ops/own-ips.sh` muss 1 ausgeben.
      Prüfung: `awk '/^own_ips_offline\(\)/,/^}/' ops/own-ips.sh | grep -cE '^[^#]*\bssh\b'` muss 0 ausgeben.
      Prüfung: `T=$(mktemp -d); printf '# x\n' > $T/l; printf '192.0.2.44 2026-11-14\n' > $T/s; env -u CP_OWN_IPS CP_OWN_IPS_FILE=$T/l CP_OWN_IPS_SEEN=$T/s bash -c 'source ops/own-ips.sh; own_ips_offline' >/dev/null 2>&1; echo $?` muss 2 ausgeben.
      Prüfung: `T=$(mktemp -d); mkdir $T/bin; printf '#!/bin/sh\ntouch %s/ssh-called\nexit 255\n' $T > $T/bin/ssh; chmod +x $T/bin/ssh; printf '192.0.2.10 x\n' > $T/l; printf '192.0.2.44 2026-11-14\n' > $T/s; env -u CP_OWN_IPS PATH=$T/bin:$PATH HOME=$T CP_OWN_IPS_FILE=$T/l CP_OWN_IPS_SEEN=$T/s bash -c 'source ops/own-ips.sh; own_ips_offline' | xargs; [ -e $T/ssh-called ] && echo ssh-called` muss genau `192.0.2.10 192.0.2.44` ausgeben.
- [x] `ops/deploy-window.sh --log` liest die eigenen Adressen über `own_ips_offline` und gibt `CP_OWN_IPS_FILE` an kein `awk`,
      `grep` oder `cat`; Kopfkommentar, Selftest und `ops/README.md` nennen `CP_OWN_IPS_SEEN`.
      Prüfung: `grep -cE '^[^#]*own_ips_offline' ops/deploy-window.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '^[^#]*CP_OWN_IPS_FILE.*\b(awk|grep|cat)\b|^[^#]*\b(awk|grep|cat)\b.*CP_OWN_IPS_FILE' ops/deploy-window.sh` muss 0 ausgeben.
      Prüfung: `grep -c 'CP_OWN_IPS_SEEN' ops/deploy-window.sh` muss mindestens 2 ausgeben.
      Prüfung: `bash ops/deploy-window.sh --selftest` muss Exit-Code 0 haben.
      Prüfung: `bash ops/deploy-window.sh --selftest | grep -cx 'ok   own-seen'` muss 1 ausgeben.
      Prüfung: `awk '/^## Did the deploy cost a stranger an answer/,/^## Does a backup come back up/' ops/README.md | grep -c 'CP_OWN_IPS_SEEN'` muss mindestens 1 ausgeben.
- [x] `test/deploy-window-own-seen.test.ts` belegt die fünf Fälle, und die bestehenden Tests von `ops/deploy-window.sh` und
      `own_ips` bleiben unverändert grün.
      Prüfung: `pnpm -s vitest run test/deploy-window test/deploy-alarm test/own-ips test/anzeigen-rechnung-own-ips test/timeout-quote-own-ips test/claim-keyless-own-ips` muss Exit-Code 0 haben.
      Prüfung: `grep -cE 'it\("(--log counts an address only in CP_OWN_IPS_SEEN as ours, not as a stranger|--log without CP_OWN_IPS_SEEN reads the seen file under XDG_STATE_HOME|--log still counts an address only in the list as ours|--log refuses with exit 2 when the list names no address, even if CP_OWN_IPS_SEEN does|--log reads CP_OWN_IPS_SEEN but never writes it and never calls ssh)"' test/deploy-window-own-seen.test.ts` muss 5 ausgeben.
- [x] Der Wächter meldet jede Zeile, die `CP_OWN_IPS_FILE` an `awk`, `grep`, `cat` oder `open` gibt, außer in den vier benannten
      Ausnahmen, und seine beiden bestehenden Fälle bleiben.
      Prüfung: `grep -cE 'it\("(no file under ops/ besides ops/own-ips.sh and the named exceptions gives CP_OWN_IPS_FILE to awk, grep, cat or open outside a comment|the reader matcher trips on awk, grep, cat and open with CP_OWN_IPS_FILE and passes a test, an assignment and a comment|every named exception is a file under ops/ with a reason)"' test/own-ips-readers.test.ts` muss 3 ausgeben.
      Prüfung: `grep -cE 'ops/(actions-log-addresses\.sh|timeout-quote\.sh|keyless-mints\.sh|anzeigen-rechnung\.py)' test/own-ips-readers.test.ts` muss mindestens 4 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- test/own-ips-readers.test.ts | grep -cE '^-[^-]'` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/own-ips-readers` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- test | grep -vcE '^test/(deploy-window-own-seen|own-ips-readers)\.test\.ts$'` muss 0 ausgeben.
- [x] `check` ist grün, gesperrte Pfade bleiben unverändert, und unter `ops/` ändern sich nur `ops/deploy-window.sh`,
      `ops/own-ips.sh` und `ops/README.md`.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE '^(\.github|deploy|src|harness|scripts|docs)/|^goals/kanal/'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops | grep -vcE '^ops/(deploy-window\.sh|own-ips\.sh|README\.md)$'` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [x] Kritik 1: `test/deploy-window-own-seen.test.ts` belegt auch eine Adresse nur in `CP_OWN_IPS` als eigene im Weg `--log`,
      und kein Lauf dieser Datei druckt eine Adresse, auch nicht die aus der Merkdatei. Neuer Fall
      `it("--log counts an address only in CP_OWN_IPS as ours and prints no address")`: Liste mit `192.0.2.10`, Merkdatei leer,
      `CP_OWN_IPS=198.51.100.7`, Log mit einem 502 von `198.51.100.7` im Fenster; Exit 0, eine Zeile `ours     1 request`, keine
      Zeile `BAD GATEWAY`. Dazu steht in keinem Lauf der Datei in stdout oder stderr eine Zeichenfolge, die
      `/\b(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+\b/` trifft (eine gemeinsame Prüfung in `run()`). Die fünf bestehenden
      Fälle bleiben mit ihren Namen. MVP: Funktion, weil `CP_OWN_IPS` heute im Weg `--log` an keinem Test hängt und die Ausgabe
      von `ops/deploy-window.sh` in öffentlichen Actions-Logs landet.
      Prüfung: `grep -cF 'it("--log counts an address only in CP_OWN_IPS as ours and prints no address"' test/deploy-window-own-seen.test.ts` muss 1 ausgeben.
      Prüfung: `grep -cF '198.51.100.7' test/deploy-window-own-seen.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/deploy-window-own-seen` muss Exit-Code 0 haben.
- [x] Kritik 2: Der Wächter in `test/own-ips-readers.test.ts` meldet auch die üblichen Leser ohne `awk`, `grep` oder `cat`: eine
      Umleitung `< "$CP_OWN_IPS_FILE"` oder `<"${CP_OWN_IPS_FILE}"`, `sed`, `cut`, `head`, `tail` und `while read` als eigenes Wort
      sowie `readFileSync(` und `read_text(` zusammen mit `CP_OWN_IPS_FILE`. Neuer Fall
      `it("the reader matcher also trips on a redirect, sed, cut, head, tail, readFileSync and read_text with CP_OWN_IPS_FILE")`
      mit den Treffern `done < "$CP_OWN_IPS_FILE"`, `while read -r ip _; do :; done <"${CP_OWN_IPS_FILE}"`,
      `sed -n '/^[^#]/p' "$CP_OWN_IPS_FILE"`, `cut -d' ' -f1 "$CP_OWN_IPS_FILE"`, `head -n1 "$CP_OWN_IPS_FILE"`,
      `readFileSync(process.env.CP_OWN_IPS_FILE, "utf8")` und `Path(os.environ["CP_OWN_IPS_FILE"]).read_text()`; die fünf
      Nicht-Treffer des bestehenden Matcher-Falls bleiben Nicht-Treffer, dazu `echo "using $CP_OWN_IPS_FILE" >&2` und
      `headline="$CP_OWN_IPS_FILE"`. Die drei Testnamen aus Punkt 4 bleiben Zeichen für Zeichen, der erste neue Fall läuft mit dem
      erweiterten Matcher weiter grün. MVP: Funktion, weil das Ziel dieses Goals „kein künftiges Werkzeug liest die Liste an
      `own_ips` vorbei, ohne dass `check` rot wird“ heißt und `while read … < "$CP_OWN_IPS_FILE"` der gängigste Leser in Bash ist,
      den der Wächter heute durchlässt.
      Prüfung: `grep -cF 'it("the reader matcher also trips on a redirect, sed, cut, head, tail, readFileSync and read_text with CP_OWN_IPS_FILE"' test/own-ips-readers.test.ts` muss 1 ausgeben.
      Prüfung: `grep -cF 'done < "$CP_OWN_IPS_FILE"' test/own-ips-readers.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/own-ips-readers` muss Exit-Code 0 haben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- test/own-ips-readers.test.ts | grep -cE '^-[^-]'` muss 0 ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Fälle 1 und 2 des neuen Tests und der erste neue Fall des Wächters waren vor dem Fix rot; die Zeile im Progress Log
      nennt sie und womit.
- [ ] Eine leere Liste bricht im Weg `--log` weiter mit Exit 2 ab, auch wenn `CP_OWN_IPS` oder die Merkdatei Adressen nennen.
- [ ] Keine Ausgabe von `ops/deploy-window.sh` nennt eine Adresse, auch nicht eine aus der Merkdatei.
- [ ] Code, Kommentare, Log-Zeilen und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/fixtures/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- jede andere Datei unter `ops/` außer `ops/deploy-window.sh`, `ops/own-ips.sh` und `ops/README.md`, vor allem `ops/own-ips.txt`
  und die vier Ausnahmen `ops/actions-log-addresses.sh`, `ops/timeout-quote.sh`, `ops/keyless-mints.sh` und
  `ops/anzeigen-rechnung.py`
- jeder bestehende Test unter `test/` außer `test/own-ips-readers.test.ts`, und dort nur neue Zeilen; neu ist nur
  `test/deploy-window-own-seen.test.ts`
- `goals/kanal/**`
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), die VM, ssh und jede Datei auf dem Server; Produktion weder
  lesend noch schreibend, kein Rollout, kein POST an einen echten Webhook
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-15 Widerlegung geprüft: `grep -c 'CP_OWN_IPS_SEEN' ops/deploy-window.sh` -> 0, `grep -cE '^[^#]*awk .*CP_OWN_IPS_FILE' ops/deploy-window.sh` -> 1 an der Merge-Basis 907bde7, das Goal ist nicht widerlegt.
- 2026-11-15 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: `own_ips_offline` in `ops/own-ips.sh` liest Liste, `CP_OWN_IPS` und Merkdatei über dieselben Hilfsfunktionen wie `own_ips`, ohne ssh und ohne Schreiben, `ops/deploy-window.sh --log` ruft sie statt `awk` auf der Liste, Kopfkommentar, Selftest (Fall `own-seen`, Merkdatei im Temp-Ordner) und `ops/README.md` nennen `CP_OWN_IPS_SEEN`, neuer Test `test/deploy-window-own-seen.test.ts`, Wächter um drei Fälle und vier Ausnahmen ergänzt; vor dem Fix rot: `pnpm -s vitest run test/deploy-window-own-seen test/own-ips-readers` -> 4 failed, 10 Tests (Fälle 1, 2 und 5 Exit 1 statt 0 mit `BAD GATEWAY`, Wächter mit `ops/deploy-window.sh:196`), Selftest mit dem alten `awk`-Weg -> `FAIL own-seen`. Prüfbefehle: P1 Funktion 1, ssh 0, leere Liste Exit 2, Ausgabe `192.0.2.10 192.0.2.44` ohne `ssh-called`; P2 `own_ips_offline` 1, Leser 0, `CP_OWN_IPS_SEEN` 6, Selftest Exit 0, `ok   own-seen` 1, README 1; P3 vitest Exit 0 (10 Dateien, 64 Tests), fünf Testnamen 5; P4 drei Testnamen 3, Ausnahmen 4, entfernte Zeilen 0, vitest Exit 0 (5 Tests), fremde Tests 0; P5 `check` Exit 0 (164 Dateien, 1849 Tests), gesperrte Pfade 0, fremde ops-Dateien 0, Dateien unter XDG_STATE_HOME 0.
- 2026-11-15 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5; `origin/dev` steht auf der Merge-Basis 907bde7, kein Merge nötig. Prüfbefehle: P1 Funktion 1, ssh 0, leere Liste Exit 2, Ausgabe `192.0.2.10 192.0.2.44` ohne `ssh-called`; P2 `own_ips_offline` 1, Leser 0, `CP_OWN_IPS_SEEN` 6, Selftest Exit 0, `ok   own-seen` 1, README 1; P3 vitest Exit 0 (64 Tests), fünf Testnamen 5; P4 drei Testnamen 3, Ausnahmen 4, entfernte Zeilen 0, vitest Exit 0 (5 Tests), fremde Tests 0; P5 `check` Exit 0 (164 Dateien, 1849 Tests), gesperrte Pfade 0, fremde ops-Dateien 0, Dateien unter XDG_STATE_HOME 0; Jobs `check` und `e2e` am PR #184 grün am Kopf 5da89c9.
- 2026-11-15 Zyklus 3: Punkt Kritik 1 gebaut: `test/deploy-window-own-seen.test.ts` hat den Fall `--log counts an address only in CP_OWN_IPS as ours and prints no address` (`CP_OWN_IPS=198.51.100.7`, 502 von dort, Exit 0, `ours     1 request`) und in `run()` die Prüfung, dass kein Lauf eine Adresse aus den Dokumentationsbereichen druckt; Gegenprobe rot: `CP_OWN_IPS` in `own_ips_offline` vorübergehend ausgeschaltet -> 1 failed, 5 passed, eine vorübergehende Zeile `echo "own: $OWN" >&2` in `ops/deploy-window.sh` -> `a run printed an address`, beide zurückgenommen. Prüfbefehle: Testname 1, `198.51.100.7` 1, `pnpm -s vitest run test/deploy-window-own-seen` Exit 0 (6 Tests).
- 2026-11-15 Zyklus 4: Punkt Kritik 2 gebaut, Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, Kritik 1, Kritik 2: der Matcher in `test/own-ips-readers.test.ts` erkennt zu `CP_OWN_IPS_FILE` zusätzlich `sed`, `cut`, `head`, `tail`, `while read`, `readFileSync(`, `read_text(` und die Umleitung `<`, neuer Fall `the reader matcher also trips on a redirect, sed, cut, head, tail, readFileSync and read_text with CP_OWN_IPS_FILE`; vor dem Fix rot: `pnpm -s vitest run test/own-ips-readers` -> 1 failed, 5 passed (`done < "$CP_OWN_IPS_FILE"` kein Treffer), Gegenprobe am Scan: vorübergehend gepflanzter Leser `while read … < "$CP_OWN_IPS_FILE"` unter `ops/` -> rot mit seiner Zeile, danach entfernt; `origin/dev` steht auf der Merge-Basis 907bde7, kein Merge nötig. Prüfbefehle: P1 Funktion 1, ssh 0, leere Liste Exit 2, Ausgabe `192.0.2.10 192.0.2.44` ohne `ssh-called`; P2 `own_ips_offline` 1, Leser 0, `CP_OWN_IPS_SEEN` 6, Selftest Exit 0, `ok   own-seen` 1, README 1; P3 vitest Exit 0 (66 Tests), fünf Testnamen 5; P4 drei Testnamen 3, Ausnahmen 4, entfernte Zeilen 0, vitest Exit 0, fremde Tests 0; P5 `check` Exit 0 (164 Dateien, 1851 Tests, 289 s), gesperrte Pfade 0, fremde ops-Dateien 0, Dateien unter XDG_STATE_HOME 0; Kritik 1 Testname 1, `198.51.100.7` 1, vitest Exit 0; Kritik 2 Testname 1, `done < "$CP_OWN_IPS_FILE"` 1, vitest Exit 0 (6 Tests), entfernte Zeilen 0.
- 2026-11-15 Release: PASS K und B (Zyklus 4), DONE.

## Blockers
- keine
