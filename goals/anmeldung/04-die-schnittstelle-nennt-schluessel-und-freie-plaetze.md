# Anmeldung Goal 04: Die Schnittstelle nennt Schlüssel und freie Plätze

## Status
ACTIVE

## Active Objective
`/openapi.json` beschreibt `POST /v1/auth/keyless` heute ohne Schema für die Antwort 201 (`src/public/openapi.ts` Zeile 108 am
Kopf von `dev`, ebe2dd3: `201: { description: "The key" }`) und sagt in Zeile 107 „Capped per day across the instance.“. Die echte
Antwort der Route (`src/app.ts` Zeile 1779 bis 1803) trägt aber sechs Felder, `key`, `key_prefix`, `address`, `note`,
`keys_left_today` und `docs` (Zeile 1785 bis 1793), und seit anmeldung 01 hat ein erklärter Crawler eine eigene, kleinere Grenze
(`CRAWLER_MINTS_PER_DAY_DEFAULT = 5` in `src/auth/keyless.ts` Zeile 155, `isDeclaredCrawler` Zeile 162) neben der Grenze für alle
anderen (`AGENT_MINTS_PER_DAY_DEFAULT = 200`, Zeile 129). Ein Agent, der die Schnittstelle aus `/openapi.json` liest statt aus einer
Antwort, erfährt weder, dass es `keys_left_today` gibt, noch, dass er als Crawler schon nach fünf Schlüsseln am Tag in 429 läuft.
Nach diesem Goal hat die Antwort 201 in `src/public/openapi.ts` ein Schema mit genau den sechs Feldern der echten Antwort, darunter
`keys_left_today` als `integer` mit `minimum: 0`, und der Beschreibungstext nennt die Grenze für alle und die eigene Grenze erklärter
Crawler mit den Zahlen der laufenden Konfiguration (`agentMintsPerDay()`, `crawlerMintsPerDay()`), statt fest eingetippter 200 und 5.
Ein neuer Test hält Schema und echte Antwort in beide Richtungen gleich.
Widerlegt, wenn eine echte 201-Antwort von `POST /v1/auth/keyless` aus `createApp` mit `:memory:` am Kopf von `dev` schon heute
ein Schema in `/openapi.json` hat, dessen Felder genau ihre Schlüssel sind.
MVP: Funktion, weil ein Agent die Tagesgrenze, die für ihn gilt, und ihren Rest dann vor dem ersten Aufruf aus der Schnittstelle
lesen kann, statt beim sechsten Crawler-Aufruf überrascht in 429 `crawler_daily_limit` zu laufen.

## Voraussetzungen
- anmeldung Goal 03 DONE

## Kontext für den Maker
- Ziel: Ein Agent oder Indexer, der nur `/openapi.json` liest, weiß danach, welche Felder die schlüssellose Anmeldung liefert, dass
  `keys_left_today` die freien Plätze seiner Grenze zählt und welche Grenze für ihn gilt.
- Herkunft: Zeile anmeldung in `ROADMAP.md`, Glied 04. Übernimmt `goals/_vorschlaege/anmeldung-kritik-2026-11-16-1.md` (Schwere 2,
  Kritik Tech Lead an anmeldung 03, Beleg `src/public/openapi.ts:103` bis `110` und `src/app.ts:1786` bis `1795`).
- `src/public/openapi.ts` liegt unter `src/` und damit im Laufzeitpfad von `deploy.yml`; das Goal rollt mit dem nächsten Deploy
  aus. Die Live-Prüfung des Release Managers bleibt `ops/smoke.sh` und `ops/live.sh` nach `LOOP.md`. Kein Maker und kein Release
  Manager ruft `POST /v1/auth/keyless` gegen die Produktion, weil jeder Aufruf dort einen echten Schlüssel anlegt und einem echten
  Aufrufer einen Platz des Tages nimmt; der Test ruft die Route nur in `createApp` mit `openDb(":memory:")`.
- Annahme (Tech Lead, 16.11.2026): Das Schema enthält auch `note`, obwohl der Vorschlag es nicht nennt, weil die echte Antwort das
  Feld trägt (`src/app.ts` Zeile 1788) und der Test in beide Richtungen vergleicht. Die Typen stammen aus der Route: `key`,
  `key_prefix`, `address` und `note` sind `string`, `docs` ist `string` mit `format: "uri"` (`DOC.authentication` aus
  `src/errors.ts`), `keys_left_today` ist `integer` mit `minimum: 0`. `address` bekommt kein Muster, weil der Wert `key:` plus Hex
  ist und keine Wallet-Adresse. `required` nennt alle sechs Felder, weil die Route jedes immer setzt.
- Annahme (Tech Lead, 16.11.2026): Das Schema steht als `const KEYLESS_KEY_SCHEMA = { type: "object", properties: { … }, required:
  [ … ] } as const;` in `src/public/openapi.ts` direkt unter `ERROR_SCHEMA` und wird mit `content: JSON_CONTENT(KEYLESS_KEY_SCHEMA)`
  an die Antwort 201 von `/v1/auth/keyless` gehängt; `description: "The key"` bleibt. Die Beschreibungen der Felder sind Englisch,
  ein Satz je Feld; die von `keys_left_today` lautet „Places of the caller's cap left today after this key, refills at midnight
  UTC.“.
