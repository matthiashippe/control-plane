# Anmeldung Goal 02: Die Zählung der Anmeldungen wird nie still blind

## Status
ACTIVE

## Active Objective
`ops/keyless-mints.sh` (anmeldung 01) überspringt heute eine Zeile auf `POST /v1/auth/keyless` still, wenn es `ts` oder `status`
nicht lesen kann (`ops/keyless-mints.sh` Zeile 69 bis 73, `except Exception: continue`; ein fehlender `status` zählt sogar als
Status 0). Ändert sich das Zeitformat des Caddy-Logs, etwa auf `iso8601`, fällt jede Anfrage heraus, und das Werkzeug meldet eine
leere Tabelle mit Exit 0. Am 15.11.2026 am Kopf von `dev` (4031d19) nachgestellt: eine Zeile mit `"ts":"2026-11-11T12:00:00Z"`
und Status 429 ergibt Kopfzeile, Trennzeile, `own addresses left out: 0` und Exit 0. Genau diese Tabelle liest der Release Manager
in den 14 Tagen nach dem Rollout von anmeldung 01 als „keine Ablehnung eines Aufrufers ohne Crawler-Kennung“, also als Bestätigung
statt als Blindheit.
Nach diesem Goal zählt das Werkzeug solche Zeilen, statt sie zu überspringen, und endet, sobald eine da war, mit Exit 2, einer
Zeile auf stderr mit ihrer Zahl und ohne Tabelle auf stdout. Auf jedem Log, dessen Zeilen es heute lesen kann, bleibt die Ausgabe
byte-gleich.
Widerlegt, wenn `ops/keyless-mints.sh` am Kopf von `dev` bei einer Zeile mit `ts` als Text schon heute nicht mit Exit 0 endet.
MVP: Messung, weil die Zählung der Nachweis ist, dass die Tür für neue Kunden offen bleibt, und ein Nachweis, der still nichts
sieht, schlechter ist als keiner.

## Voraussetzungen
- anmeldung Goal 01 DONE

## Kontext für den Maker
- Ziel: Der Release Manager liest in den 14 Tagen nach dem Rollout von anmeldung 01 eine leere Tabelle nur dann als „keine
  Ablehnung“, wenn das Werkzeug jede Zeile auf `POST /v1/auth/keyless` lesen konnte; sonst sieht er Exit 2 und die Zahl.
- Herkunft: Zeile anmeldung in `ROADMAP.md`, Glied 02. Übernimmt `goals/_vorschlaege/anmeldung-kritik-2026-11-14-1.md` (Schwere 2,
  Beleg `ops/keyless-mints.sh:70`). Der Vorschlag `anmeldung-kritik-2026-11-14-2.md` (relativer Pfad bei `--file`) ist verworfen
  und gehört nicht in dieses Goal.
- Kein Rollout: `ops/` liegt nicht im Laufzeitpfad von `deploy.yml`, der Merge ändert nichts auf dem Server. Kein Teil von `src/`
  ändert sich.
- Annahme (Tech Lead, 15.11.2026): Unlesbar ist eine Zeile, die als JSON gelesen wird, deren `request.method` gleich `POST` ist und
  deren Pfad ohne Query gleich `/v1/auth/keyless` ist, und bei der `float(d["ts"])` scheitert (fehlt, Text wie
  `2026-11-11T12:00:00Z`, `null`) oder `status` fehlt oder `int(d["status"])` scheitert. Was heute gelesen wird, bleibt lesbar:
  `ts` als Zahl oder als Zahl in Anführungszeichen, `status` als Zahl oder als `"429"`. Zeilen, die kein JSON sind, und Zeilen auf
  anderen Pfaden oder mit anderer Methode überspringt das Werkzeug weiter still, weil es bei ihnen nicht weiß, ob sie eine
  Anmeldung sind, und weil `ops/access-log.sh` auch Zeilen ohne JSON liefern kann.
- Annahme (Tech Lead, 15.11.2026): Eine unlesbare Zeile zählt unabhängig von `--since` und `--until` und unabhängig von der Adresse,
  weil das Werkzeug ihren Tag nicht kennt und eine Blindheit nicht dadurch verschwinden darf, dass sie außerhalb des Fensters zu
  liegen scheint. Die Zahl der unlesbaren Zeilen ändert `own addresses left out` nicht.
