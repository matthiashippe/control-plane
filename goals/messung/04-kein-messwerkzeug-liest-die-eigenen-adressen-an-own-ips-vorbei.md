# Messung Goal 04: Kein Messwerkzeug liest die eigenen Adressen an `own_ips` vorbei

## Status
ACTIVE

## Active Objective
Nach messung 03 lesen noch zwei Messwerkzeuge die Liste der eigenen Adressen direkt: `ops/timeout-quote.sh` (Zeile 46,
`OWN_FILE="${CP_OWN_IPS_FILE:-$ROOT/ops/own-ips.txt}"`) entscheidet damit, ob ein Aufruf in der Timeout-Quote als `own` oder
`foreign` zählt, und `ops/anzeigen-rechnung.py` (Zeile 42, `open("ops/own-ips.txt")`) zählt damit die fremden Adressen an der
Bezahlroute, den Nenner der Konversion; fehlt die Datei, rechnet es still mit einer leeren Liste weiter. Beide übersehen die live
gesehene Adresse und jede Adresse, die nur in `CP_OWN_IPS_SEEN` steht, und zählen eigene Anfragen damit als fremde. Nach diesem
Goal nehmen beide `own_ips` aus `ops/own-ips.sh`, brechen bei leerer oder fehlender Liste mit Exit 2 ab, und ein Test in `check`
erlaubt außer `ops/own-ips.sh` keiner Datei unter `ops/`, `own-ips.txt` außerhalb eines Kommentars zu nennen, damit kein neues
Werkzeug die Liste wieder an `own_ips` vorbei liest. Heute nennen sechs Zeilen sie so (Befehl unter Punkt 3), außer den zwei
Werkzeugen `ops/actions-log-addresses.sh:43` und drei Ausgabezeilen von `ops/traffic.sh`.
Widerlegt, wenn eine Adresse nur in der Datei aus `CP_OWN_IPS_SEEN` schon heute in `ops/timeout-quote.sh --join` als `own` zählt
(der Maker prüft das zuerst mit dem Log aus Punkt 1 und schreibt das Ergebnis in die erste Zeile des Progress Log).
MVP: Funktion, weil der Loop an der Quote je Herkunft und an der Konversion der Anzeigenrechnung über Modelle und Kanäle
entscheidet und kanal 05 ab dem 26.11.2026 eigene Wallets nach derselben Liste trennen soll; eine eigene Anfrage als fremde
verfälscht beide Zahlen zugunsten des Kanals.

## Voraussetzungen
- messung Goal 03 DONE

## Kontext für den Maker
- Ziel: Jede Zahl, die der Loop über fremde Anfragen nennt, kennt unsere eigenen Adressen nach derselben Regel (`own_ips`), und
  ein Werkzeug, das die Liste daran vorbei liest, macht `check` rot.
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 04; übernimmt `goals/_vorschlaege/messung-kritik-2026-11-14-1.md` (der Teil für
  `ops/landing-yield.sh` und `ops/github-yield.sh` ist mit messung 03 erledigt) und `goals/_vorschlaege/kanal-kritik-2026-11-14-1.md`
  (die Werkzeuge, auf die kanal 05 baut, nehmen `own_ips`; was kanal 05 selbst nimmt, schreibt der Tech Lead beim Start von kanal 05
  in `goals/kanal/ANNAHMEN.md`, nicht dieses Goal). Muster für `own_ips` sind messung 01 (`ops/claim-keyless.sh` Zeile 44 bis 47)
  und messung 03 (`ops/conway-arrivals.sh`).
- Annahme (Tech Lead, 14.11.2026): In beiden Werkzeugen gelten `CP_OWN_IPS` und `CP_OWN_IPS_FILE` so, wie `own_ips` sie liest:
  `CP_OWN_IPS_FILE` ist die Datei der Liste (Fixtures und Tests setzen sie), `CP_OWN_IPS` eine Liste von Adressen, die zusätzlich
  als eigene zählen. Das ist die Bedeutung, die `ops/timeout-quote.sh` für `CP_OWN_IPS_FILE` heute schon hat; die abweichende
  Bedeutung von `CP_OWN_IPS` als Datei in `ops/conway-arrivals.sh` (Vorschlag messung-kritik-2026-11-14-6) wird hier nicht
  übernommen und nicht geändert.
