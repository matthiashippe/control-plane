# Wache Goal 02: Kein toter Knopf zur Kasse

## Status
PLANNED

## Active Objective
Seit wache 01 und werbung 01 zeigt die Startseite bei eingeschaltetem Notschalter den ersten Bildschirm von wache 01 (zwischen
`<!--NOCARD-->` und `<!--/NOCARD-->` in `src/public/index.html`) und lässt den Block `card` weg. In diesem ersten Bildschirm steht
aber weiter der Knopf „Pay by card“ mit `href="#card"`: Jeder Besucher, der ihn klickt, landet auf einem Anker, den es dann nicht
gibt, statt den Weg über USDC zu sehen. Dazu entsteht der Link über USDC zweimal, einmal in `usdcTopupUrl` in
`src/payments/card-way.ts` für die Seite des Notschalters und dreimal von Hand in `src/inference/proxy.ts` für die 402. Und die
Selftests von `ops/digistore.mjs` und `ops/digistore-release.mjs`, die belegen, dass beide Werkzeuge nie an ein Produkt der anderen
Projekte im geteilten Konto von Digistore24 schreiben, läuft kein Test unter `test/`, also prüft `check` diese Schreibsperre nie.
Nach diesem Goal steht bei Notschalter an kein `href="#card"` auf `/`, die 402 holt jeden Link über USDC aus `usdcTopupUrl`, und
`test/digistore-tool.test.ts` fährt beide Selftests samt je einer Gegenprobe in jedem `check`.
Leitzahl: Fehlbetrag aus Erstattungen von Live-Bestellungen der letzten 60 Tage (`ops/card-breaker.sh`, Feld `shortfall_usd`).
Grenze dieses Goals: Wer die Kasse von Digistore24 einmal gesehen hat, kann sie weiter direkt aufrufen, und die IPN schreibt auch bei
Notschalter an gut; das ist der offene Vorschlag `goals/_vorschlaege/wache-kritik-2026-11-23-1.md` und nicht Teil dieses Goals.
Widerlegt, wenn bei Notschalter an schon heute kein `href="#card"` auf `/` steht (gemessen am 2026-11-23 auf `dev` 5c818ae: genau 1).
MVP: Funktion, weil bei Notschalter an jeder Besucher einen Knopf ohne Ziel klickt statt den Weg über USDC zu sehen, und ein Bruch
der Schreibsperre die Kasse von drei anderen Produkten im geteilten Konto trifft.

## Voraussetzungen
- wache Goal 01 DONE
- werbung Goal 01 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ist der Notschalter an, führt kein Knopf der Startseite ins Leere, Seite des Notschalters und 402 nennen
  denselben Weg über USDC, und `check` fängt jeden Bruch der Schreibsperre der beiden Werkzeuge für Digistore24.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Wer bei geschlossener Kasse auf die Startseite kommt, sieht nur
  Wege, die gehen (`/fix` und USDC), statt nach einem toten Klick abzuspringen; und karte 03 und jedes spätere Glied der Karte
  dürfen die Werkzeuge ändern, ohne dass ein Fehler die Kasse von Personalplaner24, Bautagebuch24 oder Aszendent24 trifft.
- Quelle: `ROADMAP.md`, Topic `wache`, Glied 02 (Tech Lead 23.11.2026, PRO-28123). Übernimmt
  `goals/_vorschlaege/wache-nacharbeit-2026-11-23-1.md`, `goals/_vorschlaege/wache-nacharbeit-2026-11-23-2.md`,
  `goals/_vorschlaege/karte-nacharbeit-2026-11-23-1.md` und `goals/_vorschlaege/karte-nacharbeit-2026-11-23-2.md`.
- **Bestand am Kopf von `dev` (5c818ae).** `src/public/index.html` trägt den ersten Bildschirm zweimal: den von werbung 01 zwischen
  `<!--CARD-->` und `<!--/CARD-->` (Zeilen 913 bis 940, sein Knopf „Pay by card“ in Zeile 924 fällt bei Notschalter an mit dem Block
  weg) und den von wache 01 zwischen `<!--NOCARD-->` und `<!--/NOCARD-->` (Zeilen 941 bis 968). `keepNoCardWay` in `src/app.ts`
  behält den zweiten nur bei Notschalter an. In ihm steht in Zeile 953 `<a class="btn btn-2" href="#card">Pay by card</a>`, der tote
  Knopf. `usdcTopupUrl(address)` in `src/payments/card-way.ts:99` baut `<siteOrigin>/pay/5/<address in Kleinbuchstaben>`;
  `src/inference/proxy.ts` baut denselben Link in Zeile 367 („Buy credits at …“), 377 (`message_for_operator` ohne Karte) und 387
  (`topup_url`) selbst. Die Adresse der 402 ist schon klein, weil `src/auth/siwe.ts:152` sie so speichert. `ops/digistore.mjs
  --selftest` und `ops/digistore-release.mjs --selftest` enden heute mit Exit 0 und letzter Zeile `SELFTEST OK`, brauchen kein Netz
  und laufen in je unter einer Sekunde; `ops/digistore-release.mjs` importiert `./digistore.mjs`.