- Annahme (Tech Lead, 15.11.2026): Bei mindestens einer unlesbaren Zeile gibt das Werkzeug auf stdout nichts aus (keine Kopfzeile,
  keine Zeile mit `|`, keine Zeile `own addresses left out`) und auf stderr genau eine Zeile
  `keyless-mints: <n> lines on POST /v1/auth/keyless could not be read (ts or status), so nothing is counted.` mit `<n>` als Zahl,
  auch bei `<n>` gleich 1, dann Exit 2. Das folgt dem Muster der Liste der eigenen Adressen in anmeldung 01: Eine unvollständige
  Tabelle darf nie als vollständige gelesen werden. Die Zeile nennt keine Adresse, keinen User-Agent und keinen Wert von `ts`. Der
  Weg dahin ist frei, etwa ein eigener Exit-Code des eingebetteten `python3`, den der Aufruf in Zeile 187 von „the access log could
  not be read“ unterscheidet; die Prüfung der eigenen Adressen bleibt vor dem Lesen des Logs, ihre Meldungen bleiben gleich.
- Unverändert bleiben `KIND_PY` und `--classify` (die Regel für Crawler, die `test/keyless-crawler.test.ts` gegen den Server hält),
  jede bestehende `check`-Zeile im Selbsttest und die Ausgabe auf jedem Log ohne unlesbare Zeile.
- **Selbsttest** `ops/keyless-mints.sh --selftest`: zusätzlich ein Lauf über ein zweites Log im selben `mktemp`-Ordner mit der
  lesbaren `node`-429 von `192.0.2.50` und einer Zeile auf `POST /v1/auth/keyless` mit `"ts":"2026-11-11T12:00:00Z"` von
  `192.0.2.53`; neue `check`-Zeilen verlangen Exit 2, keine Zeile von stdout mit `|`, stderr mit `1 lines on POST /v1/auth/keyless`,
  und keine gepflanzte Adresse auf stdout oder stderr. Der bestehende Lauf über das erste Log bleibt die Gegenrichtung (Exit 0).
  Letzte Zeile weiter `KEYLESS MINTS SELFTEST OK`, sonst `KEYLESS MINTS SELFTEST FAILED` und Exit 1.
- **Test `test/keyless-mints.test.ts`**: nur neue Fälle und, wenn nötig, neue Hilfsfunktionen; keine bestehende Zeile ändert sich
  (Punkt 3 prüft das). Neue Fälle mit `sandbox`, `run` und `expectNothingNamed` wie die bestehenden, Zeilen mit Text als `ts` oder
  ohne `status` direkt mit `JSON.stringify` gebaut, Adressen nur aus `PLANTED_ADDRESSES`:
  - `it("stops with exit 2 when a keyless line has a ts it cannot read")`: eine lesbare `429` mit User-Agent `node` von
    `192.0.2.50` am `DAY_11` und eine Zeile auf `POST /v1/auth/keyless` mit `"ts":"2026-11-11T12:00:00Z"`, Status 429, User-Agent
    `node` von `192.0.2.53`; Exit 2, keine Zeile von stdout beginnt mit `|`, stderr enthält die Zeile
    `keyless-mints: 1 lines on POST /v1/auth/keyless could not be read (ts or status), so nothing is counted.`. Vor dem Fix rot
    (heute Exit 0);
  - `it("stops with exit 2 when a keyless line has no status it can read")`: eine lesbare Zeile wie oben, eine Zeile auf
    `POST /v1/auth/keyless` ohne `status` von `192.0.2.54` und eine mit `"status":"n/a"` von `192.0.2.55`; Exit 2, stderr nennt
    `2 lines on POST /v1/auth/keyless`. Vor dem Fix rot (heute Exit 0 und eine Zeile mit Status 0);
  - `it("counts unreadable lines whatever days are asked for")`: `--since 2026-11-12 --until 2026-11-12`, eine lesbare `201` mit
    User-Agent `node/22.11.0` von `192.0.2.51` am `DAY_12` und die Zeile mit Text als `ts` von `192.0.2.53`; Exit 2, stderr nennt
    `1 lines on POST /v1/auth/keyless`. Vor dem Fix rot;
  - `it("unreadable lines elsewhere change nothing")`: die acht Zeilen des ersten Falls, dazu `GET /v1/auth/keyless` und
    `POST /v1/auth/nonce` je mit Text als `ts`, eine Zeile `POST /v1/auth/keyless-other` ohne `status`, eine Zeile `not json` und
    eine abgeschnittene Zeile `{"ts":`; Exit 0, `rows(stdout)` gleich den fünf Zeilen des ersten Falls in derselben Reihenfolge,
    stderr leer. Vor und nach dem Fix grün, er hält die Grenze der Annahme oben;
  - in jedem neuen Fall nennt keine Zeile von stdout oder stderr eine gepflanzte Adresse oder den Wortlaut eines gepflanzten
    User-Agents, und `<tmp>/own.txt` ist danach byte-gleich (sha256).
  Rot vor dem Fix sind die ersten drei neuen Fälle und der neue Lauf im Selbsttest; die Zeile im Progress Log nennt das mit Zahl.
