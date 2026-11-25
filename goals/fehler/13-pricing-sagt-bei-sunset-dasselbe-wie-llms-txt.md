# Fehler Goal 13: /pricing sagt bei Sunset dasselbe wie /llms.txt

## Status
ACTIVE

## Active Objective
Seit fehler 12 baut `pricing` (`src/app.ts:2560`) die Sätze zu Kasse, USDC und Inferenz als Kopie der Zeilen aus `/llms.txt`
(`src/app.ts:2340`), und `test/docs-pricing.test.ts` prüft die Gleichheit nur mit `createApp({ db })` ohne `catalog`. Bei Sunset
(`intakeClosed`, Katalog da und ein Anbieter nicht mehr verkäuflich) nennen beide Seiten weiter die Kasse per Karte, PayPal und
Apple Pay, weil `cardOpen` nur den Notschalter fragt (`src/app.ts:2349` und `:2564`), und `/pricing` sagt nicht „Credits are no
longer sold here.“, obwohl `/llms.txt` es sagt und `/v1/discovery` `topup_tiers_usd: []` liefert. Gemessen am 2026-11-25 auf `dev`
a46a8b4 mit `pay`, Katalog aus `OpenRouterProvider` mit `resale: false` und `inferenceSunsetAt` 2026-10-17: vor und nach dem
Datum tragen `/llms.txt` und `/pricing` die Karte, nur `/llms.txt` trägt „Credits are no longer sold here.“. Nach diesem Goal kommen
die Sätze zu Kasse, USDC, Inferenz und Sunset aus kleinen Funktionen neben `pricing`, die beide Seiten aufrufen, und bei Sunset
tragen beide Seiten keine Karte, kein `/pay/` und denselben Satz „Credits are no longer sold here.“.
Leitzahl: Zustände, in denen `/pricing` etwas anbietet, das `/llms.txt` nicht anbietet, oder umgekehrt, Ziel 0 (gezählt über die
drei Zustände offen, vor dem Sunset-Datum und danach, Prüfbefehl in Punkt 1).
Widerlegt, wenn `/pricing` bei Sunset schon heute keine Karte nennt und den Satz aus `/llms.txt` trägt.
MVP: Funktion, weil ein Agent, der für einen Menschen liest, sonst eine Kasse empfiehlt, die nichts mehr verkauft.

## Voraussetzungen
- fehler Goal 12 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Agent, der bei Sunset `/pricing` oder `/llms.txt` liest, findet auf beiden Seiten dieselbe Antwort, dass
  hier keine Credits mehr verkauft werden, und keinen Weg per Karte oder USDC, der nichts mehr verkauft.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Agenten lesen unsere Seiten, bevor sie einem Betreiber etwas
  raten (werbung 02, fehler 12). Widersprechen sich zwei Seiten, rät der Agent zu einem Weg, der scheitert, und der Betreiber kommt
  nicht wieder.
- Quelle: `ROADMAP.md`, Topic `fehler`, Glied 13 (Tech Lead 25.11.2026, PRO-29721 aus der Triage PRO-29717). Übernimmt
  `goals/_vorschlaege/fehler-kritik-2026-11-24-1.md` und `goals/_vorschlaege/fehler-kritik-2026-11-24-2.md`.
- **Bestand am Kopf von `dev` (a46a8b4).** `intakeClosed` ist `sunsetting` (`src/app.ts:495`), `notForSaleNow()` ist wahr nach dem
  Sunset-Datum (`:494`), `endsAt()` liefert das Datum davor (`:491`). In `/llms.txt` steht die Zeile „No crypto needed: your person
  can top it up by card, PayPal or Apple Pay at …/#card“ (`:2357`) nur unter `cardOpen` (`:2349`), „- Credits are no longer sold
  here.“ (`:2425`) und „- Topup tiers in USD: …“ (`:2427`) hängen an `intakeClosed`, der Satz zur Inferenz an `notForSale`
  (`:2377`, `:2381`). In `pricing` hängt der Kartenblock an einem eigenen `cardOpen` (`:2564`), der USDC-Block an `intakeClosed`
  (`:2578`, seit fehler 12 Zyklus 4), der Satz zur Inferenz an `notForSale` (`:2591`, `:2592`). Die Literale „billed at purchase
  cost times“ und „Topup tiers in USD“ stehen je zweimal in `src/app.ts`, „Credits are no longer sold here.“ einmal.
