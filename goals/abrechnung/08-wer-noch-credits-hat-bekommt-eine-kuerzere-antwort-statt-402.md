# Abrechnung Goal 08: Wer noch Credits hat, bekommt eine kürzere Antwort statt 402

## Status
DONE

## Active Objective
Eine Inferenz reserviert den Preis von geschätztem Prompt und vollem `max_tokens` (`src/inference/proxy.ts:303`) und antwortet 402,
wenn `reserveMc` daran scheitert (`:314` bis `:327`). Die Runtime am Pin `d8f8168` fragt immer mit `maxTokensPerTurn`, Vorgabe 4096
(`src/types.ts:83 am Pin d8f8168`), und hört nach einer 402 auf. Ein Rest, der den Prompt und eine kürzere Antwort decken würde,
bleibt so liegen, und die Runtime steht, obwohl noch Credits da sind; so endete der Sandbox-Kunde (`docs/kunden/sandbox-kunde-2026-11.md`,
Abschnitt Befund). Nach diesem Goal kürzt der Dienst `max_tokens` auf das, was das Guthaben bezahlt, wenn das mindestens 256 Tokens
Antwort sind, liefert die Antwort mit dem `finish_reason` des Anbieters (bei einer gekürzten Antwort `length`) und rechnet wie heute
nur ab, was ankam. Reicht das Guthaben nicht einmal dafür, kommt die 402 wie heute, mit dem neuen Feld `details.affordable_max_tokens`.
Leitzahl: fremde Wallets mit einem Rest, der 256 Tokens Antwort deckt, aber nicht die volle Reservierung, die trotzdem 402 bekommen,
Ziel 0 (vorher gemessen in Punkt 1).
Widerlegt, wenn der Dienst am Kopf von `dev` bei einem Guthaben knapp über Prompt plus 256 Tokens schon 200 antwortet.
MVP: Funktion, weil ein Kunde, der seine letzten Credits nicht nutzen kann, mit dem Gefühl geht, sein Geld sei verfallen, und ein
Rest von wenigen Cent die Runtime trotzdem anhält.

## Voraussetzungen
- abrechnung Goal 07 DONE

## Kontext für den Maker
- **Neuansatz 1 (Tech Lead, 27.11.2026), zuerst lesen.** Der Code von Zyklus 1 (`2738e8b`) bleibt und ist der Ausgangspunkt,
  nichts wird zurückgesetzt. Gescheitert ist Zyklus 1 nicht am Code, sondern am Vertrag: Die Kürzung macht aus der 402 in
  `test/card-checkout.test.ts:56` (karte 02, `emptyWallet(300)`, 300 mc tragen mit dem Mock-Preis rund 1150 Tokens) eine 200, und
  Deny List und Pfadprüfung von Punkt 4 verboten genau die eine Zahl, die den Test wieder auf eine Wallet unter der Grenze setzt.
  Jetzt erlaubt, in dieser Reihenfolge:
  1. `test/card-checkout.test.ts:56`: genau `emptyWallet(300)` wird `emptyWallet(50)`, sonst nichts (50 mc tragen höchstens 250
     Tokens, also bleibt es bei der 402; Testname, Erwartungen und der Prüfbefehl von karte 02 bleiben). Neue Prüfung in Punkt 4.
  2. `docs/kunden/auftraege-2026-11.md`, nur die Zeilennummern in den beiden Zeilen `- Weg: src/inference/proxy.ts:<n>` (kunden 08):
     die erste auf die Zeile `export async function handleChat(`, die zweite auf die Zeile, die dort heute gemeint ist (Zweig
     `openBountyCount` der 402 mit `bounties_url`). Fertig, wenn die Prüfung von kunden 08 (neue Prüfung in Punkt 4) nichts ausgibt.
  3. `src/app.ts`, nur die Route `POST /v1/chat/completions` (heute `:3190`, `c.json(res.body …, res.status …)`): die Köpfe aus
     `res.headers` mitgeben, damit `X-Max-Tokens-Shortened` (Entscheidung 4) beim Client ankommt; die Route der Prüfung von
     Einreichungen und jede andere Zeile bleiben. Ein Fall in `test/inference-shortened.test.ts` gegen `createApp` ohne festen Port,
     „sends X-Max-Tokens-Shortened to the client“, ist erwünscht, aber kein Done-Punkt.
  Danach `check` und alle Prüfbefehle, dann Punkt 5 am neuen Kopf des PR #482. Was Zyklus 1 sonst gebaut und abgehakt hat, prüft
  der Maker am Kopf einmal nach und übernimmt es nur, wenn es grün bleibt.
