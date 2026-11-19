# Umzug Goal 05: Der Selbsttest der Website-DNS räumt sein Verzeichnis weg

## Status
PLANNED

## Active Objective
`test/site-dns-selftest.test.ts` legt je Lauf mit `mkdtempSync` ein leeres `HOME` unter dem Temp-Verzeichnis an und löscht es nie,
also hinterlässt jeder `check` lokal, in CI und auf dem geteilten code-host ein Verzeichnis `site-dns-*`. Danach löscht der Test das
Verzeichnis nach `close` des Kindprozesses mit `rmSync(dir, { recursive: true, force: true })`, auch wenn der Fall rot wird, und sonst
bleibt der Fall gleich (`ROADMAP.md`, umzug 05; übernimmt `goals/_vorschlaege/umzug-kritik-2026-11-18-3.md`).
MVP: Funktion, weil der code-host geteilt ist und jeder Lauf sonst Reste auf der Platte lässt.

## Voraussetzungen
- umzug Goal 04 DONE

## Kontext für den Maker
- Ziel in einem Satz: `check` lässt auf keinem Rechner Reste zurück, damit der geteilte code-host, der auch die Goals für zahlende
  Automatons baut, nicht mit jedem Lauf voller wird. Was dem nicht dient, gehört nicht in dieses Goal.
- Stand am 19.11.2026 (`dev` bei `a68eff9`), gemessen:
  - `test/site-dns-selftest.test.ts` Zeile 35: `HOME: mkdtempSync(join(tmpdir(), "site-dns-"))` im `env` des `spawn`; die Datei
    importiert `mkdtempSync` aus `node:fs`, `rmSync` nicht.
  - Ein Lauf mit eigenem `TMPDIR` lässt genau ein Verzeichnis `site-dns-*` darin zurück (Punkt 1, dritte Prüfung, misst das an der
    Merge-Basis), auch wenn der Selbsttest rot wird (gepflanzt mit `if want != got:` in `ops/site-dns.py` Zeile 134).
  - `node:os` `tmpdir()` liest `TMPDIR`, und vitest reicht die Umgebung an seine Worker weiter; darauf bauen die Prüfbefehle.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 05` in `goals/umzug/ANNAHMEN.md`):
  1. **Löschen im Handler von `close`, vor `resolve`.** `runSelftest` legt das Verzeichnis in einer Konstante an, reicht sie als
     `HOME` weiter und ruft `rmSync(dir, { recursive: true, force: true })` im Handler von `close`, bevor es das Ergebnis auflöst. So
     ist das Verzeichnis weg, bevor eine Assertion rot werden kann, auch bei Timeout (dann kommt `close` nach dem Kill). Ein
     `afterEach` oder `try`/`finally` um die Assertions ist nicht nötig.
  2. **Fehler beim Start.** Kommt `error` statt `close` (etwa `python3` fehlt), löscht der Handler von `error` das Verzeichnis
     genauso und löst mit `status: null` und der Fehlermeldung in `stdout` auf, damit der Fall rot wird statt zu hängen.
  3. **Der Fall bleibt gleich:** Name, Timeout, `env` (leeres `HOME`, leerer Token, Proxy `127.0.0.1:9`) und die drei Assertions
     ändern sich nicht. `ops/site-dns.py` ändert sich nicht. Der Kopfkommentar der Datei bekommt einen Satz zum Aufräumen.
  4. **Abgelöste Prüfbefehle fertiger Goals** wie in umzug 04, Entscheidung 8: Der Maker führt jeden Prüfbefehl der Goal-Dateien mit
     Status `DONE`, der `site-dns` nennt, an der Merge-Basis und am Goal-Branch aus; für jeden, dessen Ausgabe sich ändert, steht im
     `goals/<topic>/ANNAHMEN.md` des abgelösten Goals genau eine Zeile, gesammelt unter `## Abgelöst durch umzug 05 (Maker, <Datum>)`:
     ```
     - Abgelöst: <topic> <NN> Punkt <n> durch umzug 05 Punkt <m>, Ausgabe dann genau `Exit <k>, <letzte Zeile>` (Tech Lead, 2026-11-19)
     ```
     Erwartet ist, dass sich keine Ausgabe ändert; das sagt dann die Zeile im Progress Log mit der Zahl der geprüften Befehle.
- Prüfbefehle ohne Netz, ohne festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit
  eigenem Timeout. Jede Prüfung mit eigenem `TMPDIR` räumt ihr eigenes Verzeichnis selbst weg.
- Kein Bildschirm ändert sich, also braucht dieses Goal kein SOLL-Bild. `test/**` liegt nicht im Laufzeitpfad von `deploy.yml`, der
  Merge rollt nichts aus.
- Widerlegt, wenn `grep -c 'rmSync' test/site-dns-selftest.test.ts` am Kopf von `dev` schon mindestens 1 zählt; dann endet das Goal mit
  dieser Messung in den Annahmen.

## Done Condition
- [ ] Ein grüner Lauf von `test/site-dns-selftest.test.ts` lässt kein Verzeichnis `site-dns-*` im Temp-Verzeichnis zurück; an der
      Merge-Basis ließ derselbe Lauf genau eins zurück.
      MVP: Funktion, weil jeder `check` auf dem geteilten code-host sonst ein Verzeichnis mehr hinterlässt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/site-dns-selftest.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH TMPDIR=$T pnpm -s vitest run test/site-dns-selftest.test.ts >/dev/null 2>&1; r=$?; n=$(find $T -maxdepth 1 -name 'site-dns-*' | wc -l); rm -rf $T; echo "$r $n"` muss genau `0 0` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; B=$(git merge-base origin/dev HEAD); git show $B:test/site-dns-selftest.test.ts > $T/test/site-dns-selftest.test.ts; mkdir $T/tmp; (cd $T && PATH=/usr/bin:$PATH TMPDIR=$T/tmp pnpm -s vitest run test/site-dns-selftest.test.ts >/dev/null 2>&1); r=$?; n=$(find $T/tmp -maxdepth 1 -name 'site-dns-*' | wc -l); rm -rf $T; echo "$r $n"` muss genau `0 1` ausgeben.
