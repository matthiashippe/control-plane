# Konto Goal 10: Was das Terminal ans Konto schickt, wird streng gelesen

## Status
PLANNED

## Active Objective
Auf der Seite, auf der ein Mensch mit dem Passkey Geld freigibt, steht nur, was er selbst festgelegt hat, und ein Betrag kommt nie
gerundet an. Heute gibt es drei Lücken (beim Schreiben am 2026-11-17 am Code von `dev` 6b0002c gelesen):

1. Den Namen des Kontos, den die Seite des Schritts `limit` als „your account <Name>“ neben dem Passkey-Knopf zeigt
   (`src/public/limit.ts:40`, aus `readAccountName` in `src/konto/account.ts:95`), setzt das Terminal bei der Anlage selbst:
   `parseName` in `src/handoff/routes.ts:124` lässt für `POST /v1/handoff` jeden Text bis 64 Zeichen ohne Steuerzeichen zu. Ein
   gesteuertes Terminal kann also einmal einen Satz wie „Atlas. Only Atlas may spend this“ setzen, und der steht danach auf jeder
   Erhöhung.
2. `parseUsdc` in `src/konto/usdc.ts` ist richtig, aber kein Test hält die Typprüfung und die Grenze von 18 Ziffern fest: Streicht
   jemand `typeof v !== "string"`, nimmt `POST /v1/konto/limit` die JSON-Zahl `10000` an, und `9007199254740993` käme gerundet als
   `9007199254740992` an; `{1,18}` zu `{1,19}` bliebe ebenso grün.
3. `docs/konto/terminal.md:21` nennt bei `set_daily_limit` noch das Argument `name`, das das Schema in `mcp/server.mjs` mit
   `additionalProperties: false` ablehnt.

Danach nimmt `POST /v1/handoff` für die Schritte `konto` und `confirm` nur Namen aus Buchstaben, Ziffern, Leerzeichen, `-` und `_` mit
höchstens 32 Zeichen an (400 `invalid_handoff` mit Hinweis sonst), `readAccountName` zeigt einen Bestandsnamen nur bis zum ersten
anderen Zeichen, `test/konto-usdc.test.ts` hält `parseUsdc` mit einer Tabelle und einem Fall an `POST /v1/konto/limit` fest, beide
gegen zwei Mutationen belegt, und die Doku stimmt (`ROADMAP.md`, konto 10; Grundsatz in `docs/kette.md`, Abschnitt konto).
Widerlegt, wenn `POST /v1/handoff` mit `step: "konto"` am Kopf von `dev` einen Namen mit Punkt schon ablehnt (beim Schreiben am Code
geprüft: `parseName` prüft nur Länge und Steuerzeichen, der Punkt geht durch).
Übernimmt goals/_vorschlaege/konto-kritik-2026-11-17-3.md, goals/_vorschlaege/konto-kritik-2026-11-17-5.md und
goals/_vorschlaege/konto-kritik-2026-11-17-7.md.
MVP: Funktion, weil die Seite mit dem Passkey-Knopf die eine Stelle ist, an der ein Mensch Geld freigibt, und ein Satz des Terminals
dort wie eine Aussage von uns aussieht.