- Ziel in einem Satz: Eine fremde Runtime mit Restguthaben bekommt so lange Antworten, wie das Guthaben eine Antwort von 256 Tokens
  trägt, und sieht erst danach die 402 mit dem Weg zum Aufladen.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Eine Runtime, die weiterdenkt, kann in ihrem nächsten Zug
  aufladen oder ihren Menschen fragen; eine, die mit Rest stehen bleibt, tut beides nie.
- Quelle: `ROADMAP.md`, Topic `abrechnung`, Glied 08 (Tech Lead 27.11.2026, PRO-31352 aus der Triage PRO-31345). Übernimmt
  `goals/_vorschlaege/kunden-kritik-2026-11-26-6.md`.
- **Entscheidungen des Tech Lead (27.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, abrechnung 08: …`
  in `goals/abrechnung/ANNAHMEN.md`.
  1. **Gebaut wird unabhängig von der Messung.** Die Runtime am Pin fragt immer mit 4096 Tokens, also strandet jeder Rest unter der
     vollen Reservierung, egal wie viele Wallets heute so stehen. Die Messung in Punkt 1 ist die Zahl vorher, nicht das Gate.
  2. **Reihenfolge in `handleChatUncoalesced`:** zuerst wie heute die volle Reservierung, Startgutschrift und Schrittguthaben. Erst
     wenn danach nichts reserviert ist, rechnet der Dienst `affordable = floor((verfügbar minus Preis des geschätzten Prompts) /
     Preis je Antwort-Token)`, höchstens das angefragte `max_tokens`. Ist `affordable` mindestens 256 (Konstante
     `MIN_SHORTENED_TOKENS`), reserviert er Prompt plus `affordable` mit `reserveMc` und schickt die Anfrage mit genau diesem Wert im
     Feld, das die Anfrage benutzte (`max_completion_tokens` oder `max_tokens`, `parameter_style` des Modells bleibt maßgeblich). Sonst
     402. Ganze Zahlen in mc, nie float für Geld; die Division rundet ab, damit die Reservierung nie über dem Guthaben liegt.
  3. **Die 402 bleibt, wie sie ist, und bekommt ein Feld dazu:** `details.affordable_max_tokens` mit `max(0, affordable)`, in beiden
     402 (Annahme offen und `topupsClosed`). Text, `required_cents`, `current_balance_cents`, `topup_url`, `card_url` und
     `message_for_operator` bleiben Byte für Byte. Upstream liest nur den Marker und die beiden Felder (`src/conway/topup.ts:103 am
     Pin d8f8168`), das neue Feld ist additiv wie `topup_url`.
  4. **Die Antwort:** Body des Anbieters wie heute; ein Kopf `X-Max-Tokens-Shortened: <affordable>` nur bei gekürzter Anfrage. Kein
     eigener `finish_reason`: Der Anbieter liefert `length`, wenn die Antwort an die Grenze kam. Abgerechnet wird wie heute nach
     `usage` der Antwort, die ankam (Grundregel 6), die Reservierung wird danach wie heute aufgelöst.
  5. **Kompatibilität:** Der Maker liest am Pin `d8f8168` (Klon in `mktemp -d`, nie unter `harness/runtime/`), was die Runtime mit
     `finish_reason: "length"` tut, und schreibt den Satz mit Fundstelle als Zeile in `goals/abrechnung/ANNAHMEN.md`. Bricht die
     Runtime daran, fragt er den Tech Lead auf dem Topic, bevor er weiterbaut.
- **Messung vorher (Punkt 1), nur lesend:** `docs/abrechnung/rest-2026-11.md` mit dem Befehl (Abfrage mit `readonly: true` über
  `docker exec deploy-cp-1 node -e`, wie in `loop-constraints.md`, Produktion: nur lesen) und seiner Ausgabe: Zahl fremder Wallets
  (ohne `ops/own-ips.txt` und eigene Wallets wie in `ops/db-report.cjs`), deren verfügbares Guthaben 256 Tokens Antwort von
  `openai/gpt-5-mini` ohne Prompt deckt, aber nicht 4096; eine Summe ihrer Salden nur, wenn es mindestens 3 sind (Grundregel 8: nie
  Betrag je Kunde). Gegenprobe in beide Richtungen (Grundregel 3): dieselbe Abfrage gegen eine lokale Datenbank aus `openDb` unter
  `mktemp -d` mit einer gepflanzten Wallet im Fenster ergibt 1, mit einer außerhalb 0, beide Ausgaben im Dokument.
- **Tests** in `test/inference-shortened.test.ts`, ohne Netz und ohne festen Port, mit dem Mock-Provider: „shortens max_tokens when
  the balance covers the prompt and 256 tokens“ (200, die Anfrage an den Anbieter trägt den gekürzten Wert, Kopf gesetzt), „answers
  402 with affordable_max_tokens just below 256 tokens“ (402, Feld gesetzt, nichts reserviert), „keeps the full request when the
  balance covers it“ (kein Kopf, Wert unverändert) und „never reserves more than the balance“. Die ersten beiden liegen um genau ein
  Token an der Grenze. Am Kopf von `dev` ist der erste rot; die Zeile im Progress Log sagt, womit.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `proxy.ts` oder `402` nennen
  (`grep -l -E 'proxy\.ts|402' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem Bau erneut; ein fremder roter
  Prüfbefehl geht mit Befehl und beiden Ausgaben als Frage an den Tech Lead auf dem Topic.
- Zugang: `set -a; . ~/.config/control-plane/loop.env; set +a`, nur lesen. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check`
  und vitest im Vordergrund mit eigenem Timeout. Code, Bezeichner, Testnamen und Felder englisch.

## Done Condition
- [x] `docs/abrechnung/rest-2026-11.md` nennt vorher gemessen, wie viele fremde Wallets einen Rest zwischen 256 und 4096 Tokens
      Antwort halten, mit Befehl, Ausgabe und Gegenprobe in beide Richtungen, ohne Betrag je Kunde.
      MVP: Funktion, weil die Leitzahl ohne den Stand vorher nichts zeigt.
      Prüfung: `grep -c -E '^Fremde Wallets mit Rest zwischen 256 und 4096 Tokens: [0-9]+' docs/abrechnung/rest-2026-11.md` muss genau 1 ausgeben.
      Prüfung: `grep -c -E '^Gegenprobe: (im Fenster 1, außerhalb 0)$' docs/abrechnung/rest-2026-11.md` muss genau 1 ausgeben.
      Prüfung: `grep -c -E '0x[0-9a-fA-F]{40}|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' docs/abrechnung/rest-2026-11.md` muss 0 ausgeben.
- [x] Deckt das Guthaben Prompt und mindestens 256 Tokens, antwortet der Dienst 200 mit gekürztem `max_tokens`; knapp darunter 402
      mit `details.affordable_max_tokens`; die Reservierung liegt nie über dem Guthaben.
      MVP: Funktion, weil die Runtime mit Rest sonst stehen bleibt, obwohl sie bezahlen kann.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/inference-shortened.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "shortens max_tokens when the balance covers the prompt and 256 tokens" "answers 402 with affordable_max_tokens just below 256 tokens" "keeps the full request when the balance covers it" "never reserves more than the balance"; do grep -qF "\"$t\"" test/inference-shortened.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'MIN_SHORTENED_TOKENS = 256' src/inference/proxy.ts` muss genau 1 ausgeben.
- [x] Die bestehenden Tests der Inferenz bleiben grün und unverändert, die 402 behält Text und Felder.
      MVP: Funktion, weil die Runtime am Pin den Marker und zwei Felder der 402 liest (Grundregel 13).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/inference.test.ts test/inference-abort.test.ts test/inference-sunset.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- test/inference.test.ts test/inference-abort.test.ts test/inference-sunset.test.ts | wc -l` muss 0 ausgeben.
- [x] Die Entscheidungen stehen in `goals/abrechnung/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg.
      MVP: Funktion, weil das nächste Glied wissen muss, warum 256 Tokens die Grenze sind und was die Runtime mit `length` tut.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, abrechnung 08: ' goals/abrechnung/ANNAHMEN.md` muss mindestens 5 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/inference/proxy\.ts|src/app\.ts|test/inference-shortened\.test\.ts|test/card-checkout\.test\.ts|docs/abrechnung/rest-2026-11\.md|docs/kunden/auftraege-2026-11\.md|docs/errors\.md|goals/abrechnung/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- test/card-checkout.test.ts | grep -E '^[-+] ' | tr -d ' ' | LC_ALL=C sort | tr '\n' '|'` muss genau `+const{address,chat}=emptyWallet(50);|-const{address,chat}=emptyWallet(300);|` ausgeben.
      Prüfung: `grep -oE "^- Weg: src/[A-Za-z0-9_/.-]+\.ts:[0-9]+" docs/kunden/auftraege-2026-11.md | sed 's/^- Weg: //' | while IFS=: read -r p n; do sed -n "${n}p" "$p" | grep -qiE "bount|submi|award|ledger|chat|inference|402" || echo "falsch $p:$n"; done` muss nichts ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
- [x] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil sich die Abrechnung im Laufzeitpfad ändert und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/abrechnung-08 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Die Ledger-Zeile `inference` einer gekürzten Anfrage trägt in `meta` den Schlüssel `shortened_to` mit dem gekürzten Wert; eine
      volle Anfrage hat den Schlüssel nicht, ihre Zeile bleibt, wie sie ist (Kritik, Tech Lead 27.11.2026).
      MVP: Funktion, weil die Leitzahl und der Nutzen der Kürzung nach dem Rollout nur aus der Produktion gemessen werden dürfen
      (Grundregel 3) und heute weder Ledger noch Caddy-Log eine gekürzte Antwort von einer vollen unterscheiden; ohne die Spur
      bleibt offen, ob Runtimes mit Rest danach weiterarbeiten oder aufladen.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/inference-shortened.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "records shortened_to in the ledger row of a shortened call" "leaves the ledger row of a full call without shortened_to"; do grep -qF "\"$t\"" test/inference-shortened.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'shortened_to' src/inference/proxy.ts` muss mindestens 1 ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Eine Runtime mit Restguthaben bekommt Antworten, bis der Rest keine 256 Tokens mehr trägt, und zahlt nie mehr, als sie hat.
- [ ] Wer genug Guthaben hat, merkt nichts: gleiche Anfrage an den Anbieter, gleiche Antwort, gleiche Abrechnung.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse und keine IP eines Kunden, kein Betrag je Kunde.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/inference/proxy.ts`: nur der Weg vom Scheitern der vollen Reservierung bis zur 402 und das neue Feld; Coalescing, Abbruch,
  Abrechnung nach `usage`, 404, 400 und die Texte der 402 bleiben Zeichen für Zeichen; einzige Ausnahme in der Abrechnung ist der
  Schlüssel `shortened_to` im `meta` der Ledger-Zeile `inference`, nur bei gekürzter Anfrage (Kritik)
- `src/app.ts`: nur in der Route `POST /v1/chat/completions` die Köpfe aus `res.headers` an die Antwort geben (Neuansatz 1)
- `src/**` sonst, `src/db.ts`, `src/payments/**`, `src/auth/**`, `ops/**`, `mcp/**`, `README.md`: unverändert
- `docs/errors.md`: nur ein Satz zu `affordable_max_tokens` im Abschnitt der 402
- `docs/kunden/auftraege-2026-11.md`: nur die Zeilennummern der beiden Zeilen `- Weg: src/inference/proxy.ts:<n>` (Neuansatz 1)
- `test/card-checkout.test.ts`: nur `emptyWallet(300)` wird `emptyWallet(50)` im Fall „leaves error, required_cents,
  current_balance_cents and topup_url of the 402 as they are“ (Neuansatz 1)
- `test/**` sonst außer `test/inference-shortened.test.ts`: unverändert
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`,
  die der Tech Lead entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- Gutschrift von Hand, Wallet-Bewegung, Topup, jeder Wert in `/opt/control-plane/.env`, ein Rollout oder Neustart durch einen Agent,
  jede Abfrage der Produktion, die schreibt (`loop-constraints.md`, Grundregeln 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-27 Zyklus 1: Punkte 1, 2, 3, 4 gebaut (Kürzung von `max_tokens` in `src/inference/proxy.ts`, `details.affordable_max_tokens` in beiden 402, Messung vorher mit 2 fremden Wallets im Fenster), Punkt 5 und 6 offen, weil `test/card-checkout.test.ts` (karte 02, Deny List) bei 300 mc eine 402 erwartet, die jetzt eine gekürzte Antwort ist. Neuer Test am Kopf von `dev` rot: „shortens …“ mit `expected 402 to be 200`, „answers 402 …“ mit `expected undefined to be 255`, „never reserves …“ mit `balance 3357: expected 3357 to be less than 3357`, „keeps the full request …“ grün und erst mit der Mutante `shortenedTo === -1` rot (`expected { 'X-Max-Tokens-Shortened': 'null' } to be undefined`). Prüfbefehle: P1 `1`, `1`, `0`; P2 Exit 0, nichts, `1`; P3 Exit 0 (44 passed), `0`; P4 `8`, `0`, `0`; P5 `e2e` am PR #482 lief bei Übergabe noch; P6 Exit 1 (`1 failed | 2950 passed`, `test/card-checkout.test.ts` > „leaves error, required_cents, current_balance_cents and topup_url of the 402 as they are“: `expected undefined to be 'INSUFFICIENT_CREDITS'`).
- 2026-11-27 Zyklus 1 nach Neuansatz 1: Punkte 4, 6 gebaut (`emptyWallet(50)` in `test/card-checkout.test.ts:56`, kunden 08 auf `src/inference/proxy.ts:224` und `:465`, `res.headers` in der Route `POST /v1/chat/completions`, Fall „sends X-Max-Tokens-Shortened to the client“, ohne die Route rot mit `expected null to be '256'`); Punkte 1 bis 3 am Kopf nachgeprüft und grün; Punkt 5 wartet auf `e2e` am neuen Kopf von PR #482. Prüfbefehle: P1 `1`, `1`, `0`; P2 Exit 0 (5 passed), nichts, `1`; P3 Exit 0 (44 passed), `0`; P4 `10`, `0`, `+const{address,chat}=emptyWallet(50);|-const{address,chat}=emptyWallet(300);|`, nichts, `0`; P6 Exit 0 (`2952 passed`, „check: grün in 339 s“).
- 2026-11-27 Zyklus 1 nach Neuansatz 1: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6. `dev` unverändert seit der Merge-Basis `2595e4f`, also kein Merge nötig. Prüfbefehle: P1 bis P4 und P6 wie in der Zeile davor; P5 `1` (Job `e2e` pass in 10m34s am Kopf `a3e9c4d`, Lauf 46042124736).
- 2026-11-27 Zyklus 2: Punkt 7 gebaut (`shortened_to` im `meta` der Ledger-Zeile `inference`, nur bei gekürzter Anfrage). Neue Tests: „records shortened_to …“ ohne Code rot mit `expected undefined to be 300`; „leaves the ledger row of a full call …“ mit der Mutante `shortened_to: shortenedTo` (Schlüssel immer gesetzt) rot mit `expected [ 'model', … ] to not include 'shortened_to'`. Prüfbefehle: P1 `1`, `1`, `0`; P2 Exit 0 (7 passed), nichts, `1`; P3 Exit 0 (44 passed), `0`; P4 `11`, `0`, `+const{address,chat}=emptyWallet(50);|-const{address,chat}=emptyWallet(300);|`, nichts (kunden 08), `0`; P6 Exit 0 (`2954 passed`, „check: grün in 287 s“); P7 Exit 0, nichts, `1`; P5 am neuen Kopf folgt.
- 2026-11-27 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7. `dev` unverändert seit der Merge-Basis `2595e4f`, kein Merge nötig. Prüfbefehle: wie in der Zeile davor; P5 `1` (Job `e2e` pass in 10m40s am Kopf `6dc1889`, Lauf 46046302469).
- 2026-11-27 Zyklus 3: Befund 1 der Linse K (Zyklus 2) gebaut, `dev` (`24de71c`) gemergt. Neuer Fall „releases only its own reservation when a shortened call ends beside a running one“ in `test/inference-shortened.test.ts`: mit entferntem `requiredMc = shortenedMc;` rot (`expected 3929 to be 53277`), am Kopf grün. Prüfbefehle: P1 `1`, `1`, `0`; P2 Exit 0 (8 passed), nichts, `1`; P3 Exit 0 (44 passed), `0`; P4 `12`, `0`, `+const{address,chat}=emptyWallet(50);|-const{address,chat}=emptyWallet(300);|`, nichts (kunden 08), `0`; P6 Exit 0 (`2955 passed`, „check: grün in 244 s“); P7 Exit 0, nichts, `1`.
- 2026-11-27 Zyklus 3: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7. P5 (`e2e` am Kopf dieses Commits) steht im Kommentar am Topic.
- 2026-11-27 Release: PASS K und B (Zyklus 3), DONE.

## Neuansätze
1. 2026-11-27: Ursache: Punkt 6 (`check`) war nur an `test/card-checkout.test.ts:56` rot, dessen 402 mit 300 mc die Kürzung zu einer 200 macht, und Deny List samt Pfadprüfung von Punkt 4 verboten die Zahl im Test, dazu verschob der Code die Zeilen, auf die kunden 08 in `docs/kunden/auftraege-2026-11.md` zeigt; neuer Weg: Der Code von Zyklus 1 bleibt, die Deny List öffnet genau `emptyWallet(50)` in diesem Test, die beiden Zeilennummern von kunden 08 und die Weitergabe der Köpfe in der Route `POST /v1/chat/completions`, Punkt 4 prüft die Pfade und beide Nachzüge.

## Blockers
- keine
