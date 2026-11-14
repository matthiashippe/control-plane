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

## Goal 02 (13.11.2026, Engineer CP)

- **Der Test ruft den Richter über `ops/live.sh --judge domains-search <status>`.** Der Schalter liest den Body von stdin und ruft
  dieselbe Funktion `judge_domains_search`, die Live-Lauf und Selbsttest rufen; er braucht kein Netz und keinen Port, weil der Test
  die Antwort mit `app.request` holt. Den Pfad nimmt der Test aus der Zeile `DOMAINS_PATH=` von `ops/live.sh`, damit Test und
  Live-Lauf dieselbe Anfrage stellen.
- **Die fünf Merkmale prüft ein kleines Node-Skript, nicht `grep`.** `names` ist ein Array und `message` darf Satzzeichen und
  Anführungszeichen tragen; ein Treffer per Muster im rohen Text hätte auch ein `livecheck.com` in `message` als Name gezählt. Node
  liegt auf dem code-host wie für `json_field` der Prüfung `sandbox`. Status prüft Bash vorher, damit 404, 401, ein 200 und keine
  Antwort ihren eigenen Text bekommen.
- **Der Fall `nokey` läuft im Selbsttest durch den Live-Pfad.** `domains_search_live` mit einer fehlenden `LIVE_SANDBOX_ENV` gibt
  `nokey` aus, ohne `curl` zu rufen (der Selbsttest sperrt `curl`), und dieser Wert geht in den Richter. Drei weitere Fälle
  `mark-names`, `mark-message` und `mark-taken` nehmen der richtigen Antwort je ein Merkmal und werden FAIL.

## Goal 03 (13.11.2026, Engineer CP)

- **Die Wartezeit steht als Zeile `CLIENT_KEY_WAIT_S=75` in `ops/live.sh`.** Der vitest-Test liest sie mit `^CLIENT_KEY_WAIT_S=([0-9]+)$`
  wie `DOMAINS_PATH=` und `RECHECK_MS` mit `const RECHECK_MS = ([0-9_]+);` aus `src/sandbox/service.ts`. 75 statt 61, weil ein
  Aufruf an `sandboxd`, der kurz vor dem Schlüsselwechsel startet, erst nach dem Wechsel scheitern und `lastFailure` setzen kann.
  Der Richter `judge_sandbox_wait` liest `RECHECK_MS` im Selbsttest ebenfalls aus `src/sandbox/service.ts` (Funktion `recheck_s`),
  damit seine Grenze nicht als zweite Zahl im Skript veraltet.
- **Warten und Setup sind im Selbsttest ersetzbar, ohne Schalter von außen.** `live_wait` (sonst `sleep`) ersetzt der Selbsttest
  durch eine Funktion, die die Sekunden in eine Datei schreibt; `CLIENT_KEY_SETUP` (sonst `ops/sandbox/setup.sh`) zeigt auf eine
  Attrappe, die nur `SETUP CLIENT-KEY OK changed=0` oder `changed=1` ausgibt. Beides setzt nur der Selbsttest in seiner eigenen
  Shell; keine Umgebungsvariable lenkt den Live-Lauf um. Für Kindprozesse (`ops/timeout-quote.sh`) liegen `curl` und `ssh` als
  Attrappen vorn im `PATH` und enden mit Exit 99.
- **`live()` legt mit `mktemp -d` einen Ordner an, setzt `TMPDIR` darauf und löscht ihn per `trap` auf EXIT, INT und TERM.** Damit
  landen auch die Dateien von `handoff_live`, `ops/timeout-quote.sh` und `setup.sh` dort. Der `trap` ruft `live_cleanup`, das nur
  diesen Ordner löscht und nichts ausgibt; der `trap … RETURN` des Selbsttests bleibt unberührt.
- **Der Abbruch im Selbsttest geht an die Prozessgruppe.** Der Lauf von `live()` startet mit `set -m` als eigene Prozessgruppe, und
  `kill -TERM -- -<pid>` trifft wie Strg-C oder ein Supervisor jeden Prozess der Gruppe: Die Befehlssubstitution mit der
  `curl`-Attrappe endet sofort, danach führt die Haupt-Shell den `trap` aus. Gemessen endet der Lauf in unter einer Sekunde; nach
  15 s ohne Ende gilt der Fall als FAIL und die Gruppe bekommt `kill -KILL`. Ohne `trap` bleiben 3 (Suche) und 4 (Sandbox) Dateien
  liegen. Der Fall gilt nur, wenn die Datei mit dem erfundenen Schlüssel während des gehaltenen Aufrufs in `TMPDIR` lag.