- Produktion: Der Maker lässt `ops/keyless-mints.sh --since 2026-11-11` nach dem Fix einmal gegen die Produktion laufen, nur
  lesend wie in anmeldung 01, und schreibt nur Exit-Code und, bei Exit 2, die Zahl der unlesbaren Zeilen ins Progress Log, keine
  Adresse, keinen User-Agent. Endet der Lauf mit Exit 2, ist das kein Fehler des Goals, sondern ein Befund für den Release Manager,
  den die Zeile im Progress Log nennt. Kein Test und kein Prüfbefehl ruft die VM oder ein Werkzeug ohne nachgebautes `ssh` auf.
- Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich. Der Kopfkommentar von `ops/keyless-mints.sh`
  bekommt einen Satz zu Exit 2 bei unlesbaren Zeilen. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im
  Vordergrund mit eigenem Timeout. Kein `pkill -f`.

## Done Condition
- [x] Eine Zeile auf `POST /v1/auth/keyless`, deren `ts` oder `status` das Werkzeug nicht lesen kann, zählt, und das Werkzeug endet
      dann mit Exit 2, einer Zeile auf stderr mit ihrer Zahl und ohne Tabelle.
      Prüfung: `T=$(mktemp -d); mkdir "$T/bin"; printf '#!/bin/sh\nexit 255\n' > "$T/bin/ssh"; chmod +x "$T/bin/ssh"; echo '203.0.113.99 2026-11-01  planted own address' > "$T/own.txt"; echo '{"ts":"2026-11-11T12:00:00Z","request":{"client_ip":"192.0.2.50","method":"POST","uri":"/v1/auth/keyless","headers":{"User-Agent":["node"]}},"status":429}' > "$T/c.jsonl"; env -u CP_OWN_IPS PATH="$T/bin:$PATH" HOME="$T" CP_OWN_IPS_FILE="$T/own.txt" CP_OWN_IPS_SEEN="$T/seen.txt" bash ops/keyless-mints.sh --file "$T/c.jsonl" > "$T/out" 2> "$T/err"; echo "rc=$?"; grep -c '^|' "$T/out"; cat "$T/err"` muss `rc=2`, `0` und `keyless-mints: 1 lines on POST /v1/auth/keyless could not be read (ts or status), so nothing is counted.` ausgeben.
      Prüfung: `pnpm -s vitest run test/keyless-mints.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "stops with exit 2 when a keyless line has a ts it cannot read|stops with exit 2 when a keyless line has no status it can read|counts unreadable lines whatever days are asked for|unreadable lines elsewhere change nothing" test/keyless-mints.test.ts` muss mindestens 4 ausgeben.
- [x] Der Selbsttest beweist die neue Grenze in beide Richtungen und ruft kein echtes `ssh`.
      Prüfung: `T=$(mktemp -d); printf '#!/bin/sh\necho called >> %s/calls\nexit 255\n' "$T" > "$T/ssh"; chmod +x "$T/ssh"; PATH="$T:$PATH" bash ops/keyless-mints.sh --selftest | tail -1; cat "$T/calls" 2>/dev/null | wc -l` muss `KEYLESS MINTS SELFTEST OK` und danach 0 ausgeben.
      Prüfung: `grep -c '2026-11-11T12:00:00Z' ops/keyless-mints.sh` muss mindestens 1 ausgeben.
