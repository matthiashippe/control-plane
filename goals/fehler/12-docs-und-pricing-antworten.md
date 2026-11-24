# Fehler Goal 12: /docs und /pricing antworten

## Status
ACTIVE

## Active Objective
Am 2026-11-23 um 13:58:05 UTC holte ein Agent, der für einen Menschen liest (`Claude-User`), von einer fremden Adresse auf
automatonhost.com zuerst `/robots.txt` und `/` mit 200, danach `/docs` und `/pricing` und bekam beide Male 404
(`goals/_vorschlaege/werbung-fehler-2026-11-23-1.md`, Schwere 5). Er suchte Anleitung und Preis an den Pfaden, an denen sie bei fast
jedem Dienst liegen, und fand bei uns keins von beiden. Das ist ein Fehler eines echten Nutzers (`loop-constraints.md`, Grundregel 4)
genau in dem Kanal, über den Betreiber zu uns kommen. Nach diesem Goal leitet `/docs` auf `/llms.txt` weiter, und `/pricing`
antwortet mit 200 und einer Textseite mit allen Preisen aus dem Code: die drei Pakete per Karte, PayPal oder Apple Pay (nur, solange
der Notschalter aus ist), die Stufen über USDC und der Preis der Inferenz.
Leitzahl: Antworten mit 404 an einen Agenten (`Claude-User`, `ChatGPT-User`, `Perplexity-User`) auf `/docs` und `/pricing` je Woche
(`bash ops/traffic.sh 168`, Block `-- Agent fetches --`), Ziel 0.
Widerlegt, wenn `/docs` oder `/pricing` schon heute nicht mit 404 antworten (gemessen am 2026-11-24 auf `dev` f7351e3: `src/app.ts`
hat keine Route für einen der beiden Pfade).
MVP: Funktion, weil ein Agent, der für einen Betreiber nachsieht, bei uns weder Anleitung noch Preis fand und dann nichts empfehlen
kann.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel in einem Satz: Ein Agent, der für einen Betreiber `/docs` oder `/pricing` aufruft, bekommt die Anleitung und den Preis statt
  einer 404.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: werbung 02 hat gezeigt, dass Agenten unsere Seiten lesen, bevor sie
  einem Betreiber etwas raten. Wer bei uns Preis und Weg per Karte findet, kann uns nennen; wer eine 404 bekommt, rät zu etwas anderem.
- Quelle: `ROADMAP.md`, Topic `fehler`, Glied 12 (Tech Lead 24.11.2026, PRO-28911 aus der Triage PRO-28893). Übernimmt
  `goals/_vorschlaege/werbung-fehler-2026-11-23-1.md` und `goals/_vorschlaege/werbung-kritik-2026-11-23-5.md`.
- **Bestand am Kopf von `dev` (f7351e3).** `src/app.ts` hat Routen für `/llms.txt` (Zeile 2339, baut den Text aus `siteOrigin()`,
  `ERROR_PAGES`, `cardBreaker`, `notForSaleNow()` und `MARKUP`), `/fix` (Zeile 1157) und `/card/:package` (Zeile 1878), aber keine für
  `/docs` oder `/pricing`. Die Pakete stehen in `CARD_PACKAGES` (`src/payments/digistore.ts:60`, 5, 20 und 50 EUR), der Weg dorthin
  ist `/card/<packageKey(pkg)>` (`src/payments/card-way.ts:63`). Die Stufen über USDC stehen in `TOPUP_TIERS_USD`
  (`src/payments/pay.ts:43`) oder in `opts.pay.tiers`, so wie `/llms.txt` sie liest; der Weg ist `/pay/<usd>/<wallet>`
  (`src/app.ts:2624`). Den Notschalter liest jede Seite mit `cardBreaker(db, now).on`.