- **Die drei Zustände für die Tests**, wie in `test/inference-sunset.test.ts` (`openRouterCatalog`, `setup`) und `closedApp` in
  `test/docs-pricing.test.ts`: offen ist `createApp` mit `pay` ohne `catalog`; vor dem Sunset ist ein Katalog aus
  `OpenRouterProvider` mit `resale: false` und `inferenceSunsetAt` in der Zukunft von `now` (Inferenz wird noch verkauft, die
  Annahme ist zu); nach dem Sunset derselbe Katalog mit `now` nach `inferenceSunsetAt` (`notForSaleNow()` wahr). Der Provider holt
  seine Modelle über ein gefälschtes `fetch`, kein Netz.
- **Entscheidungen des Tech Lead (25.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, fehler 13: …` in
  `goals/fehler/ANNAHMEN.md`.
  1. **Eine Regel für die Kasse per Karte auf beiden Seiten:** `const cardOpenNow = () => !intakeClosed && !cardBreaker(db,
     clock()).on;` neben `pricing` in `createApp`, und `/llms.txt` und `pricing` fragen nur noch `cardOpenNow()`. Grund: Bei Sunset
     verkauft die Kasse nichts, das ein Automaton noch für Inferenz nutzen kann, also nennt keine der beiden Seiten sie.
  2. **Ein Literal je Satz:** `"billed at purchase cost times "`, `"Credits are no longer sold here."` und `"Topup tiers in USD"`
     stehen danach je genau einmal in `src/app.ts`, in kleinen Funktionen oder Konstanten neben `pricing` (Namen frei, englisch,
     etwa `inferenceBilled()`, `NO_CREDITS_SOLD`, `topupTiersLine(tiers)`), und beide Seiten rufen sie. Jede Seite behält ihre
     eigene Einrahmung (`/llms.txt` das Zitat mit `> ` und den Strich `- `), damit `/llms.txt` im offenen Zustand Byte für Byte
     bleibt.
  3. **`/pricing` bei Sunset:** statt Karten- und USDC-Block steht nach der Überschrift `## Credit`, eine Leerzeile und genau der
     Satz `Credits are no longer sold here.`; der Block `## Inference` und die Schlusszeile zu Credits bleiben. Kein Enddatum der
     Inferenz auf `/pricing` (fehler 12 Zyklus 3, Linse B).
  4. **`/llms.txt` bei Sunset:** nur die Zeile „No crypto needed: … card, PayPal or Apple Pay …/#card“ fällt weg; alles andere
     bleibt, wie es ist.
  5. **Sonst ändert sich nichts.** Im offenen Zustand und bei Notschalter an antworten `/llms.txt` und `/pricing` Byte für Byte wie
     am Kopf von `dev`; die Kasse selbst (`cardRedirect`, `handleDigistoreIpn`), die Startseite (`src/app.ts:1825`) und die
     Fehlerseiten (`:1195`) kennen den Sunset weiter nicht. Das nimmt die Watch-List-Zeile `wache-nacharbeit-2026-11-25-1` mit, wenn
     ein Goal an die Kasse geht.
- **Tests** in `test/docs-pricing.test.ts`, ohne Netz und ohne festen Port. Neue Fälle: „keeps card and USDC on /pricing and
  /llms.txt while topups are open“, „offers no card and sells no credits on /pricing and /llms.txt before the sunset“ und „offers no
  card and sells no credits on /pricing and /llms.txt after the sunset“. Jeder Fall prüft beide Seiten: Karte (`/card/`, `/#card`,
  PayPal, Apple Pay), `/pay/`, der Satz „Credits are no longer sold here.“ und derselbe Satz zur Inferenz („billed at purchase cost
  times“ oder „not sell access to language models“) auf beiden Seiten. Die beiden Sunset-Fälle sind am Kopf von `dev` rot; die Zeile
  im Progress Log sagt, womit.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `llms`, `pricing` oder `app.ts` nennen
  (`grep -l -E 'llms|pricing|app\.ts' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem Bau erneut. Für Entscheidung
  5 je Zustand (offen, Notschalter an) einen sha256 der Antworten von `/llms.txt` und `/pricing` gegen einen Worktree von
  `origin/dev` messen und ins Progress Log schreiben. Wird ein fremder Prüfbefehl rot, ohne dass sein Zweck verletzt ist, fragt der
  Maker den Tech Lead auf dem Topic mit Befehl und beiden Ausgaben; der entscheidet mit einer Zeile `Abgelöst:` im `ANNAHMEN.md` des
  alten Goals. Kein Prüfbefehl eines fertigen Goals wird umgeschrieben.
- **Live-Prüfung nach dem Release** (Release Manager, nicht Teil dieses Goals): Produktion läuft heute ohne Sunset, also bleiben
  `curl -s https://automatonhost.com/pricing` und `/llms.txt` gleich wie vor dem Rollout.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Kauf, kein Aufruf von Digistore24, kein Wert in `/opt/control-plane/.env`, kein
  Rollout und kein Neustart durch einen Agent. Code, Bezeichner, Testnamen und Ausgaben englisch.

## Done Condition
- [x] Bei Sunset, vor und nach dem Datum, nennen `/pricing` und `/llms.txt` keine Karte und kein `/pay/` und tragen beide „Credits
      are no longer sold here.“; im offenen Zustand nennen beide Karte und `/pay/`; in jedem Zustand steht auf beiden Seiten derselbe
      Satz zur Inferenz.
      MVP: Funktion, weil ein Agent bei Sunset sonst eine Kasse empfiehlt, die nichts mehr verkauft.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/docs-pricing.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "keeps card and USDC on /pricing and /llms.txt while topups are open" "offers no card and sells no credits on /pricing and /llms.txt before the sunset" "offers no card and sells no credits on /pricing and /llms.txt after the sunset"; do grep -qF "\"$t\"" test/docs-pricing.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const { OpenRouterProvider } = await import("./src/inference/openrouter.ts"); const { Catalog } = await import("./src/inference/proxy.ts"); const S = new Date("2026-10-17T00:00:00Z"); const m = { data: [{ id: "openai/gpt-5-mini", context_length: 400000, pricing: { prompt: "0.00000025", completion: "0.000002" } }] }; const cat = async () => { const p = new OpenRouterProvider({ apiKey: "sk-or-v1-test", models: ["openai/gpt-5-mini"], fetch: async () => new Response(JSON.stringify(m), { headers: { "content-type": "application/json" } }), priceRefreshMs: 0, baseUrl: "https://openrouter.ai/api/v1", resale: false }); await p.init(); return new Catalog([p], p.defaultAliases()); }; const pay = { payTo: "0x" + "1".repeat(40), network: "base", usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", tiers: [5, 25, 100] }; const st = { open: async () => createApp({ db: openDb(":memory:"), pay }), before: async () => createApp({ db: openDb(":memory:"), pay, catalog: await cat(), inferenceSunsetAt: S, now: () => new Date("2026-10-01T12:00:00Z") }), after: async () => createApp({ db: openDb(":memory:"), pay, catalog: await cat(), inferenceSunsetAt: S, now: () => new Date(S.getTime() + 1000) }) }; const bad = []; for (const [n, mk] of Object.entries(st)) { const app = await mk(); const f = []; for (const p of ["/llms.txt", "/pricing"]) { const b = await (await app.request(p)).text(); f.push([/\/card\/|\/#card|paypal|apple pay/i.test(b), b.includes("/pay/"), b.includes("Credits are no longer sold here."), b.includes("billed at purchase cost times"), b.includes("not sell access to language models")].join()); } const want = n === "open" ? "true,true,false" : "false,false,true"; for (const [i, x] of f.entries()) if (!x.startsWith(want)) bad.push(n + " " + ["/llms.txt", "/pricing"][i] + " " + x); if (f[0].split(",").slice(3).join() !== f[1].split(",").slice(3).join()) bad.push(n + " inference differs"); } console.log(bad.length ? bad.join("; ") : "sunset ok")' 2>&1 | tail -1` muss genau `sunset ok` ausgeben.
- [x] Die Sätze kommen aus einer Quelle: je Literal genau eine Stelle in `src/app.ts`, und beide Seiten fragen dieselbe Regel für
      die Karte.
      MVP: Funktion, weil der nächste Satz, der sich ändert, sonst wieder nur auf einer Seite landet.
      Prüfung: `echo $(for s in 'billed at purchase cost times' 'Credits are no longer sold here.' 'Topup tiers in USD'; do grep -cF "$s" src/app.ts; done)` muss genau `1 1 1` ausgeben.
      Prüfung: `grep -c 'cardOpenNow()' src/app.ts` muss mindestens 2 ausgeben.
- [x] Die Entscheidungen stehen in `goals/fehler/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg, und
      nichts im Repo nennt eine Adresse eines Kunden.
      MVP: Funktion, weil das nächste Glied wissen muss, warum beide Seiten bei Sunset die Karte weglassen.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, fehler 13: ' goals/fehler/ANNAHMEN.md` muss mindestens 3 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/app\.ts|test/docs-pricing\.test\.ts|goals/fehler/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
- [x] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil sich `src/app.ts` im Laufzeitpfad ändert und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/fehler-13 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Agent, der bei Sunset `/pricing` oder `/llms.txt` liest, findet keinen Weg per Karte oder USDC und auf beiden Seiten den
      Satz „Credits are no longer sold here.“.
- [ ] Im offenen Zustand und bei Notschalter an liest ein Agent auf beiden Seiten genau, was er heute liest.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse eines Kunden, kein Satz zu PostYourPrice, kein Satz zu den Bedingungen des Einkaufs bei
      OpenRouter.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `ops/**`, `src/payments/**`, `src/inference/**`, `src/auth/**`, `src/konto/**`, `src/public/**`, `mcp/**`, `README.md`:
  unverändert; die Kasse (`cardRedirect`, `handleDigistoreIpn`) bleibt, wie sie ist (Entscheidung 5)
- `src/app.ts`: nur die Routen `/llms.txt` und `/pricing` und die neuen Funktionen oder Konstanten neben `pricing`; die Startseite,
  die Fehlerseiten, `/v1/discovery`, `/.well-known/x402` und jede andere Route antworten Byte für Byte gleich, `/llms.txt` und
  `/pricing` im offenen Zustand und bei Notschalter an ebenso (Entscheidung 5)
- `test/**` außer `test/docs-pricing.test.ts`: unverändert; kein bestehender Fall in `test/docs-pricing.test.ts` wird gelockert
- `docs/soll/**`: unverändert, keine Fläche der Startseite ändert sich
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`,
  die der Tech Lead entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- ein Kauf, ein Aufruf von Digistore24, ein POST an `/pay/digistore` der Produktion, jeder Wert in `/opt/control-plane/.env`, ein
  Rollout oder Neustart durch einen Agent, Wallet-Bewegung, Topup, Gutschrift von Hand (`loop-constraints.md`, Grundregeln 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-25 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: `cardOpenNow()`, `NO_CREDITS_SOLD`, `inferenceBilled()` und `topupTiersLine()` neben `pricing`, beide Seiten rufen sie, `/pricing` trägt bei Sunset `## Credit` mit dem Satz, `/llms.txt` verliert dann nur die Zeile zur Karte; vier Zeilen in `goals/fehler/ANNAHMEN.md`. Neue Fälle: die beiden Sunset-Fälle am Kopf von `dev` 58ecae6 rot (`llms: expected … not to match /\/card\/|\/#card|paypal|apple pay/i`), der offene Fall war dort grün und wurde rot, als `cardOpenNow` testweise `false` lieferte; Einzeiler aus Punkt 1 vorher `before /llms.txt true,false,true,true,false; before /pricing true,false,false,true,false; after /llms.txt true,false,true,false,true; after /pricing true,false,false,false,true`. sha256 von `/llms.txt`, `/pricing` und `/pricing/` (Datum maskiert) offen und bei Notschalter an, je mit und ohne `pay`, vor und nach dem Bau gleich (12 von 12); die 15 Prüfbefehle der DONE-Goals mit `llms` oder `pricing` in der Prüfzeile (fehler 12, reichweite 04, werbung 01, umzug 02 und 03) liefern vor und nach dem Bau dieselbe Ausgabe. Prüfbefehle: P1 vitest Exit 0 (8 von 8), keine fehlende Testzeile, `sunset ok`; P2 `1 1 1`, `2`; P3 `4`, `0`, `0`; P4 `e2e` an PR #441 am Kopf nach diesem Commit (Ergebnis im Kommentar des Childs); P5 `check` Exit 0 (277 Dateien, 2858 Tests).
- 2026-11-25 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5; `dev` steht auf 58ecae6 wie die Merge-Basis, also kein Merge nötig. Prüfbefehle: P1 vitest Exit 0 (8 von 8), keine fehlende Testzeile, `sunset ok`; P2 `1 1 1`, `2`; P3 `4`, `0`, `0`; P4 `1` (`check` und `e2e` an PR #441 am Kopf 8215159 pass, dieser Commit ändert nur die Goal-Datei); P5 `check` Exit 0 (277 Dateien, 2858 Tests).

## Blockers
