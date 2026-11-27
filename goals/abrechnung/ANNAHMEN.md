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

## Goal 03 (10.11.2026, Engineer CP)

- **Ursachen tragen ein Vorzeichen, die Zeile nennt die Zahl der betroffenen Anfragen.** `cause <name>: <n> (requests <r>, timeouts <t>)`:
  `n` zählt die Anfragen oder Zeilen dieser Ursache, `r` und `t` ihren Anteil an der Abweichung caddy minus service. `unmatched` kann in
  beide Richtungen wirken (Anfrage ohne Zeile plus, Zeile ohne Anfrage minus), `clock` ebenso (Timeout nur auf Caddys Uhr plus, nur nach
  `duration_ms` minus). So ergeben die Anteile genau die Abweichung, bei Anfragen wie bei Timeouts; stimmt die Summe nicht, Exit 3 ohne
  Ursache.
- **Zeitraum je Paar, nicht je Seite.** Ein Paar aus Anfrage und eigener Zeile und eine vom Coalescer bediente Wiederholung gehören über
  die Buchungszeit ihrer Zeile in den Zeitraum, alles andere über die eigene Zeit. Sonst trennte eine Grenze eine Anfrage von ihrer Zeile
  (die Zeile landet bis 15 s nach dem Ende im Log), und am Rand entstünde eine Abweichung, die keine Ursache hat. Ohne `TQ_SINCE` beginnt
  der Zeitraum bei der ersten Zeile `ledger` mit `duration_ms`, ohne `TQ_UNTIL` endet er mit der spätesten Anfrage oder Zeile.
- **Zeile ohne `duration_ms` im Zeitraum** zählt `service` nicht; ihre Anfrage zählt `caddy` und landet unter `unmatched`.
- **Keine Herkunft im Vergleich.** `--compare` trennt nicht nach eigener und fremder Adresse, weil die Datenbank-Seite keine Adresse
  ausgibt. Die Herkunft im Zeitraum zeigt `--join` auf eine beschnittene Kopie des Logs (am 10.11.2026: 46 von 46 fremd).
- **Quote nach außen noch keine.** Die Messung `service` darf es später sein, weil sie im Vergleich dasselbe zählt; 0 Timeouts in 46
  Anfragen über 2,5 Stunden belegen keine Besserung gegenüber 3 in 224 an einem Tag. Frühestens nach sieben Tagen ab dem Rollout von
  abrechnung 02, wie `docs/kette.md` es für den Vergleich vorsieht.
- **Summe der Abbrüche neu gemessen:** 79229 mc aus den fünf Abbuchungen (Ledger, `readonly: true`), dieselben fünf Anfragen mit Status 0
  im Caddy-Log; die `ref` liest die Abfrage aus der Gutschrift selbst. `LOOP.md` nennt weiter 0,37 USD; den Satz ändert nur ein Mensch.

## Goal 04 (11.11.2026, Engineer CP)

- **Quelle:** OpenRouter-Doku „Get user activity“ (`https://openrouter.ai/docs/api/api-reference/analytics/get-user-activity`, gelesen
  am 11.11.2026): `GET /api/v1/activity` liefert die letzten 30 abgeschlossenen UTC-Tage, nur mit Management-Key (sonst 403, am
  11.11.2026 mit `OPENROUTER_API_KEY` vom code-host gemessen). Die echte Antwort ist am 11.11.2026 um 09:32 UTC mit
  `OPENROUTER_MANAGEMENT_KEY` gesehen: 19 Zeilen vom 25.10. bis 10.11.2026 unter `data`, mit den Feldern der Doku und zusätzlich
  `byok_requests`, das das Werkzeug wie `byok_usage_inference` nicht liest.
- **Felder der Aktivität laut Doku:** `date` (`YYYY-MM-DD`), `model` (Slug wie `openai/gpt-5.2`), `model_permaslug`, `endpoint_id`,
  `provider_name`, `usage` (USD, OpenRouter-Guthaben), `byok_usage_inference`, `requests`, `prompt_tokens`, `completion_tokens`,
  `reasoning_tokens`, `cached_tokens`. Das Werkzeug liest nur `date`, `model` und `usage`; je Tag und Modell summiert es `usage` über
  alle Endpunkte und rundet erst die Summe mal 100000 auf mc. `byok_usage_inference` zählt nicht, weil wir keinen eigenen Schlüssel beim
  Anbieter hinterlegen. Der Abgleich läuft über `model` (Slug), weil auch Ledger und `inference_aborts` den Slug tragen.
