# Domains Goal 01: Die Domain-Endpunkte der Runtime

## Status
PLANNED

## Active Objective
Die Domain-Endpunkte, die die unveränderte Runtime bei Conway aufruft und die ein fremder Automaton am 10.11.2026 bei uns mit 404
traf, antworten so, wie die Runtime es erwartet: Was ohne Kauf geht, funktioniert, und was einen Kauf bräuchte, bekommt eine klare
Antwort statt 404 (`docs/kette.md`, domains 01).
MVP: Funktion, weil der Dienst eines Kunden einen Namen braucht, unter dem andere ihn erreichen, und ein 404 der Runtime sagt, dass es
den Weg nicht gibt.

## Voraussetzungen
- sandbox Goal 01 DONE

## Kontext für den Maker
- Maßgeblich ist der Abschnitt `## Endpunkte` in `docs/sandbox/vertrag.md` (sandbox 01): jede Zeile mit `/v1/domains`, mit Feldern,
  Fundstelle am Pin `d8f8168` und dem Verhalten der Runtime bei einem Fehler. Was dort nicht steht, baut dieses Goal nicht.
- Was hinter den Endpunkten entsteht, entscheidest du nach `docs/sandbox/plan.md` und hältst es in `goals/domains/ANNAHMEN.md` fest:
  etwa ein Name unter einer eigenen Zone, der auf den freigegebenen Port einer Sandbox zeigt. Ein echter Domain-Kauf für einen Kunden ist
  ein Kauf und damit das Human Gate `server_kauf`; bis dahin antwortet der Endpunkt mit einem Status und einem Text, den die Runtime als
  „nicht verfügbar“ liest (Fundstelle im Vertrag), nie mit einem erfundenen Erfolg. DNS einer fremden Zone fasst das Goal nie an; braucht
  eine eigene Zone einen Eintrag, den der Loop nicht setzen kann, ist auch das eine Karte.
- Abgerechnet wird in Credits, wie sandbox 03 es festlegt, oder gar nicht, solange nichts Kostenpflichtiges entsteht. Eine Abbuchung nur
  mit Ledger-Zeile in derselben Transaktion wie der Saldo.
- Der Laufzeitpfad ändert sich, der Merge rollt über `deploy.yml` aus. Den Rollout selbst machst du nicht.

## Done Condition
- [ ] Jeder Domain-Endpunkt aus `docs/sandbox/vertrag.md` hat eine Route; keiner antwortet mehr mit 404 der Rückfallroute.
      Prüfung: `pnpm -s vitest run test/domains.test.ts` muss Exit-Code 0 haben.
      Prüfung: `test "$(awk '/^## Endpunkte/{f=1;next} /^## /{f=0} f && /^[|] (GET|POST|PUT|PATCH|DELETE) /' docs/sandbox/vertrag.md | grep -c '/v1/domains')" -le "$(grep -cE "^\s*(it|test)\(" test/domains.test.ts)" && echo genug` muss `genug` ausgeben.
- [ ] Die Antworten haben die Felder, die die Runtime laut Vertrag liest; ein Test je Endpunkt prüft Status und Felder gegen die Zeile des
      Vertrags, und ein Endpunkt, der einen Kauf bräuchte, antwortet mit dem Status, den die Runtime als nicht verfügbar liest.
      Prüfung: `grep -c "vertrag.md" test/domains.test.ts` muss mindestens 1 ausgeben.
- [ ] Der Harness zeigt, dass die unveränderte Runtime die Domain-Endpunkte ohne Fehler aufruft (Job `e2e` am Kopf des PR grün, mit einer
      Zeile im Log des Harness, die einen Aufruf von `/v1/domains` zeigt).
      Prüfung: `grep -rc "/v1/domains" harness/e2e | awk -F: '{s += $2} END {print (s > 0) ? "da" : "fehlt"}'` muss `da` ausgeben.
- [ ] `ops/live.sh` prüft nach dem Rollout einen Domain-Endpunkt mit einer eigenen Adresse, nur lesend oder mit einem Namen, der sofort
      wieder freigegeben wird, und sein Selbsttest deckt das ab.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und `LIVE SELFTEST OK` ausgeben.
      Prüfung: `grep -c "/v1/domains" ops/live.sh` muss mindestens 1 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
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
