# Abrechnung Goal 01: Keine Abbuchung ohne angekommene Antwort

## Status
ACTIVE

## Active Objective
Bricht ein Client vor der fertigen Antwort ab, bucht `/v1/chat/completions` nichts ab: keine Ledger-Zeile `inference`, die
Reservierung ist frei, der Abbruch reicht bis zum Anbieter durch und steht mit Modell, Dauer und Einkaufspreis in der Datenbank.
Die drei Fälle vom 10.11.2026, die trotz Abbruch berechnet wurden (zusammen 0,37 USD), kommen als interne Gutschrift auf das Guthaben
des Kunden zurück, idempotent und über Code, der mit dem Rollout läuft. `ops/live.sh` ist die Live-Prüfung des Release Managers und
zeigt die Gutschrift (`docs/kette.md`, abrechnung 01; `loop-constraints.md`, Grundregel 6).
MVP: Funktion, weil ein Kunde, der für Antworten zahlt, die nie ankamen, als Erstes wieder geht, und weil abrechnung 02 die Abbrüche
zählen muss, um schnellere Anbieter zu belegen.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ursache im Code: `handleChatUncoalesced` in `src/inference/proxy.ts` reserviert, ruft `entry.provider.chat(...)` und bucht mit
  `postLedger(... kind: "inference" ...)`, sobald der Anbieter antwortet, ohne zu wissen, ob der Client noch wartet. Die Route steht in
  `src/app.ts`; `@hono/node-server` gibt den Abbruch des Clients als `c.req.raw.signal` weiter. Der Anbieter (`src/inference/openrouter.ts`)
  hat schon einen eigenen Timeout über einen `AbortController`; der Abbruch des Clients gehört dazu. Zusammengeführte identische
  Anfragen laufen über `RequestCoalescer` (`src/inference/dedupe.ts`): Bricht einer von zwei Aufrufern ab, wartet der andere weiter und
  zahlt genau einmal; brechen alle ab, bucht niemand.
- Was nach dem Abbruch schon eingekauft ist, ist unser Einkauf ohne Verkauf; er wird festgehalten (Modell, Dauer in ms, Einkaufspreis
  in mc, Zeitpunkt), aber nie dem Kunden berechnet. In der Datenbank, nicht nur im Container-Log, denn der Rollout ersetzt den
  Container samt Log. Kein Prompt, keine Antwort und keine Adresse im Klartext in diesem Eintrag.
- Die drei Fälle findest du nur lesend in der Produktion (`loop-constraints.md`, Produktion: nur lesen): Caddy-Zugriffslog
  `/var/log/caddy/access.log` im Container `deploy-caddy-1` (JSON mit `duration`, `status`, `request.uri`) für die Anfragen an
  `/v1/chat/completions` mit 60 Sekunden Dauer am 10.11.2026, dazu die Zeilen `kind = 'inference'` im Ledger zur selben Zeit, gelesen mit
  `docker exec deploy-cp-1 node -e 'const db = require("better-sqlite3")("/data/cp.db", { readonly: true }); …'`. Ins Repo kommen nur
  ihre `ref` (die Kennung der Generation beim Anbieter) und die Summe; Adresse, Name und Guthaben des Kunden nie, auch nicht in
  Commit-Message, PR, Kommentar oder Fixture (`loop-constraints.md`, Grundregel 8).
- Die Gutschrift ist eine Ledger-Zeile (`postLedger`, eigene `kind`, etwa `refund`) auf dieselbe Adresse wie die drei Abbuchungen, in
  derselben Transaktion wie der Saldo, mit Verweis auf die drei `ref` und einem festen Idempotenzschlüssel, damit ein zweiter Start oder
  ein zweiter Rollout nichts doppelt bucht. Sie läuft beim Start des Dienstes nach dem Rollout (wie die übrigen Schritte in `src/db.ts`),
  nie als SQL von Hand auf dem Server. Keine Überweisung, kein On-Chain-Senden, kein Topup. Prüf vor dem Bau, ob `GET /v1/credits/history`
  und `/v1/status` eine neue `kind` vertragen (die Runtime liest die Historie); ein Test hält das fest.
- `ops/live.sh` (neu): nur lesend gegen `https://postyourprice.com` und per `ssh` mit den Variablen aus `~/.config/control-plane/loop.env`.
  Es prüft `/health`, dass `/v1/status` antwortet, und dass die Gutschrift der drei Fälle genau einmal im Ledger steht, und gibt je
  Prüfung eine Zeile `OK` oder `FAIL` aus, Exit 1 bei einem `FAIL`. `--selftest` liest nichts aus dem Netz und zeigt an gepflanzten
  Daten beide Richtungen (`loop-constraints.md`, Grundregel 3). Spätere Goals hängen ihre Live-Prüfung hier an.
