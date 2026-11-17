# Anmeldung Goal 05: Die Schnittstelle nennt beide Gründe für ein 429 der Anmeldung

## Status
ACTIVE

## Active Objective
`/openapi.json` beschreibt die Antwort 429 von `POST /v1/auth/keyless` heute nur mit `ERROR_SCHEMA` und freiem `error`
(`src/public/openapi.ts` Zeile 135 am Kopf von `dev`, 187ac7a: `429: { description: "The day's mints are used up", content:
JSON_CONTENT(ERROR_SCHEMA) }`). Die Route antwortet aber mit drei festen Codes: `crawler_daily_limit`, wenn nur die eigene Grenze
eines erklärten Crawlers voll ist (`src/auth/keyless.ts` Zeile 210), `daily_limit`, wenn die Grenze für alle voll ist (Zeile 224),
beide mit `error`, `message` und `docs` (`src/app.ts` Zeile 1832), und `rate_limited` mit `retry_after_seconds`, wenn eine Adresse
mehr als 60 Aufrufe in der Minute schickt (Begrenzer für `OPEN_PATHS`, `src/app.ts` Zeile 633 und 652 bis 667). Ein Agent, der
nur das Dokument liest, weiß nach einem 429 nicht, ob er bis Mitternacht UTC warten oder den Weg mit Wallet nehmen muss, ob nur
seine Crawler-Kennung zählt oder ob er nach ein paar Sekunden einfach wieder fragen darf.
Nach diesem Goal hat die Antwort 429 ein eigenes Schema `KEYLESS_LIMIT_SCHEMA` mit `error` als `enum` aus genau diesen drei Codes,
dazu `message`, `docs` und `retry_after_seconds`, und die beiden Codes der Tagesgrenzen stehen einmal als Konstante
`KEYLESS_LIMIT_CODES` in `src/auth/keyless.ts`, aus der Route und Dokument lesen. Ein Test löst alle drei 429 in `createApp` aus und
hält `enum` und echte Codes in beide Richtungen gleich.
Widerlegt, wenn `/openapi.json` am Kopf von `dev` für die Antwort 429 von `POST /v1/auth/keyless` schon ein `enum` nennt.
MVP: Funktion, weil ein Agent nach einem 429 dann aus dem Dokument weiß, ob die Grenze für alle voll ist (morgen wieder oder Weg
mit Wallet), nur die Grenze seiner Crawler-Kennung oder nur der Begrenzer je Adresse, statt aufzugeben.

## Voraussetzungen
- anmeldung Goal 04 DONE

## Kontext für den Maker
- Ziel: Ein Agent oder Indexer, der nur `/openapi.json` liest, weiß nach einem 429 der schlüssellosen Anmeldung, welche Grenze ihn
  getroffen hat und was er dann tut.
- Herkunft: Zeile anmeldung in `ROADMAP.md`, Glied 05. Übernimmt `goals/_vorschlaege/anmeldung-kritik-2026-11-16-2.md` (Schwere 2,
  Kritik Tech Lead an anmeldung 04, Beleg `src/auth/keyless.ts:210` und `224`, `src/public/openapi.ts:135`).
- `src/public/openapi.ts` und `src/auth/keyless.ts` liegen unter `src/` und damit im Laufzeitpfad von `deploy.yml`; das Goal rollt
  mit dem nächsten fälligen Deploy aus. Die Live-Prüfung des Release Managers bleibt `ops/smoke.sh` und `ops/live.sh` nach
  `LOOP.md`. Kein Maker und kein Release Manager ruft `POST /v1/auth/keyless` gegen die Produktion, weil jeder Aufruf dort einen
  echten Schlüssel anlegt und einem echten Aufrufer einen Platz des Tages nimmt; die Tests rufen die Route nur in `createApp` mit
  `openDb(":memory:")`.
- `src/auth/keyless.ts` liegt unter `src/auth/**`; dieses Goal nennt die Datei ausdrücklich als änderbar (`loop-constraints.md`),
  aber nur für die Konstante und die beiden Codes in `mintAgentIdentity`. Grenzen, Zählung, Crawler-Regel und Hinweistexte bleiben.
- Annahme (Tech Lead, 17.11.2026): Das `enum` nennt auch `rate_limited`, obwohl Vorschlag und ROADMAP nur die beiden Tagesgrenzen
  nennen, weil der Begrenzer auf demselben Pfad mit Status 429 antwortet (`src/app.ts` Zeile 633, 652 bis 667); ein `enum` ohne ihn
  wäre falsch, und ein Agent, der seine Antwort gegen das Schema prüft, hielte ein echtes 429 für ungültig.