- Annahme (Tech Lead, 14.11.2026): Eine Liste ohne Adresse stoppt ein Werkzeug auch dann, wenn `ssh` eine live gesehene Adresse
  liefert und `CP_OWN_IPS_SEEN` Adressen nennt (Lehre aus der Kritik an messung 03): Geprüft wird die Datei aus `CP_OWN_IPS_FILE`
  (sonst der Standard, den `ops/own-ips.sh` beim Sourcen setzt) vor dem Aufruf von `own_ips`, auf mindestens eine Zeile ohne `#`
  mit einem ersten Feld; fehlt die Datei, nennt sie keine Adresse oder endet `own_ips` mit Fehler, endet das Werkzeug mit Exit 2
  und einer stderr-Zeile, die `own_ips` nennt, bevor es eine Zahl ausgibt. Die stderr von `own_ips` selbst wird verworfen, weil
  sie die live gesehene Adresse nennen kann (wie in messung 03).
- Annahme (Tech Lead, 14.11.2026): `ops/actions-log-addresses.sh` ruft `own_ips` nicht, sondern nimmt nur den Pfad der Liste aus
  `ops/own-ips.sh` (`source "$HERE/own-ips.sh"`, dann `OWN="$CP_OWN_IPS_FILE"`), weil es keine Kunden misst, sondern fremde
  Adressen in öffentlichen Logs zählt, wo eine übersehene eigene Adresse nur in die vorsichtige Richtung zählt, und weil sein Weg
  `--dir` ohne Netz laufen muss. Sein Verhalten bleibt byte-gleich; `test/actions-log-addresses.test.ts` bleibt unverändert grün.
- **`ops/timeout-quote.sh`.** Die Zeile `OWN_FILE=...` entfällt. Nur die Wege, die die Herkunft brauchen, holen die Liste: der
  Produktionslauf ohne Schalter und `--join`. Sie sourcen `ops/own-ips.sh`, prüfen die Datei wie oben, schreiben `own_ips` je
  Adresse eine Zeile in eine Datei aus `mktemp` und geben diese an den Zählkern, dessen Prüfung `if (!own.size)` bleibt. Der
  Produktionslauf ruft `own_ips` mit demselben `CP_HOST` und Schlüssel, mit denen er `ops/access-log.sh` ruft (aus `loop.env`);
  `--join` mit dem, was die Umgebung setzt. `--rows`, `--since-rollout`, `--compare`, `--compare-files` und `--selftest` rufen
  `own_ips` nie; der Zählkern behält seine Positionen in `process.argv` (`compare` liest Index 6 und 7), an der Stelle der Liste
  darf dort ein Platzhalter stehen. Der Selftest bleibt, wie er ist, und zählt weiter gegen seine gepflanzte `own.txt`. Kopfkommentar
  (Zeile 26) nennt `own_ips` statt der Datei; `-h` gibt weiter den ganzen Kopf aus (Bereich in `sed -n '2,41p'` mitziehen, wenn
  der Kopf länger wird).
- **`ops/anzeigen-rechnung.py`.** `adressen_an_der_bezahlroute` holt die eigenen Adressen über
  `bash -c 'source ops/own-ips.sh; own_ips'` (mit der Prüfung der Datei wie oben, im selben `bash -c` oder davor), aus dem
  Arbeitsverzeichnis wie heute `./ops/access-log.sh`. Endet das mit Fehler oder ohne Adresse, endet das Programm mit Exit 2 und
  einer stderr-Zeile, die `own_ips` nennt, ohne die Zeile `Adressen, die das Angebot ansahen`. `--selftest` ruft weder `own_ips`
  noch `./ops/access-log.sh`. Die feste Ausnahme `76.13.144.207` bleibt. `ops/check-all.sh` ruft das Programm weiter wie heute.
- **`ops/traffic.sh`.** Es nimmt `own_ips` schon (Zeile 204); nur die drei Ausgabezeilen 292, 831 und 934 nennen die Datei. Sie
  nennen danach `own_ips (ops/own-ips.sh)` statt `ops/own-ips.txt`, sonst ändert sich in `ops/traffic.sh` nichts.