- Was danach schneller zu mehr zahlenden Automatons führt: abrechnung 02 misst mit genau diesen Einträgen die Timeout-Quote und wählt
  schnellere Anbieter; der Kanal (kanal 01) kann einem Kunden mit Timeout-Problemen dann ehrlich sagen, dass er für Abbrüche nicht
  zahlt.
- Der Laufzeitpfad ändert sich, also rollt der Merge über `deploy.yml` aus (`LOOP.md`, Release); der Job `e2e` des PR muss grün sein.
  Den Rollout selbst machst du nicht.

## Done Condition
- [x] Ein Abbruch des Clients vor der fertigen Antwort bucht nichts: Der Test stellt einen Anbieter, der erst nach dem Abbruch
      antwortet, und verlangt keine Ledger-Zeile `inference`, ein freies Guthaben gleich dem Saldo (Reservierung zurück) und ein
      ausgelöstes Abbruch-Signal beim Anbieter. Ein zweiter Test zeigt, dass eine Anfrage ohne Abbruch genau wie vorher genau einmal
      gebucht wird.
      Prüfung: `pnpm -s vitest run test/inference-abort.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/inference-abort.test.ts` muss mindestens 4 ausgeben.
- [x] Zusammengeführte Anfragen bleiben richtig: Bricht einer von zwei identischen gleichzeitigen Aufrufern ab, bekommt der andere die
      Antwort und es gibt genau eine Ledger-Zeile `inference`; brechen beide ab, gibt es keine.
      Prüfung: `grep -ciE "coalesc" test/inference-abort.test.ts` muss mindestens 2 ausgeben.
      Prüfung: `pnpm -s vitest run test/inference-abort.test.ts test/inference.test.ts test/money-adversarial.test.ts` muss Exit-Code 0 haben.
- [x] Jeder Abbruch steht in der Datenbank mit Modell, Dauer in ms, Einkaufspreis in mc und Zeitpunkt, ohne Prompt, Antwort und Adresse
      im Klartext; der Test liest den Eintrag nach einem Abbruch und findet keinen ohne Abbruch.
      Prüfung: `pnpm -s vitest run test/inference-abort.test.ts -t "records"` muss Exit-Code 0 haben.
      Prüfung: `grep -c "records" test/inference-abort.test.ts` muss mindestens 1 ausgeben.
- [x] Die Gutschrift der drei Fälle vom 10.11.2026: eine Ledger-Zeile auf die Adresse der drei Abbuchungen über genau ihre Summe, mit
      Verweis auf die drei `ref`, idempotent; der Test baut eine Datenbank mit drei solchen Abbuchungen und einer fremden, startet den
      Schritt zweimal und verlangt genau eine Gutschrift über die Summe der drei, Saldo gleich Summe des Ledgers, keine Gutschrift, wenn
      die drei Abbuchungen fehlen, und `GET /v1/credits/history` antwortet mit der neuen Zeile ohne Fehler.
      Prüfung: `pnpm -s vitest run test/credit-aborted.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/credit-aborted.test.ts` muss mindestens 4 ausgeben.
- [x] `ops/live.sh` steht und ist in beide Richtungen bewiesen: Der Selbsttest zeigt an gepflanzten Daten `FAIL` ohne Gutschrift, `FAIL`
      bei doppelter Gutschrift und `OK` bei genau einer, ohne Netz.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und `LIVE SELFTEST OK` ausgeben.
      Prüfung: `grep -cE "readonly: *true" ops/live.sh` muss mindestens 1 ausgeben.
- [x] Kein Name, keine Adresse und kein Guthaben eines Kunden im Diff: Jede Ethereum-Adresse, die das Goal neu ins Repo bringt, steht in
      einer Fixture unter `test/` und ist erkennbar erfunden, oder sie gehört uns und steht in `src/bounties/ours.ts`.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) -- src ops | grep -E "^\+" | grep -oiE "0x[0-9a-f]{40}" | tr A-F a-f | sort -u | grep -vxFf <(grep -oiE "0x[0-9a-f]{40}" src/bounties/ours.ts | tr A-F a-f) | wc -l` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] Kritik: Die Gutschrift umfasst alle fünf Anfragen dieses Kunden vom 10.11.2026, die nach dem Abbruch trotzdem berechnet
      wurden, nicht nur die drei nach 59,9 s: Das Caddy-Zugriffslog zeigt Status 0 auch um 05:16:27 UTC nach 22,8 s und um 05:18:17 UTC
      nach 18,5 s, vom selben Client, und das Ledger bucht dazu `gen-1794287765-SupdXvMT0JLDL224yBtY` (8883 mc) und
      `gen-1794287878-doiF42ITx3lfTwxRWfqU` (8702 mc), je rund 6 s nach dem Abbruch. Die Summe der fünf ist 79229 mc; der Batch nennt
      alle fünf `ref`, `ops/live.sh` erwartet genau diese Summe, und der Test baut eine Datenbank mit allen fünf Abbuchungen.
      MVP: Funktion, weil Grundregel 6 jede berechnete, nicht angekommene Antwort zurückgibt und eine halbe Gutschrift den Kunden
      genauso verliert wie keine.
      Prüfung: `grep -cE "gen-1794287765-SupdXvMT0JLDL224yBtY|gen-1794287878-doiF42ITx3lfTwxRWfqU" src/credits/aborted.ts` muss 2 ausgeben.
      Prüfung: `grep -cE "totalMc: 79_?229" src/credits/aborted.ts` muss 1 ausgeben.
      Prüfung: `grep -c "^REFUND_MC=79229$" ops/live.sh` muss 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/credit-aborted.test.ts` muss Exit-Code 0 haben.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und `LIVE SELFTEST OK` ausgeben.
