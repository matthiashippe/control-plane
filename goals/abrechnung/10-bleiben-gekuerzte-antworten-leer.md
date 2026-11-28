# Abrechnung Goal 10: Bleiben gekürzte Antworten leer?

## Status
PLANNED

## Active Objective
Seit abrechnung 09 (ausgerollt mit dem Lauf 46137362408 von `deploy.yml` an `07f1bd6`, Job `deploy` fertig 2026-11-28T11:09:40Z)
trägt die Ledger-Zeile `inference` jeder gekürzten Antwort `shortened_to`, `shortened_finish` und `shortened_empty`. Dieses Goal
zählt damit über die sieben Tage ab diesem Rollout je Modell, wie viele gekürzte Antworten fremder Wallets es gab, wie viele davon
leer blieben und wie viele Antwort-Tokens sie trugen: ein Bericht `CP_REPORT=shortened` in `ops/db-report.cjs`, in beide Richtungen
getestet, Ergebnis in `docs/abrechnung/gekuerzt-2026-12.md`. Sind bei mindestens 20 gekürzten Antworten eines Modells mehr als 10 %
leer, bekommt dieses Modell eine eigene Grenze aus der Messung statt `MIN_SHORTENED_TOKENS = 256`, und eine gekürzte Antwort, die leer
mit `length` zurückkommt, wird nicht berechnet; sonst endet das Goal mit der Messung.
Leitzahl: leere gekürzte Antworten fremder Wallets je Woche, Ziel 0 (gemessen in `docs/abrechnung/gekuerzt-2026-12.md`).
Widerlegt, wenn im Fenster keine gekürzte Antwort leer blieb; dann steht genau das in der Doku, und am Code ändert sich nichts.
MVP: Funktion, weil ein Kunde mit Rest sonst für leere Antworten zahlt, statt die 402 mit dem Weg zum Aufladen zu sehen.

## Voraussetzungen
- abrechnung Goal 09 DONE
- frühestens 2026-12-06

## Kontext für den Maker
- Ziel in einem Satz: Wir wissen je Modell, ob die Kürzung Kunden für leere Antworten zahlen lässt, und wenn ja, zahlt dort niemand
  mehr dafür und die Kürzung setzt erst ab einer Länge ein, bei der die Antwort etwas trägt.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Abrechnung geht vor allem anderen (`LOOP.md`,
  Entscheidungsordnung 2). Ein Kunde, dessen letzter Rest in leeren, aber berechneten Antworten verschwindet, sieht nie die 402 mit dem
  Weg zum Aufladen und kommt nicht als Zahler zurück.
- Quelle: `ROADMAP.md`, Topic `abrechnung`, Glied 10 (Tech Lead 28.11.2026, PRO-32469). Vorgänger
  `goals/abrechnung/09-eine-gekuerzte-antwort-zeigt-im-ledger-ob-sie-leer-blieb.md` (DONE) und
  `goals/abrechnung/08-wer-noch-credits-hat-bekommt-eine-kuerzere-antwort-statt-402.md` (DONE). Bestand: die drei Schlüssel in der
  `meta` der Ledger-Zeile `inference` (`src/inference/proxy.ts`, Block nach `uncollected_mc`), die Kürzung im Zweig
  `affordable >= MIN_SHORTENED_TOKENS`, die Blöcke `CP_REPORT=decline` und `CP_REPORT=topup-bands` in `ops/db-report.cjs` als Muster
  (Fenster `CP_SINCE` und `CP_UNTIL` mit `iso()`, Filter `notOurs` mit `OURS_ARGS`, Ausgabe mit `writeSync`, dann `process.exit(0)`).
  Was abrechnung 09 zur Zählung festgelegt hat, steht in `goals/abrechnung/ANNAHMEN.md` (Zeilen `abrechnung 09:`): leer heißt
  `json_extract(meta, '$.shortened_empty') = 1`, gekürzt heißt `json_extract(meta, '$.shortened_to') IS NOT NULL`.
- **Messfenster, fest:** `CP_SINCE=2026-11-28T11:09:40Z` (Ende des Jobs `deploy` von abrechnung 09, erst ab dann schreibt die
  Produktion `shortened_empty`) und `CP_UNTIL=2026-12-05T11:09:40Z`, genau sieben Tage. Das Goal startet frühestens am 06.12.2026, dem
  ersten ganzen UTC-Tag nach dem Ende des Fensters (Voraussetzung oben), damit die Zahl wiederholbar ist.