- **Toleranz `AP_TOLERANCE_MC` = 1000 mc (0,01 USD) je Tag und Modell, Betrag der Lücke.** Grund: `purchaseMc` rundet jede Buchung
  auf (`Math.ceil`), also liegt unser Einkauf je Zeile bis zu 1 mc über dem Anbieter, bei einigen hundert Anfragen am Tag einige hundert
  mc; die Rundung der USD-Summe kostet höchstens 1 mc. Eine Anfrage, die vor Mitternacht beginnt und danach gebucht wird, verschiebt
  ihren Einkauf um einen Tag; bei `openai/gpt-5-mini` sind das wenige hundert mc, bei `openai/gpt-5.2` kann eine lange Antwort darüber
  liegen und erscheint dann als `noise`. 1000 mc liegt deutlich unter der kleinsten Lücke, die der Selftest als `noise` verlangt
  (5000 mc). Geprüft mit der ersten echten Messung (11.11.2026, Tag 10.11.2026, kein Abbruch): Lücke 783 mc bei `openai/gpt-5-mini`
  und -160 mc bei `openai/gpt-5.2`, beide innerhalb, der Wert bleibt. Liegt eine Lücke an einem Tag ohne Abbruch später darüber, zeigt
  das Werkzeug `noise` und keine Schätzung.
- **Modelle, die der Dienst nie gekauft hat,** bleiben aus der Tabelle (das Konto kauft auch für anderes ein) und stehen summiert in der
  Zeile `other models at the provider`. Ein Modell, das wir kaufen, an einem Tag mit Zeile beim Anbieter und ohne eigene Zeile, steht in
  der Tabelle und wird `noise`, wenn die Summe die Toleranz übersteigt.
- **Lücke negativ** (wir buchten mehr als der Anbieter): Die Zeile zeigt sie mit Vorzeichen, die Schätzung je Abbruch ist 0, wenn
  Lücke minus Grundlinie nicht über 0 liegt, und ein Tag ohne Abbruch wird `noise`, wenn der Betrag die Toleranz übersteigt.
- **Grundlinie** (Kritik 11.11.2026, Punkt 6): Median der Lücken eines Modells an den Tagen ohne Abbruch ohne Antwort und ohne `noise`,
  bei gerader Zahl der Mittelwert der beiden mittleren, gerundet; ohne solchen Tag 0. Eine negative Grundlinie erhöht die Schätzung, weil
  wir an ruhigen Tagen mehr buchen als der Anbieter und dieser Überhang an einem Tag mit Abbruch sonst den Einkauf des Abbruchs verdeckt.
- **Modell mit `noise`:** `purchase without sale` nennt dann nur den Einkauf der Abbrüche mit später Antwort und keine Schätzung für die
  ohne Antwort, weil die Lücke an diesem Modell nicht nur unsere ist.
- **Filter auf den Schlüssel der Produktion:** Die Doku nennt einen Parameter `api_key_hash`. Er bleibt ungenutzt, weil sein Wert aus der
  Schlüssel-API kommt, die dieses Goal nicht aufrufen darf; die Gegenprobe über die Tage ohne Abbruch ersetzt ihn.
- **Stand der Produktion am 11.11.2026 01:35 UTC** (`ROWS_JS` aus `ops/abort-purchase.sh`, lesend über `ssh` und `docker exec`): 483
  Zeilen, keine Zeile in `inference_aborts`.

## Reparatur Audit 2026-11-13 Zeile 70 (13.11.2026, Engineer CP)
- **Ursache:** Der Management-Key liegt seit dem 12.11.2026 nur noch in `~/.config/control-plane/openrouter-management.env`
  (Entscheidung Tech Lead, abrechnung 05), `ops/abort-purchase.sh` las ihn aber weiter aus der Umgebung oder `loop.env`. Damit endete
  die Prüfung (Netz) von abrechnung 04 Punkt 3 mit Exit 2, und abrechnung 05 startet frühestens am 18.11.2026.
