# Anmeldung Goal 01: Ein Crawler leert die schlüssellose Anmeldung nicht für alle

## Status
PLANNED

## Active Objective
Seit dem 11.11.2026 holt sich ein erklärter Crawler (User-Agent mit Crawler-Link, über wechselnde Adressen) jeden Tag alle 200
Plätze von `POST /v1/auth/keyless` (`AGENT_MINTS_PER_DAY_DEFAULT` in `src/auth/keyless.ts`, gezählt über alle Aufrufer in
`agentMintsToday`). Danach bekamen vom 11. bis 14.11. auch 6 Anfragen mit User-Agent `node`, wie ihn die Runtime sendet, 429
`daily_limit` (gezählt am 14.11.2026 aus `ops/access-log.sh` je User-Agent und Status, eigene Adressen über `own_ips` heraus). Das
ist ein Fehler echter Nutzer (`loop-constraints.md`, Grundregel 4) an der Tür für neue Automatons und Menschen ohne Wallet.
Nach diesem Goal macht ein Werkzeug `ops/keyless-mints.sh` diese Zählung wiederholbar, mit Selbsttest in beide Richtungen, und gibt
nur Summen je Tag, Art des Aufrufers und Status aus, nie eine Adresse. Der Server zählt erklärte Crawler (User-Agent mit Link und
`crawler`, `bot` oder `indexer`) gegen eine eigene kleine Tagesgrenze, und alle anderen Aufrufer behalten ihre 200 Plätze am Tag.
Widerlegt, wenn das Werkzeug für den 11. bis 14.11. keine Ablehnung (429) eines Aufrufers der Art `node` oder `other` zählt (der
Maker lässt es zuerst einmal gegen die Produktion laufen, nur lesend, sobald Punkt 1 steht, und schreibt die Summen dieser vier Tage
ohne Adresse in die erste Zeile des Progress Log), oder wenn in den 14 Tagen nach dem Rollout ein Aufrufer ohne Crawler-Kennung
wieder 429 `daily_limit` bekommt (Nachweis mit demselben Werkzeug, Sache des Release Managers und der Triage, kein Done-Punkt).
MVP: Funktion, weil jede abgewiesene Runtime ein Kunde ist, der nicht ankommt, und weil die Tür das Einzige ist, was ein Mensch ohne
Wallet vor seinem ersten Schlüssel sieht.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel: Eine Runtime oder ein Mensch ohne Wallet, der `POST /v1/auth/keyless` ruft, bekommt einen Schlüssel, auch an einem Tag, an
  dem ein Crawler die Tür schon hundertfach geleert hat.
- Herkunft: Zeile anmeldung in `ROADMAP.md`, Glied 01 (eigene Zeile statt Glied an fehler, weil fehler 11 auf PAUSED steht).
  Übernimmt keinen Vorschlag. Diese Goal-Datei nennt `src/auth/keyless.ts` und `src/app.ts` ausdrücklich; nur deshalb darf das Goal
  `src/auth/**` ändern (`loop-constraints.md`, Deny List).
- Annahme (Tech Lead, 14.11.2026): Ein erklärter Crawler ist ein User-Agent, der `http://` oder `https://` enthält und, ohne
  Rücksicht auf Groß- und Kleinschreibung, eines der Wörter `crawler`, `bot` oder `indexer` (als Teilzeichenfolge, also auch
  `Googlebot`). Beides muss zutreffen: Ein `MyBot/1.0` ohne Link und ein Browser mit Link ohne eines der Wörter sind keine Crawler.
  Die Regel steht genau einmal im Server als `export function isDeclaredCrawler(userAgent: string | undefined): boolean` in
  `src/auth/keyless.ts` und genau einmal im Werkzeug; ein Test hält beide auf derselben Antwort (Punkt 3). Wer sich als Crawler
  tarnt, schadet nur sich selbst; wer seine Kennung weglässt, landet bei den 200 Plätzen wie heute, das ist die bekannte Restlücke
  und kein Ziel dieses Goals.
