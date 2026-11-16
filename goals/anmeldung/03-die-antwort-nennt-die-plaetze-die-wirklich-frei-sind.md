# Anmeldung Goal 03: Die Antwort nennt die Plätze, die wirklich frei sind

## Status
ACTIVE

## Active Objective
`POST /v1/auth/keyless` antwortet heute mit `keys_left_today` gleich „Grenze minus 1“, egal wie viele Schlüssel der Tag schon
vergeben hat (`src/app.ts` Zeile 1786 am Kopf von `dev`, ada37f0: `Math.max(0, (isDeclaredCrawler(userAgent) ?
crawlerMintsPerDay() : agentMintsPerDay()) - 1)`). Ein erklärter Crawler liest darum nach jedem seiner fünf Schlüssel „4 übrig“
und läuft beim sechsten Aufruf in 429 `crawler_daily_limit`; ein gewöhnlicher Aufrufer liest immer 199, auch nach dem 200.
Schlüssel des Tages. `test/keyless-crawler.test.ts` Zeile 79 hält diese falsche Zahl sogar fest (`toBe(4)` in allen fünf
Durchläufen).
Nach diesem Goal gibt `mintAgentIdentity` in `src/auth/keyless.ts` aus derselben Transaktion, die zählt und anlegt, die freien
Plätze der Grenze des Aufrufers zurück, und die Route setzt damit `keys_left_today`: für fünf Crawler-Aufrufe eines Tages
nacheinander 4, 3, 2, 1, 0, für zwei gewöhnliche 199, 198.
Widerlegt, wenn `keys_left_today` am Kopf von `dev` beim fünften Crawler-Aufruf eines Tages schon 0 ist.
MVP: Funktion, weil ein Agent an der Antwort sehen soll, ob er heute noch einen Schlüssel bekommt oder morgen wiederkommen muss,
statt bei 0 freien Plätzen „4 übrig“ zu lesen und in ein 429 zu laufen.

## Voraussetzungen
- anmeldung Goal 02 DONE

## Kontext für den Maker
- Ziel: Ein Agent, der `keys_left_today` liest, läuft nie mit „4 übrig“ in ein 429 `crawler_daily_limit`, und ein gewöhnlicher
  Aufrufer sieht, wie viele der 200 Plätze des Tages noch frei sind.
- Herkunft: Zeile anmeldung in `ROADMAP.md`, Glied 03. Übernimmt `goals/_vorschlaege/anmeldung-nacharbeit-2026-11-15-1.md`
  (Schwere 3, Linse Q, Beleg `src/app.ts:1786`, `test/keyless-crawler.test.ts:79`). Der Vorschlag
  `anmeldung-nacharbeit-2026-11-15-2.md` (doppelte Zählabfrage) ist verworfen und gehört nicht in dieses Goal.
- Diese Goal-Datei nennt `src/auth/keyless.ts` und `src/app.ts` ausdrücklich; nur deshalb darf das Goal `src/auth/**` ändern
  (`loop-constraints.md`, Deny List).
- Rollout mit dem nächsten Deploy, weil `src/` im Laufzeitpfad von `deploy.yml` liegt. Die Live-Prüfung des Release Managers bleibt
  `ops/smoke.sh` und `ops/live.sh` nach `LOOP.md`; kein Maker und kein Release Manager ruft `POST /v1/auth/keyless` gegen die
  Produktion, weil jeder Aufruf dort einen echten Schlüssel anlegt und einem echten Aufrufer einen Platz des Tages nimmt.
- Annahme (Tech Lead, 15.11.2026): Neu ist `export interface MintedAgentIdentity extends MintedIdentity { keysLeftToday: number }`
  in `src/auth/keyless.ts`, und die Signatur wird `export function mintAgentIdentity(db: Db, now = Date.now(), userAgent?: string):
  MintedAgentIdentity`. `MintedIdentity` und `mintKeylessIdentity` bleiben unverändert, weil auch die Schlüssel für den Browser
  darüber laufen und dort keine Tagesgrenze gilt.