## Voraussetzungen
- konto Goal 09 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer auf dem Handy eine Erhöhung freigibt, liest dort nur den Namen, den er selbst bei der Anlage sah, und das
  Tageslimit ist genau der Betrag, den das Terminal geschickt hat.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte): zuerst die drei Fälle in `test/konto-limit-account.test.ts` gegen
  den heutigen Stand (Punkt 2, zwei rot), dann `src/konto/account.ts` und `src/handoff/routes.ts` (Punkt 1), dann
  `test/konto-usdc.test.ts` (Punkt 3), Doku und MCP (Punkt 4), Annahmen (Punkt 5), zuletzt Punkt 6. Je Punkt Commit und Push.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 10` in `goals/konto/ANNAHMEN.md`):
  1. Die Regel für Namen eines Kontos liegt in `src/konto/account.ts`, neben `readAccountName`, damit Eingang und Anzeige dieselbe
     Menge kennen: `export const ACCOUNT_NAME_MAX = 32;` und `export function parseAccountName(v: unknown): string | null`, die genau
     Texte nach `^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$` annimmt. Nur ASCII-Buchstaben, weil ein Name aus fremden Schriften auf der Seite
     wie ein anderer aussehen kann (`Аtlas` mit kyrillischem A); erstes Zeichen Buchstabe oder Ziffer wie bei `POST /v1/automatons`.
  2. `POST /v1/handoff` liest `automaton_name` für `konto` und `confirm` (auch ohne `step`) mit `parseAccountName`; `deposit` und
     `payout` (`moneyHandoff`) lesen weiter mit `parseName`, weil ihr Name kein Konto benennt und ein Automaton mit Punkt im Namen
     (`POST /v1/automatons` erlaubt ihn) sonst nicht mehr einzahlen könnte. Die Meldung bei 400 nennt die Regel in einem Satz, etwa
     `Send automaton_name: 1 to 32 letters, digits, spaces, underscores or hyphens, starting with a letter or digit.`; die Meldung bei
     `src/handoff/routes.ts:427` nennt dieselbe Zahl 32.
  3. `readAccountName` gibt von einem Bestandsnamen nur den längsten Anfang aus erlaubten Zeichen zurück, höchstens 32 Zeichen, ohne
     Leerzeichen am Ende, und `null`, wenn davon nichts bleibt oder das erste Zeichen kein Buchstabe und keine Ziffer ist: aus
     „Atlas. Only Atlas may spend this“ wird „Atlas“. Abschneiden am ersten fremden Zeichen statt Herausfiltern, weil Filtern aus dem
     Satz „Atlas Only Atlas may spend this“ machte und der Satz stehen bliebe. Die Datenbank bleibt unverändert, keine Migration.
  4. Das Schema von `start_automaton` in `mcp/server.mjs` folgt der Regel: `maxLength: 32`, `pattern: "^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$"`,
     die Beschreibung ohne Punkt; ebenso der Satz in `mcp/skills/automaton/SKILL.md`. Grund: `start_automaton` schickt `name` beim
     ersten Start als `automaton_name` mit `step: "konto"`, und ein Modell, das der heutigen Beschreibung folgt, wählte einen Namen
     mit Punkt und bekäme 400. `POST /v1/automatons` und seine Regel in `src/automaton/service.ts` bleiben, wie sie sind.
  5. `parseUsdc` und `src/konto/usdc.ts` ändern sich nicht; Punkt 3 sind nur Tests. Die Tabelle steht in genau einem
     `describe("parseUsdc", …)` mit mindestens den sechs Werten aus der ROADMAP (`10000` als JSON-Zahl, `"1" + "0".repeat(18)`,
     `" 10000"`, `"+10000"`, `"1e4"` je `null`, `"10000"` gleich `10000n`); der Fall an `POST /v1/konto/limit` steht außerhalb dieses
     `describe` als `it("answers 400 invalid_limit for daily_limit_usdc as the JSON number 10000", …)` und prüft, dass das Limit danach
     unverändert ist. Den Aufbau mit Konto (wie `setup` und `account` in `test/konto-limit.test.ts`) wählt der Maker.
- Die drei Fälle von Punkt 2 stehen in genau einem `describe("account names are read strictly", …)` in
  `test/konto-limit-account.test.ts` und importieren aus `src/` nur, was es am Kopf von `dev` schon gibt (also nicht
  `parseAccountName`), weil Punkt 2 sie gegen die Merge-Basis fährt:
  Fall 1 `it("refuses …")`: `POST /v1/handoff` mit `step: "konto"` und ohne `step` lehnt je „Atlas. Only Atlas“, „Atlas.v2“, „Ätlas“,
  „ Atlas“, „-Atlas“ und `"x".repeat(33)` mit 400 `invalid_handoff` ab, und keine Zeile in `handoffs` entsteht.
  Fall 2 `it("takes …")` (Wächter, grün vor und nach dem Fix): beide Schritte nehmen „Atlas v2_b-1“ und `"x".repeat(32)` mit 201 an.
  Fall 3 `it("shows a stored name only up to its first other character", …)`: ein Konto, dessen erster Schlüssel (`issueKey`) den
  Bestandsnamen „Atlas. Only Atlas may spend this“ trägt, zeigt auf beiden Seiten der Erhöhung (`pages`) „your account Atlas“ und
  weder „Only“ noch „Atlas.“; `readAccountName` gibt `"Atlas"` zurück.
- Der bestehende Fall in `test/handoff-api.test.ts` „refuses an empty name and one of 65 characters with 400, and takes one of 64“
  wird auf 33 und 32 umgestellt (Titel und Werte), weil `ATLAS` ohne `step` den Schritt `confirm` meint; er bleibt ein Fall mit
  mindestens so vielen `expect` wie heute.
- Das Layout der Seite ändert sich nicht: `src/public/limit.ts`, `docs/soll/` und die SOLL-Bilder des Schritts `limit` aus konto 06
  gelten weiter, `test/soll-limit.test.ts` bleibt grün.
- Kein Netz, kein fester Port: alles läuft über `handoffApp` mit der Kette `offline`. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen.
- Rollout: `src/**` rollt mit dem nächsten fälligen Deploy aus, der Merge bekommt den üblichen Release-Auftrag. Eine Live-Prüfung
  über `check` hinaus gibt es nicht.
- Nicht in diesem Goal: eine strengere Regel für `automaton_name` bei `deposit` und `payout` (Entscheidung 2), eine Änderung an
  `POST /v1/automatons`, `docs/errors.md` oder `docs/sandbox/automaton.md`, eine Migration bestehender Namen in `api_keys`.

## Done Condition
- [ ] `POST /v1/handoff` liest den Namen für `konto` und `confirm` mit `parseAccountName` aus `src/konto/account.ts`, `deposit` und
      `payout` weiter mit `parseName`, und `readAccountName` zeigt einen Bestandsnamen nur bis zum ersten anderen Zeichen.
      MVP: Funktion, weil sonst ein Satz des Terminals neben dem Passkey-Knopf steht (Vorschlag konto-kritik-2026-11-17-3).
      Prüfung: `grep -cE '^export function parseAccountName\(v: unknown\): string \| null' src/konto/account.ts` muss genau `1` ausgeben.
      Prüfung: `grep -cF '^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$' src/konto/account.ts` muss mindestens `1` ausgeben.
      Prüfung: `awk '/app.post\("\/v1\/handoff"/,/^  }\);/' src/handoff/routes.ts | grep -cE 'parseName\('` muss genau `0` ausgeben.
      Prüfung: `awk '/app.post\("\/v1\/handoff"/,/^  }\);/' src/handoff/routes.ts | grep -cE 'parseAccountName\('` muss mindestens `1` ausgeben.
      Prüfung: `awk '/const moneyHandoff/,/^  };/' src/handoff/routes.ts | grep -cE 'parseName\('` muss genau `1` ausgeben.
      Prüfung: `awk '/app.post\("\/v1\/handoff"/,/^  }\);/' src/handoff/routes.ts | grep -c '64'` muss genau `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-limit-account.test.ts test/handoff-api.test.ts test/handoff-page.test.ts test/konto-account.test.ts test/konto-limit.test.ts test/soll-limit.test.ts test/mcp.test.ts test/mcp-automaton.test.ts test/mcp-money.test.ts` muss Exit-Code 0 haben.
- [ ] Drei Fälle in `test/konto-limit-account.test.ts` decken abgelehnte Namen, angenommene Namen und einen Bestandsnamen mit Satz
      ab; gegen den Stand der Merge-Basis sind genau zwei rot.
      MVP: Funktion, weil erst der rote Lauf am alten Code zeigt, dass die Fälle den Fehler treffen, und der Wächter festhält, dass
      gültige Namen weiter durchgehen.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-limit-account.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("account names are read strictly"));console.log(a.length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `exit=0` und `3 3` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp test/konto-limit-account.test.ts test/handoff-helpers.ts $T/test/; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-limit-account.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("account names are read strictly"));console.log(a.filter(x=>x.status!=="passed").length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `2 1` ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("test/konto-limit-account.test.ts","utf8");const miss=["Atlas. Only Atlas","Atlas.v2","Ätlas","\" Atlas\"","-Atlas","repeat(33)","repeat(32)","Atlas v2_b-1","Atlas. Only Atlas may spend this","FROM handoffs"].filter(x=>!s.includes(x));if(miss.length){console.error(miss);process.exit(1)}console.log("faelle ok")'` muss `faelle ok` ausgeben.
- [ ] `test/konto-usdc.test.ts` hält `parseUsdc` mit einer Tabelle und einem Fall an `POST /v1/konto/limit` mit der JSON-Zahl `10000`
      fest, und jede der zwei Mutationen (Typprüfung gestrichen, `{1,18}` zu `{1,19}`) macht einen Fall rot, belegt an einer Kopie im
      `mktemp`-Ordner.
      MVP: Funktion, weil ein Tageslimit, das als Zahl gerundet ankommt, ein anderer Betrag ist als der gesendete, und heute `check`
      das nicht bemerkt (Vorschlag konto-kritik-2026-11-17-7).
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-usdc.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults);const p=a.filter(x=>x.ancestorTitles.includes("parseUsdc"));const j=a.filter(x=>x.title.includes("JSON number 10000"));console.log(p.length>=6, j.length, a.filter(x=>x.status!=="passed").length)' $T/r.json` muss genau `exit=0` und `true 1 0` ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("test/konto-usdc.test.ts","utf8");const miss=["\"1\" + \"0\".repeat(18)","\" 10000\"","\"+10000\"","\"1e4\"","\"10000\"","invalid_limit","/v1/konto/limit"].filter(x=>!s.includes(x));if(!/[^"0-9]10000[^"0-9n]/.test(s))miss.push("10000 als Zahl");if(miss.length){console.error(miss);process.exit(1)}console.log("werte ok")'` muss `werte ok` ausgeben.
      Prüfung: `for m in 's/typeof v !== "string" || //' 's/{1,18}/{1,19}/'; do T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp $T/src/konto/usdc.ts $T/orig; sed -i "$m" $T/src/konto/usdc.ts; cmp -s $T/orig $T/src/konto/usdc.ts && echo "sed-miss $m"; for k in parseUsdc 'JSON number 10000'; do (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-usdc.test.ts -t "$k" >/dev/null 2>&1); echo "$k=$?"; done; done` muss genau die vier Zeilen `parseUsdc=1`, `JSON number 10000=1`, `parseUsdc=1`, `JSON number 10000=0` ausgeben und darf `sed-miss` nicht ausgeben.
- [ ] Doku und MCP stimmen mit der Regel überein: `set_daily_limit` in `docs/konto/terminal.md` nennt nur `daily_limit_usd` und sagt,
      dass die Erhöhung auf dem Handy den Namen des Kontos zeigt; `docs/konto/handoff.md` nennt beide Regeln für `automaton_name`;
      `start_automaton` in `mcp/server.mjs` und `mcp/skills/automaton/SKILL.md` erlauben keinen Punkt mehr.
      MVP: Funktion, weil wer der Doku folgt, heute einen Schemafehler bekommt und ein Modell nach der heutigen Beschreibung einen
      Namen wählte, den der Server ablehnt (Vorschlag konto-kritik-2026-11-17-5).
      Prüfung: `grep -cE '^[|] .set_daily_limit. [|] .daily_limit_usd. [|]' docs/konto/terminal.md` muss genau `1` ausgeben.
      Prüfung: `grep -E '^[|] .set_daily_limit. [|]' docs/konto/terminal.md | grep -c 'Name des Kontos'` muss genau `1` ausgeben.
      Prüfung: `grep -E '^[|] .automaton_name. [|]' docs/konto/handoff.md | grep -cE '32.*64|64.*32'` muss genau `1` ausgeben.
      Prüfung: `awk '/name: "start_automaton"/,/required:/' mcp/server.mjs | grep -cF 'pattern: "^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$"'` muss genau `1` ausgeben.
      Prüfung: `awk '/name: "start_automaton"/,/required:/' mcp/server.mjs | grep -c 'maxLength: 32,'` muss genau `1` ausgeben.
      Prüfung: `awk '/name: "start_automaton"/,/required:/' mcp/server.mjs | grep -c 'maxLength: 64,'` muss genau `0` ausgeben.
      Prüfung: `cat mcp/server.mjs mcp/skills/automaton/SKILL.md | grep -c 'spaces, dots'` muss genau `0` ausgeben.
- [ ] Die Entscheidungen stehen mit Grund in `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil die Linsen und die nächsten Goals der Kette gegen diese Annahmen prüfen.
      Prüfung: `awk '/^## Goal 10/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens `4` ausgeben.
      Prüfung: `awk '/^## Goal 10/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE 'deposit.+payout.+parseName'` muss mindestens `1` ausgeben.
- [ ] Der Diff bleibt in den Pfaden dieses Goals, Seite, SOLL-Bilder und `parseUsdc` bleiben gleich, kein Test wird schwächer, kein
      neues Paket, kein Schlüssel im Diff, keine andere Goal-Datei geändert, und `check` ist grün.
      MVP: Funktion, weil `src/**` mit dem Merge ausrollt und zahlende Kunden den Stand tragen.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/konto/account\.ts|src/handoff/routes\.ts|test/(konto-limit-account|handoff-api|konto-usdc|konto-limit|konto-account|mcp|mcp-automaton|mcp-money)\.test\.ts|test/handoff-helpers\.ts|docs/konto/(terminal|handoff)\.md|mcp/server\.mjs|mcp/skills/automaton/SKILL\.md|goals/konto/10-was-das-terminal-ans-konto-schickt-wird-streng-gelesen\.md|goals/konto/verdicts/10-[A-Za-z0-9._-]+\.md|goals/konto/ANNAHMEN\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- src/konto/usdc.ts src/public docs/soll src/automaton && echo seite gleich` muss `seite gleich` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- package.json pnpm-lock.yaml && echo pakete gleich` muss `pakete gleich` ausgeben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' ':!goals/konto/10-was-das-terminal-ans-konto-schickt-wird-streng-gelesen.md' && echo goals gleich` muss `goals gleich` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-10 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Terminal kann bei der Anlage eines Kontos keinen Namen mit Punkt, Satzzeichen, fremder Schrift oder mehr als 32 Zeichen
      setzen, und die Antwort sagt, welche Namen gehen.
- [ ] Ein Konto mit einem alten Namen, der einen Satz enthält, zeigt auf der Seite der Erhöhung nur den Anfang bis zum ersten fremden
      Zeichen.
- [ ] Eine JSON-Zahl oder ein Betrag mit 19 Ziffern als Tageslimit ist 400, und `check` wird rot, wenn jemand das lockert.
- [ ] Layout der Seite, SOLL-Bilder und `POST /v1/automatons` bleiben unverändert.
- [ ] Kein Gedankenstrich, kein deutscher Bezeichner im Code.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.key`, `*.pem`
- `src/**` außer `src/konto/account.ts` und `src/handoff/routes.ts`, insbesondere `src/konto/usdc.ts`, `src/public/**`,
  `src/automaton/**`, `src/db.ts` und jede Migration
- `mcp/**` außer `mcp/server.mjs` (nur das Schema von `start_automaton`) und `mcp/skills/automaton/SKILL.md`; `ops/**`; `docs/**`
  außer `docs/konto/terminal.md` und `docs/konto/handoff.md`, insbesondere `docs/soll/**`
- jede Änderung an Layout oder Text der Seiten unter `/h/{code}` außer dem angezeigten Namen
- jede Transaktion, jeder Aufruf bei Turnkey, Bridge oder einem RPC, jeder Lauf von `ops/konto/*.mjs`
- `ROADMAP.md`, `docs/kette.md`, alle Goal-Dateien außer dieser (eingefroren), jede Zeile einer `ANNAHMEN.md` außer `## Goal 10`
- ein neues Paket, ein Test, der gestrichen, übersprungen oder schwächer wird
- ein API-Schlüssel, ein privater Schlüssel, ein Testschlüssel als Literal, eine IBAN außer `EXAMPLE_IBAN` oder ein Name eines Kunden
  in Repo, Log, Ausgabe, Kommentar oder Fixture
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