- Annahme (Tech Lead, 16.11.2026): Der Text der Operation ersetzt „Capped per day across the instance.“ durch einen Satz nach dem
  Muster `Capped per day: everybody shares ${agentMintsPerDay()} keys a day, and a declared crawler (a user agent with a link and
  one of the words crawler, bot or indexer) has its own cap of ${crawlerMintsPerDay()} a day apart from that. Both refill at
  midnight UTC, and keys_left_today in the answer counts what is left of the caller's cap.`. Die Zahlen kommen aus den Funktionen
  und nicht aus den Konstanten, weil `CP_AGENT_MINTS_PER_DAY` und `CP_CRAWLER_MINTS_PER_DAY` sie in der laufenden Instanz ändern
  und der Kopf der Datei verlangt, dass die Beschreibung aus dem laufenden Dienst kommt; `openApiDocument` läuft je Anfrage
  (`src/app.ts` Zeile 1941 bis 1954), also liest jede Anfrage den aktuellen Wert. Dafür kommt eine Importzeile `import {
  agentMintsPerDay, crawlerMintsPerDay } from "../auth/keyless.js";` in `src/public/openapi.ts` dazu. `src/auth/keyless.ts` selbst
  ändert sich nicht, darum nennt dieses Goal `src/auth/**` nicht als änderbar.
- Annahme (Tech Lead, 16.11.2026): Die Antwort 429 bleibt, wie sie ist (`429: { description: "The day's mints are used up",
  content: JSON_CONTENT(ERROR_SCHEMA) }`), weil sie mit `ERROR_SCHEMA` schon beschrieben ist und ihr Text auf beide Codes passt.
  Zusammenfassung „A key with no wallet at all“, die ersten beiden Sätze des Texts und jeder andere Pfad des Dokuments bleiben
  byte-gleich.
- **Test `test/openapi-keyless.test.ts`** (neu), mit `createApp({ db: openDb(":memory:") })` und einem `afterEach`, das
  `CP_AGENT_MINTS_PER_DAY` und `CP_CRAWLER_MINTS_PER_DAY` löscht, in einem `describe("POST /v1/auth/keyless in /openapi.json")`:
  - `it("the 201 schema of POST /v1/auth/keyless names exactly the fields of a real answer")`: liest das Schema aus
    `GET /openapi.json` (`paths["/v1/auth/keyless"].post.responses["201"].content["application/json"].schema`), ruft
    `POST /v1/auth/keyless` mit User-Agent `node` und `x-forwarded-for: 192.0.2.50`, verlangt 201 und dass die sortierten
    Schlüssel des Körpers gleich den sortierten Schlüsseln von `schema.properties` sind und gleich dem sortierten `schema.required`
    (kein Feld fehlt, keins zu viel); je Feld passt der Wert zum Typ (`integer` heißt `Number.isInteger` und mindestens `minimum`,
    `string` heißt `typeof` string), und `keys_left_today` hat `type: "integer"`, `minimum: 0` und eine Beschreibung mit
    `midnight UTC`. Vor dem Fix rot (heute hat 201 kein `content`);
  - `it("the description of POST /v1/auth/keyless names the cap for everybody and the crawler cap")`: ohne gesetzte Umgebung enthält
    der Text `everybody shares 200 keys a day`, `declared crawler`, `own cap of 5 a day` und `midnight UTC` und nicht mehr
    `across the instance`. Vor dem Fix rot;
  - `it("the description of POST /v1/auth/keyless follows the caps set by the environment")`: mit `CP_AGENT_MINTS_PER_DAY=7` und
    `CP_CRAWLER_MINTS_PER_DAY=2` enthält der Text `everybody shares 7 keys a day` und `own cap of 2 a day`. Vor dem Fix rot.
  Rot vor dem Fix sind alle drei Fälle; die Zeile im Progress Log nennt das mit Zahl. Punkt 1 prüft es zusätzlich mit dem Stand von
  `src/public/openapi.ts` der Merge-Basis.
- Die Tests `test/openapi.test.ts`, `test/bazaar.test.ts`, `test/goal-19-ein-dollar.test.ts`, `test/not-for-sale.test.ts`,
  `test/inference-sunset.test.ts`, `test/goal-18-die-tuer.test.ts` und `test/keyless-crawler.test.ts` bleiben unverändert und grün
  (heute 78 passed in 7 Dateien).
- Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout. Kein `pkill -f`.