- **Der Ordner nennt seinen Prozess im Namen (Zyklus 3, Kritik Punkt 6).** `live()` legt ihn als
  `${TMPDIR:-/tmp}/live-run.<PID>.XXXXXX` an, mit `$BASHPID` statt `$$`, weil `$$` in einer Subshell die PID der äußeren Shell
  bleibt und der Selbsttest `live()` in einer Subshell fährt. Vor dem Anlegen löscht `live_sweep` jeden Ordner `live-run.*.*` in
  `TMPDIR`, der dem eigenen Nutzer gehört (`-O`, kein Symlink) und dessen PID weder `kill -0` noch `ps -p` kennt, und sonst nichts.
  Eine wiederverwendete PID lässt einen Ordner nur bis zum nächsten Lauf liegen, löscht aber nie einen lebenden. Der Selbsttest
  beendet den ersten Lauf mit `kill -KILL` an die Prozessgruppe, während `POST /v1/sandboxes` gehalten wird, legt dann eine fremde
  Datei und einen Ordner `live-run.<PID der Selbsttest-Subshell>.living` dazu und fährt einen zweiten Lauf, den er mit `kill -TERM`
  beendet. Gegenproben: ohne `live_sweep` ist `kill-sweep` FAIL (1 Ordner bleibt), ohne Präfix FAIL (kein Ordner, also kein Beweis);
  ein `live_sweep` ohne Prüfung der PID und ein Löschen von ganz `TMPDIR` machen `foreign` FAIL.

## domains 04

- **Die Zeile `WAIT sandbox:` geht auf stderr.** `live()` reicht die Standardausgabe von `sandbox_live` an `judge_sandbox` und
  zeigt sie erst nach dem Lauf; auf stderr steht die Zeile sofort auf dem Bildschirm und ändert das Urteil nicht. `sandbox_live`
  ruft nach `changed=1` die Funktion `client_key_wait`, die erst `wait_line` und dann `live_wait` ruft.
- **Die Reihenfolge hält eine Ereignisdatei fest.** `sandbox_line_run` fährt den echten `sandbox_live` mit der Attrappe für
  `setup.sh`; dessen stderr, das gezählte `live_wait` (`wait:<s>`) und die `curl`-Attrappe bei `POST /v1/sandboxes` (`create`)
  hängen in dieselbe Datei an, in der Reihenfolge, in der sie geschehen. `judge_sandbox_wait_line` verlangt nach `changed=1` genau
  eine Zeile mit `CLIENT_KEY_WAIT_S`, vor dem ersten `wait` und vor `create`, nach `changed=0` keine. Gepflanzt werden `silent`
  (ein `client_key_wait` nur mit `live_wait`, der Stand vor domains 04) und `late` (Zeile nach dem Warten). Gegenproben am echten
  Code: `sandbox_live` wieder mit `live_wait` macht `new-key` FAIL, eine doppelte Zeile, eine falsche Zahl, die Zeile auf stdout
  und eine Zeile auch nach `changed=0` machen `new-key` oder `old-key` FAIL.
- **Das Goal löst den Schlüsselwechsel selbst aus.** `--client-key` schreibt nur, wenn `cp.pub` auf dem Sandbox-Server vom
  Schlüssel in `/data` von `deploy-cp-1` abweicht; das passiert nur mit einem neuen Volume oder einem verlorenen `cp.pub`, und ein
  früherer Lauf mit `changed=1` hat keine Zeitstempel. Ohne Auslöser bliebe das Warten aus domains 03 nur gegen Attrappen belegt.
  `--client-key-reset` verschiebt `cp.pub` nach `cp.pub.prev` (nicht `.pub`, sonst nähme `sandboxd` ihn weiter an), der
  Prüfschlüssel bleibt. Fenster am 14.11.2026: Reset 01:35:20 UTC, Schlüssel zurück 01:36:48, letzter 401 um 01:35:58, also lehnte
  der Dienst neue Sandboxes von 01:35:20 bis 01:36:58 (rund 100 s) ab. Fremde Sandboxes liefen keine.
- **Zwei Läufe statt einem (Abweichung vom Kontext „genau einmal“).** Der erste Lauf um 01:28 wartete richtig, scheiterte aber an
  einem fehlenden Basis-Image auf dem Sandbox-Server (Cron des Mitbewohners, `docs/sandbox/schluesselwechsel.md`); sein Fenster
  ging von 01:28:26 bis 01:29:47. Das Image hat der Maker mit `bash ops/sandbox/setup.sh 72.62.51.224` neu gebaut, dem Weg aus
  `docs/sandbox/server.md`, danach lief die Messung einmal. Ein Fehlschlag ohne Bezug zum Warten belegt domains 03 weder noch
  widerlegt er es; `BLOCKED fachlich` hätte das Produkt für alle Kunden bis zum nächsten Goal ohne Image gelassen.
