# Messung Goal 10: Eine Sperre für die eigene Liste statt drei

## Status
ACTIVE

## Active Objective
Die Regel „eine fehlende oder leere eigene Liste hält die Zählung an“ steht am Kopf von `dev` (82fd213) dreimal außerhalb von
`ops/own-ips.sh`, jedes Mal anders gebaut: `conway_own_list` in `ops/conway-arrivals.sh` (Zeile 24 bis 45) prüft die Liste mit
`grep -v '^#' "$file" | awk 'NF {print $1}' | grep -q .` und übergeht danach den Exit-Code von `own_ips` (Zeile 39,
`list=$(… own_ips 2>/dev/null)` ohne Prüfung), `own_list` in `ops/timeout-quote.sh` (Zeile 58 bis 82) prüft mit
`awk '!/^#/ && NF { n++ } END { exit !n }'` und bricht bei einem Exit ungleich 0 von `own_ips` ab, und `ops/anzeigen-rechnung.py`
baut dieselbe Prüfung als Shell-Text `LIST_NAMES_AN_ADDRESS` (Zeile 42 bis 45) mit eigenen Exit-Codes 3 und 4. Mit einer gefüllten
Liste und einem `own_ips`, das `192.0.2.10` nennt und mit 1 endet, gibt `conway_own_list` heute 0 zurück und schreibt die Adresse in
seine Datei, `ops/timeout-quote.sh` hält an. Nach diesem Goal hat `ops/own-ips.sh` eine Funktion `own_ips_checked <file>`, die die
eigenen Adressen nennt wie `own_ips` und bei fehlender oder leerer Liste und bei einem gescheiterten `own_ips` mit 2 und genau einer
Zeile auf stderr endet, die die Datei nennt und keine Adresse; die drei Werkzeuge rufen nur noch sie, und die Ausnahmeliste in
`test/own-ips-readers.test.ts` verliert die beiden Einträge, deren Leser damit wegfallen.
Widerlegt, wenn `ops/conway-arrivals.sh` am Kopf von `dev` bei einem Exit ungleich 0 von `own_ips` schon heute nicht zählt (der
Maker prüft das zuerst mit dem vierten Prüfbefehl von Punkt 1 an der Merge-Basis, heute `exit 1 failed 1`, weil `conway_own_list`
dort 0 zurückgibt, und schreibt das Ergebnis in die erste Zeile des Progress Log).
MVP: Funktion, weil jede Kopie der Sperre, die beim nächsten Umbau auseinanderläuft, eigene Anfragen als fremde zählen lässt, und
das trifft die Timeout-Quote, den Ertrag der Startseite und die Konversion der Anzeigen, die Zahlen, an denen der Loop zahlende
Kunden misst.

## Voraussetzungen
- messung Goal 09 DONE

## Kontext für den Maker
- Ziel: Keine Zählung zahlender Besucher läuft mit einer fehlenden eigenen Liste weiter, weil ein Werkzeug die Sperre anders
  nachgebaut hat. Die Sperre steht an einer Stelle, und wer sie ändert, ändert sie für alle drei Werkzeuge.
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 10; übernimmt `goals/_vorschlaege/messung-nacharbeit-2026-11-15-2.md` (die eine
  Sperre) und `goals/_vorschlaege/messung-nacharbeit-2026-11-15-3.md` (`ops/timeout-quote.sh` wieder höchstens 500 Zeilen).
- **`own_ips_checked` in `ops/own-ips.sh`**, nach `own_ips_offline`, die Kopfzeile genau `own_ips_checked() {` in Spalte 0 (ein
  Prüfbefehl liest sie). Sie gibt nur 0 oder 2 zurück, mit `return`, nie `exit`, weil die Datei gesourct wird:
  - `<file>` fehlt oder ist leer übergeben: eine Zeile auf stderr, 2.
  - `_own_ips_listed "<file>"` gibt keine Zeile aus: eine Zeile auf stderr, 2. Die Liste wird damit genau so gelesen wie in
    `own_ips` und `own_ips_offline`; ändert messung 12 später `_own_ips_listed`, gilt die neue Regel ohne weitere Änderung auch hier.
  - sonst `CP_OWN_IPS_FILE="<file>" own_ips 2>/dev/null </dev/null`; endet das mit einem Exit ungleich 0 oder nennt es kein Wort:
    eine Zeile auf stderr, 2. Der stderr von `own_ips` bleibt verworfen, weil er die live Adresse nennen kann; stdin kommt aus
    `/dev/null`, weil `ops/timeout-quote.sh --join` den Caddy-Log von stdin liest und ssh ihn sonst verschluckt.
  - sonst genau die Ausgabe von `own_ips` auf stdout, 0. `CP_OWN_IPS`, `CP_OWN_IPS_SEEN`, `CP_OWN_IPS_WRITE`, `CP_HOST` und
    `CP_SSH_KEY` gelten, wie der Aufrufer sie setzt.
  Jede stderr-Zeile beginnt mit `own_ips_checked: `, nennt `<file>` und nie eine Adresse. Der Kopfkommentar der Datei bekommt eine
  Zeile `#   source ops/own-ips.sh; OWN=$(own_ips_checked "$CP_OWN_IPS_FILE") || exit 2` und zwei bis drei Sätze, wofür sie da ist.
  `own_ips`, `own_ips_offline`, `_own_ips_listed` und `_own_ips_seen` bleiben Zeichen für Zeichen.