- Annahme (Tech Lead, 14.11.2026): Schlüssel eines erklärten Crawlers tragen den Namen `crawler`
  (`export const KEYLESS_CRAWLER_NAME = "crawler"`), damit die Zählung je Tag ohne neue Spalte in einer Transaktion bleibt:
  `agentMintsToday` zählt weiter nur den Namen `agent`, eine neue `crawlerMintsToday(db, now)` zählt `crawler` nach demselben Muster.
  Die eigene Grenze ist `export const CRAWLER_MINTS_PER_DAY_DEFAULT = 5`, überschreibbar mit `CP_CRAWLER_MINTS_PER_DAY` wie
  `agentMintsPerDay` mit `CP_AGENT_MINTS_PER_DAY` (`crawlerMintsPerDay()`). Ist sie erreicht, wirft `mintAgentIdentity`
  `KeylessError` mit Code `crawler_daily_limit` und Status 429, damit eine 429 mit `daily_limit` weiter heißt, dass ein
  gewöhnlicher Aufrufer abgewiesen wurde. Der Hinweistext ist Englisch und sagt, dass erklärte Crawler eigene, wenige Plätze am Tag
  haben, dass sie heute verbraucht sind und um Mitternacht UTC nachwachsen, und nennt den Weg mit Wallet wie der bestehende Text.
- Annahme (Tech Lead, 14.11.2026): Die Signatur wird `mintAgentIdentity(db: Db, now = Date.now(), userAgent?: string)`. Ohne
  dritten Wert verhält sie sich byte-gleich wie heute, damit `test/keyless-agent.test.ts`, `test/goal-18-die-tuer.test.ts` und
  `test/keyless.test.ts` unverändert grün bleiben. Die Route `app.post("/v1/auth/keyless", …)` in `src/app.ts` gibt
  `c.req.header("user-agent")` weiter; im 201 eines Crawlers steht `keys_left_today` nach `crawlerMintsPerDay()` statt
  `agentMintsPerDay()`, sonst ändert sich an Route und Antwort nichts. Kein anderer Teil von `src/app.ts` ändert sich.
- Annahme (Tech Lead, 14.11.2026): `ops/db-report.cjs` nimmt `crawler` in `STRANGER_KEY_NAMES` auf (eine Zeile plus ein Satz
  Kommentar), weil ein Crawler ein fremder Aufrufer ist und ein unbekannter Name sonst in `unclassified_key_names` als Befund für
  einen Menschen auftaucht. Sonst ändert sich dort nichts.
- **Werkzeug `ops/keyless-mints.sh`** (Englisch, Bash mit eingebettetem `python3` wie `ops/claim-keyless.sh`):
  - `ops/keyless-mints.sh` liest das Zugriffslog über `./ops/access-log.sh` (Produktion, nur lesend; läuft in diesem Goal nur einmal
    für die erste Zeile des Progress Log und nie in einem Test oder Prüfbefehl), `ops/keyless-mints.sh --file <log>` liest eine
    lokale Datei im Caddy-JSON-Format. Optional `--since <JJJJ-MM-TT>` und `--until <JJJJ-MM-TT>` (beide einschließlich, UTC).
  - Gezählt wird nur `POST` auf `/v1/auth/keyless` (Pfad ohne Query gleich `/v1/auth/keyless`). Adresse aus
    `request.client_ip`, sonst `request.remote_ip`; User-Agent aus `request.headers["User-Agent"][0]`, fehlt er, ist er leer.
  - Art des Aufrufers: `crawler` nach der Regel oben, `node` für einen User-Agent, der genau `node` ist oder mit `node/` beginnt,
    sonst `other`.
  - Eigene Adressen über `own_ips` aus `ops/own-ips.sh` heraus, nach dem Muster von messung 01 (`ops/claim-keyless.sh` Zeile 44 bis
    47): `source` der Datei, Prüfung der Datei aus `CP_OWN_IPS_FILE` auf mindestens eine Zeile ohne `#` mit einem ersten Feld, dann
    `own_ips`; fehlt die Datei, nennt sie keine Adresse oder endet `own_ips` mit Fehler, endet das Werkzeug mit Exit 2 und einer
    stderr-Zeile, die `own_ips` nennt, bevor es eine Zahl ausgibt. Die stderr von `own_ips` wird verworfen, weil sie die live
    gesehene Adresse nennen kann. Das Werkzeug nennt `own-ips.txt` nirgends außerhalb eines Kommentars (messung 04 sperrt das).
  - Ausgabe auf stdout: Kopfzeile `| day | caller | status | requests |`, Trennzeile, dann je Tag, Art und Status eine Zeile
    `| 2026-11-11 | crawler | 201 | 3 |`, sortiert nach Tag, dann Art (`crawler`, `node`, `other`), dann Status aufsteigend; zum
    Schluss genau eine Zeile `own addresses left out: <n>` mit der Zahl der ausgelassenen Anfragen. Keine Adresse, kein User-Agent im
    Wortlaut, auf stdout wie auf stderr.
  - `ops/keyless-mints.sh --classify` liest User-Agents zeilenweise von stdin und gibt je Zeile die Art aus, ohne `own_ips`, ohne
    `ssh`, ohne Log. Das ist die Stelle, an der Punkt 3 Werkzeug und Server vergleicht.
  - `ops/keyless-mints.sh --selftest` baut in einem Ordner aus `mktemp` ein Log mit Dokumentationsadressen, eine Liste mit genau
    einer davon als `CP_OWN_IPS_FILE`, `CP_OWN_IPS_SEEN` in denselben Ordner und ein nachgebautes `ssh`, das mit 255 endet und vorn
    im `PATH` steht, ruft sich selbst mit `--file` und prüft beide Richtungen: eine gepflanzte 429 eines `node`-Aufrufers steht
    als `| <Tag> | node | 429 | 1 |` in der Ausgabe (die Null ist keine Blindheit), eine Anfrage der eigenen Adresse zählt nicht und
    erhöht `own addresses left out` auf 1, und keine Zeile nennt eine gepflanzte Adresse. Letzte Zeile genau
    `KEYLESS MINTS SELFTEST OK`, sonst Exit 1.