- [x] Auf allem, was das Werkzeug heute lesen kann, bleibt die Ausgabe gleich: bestehende Fälle, Selbsttest-Prüfungen und die
      Regel für Crawler sind unverändert.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- test/keyless-mints.test.ts | grep -cE '^-([^-]|$)'` muss 0 ausgeben.
      Prüfung: `grep -cE "counts keyless mints per day, caller and status|counts only POST /v1/auth/keyless|leaves out our own addresses from the list, the live address and CP_OWN_IPS_SEEN|stops with exit 2 when the own list names no address|stops with exit 2 when the own list is missing|the selftest passes and calls no real ssh" test/keyless-mints.test.ts` muss mindestens 6 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- ops/keyless-mints.sh | grep -cE '^-\s*check |^[-+].*(def kind|return "crawler"|return "node"|return "other"|"crawler", "bot", "indexer")'` muss 0 ausgeben.
      Prüfung: `printf 'ExampleCrawler/1.0 (+https://crawler.example/about)\nnode\nExampleBot/1.0\nMozilla/5.0 https://example.com\n' | bash ops/keyless-mints.sh --classify | tr '\n' ' '` muss `crawler node other other ` ausgeben.
      Prüfung: `pnpm -s vitest run test/keyless-crawler.test.ts test/claim-keyless-own-ips.test.ts` muss Exit-Code 0 haben.
- [x] `check` ist grün, nur die genannten Dateien ändern sich, und `check` lässt die Liste der eigenen Adressen und das
      Zustandsverzeichnis unberührt.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(ops/keyless-mints\.sh|test/keyless-mints\.test\.ts|goals/anmeldung/.+)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src | wc -l` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [x] Ein Log, das nicht gelesen werden kann, endet weiter mit Exit 2, leerem stdout und auf stderr genau der Zeile
      `keyless-mints: the access log could not be read, which is not a finding about traffic.`, auch wenn vor dem Abbruch eine
      unlesbare Zeile auf `POST /v1/auth/keyless` kam, und zwei neue Fälle in `test/keyless-mints.test.ts` halten das (Kritik
      Tech Lead, 15.11.2026). Heute hält kein Test diese Grenze: Ohne die Zeile `[[ ${ps[0]} -eq 0 ]] || exit 1` meldet das
      Werkzeug bei `ssh` mit Exit 255 eine leere Tabelle und Exit 0, und alle 10 Fälle und der Selbsttest bleiben grün. Fälle
      ohne `--file`, also über `ops/access-log.sh` und das nachgebaute `ssh`, nur neue Fälle und neue Hilfsfunktionen:
      `it("stops with exit 2 when the access log cannot be read")` mit dem `ssh` aus `sandbox`, das auf den Abruf des Logs mit
      Exit 255 endet, und `it("the access log wins over unreadable keyless lines")` mit einem `ssh`, das auf den Abruf des Logs
      eine Zeile auf `POST /v1/auth/keyless` mit `"ts":"2026-11-11T12:00:00Z"` von `192.0.2.53` ausgibt und dann mit Exit 255
      endet. Beide prüfen `expectNothingNamed` und `<tmp>/own.txt` byte-gleich. Die Zeile `[[ ${ps[0]} -eq 0 ]] || exit 1` in
      `ops/keyless-mints.sh` bleibt wörtlich, weil die dritte Prüfung sie herausnimmt.
      Prüfung: `grep -cE "stops with exit 2 when the access log cannot be read|the access log wins over unreadable keyless lines" test/keyless-mints.test.ts` muss mindestens 2 ausgeben.
      Prüfung: `pnpm -s vitest run test/keyless-mints.test.ts -t "access log"` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); cp ops/keyless-mints.sh "$T/km"; grep -vF '[[ ${ps[0]} -eq 0 ]] || exit 1' "$T/km" > ops/keyless-mints.sh; pnpm -s vitest run test/keyless-mints.test.ts -t "access log" >/dev/null 2>&1; echo "rc=$?"; cp "$T/km" ops/keyless-mints.sh; git status --porcelain -- ops/keyless-mints.sh | wc -l` muss `rc=1` und `0` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Fall und der neue Lauf im Selbsttest war vor dem Fix rot, soweit oben so genannt; die Zeile im Progress Log nennt,
      welche und womit.
- [ ] Eine Zeile im Progress Log nennt Exit-Code und, bei Exit 2, die Zahl der unlesbaren Zeilen des einen lesenden Laufs
      `ops/keyless-mints.sh --since 2026-11-11` gegen die Produktion, ohne Adresse und ohne Wortlaut eines User-Agents.