- **Die drei Werkzeuge** rufen nur noch `own_ips_checked` statt ihrer eigenen Prüfungen und schreiben beim Anhalten genau eine Zeile
  auf stderr, die mit ihrem bisherigen Präfix beginnt und die Zeile von `own_ips_checked` enthält (Datei, keine Adresse); Exit-Codes
  und Ausgaben bei gefüllter Liste bleiben, wie sie sind:
  - `conway_own_list` in `ops/conway-arrivals.sh`: Datei bleibt `${CP_OWN_IPS:-$CP_OWN_IPS_FILE}`, der Aufruf
    `CP_OWN_IPS="" own_ips_checked "$file"`, bei 2 die Zeile `conway-arrivals: <Zeile>, so nothing is counted.` und 2, sonst die
    Adressen eine je Zeile in `<out>` wie heute.
  - `own_list` in `ops/timeout-quote.sh`: `own_ips_checked "$CP_OWN_IPS_FILE"`, bei 2 die Zeile
    `TIMEOUT QUOTE FAIL: <Zeile>, so nothing is counted.` und `exit 2` wie heute. Die Datei hat danach höchstens 500 Zeilen (heute
    522); bleibt sie darüber, nennt die Commit-Message der Änderung an ihr die Zeilenzahl und den Grund. Die Hilfe
    (`sed -n '2,44p' "$0"`, Zeile 517) zeigt danach weiter nur den Kopfkommentar; ändert sich seine Länge, wandert die Zahl mit.
  - `own_addresses()` in `ops/anzeigen-rechnung.py`: `LIST_NAMES_AN_ADDRESS` und der Kommentar darüber fallen weg, der Aufruf ist
    `bash -c 'source ops/own-ips.sh && own_ips_checked "$CP_OWN_IPS_FILE"'` mit `stdin=subprocess.DEVNULL` und Timeout wie heute;
    bei einem Exit ungleich 0 oder leerer Ausgabe `OwnListMissing` mit der stderr-Zeile von `own_ips_checked` als Text, die
    bestehende Zeile `anzeigen-rechnung: {exc}, so nothing is counted.` bleibt.
  Kommentare, die heute die eigene Prüfung beschreiben (etwa `ops/conway-arrivals.sh` Zeile 20 bis 23 und 31 bis 33,
  `ops/timeout-quote.sh` Zeile 53 bis 57), verweisen stattdessen auf `own_ips_checked`.
