Schwere: 3
Goal: betrieb 02
Befund: Sechs `deploy`-Läufe vom 10. bis 12.11. haben mit dem alten `ops/deploy-window.sh` unter NO KEY und AFFECTED je Zeile die `remote_ip` fremder Besucher in die Actions-Logs des öffentlichen Repos geschrieben; betrieb 02 entfernt die Ausgabe nur für künftige Läufe, die vorhandenen Logs bleiben 90 Tage lesbar.
Beleg: `for c in 5682905 9b67824 72fcfbb; do git show $c:ops/deploy-window.sh | grep -cE "req.get\('remote_ip'\)\}"; done` -> 2, 2, 0; `gh api repos/matthiashippe/control-plane --jq .visibility` -> public; `gh api repos/matthiashippe/control-plane/actions/permissions/artifact-and-log-retention` -> days 90 | dea4bcc:ops/deploy-window.sh:135, :138, .github/workflows/deploy.yml:165, goals/betrieb/02-keine-anfrage-scheitert-am-neustart.md:60-61, src/public/datenschutz.ts:19, :35
Empfehlung: Matthias löscht die Logs der sechs Läufe (`gh api -X DELETE repos/matthiashippe/control-plane/actions/runs/<id>/logs` für 42879222074, 42895005251, 43164473390, 43260817090, 43277458881, 43322130930); der Loop kann das nicht, weil betrieb 02 `.github/**` sperrt und Löschen ein Human Gate ist.

## Herleitung

Grundregel 8 (loop-constraints.md:38-40) verbietet Personendaten im öffentlichen Repo; der Loop liest IP-Adressen selbst so (betrieb 02:61, loop-redteam-2026-11-11-1). Laut docs/betrieb/neustart.md:15-20 gab es in den sechs Fenstern mindestens 7 Antworten mit 502 an fremde Adressen, also mindestens so viele Zeilen mit fremden IPs. Die Datenschutzerklärung sagt Löschung nach 30 Tagen zu, GitHub hält die Logs 90 Tage. Alle sechs Läufe sind noch gelistet; der Inhalt der Logs wurde nicht geladen.

Schwere 3 statt 4 wie loop-redteam-2026-11-11-1: rund ein Dutzend Adressen, überwiegend Crawler, lesbar nur für angemeldete GitHub-Nutzer, Abhilfe klein. Abgegrenzt von loop-redteam-2026-11-11-1 (`ops/fetcher-cache.tsv` im Git-Baum).
