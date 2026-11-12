# Annahmen domains

## Goal 01 (11.11.2026, Engineer CP)

- **Suche antwortet 501 statt einer Liste (Zyklus 3, Kritik Punkt 6).** Zyklus 1 gab 200 mit `available: false` je Name. Das
  Werkzeug `search_domains` der Runtime macht daraus `<name>: taken` (`src/agent/tools.ts` am Pin), also eine falsche Tatsache:
  Ein freier Name hieße vergeben. Eine 200 kann „hier nicht im Angebot“ nicht ausdrücken, weil die Runtime nur `available` liest.
  `available: true` wäre ebenso falsch, eine leere Liste ergibt nur „No results found.“. Darum 501 `not_implemented` mit
  `reason: "domain search is not offered"`, `names` und einer Nachricht, dass hier keine Domain registriert werden kann und die
  Verfügbarkeit nicht geprüft wurde; `request()` reicht den Body als Fehlertext an das Werkzeug weiter. 501 wiederholt die Runtime
  nicht und zählt es nicht für ihren Circuit Breaker, wie bei register. Eine kaputte Anfrage bleibt 400. Ohne `tlds` nennt `names`
  `com`, `io` und `ai` (Beispiel im Vertrag), höchstens zehn TLDs je Anfrage. Ein Registrar-Lookup kommt erst mit einem echten
  Angebot, und das ist ein Kauf (`server_kauf`).
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
  `dist/conway/client.js` der unveränderten Runtime mit dem provisionierten Schlüssel und verlangt (bis Zyklus 2) search ok, register 501 und
  dreimal 403. Gegenprobe am 11.11.2026 ohne Docker: derselbe Skripttext gegen `src/conway/client.ts` am Pin, `fetch` auf
  `app.request` umgebogen, gab `DOMAINS_RESULT {"search":"ok","register":"501","list":"403","add":"403","del":"403"}`, mit falschem
  Schlüssel fünfmal `401`.
- **Harness ruft seit Zyklus 3 auch das Werkzeug `search_domains` selbst.** Nach den fünf Client-Aufrufen (jetzt search 501,
  register 501, dreimal 403) ruft `harness/e2e/full.sh` `executeTool("search_domains", …)` aus `dist/agent/tools.js` der
  unveränderten Runtime mit dem Client als Kontext und verlangt einen Text ohne `taken` mit „No domain can be registered here“.
  Fehlt die Zeile `DOMAIN_TOOL`, weil der Import scheitert, ist der Lauf rot.
