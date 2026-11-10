# Annahmen abrechnung

## Goal 01 (10.11.2026, Engineer CP)

- **Fünf Fälle, Summe 79229 mc (0,79 USD), nicht drei über 0,37 USD.** Gemessen lesend in der Produktion: Das Caddy-Zugriffslog (alle
  Dateien `access.log*`) zeigt am 10.11.2026 fünf Anfragen an `/v1/chat/completions` mit Status 0, alle vom selben Client: Ende 05:16:27
  (22,8 s), 05:18:17 (18,5 s), 05:25:58, 05:36:46 und 05:37:53 UTC (je 59,9 s). Befehl
  `ssh … 'docker exec deploy-caddy-1 sh -c "cat /var/log/caddy/access.log*"'`, gefiltert auf Datum, URI und `status == 0`; Gegenprobe mit
  einer gepflanzten Zeile Status 0 (Treffer) und einer mit Status 200 (kein Treffer). Die passenden Zeilen `kind = 'inference'` (Generation-ID
  beginnt mit der Startzeit der Anfrage, gebucht rund 1 bis 8 s nach dem Abbruch) liefert
  `docker exec -i deploy-cp-1 node - <refs> < q.js` mit `require("better-sqlite3")("/data/cp.db", { readonly: true })` als
  `{"n":5,"a":1,"s":-79229}`: fünf Zeilen, eine Adresse, Summe 79229 mc; Gegenprobe mit einer erfundenen `ref`: `n` 0. Die erste Fassung
  nahm nur die drei nach 59,9 s (61644 mc); die Kritik vom 10.11.2026 fand die zwei kürzeren. Die 0,37 USD aus Goal und `LOOP.md` lassen
  sich gegen die Produktion nicht bestätigen. Gutgeschrieben wird, was abgebucht wurde.
- **Die Gutschrift bucht nur, wenn genau diese fünf Zeilen auf einer Adresse mit genau dieser Summe stehen.** Sonst nichts und eine
  Log-Zeile. Die Adresse steht nirgends im Repo, sie kommt aus den Abbuchungen selbst.
- **Wann ein Abbruch zählt:** geprüft wird das Abbruch-Signal des Clients direkt vor der Buchung. Schließt der Client die Verbindung
  in den Millisekunden zwischen Buchung und Schreiben der Antwort, bleibt die Anfrage berechnet. Ein Fenster von 60 s schrumpft damit
  auf die Zeit eines `INSERT`.
- **Status 499** (`client_closed_request`) für eine abgebrochene Anfrage; den Body liest niemand, Caddy loggt ohnehin Status 0.
- **Einkaufspreis 0**, wenn der Anbieter wegen des Abbruchs gar nicht antwortet: Ohne Antwort kennen wir keinen Preis. OpenRouter kann
  solche Anfragen trotzdem berechnen; das misst abrechnung 02 mit der Spalte `answered`.
- **Neue `kind = 'refund'` bricht die Runtime nicht:** Die Runtime am Pin `d8f8168` ruft weder `/v1/credits/history` noch
  `/v1/status` auf (`grep -rn "credits/history\|v1/status" src` im Klon am Pin: kein Treffer).
- **Node 22:** `node_modules` im Worktree ist für Node 22 gebaut (`LOOP.md`, Technik). Auf dem code-host steht Node 24 vorn im
  `PATH`, damit lädt `better-sqlite3` nicht. Die Prüfbefehle liefen mit `PATH=/usr/bin:$PATH` (Node 22.23.4). `ops/live.sh --selftest`
  läuft mit beiden, weil es auf `node:sqlite` ausweicht.

## Goal 02 (10.11.2026, Engineer CP)

- **Routing `{ sort: "throughput", allow_fallbacks: true }`** auf jedem Aufruf an OpenRouter (`PROVIDER_ROUTING` in
  `src/inference/openrouter.ts`). Quelle: OpenRouter-Doku „Provider Selection“
  (`https://openrouter.ai/docs/guides/routing/provider-selection`, gelesen am 10.11.2026): `sort` nimmt `price`, `throughput` oder
  `latency` und schaltet das Standard-Routing ab; Durchsatz ist dort „end-to-end output tokens per second“, `allow_fallbacks` (Vorgabe
  `true`) erlaubt Ausweichen, wenn ein Anbieter ausfällt. Durchsatz statt Latenz, weil die Runtime nicht streamt: Eine Antwort ist da, wenn
  ihr letztes Token da ist, die Zeit bis zum ersten Token entscheidet den Timeout nicht. Nicht `:nitro`, weil es Endpunkte der
  Prioritätsstufe zulässt und den Einkauf teurer macht, ohne dass wir das messen können. Nicht `preferred_max_latency`, weil es nur eine
  Vorliebe ist und eine Zahl bräuchte, die wir nicht gemessen haben.
