# Wache Goal 04: Eine Regel sagt, wann die Kasse per Karte zu ist

## Status
PLANNED

## Active Objective
Wann die Kasse per Karte zu ist, steht heute an sechs Stellen in drei Fassungen. `cardOpenNow` (`src/app.ts:2555`) fragt Sunset und
Notschalter, Startseite (`src/app.ts:1825`) und Fehlerseiten (`src/app.ts:1195`) nur den Notschalter, `cardRedirect`
(`src/payments/card-way.ts:125`) und `handleDigistoreIpn` (`src/payments/digistore.ts:326` bis `:333`) Notschalter und Erstattung je
für sich, `cardUrlFor` (`src/payments/card-way.ts:84`) noch einmal. Nach `CP_OPENROUTER_RESALE=0` (Sunset) sagen `/llms.txt` und
`/pricing` „Credits are no longer sold here.“, aber Startseite und Fehlerseiten zeigen weiter die Karte, `/card/<paket>` leitet weiter
zur Kasse, und die IPN schreibt eine Bestellung gut. Nach diesem Goal entscheidet genau eine Funktion `cardClosedFor` mit den drei
Gründen Notschalter, Erstattung und Sunset, und jede dieser Stellen fragt nur sie, mit derselben Uhr `clock()`.
Leitzahl: Stellen, die selbst entscheiden, ob die Kasse per Karte offen ist, Ziel 1 (heute 6); dazu Zustände, in denen eine Seite die
Karte zeigt, die `/llms.txt` weglässt, Ziel 0.
Widerlegt, wenn `/card/5?address=<Test-Adresse>` bei Sunset am Kopf von `dev` schon nicht zur Kasse leitet.
MVP: Funktion, weil nach dem Sunset eine Person sonst Credits per Karte kauft, die das Control Plane selbst nicht mehr verkauft, und
ein vierter Grund zum Sperren sonst wieder nur an einer Stelle landet.

## Voraussetzungen
- wache Goal 03 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer bei Sunset, bei Notschalter an oder mit einer früheren Erstattung auf eine Seite oder die Kasse kommt,
  findet überall dieselbe Antwort, und keine Zahlung bucht dann Credits.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Ein Mensch, der zahlt und nichts bekommt, ist für jeden weiteren
  Automaton seines Betreibers verloren; eine Regel an einer Stelle hält das auch beim nächsten Grund.
- Quelle: `ROADMAP.md`, Topic `wache`, Glied 04 (Tech Lead 27.11.2026, PRO-31352 aus der Triage PRO-31345). Übernimmt
  `goals/_vorschlaege/fehler-nacharbeit-2026-11-26-1.md` und aus der Watch List `goals/_vorschlaege/wache-nacharbeit-2026-11-25-1.md`
  und `goals/_vorschlaege/wache-nacharbeit-2026-11-25-2.md`. Dieses Goal nennt `src/payments/**`, darf es also ändern.