- **Test in `check`.** `test/own-ips-readers.test.ts` liest ohne Netz und ohne `git` jede Datei unter `ops/` (rekursiv per
  `readdirSync`, ohne `ops/fixtures/`) mit Endung `.sh`, `.py`, `.cjs`, `.mjs`, `.js` oder `.ts` außer `ops/own-ips.sh` und meldet
  jede Zeile, deren erstes Zeichen nach Leerraum nicht `#`, `//`, `/*` oder `*` ist und die `own-ips.txt` mit dem Muster
  `(?<![\w-])own-ips\.txt` nennt (also nicht `known-ips.txt`). Fälle:
  - `it("no file under ops/ besides ops/own-ips.sh names own-ips.txt outside a comment")`: die Liste der Treffer ist leer, die
    Fehlermeldung nennt jeden Treffer als `<Datei>:<Zeile>`; vor dem Fix rot mit genau den sechs Treffern aus Punkt 3, die Zeile im
    Progress Log nennt sie.
  - `it("the matcher trips on a direct read and passes comments and known-ips.txt")`: der Matcher als Funktion im Test trifft
    `OWN_FILE="${CP_OWN_IPS_FILE:-$ROOT/ops/own-ips.txt}"`, `own = set(open("ops/own-ips.txt").read().split())` und
    `print("Ours are out: ops/own-ips.txt")` und trifft nicht `# default ops/own-ips.txt`, `  // ops/own-ips.txt`,
    `KNOWN="$ROOT/ops/known-ips.txt"` und `source "$HERE/own-ips.sh"`.
- **Test `test/timeout-quote-own-ips.test.ts`**, ohne Netz, ohne festen Port, nur Dokumentationsadressen, Muster wie
  `test/conway-arrivals.test.ts`, mit `import "./yield-between-tests"`, je Fall ein `mktemp`-Ordner `<tmp>`, der in `afterEach`
  mit `rmSync(<tmp>, { recursive: true, force: true })` verschwindet. Aufruf `bash ops/timeout-quote.sh --join <tmp>/caddy.jsonl
  <tmp>/rows.jsonl` mit `HOME=<tmp>`, `CP_OWN_IPS_FILE=<tmp>/own.txt`, `CP_OWN_IPS_SEEN=<tmp>/seen.txt`, ohne `CP_OWN_IPS` (aus der
  Umgebung gelöscht, außer im Fall unten), `PATH` mit einem nachgebauten `ssh` vorn, das jeden Aufruf an `<tmp>/ssh-calls` anhängt
  und bei `SSH_CLIENT` im letzten Argument `$FAKE_LIVE 40000 22` ausgibt, wenn `FAKE_LIVE` gesetzt ist, sonst mit 255 endet.
  `<tmp>/own.txt` ist `203.0.113.99 2026-11-01  planted own address`, `<tmp>/rows.jsonl` ist leer, `<tmp>/caddy.jsonl` hat zwei
  Zeilen in der Form der Funktion `line` im Selftest von `ops/timeout-quote.sh`: `POST /v1/chat/completions`, Status 200, Dauer
  2.0 s, am 2026-11-10, eine von `198.51.100.23`, eine von `192.0.2.50`. Fälle:
  - `it("an address only in CP_OWN_IPS_SEEN counts as own")`: `<tmp>/seen.txt` ist `198.51.100.23 2026-11-01`; die Ausgabe hat
    `| unattributed | all | own | 1 | 0 | 0.0 % |` und `| unattributed | all | foreign | 1 | 0 | 0.0 % |`; ohne `<tmp>/seen.txt`
    `| unattributed | all | foreign | 2 | 0 | 0.0 % |` und keine Zeile mit `| own |` (Gegenrichtung im selben Fall);
  - `it("the live address counts as own")`: kein `<tmp>/seen.txt`, `FAKE_LIVE=198.51.100.23`; `own` 1, `foreign` 1;
  - `it("an address in CP_OWN_IPS counts as own")`: `CP_OWN_IPS=192.0.2.50`; `own` 1, `foreign` 1;
  - `it("an address in the list file counts as own")`: `<tmp>/own.txt` nennt zusätzlich `198.51.100.23 2026-11-01`; `own` 1;
  - `it("stops with exit 2 when the own list names no address even with a live address and a seen address")`: `<tmp>/own.txt` nur
    `# no own address`, `FAKE_LIVE=198.51.100.23`, `<tmp>/seen.txt` ist `192.0.2.50 2026-11-01`; Exit 2, keine Zeile von stdout
    beginnt mit `|`, stderr nennt `own_ips`;
  - `it("stops with exit 2 when the own list is missing")`: `CP_OWN_IPS_FILE=<tmp>/missing.txt`; Exit 2, keine Zeile beginnt mit `|`;
  - `it("rows, compare-files and selftest never call ssh")`: `--rows <tmp>/rows.jsonl`, `--compare-files <tmp>/caddy.jsonl
    <tmp>/rows.jsonl` und `--selftest` mit dem nachgebauten `ssh`; `<tmp>/ssh-calls` fehlt danach oder ist leer;
  - in jedem Fall nennt keine Zeile von stdout oder stderr eine gepflanzte Adresse, und `<tmp>/own.txt` ist danach byte-gleich
    (sha256).
  Rot vor dem Fix sind die Fälle zu `CP_OWN_IPS_SEEN`, zur live gesehenen Adresse, zu `CP_OWN_IPS` und zur leeren Liste (heute
  nennt stderr dort nicht `own_ips`); die Zeile im Progress Log nennt das mit Zahl.
