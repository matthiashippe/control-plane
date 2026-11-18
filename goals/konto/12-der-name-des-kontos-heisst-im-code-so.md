# Konto Goal 12: Der Name des Kontos heißt im Code so, und kein Browser überlebt einen Sepolia-Lauf

## Status
DONE

## Active Objective
Wer den Handoff liest oder ändert, verwechselt Konto und Automaton nicht, und kein Prüflauf lässt einen Browser auf dem code-host
zurück. Heute (beim Schreiben am 2026-11-18 am Code von `dev` 90e20f7 gelesen):

1. Der Handoff speichert den Namen, den seine Seite zeigt, in der Spalte `automaton_name` der Tabelle `handoffs` (`src/db.ts`) und im
   Feld `Handoff.automatonName` (`src/handoff/store.ts`). Beim Schritt `limit` ist das der Name des Kontos (`shownName =
   readAccountName(db, limit.account)` in `src/handoff/routes.ts`), und erst `accountNameOf` übersetzt das beim Rendern zurück
   (Grundregel 12: ein Name sagt, was er meint). `git grep -c -e automaton_name -e automatonName -- src/handoff` zählt
   `routes.ts:25` und `store.ts:7`; die Seiten unter `src/public/` tragen denselben Namen als Eigenschaft `automatonName`.
2. `launch` in `ops/browser.mjs` beendet den Browser nur über `close()`, und `close()` ist asynchron. Die drei Sepolia-Läufe unter
   `ops/konto/` rufen `browser?.close()` in ihrem `exit`-Handler ohne `await` (etwa `ops/konto/sepolia-run.mjs:137`), also kommt es
   nie zum `SIGKILL`, und ein Browser, der die Pipe nicht liest, überlebt Node.

Danach heißt die Spalte `display_name` (Migration in `src/db.ts`, eine Zeile aus dem bisherigen Schema liest sich danach unverändert),
das Feld und die Seiteneigenschaft `displayName`, `accountNameOf` entfällt, und `launch` beendet seinen Browser beim Ende von Node selbst
(`ROADMAP.md`, konto 12; Grundsatz in `docs/kette.md`, Abschnitt konto). Seiten und SOLL-Bilder ändern sich nicht.
Widerlegt, wenn `git grep -c automaton_name -- src/handoff` am Kopf von `dev` schon 0 zählt (er zählt 25 und 7).
Übernimmt goals/_vorschlaege/konto-kritik-2026-11-17-4.md und goals/_vorschlaege/konto-kritik-2026-11-17-8.md.
MVP: Funktion, weil ein Name, der je nach Schritt Konto oder Automaton meint, beim nächsten Goal am Handoff genau die Verwechslung
macht, die konto 06 und konto 10 auf der Seite zum Tageslimit beseitigt haben, und weil ein überlebender Browser auf dem geteilten
code-host Speicher hält, bis ihn ein Mensch findet.

## Voraussetzungen
- konto Goal 11 DONE