- **Entscheidungen des Tech Lead (24.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, fehler 12: …` in
  `goals/fehler/ANNAHMEN.md`.
  1. **`/docs` und `/docs/` leiten mit 302 auf `/llms.txt` weiter.** `/llms.txt` ist schon die Anleitung für Agenten: der Umzug mit
     `conwayApiUrl` im ersten Absatz, dann alle Endpunkte. Eine zweite Anleitung würde auseinanderlaufen. 302 statt 301, damit eine
     spätere eigene Seite ohne gecachte Weiterleitung kommen kann.
  2. **`/pricing` und `/pricing/` antworten mit 200 und `text/plain; charset=utf-8`**, weil der Leser ein Agent ist, der wie bei
     `/llms.txt` Text liest; die Startseite hat er vorher schon geholt. Erste Zeile `# Prices: automatonhost.com`. Darunter:
     solange der Notschalter aus ist, je Paket aus `CARD_PACKAGES` eine Zeile mit dem Betrag in EUR und dem Link
     `<siteOrigin>/card/<key>`, und eine Zeile, dass die Kasse Karte, PayPal und Apple Pay nimmt (so wie die Zeile in `/llms.txt`);
     bei Notschalter an steht dort kein Paket, kein `/card/`, kein „card“, „PayPal“ oder „Apple Pay“, sondern nur der Weg über USDC.
     Dann die Stufen über USDC aus derselben Quelle wie `/llms.txt` mit dem Muster `<siteOrigin>/pay/<usd>/<wallet>`, und der Preis
     der Inferenz mit genau dem Satz, den `/llms.txt` für denselben Zustand von `notForSaleNow()` schreibt. Zum Schluss eine Zeile, dass
     Credits nicht auszahlbar und nicht übertragbar sind, wie in `/llms.txt`. Kein Preis, keine Zahl und kein Versprechen, das nicht
     aus diesen Konstanten oder aus `/llms.txt` kommt.
  3. **`Cache-Control: no-store` auf `/pricing`**, weil die Seite vom Notschalter abhängt, wie `/card/:package`.
  4. **Sonst ändert sich nichts.** `/llms.txt`, die Startseite, `robots.txt` und die Sitemap bleiben, wie sie sind; dass `/llms.txt`
     oder die Startseite `/pricing` verlinken, ist ein späteres Glied, wenn es die Probe aus werbung verlangt.
- **Tests** in einer neuen Datei `test/docs-pricing.test.ts` mit `createApp({ db: openDb(":memory:") })` wie
  `test/card-way-pages.test.ts`, ohne Netz und ohne festen Port. Den Notschalter schaltet ein Fall wie dort mit einer Zeile in
  `card_orders` (Status `reversed`, Fehlbetrag `CARD_BREAKER_SHORTFALL_MC`). Neue Fälle: „redirects /docs to /llms.txt“,
  „answers /pricing with every card package while the breaker is off“, „names no card on /pricing while the breaker is on“ und
  „states the same inference price on /pricing as in /llms.txt“. Die Namen prüfen die Punkte. Jeder Fall war einmal rot, die Zeile im
  Progress Log sagt, womit.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `llms`, `robots`, `sitemap` oder `app.ts` nennen
  (`grep -l -E 'llms|robots|sitemap|app\.ts' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem Bau erneut. Wird einer
  durch dieses Goal rot, ohne dass sein Zweck verletzt ist (etwa ein Zähler der Routen), fragt der Maker den Tech Lead auf dem Topic
  mit Befehl und beiden Ausgaben; der entscheidet mit einer Zeile `Abgelöst:` im `ANNAHMEN.md` des alten Goals. Kein Prüfbefehl eines
  fertigen Goals wird umgeschrieben.
- **Live-Prüfung nach dem Release** (Release Manager, nicht Teil dieses Goals): `curl -s -o /dev/null -w '%{http_code}'
  https://automatonhost.com/docs` gibt `302`, für `/pricing` `200`, und eine Woche nach dem Rollout zeigt
  `bash ops/traffic.sh 168` keine 404 eines `Claude-User` auf einem der beiden Pfade.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Kauf, kein Aufruf von Digistore24, kein Wert in `/opt/control-plane/.env`, kein
  Rollout und kein Neustart durch einen Agent. Code, Bezeichner, Testnamen und Ausgaben englisch.

## Done Condition
- [x] `/docs` und `/docs/` leiten mit 302 auf `/llms.txt` weiter.
      MVP: Funktion, weil ein Agent, der die Anleitung an diesem Pfad sucht, sie dann findet.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/docs-pricing.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -qF '"redirects /docs to /llms.txt"' test/docs-pricing.test.ts && echo name ok` muss genau `name ok` ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const app = createApp({ db: openDb(":memory:") }); const bad = []; for (const p of ["/docs", "/docs/"]) { const r = await app.request(p); const l = r.headers.get("location") || ""; if (r.status !== 302 || !l.endsWith("/llms.txt")) bad.push(p + " " + r.status + " " + l); } console.log(bad.length ? bad.join("; ") : "docs ok")' 2>&1 | tail -1` muss genau `docs ok` ausgeben.
- [x] `/pricing` und `/pricing/` antworten mit 200 und Text: bei Notschalter aus mit jedem Paket per Karte, bei Notschalter an ohne
      Karte, beide Male mit den Stufen über USDC und demselben Preis der Inferenz wie `/llms.txt`.
      MVP: Funktion, weil ein Agent, der den Preis an diesem Pfad sucht, ihn dann findet, und bei geschlossener Kasse keinen Weg sieht,
      der nicht geht.
      Prüfung: `for t in "answers /pricing with every card package while the breaker is off" "names no card on /pricing while the breaker is on" "states the same inference price on /pricing as in /llms.txt"; do grep -qF "\"$t\"" test/docs-pricing.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const { CARD_BREAKER_SHORTFALL_MC: S } = await import("./src/payments/card-way.ts"); const { CARD_PACKAGES } = await import("./src/payments/digistore.ts"); const bad = []; const get = async (on, p) => { const db = openDb(":memory:"); if (on) { const t = new Date().toISOString(); db.prepare("INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)").run("TRIP", "771278", "0x" + "ef".repeat(20), "live", "reversed", S, S, t, t); } const r = await createApp({ db }).request(p); return { s: r.status, ct: r.headers.get("content-type") || "", b: await r.text() }; }; for (const p of ["/pricing", "/pricing/"]) { const off = await get(false, p); const on = await get(true, p); if (off.s !== 200 || on.s !== 200) bad.push(p + " status " + off.s + "/" + on.s); if (!off.ct.startsWith("text/plain")) bad.push(p + " type " + off.ct); for (const k of CARD_PACKAGES) { const e = String(k.grossEurCents / 100); if (!off.b.includes("/card/" + e)) bad.push(p + " card " + e + " missing"); } if (/\/card\/|card|paypal|apple pay/i.test(on.b)) bad.push(p + " card while on"); if (!off.b.includes("/pay/") || !on.b.includes("/pay/")) bad.push(p + " usdc missing"); } console.log(bad.length ? bad.join("; ") : "pricing ok")' 2>&1 | tail -1` muss genau `pricing ok` ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const app = createApp({ db: openDb(":memory:") }); const llms = await (await app.request("/llms.txt")).text(); const pr = await (await app.request("/pricing")).text(); const key = /purchase cost times [0-9]+(\.[0-9]+)?/.exec(llms)?.[0] || /not sell access to language models/.exec(llms)?.[0] || "NONE"; console.log(key !== "NONE" && pr.includes(key) ? "price ok" : "price differs: " + key)' 2>&1 | tail -1` muss genau `price ok` ausgeben.
- [x] Die Entscheidungen stehen in `goals/fehler/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg, und
      nichts im Repo nennt eine Adresse eines Kunden.
      MVP: Funktion, weil das nächste Glied wissen muss, warum `/docs` weiterleitet und woher jede Zahl auf `/pricing` kommt.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, fehler 12: ' goals/fehler/ANNAHMEN.md` muss mindestens 3 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/app\.ts|test/docs-pricing\.test\.ts|goals/fehler/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
- [x] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil sich `src/app.ts` im Laufzeitpfad ändert und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/fehler-12 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Agent, der `/docs` aufruft, landet auf der Anleitung in `/llms.txt`.
- [ ] Ein Agent, der `/pricing` aufruft, liest jeden Preis aus dem Code und bei geschlossener Kasse keinen Weg per Karte.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse eines Kunden, kein Satz zu PostYourPrice, kein Satz zu den Bedingungen des Einkaufs bei
      OpenRouter.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `ops/**`, `src/payments/**`, `src/inference/**`, `src/auth/**`, `src/konto/**`, `src/public/**`, `mcp/**`, `README.md`:
  unverändert
- `src/app.ts`: nur die neuen Routen `/docs`, `/docs/`, `/pricing` und `/pricing/` und was `/pricing` zum Bauen braucht; `/llms.txt`,
  `/`, `/robots.txt` und `/sitemap.xml` antworten Byte für Byte gleich (Entscheidung 4)
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
- 2026-11-24 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: Routen `/docs`, `/docs/` (302 auf `/llms.txt`) und `/pricing`, `/pricing/` (200 Text, `no-store`, Karte nur bei Notschalter aus) in `src/app.ts`, vier Fälle in `test/docs-pricing.test.ts`, fünf Zeilen in `goals/fehler/ANNAHMEN.md`. Rot gesehen: alle vier Fälle vor dem Bau mit 404, Gegenprobe mit Karte immer an und anderem Preissatz macht „names no card …“ und „states the same inference price …“ rot. `/llms.txt`, `/`, `/robots.txt`, `/sitemap.xml` gleich wie `origin/dev` f835fd5, die 15 Prüfbefehle mit `createApp` der DONE-Goals vorher und nachher gleich. Prüfbefehle: P1 vitest Exit 0, `name ok`, `docs ok`; P2 keine fehlende Testzeile, `pricing ok`, `price ok`; P3 `5`, `0`, `0`; P4 `e2e` pass an PR #414 (Kopf 2667d98); P5 `check` Exit 0 (273 Dateien, 2796 Tests, 269 s).
- 2026-11-24 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5; `dev` unverändert auf f835fd5, kein Merge nötig, alle Prüfbefehle am Kopf 74ec5e6 neu gefahren. Prüfbefehle: P1 vitest Exit 0, `name ok`, `docs ok`; P2 keine fehlende Testzeile, `pricing ok`, `price ok`; P3 `5`, `0`, `0`; P4 `e2e` pass an PR #414 (Kopf 74ec5e6, Zähler `1`); P5 `check` Exit 0 (273 Dateien, 2796 Tests, 91 s).

## Blockers
