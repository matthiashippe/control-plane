# Konto Goal 07: Eine Regel für Beträge in USDC, und ihre Fehlerantworten sind getestet

## Status
ACTIVE

## Active Objective
Das Tageslimit eines zahlenden Kontos und der Betrag eines Handoffs nehmen nie verschiedene Beträge an, und eine Änderung an der
Regel wird in `check` rot. Heute ist `parseLimit` in `src/konto/limit.ts` eine Kopie von `parseUsdc` in `src/handoff/routes.ts` (beide
`n > 0n && n % 10_000n === 0n`), und kein Test prüft die Antworten 400 `invalid_limit` und 404 `no_account` von `/v1/konto/limit`;
eine Mutation an `parseLimit` bliebe grün. Danach lesen `/v1/konto/limit` und `POST /v1/handoff` Beträge in atomaren USDC über genau
eine Funktion, neue Fälle in `test/konto-limit.test.ts` prüfen die Fehlerantworten beider Wege, und jede der zwei Mutationen der einen
Regel (`% 10_000n` gestrichen, `> 0n` zu `>= 0n`) macht sie rot, belegt an einer Kopie im `mktemp`-Ordner (`ROADMAP.md`, konto 07;
Grundsatz in `docs/kette.md`, Abschnitt konto). Alle Antworten bleiben Wort für Wort, wie sie sind.
Widerlegt, wenn ein Test unter `test/` am Kopf von `dev` `invalid_limit` schon prüft (beim Schreiben am 2026-11-17 geprüft:
`git grep -n invalid_limit origin/dev -- test` gibt nichts aus).
Übernimmt goals/_vorschlaege/konto-nacharbeit-2026-11-17-1.md und goals/_vorschlaege/konto-nacharbeit-2026-11-17-2.md.
MVP: Funktion, weil ein falsch angenommener Betrag das Tageslimit eines zahlenden Kontos setzt und zwei Kopien derselben Regel bei
der nächsten Änderung auseinanderlaufen.

## Voraussetzungen
- konto Goal 06 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer in Claude Code ein Tageslimit senkt oder hebt, bekommt für denselben Betrag auf beiden Wegen dieselbe
  Antwort, und wer die Regel später ändert, sieht es an einem roten Test.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte): zuerst die neuen Fälle gegen den heutigen Stand (Punkt 2, sie sind
  dort grün, weil das Verhalten stimmt), dann die eine Funktion (Punkt 1), dann die Mutationen (Punkt 3), Annahmen (Punkt 4), zuletzt
  Punkt 5. Je Punkt Commit und Push.