- **Entscheidungen des Tech Lead (23.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, wache 02: …` in
  `goals/wache/ANNAHMEN.md`.
  1. **Der Knopf fällt aus dem Block für Notschalter an.** Die Zeile 953 kommt aus `src/public/index.html` heraus, sonst ändert sich
     an der Datei nichts. Eine eigene Marke, wie sie `ROADMAP.md` nennt, braucht es nicht: Der Block zwischen `<!--NOCARD-->` und
     `<!--/NOCARD-->` steht nur bei Notschalter an auf der Seite, eine Marke darin würde also immer entfernt. `stripCardWay` und
     `keepNoCardWay` bleiben, wie sie sind. Der erste Bildschirm bei Notschalter aus bleibt Byte für Byte gleich, also bleiben die
     SOLL-Bilder `docs/soll/startseite-390.png` und `docs/soll/startseite-1440.png` gültig; bei Notschalter an fällt nur ein Knopf ohne
     Ziel weg, so wie wache 01 dort den Block `card` weglässt. Ein neues SOLL-Bild braucht das nicht.
  2. **Ein Link über USDC.** `src/inference/proxy.ts` importiert `usdcTopupUrl` aus `../payments/card-way.js` und setzt ihn an allen
     drei Stellen ein (etwa einmal als `const topupUrl = usdcTopupUrl(address)`); danach nennt die Datei `/pay/5/` nicht mehr. Wortlaut,
     Felder und Reihenfolge der 402 bleiben, wie sie sind (Upstream `src/conway/topup.ts:103` liest den Text).
  3. **Die Selftests in `check`.** Neue Datei `test/digistore-tool.test.ts` nach dem Muster von `test/abort-purchase.test.ts:93`
     (`spawnSync`, eigenes Zeitlimit, kein Netz): je Werkzeug ein Fall, der `node ops/<werkzeug> --selftest` startet und Exit 0 und als
     letzte Zeile `SELFTEST OK` verlangt, und eine Gegenprobe, die das Werkzeug (bei `digistore-release.mjs` zusammen mit
     `digistore.mjs`) in ein Verzeichnis aus `mkdtempSync` kopiert, dort die Schreibsperre ausschaltet und Exit 1 und eine letzte Zeile,
     die mit `SELFTEST FAILED` beginnt, verlangt. Ausgeschaltet wird in `ops/digistore.mjs` die Zeile `if (PROTECTED.has(id)) throw`
     (ersetzt durch `if (false) throw`), in `ops/digistore-release.mjs` die Zeile `if (!own.includes(String(id))) throw` (ebenso); beide
     Ersetzungen sind am 2026-11-23 gemessen und machen den Selftest rot (`SELFTEST FAILED (2)` und `SELFTEST FAILED (1)`). Trifft die
     Ersetzung nichts, schlägt der Fall fehl, statt still grün zu sein. Die beiden Werkzeuge selbst ändert dieses Goal nicht.
- **Tests** mit festen Zeiten oder der aktuellen Zeit wie `test/werbung.test.ts`, ohne Netz und ohne festen Port. Neue Fälle:
  „links nowhere to #card on the start page while the breaker is on“ in `test/card-way-pages.test.ts`,
  „names the same way over USDC in the 402 and on the paused page“ in `test/card-way-pages.test.ts` (vergleicht `details.topup_url`
  der 402 mit `topupUrl` aus `cardRedirect` bei Notschalter an, für dieselbe Adresse; der bestehende Fall „names no card in the
  402 while the breaker is on“ behält seine Erwartung `https://automatonhost.com/pay/5/<address>` als festen Text, weil die
  Gegenprobe von Punkt 2 an ihr zeigt, dass die 402 `usdcTopupUrl` folgt), und in `test/digistore-tool.test.ts`
  „passes the selftest of ops/digistore.mjs without network“, „fails the selftest of ops/digistore.mjs once the write gate lets a
  protected product through“, „passes the selftest of ops/digistore-release.mjs without network“ und „fails the selftest of
  ops/digistore-release.mjs once assertOwn lets a foreign product through“. Die Namen prüfen die Punkte. Testadressen sind nur
  Wiederholungen eines Hex-Paars (`0x` plus 20 Mal `ef`). Jeder neue Fall auf `/` war einmal rot, die Zeile im Progress Log sagt,
  womit.