- **Test `test/anzeigen-rechnung-own-ips.test.ts`**, gleiche Regeln wie oben. Je Fall liegen in `<tmp>/ops/` Kopien von
  `ops/anzeigen-rechnung.py` und `ops/own-ips.sh` und ein nachgebautes, ausführbares `<tmp>/ops/access-log.sh`, das
  `<tmp>/access.log` ausgibt; Aufruf `python3 ops/anzeigen-rechnung.py` mit `cwd=<tmp>`, gleicher Umgebung wie oben und auf stdin
  `{"db":{"market":{"foreign_payers":1,"foreign_topup_mc":100000,"foreign_margin_mc":1000,"foreign_inference_mc":10000,"open_bounties":0}}}`.
  `<tmp>/access.log` hat je eine Zeile `{"request":{"client_ip":"<Adresse>","method":"GET","uri":"/pay/planted"},"status":200}`
  für `198.51.100.23`, `192.0.2.50` und `203.0.113.99`. Fälle:
  - `it("an address only in CP_OWN_IPS_SEEN is not counted at the payment route")`: `<tmp>/seen.txt` ist
    `198.51.100.23 2026-11-01`; stdout hat eine Zeile, die auf `Adressen, die das Angebot ansahen` und Leerraum `1` endet; ohne
    `<tmp>/seen.txt` `2` (Gegenrichtung im selben Fall);
  - `it("the live address is not counted at the payment route")`: `FAKE_LIVE=198.51.100.23`; `1`;
  - `it("stops with exit 2 when the own list names no address even with a live address and a seen address")`: `<tmp>/own.txt` nur
    `# no own address`, `FAKE_LIVE` und `<tmp>/seen.txt` wie im Fall von `ops/timeout-quote.sh`; Exit 2, stderr nennt `own_ips`,
    keine Zeile `Adressen, die das Angebot ansahen`;
  - `it("stops with exit 2 when the own list is missing")`: `CP_OWN_IPS_FILE=<tmp>/missing.txt`; ebenso;
  - in jedem Fall nennen stdout und stderr keine gepflanzte Adresse, und `<tmp>/own.txt` ist danach byte-gleich (sha256).
  Rot vor dem Fix sind alle vier Fälle (heute zählt es `198.51.100.23` als fremde und rechnet bei fehlender Liste mit einer leeren
  weiter).
- Kein Rollout. Kein Test, kein Selftest und kein Prüfbefehl ruft die VM oder ein Werkzeug ohne nachgebautes `ssh` auf; der
  Produktionslauf von `ops/timeout-quote.sh` und `ops/anzeigen-rechnung.py` ohne Fixtures läuft in diesem Goal nie. Produktion
  bleibt unberührt.
- Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout; neue Dateien vor `check` mit `git add` stagen. Kein `pkill -f`.

## Done Condition
- [x] `ops/timeout-quote.sh` nimmt die eigenen Adressen über `own_ips`, zählt die live gesehene Adresse, jede Adresse aus
      `CP_OWN_IPS_SEEN` und aus `CP_OWN_IPS` als `own`, bricht bei einer Liste ohne Adresse oder ohne Datei mit Exit 2 ab und ruft
      `ssh` nur im Produktionslauf und in `--join`.
      Prüfung: `grep -cE '^[^#]*(source|\.) .*own-ips\.sh' ops/timeout-quote.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '^[^#]*\bown_ips\b' ops/timeout-quote.sh` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/timeout-quote-own-ips.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "an address only in CP_OWN_IPS_SEEN counts as own|the live address counts as own|an address in CP_OWN_IPS counts as own|an address in the list file counts as own|stops with exit 2 when the own list names no address even with a live address and a seen address|stops with exit 2 when the own list is missing|rows, compare-files and selftest never call ssh" test/timeout-quote-own-ips.test.ts` muss mindestens 7 ausgeben.
      Prüfung: `bash ops/timeout-quote.sh --selftest | tail -1 | grep -c "^TIMEOUT QUOTE SELFTEST OK"` muss 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/timeout-quote-selftest.test.ts test/timeout-quote-compare.test.ts` muss Exit-Code 0 haben.
- [x] `ops/anzeigen-rechnung.py` zählt an der Bezahlroute nur Adressen, die `own_ips` nicht nennt, und endet bei einer Liste ohne
      Adresse oder ohne Datei mit Exit 2, statt mit einer leeren Liste weiterzurechnen.
      Prüfung: `grep -cE "own-ips\.sh.*own_ips" ops/anzeigen-rechnung.py` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/anzeigen-rechnung-own-ips.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "an address only in CP_OWN_IPS_SEEN is not counted at the payment route|the live address is not counted at the payment route|stops with exit 2 when the own list names no address even with a live address and a seen address|stops with exit 2 when the own list is missing" test/anzeigen-rechnung-own-ips.test.ts` muss mindestens 4 ausgeben.
      Prüfung: `T=$(mktemp -d); printf '#!/bin/sh\necho called >> %s/calls\nexit 255\n' "$T" > "$T/ssh"; chmod +x "$T/ssh"; PATH="$T:$PATH" python3 ops/anzeigen-rechnung.py --selftest | tail -1; cat "$T/calls" 2>/dev/null | wc -l` muss `ANZEIGEN SELFTEST OK` und danach 0 ausgeben.
- [x] Außer `ops/own-ips.sh` nennt keine Datei unter `ops/` die Liste `own-ips.txt` außerhalb eines Kommentars, und ein Test in
      `check` hält das fest.
      Prüfung: `git ls-files -co --exclude-standard ops | grep -vE '^ops/fixtures/|^ops/own-ips\.sh$' | grep -E '\.(sh|py|cjs|mjs|js|ts)$' | xargs grep -nP '^(?!\s*(#|//|/\*|\*)).*(?<![\w-])own-ips\.txt' | wc -l` muss 0 ausgeben (auf `origin/dev` heute 6: `ops/actions-log-addresses.sh:43`, `ops/anzeigen-rechnung.py:42`, `ops/timeout-quote.sh:46`, `ops/traffic.sh:292`, `:831`, `:934`).
      Prüfung: `pnpm -s vitest run test/own-ips-readers.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "no file under ops/ besides ops/own-ips.sh names own-ips.txt outside a comment|the matcher trips on a direct read and passes comments and known-ips.txt" test/own-ips-readers.test.ts` muss 2 ausgeben.
      Prüfung: `grep -cE '^[^#]*\bown_ips\b' ops/actions-log-addresses.sh` muss 0 ausgeben, und `pnpm -s vitest run test/actions-log-addresses.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- ops/traffic.sh | grep -cE '^[-+]([^-+]|$)'` muss 6 ausgeben.
- [x] `check` ist grün, gesperrte Pfade bleiben unverändert, unter `ops/` ändern sich nur die vier genannten Dateien, und `check`
      lässt die Liste der eigenen Adressen und das Zustandsverzeichnis unberührt.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE '^(\.github|deploy|src|harness|scripts|docs)/|^goals/kanal/|^ops/(fixtures/|own-ips\.(sh|txt)$|access-log\.sh$|conway|landing-yield\.sh$|github-yield\.sh$|claim-keyless\.sh$)|^test/(timeout-quote-(compare|selftest)|actions-log-addresses|conway-arrivals)\.test\.ts$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops | grep -vcE '^ops/(timeout-quote\.sh|anzeigen-rechnung\.py|actions-log-addresses\.sh|traffic\.sh)$'` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jeder neue Fall war vor dem Fix rot, soweit oben so genannt; die Zeile im Progress Log nennt, welche
      Fälle und womit.