- [ ] Keine Ausgabe des Werkzeugs nennt eine Adresse, einen User-Agent oder einen Wert von `ts`.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`,
  `harness/**`, `deploy/**`, `docs/**`, `ops/fixtures/**`, `ops/own-ips.txt`, `ops/own-ips.sh`, `ops/access-log.sh`,
  `ops/claim-keyless.sh`, `.env*`, `*.key`, `*.pem`
- `src/**`; unter `ops/` alles außer `ops/keyless-mints.sh`
- jede bestehende Zeile von `test/keyless-mints.test.ts`; die Tests `test/keyless-crawler.test.ts`,
  `test/claim-keyless-own-ips.test.ts`, `test/keyless-agent.test.ts`, `test/goal-18-die-tuer.test.ts`, `test/keyless.test.ts`
- `goals/_vorschlaege/**`
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`) und jede Datei auf dem Server; Produktion nur lesend und nur
  für den einen Lauf des Werkzeugs, kein Rollout von Hand
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-15 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: `COUNT_PY` zählt Zeilen auf `POST /v1/auth/keyless` mit unlesbarem `ts` oder `status` (fehlender `status` zählt nicht mehr als 0) und endet mit eigenem Exit 3, den der Aufruf zu Exit 2 mit der einen Zeile auf stderr macht; ein unlesbares Log gewinnt weiter über die Zahl. Rot vor dem Fix: in `test/keyless-mints.test.ts` 3 von 4 neuen Fällen (ts als Text, kein lesbarer status, unabhängig von `--since`/`--until`, je Exit 0 statt 2), der vierte (Grenze) vor und nach dem Fix grün und rot unter der Mutation „unlesbares JSON zählt mit“; der Selbsttest mit dem neuen Lauf endet vor dem Fix mit 3 FAIL, `KEYLESS MINTS SELFTEST FAILED` und Exit 1. Produktion, nur lesend: `ops/keyless-mints.sh --since 2026-11-11` Exit 0, keine unlesbare Zeile. Prüfbefehle (Node 22.23.4): P1 `rc=2`, `0` und die Zeile mit `1 lines`, vitest Exit 0 (10 passed), `4`; P2 `KEYLESS MINTS SELFTEST OK` und `0`, `1`; P3 `0`, `6`, `0`, `crawler node other other `, vitest Exit 0; P4 `node scripts/check.mjs` Exit 0 (1845 passed, grün in 297 s), `0`, `0`, `0`, `0`.
- 2026-11-15 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4; `dev` ist schon im Branch (kein Merge nötig), alle Prüfbefehle am Kopf `0134c41` neu gelaufen. Prüfbefehle (Node 22.23.4): P1 `rc=2`, `0` und die Zeile mit `1 lines`, vitest Exit 0 (10 passed), `4`; P2 `KEYLESS MINTS SELFTEST OK` und `0`, `1`; P3 `0`, `6`, `0`, `crawler node other other `, vitest Exit 0; P4 `node scripts/check.mjs` Exit 0 (grün in 277 s), `0`, `0`, `0`, `0`; am PR #185 `check` pass und `e2e` pass am Kopf `0134c41`.
- 2026-11-15 Zyklus 3: Punkt 5 gebaut: zwei neue Fälle ohne `--file` in einem eigenen `describe` mit der Hilfsfunktion `sshPrintsThenFails` (das nachgebaute `ssh` gibt auf den Abruf des Logs die Zeile mit `ts` als Text gzip-gepackt aus und endet mit 255); `ops/keyless-mints.sh` ist unverändert. Rot: unter der Mutation ohne `[[ ${ps[0]} -eq 0 ]] || exit 1` scheitern beide Fälle (Exit 0 und leere Tabelle statt Exit 2), Gegenprobe: dasselbe `ssh` mit Exit 0 ergibt Exit 2 mit `1 lines on POST /v1/auth/keyless`, die Zeile kommt also wirklich durch. Prüfbefehle (Node 22.23.4): P5 `2`, vitest `-t "access log"` Exit 0, Mutation `rc=1` und `0`; P1 bis P3 `4`, `0`, `6`, Selbsttest `KEYLESS MINTS SELFTEST OK` und `0`, vitest Exit 0 (12 passed); P4 `node scripts/check.mjs` Exit 0 (grün in 262 s), fremde Dateien `0`, `src` `0`, `ops/own-ips.txt` `0`, Zustandsverzeichnis `0`.

## Blockers
- keine
