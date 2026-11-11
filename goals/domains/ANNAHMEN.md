# Annahmen domains

## Goal 01 (11.11.2026, Engineer CP)

- **Suche meldet jeden Namen als nicht kaufbar, ohne Registrar.** `GET /v1/domains/search` antwortet 200 mit `results[]`, je Name
  `available: false`, `purchasable: false`, `currency: "USD"`, ohne Preis. Die Runtime kennt nur verfügbar oder nicht
  (`available ?? purchasable ?? false`, `src/conway/client.ts:465` am Pin) und zeigt den Namen als „taken“. Das stimmt für diesen
  Dienst, weil hier kein Name gekauft werden kann; eine Abfrage bei einem Registrar fände einen Namen, den wir dann doch nicht
  verkaufen. Ohne `tlds` sucht der Dienst `com`, `io` und `ai` (Beispiel im Vertrag), höchstens zehn TLDs je Anfrage.
- **Registrieren ist ein Kauf und antwortet 501.** Ein Domain-Kauf ist das Human Gate `server_kauf`. 501 statt 402, weil ein 402
  sagt, dass Geld hilft, und hier hilft keins; 501 wiederholt die Runtime nicht und zählt es nicht für ihren Circuit Breaker
  (`src/conway/http-client.ts`, `retryableStatuses` 429, 500, 502, 503, 504). Gleiches Muster wie Sandboxes und Transfers.
- **DNS antwortet 403 `domain_not_held`.** Kein Konto hält hier eine Domain, solange keine registriert werden kann. 404 wäre der
  Sache nach auch richtig, die Runtime wiederholt ihn aber dreimal und er sähe im Log aus wie die Rückfallroute, die dieses Goal
  beseitigt. Ein leeres `records[]` hätte behauptet, wir verwalteten die Zone.
- **Namen `sbx-<id>-<port>.postyourprice.com` brauchen keinen eigenen DNS-Eintrag.** Der Eintrag `*.postyourprice.com`
  (`docs/sandbox/plan.md`, Netz) deckt sie, `public_url` kommt mit `ports/expose` aus sandbox 03. Darum baut dieses Goal keine
  DNS-Verwaltung für sie und braucht keinen Zonen-Token auf dem Zahlungsserver.
- **Die DNS-Pfade prüfen den Schlüssel selbst.** Die Auth-Middleware vergleicht exakte Pfade, und ein Pfad mit `:param` unter `/v1`
  ist verboten (`test/v1-ohne-variables-segment.test.ts`). Darum liegen die drei DNS-Pfade hinter der Wildcard `/v1/domains/*`,
  deren Handler `resolveApiKey` selbst ruft; `test/domains.test.ts` hält den 401 für alle fünf Endpunkte, die Gegenprobe ohne
  diese Zeile wurde rot.
- **`ops/live.sh` prüft ohne Schlüssel.** Ein eigener Schlüssel entstünde nur durch Provisionierung, also durch einen Schreibvorgang
  in der Produktion. Die Prüfung ruft `GET /v1/domains/search` vom code-host (eigene Adresse) ohne Schlüssel und erwartet den 401
  der Auth vor der Route; vor dem Rollout kam der 404 der Rückfallroute. Felder und Status mit Schlüssel belegen Unit-Test und
  Harness.
- **Harness ruft den Client der Runtime direkt.** Der Mock-Provider ruft kein Werkzeug `search_domains`, also käme die Runtime im
  Lauf nie an die Domain-Pfade. `harness/e2e/full.sh` ruft darum nach den fünf Turns `createConwayClient` aus
  `dist/conway/client.js` der unveränderten Runtime mit dem provisionierten Schlüssel und verlangt search ok, register 501 und
  dreimal 403. Gegenprobe am 11.11.2026 ohne Docker: derselbe Skripttext gegen `src/conway/client.ts` am Pin, `fetch` auf
  `app.request` umgebogen, gab `DOMAINS_RESULT {"search":"ok","register":"501","list":"403","add":"403","del":"403"}`, mit falschem
  Schlüssel fünfmal `401`.