- **Vorgezogen:** Die Reparatur baut den Kritik-Punkt „liest den Management-Key nur aus `openrouter-management.env`“ aus
  `goals/abrechnung/05-quote-nach-aussen-nach-sieben-tagen.md` nach dessen Text, mit `test/abort-purchase-key-file.test.ts`. Rot vorher
  mit dem Skript von `origin/dev` 57acba8: 4 failed von 6 (Key nur in `loop.env`, nur in der Umgebung, Datei mit 0600, Pfad aus
  `AP_MANAGEMENT_KEY_FILE`). Der Maker von abrechnung 05 findet den Punkt gebaut vor und belegt ihn mit seinen Prüfbefehlen.
- **Format der Datei:** genau eine Zeile `OPENROUTER_MANAGEMENT_KEY=<Wert>`, Anführungszeichen um den Wert werden entfernt; die Datei
  wird nicht gesourct, der Wert nicht exportiert und nur auf stdin an `curl` gegeben.

## Goal 05
- **Grenzregel der Gegenrechnung (Engineer CP, 18.11.2026):** `--compare` legt ein Paar und eine bediente Wiederholung nach der Zeit
  ihrer Zeile in den Zeitraum, seit abrechnung 05 auch eine Anfrage mit eigener Zeile ohne `duration_ms` (bisher nach ihrem Ende; so
  trennt keine Grenze eine Anfrage von ihrer Zeile). Der Join (`--join` und die Gegenrechnung `check caddy`) legt eine Anfrage nach der
  Zeit der Zeile, der er sie zuordnet (eigene Zeile, sonst die erste Zeile, die während der Anfrage geschrieben wurde), ohne Zeile nach
  ihrem Ende; `--rows` und `check service` legen eine Zeile nach der Zeit, zu der sie geschrieben wurde. Damit fällt ein Paar, dessen
  Anfrage vor `TQ_UNTIL` endet und dessen Zeile danach geschrieben wird, in allen drei Zählungen aus dem Zeitraum (Selftest
  `compare check boundary`, mit einem Join nach dem Ende der Anfrage rot: `check caddy: compare 1 0, join 2 0`).
- **Warum keine Selbstsumme:** Die Grenze ist für alle drei die Zeit der Buchung, aber gezählt wird in getrennten Durchläufen auf frisch
  gelesenen Eingaben: der Join mit seiner eigenen Zuordnung und ohne die Klassen `pair`, `coalesced`, `caddy-only`, `service-only`,
  `--rows` ganz ohne Caddy-Log. Eine falsch einsortierte Anfrage im Vergleich ändert deshalb `compare`, aber nicht `join` oder `rows`
  (Test mit verfälschter Klassifikation in `test/timeout-quote-compare.test.ts`). Geteilt sind nur das Lesen der Zeilen und der erste
  Abgleich Anfrage zu eigener Zeile (Generation-Start binnen 2 s); einen Fehler dort sieht die Gegenrechnung nicht.
- **Rest, der Exit 3 auslösen kann:** Eine bediente Wiederholung legt `compare` nach der Zeile ihres Leaders, der Join nach der ersten
  Zeile während ihrer Laufzeit; eine Anfrage ohne Zeile legt `compare` nach ihrem Ende, der Join nach einer Zeile, die bis 1 s danach
  geschrieben wurde. Fallen diese Zeiten auf verschiedene Seiten von `TQ_SINCE` oder `TQ_UNTIL`, endet der Lauf mit Exit 3. Das bleibt
  so, weil eine Angleichung die Klassen des Vergleichs in den Join tragen würde; über die sieben Tage trat es nicht auf.
- **`--rows` mit `TQ_UNTIL`:** `--rows` und `--since-rollout` vergleichen den Zeitraum jetzt als Zeit statt als Text. Bisher lag eine
  Zeile `2026-11-10T20:27:18.123Z` als Text vor `TQ_SINCE=2026-11-10T20:27:18Z` und fiel heraus; `TQ_UNTIL` las `--rows` gar nicht.
  Die Kopfzeile beginnt weiter mit `since`, weil `ops/live.sh` sie so liest.