- Annahme (Tech Lead, 15.11.2026): `keysLeftToday` ist die Grenze des Aufrufers minus die Zahl seiner Schlüssel des Tages nach dem
  neuen Eintrag, nie unter 0: beim erklärten Crawler `crawlerMintsPerDay()` minus `crawlerMintsToday`, sonst `agentMintsPerDay()`
  minus `agentMintsToday`. Gerechnet wird in der Transaktion von `mintAgentIdentity` aus der Zählung, die dort schon für die
  Grenze gelesen wird (Zählung vor dem Eintrag plus 1), damit zwei Aufrufe nacheinander nie dieselbe Zahl lesen. Der Tag ist wie
  bei der Zählung der UTC-Tag von `now`.
- Annahme (Tech Lead, 15.11.2026): Die Route `app.post("/v1/auth/keyless", …)` in `src/app.ts` liest `keysLeftToday` aus dem
  Ergebnis von `mintAgentIdentity` und setzt `keys_left_today: keysLeftToday`; Name, Ort und Typ des Felds in der Antwort bleiben
  gleich. Imports, die danach in `src/app.ts` keiner mehr braucht (`agentMintsPerDay`, `crawlerMintsPerDay`, `isDeclaredCrawler`),
  fallen aus der Importzeile. Kein anderer Teil von `src/app.ts` ändert sich.
- Annahme (Tech Lead, 15.11.2026): Die Antwort 429 (`daily_limit` und `crawler_daily_limit`) bleibt byte-gleich und bekommt kein
  `keys_left_today`, weil ihr Hinweistext schon sagt, dass die Plätze verbraucht sind und um Mitternacht UTC nachwachsen.
  Codes, Status und Hinweistexte von `KeylessError` ändern sich nicht.
- Unverändert bleiben `AGENT_MINTS_PER_DAY_DEFAULT = 200`, `CRAWLER_MINTS_PER_DAY_DEFAULT = 5`, `isDeclaredCrawler`,
  `agentMintsToday`, `crawlerMintsToday`, `agentMintsPerDay`, `crawlerMintsPerDay` und `KEYLESS_CRAWLER_NAME` samt ihrer Exporte.
- **Test `test/keyless-crawler.test.ts`**: Im bestehenden Fall „crawler keys do not count against the places of everybody else“
  wird die Erwartung in Zeile 79 die Zahl, die nach diesem Goal stimmt (`4 - i` im Durchlauf `i`); das ist die einzige bestehende
  Zeile, die sich ändern darf, dazu wenn nötig Zeile 78 (Typ des gelesenen Körpers), beide mit `keys_left_today` (Punkt 3 prüft
  das). Neu ist ein `describe("keys_left_today counts the places that are really left")` mit den Hilfen `setup`, `mint`,
  `crawlerAddress` und `CRAWLER_UA` der Datei:
  - `it("keys_left_today counts down a declared crawler's own places")`: fünf Crawler-Aufrufe über `mint` ergeben nacheinander
    `keys_left_today` 4, 3, 2, 1, 0; der sechste ist 429 `crawler_daily_limit`, und sein Körper hat kein Feld `keys_left_today`.
    Vor dem Fix rot (heute 4, 4, 4, 4, 4);
  - `it("keys_left_today counts down the places of everybody else")`: drei Crawler-Aufrufe, dann zwei mit User-Agent `node` von
    `192.0.2.50` und `192.0.2.51` ergeben 199 und 198, ein vierter Crawler-Aufruf danach 1. Vor dem Fix rot (heute 199, 199 und 4);
  - `it("keys_left_today follows the caps set by the environment")`: mit `CP_AGENT_MINTS_PER_DAY=3` ergeben drei Aufrufe mit
    `node` 2, 1, 0 und der vierte 429 `daily_limit`; mit `CP_CRAWLER_MINTS_PER_DAY=2` ergeben zwei Crawler-Aufrufe 1, 0. Vor dem
    Fix rot (heute 2, 2, 2 und 1, 1);
  - `it("keys_left_today refills at midnight UTC")`: direkt über `mintAgentIdentity(openDb(":memory:"), now, userAgent)` mit
    `now` gleich `Date.parse("2026-11-16T23:59:00Z")`: zwei Crawler-Aufrufe ergeben `keysLeftToday` 4 und 3, ein Aufruf ohne
    User-Agent 199; mit `Date.parse("2026-11-17T00:01:00Z")` ergibt der nächste Crawler-Aufruf 4 und der nächste ohne User-Agent
    199. Vor dem Fix rot (heute ist `keysLeftToday` nicht gesetzt).
  Rot vor dem Fix sind alle vier neuen Fälle; die Zeile im Progress Log nennt das mit Zahl. Punkt 1 prüft es zusätzlich mit dem
  Stand von `src/` der Merge-Basis.
