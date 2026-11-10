# Abrechnung Goal 01: Keine Abbuchung ohne angekommene Antwort

## Status
PLANNED

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
- [ ] Ein Abbruch des Clients vor der fertigen Antwort bucht nichts: Der Test stellt einen Anbieter, der erst nach dem Abbruch
      antwortet, und verlangt keine Ledger-Zeile `inference`, ein freies Guthaben gleich dem Saldo (Reservierung zurück) und ein
      ausgelöstes Abbruch-Signal beim Anbieter. Ein zweiter Test zeigt, dass eine Anfrage ohne Abbruch genau wie vorher genau einmal
      gebucht wird.
      Prüfung: `pnpm -s vitest run test/inference-abort.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/inference-abort.test.ts` muss mindestens 4 ausgeben.
- [ ] Zusammengeführte Anfragen bleiben richtig: Bricht einer von zwei identischen gleichzeitigen Aufrufern ab, bekommt der andere die
      Antwort und es gibt genau eine Ledger-Zeile `inference`; brechen beide ab, gibt es keine.
      Prüfung: `grep -ciE "coalesc" test/inference-abort.test.ts` muss mindestens 2 ausgeben.
      Prüfung: `pnpm -s vitest run test/inference-abort.test.ts test/inference.test.ts test/money-adversarial.test.ts` muss Exit-Code 0 haben.
- [ ] Jeder Abbruch steht in der Datenbank mit Modell, Dauer in ms, Einkaufspreis in mc und Zeitpunkt, ohne Prompt, Antwort und Adresse
      im Klartext; der Test liest den Eintrag nach einem Abbruch und findet keinen ohne Abbruch.
      Prüfung: `pnpm -s vitest run test/inference-abort.test.ts -t "records"` muss Exit-Code 0 haben.
      Prüfung: `grep -c "records" test/inference-abort.test.ts` muss mindestens 1 ausgeben.
- [ ] Die Gutschrift der drei Fälle vom 10.11.2026: eine Ledger-Zeile auf die Adresse der drei Abbuchungen über genau ihre Summe, mit
      Verweis auf die drei `ref`, idempotent; der Test baut eine Datenbank mit drei solchen Abbuchungen und einer fremden, startet den
      Schritt zweimal und verlangt genau eine Gutschrift über die Summe der drei, Saldo gleich Summe des Ledgers, keine Gutschrift, wenn
      die drei Abbuchungen fehlen, und `GET /v1/credits/history` antwortet mit der neuen Zeile ohne Fehler.
      Prüfung: `pnpm -s vitest run test/credit-aborted.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/credit-aborted.test.ts` muss mindestens 4 ausgeben.
- [ ] `ops/live.sh` steht und ist in beide Richtungen bewiesen: Der Selbsttest zeigt an gepflanzten Daten `FAIL` ohne Gutschrift, `FAIL`
      bei doppelter Gutschrift und `OK` bei genau einer, ohne Netz.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und `LIVE SELFTEST OK` ausgeben.
      Prüfung: `grep -cE "readonly: *true" ops/live.sh` muss mindestens 1 ausgeben.
- [ ] Kein Name, keine Adresse und kein Guthaben eines Kunden im Diff: Jede Ethereum-Adresse, die das Goal neu ins Repo bringt, steht in
      einer Fixture unter `test/` und ist erkennbar erfunden, oder sie gehört uns und steht in `src/bounties/ours.ts`.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) -- src ops | grep -E "^\+" | grep -oiE "0x[0-9a-f]{40}" | tr A-F a-f | sort -u | grep -vxFf <(grep -oiE "0x[0-9a-f]{40}" src/bounties/ours.ts | tr A-F a-f) | wc -l` muss 0 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei war vor dem Fix rot; die Zeile im Progress Log nennt, womit (`loop-constraints.md`, Budget und Qualität).
- [ ] Der Job `e2e` am Kopf des PR ist grün (`gh pr checks`).
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**` außer
  `deploy/Caddyfile`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `harness/runtime/**`, `.env*`, `src/payments/**`, `src/auth/**`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