## Done Condition
- [x] Die Antwort 201 von `POST /v1/auth/keyless` in `/openapi.json` hat ein Schema mit genau den Feldern einer echten Antwort, und
      mit dem Stand von `src/public/openapi.ts` vor dem Goal ist der neue Test rot.
      Prüfung: `pnpm -s vitest run test/openapi-keyless.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "the 201 schema of POST /v1/auth/keyless names exactly the fields of a real answer|the description of POST /v1/auth/keyless names the cap for everybody and the crawler cap|the description of POST /v1/auth/keyless follows the caps set by the environment" test/openapi-keyless.test.ts` muss mindestens 3 ausgeben.
      Prüfung: `grep -cE 'content: JSON_CONTENT\(KEYLESS_KEY_SCHEMA\)' src/public/openapi.ts` muss 1 ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); cp src/public/openapi.ts "$T/"; git show "$B:src/public/openapi.ts" > src/public/openapi.ts; pnpm -s vitest run test/openapi-keyless.test.ts >/dev/null 2>&1; echo "rc=$?"; cp "$T/openapi.ts" src/public/openapi.ts; git status --porcelain -- src | wc -l` muss `rc=1` und danach 0 ausgeben.
- [x] Der Text der Operation nennt die Grenze für alle und die eigene Grenze erklärter Crawler aus der laufenden Konfiguration statt
      „Capped per day across the instance“.
      Prüfung: `grep -c 'Capped per day across the instance' src/public/openapi.ts` muss 0 ausgeben.
      Prüfung: `grep -cE '^import \{ agentMintsPerDay, crawlerMintsPerDay \} from "\.\./auth/keyless\.js";$' src/public/openapi.ts` muss 1 ausgeben.
      Prüfung: `grep -cE '\$\{(agentMintsPerDay|crawlerMintsPerDay)\(\)\}' src/public/openapi.ts` muss mindestens 2 ausgeben.
      Prüfung: `pnpm -s vitest run test/openapi-keyless.test.ts -t "follows the caps set by the environment"` muss Exit-Code 0 haben.
- [x] Alles andere am Dokument und an der Tür bleibt gleich: die Antwort 429, die übrigen Pfade, `src/auth/keyless.ts`, die Route
      und die bestehenden Tests.
      Prüfung: `grep -cE '429: \{ description: "The day.s mints are used up", content: JSON_CONTENT\(ERROR_SCHEMA\) \}' src/public/openapi.ts` muss 1 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- src/public/openapi.ts | grep -E '^-([^-]|$)' | grep -vcE 'One call, no signature|than run a whole automaton|security: \[\], responses: \{ 201: \{ description: "The key" \}'` muss 0 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- src/public/openapi.ts | grep -cE '^-([^-]|$)'` muss höchstens 3 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src/auth src/app.ts src/errors.ts test/openapi.test.ts test/bazaar.test.ts test/goal-19-ein-dollar.test.ts test/not-for-sale.test.ts test/inference-sunset.test.ts test/goal-18-die-tuer.test.ts test/keyless-crawler.test.ts ops | wc -l` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/openapi.test.ts test/bazaar.test.ts test/goal-19-ein-dollar.test.ts test/not-for-sale.test.ts test/inference-sunset.test.ts test/goal-18-die-tuer.test.ts test/keyless-crawler.test.ts` muss Exit-Code 0 haben.
- [x] `check` ist grün, nur die genannten Dateien ändern sich, und `check` lässt die Liste der eigenen Adressen und das
      Zustandsverzeichnis unberührt.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(src/public/openapi\.ts|test/openapi-keyless\.test\.ts|goals/anmeldung/.+)$'` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Fall war vor dem Fix rot; die Zeile im Progress Log nennt, welche und womit.
- [ ] Schema und echte Antwort 201 nennen dieselben Felder, und der Text nennt beide Grenzen mit den Zahlen der laufenden Instanz.
- [ ] Kein Lauf des Goals ruft `POST /v1/auth/keyless` oder `/openapi.json` gegen die Produktion.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/**`, `.github/**`, `scripts/**`, `harness/**`,
  `deploy/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- unter `src/` alles außer `src/public/openapi.ts`; ausdrücklich `src/auth/**`, `src/app.ts` und `src/errors.ts`
- in `src/public/openapi.ts` jeder Pfad außer `/v1/auth/keyless`, und dort die Zusammenfassung und die Antwort 429
- alle bestehenden Tests unter `test/`, ausdrücklich `test/openapi.test.ts` und `test/keyless-crawler.test.ts`
- `goals/_vorschlaege/**`
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), jede Datei auf dem Server und jeder Aufruf der Produktion;
  kein Rollout von Hand
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: `KEYLESS_KEY_SCHEMA` mit den sechs Feldern der echten Antwort hängt an der Antwort 201, der Text nennt `agentMintsPerDay()` und `crawlerMintsPerDay()` je Anfrage statt „across the instance“, 429 und alle anderen Pfade unverändert. Rot vor dem Fix: alle 3 neuen Fälle (3 failed mit dem Stand von `src/public/openapi.ts` der Merge-Basis e225bbf). Produktion nicht aufgerufen. Prüfbefehle (Node 22.23.5, PATH=/usr/bin:$PATH, am Commit a352b36): P1 vitest Exit 0 (3 passed), `3`, `1`, `rc=1` und `0`; P2 `0`, `1`, `2`, vitest Exit 0; P3 `1`, `0`, `2`, `0`, vitest Exit 0 (78 passed in 7 Dateien); P4 `node scripts/check.mjs` Exit 0 (1941 passed, grün in 119 s), `0`, `0`, `0`.

## Blockers
- keine