- Entscheidungen des Tech Lead (Maker schreibt sie mit Grund unter `## Goal 07` in `goals/konto/ANNAHMEN.md`):
  1. Die eine Funktion heißt `parseUsdc` und liegt in einem neuen Modul `src/konto/usdc.ts`, mit dem heutigen Kommentar und Rumpf aus
     `src/handoff/routes.ts`. `src/handoff/routes.ts` und `src/konto/limit.ts` importieren sie; `parseLimit` gibt es danach nicht mehr,
     und `src/handoff/routes.ts` exportiert kein eigenes `parseUsdc` mehr. Grund für das eigene Modul: `src/handoff/routes.ts` importiert
     schon aus `src/konto/limit.ts`; ein Import in die Gegenrichtung wäre ein Kreis zwischen zwei Modulen mit Routen.
  2. Reihenfolge und Text der Prüfungen bleiben: `POST /v1/konto/limit` prüft den Betrag vor dem Konto (ein ungültiger Betrag ergibt
     400 `invalid_limit` auch ohne Konto), `POST /v1/handoff` prüft ihn vor Schlüssel und Konto (400 `invalid_handoff` mit der heutigen
     Meldung „Send JSON with automaton_name … a positive whole number of atomic USDC …“). Keine Meldung, kein Statuscode und kein
     Feld einer Antwort ändert sich (Punkt 1 prüft die Zeilen mit `message` im Diff).
  3. Die neuen Fälle stehen in `describe("the daily limit of an account")` von `test/konto-limit.test.ts` als drei eigene `it(...)`,
     deren Titel den Fehlercode nennen, weil Punkt 3 sie mit `-t` einzeln auswählt:
     - `it("answers 400 invalid_limit …")`: `"0"`, `"1.5"`, `"-10000"` und `"15000"` an `POST /v1/konto/limit` mit dem Schlüssel eines
       Kontos (Hilfsfunktionen `account` und `setLimit`), je Wert 400 und `error` gleich `invalid_limit`; danach liest
       `GET /v1/konto/limit` dasselbe `daily_limit_usdc` und `signed_limit_usdc` wie vorher, und `cap_usdc` in `konto_accounts` ist
       unverändert.
     - `it("answers 400 invalid_handoff …")`: dieselben vier Werte und dazu `"10005000"` (über dem unterschriebenen Limit von 5000000,
       aber kein Vielfaches von 10000) an `step: "limit"` von `POST /v1/handoff` mit demselben Schlüssel (Hilfsfunktion `raise`), je Wert
       400, `error` gleich `invalid_handoff` und `message` passend zu `/positive whole number of atomic USDC/`; danach ist die Zahl der
       Zeilen in `handoffs` unverändert und `GET /v1/konto/limit` liest das unveränderte Limit. Die Meldung gehört in den Test, weil
       `"0"` und `"15000"` unter dem heutigen Limit liegen und ohne die Regel trotzdem 400 `invalid_handoff` bekämen, nur mit der
       Meldung „has to be above today's“; erst die Meldung unterscheidet die beiden Ausgänge. `"10005000"` zeigt den gefährlichen Fall:
       Ohne `% 10_000n` entstünde ein Handoff über einen Betrag, der kein ganzer Cent ist.
     - `it("answers 404 no_account …")`: ein Schlüssel, dessen Konto gelöscht ist (wie in `test/konto-deposit.test.ts`:
       `DELETE FROM konto_accounts WHERE address = ?` nach `account(s)`), ergibt 404 mit `error` gleich `no_account` bei
       `GET /v1/konto/limit`, bei `POST /v1/konto/limit` mit `"1000000"` und bei `step: "limit"` mit `"10000000"`.
  4. Ein eigener Test für `src/konto/usdc.ts` ist erlaubt (`test/konto-usdc.test.ts`), aber nicht gefordert; die Mutationen aus
     Punkt 3 laufen gegen die drei Fälle oben, weil sie das Verhalten an den beiden Endpunkten beweisen.
- Die Fälle aus Punkt 2 sind am heutigen Stand grün, weil sie vorhandenes Verhalten festhalten. Statt „rot vor dem Fix“ beweist
  Punkt 3, dass sie rot werden, sobald die Regel sich ändert; die Zeile im Progress Log nennt je Mutation die roten Fälle.
- Prüfbefehle ohne Netz binden keinen festen Port (`app.request`, kein `serve`), Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. API-Schlüssel in Tests kommen aus dem
  Handoff der Testdatenbank und haben nie die Form `cnwy_k_` gefolgt von 16 festen Zeichen im Quelltext.
- Rollout: `src/**` liegt im Laufzeitpfad, der Merge rollt über `deploy.yml` mit dem nächsten fälligen Deploy aus. Die Antworten
  ändern sich nicht, deshalb gibt es keine Live-Prüfung über `check` und `e2e` hinaus.
- Nicht in diesem Goal: `parseUsd` (Dollar als Text) und die Umrechnungen mit `10_000n` in `mcp/server.mjs`, `src/konto/payout.ts`
  und `src/public/handoff.ts`; sie lesen ein anderes Format. `docs/konto/terminal.md` nennt beim Tool `set_daily_limit` noch das
  Argument `name` (ANNAHMEN.md, Goal 06); das bleibt ein eigener Vorschlag.
- Was danach kommt: konto 08 legt den Browser-Treiber der SOLL-Werkzeuge zusammen.

## Done Condition
- [x] Beträge in atomaren USDC liest genau eine Funktion `parseUsdc` in `src/konto/usdc.ts`, `/v1/konto/limit` und `POST /v1/handoff`
      importieren sie, und keine Antwort ändert sich.
      MVP: Funktion, weil das Tageslimit des Kontos und der Betrag des Handoffs sonst bei der nächsten Änderung verschiedene Beträge
      annehmen (Vorschlag konto-nacharbeit-2026-11-17-1).
      Prüfung: `git grep -c '10_000n === 0n' -- src` muss genau `src/konto/usdc.ts:1` ausgeben.
      Prüfung: `git grep -nE 'function parse(Usdc|Limit)\(' -- src | cut -d: -f1` muss genau `src/konto/usdc.ts` ausgeben.
      Prüfung: `grep -cE 'from "\./usdc\.js"' src/konto/limit.ts; grep -cE 'from "\.\./konto/usdc\.js"' src/handoff/routes.ts` muss zweimal mindestens `1` ausgeben.
      Prüfung: `git grep -n parseLimit -- src test | wc -l` muss `0` ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- src | grep -E '^[-+]' | grep -vE '^(\+\+\+|---) ' | grep -cE 'message|error: "|, (400|403|404|503)\)'` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-limit.test.ts test/konto-limit-account.test.ts test/konto-limit-period.test.ts test/konto-limit-switch.test.ts test/konto-client-limit.test.ts test/handoff-api.test.ts test/handoff-page.test.ts test/konto-account.test.ts test/konto-deposit.test.ts test/konto-payout.test.ts test/mcp-automaton.test.ts` muss Exit-Code 0 haben.