- [ ] Keine Ausgabe der beiden Werkzeuge nennt eine Adresse.
- [ ] Kein bestehender Fall in `test/timeout-quote-selftest.test.ts`, `test/timeout-quote-compare.test.ts`,
      `test/actions-log-addresses.test.ts` oder in den Selftests verliert eine erwartete Zahl oder einen Exit-Code; diese Dateien
      bleiben unverändert.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/fixtures/**`, `ops/own-ips.txt`, `ops/own-ips.sh`, `ops/access-log.sh`, `docs/**`, `.env*`,
  `*.key`, `*.pem`
- jede andere Datei unter `ops/` außer `ops/timeout-quote.sh`, `ops/anzeigen-rechnung.py`, `ops/actions-log-addresses.sh` (nur der
  Pfad der Liste) und `ops/traffic.sh` (nur die drei Ausgabezeilen)
- `goals/kanal/**` (die Entscheidung für kanal 05 schreibt der Tech Lead bei dessen Start)
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`) und jede Datei auf dem Server; Produktion weder lesend noch
  schreibend, kein Rollout
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Zyklus 1: Punkte 1, 2, 3, 4 gebaut. Nicht widerlegt: vor dem Fix zählte `ops/timeout-quote.sh --join` eine Adresse nur aus `CP_OWN_IPS_SEEN` als `foreign` (Fall „an address only in CP_OWN_IPS_SEEN counts as own“ rot). `ops/timeout-quote.sh` holt die Liste nur in Produktionslauf und `--join` über `own_list` (sourct `ops/own-ips.sh`, prüft die Datei auf eine Adresse, ruft `own_ips` mit verworfener stderr und stdin aus `/dev/null`, Exit 2 sonst), die übrigen Wege geben einen Platzhalter an den Zählkern; `ops/anzeigen-rechnung.py` holt sie über `bash -c 'source ops/own-ips.sh && <Prüfung> && own_ips'` und endet mit Exit 2 vor der Zeile der Betrachter; `ops/actions-log-addresses.sh` nimmt nur den Pfad aus `ops/own-ips.sh`, `ops/traffic.sh` nennt `own_ips (ops/own-ips.sh)` in drei Ausgabezeilen. Rot vor dem Fix (Stand origin/dev, 11 von 13): timeout-quote-own-ips 6 von 7 (SEEN, live, CP_OWN_IPS, leere Liste, fehlende Liste, ssh-Fall, weil `--join` den nachgebauten `ssh` nicht erreichte; grün war nur der Fall der Listendatei), anzeigen-rechnung-own-ips 4 von 4, own-ips-readers der erste Fall mit genau den sechs Treffern `ops/actions-log-addresses.sh:43`, `ops/anzeigen-rechnung.py:42`, `ops/timeout-quote.sh:46`, `ops/traffic.sh:292`, `:831`, `:934`. Prüfbefehle (Node 22.23.4): P1 `1`, `5`, vitest Exit 0, `7`, `1`, vitest selftest und compare Exit 0; P2 `1`, vitest Exit 0, `4`, `ANZEIGEN SELFTEST OK` und `0`; P3 `0`, vitest Exit 0, `2`, `0` und vitest actions-log-addresses Exit 0, `6`; P4 `check` Exit 0 (grün in 175 s), `0`, `0`, `0`, `0`.

## Blockers
- keine