- **Entscheidungen des Tech Lead (28.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, abrechnung 10: …`
  in `goals/abrechnung/ANNAHMEN.md`.
  1. **Der Bericht `CP_REPORT=shortened`** steht als eigener Block in `ops/db-report.cjs` vor dem eigentlichen Bericht, wie
     `topup-bands`, und ohne `CP_REPORT` ändert sich die Ausgabe des Skripts um kein Byte. Er liest nur Zeilen mit
     `kind = 'inference'`, `shortened_to IS NOT NULL`, `created_at >= CP_SINCE` und `created_at < CP_UNTIL`, nur fremde Wallets
     (`notOurs`). Ausgabe ist genau eine Zeile JSON
     `{"since":…,"until":…,"models":[{"model":…,"shortened":…,"empty":…,"empty_length":…,"unmarked":…,"wallets":…,"completion_tokens":…,"empty_completion_tokens":…,"max_empty_shortened_to":…}]}`,
     `models` nach `model` sortiert, nur Modelle mit mindestens einer gekürzten Antwort. `model` ist `meta.model`, `empty_length` zählt
     leere mit `shortened_finish = 'length'`, `unmarked` zählt gekürzte Zeilen ohne `shortened_empty` (im Fenster muss das 0 sein,
     sonst stimmt der Rollout nicht), `wallets` die verschiedenen Adressen als Zahl, die Token-Summen aus
     `meta.usage.completion_tokens`, `max_empty_shortened_to` das größte `shortened_to` einer leeren gekürzten Antwort oder `null`.
     Keine Adresse, kein Betrag in der Ausgabe.
  2. **Gemessen wird nur lesend** auf dem code-host, das Skript über stdin in den Container, die Datenbank öffnet es mit
     `readonly: true`:
     `set -a; . ~/.config/control-plane/loop.env; set +a; ssh -i "$CP_SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "docker exec -i -e CP_REPORT=shortened -e CP_SINCE=2026-11-28T11:09:40Z -e CP_UNTIL=2026-12-05T11:09:40Z deploy-cp-1 node -" < ops/db-report.cjs`.
     Werte aus `loop.env` nie ausgeben.
  3. **Die Doku** `docs/abrechnung/gekuerzt-2026-12.md` nennt `Gemessen: <ISO-Zeit in UTC>`, den Befehl aus Entscheidung 2, die
     JSON-Zeile des Berichts unverändert in einem Codeblock (sie beginnt mit `{"since":"2026-11-28T11:09:40.000Z"`), je Modell in der
     Reihenfolge des JSON eine Zeile
     `Modell <model>: <shortened> gekürzt, <empty> leer, davon <empty_length> mit length, <wallets> Wallets, <completion_tokens> Antwort-Tokens, größte leere Kürzung <max_empty_shortened_to oder keine>`,
     genau eine Zeile `Bau: ja, Grenze <model> <n>[, <model> <n>]` oder `Bau: nein, weil <Grund>` und genau eine Zeile
     `Widerlegt: ja, keine gekürzte Antwort blieb leer` oder `Widerlegt: nein, <Summe empty> von <Summe shortened> gekürzten Antworten blieben leer`.
  4. **Wann gebaut wird und welche Grenze:** Bau heißt ja genau für die Modelle mit `shortened >= 20` und `empty * 10 > shortened`. Ihre
     Grenze ist das kleinste Vielfache von 256 über `max_empty_shortened_to`, höchstens 4096, also
     `min(4096, (floor(max_empty_shortened_to / 256) + 1) * 256)`: Jede im Fenster leer gebliebene Kürzung dieses Modells wäre damit
     eine 402 geworden. Die Regel braucht keine Reasoning-Tokens im Ledger; der offene Vorschlag
     `goals/_vorschlaege/abrechnung-kritik-2026-11-28-1.md` bleibt für die Triage und wird hier nicht eingearbeitet.
  5. **Bei Bau ja** steht in `src/inference/proxy.ts` direkt unter `MIN_SHORTENED_TOKENS` eine Konstante
     `export const MIN_SHORTENED_TOKENS_BY_MODEL: Record<string, number> = { … }` mit je Modell aus der Zeile `Bau:` genau einem Eintrag
     der Form `"<model>": <n>`, und der Zweig der Kürzung nimmt `MIN_SHORTENED_TOKENS_BY_MODEL[entry.spec.id] ?? MIN_SHORTENED_TOKENS`.
     `MIN_SHORTENED_TOKENS` bleibt 256 für alle anderen Modelle. Dazu wird eine gekürzte Antwort, deren `shortened_empty` wahr und
     deren `shortened_finish` `"length"` ist, bei jedem Modell nicht berechnet: dieselbe eine Ledger-Zeile `inference` in derselben
     Transaktion mit `deltaMc: 0`, die Reservierung ganz freigegeben, `cost_mc` und `purchase_mc` wie bisher, `margin_mc` ist dann
     `-purchase_mc` und `uncollected_mc` gleich `cost_mc`. Kein neuer Schlüssel in der `meta`, weil der Fall „leaves the ledger row of
     a full answer without shortened_finish and shortened_empty“ in `test/inference-shortened-empty.test.ts` die Schlüsselliste
     gekürzter Zeilen festhält. Eine leere Antwort mit `stop` oder `tool_calls` bleibt berechnet, weil das Modell sie so beendet hat
     und nicht die Kürzung.
  6. **Bei Bau nein** ändert sich kein Byte unter `src/`, und das Goal endet mit Bericht, Tests und Doku.
- **Tests:** eine neue Datei `test/shortened-report.test.ts`, die `ops/db-report.cjs` mit `CP_REPORT=shortened` gegen eine Datenbank
  aus `mkdtemp` fährt wie `test/db-report.test.ts`, mit genau diesen Fällen: „counts shortened answers of foreign wallets per model,
  empty ones and their answer tokens“, „leaves out our own wallets, full answers and rows outside the window“, „reports no models
  when no shortened answer lies in the window“, „names the largest cut of an empty shortened answer per model“, „counts a shortened row
  without shortened_empty as unmarked“ und „fails on a window that is not ISO UTC“. Bei Bau ja dazu `test/inference-shortened-free.test.ts`
  mit „does not charge a shortened answer that came back empty with length“, „charges a shortened answer with content as before“,
  „charges an empty shortened answer that ended without length“, „answers 402 below the measured minimum of a model“ und „shortens at
  the measured minimum of a model“, Provider als Mock wie in `test/inference-shortened-empty.test.ts`, jeder Fall rot vor dem Fix; die
  Zeile im Progress Log nennt, womit. Kein Netz, kein Port.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle ohne Netz der Goals mit Status `DONE`, die `db-report` oder `proxy.ts` nennen
  (`grep -l -E 'db-report|proxy\.ts' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem Bau erneut; ein fremder roter
  Prüfbefehl geht mit Befehl und beiden Ausgaben als Frage an den Tech Lead auf dem Topic.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout.
  Produktion nur lesend nach Entscheidung 2. Bei Bau ja Rollout mit dem Merge (`src/**`), sonst keiner. Code, Bezeichner, Testnamen
  und Schlüssel englisch, Doku deutsch, kein Gedankenstrich.

## Done Condition
- [ ] `ops/db-report.cjs` hat den Bericht `CP_REPORT=shortened` nach Entscheidung 1, in beide Richtungen getestet; ohne `CP_REPORT`
      bleibt die Ausgabe gleich.
      MVP: Funktion, weil ohne geprüften Zähler eine Null nicht von Blindheit zu unterscheiden ist (Grundregel 3).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/shortened-report.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "counts shortened answers of foreign wallets per model, empty ones and their answer tokens" "leaves out our own wallets, full answers and rows outside the window" "reports no models when no shortened answer lies in the window" "names the largest cut of an empty shortened answer per model" "counts a shortened row without shortened_empty as unmarked" "fails on a window that is not ISO UTC"; do grep -qF "\"$t\"" test/shortened-report.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'process.env.CP_REPORT === "shortened"' ops/db-report.cjs` muss `1` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/db-report.test.ts test/db-report-no-duplicate-keys.test.ts test/house-report-parity.test.ts` muss Exit-Code 0 haben.
- [ ] `docs/abrechnung/gekuerzt-2026-12.md` trägt die Messung über das feste Fenster nach Entscheidung 3, und ihre Zeilen stimmen mit
      der JSON-Zeile und der Regel aus Entscheidung 4 überein. Keine Adresse, keine IP.
      MVP: Funktion, weil die Entscheidung über Grenze und Berechnung an einer gemessenen Zahl hängen muss und nicht an einer Schätzung.
      Prüfung: `grep -cE '^Gemessen: 2026-12-[0-9]{2}T[0-9:]{8}Z$' docs/abrechnung/gekuerzt-2026-12.md` muss `1` ausgeben.
      Prüfung: `grep -cF 'CP_REPORT=shortened -e CP_SINCE=2026-11-28T11:09:40Z -e CP_UNTIL=2026-12-05T11:09:40Z deploy-cp-1 node -' docs/abrechnung/gekuerzt-2026-12.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -c '^{"since":"2026-11-28T11:09:40.000Z","until":"2026-12-05T11:09:40.000Z","models":' docs/abrechnung/gekuerzt-2026-12.md` muss `1` ausgeben.
      Prüfung: `node -e 'const t=require("fs").readFileSync("docs/abrechnung/gekuerzt-2026-12.md","utf8").split("\n");const j=JSON.parse(t.find(l=>l.startsWith("{\"since\"")));const m=t.filter(l=>l.startsWith("Modell "));const w=j.models.map(x=>"Modell "+x.model+": "+x.shortened+" gekürzt, "+x.empty+" leer, davon "+x.empty_length+" mit length, "+x.wallets+" Wallets, "+x.completion_tokens+" Antwort-Tokens, größte leere Kürzung "+(x.max_empty_shortened_to===null?"keine":x.max_empty_shortened_to));console.log(m.length===w.length&&w.every((s,i)=>m[i]===s)&&j.models.every(x=>x.unmarked===0)?"stimmig":"unstimmig")'` muss genau `stimmig` ausgeben.
      Prüfung: `node -e 'const t=require("fs").readFileSync("docs/abrechnung/gekuerzt-2026-12.md","utf8").split("\n");const j=JSON.parse(t.find(l=>l.startsWith("{\"since\"")));const h=j.models.filter(x=>x.shortened>=20&&x.empty*10>x.shortened);const b=t.filter(l=>l.startsWith("Bau: "));const ok=b.length===1&&(h.length?b[0]==="Bau: ja, Grenze "+h.map(x=>x.model+" "+Math.min(4096,(Math.floor(x.max_empty_shortened_to/256)+1)*256)).join(", "):b[0].startsWith("Bau: nein, weil "));console.log(ok?"stimmig":"unstimmig")'` muss genau `stimmig` ausgeben.
      Prüfung: `node -e 'const t=require("fs").readFileSync("docs/abrechnung/gekuerzt-2026-12.md","utf8").split("\n");const j=JSON.parse(t.find(l=>l.startsWith("{\"since\"")));const e=j.models.reduce((s,x)=>s+x.empty,0),n=j.models.reduce((s,x)=>s+x.shortened,0);const w=t.filter(l=>l.startsWith("Widerlegt: "));console.log(w.length===1&&w[0]===(e===0?"Widerlegt: ja, keine gekürzte Antwort blieb leer":"Widerlegt: nein, "+e+" von "+n+" gekürzten Antworten blieben leer")?"stimmig":"unstimmig")'` muss genau `stimmig` ausgeben.
      Prüfung: `grep -cE '0x[0-9a-fA-F]{40}|([0-9]{1,3}\.){3}[0-9]{1,3}' docs/abrechnung/gekuerzt-2026-12.md` muss `0` ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; diff <(ssh -i "$CP_SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "docker exec -i -e CP_REPORT=shortened -e CP_SINCE=2026-11-28T11:09:40Z -e CP_UNTIL=2026-12-05T11:09:40Z deploy-cp-1 node -" < ops/db-report.cjs) <(grep '^{"since":' docs/abrechnung/gekuerzt-2026-12.md)` muss nichts ausgeben.
- [ ] Bei Bau ja: Jedes Modell aus der Zeile `Bau:` hat seine Grenze in `MIN_SHORTENED_TOKENS_BY_MODEL`, und eine gekürzte Antwort,
      die leer mit `length` zurückkommt, wird nicht berechnet (Entscheidung 5); Tests rot vor dem Fix. Bei Bau nein entfällt der Punkt.
      MVP: Funktion, weil ein Kunde mit Rest sonst für eine Antwort zahlt, die ihm nichts bringt (Grundregel 6 sinngemäß).
      Prüfung: `d=docs/abrechnung/gekuerzt-2026-12.md; b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' "$d"); [ "$b" = nein ] && echo entfaellt || { sed -nE 's/^Bau: ja, Grenze (.*)$/\1/p' "$d" | tr ',' '\n' | while read -r m n; do grep -qF "\"$m\": $n" src/inference/proxy.ts || echo "fehlt $m $n"; done; echo ende; }` muss genau `ende` oder genau `entfaellt` ausgeben.
      Prüfung: `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/abrechnung/gekuerzt-2026-12.md); [ "$b" = nein ] && echo entfaellt || grep -c 'MIN_SHORTENED_TOKENS_BY_MODEL\[entry.spec.id\] ?? MIN_SHORTENED_TOKENS' src/inference/proxy.ts` muss `1` oder `entfaellt` ausgeben.
      Prüfung: `grep -c '^export const MIN_SHORTENED_TOKENS = 256;$' src/inference/proxy.ts` muss `1` ausgeben.
      Prüfung: `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/abrechnung/gekuerzt-2026-12.md); [ "$b" = nein ] && echo entfaellt || { PATH=/usr/bin:$PATH pnpm -s vitest run test/inference-shortened-free.test.ts test/inference-shortened-empty.test.ts test/inference-shortened.test.ts >/dev/null 2>&1 && echo gruen; }` muss `gruen` oder `entfaellt` ausgeben.
      Prüfung: `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/abrechnung/gekuerzt-2026-12.md); [ "$b" = nein ] && echo entfaellt || for t in "does not charge a shortened answer that came back empty with length" "charges a shortened answer with content as before" "charges an empty shortened answer that ended without length" "answers 402 below the measured minimum of a model" "shortens at the measured minimum of a model"; do grep -qF "\"$t\"" test/inference-shortened-free.test.ts || echo "fehlt: $t"; done` muss nichts oder genau `entfaellt` ausgeben.
- [ ] Die Entscheidungen stehen in `goals/abrechnung/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein bestehender Test
      ändert sich oder fällt weg, und bei Bau nein bleibt `src/` unverändert.
      MVP: Funktion, weil die nächste Messung wissen muss, wie gezählt und wie die Grenze gesetzt wurde.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, abrechnung 10: ' goals/abrechnung/ANNAHMEN.md` muss mindestens 6 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(ops/db-report\.cjs|src/inference/proxy\.ts|test/shortened-report\.test\.ts|test/inference-shortened-free\.test\.ts|docs/abrechnung/gekuerzt-2026-12\.md|goals/abrechnung/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --diff-filter=MD --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss `0` ausgeben.
      Prüfung: `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/abrechnung/gekuerzt-2026-12.md); [ "$b" = ja ] && echo entfaellt || git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src | wc -l` muss `0` oder `entfaellt` ausgeben.
- [ ] Bei Bau ja ist der Job `e2e` am Kopf des Goal-PR grün; bei Bau nein entfällt der Punkt.
      MVP: Funktion, weil sich dann die Abrechnung im Laufzeitpfad der Inferenz ändert und der code-host kein Docker hat.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/abrechnung/gekuerzt-2026-12.md); [ "$b" = nein ] && echo entfaellt || gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/abrechnung-10 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss `1` oder `entfaellt` ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer genug Guthaben hat, merkt nichts: gleiche Anfrage, gleiche Antwort, gleiche Ledger-Zeile, gleicher Betrag.
- [ ] Die Zahl der leeren gekürzten Antworten ist gegen die Produktion gemessen, wiederholbar über das feste Fenster, mit Befehl.
- [ ] Kein Inhalt einer Antwort im Ledger oder in der Doku; kein Gedankenstrich, keine Wallet-Adresse und keine IP eines Kunden, kein
      Betrag je Kunde.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `ops/db-report.cjs`: nur der neue Block `CP_REPORT=shortened`; `ops/**` sonst unverändert
- `src/inference/proxy.ts`: nur bei Bau ja, nur die Konstante `MIN_SHORTENED_TOKENS_BY_MODEL`, ihr Nachschlagen im Zweig der Kürzung
  und der Betrag einer gekürzten Antwort, die leer mit `length` zurückkommt; `src/**` sonst, `src/payments/**`, `src/auth/**`:
  unverändert
- `MIN_SHORTENED_TOKENS` (256), `affordableMaxTokens`, Wortlaut und Felder der 402, Body und Köpfe an den Client: unverändert
- `test/**` außer den neuen `test/shortened-report.test.ts` und `test/inference-shortened-free.test.ts`: unverändert
- `docs/**` außer der neuen `docs/abrechnung/gekuerzt-2026-12.md`, `ROADMAP.md`, `STATE.md`, bestehende Goal-Dateien und Vorschläge:
  unverändert
- jedes Schreiben in der Produktion, ein Rollout oder Neustart durch einen Agent; die Datenbank nur mit `readonly: true`
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
- keine
