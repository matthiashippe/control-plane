# Konto Goal 08: Ein Browser-Treiber für alle SOLL-Werkzeuge, und keines endet nach einem beendeten Browser grün

## Status
DONE

## Active Objective
Kein SOLL-Bild gilt als abgenommen, weil der Browser abgestürzt ist. Heute stehen `findChrome` und `launch` achtmal unter `ops/`: in
den fünf SOLL-Werkzeugen `ops/soll.mjs`, `ops/soll-handoff.mjs`, `ops/soll-konto.mjs`, `ops/soll-limit.mjs`, `ops/soll-money.mjs` und in
den drei Läufen auf Base Sepolia `ops/konto/sepolia-run.mjs`, `ops/konto/sepolia-limit-run.mjs`, `ops/konto/sepolia-payout-run.mjs`
(ROADMAP.md nennt sechs und vier; beim Schreiben am 2026-11-17 gezählt: `git grep -n -E '^function (findChrome|launch)' origin/dev -- ops`
gibt 16 Zeilen in acht Dateien aus). Die Sperre `if (gone) return fail(gone)` haben nur `ops/soll-handoff.mjs`, `ops/soll-limit.mjs` und
`ops/soll-money.mjs`. Ohne sie wartet ein Befehl an einen beendeten Browser ewig, die Ereignisschleife läuft leer, und Node endet mit
Exit 0 ohne eine Zeile: Mit einem Chrome, der sofort endet (`SOLL_CHROME` auf ein Skript `exit 0`), enden am Kopf von `dev`
`ops/soll.mjs --check` und `ops/soll-konto.mjs --check` nach 60 s mit Exit 0 und ohne Ausgabe, die drei anderen mit Exit 2 und
`browser exited` (beim Schreiben gemessen). Danach liegen Treiber und Sperre in genau einem Modul `ops/browser.mjs`, das alle acht
Dateien importieren, ein Test in `check` startet jedes der fünf SOLL-Werkzeuge mit einem solchen Chrome und verlangt Exit ungleich 0,
und die Ausgaben der Werkzeuge auf ihren bisherigen Quellen bleiben Zeile für Zeile gleich (`ROADMAP.md`, konto 08; Grundsatz in
`docs/kette.md`, Abschnitt konto).
Widerlegt, wenn `ops/soll.mjs` mit einem Chrome, der sofort endet, am Kopf von `dev` schon nicht mit Exit 0 endet (beim Schreiben am
2026-11-17 geprüft: Exit 0 nach 60 s, keine Zeile).
Übernimmt goals/_vorschlaege/konto-nacharbeit-2026-11-17-3.md.
MVP: Funktion, weil die SOLL-Bilder der Handy-Seite das Gate für jede sichtbare Änderung an Konto, Limit und Geld sind und ein grüner
Lauf ohne Bild eine Änderung an zahlende Kunden durchlässt, die niemand gesehen hat.

## Voraussetzungen
- konto Goal 07 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer ein SOLL-Werkzeug laufen lässt, bekommt nach einem abgestürzten Browser einen roten Lauf mit Grund statt
  eines stillen Exit 0, und eine Änderung am Treiber wirkt in allen acht Dateien zugleich.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte): zuerst `test/soll-browser-gone.test.ts` gegen den heutigen Stand
  (Punkt 2, rot für `ops/soll.mjs` und `ops/soll-konto.mjs`), dann `ops/browser.mjs` mit `test/browser.test.ts` (Punkt 1), dann die
  acht Dateien umstellen (Punkte 1 und 3), Mutation (Punkt 4), Annahmen (Punkt 5), zuletzt Punkt 6. Je Punkt Commit und Push.