- **Entscheidungen des Tech Lead (27.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, wache 04: …` in
  `goals/wache/ANNAHMEN.md`.
  1. **Die Funktion:** `cardClosedFor(db, address, now, { intakeClosed })` in `src/payments/card-way.ts` liefert `"card breaker on"`,
     `"wallet had a refund"`, `"credits no longer sold"` oder `null`, in dieser Reihenfolge. `address` darf `null` sein (Seiten ohne
     Wallet), dann zählt die Erstattung nicht. Kein Netz, keine Schreibzugriffe.
  2. **Wer sie fragt:** `cardOpenNow` in `src/app.ts`, Startseite, Fehlerseiten, `/card/:package` über `cardRedirect`, `cardUrlFor`
     und `handleDigistoreIpn`. `DigistoreDeps` bekommt dafür `intakeClosed?: () => boolean`, `createApp` setzt es aus
     `intakeClosed`. Keine Stelle fragt danach noch `cardBreaker(db, …).on` oder `walletRefunded` selbst; beide ruft nur noch
     `cardClosedFor`. Damit nennt auch die 402 einer Wallet mit Erstattung keinen Kartenlink mehr, den `/card/<paket>` ohnehin
     pausiert; `cardUrlFor` fragt ohne Sunset, weil die 402 bei Sunset schon ihren eigenen Text hat (`topupsClosed`).
  3. **Eine Uhr:** Die drei Stellen mit `(opts.now ?? (() => new Date()))()` in `src/app.ts` nehmen `clock()` wie `cardOpenNow`.
  4. **Was Sunset zeigt:** Startseite und Fehlerseiten zeigen bei Sunset Byte für Byte dieselbe Seite wie bei Notschalter an (der
     Zustand seit wache 01, ohne Kartenblock). Das ist kein neuer Zustand einer Fläche, deshalb kein neues SOLL-Bild. `/card/<paket>`
     antwortet bei Sunset wie bei Notschalter an (`paused` mit dem Weg über USDC, `src/payments/card-way.ts:113`), damit niemand
     erfährt, welcher Grund gilt.
  5. **Die IPN bei Sunset:** wie bei Notschalter an (wache 03): Bestellung mit Status `held`, keine Gutschrift, Log
     `[digistore] order <id> held: <Grund>` mit dem Grund aus `cardClosedFor`, ohne den Rückfall `?? "card checkout closed"` aus
     `src/payments/digistore.ts:348`; die Bedingung davor hängt an diesem Grund. Erstattet wird über die 60 Tage Geld zurück von
     Digistore24 wie in wache 03, kein Aufruf ihrer API.
- **Tests** in `test/card-way-pages.test.ts`, ohne Netz und ohne festen Port, Sunset wie in `test/inference-sunset.test.ts`
  (`OpenRouterProvider` mit `resale: false` und `inferenceSunsetAt` vor `now`): „hides the card on the landing page after the
  sunset“, „hides the card on error pages after the sunset“, „pauses /card/:package after the sunset“ und „holds a card order paid
  after the sunset“; dazu in `test/card-way.test.ts` je ein Fall je Grund für `cardClosedFor` und „reports no reason while the
  checkout is open“. Die vier Sunset-Fälle sind am Kopf von `dev` rot; die Zeile im Progress Log sagt, womit.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `card-way`, `digistore` oder `app.ts` nennen
  (`grep -l -E 'card-way|digistore|app\.ts' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem Bau erneut. Für
  Entscheidung 4 je Zustand (offen, Notschalter an) einen sha256 der Antworten von `/`, `/errors/<eine Seite>`, `/llms.txt` und
  `/pricing` gegen einen Worktree von `origin/dev` messen und ins Progress Log schreiben: Diese beiden Zustände bleiben Byte für Byte.
  Wird ein fremder Prüfbefehl rot, ohne dass sein Zweck verletzt ist, fragt der Maker den Tech Lead auf dem Topic mit Befehl und
  beiden Ausgaben; der entscheidet mit einer Zeile `Abgelöst:` im `ANNAHMEN.md` des alten Goals.
- **Live-Prüfung nach dem Release** (Release Manager, nicht Teil dieses Goals): Produktion läuft ohne Sunset und mit Notschalter
  nach Stand des Rollouts, also bleiben `/`, `/llms.txt`, `/pricing` und `/card/5` gleich wie vor dem Rollout.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein
  Kauf, kein Aufruf von Digistore24, kein POST an `/pay/digistore` der Produktion, kein Wert in `/opt/control-plane/.env`. Code,
  Bezeichner, Testnamen und Log-Zeilen englisch.

## Done Condition
- [ ] Bei Sunset zeigen Startseite und Fehlerseiten keine Karte, `/card/<paket>` leitet nicht zur Kasse, und eine bezahlte Bestellung
      wird `held` ohne Gutschrift.
      MVP: Funktion, weil nach dem Sunset sonst eine Person Credits per Karte kauft, die hier nicht mehr verkauft werden.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-way-pages.test.ts test/card-way.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "hides the card on the landing page after the sunset" "hides the card on error pages after the sunset" "pauses /card/:package after the sunset" "holds a card order paid after the sunset"; do grep -qF "\"$t\"" test/card-way-pages.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c '"reports no reason while the checkout is open"' test/card-way.test.ts` muss genau 1 ausgeben.
- [ ] Genau eine Funktion entscheidet, ob die Kasse per Karte zu ist, und alle Stellen nehmen dieselbe Uhr.
      MVP: Funktion, weil ein weiterer Grund zum Sperren sonst wieder nur an einer Stelle landet.
      Prüfung: `grep -c '^export function cardClosedFor(' src/payments/card-way.ts` muss genau 1 ausgeben.
      Prüfung: `cat src/app.ts src/payments/digistore.ts | grep -c -E 'cardBreaker\(|walletRefunded\('` muss 0 ausgeben.
      Prüfung: `grep -c -E 'cardBreaker\(db|walletRefunded\(db' src/payments/card-way.ts` muss genau 2 ausgeben.
      Prüfung: `grep -c 'opts.now ?? (() => new Date())' src/app.ts` muss genau 1 ausgeben.
      Prüfung: `grep -c 'card checkout closed' src/payments/digistore.ts` muss 0 ausgeben.
- [ ] Die Entscheidungen stehen in `goals/wache/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg.
      MVP: Funktion, weil das nächste Glied an der Kasse wissen muss, warum Sunset wie der Notschalter aussieht.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, wache 04: ' goals/wache/ANNAHMEN.md` muss mindestens 5 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/app\.ts|src/payments/card-way\.ts|src/payments/digistore\.ts|test/card-way-pages\.test\.ts|test/card-way\.test\.ts|goals/wache/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
- [ ] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil sich `src/app.ts` und `src/payments/**` im Laufzeitpfad ändern und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/wache-04 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Bei Sunset findet eine Person auf keiner Seite und unter keinem Link einen Weg, Credits per Karte zu kaufen.
- [ ] Offen und bei Notschalter an antworten `/`, die Fehlerseiten, `/llms.txt`, `/pricing` und `/card/<paket>` Byte für Byte wie am
      Kopf von `dev`.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse eines Kunden, kein Satz zu den Bedingungen des Einkaufs bei OpenRouter.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/payments/**` außer `card-way.ts` und `digistore.ts`, `src/inference/**`, `src/auth/**`, `src/konto/**`, `src/public/**`,
  `ops/**`, `mcp/**`, `README.md`: unverändert
- `src/app.ts`: nur die Stellen aus Entscheidung 2 und 3 und `digistoreDeps`; jede Antwort im offenen Zustand und bei Notschalter an
  bleibt Byte für Byte
- `docs/soll/**`: unverändert, keine Fläche bekommt einen neuen Zustand (Entscheidung 4)
- `test/**` außer `test/card-way-pages.test.ts` und `test/card-way.test.ts`: unverändert; kein bestehender Fall wird gelockert
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`,
  die der Tech Lead entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- ein Kauf, ein Aufruf von Digistore24, ein POST an `/pay/digistore` der Produktion, jeder Wert in `/opt/control-plane/.env`, ein
  Rollout oder Neustart durch einen Agent, Wallet-Bewegung, Gutschrift von Hand (`loop-constraints.md`, Grundregeln 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