- **Neuer Test `test/own-ips-checked.test.ts`**, ohne Netz, nach dem Muster von `test/timeout-quote-own-ips.test.ts`: `mkdtemp`, ein
  nachgebautes `ssh` vorn im `PATH`, das die Frage nach `SSH_CLIENT` mit `FAKE_LIVE` beantwortet, danach
  `dirname(process.execPath)`, `/usr/bin` und `/bin`; `HOME`, Liste und `CP_OWN_IPS_SEEN` im Sandbox-Verzeichnis, `CP_OWN_IPS_WRITE`
  nicht gesetzt. Die Skripte kommen aus dem Verzeichnis `OPS_UNDER_TEST` (Pfad, sonst `ops/` des Repos): `bash -c` sourct
  `$OPS/own-ips.sh` oder `$OPS/conway-arrivals.sh`. Adressen nur aus den Dokumentationsbereichen: Liste `192.0.2.10`, Merkdatei
  `192.0.2.44`, `CP_OWN_IPS` `198.51.100.7` (außer bei `conway_own_list`, dort ist `CP_OWN_IPS` der Pfad der Liste), live
  `203.0.113.9`. Kein stdout und kein stderr der ersten fünf Fälle nennt eine dieser vier Adressen außer im erwarteten stdout. Genau
  sechs Fälle:
  - `it("own_ips_checked returns 2 with one line naming the file when the list is missing")`: Argument `<root>/none.txt`, Merkdatei,
    `CP_OWN_IPS` und `FAKE_LIVE` gesetzt; Exit 2, stdout leer, stderr genau eine nicht leere Zeile, die mit `own_ips_checked: `
    beginnt und `<root>/none.txt` enthält.
  - `it("own_ips_checked returns 2 with one line naming the file when the list names no address, even with a live, a seen and a CP_OWN_IPS address")`:
    Liste `"# retired\n\n"`, sonst wie oben; dieselben Erwartungen mit dem Pfad der Liste.
  - `it("own_ips_checked names the addresses own_ips names when the list names one")`: Liste `"192.0.2.10 2026-11-01 x\n"`; Exit 0,
    die Wörter auf stdout sind dieselben wie die von `own_ips` mit gleicher Umgebung und Liste, und unter ihnen stehen alle vier
    Adressen.
  - `it("own_ips_checked returns 2 when own_ips ends with an exit other than 0")`: gefüllte Liste, nach dem Sourcen
    `own_ips() { echo 192.0.2.10; return 1; }`; Exit 2, stdout leer, stderr genau eine Zeile mit `own_ips_checked: `, ohne Adresse.
  - `it("conway_own_list returns 2 when own_ips ends with an exit other than 0")`: `$OPS/conway-arrivals.sh` gesourct, `own_ips`
    überschrieben wie oben, `CP_OWN_IPS=<Liste>`, gefüllte Liste, `conway_own_list <root>/out`; Rückgabe 2, `<root>/out` fehlt oder
    ist leer, stderr genau eine Zeile, die mit `conway-arrivals: ` beginnt, ohne Adresse. Rot am Kopf von `dev` (Rückgabe 0, die
    Adresse steht in der Datei).
  - `it("conway_own_list writes the addresses own_ips names, one per line")`: gefüllte Liste, `CP_OWN_IPS=<Liste>`,
    `FAKE_LIVE` gesetzt; Rückgabe 0, die Zeilen in `<root>/out` sind die Wörter von `CP_OWN_IPS_FILE=<Liste> CP_OWN_IPS= own_ips`
    mit gleicher Umgebung. Grün schon am Kopf von `dev`; der Fall hält fest, dass die Umstellung nichts an der Ausgabe ändert.
- **`test/own-ips-readers.test.ts`**: In `READER_EXCEPTIONS` fallen genau die Zeilen für `ops/timeout-quote.sh` und
  `ops/anzeigen-rechnung.py` weg; keine andere Zeile ändert sich, keine kommt dazu. `ops/actions-log-addresses.sh` und
  `ops/keyless-mints.sh` bleiben benannt. Danach muss der Wächter auf beiden Dateien ohne Ausnahme grün sein, also steht dort keine
  Zeile mehr, die `CP_OWN_IPS_FILE` und einen Leser zusammen nennt.
- Annahme (Tech Lead, 16.11.2026): Auch `ops/anzeigen-rechnung.py` verliert seinen Eintrag, obwohl die ROADMAP nur
  `ops/timeout-quote.sh` nennt, weil sein einziger direkter Leser `LIST_NAMES_AN_ADDRESS` mit diesem Goal wegfällt; ein Eintrag ohne
  Leser ließe einen neuen direkten Leser dort ungemeldet einziehen.
- Annahme (Tech Lead, 16.11.2026): `ops/keyless-mints.sh` (Zeile 188 bis 196) hat eine vierte Kopie der Sperre und bleibt hier
  unverändert, weil die ROADMAP genau drei Werkzeuge nennt und messung 12 dieselbe Stelle anfasst; dass es später ebenfalls
  `own_ips_checked` ruft, ist ein Vorschlag für die Kritik.
- Annahme (Tech Lead, 16.11.2026): messung 12 läuft nach diesem Goal, weil der Loop Master in einem Topic die erste offene Nummer
  startet. Seine Annahmen zu den Vorprüfungen in `ops/timeout-quote.sh` und `ops/conway-arrivals.sh` treffen dann auf
  `own_ips_checked`; die Regel von messung 12 in `_own_ips_listed` gilt dort ohne eigene Zeile. Die Goal-Datei von messung 12 bleibt
  hier unverändert.
- Kein Rollout. Die drei Werkzeuge laufen am code-host aus dem Checkout. Kein Test und kein Prüfbefehl ruft die VM, ssh oder das
  echte Zustandsverzeichnis auf; `ops/own-ips.txt` bleibt unverändert, auch nach den Läufen.
- Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich. Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein `pkill -f`. Eine Entscheidung, die
  dieser Text offen lässt, schreibt der Maker als Zeile `- messung 10 (Engineer CP, <Datum>): …` in `goals/messung/ANNAHMEN.md`.

## Done Condition
- [x] `ops/own-ips.sh` hat `own_ips_checked`, die bei fehlender oder leerer Liste und bei gescheitertem `own_ips` mit 2 und einer
      Zeile ohne Adresse endet und sonst nennt, was `own_ips` nennt; der neue Test war an der Merge-Basis rot.
      Prüfung: `grep -c '^own_ips_checked() {$' ops/own-ips.sh` muss 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH timeout 300 pnpm -s vitest run test/own-ips-checked.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); mb=$(git merge-base origin/dev HEAD); git show $mb:ops/own-ips.sh > $T/own-ips.sh; git show $mb:ops/conway-arrivals.sh > $T/conway-arrivals.sh; PATH=/usr/bin:$PATH OPS_UNDER_TEST=$T timeout 300 pnpm -s vitest run test/own-ips-checked.test.ts > $T/out 2>&1; echo "exit $? failed $(grep -cE 'Tests +5 failed \| 1 passed' $T/out)"` muss genau `exit 1 failed 1` ausgeben.
      Prüfung: `T=$(mktemp -d); mb=$(git merge-base origin/dev HEAD); git show $mb:ops/own-ips.sh > $T/own-ips.sh; git show $mb:ops/conway-arrivals.sh > $T/conway-arrivals.sh; PATH=/usr/bin:$PATH OPS_UNDER_TEST=$T timeout 300 pnpm -s vitest run test/own-ips-checked.test.ts -t "conway_own_list returns 2 when own_ips ends with an exit other than 0" > $T/out 2>&1; echo "exit $? failed $(grep -cE 'Tests +1 failed' $T/out)"` muss genau `exit 1 failed 1` ausgeben.
- [x] `ops/conway-arrivals.sh`, `ops/timeout-quote.sh` und `ops/anzeigen-rechnung.py` rufen `own_ips_checked`, und keine ihrer
      eigenen Prüfungen der Liste steht mehr da.
      Prüfung: `for f in ops/conway-arrivals.sh ops/timeout-quote.sh ops/anzeigen-rechnung.py; do grep -c own_ips_checked $f; done | grep -c '^0$'` muss 0 ausgeben.
      Prüfung: `cat ops/conway-arrivals.sh ops/timeout-quote.sh ops/anzeigen-rechnung.py | grep -cE "awk '!/\^#/|grep -v '\^#'|LIST_NAMES_AN_ADDRESS|has no list of our own|has an empty list of our own|named no own address"` muss 0 ausgeben.
- [x] Die Ausnahmeliste des Wächters verliert genau `ops/timeout-quote.sh` und `ops/anzeigen-rechnung.py`, und der Wächter bleibt
      grün.
      Prüfung: `grep -cE 'path: "ops/(timeout-quote\.sh|anzeigen-rechnung\.py)"' test/own-ips-readers.test.ts` muss 0 ausgeben.
      Prüfung: `grep -cE 'path: "ops/(actions-log-addresses|keyless-mints)\.sh"' test/own-ips-readers.test.ts` muss 2 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- test/own-ips-readers.test.ts | grep -E '^[-+]' | grep -vE '^(---|\+\+\+) ' | grep -vcE '^-  \{ path: "ops/(timeout-quote\.sh|anzeigen-rechnung\.py)"'` muss 0 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH timeout 300 pnpm -s vitest run test/own-ips-readers.test.ts` muss Exit-Code 0 haben.
- [x] `ops/timeout-quote.sh` hat höchstens 500 Zeilen oder die Commit-Message nennt die Größe, und die Hilfe zeigt weiter nur den
      Kopfkommentar.
      Prüfung: `test $(wc -l < ops/timeout-quote.sh) -lt 522 && echo kleiner` muss genau `kleiner` ausgeben.
      Prüfung: `test $(wc -l < ops/timeout-quote.sh) -le 500 && echo ok || { git log --format=%B $(git merge-base origin/dev HEAD)..HEAD -- ops/timeout-quote.sh | grep -qE '[0-9]+ (Zeilen|lines)' && echo begründet; }` muss `ok` oder `begründet` ausgeben.
      Prüfung: `r=$(sed -nE "s/.*sed -n '([0-9]+,[0-9]+)p' .*/\1/p" ops/timeout-quote.sh); sed -n "${r}p" ops/timeout-quote.sh | grep -vcE '^#( |$)'` muss 0 ausgeben.
- [x] Die bestehenden Tests der drei Werkzeuge und rund um die eigene Liste bleiben unverändert und grün, und unter `test/` ändern
      sich nur die beiden genannten Dateien.
      Prüfung: `PATH=/usr/bin:$PATH timeout 600 pnpm -s vitest run test/own-ips test/conway-arrivals test/landing-yield test/github-yield test/timeout-quote test/anzeigen-rechnung test/keyless-mints test/claim-keyless test/deploy-window` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- test | grep -vcE '^test/(own-ips-checked|own-ips-readers)\.test\.ts$'` muss 0 ausgeben.