- Annahme (Tech Lead, 17.11.2026): Das Schema nennt `message` statt `hint`, wie der Vorschlag schreibt, weil die Route den Hinweis
  als `message` sendet (`src/app.ts` Zeile 1832: `{ error: e.code, message: e.hint, docs: DOC.authentication }`). Es steht als
  `const KEYLESS_LIMIT_SCHEMA = { … } as const;` in `src/public/openapi.ts` direkt unter `KEYLESS_KEY_SCHEMA` mit:
  `error` (`type: "string"`, `enum: [...Object.values(KEYLESS_LIMIT_CODES), "rate_limited"]`, Beschreibung ein Satz je Code:
  `daily_limit` heißt, die Schlüssel für alle sind für heute weg, wieder ab Mitternacht UTC oder ohne Grenze mit Wallet;
  `crawler_daily_limit` heißt, nur die eigene Grenze erklärter Crawler ist voll; `rate_limited` heißt, zu viele Aufrufe von dieser
  Adresse, nach `retry_after_seconds` wieder), `message` (`string`), `docs` (`string`, `format: "uri"`) und `retry_after_seconds`
  (`integer`, `minimum: 0`, Beschreibung „Only with rate_limited: seconds until this address may call again.“). `required` ist
  `["error", "message", "docs"]`, weil alle drei Antworten diese Felder tragen und nur `rate_limited` `retry_after_seconds` setzt.
  Die Antwort 429 wird `429: { description: "A cap is reached: the keys everybody shares today, the own cap of a declared crawler,
  or too many calls from one address", content: JSON_CONTENT(KEYLESS_LIMIT_SCHEMA) }`. Beschreibungen Englisch.
- Annahme (Tech Lead, 17.11.2026): Die Codes der Tagesgrenzen stehen einmal als `export const KEYLESS_LIMIT_CODES = { everybody:
  "daily_limit", crawler: "crawler_daily_limit" } as const;` in `src/auth/keyless.ts` (mit einem Kommentarsatz darüber, dass
  `/openapi.json` daraus liest), und die beiden `throw new KeylessError(` nehmen `KEYLESS_LIMIT_CODES.crawler` und
  `KEYLESS_LIMIT_CODES.everybody` statt der Literale. Damit folgt das Dokument jedem neuen oder umbenannten Code der Tür, statt
  still falsch zu werden. `src/public/openapi.ts` importiert die Konstante in der bestehenden Zeile: `import { agentMintsPerDay,
  crawlerMintsPerDay, KEYLESS_LIMIT_CODES } from "../auth/keyless.js";`. `rate_limited` bleibt ein Literal, weil der Begrenzer in
  `src/app.ts` liegt und dieses Goal ihn nicht anfasst.
- Annahme (Tech Lead, 17.11.2026): `test/openapi-keyless.test.ts` löscht `CP_AGENT_MINTS_PER_DAY` und `CP_CRAWLER_MINTS_PER_DAY`
  zusätzlich in einem `beforeEach`, weil die neuen Fälle kleine Grenzen setzen und eine in Shell oder CI gesetzte Variable sonst den
  bestehenden Fall „names the cap for everybody and the crawler cap“ rot macht (`goals/_vorschlaege/anmeldung-kritik-2026-11-16-3.md`,
  Schwere 1, ein Satz, nicht übernommen, hier mitgenommen, weil das Goal die Datei ohnehin anfasst). Die drei bestehenden Fälle
  bleiben byte-gleich.
- **Neue Fälle in `test/openapi-keyless.test.ts`**, in einem zweiten `describe("the 429 of POST /v1/auth/keyless in /openapi.json")`:
  - `it("the 429 schema of POST /v1/auth/keyless lists exactly the codes the door answers with")`: mit `CP_AGENT_MINTS_PER_DAY=1`
    und `CP_CRAWLER_MINTS_PER_DAY=1` in `createApp({ db: openDb(":memory:") })` je zwei `POST /v1/auth/keyless` mit User-Agent `node`
    und mit einem erklärten Crawler (etwa `ExampleBot/1.0 (+https://example.com/bot)`), jeweils 201 und danach 429; in einer
    zweiten `createApp({ db: openDb(":memory:"), rateLimit: { limit: 1, windowMs: 60_000 } })` zwei Aufrufe mit derselben
    `x-forwarded-for`, der zweite 429. Die sortierten `error` der drei 429 sind gleich dem sortierten `enum` aus
    `paths["/v1/auth/keyless"].post.responses["429"].content["application/json"].schema.properties.error.enum` (kein Code fehlt,
    keiner zu viel), und jeder Körper hat jedes Feld aus `required` und nur Felder aus `properties`. Vor dem Fix rot (heute kein
    `enum`);
  - `it("the 429 schema of POST /v1/auth/keyless says what each code means")`: die Beschreibung von `error` enthält jeden Code des
    `enum` und `midnight UTC`, `retry_after_seconds` hat `type: "integer"` und `minimum: 0`, und die Antwort 429 verweist nicht mehr
    auf das allgemeine `ERROR_SCHEMA` (ihr `error` hat ein `enum`). Vor dem Fix rot.
  Rot vor dem Fix sind beide neuen Fälle; die Zeile im Progress Log nennt das mit Zahl. Punkt 1 prüft es zusätzlich mit dem Stand
  von `src/public/openapi.ts` der Merge-Basis.
