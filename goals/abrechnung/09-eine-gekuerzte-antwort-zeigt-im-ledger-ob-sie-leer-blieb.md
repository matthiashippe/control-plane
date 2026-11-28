# Abrechnung Goal 09: Eine gekürzte Antwort zeigt im Ledger, ob sie leer blieb

## Status
PLANNED

## Active Objective
Seit abrechnung 08 (ausgerollt mit dem Lauf von `deploy.yml` an `70e5599`, Job `deploy` fertig 2026-11-27T19:51:06Z) bekommt eine
Wallet mit Rest eine Antwort mit gekürztem `max_tokens` ab `MIN_SHORTENED_TOKENS = 256` (`src/inference/proxy.ts:33`), für jedes
Modell gleich, und `affordableMaxTokens` rechnet nur Antwort-Tokens. Ein Modell mit Reasoning (`openai/gpt-5-mini`,
`openai/gpt-5.2`) kann 256 bis einige hundert Tokens ganz für Reasoning verbrauchen und kommt dann ohne Inhalt und ohne Tool-Aufruf
mit `finish_reason: "length"` zurück; die Runtime am Pin läuft bei `length` in den nächsten Zug (`goals/abrechnung/ANNAHMEN.md`,
Zeile zu `finish_reason: "length"`), also kann ein Rest in mehreren leeren, aber berechneten Antworten verfallen. Ob das passiert,
lässt sich heute nicht messen: Die Ledger-Zeile trägt `shortened_to` und `usage`, aber weder `finish_reason` noch, ob die Antwort
leer war. Nach diesem Goal trägt die Ledger-Zeile jeder gekürzten Antwort `shortened_finish` und `shortened_empty`, damit
abrechnung 10 nach sieben Tagen je Modell zählen kann.
Leitzahl: gekürzte Antworten ohne Inhalt und ohne Tool-Aufruf je Woche, Ziel 0 (gemessen ab diesem Goal in abrechnung 10).
Widerlegt, wenn die Ledger-Zeile einer gekürzten Antwort am Kopf von `dev` schon `finish_reason` und einen Hinweis auf leeren Inhalt
trägt.
MVP: Funktion, weil ein Kunde mit Rest sonst unbemerkt für leere Antworten zahlen kann (Grundregel 6) und ohne diese Felder keine
Messung das zeigt.

## Voraussetzungen
- abrechnung Goal 08 DONE

## Kontext für den Maker
- Ziel in einem Satz: Für jede gekürzte Antwort steht im Ledger, ob der Kunde etwas Brauchbares bekam, damit wir sehen, ob die
  Kürzung Geld für leere Antworten nimmt.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Abrechnung geht vor allem anderen (`LOOP.md`,
  Entscheidungsordnung 2); ein Kunde, dessen letzter Rest in leeren Antworten verschwindet, sieht nie die 402 mit dem Weg zum
  Aufladen und kommt nicht als Zahler zurück.
- Quelle: `ROADMAP.md`, Topic `abrechnung`, Glied 09 (Tech Lead 28.11.2026, PRO-32469 aus der Triage PRO-32461, Glied 4). Übernimmt
  `goals/_vorschlaege/abrechnung-kritik-2026-11-27-2.md`. Vorgänger
  `goals/abrechnung/08-wer-noch-credits-hat-bekommt-eine-kuerzere-antwort-statt-402.md` (DONE); das Feld `shortened_to` kommt aus
  dessen Punkt 7 (`src/inference/proxy.ts:618`).