- [x] `test/konto-limit.test.ts` prüft 400 `invalid_limit` an `POST /v1/konto/limit`, 400 `invalid_handoff` mit der Meldung zum Format an
      `step: "limit"` von `POST /v1/handoff` und 404 `no_account` an allen drei Stellen, und das Limit bleibt danach unverändert.
      MVP: Funktion, weil ein falsch angenommener Betrag das Tageslimit eines zahlenden Kontos setzt und heute kein Test das bemerkt
      (Vorschlag konto-nacharbeit-2026-11-17-2).
      Prüfung: `for k in invalid_limit invalid_handoff no_account; do grep -cE "^\s*it\(\"[^\"]*\b$k\b" test/konto-limit.test.ts; done` muss dreimal genau `1` ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("test/konto-limit.test.ts","utf8");const miss=["\"0\"","\"1.5\"","\"-10000\"","\"15000\"","\"10005000\"","positive whole number of atomic USDC","DELETE FROM konto_accounts","invalid_limit","invalid_handoff","no_account"].filter(x=>!s.includes(x));if(miss.length){console.error(miss);process.exit(1)}console.log("faelle ok")'` muss `faelle ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-limit.test.ts -t 'invalid_limit|invalid_handoff|no_account' --reporter=verbose 2>&1 | grep -cE '✓.*(invalid_limit|invalid_handoff|no_account)'` muss `3` ausgeben.
- [x] Jede der zwei Mutationen der einen Regel macht die Fälle zu `invalid_limit` und `invalid_handoff` rot, belegt an einer Kopie im
      `mktemp`-Ordner; am unveränderten Stand sind sie grün.
      MVP: Funktion, weil erst die Mutation beweist, dass eine Änderung an der Regel in `check` rot wird, und das ist das Ziel dieses
      Goals.
      Prüfung: `for m in 's/ && n % 10_000n === 0n//' 's/n > 0n/n >= 0n/'; do T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp $T/src/konto/usdc.ts $T/orig; sed -i "$m" $T/src/konto/usdc.ts; cmp -s $T/orig $T/src/konto/usdc.ts && echo "sed-miss $m"; for k in invalid_limit invalid_handoff; do (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-limit.test.ts -t $k >/dev/null 2>&1); echo "$k=$?"; done; done` muss genau die vier Zeilen `invalid_limit=1`, `invalid_handoff=1`, `invalid_limit=1`, `invalid_handoff=1` ausgeben (je Mutation beide Fälle rot) und darf `sed-miss` nicht ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; for k in invalid_limit invalid_handoff no_account; do (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-limit.test.ts -t $k >/dev/null 2>&1); echo "$k=$?"; done` muss genau `invalid_limit=0`, `invalid_handoff=0` und `no_account=0` ausgeben.
- [x] Die Entscheidungen stehen mit Grund in `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil die Linsen und die nächsten Goals der Kette gegen diese Annahmen prüfen.
      Prüfung: `awk '/^## Goal 07/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens `3` ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, kein Test wird schwächer, kein neues Paket, kein Schlüssel im Diff, keine andere
      Goal-Datei geändert, und `check` ist grün.
      MVP: Funktion, weil der Merge über `deploy.yml` ausrollt und zahlende Kunden den Stand tragen.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/konto/(usdc|limit)\.ts|src/handoff/routes\.ts|test/konto-(limit|usdc)\.test\.ts|goals/konto/07-eine-regel-fuer-betraege-in-usdc\.md|goals/konto/verdicts/07-[A-Za-z0-9._-]+\.md|goals/konto/ANNAHMEN\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- package.json pnpm-lock.yaml && echo pakete gleich` muss `pakete gleich` ausgeben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' ':!goals/konto/07-eine-regel-fuer-betraege-in-usdc.md' && echo goals gleich` muss `goals gleich` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-07 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [ ] Der Fall zu `no_account` in `test/konto-limit.test.ts` prüft auch, dass `step: "limit"` mit einem Schlüssel ohne Konto keinen
      Handoff anlegt: Die Zahl der Zeilen in `handoffs` ist nach den drei Anfragen gleich wie davor.
      MVP: Funktion, weil Acceptance Criterion 3 „legt nie einen Handoff an“ auch für einen Schlüssel ohne Konto verlangt und heute nur
      der Fall zu `invalid_handoff` die Zeilen zählt; ein Handoff, der vor der Prüfung auf das Konto entsteht, bliebe grün (Kritik
      Tech Lead, 2026-11-17).
      Prüfung: `awk '/it\("answers 404 no_account/{f=1} f&&/^  }\);/{print; exit} f' test/konto-limit.test.ts | grep -c 'FROM handoffs'` muss mindestens `1` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-limit.test.ts -t no_account` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Für denselben Betrag geben `/v1/konto/limit` und `POST /v1/handoff` dieselbe Entscheidung, weil beide dieselbe Funktion fragen.
- [ ] Eine Änderung an der Regel für Beträge in USDC wird in `check` rot, an beiden Endpunkten.
- [ ] Ein ungültiger Betrag oder ein Schlüssel ohne Konto ändert nie das Tageslimit und legt nie einen Handoff an.
- [ ] Kein Gedankenstrich, kein deutscher Bezeichner im Code, keine Antwort ändert ihren Text.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.key`, `*.pem`
- `src/app.ts`, `src/db.ts`, `src/auth/**`, `src/payments/**`, `src/automaton/**`, `src/sandbox/**`, `src/public/**`, `mcp/**`, `ops/**`:
  dieses Goal nennt sie nicht zum Ändern; ihre Funktionen dürfen importiert werden