- Die Tests `test/openapi.test.ts`, `test/bazaar.test.ts`, `test/goal-19-ein-dollar.test.ts`, `test/not-for-sale.test.ts`,
  `test/inference-sunset.test.ts`, `test/goal-18-die-tuer.test.ts`, `test/keyless.test.ts`, `test/keyless-agent.test.ts` und
  `test/keyless-crawler.test.ts` bleiben unverändert und grün (am 17.11.2026 auf 187ac7a: `openapi-keyless`, `openapi`, `keyless`,
  `keyless-agent`, `keyless-crawler` und `goal-18-die-tuer` zusammen 54 passed in 6 Dateien).
- Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout. Kein `pkill -f`.

## Done Condition
- [x] Die Antwort 429 von `POST /v1/auth/keyless` in `/openapi.json` nennt in einem eigenen Schema genau die Codes, mit denen die
      Tür antwortet, und mit dem Stand von `src/public/openapi.ts` vor dem Goal ist der neue Test rot.
      Prüfung: `pnpm -s vitest run test/openapi-keyless.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "the 429 schema of POST /v1/auth/keyless lists exactly the codes the door answers with|the 429 schema of POST /v1/auth/keyless says what each code means" test/openapi-keyless.test.ts` muss mindestens 2 ausgeben.
      Prüfung: `grep -cE 'content: JSON_CONTENT\(KEYLESS_LIMIT_SCHEMA\)' src/public/openapi.ts` muss 1 ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); cp src/public/openapi.ts "$T/"; git show "$B:src/public/openapi.ts" > src/public/openapi.ts; pnpm -s vitest run test/openapi-keyless.test.ts >/dev/null 2>&1; echo "rc=$?"; cp "$T/openapi.ts" src/public/openapi.ts; git status --porcelain -- src | wc -l` muss `rc=1` und danach 0 ausgeben.
- [x] Die Codes der Tagesgrenzen stehen einmal in `src/auth/keyless.ts`, und Route und Dokument lesen sie von dort.
      Prüfung: `grep -cE '^export const KEYLESS_LIMIT_CODES = \{ everybody: "daily_limit", crawler: "crawler_daily_limit" \} as const;$' src/auth/keyless.ts` muss 1 ausgeben.
      Prüfung: `grep -cE '"(crawler_)?daily_limit"' src/auth/keyless.ts` muss 1 ausgeben.
      Prüfung: `grep -cE 'KEYLESS_LIMIT_CODES\.(everybody|crawler)' src/auth/keyless.ts` muss mindestens 2 ausgeben.
      Prüfung: `grep -cE '^import \{ agentMintsPerDay, crawlerMintsPerDay, KEYLESS_LIMIT_CODES \} from "\.\./auth/keyless\.js";$' src/public/openapi.ts` muss 1 ausgeben.
      Prüfung: `grep -cE 'Object\.values\(KEYLESS_LIMIT_CODES\)' src/public/openapi.ts` muss 1 ausgeben.
- [x] Der Test hängt nicht an der Umgebung der Shell.
      Prüfung: `grep -c 'beforeEach' test/openapi-keyless.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `CP_AGENT_MINTS_PER_DAY=9 CP_CRAWLER_MINTS_PER_DAY=9 pnpm -s vitest run test/openapi-keyless.test.ts` muss Exit-Code 0 haben.