- **Was mitzieht.** `test/werbung.test.ts` vergleicht im Fall „shows the first screen of wache 01 while the card breaker is on“ den
  ersten Bildschirm mit der Konstante `WACHE_01_FIRST_SCREEN`; aus ihr fällt dieselbe Zeile mit `href="#card"` (ändern, nicht
  löschen, der Name des Falls bleibt, weil werbung 01 Punkt 5 ihn prüft). Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die
  `index.html`, `werbung.test`, `card-way-pages`, `card-checkout`, `proxy` oder `digistore` nennen
  (`grep -l -E 'index\.html|werbung\.test|card-way-pages|card-checkout|proxy|digistore' goals/*/[0-9]*.md`), einmal am Kopf von `dev`
  fahren und nach dem Bau erneut. Wird einer durch dieses Goal rot, ohne dass sein Zweck verletzt ist, fragt der Maker den Tech Lead
  auf dem Topic mit Befehl und beiden Ausgaben; der entscheidet mit einer Zeile `Abgelöst:` im `ANNAHMEN.md` des alten Goals. Kein
  Prüfbefehl eines fertigen Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Kauf, kein Aufruf von Digistore24, kein Wert in `/opt/control-plane/.env`, kein
  Rollout und kein Neustart durch einen Agent. Code, Bezeichner, Testnamen und Ausgaben englisch.

## Done Condition
- [x] Ist der Notschalter an, steht auf `/` kein `href="#card"` und kein Block `card`; ist er aus, bleiben Knopf, Block und erster
      Bildschirm, wie sie sind.
      MVP: Funktion, weil bei Notschalter an jeder Klick auf den Knopf ins Leere geht, statt den Weg über USDC zu zeigen.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-pages.test.ts test/werbung.test.ts test/card-checkout.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -qF '"links nowhere to #card on the start page while the breaker is on"' test/card-way-pages.test.ts && echo name ok` muss genau `name ok` ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const { CARD_BREAKER_SHORTFALL_MC: S } = await import("./src/payments/card-way.ts"); const bad = []; const page = async (on) => { const db = openDb(":memory:"); if (on) { const t = new Date().toISOString(); db.prepare("INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)").run("TRIP", "771278", "0x" + "ef".repeat(20), "live", "reversed", S, S, t, t); } return (await createApp({ db }).request("/")).text(); }; const on = await page(true); const off = await page(false); const n = (s, w) => s.split(w).length - 1; if (n(on, "href=\"#card\"") !== 0) bad.push("an " + n(on, "href=\"#card\"")); if (n(on, "id=\"card\"") !== 0) bad.push("block an"); if (n(on, "id=\"move\"") !== 1) bad.push("move an"); if (n(off, "href=\"#card\"") < 1) bad.push("aus 0"); if (n(off, "id=\"card\"") !== 1) bad.push("block aus"); console.log(bad.length ? bad.join("; ") : "anker ok")' 2>&1 | tail -1` muss genau `anker ok` ausgeben.
      Prüfung: `git diff --numstat $(git merge-base origin/dev HEAD) HEAD -- src/public/index.html | tr '\t' ' '` muss genau `0 1 src/public/index.html` ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- src/public/index.html | grep -c '^-      <a class="btn btn-2" href="#card">Pay by card</a>$'` muss genau 1 ausgeben.
      Prüfung: `grep -c 'href="#card"' src/public/index.html` muss genau 1 ausgeben.
- [x] Die 402 nennt den Weg über USDC nur aus `usdcTopupUrl`, und er ist derselbe wie auf der Seite des Notschalters.
      MVP: Funktion, weil sonst ein Goal, das Pfad oder Stufe ändert, auf der Seite des Notschalters einen anderen Weg zeigt als in der
      402, und ein Automaton dann an einer der beiden Stellen nicht zahlen kann.
      Prüfung: `grep -c '/pay/5/' src/inference/proxy.ts` muss 0 ausgeben.
      Prüfung: `grep -c 'usdcTopupUrl' src/inference/proxy.ts` muss mindestens 2 ausgeben.
      Prüfung: `grep -qF '"names the same way over USDC in the 402 and on the paused page"' test/card-way-pages.test.ts && echo name ok` muss genau `name ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-pages.test.ts test/card-way.test.ts test/werbung.test.ts test/messages.test.ts test/the-way-to-pay.test.ts test/inference-sunset.test.ts test/goal-18-die-tuer.test.ts test/automatonhost.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's#/pay/5/\${address.toLowerCase()}#/pay/20/${address.toLowerCase()}#' $T/src/payments/card-way.ts; grep -q '/pay/20/' $T/src/payments/card-way.ts || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-pages.test.ts -t "names no card in the 402 while the breaker is on" > /dev/null 2>&1); echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