- Entscheidungen des Tech Lead (Maker schreibt sie mit Grund unter `## Goal 08` in `goals/konto/ANNAHMEN.md`):
  1. Das Modul heißt `ops/browser.mjs` und exportiert genau drei Funktionen: `findChrome(kind)`, `chromeArgs(kind, profile)` und
     `launch(chrome, profile, kind)`. `kind` ist `"picture"` (die fünf SOLL-Werkzeuge) oder `"passkey"` (die drei Sepolia-Läufe); ein
     anderer Wert wirft. Grund für zwei Arten: Die Sepolia-Läufe brauchen das volle Chromium mit `--headless=new` für den virtuellen
     Authenticator und laden echte Seiten über das Netz, die SOLL-Werkzeuge die Headless Shell mit festen Schriften und ohne Netz.
  2. Verhalten je Art bleibt wie heute: `findChrome("picture")` nimmt zuerst `SOLL_CHROME`, dann die neueste
     `chromium_headless_shell-*`, dann das neueste `chromium-*` unter `~/.cache/ms-playwright`; `findChrome("passkey")` nimmt nur das
     neueste `chromium-*/chrome-linux64/chrome` und liest `SOLL_CHROME` nicht. `chromeArgs` gibt je Art genau die heutige Liste der
     Argumente zurück, in derselben Reihenfolge (Punkt 3 vergleicht sie mit dem Stand der Merge-Basis). `launch` schreibt bei
     `"picture"` die `fonts.conf` aus `FONTS_CONF` in `ops/soll-assess.mjs` neben das Profil und setzt `FONTCONFIG_FILE`, bei
     `"passkey"` nicht.
  3. `launch` hat für beide Arten die Sperre aus `ops/soll-handoff.mjs`: nach dem Ende des Browsers schlägt jeder offene und jeder neue
     Befehl sofort mit `browser exited: <letzte Zeile von stderr>` fehl, und `close` ist das heutige der SOLL-Werkzeuge (`Browser.close`,
     höchstens 3 s warten, dann `SIGKILL`). Die Sepolia-Läufe bekommen damit dasselbe `close`; ihr bisheriges sofortiges `SIGKILL` war
     nur die kürzere Kopie. Die Rückgabe bleibt `{ send, on, close }`.
  4. Jedes SOLL-Werkzeug behält sein eigenes `renderAt`, seine Meldungen, Exit-Codes und Zeitgrenzen; nur `findChrome` und `launch`
     ziehen um, der Aufruf wird `findChrome("picture")` und `launch(chrome, profile, "picture")`. Kopfkommentare, die auf den
     Browser-Teil einer anderen Datei verweisen („the browser part is the one of …“), nennen danach `ops/browser.mjs`.
  5. `test/soll-browser-gone.test.ts` importiert nichts aus `ops/` (sonst lässt er sich nicht gegen den alten Stand fahren):
     `describe.each(["soll.mjs", "soll-handoff.mjs", "soll-konto.mjs", "soll-limit.mjs", "soll-money.mjs"])("ops/%s", …)` mit genau einem
     `it(...)` je Werkzeug. Der nachgebaute Chrome ist ein Skript `#!/bin/sh` mit `exit 0` in einem `mkdtemp`-Ordner (Modus `0o755`),
     gestartet über `SOLL_CHROME`; das Werkzeug läuft mit `spawnSync(process.execPath, [<Werkzeug>, "--check"], { timeout: 20_000 })`,
     der Fall hat 30 s. Erwartet: `status` ist eine Zahl ungleich 0 (nicht `null`), stderr passt zu `/browser exited/`, und keine Zeile
     von stdout endet auf `, 0 defects`.
  6. `test/browser.test.ts` prüft `ops/browser.mjs` direkt: `findChrome` mit einem nachgebauten `~/.cache/ms-playwright` unter einem
     `HOME` im `mkdtemp`-Ordner (je Art die Wahl, dazu `SOLL_CHROME` nur bei `"picture"`), ein unbekanntes `kind` wirft, und `launch`
     mit dem Chrome aus Entscheidung 5: nach dem Ende des Browsers lehnt `send("Browser.getVersion")` binnen 2 s mit `/browser exited/`
     ab, für beide Arten.