- Die Tests `test/keyless-agent.test.ts`, `test/goal-18-die-tuer.test.ts`, `test/keyless.test.ts`, `test/keyless-mints.test.ts`
  und `test/claim-keyless-own-ips.test.ts` bleiben unverändert und grün; sie lesen von `mintAgentIdentity` nur `key`, `address`
  und `keyPrefix`.
- Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich. Der Doc-Kommentar von `mintAgentIdentity`
  bekommt einen Satz zu `keysLeftToday`, der Kommentar über der Route einen Halbsatz, dass die Zahl aus der Zählung des Aufrufs
  kommt. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein `pkill -f`.

## Done Condition
- [x] `keys_left_today` zählt die freien Plätze der Grenze des Aufrufers herunter, beim erklärten Crawler 4, 3, 2, 1, 0 und beim
      gewöhnlichen Aufrufer 199, 198, und mit dem Stand von `src/` vor dem Goal sind die neuen Fälle rot.
      Prüfung: `pnpm -s vitest run test/keyless-crawler.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "keys_left_today counts down a declared crawler's own places|keys_left_today counts down the places of everybody else|keys_left_today follows the caps set by the environment|keys_left_today refills at midnight UTC" test/keyless-crawler.test.ts` muss mindestens 4 ausgeben.
      Prüfung: `grep -cE 'keys_left_today: keysLeftToday' src/app.ts` muss 1 ausgeben.
      Prüfung: `grep -cE 'MintsPerDay\(\)\) - 1' src/app.ts` muss 0 ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); cp src/app.ts src/auth/keyless.ts "$T/"; git show "$B:src/app.ts" > src/app.ts; git show "$B:src/auth/keyless.ts" > src/auth/keyless.ts; pnpm -s vitest run test/keyless-crawler.test.ts -t "keys_left_today" >/dev/null 2>&1; echo "rc=$?"; cp "$T/app.ts" src/app.ts; cp "$T/keyless.ts" src/auth/keyless.ts; git status --porcelain -- src | wc -l` muss `rc=1` und danach 0 ausgeben.
- [x] `mintAgentIdentity` gibt `keysLeftToday` aus derselben Transaktion zurück, die zählt und anlegt, und die Zahl wächst um
      Mitternacht UTC nach.
      Prüfung: `grep -cE '^export interface MintedAgentIdentity extends MintedIdentity' src/auth/keyless.ts` muss 1 ausgeben.
      Prüfung: `grep -cE '^export function mintAgentIdentity\(db: Db, now = Date\.now\(\), userAgent\?: string\): MintedAgentIdentity' src/auth/keyless.ts` muss 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/keyless-crawler.test.ts -t "refills at midnight UTC"` muss Exit-Code 0 haben.
      Prüfung: `grep -cE '^export (function isDeclaredCrawler|const KEYLESS_CRAWLER_NAME = "crawler"|const CRAWLER_MINTS_PER_DAY_DEFAULT = 5;|function crawlerMintsPerDay|function crawlerMintsToday|const AGENT_MINTS_PER_DAY_DEFAULT = 200;|function agentMintsPerDay|function agentMintsToday)' src/auth/keyless.ts` muss 8 ausgeben.