- [ ] Auch ein roter Lauf räumt das Verzeichnis weg: Bricht der Selbsttest, wird der Fall rot und lässt kein Verzeichnis zurück.
      MVP: Funktion, weil gerade ein gebrochener Planer oft hintereinander läuft und jeder Versuch sonst Reste lässt.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; mkdir $T/tmp; sed -i 's/^        if want == got:$/        if want != got:/' $T/ops/site-dns.py; (cd $T && PATH=/usr/bin:$PATH TMPDIR=$T/tmp pnpm -s vitest run test/site-dns-selftest.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); f=$(node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"); n=$(find $T/tmp -maxdepth 1 -name 'site-dns-*' | wc -l); rm -rf $T; echo "$f $n"` muss genau `1 0` ausgeben.
- [ ] Der Fall bleibt sonst gleich: leeres `HOME` aus `mkdtempSync`, gesperrtes Netz, dieselben Assertions, dieselbe Zahl an Fällen
      und `expect(`, `ops/site-dns.py` unverändert.
      MVP: Funktion, weil der Test nach umzug 04 den Planer der A-Records von `automatonhost.com` in `check` hält und dabei nichts von
      seiner Schärfe verlieren darf.
      Prüfung: `grep -c 'rmSync(' test/site-dns-selftest.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `for w in mkdtempSync 'ops/site-dns.py' --selftest 'SITE DNS SELFTEST OK' 'FAIL ' 'http://127.0.0.1:9' 'CLOUDFLARE_HTC_API_TOKEN: ""' 'recursive: true' 'force: true'; do grep -qF -- "$w" test/site-dns-selftest.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `f=test/site-dns-selftest.test.ts; for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -eq "$a" ] || echo "anders $k $a $b"; done` muss nichts ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- ops | wc -l` muss 0 ausgeben.
- [ ] Die Entscheidungen stehen mit Grund in den Annahmen, und jeder Prüfbefehl eines fertigen Goals, dessen Ausgabe sich durch dieses
      Goal ändert, steht als abgelöst in den Annahmen seines Topics, in der Form aus Entscheidung 4.
      MVP: Funktion, weil das Audit nachts jeden Prüfbefehl fertiger Goals fährt und jede unerklärte rote Zeile eine Reparatur ohne
      Ursache auf `dev` auslöst.
      Prüfung: `awk '/^## Goal 05/{f=1;next} /^## /{f=0} f' goals/umzug/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens 2 ausgeben.
      Prüfung: `q=$(printf '\140'); cat goals/*/ANNAHMEN.md | grep -E '^- Abgelöst: .* durch umzug 05 ' | grep -vcE " durch umzug 05 Punkt [0-9]+, Ausgabe dann genau ${q}Exit [0-9]+, [^${q}]*${q} \\(Tech Lead, 2026-11-19\\)\$"` muss 0 ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+ Zyklus [0-9]+: .*(abgelöst|Abgelöst)' goals/umzug/05-der-selbsttest-der-website-dns-raeumt-auf.md` muss mindestens 1 ausgeben.
- [ ] Das Goal ändert nur den Test, die Goal-Datei und Annahmen, keine Werkzeuge, keinen Laufzeitpfad, kein Compose, keine CI, und
      bringt keinen Schlüssel ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8) und Compose nur Matthias ändert.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src deploy harness .github scripts ops docs/soll loop.yaml gate.yaml LOOP.md loop-constraints.md package.json pnpm-lock.yaml | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vcE '^(test/site-dns-selftest\.test\.ts|goals/[a-z]+/ANNAHMEN\.md|goals/umzug/05-der-selbsttest-der-website-dns-raeumt-auf\.md)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | wc -l` muss höchstens 4 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}|Bearer [A-Za-z0-9_-]{30,})'` muss 0 ausgeben.
- [ ] `check` ist grün, auch der Job `check` am Goal-PR.
      MVP: Funktion, weil `check` das Merge-Gate auf `dev` ist und der Test darin läuft.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/umzug-05 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="check") | .state'` muss `SUCCESS` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Gegenprobe an der Merge-Basis (Punkt 1, dritte Prüfung) zeigt, dass die Messung den alten Zustand rot sieht; die Zeile im
      Progress Log nennt ihr Ergebnis.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Annahmen Deutsch, kein Gedankenstrich, kein Wort, das der Leser erst
      übersetzen muss (TEAM.md „Klare Wörter“).

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/**`, `package.json`, `pnpm-lock.yaml`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `ops/site-dns.py` und jede andere Datei unter `ops/`, `docs/soll/**`
- die Goal-Dateien fertiger Goals; in ihren `ANNAHMEN.md` nur die Zeilen aus Entscheidung 4
- `ops/site-dns.py check` und `apply`, jeder Aufruf von Cloudflare und jeder andere Aufruf der Produktion; der Zahlungsserver
  `76.13.144.207` und der Sandbox-Server: kein Zugriff
- kein Kommentar in einem fremden Repo (Human Gate `public_post`)
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