- **Entscheidungen des Tech Lead (28.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, abrechnung 09: …`
  in `goals/abrechnung/ANNAHMEN.md`.
  1. **Erst sichtbar machen, dann messen, dann entscheiden.** Die Kritik wollte direkt aus dem Ledger messen; das geht nicht, weil die
     Zeile weder Inhalt noch `finish_reason` trägt. Dieses Goal legt nur die beiden Felder an, die Messung über sieben Tage und die
     Entscheidung über eine Grenze je Modell macht abrechnung 10.
  2. **Zwei Schlüssel, nur bei gekürzten Antworten**, direkt neben `shortened_to`: `shortened_finish` mit dem `finish_reason` der
     ersten Wahl (`choices[0]`), und `shortened_empty` mit `true`, wenn `choices[0].message.content` nach `trim()` leer oder `null` ist
     und `tool_calls` fehlt oder leer ist, sonst `false`. Eine Antwort ohne `choices` gilt als leer. Eine volle Antwort bekommt
     keinen der beiden Schlüssel, ihre Ledger-Zeile bleibt Byte für Byte.
  3. **An Abrechnung, Antwort und 402 ändert sich nichts:** gleicher Betrag, gleiche Reservierung, gleicher Body an den Client,
     gleiche Köpfe; kein Inhalt der Antwort im Ledger, nur die beiden Schlüssel.
- **Tests:** eine neue Datei `test/inference-shortened-empty.test.ts` mit genau diesen Fällen, jeder rot vor der Änderung: „marks a
  shortened answer without content and without tool calls as empty“, „marks a shortened answer with content as not empty“, „marks a
  shortened answer with only a tool call as not empty“, „records the finish reason of a shortened answer“ und „leaves the ledger row
  of a full answer without shortened_finish and shortened_empty“. Kein Netz, Provider als Mock wie in
  `test/inference-shortened.test.ts`, das unverändert grün bleibt.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle ohne Netz der Goals mit Status `DONE`, die `proxy.ts` oder
  `inference-shortened` nennen (`grep -l -E 'proxy\.ts|inference-shortened' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und
  nach dem Bau erneut; ein fremder roter Prüfbefehl geht mit Befehl und beiden Ausgaben als Frage an den Tech Lead auf dem Topic.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein
  Zugriff auf die Produktion nötig. Rollout mit dem Merge (`src/**`). Code, Bezeichner, Testnamen und Schlüssel englisch.

## Done Condition
- [ ] Die Ledger-Zeile einer gekürzten Antwort trägt `shortened_finish` und `shortened_empty`, die einer vollen keinen von beiden;
      Tests rot vor der Änderung.
      MVP: Funktion, weil ohne diese Felder keine Messung zeigt, ob gekürzte Antworten leer bleiben und trotzdem berechnet werden.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/inference-shortened-empty.test.ts test/inference-shortened.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "marks a shortened answer without content and without tool calls as empty" "marks a shortened answer with content as not empty" "marks a shortened answer with only a tool call as not empty" "records the finish reason of a shortened answer" "leaves the ledger row of a full answer without shortened_finish and shortened_empty"; do grep -qF "\"$t\"" test/inference-shortened-empty.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c -E 'shortened_finish|shortened_empty' src/inference/proxy.ts` muss mindestens 2 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- test/inference-shortened.test.ts | wc -l` muss 0 ausgeben.
- [ ] Die Entscheidungen stehen in `goals/abrechnung/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg.
      MVP: Funktion, weil abrechnung 10 wissen muss, wann eine gekürzte Antwort als leer gilt.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, abrechnung 09: ' goals/abrechnung/ANNAHMEN.md` muss mindestens 3 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/inference/proxy\.ts|test/inference-shortened-empty\.test\.ts|goals/abrechnung/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
- [ ] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil sich die Ledger-Zeile im Laufzeitpfad der Inferenz ändert und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/abrechnung-09 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer genug Guthaben hat, merkt nichts: gleiche Anfrage, gleiche Antwort, gleiche Ledger-Zeile.
- [ ] Eine gekürzte Antwort kostet genau so viel wie vorher und kommt genau so beim Client an.
- [ ] Kein Inhalt einer Antwort im Ledger; kein Gedankenstrich, keine Wallet-Adresse und keine IP eines Kunden, kein Betrag je Kunde.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/inference/proxy.ts`: nur die `meta` der Ledger-Zeile `inference`; `src/**` sonst, `src/payments/**`, `src/auth/**`:
  unverändert
- `test/**` außer dem neuen `test/inference-shortened-empty.test.ts`: unverändert
- `ops/**`, `docs/**`, `ROADMAP.md`, `STATE.md`, bestehende Goal-Dateien und Vorschläge: unverändert
- `MIN_SHORTENED_TOKENS`, `affordableMaxTokens` und die 402: unverändert (die Grenze je Modell entscheidet abrechnung 10)
- jedes Schreiben in der Produktion, ein Rollout oder Neustart durch einen Agent
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
- keine