## Kontext für den Maker
- Ziel in einem Satz: Im Code steht beim Handoff der Name, den die Seite zeigt, unter einem Namen, der genau das sagt, und jeder Lauf,
  der einen Browser startet, nimmt ihn beim Ende mit.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte): zuerst die beiden neuen Testdateien bzw. Fälle (Punkt 2 und der
  neue `describe` aus Punkt 3) gegen den heutigen Stand, rot; dann Punkt 1, danach den Treiber (Punkt 3), dann Punkt 4 (die vier
  SOLL-Prüfungen), Punkt 5 und zuletzt Punkt 6. Je Punkt Commit und Push.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 12` in `goals/konto/ANNAHMEN.md`):
  1. Das Feld `automaton_name` im Body von `POST /v1/handoff` bleibt, wie es ist, weil es die öffentliche Schnittstelle ist, die
     `mcp/server.mjs` auf den Rechnern der Nutzer sendet, und eine Umbenennung jedes installierte Terminal bräche. `src/handoff/routes.ts`
     nennt es genau einmal, als `const NAME_FIELD = "automaton_name";` mit einer Zeile Kommentar dazu, und liest und erklärt es nur über
     diese Konstante (`body?.[NAME_FIELD]`, die Hilfetexte und das Beispiel per Template-String). Deshalb zählt
     `git grep -c -e automaton_name -e automatonName -- src/handoff` danach genau `src/handoff/routes.ts:1` statt der 0 aus der
     ROADMAP-Zeile. `mcp/server.mjs`, `docs/konto/handoff.md`, die Tests und `ops/` senden das Feld weiter unverändert.
  2. Spalte `display_name`, Feld `Handoff.displayName` und die Eigenschaft `displayName` der Seiten (`src/public/handoff.ts`,
     `src/public/konto.ts`, `src/public/money.ts`) statt `account_name`, weil derselbe Wert in den Schritten `confirm`, `konto`,
     `deposit` und `payout` der Name ist, den das Terminal schickt, und nur bei `limit` der Name des Kontos; `display_name` sagt für
     alle Schritte richtig, was er ist: der Name, den die Seite zeigt. Die Seite zum Tageslimit liest ihn als `h.displayName || null`.
  3. Migration: Die drei bestehenden Umbauten der Tabelle `handoffs` (konto 02, 03 und 05) bleiben Byte für Byte, weil sie ältere
     Schemata nachziehen und deren Spalte so heißt. Nach dem letzten Umbau folgt genau einmal `ALTER TABLE handoffs RENAME COLUMN
     automaton_name TO display_name`, nur wenn `PRAGMA table_info(handoffs)` noch `automaton_name` meldet (SQLite 3.49 in
     `better-sqlite3` kann das). Ob das `CREATE TABLE IF NOT EXISTS` einer frischen Datenbank gleich `display_name` anlegt oder über
     dieselbe Umbenennung geht, entscheidet der Maker; Punkt 1 prüft nur das Ergebnis.
  4. `launch` meldet sich beim Start mit `process.once("exit", …)` an, das den Browser mit `SIGKILL` beendet, solange er läuft, und
     meldet sich beim Ende des Browsers wieder ab (`process.off`), weil ein SOLL-Werkzeug je Bild einen Browser startet und sonst
     Listener ansammelt (`MaxListenersExceededWarning` ab elf). `close()` bleibt, wie es ist. Die Sepolia-Läufe unter `ops/konto/`
     ändern sich nicht, weil der Fix im Treiber alle drei abdeckt.
- Die Testdatei `test/handoff-display-name.test.ts` (neu) hat genau einen `describe("the name a handoff shows is display_name", …)`
  mit zwei Fällen und importiert aus `src/` nur `openDb` aus `src/db.ts`, weil Punkt 2 sie gegen die Merge-Basis fährt.
  Fall 1 `it("reads a row of the schema before konto 12 unchanged as display_name", …)`: legt in einer Datei unter einem
  `mktemp`-Ordner die Tabelle `handoffs` mit genau dem `CREATE TABLE` an, das der Umbau von konto 05 in `src/db.ts` am Kopf von
  `dev` schreibt (als Literal im Test), schreibt eine Zeile mit `automaton_name` „Atlas“ und Schritt `limit`, schließt, öffnet mit
  `openDb` und liest die Zeile: `display_name` ist „Atlas“, jede andere Spalte unverändert, und `PRAGMA table_info(handoffs)` kennt
  `automaton_name` nicht mehr. Fall 2 `it("creates a fresh database with display_name and without automaton_name", …)`.
- Der neue Fall in `test/browser.test.ts` steht in genau einem `describe.each(["picture", "passkey"])("launch ends its browser when
  node ends, kind %s", …)`: Ein nachgebauter Chrome (Shell-Skript mit `echo $$ > "$d/pid"` und `exec sleep 30`) läuft unter einem
  Kind-Prozess `node`, der `launch` aus `ops/browser.mjs` aufruft, auf die PID-Datei wartet, einen `exit`-Handler mit `browser.close()`
  ohne `await` setzt (wie die Sepolia-Läufe) und `process.exit(0)` ruft. Zwei Sekunden nach dem Ende des Kind-Prozesses meldet
  `process.kill(pid, 0)` `ESRCH`. Ein `afterEach` beendet einen übrig gebliebenen `sleep`, damit der rote Lauf vor dem Fix keinen
  Prozess zurücklässt. Kein Port, kein Netz.
- Kein Netz, kein fester Port. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und die SOLL-Werkzeuge im Vordergrund mit
  eigenem Timeout, neue Dateien vor dem lokalen `check` stagen.
- Rollout: `src/**` rollt mit dem nächsten fälligen Deploy aus, der Merge bekommt den üblichen Release-Auftrag; die Migration läuft
  beim Start, die Zeilen der Tabelle leben zehn Minuten.
- Nicht in diesem Goal: das Feld `automaton_name` der Schnittstelle, `mcp/server.mjs`, `ops/konto/**`, die SOLL-Werkzeuge und Bilder,
  `src/public/limit.ts`, jede andere Tabelle.

## Done Condition
- [x] Der Handoff speichert den gezeigten Namen in der Spalte `display_name` und im Feld `displayName`, die Seiten lesen ihn als
      `displayName`, `accountNameOf` ist weg, und `automaton_name` steht in `src/handoff` nur noch als Name des Felds der Schnittstelle.
      MVP: Funktion, weil an dieser Stelle die Widerlegung hängt: Der Name des Kontos darf im Handoff nicht mehr unter dem Namen des
      Automatons liegen (Vorschlag konto-kritik-2026-11-17-4).
      Prüfung: `git grep -c -e automaton_name -e automatonName -- src/handoff` muss genau `src/handoff/routes.ts:1` ausgeben.
      Prüfung: `git grep -c 'const NAME_FIELD = "automaton_name";' -- src/handoff/routes.ts` muss genau `src/handoff/routes.ts:1` ausgeben.
      Prüfung: `git grep -n automatonName -- src | wc -l` muss `0` ausgeben.
      Prüfung: `git grep -n accountNameOf -- src | wc -l` muss `0` ausgeben.
      Prüfung: `grep -cE 'display_name|displayName' src/handoff/store.ts` muss mindestens `3` ausgeben.
      Prüfung: `grep -c 'RENAME COLUMN automaton_name TO display_name' src/db.ts` muss genau `1` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node --import tsx -e 'import("./src/db.ts").then(({openDb})=>{const c=openDb(":memory:").prepare("PRAGMA table_info(handoffs)").all().map(x=>x.name);console.log(c.includes("display_name"),c.includes("automaton_name"))})'` muss genau `true false` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/handoff-display-name.test.ts test/automaton-name.test.ts test/handoff-page.test.ts test/handoff-api.test.ts test/handoff-events.test.ts test/konto-limit.test.ts test/konto-limit-account.test.ts test/konto-deposit.test.ts test/konto-payout.test.ts test/konto-signature-retry.test.ts test/konto-topup-period.test.ts test/mcp-automaton.test.ts test/mcp-money.test.ts` muss Exit-Code 0 haben.
- [x] Zwei Fälle in `test/handoff-display-name.test.ts` lesen eine Zeile aus dem bisherigen Schema unverändert als `display_name` und
      prüfen eine frische Datenbank; gegen den Stand der Merge-Basis sind beide rot.
      MVP: Funktion, weil die Migration auf der Datenbank zahlender Kunden läuft und erst der rote Lauf am alten Code zeigt, dass der
      Test die Umbenennung trifft.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/handoff-display-name.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("the name a handoff shows is display_name"));console.log(a.length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `exit=0` und `2 2` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp test/handoff-display-name.test.ts $T/test/; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/handoff-display-name.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.includes("the name a handoff shows is display_name"));console.log(a.filter(x=>x.status!=="passed").length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `2 0` ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("test/handoff-display-name.test.ts","utf8");const miss=["openDb","automaton_name","display_name","PRAGMA table_info(handoffs)","mkdtemp","\x27payout\x27"].filter(x=>!s.includes(x));if(/from "\.\.\/src\/(?!db)/.test(s))miss.push("import");if(miss.length){console.error(miss);process.exit(1)}console.log("faelle ok")'` muss `faelle ok` ausgeben.
- [x] `launch` in `ops/browser.mjs` beendet seinen Browser beim Ende von Node, auch wenn der Aufrufer `close()` nicht abwartet, und
      sammelt keine Listener an; vor dem Fix ist der neue Fall für beide Arten rot.
      MVP: Funktion, weil ein Browser, der einen Prüflauf überlebt, auf dem geteilten code-host Speicher hält und die Audits der Nacht
      bremst (Vorschlag konto-kritik-2026-11-17-8).
      Prüfung: `grep -c 'process.once("exit"' ops/browser.mjs` muss mindestens `1` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/browser.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.some(t=>t.startsWith("launch ends its browser when node ends")));console.log(a.length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `exit=0` und `2 2` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp test/browser.test.ts $T/test/; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/browser.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.ancestorTitles.some(t=>t.startsWith("launch ends its browser when node ends")));console.log(a.filter(x=>x.status!=="passed").length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `2 0` ausgeben.
      Prüfung: `T=$(mktemp -d); printf '#!/bin/sh\nexit 0\n' > $T/chrome; chmod +x $T/chrome; PATH=/usr/bin:$PATH node --input-type=module -e 'import { launch } from "./ops/browser.mjs"; const base = process.listenerCount("exit"); const all = []; for (let i = 0; i < 12; i++) all.push(launch(process.argv[1], process.argv[1] + "-p" + i, "passkey").send("Browser.getVersion").catch(() => {})); await Promise.all(all); await new Promise((r) => setTimeout(r, 300)); console.log("exit listeners", process.listenerCount("exit") - base);' $T/chrome` muss genau `exit listeners 0` ausgeben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- ops/konto && echo laeufe gleich` muss `laeufe gleich` ausgeben.
- [x] Seiten und SOLL-Bilder bleiben gleich: Die echten Seiten aller vier Strecken sind pixelgleich mit den Bildern, und weder Bilder
      noch SOLL-Werkzeuge ändern sich.
      MVP: Funktion, weil die Umbenennung nur den Code betrifft und der Kunde auf dem Handy nichts davon sehen darf.
      Prüfung: `git diff --quiet origin/dev...HEAD -- docs/soll 'ops/soll*.mjs' && echo bilder gleich` muss `bilder gleich` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live-handoff.mjs --out $T >/dev/null && PATH=/usr/bin:$PATH node ops/soll-handoff.mjs --check --source $T > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll handoff: 6 pictures, approve top 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live-konto.mjs --out $T >/dev/null && PATH=/usr/bin:$PATH node ops/soll-konto.mjs --check --source $T > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll konto: 4 pictures, passkey top 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live-limit.mjs --out $T >/dev/null && PATH=/usr/bin:$PATH node ops/soll-limit.mjs --check --source $T > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll limit: 4 pictures, approve top 390=[0-9]+ 1440=[0-9]+, limit top 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node --import tsx ops/soll-live-money.mjs --out $T >/dev/null && PATH=/usr/bin:$PATH node ops/soll-money.mjs --check --source $T > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll money: 16 images, blocks end 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
- [x] Die Entscheidungen stehen mit Grund in `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil die Linsen und die nächsten Goals der Kette gegen diese Annahmen prüfen, vor allem gegen die eine Stelle, an
      der `automaton_name` bleibt.
      Prüfung: `awk '/^## Goal 12/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens `4` ausgeben.
      Prüfung: `awk '/^## Goal 12/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE 'NAME_FIELD|mcp/server\.mjs'` muss mindestens `1` ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, Schnittstelle, Verträge und Sepolia-Läufe bleiben gleich, kein Test wird schwächer,
      kein neues Paket, kein Schlüssel im Diff, keine andere Goal-Datei geändert, und `check` ist grün.
      MVP: Funktion, weil `src/**` mit dem Merge ausrollt und zahlende Kunden den Stand tragen.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/handoff/(routes|store)\.ts|src/db\.ts|src/public/(handoff|konto|money)\.ts|ops/browser\.mjs|test/(handoff-display-name|browser|automaton-name|handoff-page|handoff-api|handoff-events|konto-limit|konto-limit-account|konto-deposit|konto-payout|konto-signature-retry|konto-topup-period|mcp-automaton|mcp-money)\.test\.ts|test/(money|handoff)-helpers\.ts|goals/konto/12-der-name-des-kontos-heisst-im-code-so\.md|goals/konto/verdicts/12-[A-Za-z0-9._-]+\.md|goals/konto/ANNAHMEN\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- mcp src/konto src/public/limit.ts src/public/konto-client docs && echo schnittstelle gleich` muss `schnittstelle gleich` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- package.json pnpm-lock.yaml && echo pakete gleich` muss `pakete gleich` ausgeben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' ':!goals/konto/12-der-name-des-kontos-heisst-im-code-so.md' && echo goals gleich` muss `goals gleich` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-12 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Im Handoff heißt der Name, den die Seite zeigt, überall `display_name` oder `displayName`, auch beim Schritt `limit`.
- [ ] Eine Datenbank vom Stand vor diesem Goal startet ohne Verlust, und das Terminal sendet `automaton_name` wie bisher.
- [ ] Ein Lauf, der einen Browser startet und endet, ohne ihn abzuwarten, lässt keinen Prozess zurück.
- [ ] Keine Seite und kein SOLL-Bild ändert sich.
- [ ] Kein Gedankenstrich, kein deutscher Bezeichner im Code.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.key`, `*.pem`
- `src/**` außer `src/handoff/routes.ts`, `src/handoff/store.ts`, `src/db.ts` (nur die Tabelle `handoffs`) und
  `src/public/{handoff,konto,money}.ts` (nur der Name der Eigenschaft), insbesondere `src/konto/**`, `src/public/limit.ts`,
  `src/public/konto-client/**`, `src/app.ts`
- das Feld `automaton_name` im Body von `POST /v1/handoff`, `mcp/**`, `docs/**`
- `ops/**` außer `ops/browser.mjs`, insbesondere `ops/konto/**`, `ops/soll*.mjs`, `ops/live.sh`; jedes Bild unter `docs/soll/`
- jede Transaktion auf einer echten Kette, jeder Aufruf bei Turnkey, Bridge oder einem RPC, jeder Lauf von `ops/konto/*.mjs`
- `ROADMAP.md`, `docs/kette.md`, alle Goal-Dateien außer dieser (eingefroren), jede Zeile einer `ANNAHMEN.md` außer `## Goal 12`
- ein neues Paket, ein Test, der gestrichen, übersprungen oder schwächer wird
- ein API-Schlüssel, ein privater Schlüssel, ein Testschlüssel als Literal, eine IBAN außer `EXAMPLE_IBAN` oder ein Name eines Kunden
  in Repo, Log, Ausgabe, Kommentar oder Fixture
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-18 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut: Spalte `display_name` per Umbenennung nach den Umbauten von konto 02 bis 05, `displayName` in Handoff und Seiten, `NAME_FIELD` als einzige Stelle von `automaton_name` in `src/handoff`, `launch` beendet laufende Browser über einen gemeinsamen `exit`-Listener. Prüfbefehle: Punkt 1 `routes.ts:1`, `routes.ts:1`, 0, 0, 7, 1, `true false`, 13 Testdateien Exit 0; Punkt 2 `exit=0` `2 2`, Merge-Basis `2 0`, `faelle ok`; Punkt 3 1, `exit=0` `2 2`, Merge-Basis `2 0`, `exit listeners 0` (Gegenprobe ohne `process.off`: `exit listeners 1`), `laeufe gleich`; Punkt 4 `bilder gleich`, handoff, konto, limit und money je `exit=0` und `1` mit 0 defects; Punkt 5 7 und 1; Punkt 6 0, `schnittstelle gleich`, 0, `pakete gleich`, `goals gleich`, 0, `check` Exit 0 (2396 Tests grün in 509 s), `check` am PR siehe Kommentar.
- 2026-11-18 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6; `dev` c54416a gemergt (nur `ROADMAP.md`, `STATE.md` und Goal-Dateien). Prüfbefehle am Merge d2a81a5: Punkt 1 `routes.ts:1`, `routes.ts:1`, 0, 0, 7, 1, `true false`, 13 Testdateien Exit 0 (125 Tests); Punkt 2 `exit=0` `2 2`, Merge-Basis c54416a `2 0`, `faelle ok`; Punkt 3 1, `exit=0` `2 2`, Merge-Basis `2 0`, `exit listeners 0`, `laeufe gleich`, kein `sleep` des nachgebauten Chrome übrig; Punkt 4 `bilder gleich`, handoff, konto, limit und money je `exit=0` und 0 defects; Punkt 5 7 und 1; Punkt 6 0, `schnittstelle gleich`, 0, `pakete gleich`, `goals gleich`, 0, `check` Exit 0 (2396 Tests in 223 Dateien, 374 s), Jobs `check` und `e2e` am PR siehe Kommentar.
- 2026-11-18 Release: PASS K und B (Zyklus 2), DONE.

## Blockers
