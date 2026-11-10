# Abrechnung Goal 02: Schnellere Anbieter über das Provider-Routing

## Status
PLANNED

## Active Objective
Weniger Antworten laufen in den Timeout der Runtime: Die Inferenz bittet OpenRouter über das Provider-Routing um schnelle Anbieter,
die Timeout-Quote vorher steht aus den eigenen Daten fest, und je Aufruf stehen Dauer und tatsächlicher Anbieter in der Datenbank,
damit `ops/live.sh` die Quote nachher ab dem Rollout zeigt (`docs/kette.md`, abrechnung 02).
MVP: Funktion, weil eine Antwort, die nach 60 Sekunden noch nicht da ist, für den Automaton verloren ist und er dafür seit abrechnung 01
zwar nicht mehr zahlt, aber auch nicht weiterarbeitet.

## Voraussetzungen
- abrechnung Goal 01 DONE

## Kontext für den Maker
- OpenRouter nimmt im Request ein Feld `provider` mit Vorgaben zur Auswahl der Anbieter (etwa Sortierung nach Durchsatz oder Latenz,
  Reihenfolge, Ausweichen erlaubt). Lies die aktuelle Doku von OpenRouter dazu, bevor du baust, und halte die Wahl samt Quelle in
  `goals/abrechnung/ANNAHMEN.md` fest. Das Feld setzt der Dienst, nicht der Client: Ein Feld `provider` im Body des Kunden reicht nicht
  durch (wie `zdr` in `src/inference/proxy.ts`).
- Die Modelle im Katalog sind die aus `CP_OPENROUTER_MODELS` in der Produktion (heute `openai/gpt-5.2` und `openai/gpt-5-mini`); nie ein
  Claude- oder Anthropic-Modell, auch nicht als Ausweichziel (`loop-constraints.md`, Grundregel 11).
- Die Quote vorher: Anteil der Anfragen an `/v1/chat/completions` mit Status 200 oder Abbruch, die länger liefen als 60 Sekunden, je
  Modell und Tag, aus dem Caddy-Zugriffslog (`duration`, auch die gedrehten Dateien unter `/var/log/caddy/` im Container
  `deploy-caddy-1`) und den Abbruch-Einträgen aus abrechnung 01, nur lesend. Fremde und eigene Adressen getrennt (`ops/own-ips.txt`),
  ohne eine Adresse ins Repo zu schreiben. Das Werkzeug `ops/timeout-quote.sh` liest stdin oder die Produktion und hat einen
  Selbsttest in beide Richtungen.
- Der Preis kann je Anbieter verschieden sein; abgerechnet wird weiter der tatsächliche Einkauf mal 1,3 (`costMc`), also ändert sich
  daran nichts. Prüf es trotzdem im Test, mit zwei Anbietern verschiedener Preise.
- Was danach schneller zu mehr zahlenden Automatons führt: Ein Automaton, dessen Turns ankommen, bleibt und zahlt weiter; die Quote
  nachher ist die Zahl, die kanal 01 und die Seite ehrlich nennen können.
- Der Laufzeitpfad ändert sich, der Merge rollt über `deploy.yml` aus. Den Rollout selbst machst du nicht.

## Done Condition
- [ ] `ops/timeout-quote.sh` zählt die Timeout-Quote je Modell und Tag und ist in beide Richtungen bewiesen: Der Selbsttest zeigt an
      gepflanzten Zeilen eine Quote über 0 und bei Zeilen ohne lange Anfrage genau 0, ohne Netz.
      Prüfung: `bash ops/timeout-quote.sh --selftest` muss Exit-Code 0 haben und `TIMEOUT QUOTE SELFTEST OK` ausgeben.
- [ ] Die Quote vorher steht in `docs/abrechnung/timeouts.md`: Zeitraum, je Modell Zahl der Anfragen, Zahl über 60 Sekunden und Quote,
      fremde Adressen getrennt gezählt, mit dem Befehl, aus dem sie stammt, ohne eine Adresse.
      Prüfung: `grep -c "ops/timeout-quote.sh" docs/abrechnung/timeouts.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "^[|] *openai/" docs/abrechnung/timeouts.md` muss mindestens 2 ausgeben.
      Prüfung: `grep -cE "0x[0-9a-fA-F]{40}" docs/abrechnung/timeouts.md` muss 0 ausgeben.
- [ ] Jeder Aufruf an OpenRouter trägt das gewählte Provider-Routing, ein `provider` aus dem Body des Kunden kommt nicht durch, und der
      Preis bleibt der tatsächliche Einkauf mal 1,3; der Test liest den Request, den der Anbieter bekommt.
      Prüfung: `pnpm -s vitest run test/provider-routing.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/provider-routing.test.ts` muss mindestens 3 ausgeben.
- [ ] Je Aufruf stehen Dauer in ms und der Anbieter, der tatsächlich geantwortet hat, in der Datenbank (bei einer Buchung in den Meta-Daten
      der Ledger-Zeile, bei einem Abbruch im Eintrag aus abrechnung 01).
      Prüfung: `pnpm -s vitest run test/provider-routing.test.ts -t "duration"` muss Exit-Code 0 haben.
- [ ] `ops/live.sh` zeigt die Quote seit dem Rollout dieses Goals je Modell, und sein Selbsttest deckt die neue Prüfung mit ab.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und `LIVE SELFTEST OK` ausgeben.
      Prüfung: `grep -c "timeout-quote" ops/live.sh` muss mindestens 1 ausgeben.
- [ ] Kein Claude- oder Anthropic-Modell in Auswahl oder Routing, und `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
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