- [x] `check` fährt die Selftests von `ops/digistore.mjs` und `ops/digistore-release.mjs` samt je einer Gegenprobe, und beide Werkzeuge
      bleiben, wie sie sind.
      MVP: Funktion, weil beide Werkzeuge in ein Konto schreiben, das wir mit Personalplaner24, Bautagebuch24 und Aszendent24 teilen,
      und ihre Schreibsperre bisher nur ein Prüfbefehl fertiger Goal-Dateien belegt, den nach dem Merge niemand mehr fährt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/digistore-tool.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "passes the selftest of ops/digistore.mjs without network" "fails the selftest of ops/digistore.mjs once the write gate lets a protected product through" "passes the selftest of ops/digistore-release.mjs without network" "fails the selftest of ops/digistore-release.mjs once assertOwn lets a foreign product through"; do grep -qF "\"$t\"" test/digistore-tool.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/if (PROTECTED.has(id)) throw/if (false) throw/' $T/ops/digistore.mjs; grep -q 'if (false) throw' $T/ops/digistore.mjs || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/digistore-tool.test.ts > /dev/null 2>&1); echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/if (!own.includes(String(id))) throw/if (false) throw/' $T/ops/digistore-release.mjs; grep -q 'if (false) throw' $T/ops/digistore-release.mjs || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/digistore-tool.test.ts > /dev/null 2>&1); echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops | wc -l` muss 0 ausgeben.
- [x] Die Entscheidungen stehen in `goals/wache/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg, und
      nichts im Repo nennt eine Adresse eines Kunden.
      MVP: Funktion, weil karte 03 und jedes spätere Glied der Karte wissen müssen, warum der Knopf fehlt und wo der Link über USDC
      entsteht.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, wache 02: ' goals/wache/ANNAHMEN.md` muss mindestens 3 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/public/index\.html|src/inference/proxy\.ts|test/(card-way-pages|card-way|werbung|card-checkout|digistore-tool)\.test\.ts|goals/wache/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- . ':!goals' | grep '^+' | grep -oE '0x[0-9a-fA-F]{40}' | sort -u | awk '{s=substr($0,3,2); r=""; for(i=0;i<20;i++) r=r s; if (substr($0,3)!=r) n++} END{print n+0}'` muss 0 ausgeben.
