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