- [x] `check` ist grün, gesperrte Pfade bleiben unverändert, und unter `ops/` ändern sich nur die vier Dateien und
      `ops/README.md`.
      Prüfung: `PATH=/usr/bin:$PATH timeout 900 node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE '^(\.github|deploy|src|harness|scripts|docs)/|^goals/kanal/|^ops/own-ips\.txt$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops | grep -vcE '^ops/(own-ips\.sh|conway-arrivals\.sh|timeout-quote\.sh|anzeigen-rechnung\.py|README\.md)$'` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der Fall „conway_own_list returns 2 when own_ips ends with an exit other than 0“ war vor dem Fix rot; die Zeile im Progress
      Log nennt das mit der Rückgabe von `conway_own_list` an der Merge-Basis.
- [ ] Bei gefüllter Liste zählen alle drei Werkzeuge genau wie vorher; bei fehlender oder leerer Liste enden sie mit 2 und genau einer
      stderr-Zeile mit ihrem bisherigen Präfix.
- [ ] Keine Ausgabe eines Werkzeugs, von `own_ips_checked` oder eines Tests nennt eine Adresse außer im erwarteten stdout.
- [ ] Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/fixtures/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- jede andere Datei unter `ops/` außer `ops/own-ips.sh`, `ops/conway-arrivals.sh`, `ops/timeout-quote.sh`,
  `ops/anzeigen-rechnung.py` und `ops/README.md`, vor allem `ops/own-ips.txt`, `ops/keyless-mints.sh`,
  `ops/actions-log-addresses.sh`, `ops/deploy-window.sh`, `ops/conway_arrivals.py`, `ops/landing-yield.sh` und
  `ops/github-yield.sh`
- jeder bestehende Test unter `test/` außer `test/own-ips-readers.test.ts`, und dort nur die zwei Zeilen der Ausnahmeliste; neu ist
  nur `test/own-ips-checked.test.ts`
- `goals/kanal/**`, die Goal-Datei von messung 12
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), die VM, ssh und jede Datei auf dem Server; Produktion weder
  lesend noch schreibend, kein Rollout
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Widerlegung geprüft: vierter Prüfbefehl von Punkt 1 an der Merge-Basis a127d5d gibt `exit 1 failed 1`, dort gibt `conway_own_list` bei einem `own_ips` mit Exit 1 die Rückgabe 0 und schreibt die Adresse in seine Datei; das Goal ist nicht widerlegt.
- 2026-11-16 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut (`own_ips_checked` in `ops/own-ips.sh`, die drei Werkzeuge rufen nur sie, `fetch_rows` in `ops/timeout-quote.sh` bricht selbst ab, die Datei hat 497 Zeilen, zwei Zeilen weniger in `READER_EXCEPTIONS`, neuer Test `test/own-ips-checked.test.ts` an der Merge-Basis mit 5 roten und 1 grünem Fall); `ops/README.md` nennt die Werkzeuge nicht und blieb unverändert. Prüfbefehle: P1 Kopfzeile 1, vitest Exit 0, Merge-Basis `exit 1 failed 1`, Merge-Basis conway `exit 1 failed 1`; P2 0, 0; P3 0, 2, 0, vitest Exit 0; P4 `kleiner`, `ok`, 0; P5 vitest Exit 0 (119 passed), Diff `test` 0; P6 `check` Exit 0 (2132 passed), gesperrte Pfade 0, `ops` 0.
- 2026-11-16 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6 (`dev` unverändert auf a127d5d, kein Merge nötig). Prüfbefehle am Kopf 75982c3: P1 Kopfzeile 1, vitest Exit 0, Merge-Basis `exit 1 failed 1`, Merge-Basis conway `exit 1 failed 1`; P2 0, 0; P3 0, 2, 0, vitest Exit 0; P4 `kleiner` (497 Zeilen), `ok`, 0; P5 vitest Exit 0 (119 passed), Diff `test` 0; P6 `check` Exit 0 (2132 passed), gesperrte Pfade 0, `ops` 0; `ops/own-ips.txt` unverändert.

## Blockers
- keine
