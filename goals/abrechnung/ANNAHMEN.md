# Annahmen abrechnung

## Goal 01 (10.11.2026, Engineer CP)

- **Summe der drei Fälle ist 61644 mc (0,62 USD), nicht 0,37 USD.** Gemessen lesend in der Produktion: Das Caddy-Zugriffslog zeigt am
  10.11.2026 genau drei Anfragen an `/v1/chat/completions` mit Status 0 nach 59,9 s (Ende 05:25:58, 05:36:46 und 05:37:53 UTC), Befehl
  `ssh … 'docker exec deploy-caddy-1 grep "/v1/chat/completions" /var/log/caddy/access.log'`, ausgewertet auf `duration >= 30`. Die
  passenden Zeilen `kind = 'inference'` (Generation-ID beginnt mit der Startzeit der Anfrage, gebucht 0,3 bis 7 s nach dem Abbruch)
  liefert `docker exec deploy-cp-1 node -e '… require("better-sqlite3")("/data/cp.db", { readonly: true }) … WHERE kind = ? AND ref IN (?,?,?)'`
  mit `{"n":3,"a":1,"s":-61644}`: drei Zeilen, eine Adresse, Summe 61644 mc. Die 0,37 USD aus Goal und `LOOP.md` lassen sich gegen die
  Produktion nicht bestätigen; der Einkaufspreis der drei ist 47419 mc. Gutgeschrieben wird, was abgebucht wurde.
- **Die Gutschrift bucht nur, wenn genau diese drei Zeilen auf einer Adresse mit genau dieser Summe stehen.** Sonst nichts und eine
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