- [ ] Kritik: `## Acceptance Criteria` steht wieder wie auf dem Integrationszweig, alle drei Kästchen leer. Die Goal-Datei darf sich
      auf dem Goal-Branch nur in Status, Progress Log, Blockers, Ehrlichen Lücken, den Kästchen der Done-Punkte und den Kritik-Punkten
      ändern; die angehakten Acceptance-Kästchen meldet `goalDrift` des Gates als Vertragsänderung, und der PR ginge in die Human Inbox.
      Ob die drei Kriterien erfüllt sind, belegt die Zeile im Progress Log.
      MVP: Funktion, weil sonst das Gate den Merge verweigert und weder die Gutschrift noch der Abbruchschutz ausrollt.
      Prüfung: `sed -n '/^## Acceptance Criteria/,/^## Deny List/p' goals/abrechnung/01-keine-abbuchung-ohne-angekommene-antwort.md | grep -c '^- \[ \]'` muss 3 ausgeben.
      Prüfung: `sed -n '/^## Acceptance Criteria/,/^## Deny List/p' goals/abrechnung/01-keine-abbuchung-ohne-angekommene-antwort.md | grep -c '^- \[x\]'` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [x] Jede neue Testdatei war vor dem Fix rot; die Zeile im Progress Log nennt, womit (`loop-constraints.md`, Budget und Qualität).
- [x] Der Job `e2e` am Kopf des PR ist grün (`gh pr checks`).
- [x] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**` außer
  `deploy/Caddyfile`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `harness/runtime/**`, `.env*`, `src/payments/**`, `src/auth/**`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-10 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7 gebaut: Abbruch-Signal des Clients von der Route über den Coalescer bis zum Anbieter, keine Buchung nach dem Abbruch, Tabelle inference_aborts, Gutschrift der drei Fälle beim Start (61644 mc, gemessen, siehe ANNAHMEN.md), ops/live.sh mit Selbsttest. Rot vorher: beide neuen Testdateien gegen src von origin/dev 8 von 9 und Importfehler rot, dazu Mutationen (Buchung trotz Abbruch, Coalescer bricht beim ersten Abgang ab, ohne Idempotenz, OpenRouter ohne Signal, Route ohne Signal, live.sh-Richter immer OK, Abfrage immer n=1) je rot; Gegenprobe Punkt 6 mit gepflanzter Adresse 1. Prüfbefehle (Node 22, PATH=/usr/bin:$PATH): P1 vitest inference-abort Exit 0, grep it 9; P2 grep coalesc 5, vitest drei Dateien 38 passed Exit 0; P3 -t records 2 passed Exit 0, grep records 2; P4 vitest credit-aborted 6 passed Exit 0, grep it 6; P5 live.sh --selftest LIVE SELFTEST OK Exit 0, grep readonly 2; P6 0; P7 check grün (1251 Tests, Exit 0; ein Lauf davor Exit 1 nur durch zwei Vitest-RPC-Timeouts bei Load 150, alle Tests grün).
- 2026-11-10 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7. `origin/dev` gemergt (schon enthalten), Kopf 960a98f. Prüfbefehle (Node 22.23.4, PATH=/usr/bin:$PATH): P1 vitest inference-abort 9 passed Exit 0, grep it 9; P2 grep coalesc 5, vitest drei Dateien 38 passed Exit 0; P3 -t records 2 passed Exit 0, grep records 2; P4 vitest credit-aborted 6 passed Exit 0, grep it 6; P5 live.sh --selftest LIVE SELFTEST OK Exit 0, grep readonly 2; P6 0; P7 check grün (1251 Tests, 71 s, Exit 0, Load 112). `gh pr checks 2`: check pass, e2e pass (1m45s) am Kopf 960a98f. Kein Gedankenstrich in hinzugefügten Zeilen (grep U+2013/U+2014 leer).

## Blockers