- Kein fester Port, kein Netz: Beide Tests starten nur das Skript aus Entscheidung 5, nie ein echtes Chromium. Die Prüfbefehle der
  Punkte 3 und 4 mit echtem Chromium nehmen die Headless Shell unter `~/.cache/ms-playwright` des code-host, wie die Prüfbefehle der
  Goals davor. Die Sepolia-Läufe brauchen Netz und Zugänge bei Turnkey; sie laufen in diesem Goal nie, Punkt 3 prüft sie nur mit
  `node --check` und dem Vergleich der Argumente.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check`
  stagen.
- Rollout: `ops/**` steht unter `release.live` der Registrierung, der Merge bekommt deshalb den üblichen Release-Auftrag. Der Dienst
  ändert sich nicht, eine Live-Prüfung über `check` hinaus gibt es nicht.
- Nicht in diesem Goal: `renderAt` und die Prüfung der Seite in den fünf Werkzeugen (sie unterscheiden sich je Fläche), die Zeitgrenzen
  `within`, `summaryMoney` mit `images` statt `pictures` (`ops/soll-assess.mjs`) und die Werkzeuge `ops/soll-live*.mjs`, die keinen
  Browser starten.
- Was danach kommt: die Glieder, die `ROADMAP.md` in der Zeile konto danach nennt.

## Done Condition
- [x] `findChrome` und `launch` gibt es unter `ops/` nur noch in `ops/browser.mjs`, und alle acht Dateien importieren sie von dort.
      MVP: Funktion, weil acht Kopien schon auseinandergelaufen sind und die nächste Korrektur am Treiber sonst wieder nur einen Teil
      der Werkzeuge erreicht (Vorschlag konto-nacharbeit-2026-11-17-3).
      Prüfung: `git grep -c -E '^(export )?(async )?function (findChrome|launch)\b' -- ops` muss genau `ops/browser.mjs:2` ausgeben.
      Prüfung: `git grep -l -E '(function|const|let|var) (findChrome|launch)\b|spawn\(chrome' -- ops` muss genau `ops/browser.mjs` ausgeben.
      Prüfung: `for f in ops/soll.mjs ops/soll-handoff.mjs ops/soll-konto.mjs ops/soll-limit.mjs ops/soll-money.mjs ops/konto/sepolia-run.mjs ops/konto/sepolia-limit-run.mjs ops/konto/sepolia-payout-run.mjs; do grep -cE 'from "(\./|\.\./)browser\.mjs"' $f; done` muss achtmal genau `1` ausgeben.
      Prüfung: `git grep -c 'if (gone) return fail(gone)' -- ops` muss genau `ops/browser.mjs:1` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/browser.test.ts --reporter=verbose 2>&1 | grep -cE '✓'` muss mindestens `5` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/browser.test.ts` muss Exit-Code 0 haben.
- [x] Ein Test in `check` startet jedes der fünf SOLL-Werkzeuge mit einem Chrome, der sofort endet, und verlangt Exit ungleich 0 und
      keine Zeile mit `0 defects`; gegen den Stand der Merge-Basis ist er genau für `ops/soll.mjs` und `ops/soll-konto.mjs` rot.
      MVP: Funktion, weil ein stiller Exit 0 ohne Bild heute als abgenommenes SOLL-Bild durchgeht.
      Prüfung: `grep -cE '^\s*(it|test)\(' test/soll-browser-gone.test.ts` muss genau `1` ausgeben.
      Prüfung: `grep -cE 'from "\.\./ops/' test/soll-browser-gone.test.ts` muss genau `0` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH pnpm -s vitest run test/soll-browser-gone.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1; echo "exit=$?"; node -e 'const r=require(process.argv[1]);const a=r.testResults.flatMap(f=>f.assertionResults);console.log(a.length, a.filter(x=>x.status==="passed").length)' $T/r.json` muss genau `exit=0` und `5 5` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp test/soll-browser-gone.test.ts $T/test/; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/soll-browser-gone.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); node -e 'const r=require(process.argv[1]);console.log(r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.status!=="passed").map(x=>x.ancestorTitles.join(" ")).sort().join(" "))' $T/r.json` muss genau `ops/soll-konto.mjs ops/soll.mjs` ausgeben.
- [x] Die Werkzeuge verhalten sich auf ihren bisherigen Quellen wie vorher: dieselben Argumente für Chrome je Art, dieselben letzten
      Zeilen der fünf SOLL-Werkzeuge mit `--check`, und die drei Sepolia-Läufe sind gültiges JavaScript.
      MVP: Funktion, weil die abgenommenen Bilder unter `docs/soll/` an genau diesen Argumenten und Schriften hängen und ein anderer
      Render jedes Bild rot machte.
      Prüfung: `B=$(git merge-base origin/dev HEAD); node -e 'const {execSync}=require("child_process");const {pathToFileURL}=require("url");const old=(f)=>JSON.stringify(Function("profile","return ["+execSync("git show "+process.argv[1]+":"+f,{encoding:"utf8"}).match(/spawn\(chrome, \[([\s\S]*?)\], \{/)[1]+"]")("/p"));import(pathToFileURL(require("path").resolve("ops/browser.mjs")).href).then((m)=>{const P=["ops/soll.mjs","ops/soll-handoff.mjs","ops/soll-konto.mjs","ops/soll-limit.mjs","ops/soll-money.mjs"].map(old),K=["ops/konto/sepolia-run.mjs","ops/konto/sepolia-limit-run.mjs","ops/konto/sepolia-payout-run.mjs"].map(old);const ok=P.every((x)=>x===JSON.stringify(m.chromeArgs("picture","/p")))&&K.every((x)=>x===JSON.stringify(m.chromeArgs("passkey","/p")));console.log(ok?"argumente gleich":"argumente anders")})' $B` muss genau `argumente gleich` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node ops/soll.mjs --check > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll: 2 pictures, move top 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node ops/soll-handoff.mjs --check > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll handoff: 6 pictures, approve top 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node ops/soll-konto.mjs --check > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll konto: 4 pictures, passkey top 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node ops/soll-limit.mjs --check > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll limit: 4 pictures, approve top 390=[0-9]+ 1440=[0-9]+, limit top 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node ops/soll-money.mjs --check > $T/o 2>&1; echo "exit=$?"; tail -n 1 $T/o | grep -cE '^soll money: 14 images, blocks end 390=[0-9]+ 1440=[0-9]+, 0 defects$'` muss genau die zwei Zeilen `exit=0` und `1` ausgeben.
      Prüfung: `for f in ops/browser.mjs ops/konto/sepolia-run.mjs ops/konto/sepolia-limit-run.mjs ops/konto/sepolia-payout-run.mjs; do node --check $f && echo ok; done | grep -c '^ok$'` muss `4` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/soll-flags.test.ts test/soll.test.ts test/soll-handoff.test.ts test/soll-konto.test.ts test/soll-limit.test.ts test/soll-money.test.ts test/soll-fonts.test.ts` muss Exit-Code 0 haben.
- [x] Ohne die Sperre in `ops/browser.mjs` wird der Test aus Punkt 2 für alle fünf Werkzeuge rot, belegt an einer Kopie im
      `mktemp`-Ordner.
      MVP: Funktion, weil erst die Mutation beweist, dass die eine Sperre alle fünf Werkzeuge schützt und keine eigene Kopie mehr übrig ist.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp $T/ops/browser.mjs $T/orig; sed -i '/if (gone) return fail(gone)/d' $T/ops/browser.mjs; cmp -s $T/orig $T/ops/browser.mjs && echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/soll-browser-gone.test.ts --reporter=json --outputFile=r.json >/dev/null 2>&1); node -e 'const r=require(process.argv[1]);console.log(r.testResults.flatMap(f=>f.assertionResults).filter(x=>x.status!=="passed").length)' $T/r.json` muss genau `5` ausgeben und darf `sed-miss` nicht ausgeben.
- [x] Die Entscheidungen stehen mit Grund in `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil die Linsen und die nächsten Goals der Kette gegen diese Annahmen prüfen.
      Prüfung: `awk '/^## Goal 08/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens `4` ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, `ops/` wird kürzer, kein Test wird schwächer, kein neues Paket, kein Schlüssel im
      Diff, keine andere Goal-Datei geändert, und `check` ist grün.
      MVP: Funktion, weil `ops/**` mit dem Merge ausrollt und die SOLL-Werkzeuge das Gate jeder sichtbaren Änderung sind.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(ops/(browser|soll|soll-handoff|soll-konto|soll-limit|soll-money)\.mjs|ops/konto/sepolia-(run|limit-run|payout-run)\.mjs|test/(browser|soll-browser-gone)\.test\.ts|goals/konto/08-ein-browser-treiber-fuer-alle-soll-werkzeuge\.md|goals/konto/verdicts/08-[A-Za-z0-9._-]+\.md|goals/konto/ANNAHMEN\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --numstat origin/dev...HEAD -- ops | awk '{a+=$1; d+=$2} END {print (d > a) ? "kuerzer" : "nicht kuerzer"}'` muss `kuerzer` ausgeben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- docs/soll ops/soll-assess.mjs 'ops/soll-live*.mjs' && echo bilder gleich` muss `bilder gleich` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- package.json pnpm-lock.yaml && echo pakete gleich` muss `pakete gleich` ausgeben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' ':!goals/konto/08-ein-browser-treiber-fuer-alle-soll-werkzeuge.md' && echo goals gleich` muss `goals gleich` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-08 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein SOLL-Werkzeug, dessen Browser endet, endet mit Exit ungleich 0 und nennt den Grund; keines meldet danach `0 defects`.
- [ ] Treiber und Sperre stehen an genau einer Stelle, und alle acht Dateien, die einen Browser starten, nutzen sie.
- [ ] Die abgenommenen Bilder und die Ausgaben der SOLL-Werkzeuge bleiben unverändert.
- [ ] Kein Gedankenstrich, kein deutscher Bezeichner im Code.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.key`, `*.pem`
- `src/**`, `mcp/**`, `docs/soll/**` (Bilder und Quellen), `ops/soll-assess.mjs`, `ops/soll-live*.mjs`, `ops/konto/testkey.mjs` und jede
  andere Datei unter `ops/`, die dieses Goal nicht nennt
- jede Änderung an Meldung, Exit-Code, Zeitgrenze oder Ausgabezeile eines SOLL-Werkzeugs, außer dass ein Lauf nach dem Ende des
  Browsers nicht mehr mit Exit 0 endet
- jede Änderung an den Argumenten, mit denen Chrome startet, und an der Wahl des Browsers je Art
- ein Lauf von `ops/konto/sepolia-*.mjs`, jede Transaktion, jeder Aufruf bei Turnkey, Bridge oder einem RPC
- `ROADMAP.md`, `docs/kette.md`, alle Goal-Dateien außer dieser (eingefroren), jede Zeile einer `ANNAHMEN.md` außer `## Goal 08`
- ein neues Paket, ein Test, der gestrichen, übersprungen oder schwächer wird
- ein API-Schlüssel, ein Testschlüssel oder ein Name eines Kunden in Repo, Log, Ausgabe, Kommentar oder Fixture
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-17 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut: `ops/browser.mjs` mit `findChrome`, `chromeArgs` und `launch` samt Sperre für die Arten `picture` und `passkey`, die acht Werkzeuge importieren es, `test/browser.test.ts` (an einer Kopie ohne Sperre rot: `2 failed | 8 passed`) und `test/soll-browser-gone.test.ts` (gegen die Merge-Basis rot für `ops/soll.mjs` und `ops/soll-konto.mjs`), Annahmen unter `## Goal 08`, Vorschlag `konto-nacharbeit-2026-11-17-5` zu `test/soll-fonts.test.ts`. Prüfbefehle: P1 `ops/browser.mjs:2`, `ops/browser.mjs`, achtmal `1`, `ops/browser.mjs:1`, `10`, Exit 0; P2 `1`, `0`, `exit=0` und `5 5`, `ops/soll-konto.mjs ops/soll.mjs`; P3 `argumente gleich` (Gegenprobe ohne `--mute-audio`: `argumente anders`), fünfmal `exit=0` und `1`, `4`, 7 Dateien 56 Tests Exit 0; P4 `5` ohne `sed-miss`; P5 `7`; P6 `0`, `kuerzer` (142 dazu, 415 weg), `bilder gleich`, `0`, `pakete gleich`, `goals gleich`, `0`, `check` Exit 0 (217 Dateien, 2330 Tests), Job `check` am PR #257 `1`.
- 2026-11-17 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, nach dem Merge von `origin/dev` (187ac7a, nur `deploy/docker-compose.prod.yml`) in den Goal-Branch. Prüfbefehle: P1 `ops/browser.mjs:2`, `ops/browser.mjs`, achtmal `1`, `ops/browser.mjs:1`, `10`, Exit 0; P2 `1`, `0`, `exit=0` und `5 5`, `ops/soll-konto.mjs ops/soll.mjs`; P3 `argumente gleich`, fünfmal `exit=0` und `1`, `4`, 56 Tests Exit 0; P4 `5` ohne `sed-miss`; P5 `7`; P6 `0`, `kuerzer`, `bilder gleich`, `0`, `pakete gleich`, `goals gleich`, `0`, `check` Exit 0 (217 Dateien, 2330 Tests), Job `check` am PR #257 nach dem Push.
- 2026-11-17 Release: PASS K und B (Zyklus 2), DONE.

## Blockers