- [x] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil sich die 402 im Laufzeitpfad ändert und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/wache-02 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] Jeder Anker-Link auf `/` (`href="#…"`) trifft bei Notschalter an und aus ein `id` derselben Seite, und ein Test hält das für
      jeden Anker fest, nicht nur für `#card`.
      MVP: Funktion, weil der Fall aus Punkt 1 nur `#card` prüft: Lässt ein späteres Goal bei Notschalter an einen weiteren Block weg
      (etwa den Markt), klickt der Besucher wieder ins Leere, und kein Test merkt es. Kritik des Tech Lead 2026-11-23.
      Prüfung: `grep -qF '"links every anchor of the start page to an id on the page, breaker on and off"' test/card-way-pages.test.ts && echo name ok` muss genau `name ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-pages.test.ts` muss Exit-Code 0 haben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const { CARD_BREAKER_SHORTFALL_MC: S } = await import("./src/payments/card-way.ts"); const page = async (on) => { const db = openDb(":memory:"); if (on) { const t = new Date().toISOString(); db.prepare("INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)").run("TRIP", "771278", "0x" + "ef".repeat(20), "live", "reversed", S, S, t, t); } return (await createApp({ db }).request("/")).text(); }; const bad = []; for (const on of [true, false]) { const h = await page(on); const ids = new Set([...h.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])); const refs = [...h.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]); if (refs.length === 0) bad.push((on ? "an" : "aus") + " keine"); for (const r of refs) if (!ids.has(r)) bad.push((on ? "an " : "aus ") + "#" + r); } console.log(bad.length ? bad.join("; ") : "ziele ok")' 2>&1 | tail -1` muss genau `ziele ok` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/href="#market"/href="#nowhere"/g' $T/src/public/index.html; grep -q 'href="#nowhere"' $T/src/public/index.html || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-pages.test.ts -t "links every anchor of the start page to an id on the page, breaker on and off" > /dev/null 2>&1); echo "exit=$?"; rm -rf $T` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Besucher sieht bei geschlossener Kasse auf der Startseite nur Knöpfe, die irgendwohin führen.
- [ ] Seite des Notschalters und 402 nennen für dieselbe Wallet denselben Link über USDC.
- [ ] Ein Fehler in der Schreibsperre eines der beiden Werkzeuge für Digistore24 macht `check` rot.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse eines Kunden, kein Satz zu PostYourPrice, kein Satz zu den Bedingungen des Einkaufs bei
      OpenRouter.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `ops/**`: unverändert, auch `ops/digistore.mjs` und `ops/digistore-release.mjs` (die Gegenprobe schaltet die Sperre nur in einer
  Kopie aus)
- `src/payments/**`, `src/app.ts`, `src/auth/**`, `src/konto/**`, `src/checkout/**`, `src/handoff/**`, `mcp/**`, `README.md`:
  unverändert
- `src/public/index.html`: nur die eine Zeile des Knopfs im Block zwischen `<!--NOCARD-->` und `<!--/NOCARD-->` fällt weg
  (Entscheidung 1); `src/inference/proxy.ts`: nur der Link über USDC aus `usdcTopupUrl` (Entscheidung 2), Wortlaut und Felder der
  402 bleiben
- `docs/soll/**`: unverändert, die Bilder bei Notschalter aus bleiben gültig
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`,
  die der Tech Lead entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- das Konto von Digistore24 (Produkte, Rückgaberegeln, IPN-Verbindungen, Bestellformulare): dieses Goal ruft Digistore24 nicht auf
- ein Kauf, ein POST an `/pay/digistore` der Produktion, jeder Wert in `/opt/control-plane/.env`, ein Rollout oder Neustart durch einen
  Agent, Wallet-Bewegung, Topup, Gutschrift von Hand (`loop-constraints.md`, Grundregeln 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-23 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut: Knopf `href="#card"` aus dem ersten Bildschirm für Notschalter an (eine Zeile in `src/public/index.html`), die 402 holt den Link über USDC an allen drei Stellen aus `usdcTopupUrl`, `test/digistore-tool.test.ts` fährt beide Selftests samt Gegenprobe, `WACHE_01_FIRST_SCREEN` ohne den Knopf, 4 Zeilen in `goals/wache/ANNAHMEN.md`. Rot gesehen: „links nowhere to #card on the start page while the breaker is on“ an der Merge-Basis (`href="#card"` stand noch auf `/`); „names the same way over USDC in the 402 and on the paused page“ mit `usdcTopupUrl` auf `/pay/20/` vor dem Umbau von `proxy.ts` (402 `/pay/5/`, Seite `/pay/20/`); beide Gegenproben in `test/digistore-tool.test.ts`, wenn die Ersetzung die Sperre stehen lässt (2 failed). Prüfbefehle der fertigen Goals mit `index.html`, `werbung.test`, `card-way-pages`, `card-checkout`, `proxy` oder `digistore` (674 ohne Netz, ohne `check` und Merge-Basis) an `dev` 354a326 und am Kopf gleich, ein Lastausreißer an `dev` einzeln nachgefahren gleich. Prüfbefehle: Punkt 1 vitest Exit 0, `name ok`, `anker ok`, `0 1 src/public/index.html`, 1, 1; Punkt 2 0, 2, `name ok`, vitest Exit 0, `exit=1` ohne `sed-miss`; Punkt 3 vitest Exit 0, nichts fehlt, `exit=1` und `exit=1` ohne `sed-miss`, 0; Punkt 4 4, 0, 0, 0; Punkt 5 PR #407 am Kopf 035da96 `check` und `e2e` pass; Punkt 6 `check` grün in 121 s.
- 2026-11-23 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, nach Merge von `dev` b988ec7 in den Goal-Branch (Kopf eebdcce) jeden Prüfbefehl neu gefahren. Prüfbefehle: Punkt 1 vitest Exit 0, `name ok`, `anker ok`, `0 1 src/public/index.html`, 1, 1; Punkt 2 0, 2, `name ok`, vitest Exit 0, `exit=1` ohne `sed-miss`; Punkt 3 vitest Exit 0, nichts fehlt, `exit=1` und `exit=1` ohne `sed-miss`, 0; Punkt 4 4, 0, 0, 0; Punkt 5 PR #407 am Kopf eebdcce `e2e` pass (10m59s), Zähler 1; Punkt 6 `check` grün in 70 s.

## Blockers
keine
