Schwere: 2
Goal: umzug 02
Befund: `KNOWN_HOSTS` in `ops/before-the-answers.py` ist eine weitere Kopie von `SERVICE_HOSTS`, die umzug 02 um `automatonhost.com` erweitert, aber `test/host-lists.test.ts`, das laut Kopf jede Kopie der Hostliste festhält, prüft diese Kopie nicht.
Beleg: `git grep -n -e before-the-answers -e KNOWN_HOSTS origin/dev -- test/host-lists.test.ts; echo rc=$?` -> `rc=1` | ops/before-the-answers.py:47, src/public/site.ts:21, test/host-lists.test.ts:2 bis 4
Empfehlung: In `test/host-lists.test.ts` einen Fall `ops/before-the-answers.py: KNOWN_HOSTS is the same set as SERVICE_HOSTS` ergänzen, der die Zeile `KNOWN_HOSTS = (...)` liest und als Menge mit `SERVICE_HOSTS` vergleicht, wie der Fall für `ops/sandbox/cloudflare.py`.
MVP: Schönheit
Übernommen: PRO-24877 Glied 8 (2026-11-18)