- **Skalierung:** Zeilen nach Zeit sortiert, jede Anfrage liest nur die Zeilen in ihrem Fenster (Beginn minus 1 s bis Ende plus 15 s,
  per Binärsuche). Bei gleich guten Zeilen gewinnt wie bisher die frühere in der Eingabe (`idx`), darum bleibt die Zuordnung dieselbe.
  `--selftest-scale` mit 200000 Anfragen braucht rund 4 s; der Abgleich von abrechnung 04 lief auf denselben Dateien 3 min 52 s und
  endete mit `RangeError: Maximum call stack size exceeded` (Spread in `Math.max`).
- **Einkauf je Abbruch:** Der Prüfzeitraum 10. bis 17.11.2026 enthält den 10.11., an dem der Anbieter `openai/gpt-5.2` heute 3913 mc
  höher meldet als am 11.11.2026 gemessen; der Tag wird `noise`, und das Werkzeug schätzt für das Modell nichts. Die Zeile nennt darum
  keine Zahl und daneben die Messung ohne den 10.11. Die Toleranz bleibt 1000 mc, weil eine nachträgliche Korrektur des Anbieters
  genau der Fall ist, den `noise` anzeigen soll.

## Goal 07 (21.11.2026, Engineer CP)

- **Ende der Anfrage ist `ts`, nicht `ts` plus `duration`:** Der Kontext des Goals nennt das Ende `ts` plus `duration`. Caddy schreibt
  die Zeile des Zugriffslogs aber erst, wenn die Antwort fertig ist; `ts` ist also das Ende und `ts` minus `duration` der Beginn. So
  liest es schon `ops/timeout-quote.sh` (`end: j.ts, start: j.ts - j.duration`), und darauf beruht der Abgleich, der in abrechnung 05
  alle 1220 Anfragen ihrer Ledger-Zeile zuordnete und zwei Zeilen „je 1 ms neben der Anfrage geschrieben“ fand. Mit `ts` plus
  `duration` läge das Ende einer Anfrage von 50 s um 50 s zu spät. `ops/answer-quote.sh` ordnet deshalb nach `ts` ein, wie der
  Done-Punkt verlangt („nach dem Ende der Anfrage“). Über die sieben Tage ändert das keine Zahl: Die 1393 Antworten mit 503 lagen
  alle im Ausfall, weit weg von beiden Rändern.
- **Erste lesbare Zeile:** Für „Log beginnt nach `TQ_SINCE`“ zählt die früheste `ts` aller lesbaren JSON-Zeilen, gleich welcher Pfad,
  weil auch eine Zeile auf einem anderen Pfad zeigt, dass das Log so weit zurückreicht.

## Abgelöst durch fehler 14 (Tech Lead, 2026-11-27)

- Abgelöst: abrechnung 03 Punkt 3, Prüfung `grep -c "$(sed -n 's/^REFUND_MC=//p' ops/live.sh)" docs/abrechnung/abbrueche-2026-11-10.md` (Zeile 72) durch `f=docs/abrechnung/abbrueche-2026-11-10.md; grep -c "$(sed -n 's/^REFUND_MC=//p' ops/live.sh)" $f; grep -c 'REFUND_MC' $f`, Ausgabe dann genau `0` und `1` (Tech Lead, 2026-11-27, fehler 14, PRO-31732). Grund: Die Summe der fünf Abbrüche gehört einem einzelnen fremden Automaton (Ledger `"a":1` in Zeile 12) und ist ein Betrag je Kunde (Grundregel 8); `docs/kette.md` Zeile 17 und `ROADMAP.md` maskieren denselben Fall schon. Die Datei nennt weiter, dass `ops/live.sh` die Summe als `REFUND_MC` erwartet; die Gleichheit prüfen abrechnung 01 Zeile 88 und `test/credit-aborted.test.ts` im Code. Maskiert werden in der Datei die Summe in mc und USD, den Betrag des ersten Belegs und die Spalte „Betrag“ der fünf Tabellenzeilen, weil die Zeilen zusammen die Summe ergeben; die fünf Zeilen selbst bleiben (Zeile 73).