- **Test `test/keyless-mints.test.ts`**, ohne Netz, ohne festen Port, nur Dokumentationsadressen, Muster wie
  `test/claim-keyless-own-ips.test.ts`, mit `import "./yield-between-tests"`, je Fall ein `mktemp`-Ordner `<tmp>`, der in `afterEach`
  verschwindet. Aufruf `bash ops/keyless-mints.sh --file <tmp>/caddy.jsonl` mit `HOME=<tmp>`, `CP_OWN_IPS_FILE=<tmp>/own.txt`,
  `CP_OWN_IPS_SEEN=<tmp>/seen.txt`, ohne `CP_OWN_IPS` (aus der Umgebung gelöscht), `PATH` mit einem nachgebauten `ssh` vorn, das
  jeden Aufruf an `<tmp>/ssh-calls` anhängt und bei `SSH_CLIENT` im letzten Argument `$FAKE_LIVE 40000 22` ausgibt, wenn `FAKE_LIVE`
  gesetzt ist, sonst mit 255 endet. `<tmp>/own.txt` ist `203.0.113.99 2026-11-01  planted own address`. Fälle:
  - `it("counts keyless mints per day, caller and status")`: am 2026-11-11 drei `201` und zwei `429` eines Crawlers (User-Agent
    `ExampleCrawler/1.0 (+https://crawler.example/about)` von `198.51.100.10`, `.11`, `.12`), eine `429` mit User-Agent `node` von
    `192.0.2.50`, am 2026-11-12 eine `201` mit User-Agent `node/22.11.0` von `192.0.2.51` und eine `201` mit `python-requests/2.31`
    von `192.0.2.52`; die Ausgabe hat genau die Zeilen `| 2026-11-11 | crawler | 201 | 3 |`, `| 2026-11-11 | crawler | 429 | 2 |`,
    `| 2026-11-11 | node | 429 | 1 |`, `| 2026-11-12 | node | 201 | 1 |`, `| 2026-11-12 | other | 201 | 1 |` in dieser Reihenfolge;
  - `it("counts only POST /v1/auth/keyless")`: zusätzlich `GET /v1/auth/keyless` mit 405, `POST /v1/auth/nonce` mit 200 und
    `POST /v1/auth/keyless-other` mit 404; keine dieser Anfragen erscheint in einer Zeile;
  - `it("leaves out our own addresses from the list, the live address and CP_OWN_IPS_SEEN")`: je eine `429` mit User-Agent `node` von
    `203.0.113.99` (Liste), von `192.0.2.77` (`FAKE_LIVE`) und von `198.51.100.23` (`<tmp>/seen.txt`), dazu eine von `192.0.2.50`;
    die Ausgabe hat `| <Tag> | node | 429 | 1 |` und `own addresses left out: 3`; ohne `FAKE_LIVE` und ohne `<tmp>/seen.txt`
    `| <Tag> | node | 429 | 3 |` und `own addresses left out: 1` (Gegenrichtung im selben Fall);
  - `it("stops with exit 2 when the own list names no address")`: `<tmp>/own.txt` nur `# no own address`, `FAKE_LIVE` gesetzt;
    Exit 2, keine Zeile von stdout beginnt mit `|`, stderr nennt `own_ips`;
  - `it("stops with exit 2 when the own list is missing")`: `CP_OWN_IPS_FILE=<tmp>/missing.txt`; ebenso;
  - `it("the selftest passes and calls no real ssh")`: `--selftest` mit dem nachgebauten `ssh` vorn; letzte Zeile
    `KEYLESS MINTS SELFTEST OK`, Exit 0;
  - in jedem Fall nennt keine Zeile von stdout oder stderr eine gepflanzte Adresse oder den Wortlaut eines gepflanzten User-Agents,
    und `<tmp>/own.txt` ist danach byte-gleich (sha256).
