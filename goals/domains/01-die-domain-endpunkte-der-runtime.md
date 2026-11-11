# Domains Goal 01: Die Domain-Endpunkte der Runtime

## Status
ACTIVE

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
- [x] Jeder Domain-Endpunkt aus `docs/sandbox/vertrag.md` hat eine Route; keiner antwortet mehr mit 404 der Rückfallroute.
      Prüfung: `pnpm -s vitest run test/domains.test.ts` muss Exit-Code 0 haben.
      Prüfung: `test "$(awk '/^## Endpunkte/{f=1;next} /^## /{f=0} f && /^[|] (GET|POST|PUT|PATCH|DELETE) /' docs/sandbox/vertrag.md | grep -c '/v1/domains')" -le "$(grep -cE "^\s*(it|test)\(" test/domains.test.ts)" && echo genug` muss `genug` ausgeben.
- [x] Die Antworten haben die Felder, die die Runtime laut Vertrag liest; ein Test je Endpunkt prüft Status und Felder gegen die Zeile des
      Vertrags, und ein Endpunkt, der einen Kauf bräuchte, antwortet mit dem Status, den die Runtime als nicht verfügbar liest.
      Prüfung: `grep -c "vertrag.md" test/domains.test.ts` muss mindestens 1 ausgeben.
- [x] Der Harness zeigt, dass die unveränderte Runtime die Domain-Endpunkte ohne Fehler aufruft (Job `e2e` am Kopf des PR grün, mit einer
      Zeile im Log des Harness, die einen Aufruf von `/v1/domains` zeigt).
      Prüfung: `grep -rc "/v1/domains" harness/e2e | awk -F: '{s += $2} END {print (s > 0) ? "da" : "fehlt"}'` muss `da` ausgeben.
- [x] `ops/live.sh` prüft nach dem Rollout einen Domain-Endpunkt mit einer eigenen Adresse, nur lesend oder mit einem Namen, der sofort
      wieder freigegeben wird, und sein Selbsttest deckt das ab.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und `LIVE SELFTEST OK` ausgeben.
      Prüfung: `grep -c "/v1/domains" ops/live.sh` muss mindestens 1 ausgeben.
- [x] `check` ist grün.
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
- 2026-11-11 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: Routen für die fünf Domain-Zeilen des Vertrags (Suche 200 mit nicht kaufbaren Namen, Registrieren 501, DNS 403 `domain_not_held`, keine Buchung), Harness-Schritt über den Client der unveränderten Runtime, Domain-Prüfung in `ops/live.sh`. Neue Tests vorher rot: `test/domains.test.ts` 9 von 10 rot vor `src/domains.ts`, der 401-Test rot ohne die Schlüsselprüfung der Wildcard, die neuen Zeilen in `test/live-selftest.test.ts` fehlen im alten `ops/live.sh` (0 Treffer `planted domains`). Prüfbefehle: `pnpm -s vitest run test/domains.test.ts` Exit 0; Zählprobe `genug` (5 Zeilen, 10 Tests); `grep -c "vertrag.md"` 11; `grep -rc "/v1/domains" harness/e2e` `da`, Job `e2e` an c369e08 grün mit `DOMAINS_RESULT {"search":"ok","register":"501","list":"403","add":"403","del":"403"}` und `E2E OK ... domains=true`; `bash ops/live.sh --selftest` Exit 0, `LIVE SELFTEST OK`; `grep -c "/v1/domains" ops/live.sh` 3; `node scripts/check.mjs` Exit 0 (1297 Tests).
- 2026-11-11 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5; `origin/dev` (493fc55) war schon im Branch, nichts zu mergen, alle Prüfbefehle am Kopf `bfb0d39` neu gefahren. Prüfbefehle (Node 22.23.4): P1 `vitest run test/domains.test.ts` 10 passed Exit 0, Zählprobe `genug`; P2 `grep -c "vertrag.md"` 11; P3 `grep -rc "/v1/domains" harness/e2e` `da`, Job `e2e` an `bfb0d39` pass (Run 43042591314) mit den Zeilen `DOMAIN GET /v1/domains/search -> ok`, `POST /v1/domains/register -> 501`, DNS lesen, setzen und löschen `-> 403`; P4 `bash ops/live.sh --selftest` Exit 0, `LIVE SELFTEST OK`, `grep -c "/v1/domains" ops/live.sh` 3; P5 `node scripts/check.mjs` Exit 0 (1297 Tests).

## Blockers