- [x] Alles andere an Dokument und Tür bleibt gleich: die Antwort 201 und ihr Text, die übrigen Pfade, Grenzen und Hinweise der
      Tür, Route, Begrenzer und die bestehenden Tests.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- src/public/openapi.ts | grep -E '^-([^-]|$)' | grep -vcE "429: \{ description: \"The day.s mints are used up\", content: JSON_CONTENT\(ERROR_SCHEMA\) \}|^-import \{ agentMintsPerDay, crawlerMintsPerDay \} from"` muss 0 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- src/public/openapi.ts | grep -cE '^-([^-]|$)'` muss höchstens 2 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- src/auth/keyless.ts | grep -E '^-([^-]|$)' | grep -vcE '^-\s+"(crawler_)?daily_limit",$'` muss 0 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- src/auth/keyless.ts | grep -cE '^-([^-]|$)'` muss höchstens 2 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- test/openapi-keyless.test.ts | grep -E '^-([^-]|$)' | grep -vcE '^-import \{ afterEach, describe, expect, it \} from "vitest";$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src/app.ts src/errors.ts src/ratelimit.ts test/openapi.test.ts test/bazaar.test.ts test/goal-19-ein-dollar.test.ts test/not-for-sale.test.ts test/inference-sunset.test.ts test/goal-18-die-tuer.test.ts test/keyless.test.ts test/keyless-agent.test.ts test/keyless-crawler.test.ts ops | wc -l` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/openapi.test.ts test/bazaar.test.ts test/goal-19-ein-dollar.test.ts test/not-for-sale.test.ts test/inference-sunset.test.ts test/goal-18-die-tuer.test.ts test/keyless.test.ts test/keyless-agent.test.ts test/keyless-crawler.test.ts` muss Exit-Code 0 haben.
- [x] `check` ist grün, nur die genannten Dateien ändern sich, und `check` lässt die Liste der eigenen Adressen und das
      Zustandsverzeichnis unberührt.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(src/public/openapi\.ts|src/auth/keyless\.ts|test/openapi-keyless\.test\.ts|goals/anmeldung/.+)$'` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Fall war vor dem Fix rot; die Zeile im Progress Log nennt, welche und womit.
- [ ] `enum` der Antwort 429 und die Codes echter 429-Antworten aus `createApp` sind dieselben drei, und die Beschreibung sagt je
      Code, was der Agent dann tut.
- [ ] Kein Lauf des Goals ruft `POST /v1/auth/keyless` oder `/openapi.json` gegen die Produktion.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/**`, `.github/**`, `scripts/**`, `harness/**`,
  `deploy/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- unter `src/` alles außer `src/public/openapi.ts` und `src/auth/keyless.ts`; ausdrücklich `src/app.ts`, `src/errors.ts` und
  `src/ratelimit.ts`
- in `src/auth/keyless.ts` alles außer der neuen Konstante samt Kommentar und den beiden Codes in `mintAgentIdentity`; ausdrücklich
  Grenzen, Zählung, `isDeclaredCrawler` und die Hinweistexte
- in `src/public/openapi.ts` jeder Pfad außer `/v1/auth/keyless`, und dort Zusammenfassung, Text und Antwort 201
- alle bestehenden Tests unter `test/`; in `test/openapi-keyless.test.ts` jede bestehende Zeile außer der Importzeile von vitest
- `goals/_vorschlaege/**`
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), jede Datei auf dem Server und jeder Aufruf der Produktion;
  kein Rollout von Hand
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-17 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: `KEYLESS_LIMIT_CODES` steht einmal in `src/auth/keyless.ts` und speist beide `KeylessError` und das neue `KEYLESS_LIMIT_SCHEMA` (`error` als `enum` aus `daily_limit`, `crawler_daily_limit`, `rate_limited`, dazu `message`, `docs`, `retry_after_seconds`) an der Antwort 429 von `POST /v1/auth/keyless`; der Test löscht die beiden Grenzen zusätzlich in `beforeEach`, Route, Begrenzer, Grenzen und Hinweise unverändert. Rot vor dem Fix: beide neuen Fälle (2 failed, 3 passed, kein `enum`). Produktion nicht aufgerufen. Prüfbefehle (Node 22.23.5, PATH=/usr/bin:$PATH, am Commit 26840f1): P1 vitest Exit 0 (5 passed), `2`, `1`, `rc=1` und `0`; P2 `1`, `1`, `2`, `1`, `1`; P3 `2`, vitest mit Grenzen 9 Exit 0; P4 `0`, `2`, `0`, `2`, `0`, `0`, vitest Exit 0 (98 passed in 9 Dateien); P5 `node scripts/check.mjs` Exit 0 (2332 passed in 217 Dateien, grün in 79 s), `0`, `0`, `0`.
- 2026-11-17 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5; `dev` ohne neuen Commit seit der Merge-Basis 664866d, kein Merge nötig. Prüfbefehle (Node 22.23.5, PATH=/usr/bin:$PATH, am Commit 6dba186): P1 vitest Exit 0, `2`, `1`, `rc=1` und `0`; P2 `1`, `1`, `2`, `1`, `1`; P3 `2`, vitest mit Grenzen 9 Exit 0; P4 `0`, `2`, `0`, `2`, `0`, `0`, vitest Exit 0 (98 passed in 9 Dateien); P5 `node scripts/check.mjs` Exit 0 (grün in 51 s), `0`, `0`, `0`. Am PR #259 Kopf 6dba186: Job `check` pass, Job `e2e` pass (10m49s). Produktion nicht aufgerufen.

## Blockers
- keine