- **Test `test/keyless-crawler.test.ts`**, ohne Netz, über `createApp({ db: openDb(":memory:") })` und `app.request` wie
  `test/keyless-agent.test.ts`, `CP_AGENT_MINTS_PER_DAY` und `CP_CRAWLER_MINTS_PER_DAY` in `afterEach` gelöscht. Fälle:
  - `it("a runtime still gets a key after a crawler took the whole day")`: so viele `POST /v1/auth/keyless` mit User-Agent
    `ExampleCrawler/1.0 (+https://crawler.example/about)`, wie `CP_CRAWLER_MINTS_PER_DAY=200` erlaubt (200), dann eine mit
    User-Agent `node`; die letzte antwortet 201 mit einem Schlüssel, den `resolveApiKey` auflöst. Vor dem Fix rot (heute 429
    `daily_limit`), das ist der Test aus der ROADMAP;
  - `it("a declared crawler stops at its own small daily cap")`: ohne Umgebung 5 Mal 201 mit dem Crawler-User-Agent, die sechste
    429 mit `error` gleich `crawler_daily_limit`; danach antwortet eine Anfrage mit User-Agent `node` 201. Vor dem Fix rot (heute
    201 für die sechste);
  - `it("crawler keys do not count against the places of everybody else")`: nach 5 Crawler-Schlüsseln ist `agentMintsToday(db)` 0
    und `crawlerMintsToday(db)` 5; Schlüssel der Crawler tragen in `api_keys.name` den Wert `crawler`;
  - `it("CP_CRAWLER_MINTS_PER_DAY overrides the crawler cap")`: mit `CP_CRAWLER_MINTS_PER_DAY=2` ist die dritte Crawler-Anfrage 429
    `crawler_daily_limit`;
  - `it("a user agent is a declared crawler only with a link and a crawler word")`: `isDeclaredCrawler` ist wahr für
    `ExampleCrawler/1.0 (+https://crawler.example/about)`, `Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)`
    und `ExampleIndexer/2 https://indexer.example`, falsch für `node`, `node/22.11.0`, `undici`, `python-requests/2.31`,
    `ExampleBot/1.0`, `Mozilla/5.0 (X11; Linux x86_64) https://example.com`, den leeren Text und `undefined`;
  - `it("the tool and the server classify user agents the same way")`: dieselbe Liste ohne `undefined` als stdin an
    `bash ops/keyless-mints.sh --classify`; je Zeile ist die Ausgabe `crawler` genau dort, wo `isDeclaredCrawler` wahr ist.
  Rot vor dem Fix sind die ersten vier Fälle; die Zeile im Progress Log nennt das mit Zahl.
- Rollout: Der Merge ändert `src/`, also rollt `deploy.yml` aus; das ist gewollt und Sache des Release Managers. Kein Test, kein
  Selftest und kein Prüfbefehl ruft die VM oder ein Werkzeug ohne nachgebautes `ssh` auf. Der eine Produktionslauf von
  `ops/keyless-mints.sh` für das Progress Log liest nur (`loop-constraints.md`, Produktion: nur lesen), seine Ausgabe nennt keine
  Adresse und landet nur als Summen im Progress Log.
- Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout; neue Dateien vor `check` mit `git add` stagen. Kein `pkill -f`.