- jede Änderung an Meldung, Statuscode, Feld oder Reihenfolge der Prüfungen einer Antwort von `/v1/konto/limit` oder `/v1/handoff`
- `parseUsd`, `parseName` und die Umrechnungen mit `10_000n` in `mcp/server.mjs`, `src/konto/payout.ts` und `src/public/handoff.ts`
- `ROADMAP.md`, `docs/kette.md`, alle Goal-Dateien außer dieser (eingefroren), jede Zeile einer `ANNAHMEN.md` außer `## Goal 07`
- ein neues Paket, ein Test, der gestrichen, übersprungen oder schwächer wird
- jede Transaktion, jeder Aufruf bei Turnkey, Bridge oder einem RPC; ein Konto oder eine Erlaubnis eines echten Kunden
- ein API-Schlüssel, ein Testschlüssel oder ein Name eines Kunden in Repo, Log, Ausgabe, Kommentar oder Fixture
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-17 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: `parseUsdc` in `src/konto/usdc.ts`, `parseLimit` gestrichen, drei neue Fälle in `test/konto-limit.test.ts` (vor dem Umbau mit beiden Mutationen an den alten Kopien rot gesehen), Annahmen unter `## Goal 07`. Prüfbefehle: P1 `src/konto/usdc.ts:1`, `src/konto/usdc.ts`, `1`/`1`, `0`, `0`, 11 Dateien 103 Tests Exit 0; P2 `1`/`1`/`1`, `faelle ok`, `3`; P3 Mutationen `invalid_limit=1`, `invalid_handoff=1`, `invalid_limit=1`, `invalid_handoff=1` ohne `sed-miss`, unverändert `invalid_limit=0`, `invalid_handoff=0`, `no_account=0`; P4 `8`; P5 `0`, `0`, `pakete gleich`, `goals gleich`, `0`, `check` Exit 0 (215 Dateien, 2315 Tests), Job `check` am PR siehe Kommentar.
- 2026-11-17 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, nach Merge von `dev` (f53113e) in den Goal-Branch alle Prüfbefehle neu gefahren. Prüfbefehle: P1 `src/konto/usdc.ts:1`, `src/konto/usdc.ts`, `1`/`1`, `0`, `0`, 11 Dateien 103 Tests Exit 0; P2 `1`/`1`/`1`, `faelle ok`, `3`; P3 Mutationen `invalid_limit=1`, `invalid_handoff=1`, `invalid_limit=1`, `invalid_handoff=1` ohne `sed-miss`, unverändert `invalid_limit=0`, `invalid_handoff=0`, `no_account=0`; P4 `8`; P5 `0`, `0`, `pakete gleich`, `goals gleich`, `0`, `check` Exit 0 (215 Dateien, 2315 Tests), Jobs `check` und `e2e` am Kopf siehe Kommentar.

## Blockers