- **Kein Anbieter wird ausgeschlossen oder fest gesetzt** (`order`, `only`): Die Modelle sind `openai/gpt-5.2` und `openai/gpt-5-mini`,
  die Auswahl der Anbieter dahinter bleibt bei OpenRouter. Damit kann auch kein Claude- oder Anthropic-Modell als Ausweichziel
  hineinkommen, denn Ausweichen geht nur zwischen Anbietern desselben Modells.
- **`zdr` bleibt** neben dem Routing (`{ sort, allow_fallbacks, zdr: true }`), wenn die Auslieferung es verlangt. Ein `provider` im Body
  des Kunden geht nie durch: Der Body an OpenRouter wird Feld für Feld gebaut, und `provider` setzt nur der Dienst.
- **Preis:** Mit `sort` entscheidet nicht mehr der Preis über den Anbieter. Abgerechnet wird weiter `usage.cost` mal 1,3 (`costMc`), also
  der Einkauf des Anbieters, der geantwortet hat; der Test prüft das mit zwei Anbietern verschiedener Preise.
- **Preisdeckel `max_price` (Kritik, Punkt 7):** Das Routing trägt `max_price: { prompt, completion }` in USD je Million Token aus dem
  aktuellen Katalogpreis des Modells (`maxPriceFor` in `src/inference/openrouter.ts`, dieselben Zahlen wie `inputPerMillion` und
  `outputPerMillion` hinter `/v1/models`, nach jedem stündlichen Preisabruf neu). Quelle: OpenRouter-Doku „Provider Selection“
  (`https://openrouter.ai/docs/guides/routing/provider-selection`, gelesen am 10.11.2026): `max_price` ist ein Objekt mit `prompt`,
  `completion`, `request` und `image`, Beispiel `{"prompt": 1, "completion": 2}` für höchstens 1 USD und 2 USD je Million Token, oft
  zusammen mit `sort`; passt kein Anbieter, läuft die Anfrage nicht. `request` und `image` setzen wir nicht, weil der Katalog sie nicht
  kennt. Gerundet auf 12 signifikante Stellen, weil der Katalog OpenRouters Preis je Token mal eine Million rechnet und etwa jeder vierte
  Preis dabei knapp unter dem echten landet (`"0.0000002"` wird 0,19999999999999998); ein Deckel knapp unter dem Preis schlösse jeden
  Anbieter aus. Ohne Preis im Katalog (0 oder unbekannt) kein Deckel, denn 0 schlösse jeden bezahlten Anbieter aus. Ein `max_price` des
  Kunden, oben im Body oder in seinem `provider`, kommt nicht durch, weil der Body an OpenRouter Feld für Feld gebaut wird. Folge: Ist
  zeitweise nur ein teurerer Endpunkt erreichbar, antwortet OpenRouter mit einem Fehler statt teurer einzukaufen; das ist gewollt, denn
  die Reservierung beruht auf dem Listenpreis.
- **Dauer** ist die Zeit vom Aufruf beim Anbieter bis zu seiner Antwort (Buchung, `meta.duration_ms`) oder bis zum Aufgeben (Abbruch,
  `inference_aborts.duration_ms`, unverändert aus Goal 01). **Anbieter** ist OpenRouters Feld `provider` der Antwort (`meta.upstream`,
  neue Spalte `inference_aborts.upstream`, `null` ohne Antwort). Der Spaltentest aus Goal 01 kennt die neue Spalte; sie trägt einen
  Anbieternamen wie „Azure“, nie Adresse, Prompt oder Antwort.
- **Timeout ab 59,5 s im Caddy-Log, nicht über 60,0 s.** Gemessen: Die drei Timeouts vom 10.11.2026 enden im Log bei 59,91 und 59,92 s,
  weil die 60 s der Runtime vor dem Eintreffen bei Caddy beginnen. Über 60,0 s lief im ganzen Log keine Anfrage
  (`TQ_LIMIT_S=60 bash ops/timeout-quote.sh`: 0); eine strenge Grenze wäre blind. Die Grenze ist `TQ_LIMIT_S` und steht in jeder Ausgabe.
- **Modell zur Anfrage:** Das Caddy-Log hat kein Modell, das Ledger vor diesem Goal keine Dauer. Verbunden wird über die Generation-ID
  (`gen-<Startsekunde>-…`, gemessen 0,8 s vor bis 0,4 s nach dem Start bei Caddy) und die Buchungszeit. Zwei Anfragen vom 10.11.2026
  fanden keine eigene Zeile: Wiederholungen nach einem Abbruch, die der Coalescer mit der laufenden Antwort bediente; sie bekommen das
  Modell der Zeile, die während ihrer Laufzeit gebucht wurde. Bei der Messung blieb keine Anfrage ohne Modell.
- **Quote nachher** aus der Datenbank allein: ab der ersten Buchung mit `duration_ms` (dem Rollout dieses Goals), `TQ_SINCE` setzt den
  Beginn von Hand. `ops/live.sh` zeigt sie und meldet `FAIL` nur, wenn sie nicht lesbar ist, nicht bei einer hohen Quote: Eine Schwelle
  ohne Messung nachher würde Reverts auslösen, die nichts belegen.