- [x] Alles andere an der Tür bleibt gleich: die Antwort 429, die übrigen Tests der Tür und jede bestehende Zeile des
      Crawler-Tests außer der Erwartung an `keys_left_today`.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- test/keyless-crawler.test.ts | grep -E '^-([^-]|$)' | grep -vc 'keys_left_today'` muss 0 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- test/keyless-crawler.test.ts | grep -cE '^-([^-]|$)'` muss höchstens 2 ausgeben.
      Prüfung: `grep -cE "a runtime still gets a key after a crawler took the whole day|a declared crawler stops at its own small daily cap|crawler keys do not count against the places of everybody else|CP_CRAWLER_MINTS_PER_DAY overrides the crawler cap|a user agent is a declared crawler only with a link and a crawler word|the tool and the server classify user agents the same way" test/keyless-crawler.test.ts` muss mindestens 6 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- src/auth/keyless.ts | grep -cE '^-.*("crawler_daily_limit"|"daily_limit"|429,|midnight UTC|With a wallet there is no limit|today.s are gone)'` muss 0 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- src/app.ts | grep -cE '^[-+]([^-+]|$)'` muss höchstens 8 ausgeben.
      Prüfung: `pnpm -s vitest run test/keyless-agent.test.ts test/goal-18-die-tuer.test.ts test/keyless.test.ts test/keyless-mints.test.ts test/claim-keyless-own-ips.test.ts` muss Exit-Code 0 haben.
- [x] `check` ist grün, nur die genannten Dateien ändern sich, und `check` lässt die Liste der eigenen Adressen und das
      Zustandsverzeichnis unberührt.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(src/auth/keyless\.ts|src/app\.ts|test/keyless-crawler\.test\.ts|goals/anmeldung/.+)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- test/keyless-agent.test.ts test/goal-18-die-tuer.test.ts test/keyless.test.ts test/keyless-mints.test.ts test/claim-keyless-own-ips.test.ts ops | wc -l` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Fall war vor dem Fix rot, soweit oben so genannt; die Zeile im Progress Log nennt, welche und womit.
- [ ] Kein Lauf des Goals ruft `POST /v1/auth/keyless` gegen die Produktion.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/**`, `.github/**`, `scripts/**`, `harness/**`,
  `deploy/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- unter `src/` alles außer `src/auth/keyless.ts` und der Route `POST /v1/auth/keyless` samt Importzeile in `src/app.ts`
- die Tests `test/keyless-agent.test.ts`, `test/goal-18-die-tuer.test.ts`, `test/keyless.test.ts`, `test/keyless-mints.test.ts`,
  `test/claim-keyless-own-ips.test.ts`; in `test/keyless-crawler.test.ts` jede bestehende Zeile außer der Erwartung an
  `keys_left_today` in Zeile 78 und 79
- `goals/_vorschlaege/**`
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), jede Datei auf dem Server und jeder Aufruf der Produktion;
  kein Rollout von Hand
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: `mintAgentIdentity` rechnet `keysLeftToday` in seiner Transaktion aus der Zählung vor dem Eintrag plus 1 (`MintedAgentIdentity`), die Route setzt damit `keys_left_today`, die drei Importe fallen aus `src/app.ts`. Rot vor dem Fix: alle 4 neuen Fälle und die geänderte Erwartung in Zeile 79 (5 failed, 5 passed mit dem Stand von `src/` der Merge-Basis). Produktion nicht aufgerufen. Prüfbefehle (Node 22.23.5, PATH=/usr/bin:$PATH, am Commit d5bfe00): P1 vitest Exit 0 (10 passed), `4`, `1`, `0`, `rc=1` und `0`; P2 `1`, `1`, vitest Exit 0, `8`; P3 `0`, `1`, `6`, `0`, `8`, vitest Exit 0 (49 passed); P4 `node scripts/check.mjs` Exit 0 (1915 passed, grün in 81 s), `0`, `0`, `0`, `0`.
- 2026-11-16 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4; `dev` ohne neuen Commit seit der Merge-Basis c1d7f74, kein Merge nötig. Prüfbefehle (Node 22.23.5, am Commit 7ac0c73): P1 vitest Exit 0 (10 passed), `4`, `1`, `0`, `rc=1` und `0`; P2 `1`, `1`, vitest Exit 0 (1 passed, 9 skipped durch `-t`), `8`; P3 `0`, `1`, `6`, `0`, `8`, vitest Exit 0 (49 passed); P4 `node scripts/check.mjs` Exit 0 (1915 passed, grün in 52 s), `0`, `0`, `0`, `0`; Job `e2e` am PR #194 grün (`E2E OK turns=5 registered=true api_errors=0 ledger_consistent=true`). Produktion nicht aufgerufen.

## Blockers
- keine