## Done Condition
- [ ] `ops/keyless-mints.sh` zählt `POST /v1/auth/keyless` je Tag, Art des Aufrufers und Status ohne eigene Adressen, nennt keine
      Adresse, bricht ohne Liste der eigenen Adressen mit Exit 2 ab und beweist sich im Selbsttest in beide Richtungen.
      Prüfung: `T=$(mktemp -d); printf '#!/bin/sh\necho called >> %s/calls\nexit 255\n' "$T" > "$T/ssh"; chmod +x "$T/ssh"; PATH="$T:$PATH" bash ops/keyless-mints.sh --selftest | tail -1; cat "$T/calls" 2>/dev/null | wc -l` muss `KEYLESS MINTS SELFTEST OK` und danach 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/keyless-mints.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "counts keyless mints per day, caller and status|counts only POST /v1/auth/keyless|leaves out our own addresses from the list, the live address and CP_OWN_IPS_SEEN|stops with exit 2 when the own list names no address|stops with exit 2 when the own list is missing|the selftest passes and calls no real ssh" test/keyless-mints.test.ts` muss mindestens 6 ausgeben.
      Prüfung: `grep -cE '^[^#]*(source|\.) .*own-ips\.sh' ops/keyless-mints.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -nP '^(?!\s*(#|//|/\*|\*)).*(?<![\w-])own-ips\.txt' ops/keyless-mints.sh | wc -l` muss 0 ausgeben.
- [ ] Ein erklärter Crawler zählt gegen eine eigene Tagesgrenze von 5, und jeder andere Aufrufer bekommt einen Schlüssel, auch wenn
      Crawler an diesem Tag 200 genommen haben.
      Prüfung: `pnpm -s vitest run test/keyless-crawler.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "a runtime still gets a key after a crawler took the whole day|a declared crawler stops at its own small daily cap|crawler keys do not count against the places of everybody else|CP_CRAWLER_MINTS_PER_DAY overrides the crawler cap|a user agent is a declared crawler only with a link and a crawler word" test/keyless-crawler.test.ts` muss mindestens 5 ausgeben.
      Prüfung: `grep -cE '^export (function isDeclaredCrawler|const KEYLESS_CRAWLER_NAME = "crawler"|const CRAWLER_MINTS_PER_DAY_DEFAULT = 5;|function crawlerMintsPerDay|function crawlerMintsToday)' src/auth/keyless.ts` muss 5 ausgeben.
      Prüfung: `grep -c 'crawler_daily_limit' src/auth/keyless.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '^export const AGENT_MINTS_PER_DAY_DEFAULT = 200;' src/auth/keyless.ts` muss 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/keyless-agent.test.ts test/goal-18-die-tuer.test.ts test/keyless.test.ts` muss Exit-Code 0 haben.
- [ ] Werkzeug und Server erkennen Crawler nach derselben Regel, und der Bericht führt Schlüssel der Crawler als fremde.
      Prüfung: `grep -c "the tool and the server classify user agents the same way" test/keyless-crawler.test.ts` muss 1 ausgeben.
      Prüfung: `printf 'ExampleCrawler/1.0 (+https://crawler.example/about)\nnode\nExampleBot/1.0\nMozilla/5.0 https://example.com\n' | bash ops/keyless-mints.sh --classify | tr '\n' ' '` muss `crawler node other other ` ausgeben.
      Prüfung: `grep -cE '^const STRANGER_KEY_NAMES = \[.*"crawler"' ops/db-report.cjs` muss 1 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- src/app.ts | grep -cE '^[-+]([^-+]|$)'` muss höchstens 12 ausgeben.
- [ ] `check` ist grün, nur die genannten Dateien ändern sich, bestehende Tests der Tür bleiben unverändert, und `check` lässt die
      Liste der eigenen Adressen und das Zustandsverzeichnis unberührt.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(src/auth/keyless\.ts|src/app\.ts|ops/keyless-mints\.sh|ops/db-report\.cjs|test/keyless-(crawler|mints)\.test\.ts|goals/anmeldung/.+)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- test/keyless-agent.test.ts test/goal-18-die-tuer.test.ts test/keyless.test.ts test/claim-keyless-own-ips.test.ts | wc -l` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jeder neue Fall war vor dem Fix rot, soweit oben so genannt; die Zeile im Progress Log nennt, welche
      Fälle und womit.
- [ ] Die erste Zeile des Progress Log nennt die Summen von `ops/keyless-mints.sh --since 2026-11-11 --until 2026-11-14` gegen die
      Produktion, ohne Adresse und ohne Wortlaut eines User-Agents.
- [ ] Keine Ausgabe des Werkzeugs nennt eine Adresse.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`,
  `harness/**`, `deploy/**`, `docs/**`, `ops/fixtures/**`, `ops/own-ips.txt`, `ops/own-ips.sh`, `ops/access-log.sh`,
  `ops/claim-keyless.sh`, `.env*`, `*.key`, `*.pem`
- unter `src/` alles außer `src/auth/keyless.ts` und der Route `POST /v1/auth/keyless` in `src/app.ts`; unter `ops/` alles außer
  `ops/keyless-mints.sh` (neu) und `ops/db-report.cjs` (nur `STRANGER_KEY_NAMES` und sein Kommentar)
- die bestehenden Tests `test/keyless-agent.test.ts`, `test/goal-18-die-tuer.test.ts`, `test/keyless.test.ts`,
  `test/claim-keyless-own-ips.test.ts`
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`) und jede Datei auf dem Server; Produktion nur lesend und nur
  für den einen Lauf des Werkzeugs, kein Rollout von Hand
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- (leer)

## Blockers
- keine
