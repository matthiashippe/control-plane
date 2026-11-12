# Fehler Goal 04: Keine Besucheradresse kommt ungeprüft nach `dev`

## Status
ACTIVE

## Active Objective
Jede öffentliche IPv4-Adresse in einer getrackten Datei ist belegt oder fliegt in `check` auf, auch in CI ohne den Cache von
`ops/fetchers.py`: Eine Positivliste `ops/known-ips.txt` nennt je Adresse ihre Art (`datacenter`, `crawler`, `erfunden` oder
`eigene`) und einen Beleg, und ein neuer Test `test/known-ips.test.ts` lehnt jede öffentliche IPv4-Adresse außerhalb von
`192.0.2.0/24`, `198.51.100.0/24` und `203.0.113.0/24` ab, die weder dort noch in `ops/own-ips.txt` oder `ops/crawler-ips.txt`
steht. Eine Adresse ohne Beleg wird durch eine Dokumentationsadresse ersetzt (`loop-constraints.md`, Grundregel 8). Heute prüft nur
`test/visitor-addresses.test.ts` aus fehler 02, und der läuft nur dort, wo der Cache liegt (code-host), in CI wird er übersprungen;
eine Besucheradresse aus einem Zugriffslog nach dem 29.09.2026, die ein Mensch oder ein Lauf ohne Cache committet, kommt ungeprüft
nach `dev`.
Widerlegt, wenn der Test am Kopf von `dev` ohne die Liste keine Adresse findet. Übernimmt
`goals/_vorschlaege/fehler-kritik-2026-11-12-3.md`.
MVP: Funktion, weil das Repo öffentlich ist und jede neue Besucheradresse in einem Kommentar, einer Fixture oder einem Verdict die
Zusage der Datenschutzerklärung bricht, ohne dass `check` es merkt.

## Voraussetzungen
- fehler Goal 03 DONE

## Kontext für den Maker
- Bestand am 12.11.2026 auf `712510f` (Kopf von `dev`): `git ls-files -z | xargs -0 grep -IohE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' | sort -u`,
  gefiltert mit `ipaddress.IPv4Address(...).is_global` aus Python, ergibt 66 öffentliche Adressen außerhalb der
  Dokumentationsbereiche, die meisten in `ops/fixtures/*.log` und in Skripten unter `ops/`. Davon stehen 5 in `ops/own-ips.txt`,
  1 in `ops/crawler-ips.txt` und 7 im Cache mit Art `datacenter`; die übrigen kennt der Cache nicht, weil er nur das Zugriffslog vom
  24. bis 29.09.2026 enthält. Mindestens vier Adressen stehen auch in Dateien, die dieses Goal nicht ändert (Verdicts, Goal-Dateien
  mit Status `DONE`, `docs/audit/`, `LOOP.md`, `loop-constraints.md`, `.github/`, `deploy/`, `harness/`). Gib in keinem Log,
  Kommentar, Commit, PR oder Verdict eine Adresse aus, nur Zahlen und Dateinamen; die einzige Datei, die Adressen beim Namen nennt,
  ist die neue Liste.
- Entscheidung Tech Lead (12.11.2026): Format von `ops/known-ips.txt` wie `ops/crawler-ips.txt`, Kopfzeilen mit `#`, je Zeile
  `<adresse> <art> <beleg>`, durch je ein Leerzeichen getrennt, der Beleg ist freier Text bis zum Zeilenende:
  `datacenter`: Betreiber aus dem Cache von `ops/fetchers.py` (Feld 2; eine unbekannte Adresse fragst du mit `ops/fetchers.py` ab,
  das braucht Netz und schreibt in den Cache unter `~/.cache`), etwa `datacenter Hetzner Online GmbH (fetcher-cache)`;
  `crawler`: PTR-Name, belegt wie in `ops/crawler-ips.txt` mit `ops/crawlers.sh`;
  `eigene`: welche Maschine und die Datei, die sie nennt (Zahlungsserver, Sandbox-Server aus `docs/sandbox/server.md`);
  `erfunden`: der Commit, der sie als Testwert brachte (`git log --format=%h --diff-filter=A -S<adresse> | tail -1`), und nur für
  eine Adresse, die in einer Datei steht, die dieses Goal nicht ändern darf. In jeder anderen Datei wird eine erfundene Adresse durch
  eine Dokumentationsadresse ersetzt, weil sich „erfunden“ nicht prüfen lässt.
- Ersetzen geht vor Auflisten. Eine Adresse, die weder Rechenzentrum mit Betreiber noch Crawler noch eigene ist, ersetzt du wie in
  fehler 02 durch eine aus den Dokumentationsbereichen, je Adresse dieselbe Ersatzadresse in allen Dateien, sodass jede Fixture und
  jeder Test sich so verhält wie vorher. Findest du eine solche Adresse in einer Datei, die dieses Goal nicht ändern darf, und war sie
  kein Testwert, schreibst du keine Zeile `erfunden`, sondern nennst Zahl und Datei im Kommentar und erwähnst den Tech Lead; das
  entscheidet er.
- `ops/own-ips.txt` und `ops/crawler-ips.txt` bleiben, wie sie sind, und gelten für den Test als Teil der Liste, weil `ops/own-ips.sh`
  an die eine Datei anhängt und jedes Traffic-Skript sie liest; Art `eigene` in `ops/known-ips.txt` ist für eigene Maschinen, die
  dort fehlen. IPv6 bleibt außen vor, weil die Zeile der ROADMAP IPv4 nennt.
- Der Test `test/known-ips.test.ts`: liest `ops/own-ips.txt`, `ops/crawler-ips.txt` und die Liste aus `CP_KNOWN_IPS` (Standard
  `ops/known-ips.txt` im Repo; `/dev/null` ist eine leere Liste), nimmt die Dateien aus `git ls-files -z` im Ordner aus
  `CP_SCAN_ROOT` (Standard die Wurzel des Repos), überspringt Binärdateien und findet Kandidaten mit derselben Regex wie
  `test/visitor-addresses.test.ts`, verwirft Oktette über 255 und nimmt nur öffentliche Adressen: alles außer `0.0.0.0/8`, `10.0.0.0/8`,
  `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.168.0.0/16`,
  `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4` und `240.0.0.0/4`. Die Meldung nennt Anzahl und Dateinamen,
  nie eine Adresse. Er braucht weder Cache noch Netz und läuft deshalb in `check` und in CI, ohne `skip`.
- `ops/README.md` bekommt einen Absatz zu `ops/known-ips.txt`: wozu, die vier Arten mit ihrem Beleg, und dass `check` rot wird, wenn
  eine neue Adresse weder belegt noch ersetzt ist.
- Unter `src/` ändert sich nichts: Die Adressen in `src/app.ts` sind im Cache als Rechenzentrum erkannt und kommen in die Liste. So
  löst das Goal keinen Rollout aus (Grundregel 5); `ops/` rollt mit dem nächsten Rollout des Laufzeitpfads aus.
- Traction: Ein Kunde, der seine Adresse im Repo des Anbieters findet, dem er Geld gibt, kommt nicht wieder; ein Red-Team-Befund
  dieser Art ab Schwere 5 stuft den Loop auf L2 herab und hält jedes Goal an.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Der Selbsttest von
  `ops/traffic.sh` endet mit gesperrtem Netz mit Exit 1, deshalb trägt sein Prüfbefehl `(Netz)`.

## Done Condition
- [x] `ops/known-ips.txt` liegt im Repo: je Zeile Adresse, Art aus `datacenter`, `crawler`, `erfunden` oder `eigene` und ein Beleg,
      keine Adresse doppelt, keine aus den Dokumentationsbereichen, und jede Adresse der Art `erfunden` steht in einer Datei, die
      dieses Goal nicht ändern darf. `ops/README.md` erklärt die Liste.
      Prüfung: `test -s ops/known-ips.txt && echo da` muss `da` ausgeben.
      Prüfung: `grep -vE '^(#|$)' ops/known-ips.txt | grep -cvE '^([0-9]{1,3}\.){3}[0-9]{1,3} (datacenter|crawler|erfunden|eigene) [^ ].*$'` muss 0 ausgeben.
      Prüfung: `grep -vE '^(#|$)' ops/known-ips.txt | awk '{print $1}' | sort | uniq -d | wc -l` muss 0 ausgeben.
      Prüfung: `grep -cE '^(192\.0\.2|198\.51\.100|203\.0\.113)\.' ops/known-ips.txt` muss 0 ausgeben.
      Prüfung: `awk '$2=="erfunden"{print $1}' ops/known-ips.txt | while read -r a; do git ls-files -z -- 'goals/*' 'docs/audit/*' LOOP.md loop-constraints.md loop-dauerauftrag.md '.github/**' 'deploy/**' 'harness/**' | xargs -0 grep -lwF -- "$a" | grep -q . || echo x; done | wc -l` muss 0 ausgeben.
      Prüfung: `grep -c 'known-ips.txt' ops/README.md` muss mindestens 1 ausgeben.
- [x] Ein neuer Test `test/known-ips.test.ts` lehnt jede öffentliche IPv4-Adresse außerhalb der Dokumentationsbereiche in
      `git ls-files` ab, die weder in `ops/known-ips.txt` noch in `ops/own-ips.txt` oder `ops/crawler-ips.txt` steht, ohne Cache und
      ohne Netz; die Meldung nennt Anzahl und Dateinamen, nie eine Adresse. Ohne die Liste ist er am Kopf rot, mit einer gepflanzten
      öffentlichen Adresse rot, mit Dokumentations- und privaten Adressen grün.
      Prüfung: `pnpm -s vitest run test/known-ips.test.ts` muss Exit-Code 0 haben.
      Prüfung: `CP_KNOWN_IPS=/dev/null pnpm -s vitest run test/known-ips.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); git -C "$d" init -q; printf 'seen %d.%d.%d.%d\n' 11 22 33 44 > "$d/a.txt"; git -C "$d" add a.txt; CP_SCAN_ROOT="$d" pnpm -s vitest run test/known-ips.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); git -C "$d" init -q; printf 'seen 192.0.2.%d and 10.0.0.%d\n' 7 8 > "$d/a.txt"; git -C "$d" add a.txt; CP_SCAN_ROOT="$d" pnpm -s vitest run test/known-ips.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `gruen` ausgeben.
      Prüfung: `d=$(mktemp -d); git -C "$d" init -q; printf 'seen %d.%d.%d.%d\n' 11 22 33 44 > "$d/a.txt"; git -C "$d" add a.txt; CP_SCAN_ROOT="$d" pnpm -s vitest run test/known-ips.test.ts 2>&1 | grep -cF "$(printf '%d.%d.%d.%d' 11 22 33 44)"` muss 0 ausgeben.
      Prüfung: `d=$(mktemp -d); git -C "$d" init -q; printf 'seen %d.%d.%d.%d\n' 11 22 33 44 > "$d/a.txt"; git -C "$d" add a.txt; CP_SCAN_ROOT="$d" pnpm -s vitest run test/known-ips.test.ts 2>&1 | grep -c 'a\.txt'` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE 'fetcher-cache|CP_FETCHER_CACHE|\.skip|skipIf|\.only|\.todo' test/known-ips.test.ts` muss 0 ausgeben.
- [x] Jede Adresse ohne Beleg ist durch eine Dokumentationsadresse ersetzt, und alles verhält sich wie vorher: Tests und Selbsttests
      grün, die Fixtures von `ops/depth.sh` geben bis auf die Adressen dieselbe Ausgabe wie auf `712510f`, unter `src/` ändert sich
      nichts, und der Test aus fehler 02 bleibt grün.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src | wc -l` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/visitor-addresses.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for f in depth-reader-and-renderer depth-renderers-only depth-fix-reader-and-renderer; do d=$(mktemp -d); git show 712510f:ops/fixtures/$f.log > "$d/a.log"; a=$(CP_DEPTH_LOG="$d/a.log" bash ops/depth.sh 100000 2>&1 | grep -v '^(log from' | sed -E 's/([0-9]{1,3}\.){3}[0-9]{1,3}/X/g' | sort); b=$(CP_DEPTH_LOG=ops/fixtures/$f.log bash ops/depth.sh 100000 2>&1 | grep -v '^(log from' | sed -E 's/([0-9]{1,3}\.){3}[0-9]{1,3}/X/g' | sort); [ "$a" = "$b" ] || echo "$f"; done | wc -l` muss 0 ausgeben.
      Prüfung: `python3 ops/fetchers.py --selftest` muss Exit-Code 0 haben.
      Prüfung: `bash ops/crawlers.sh --selftest` muss Exit-Code 0 haben.
      Prüfung (Netz): `bash ops/traffic.sh --selftest` muss Exit-Code 0 haben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Kritik (Tech Lead, 12.11.2026): Der Test hält die Regeln der Liste selbst in `check`, nicht nur die Prüfbefehle dieses
      Goals: Jede Zeile von `ops/known-ips.txt` außer Kommentar und Leerzeile hat die Form `<adresse> <art> <beleg>` mit einer der
      vier Arten und nicht leerem Beleg, und eine Adresse der Art `erfunden` steht in keiner Datei aus `git ls-files` außerhalb der
      Pfade, die ein Goal nicht ändern darf (`goals/`, `docs/audit/`, `LOOP.md`, `loop-constraints.md`, `loop-dauerauftrag.md`,
      `.github/`, `deploy/`, `harness/`), die Liste selbst ausgenommen. Heute ist der Test grün, wenn eine Besucheradresse mit
      `<adresse> datacenter` ohne Beleg, mit einer erfundenen Art oder als `erfunden` in einer Fixture in der Liste steht; nach `DONE`
      prüft das niemand mehr. Die Meldung nennt Zeilennummer oder Datei, nie eine Adresse.
      Prüfung: `pnpm -s vitest run test/known-ips.test.ts` muss Exit-Code 0 haben.
      Prüfung: `d=$(mktemp -d); k=$(mktemp); git -C "$d" init -q; printf 'seen %d.%d.%d.%d\n' 11 22 33 44 > "$d/a.txt"; git -C "$d" add a.txt; printf '%d.%d.%d.%d datacenter\n' 11 22 33 44 > "$k"; CP_SCAN_ROOT="$d" CP_KNOWN_IPS="$k" pnpm -s vitest run test/known-ips.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); k=$(mktemp); git -C "$d" init -q; printf 'seen %d.%d.%d.%d\n' 11 22 33 44 > "$d/a.txt"; git -C "$d" add a.txt; printf '%d.%d.%d.%d besucher seen in the log\n' 11 22 33 44 > "$k"; CP_SCAN_ROOT="$d" CP_KNOWN_IPS="$k" pnpm -s vitest run test/known-ips.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); k=$(mktemp); git -C "$d" init -q; printf 'seen %d.%d.%d.%d\n' 11 22 33 44 > "$d/a.txt"; git -C "$d" add a.txt; printf '%d.%d.%d.%d erfunden test value from abc1234\n' 11 22 33 44 > "$k"; CP_SCAN_ROOT="$d" CP_KNOWN_IPS="$k" pnpm -s vitest run test/known-ips.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); k=$(mktemp); git -C "$d" init -q; mkdir -p "$d/goals/x"; printf 'seen %d.%d.%d.%d\n' 11 22 33 44 > "$d/goals/x/01-a.md"; git -C "$d" add goals; printf '%d.%d.%d.%d erfunden test value from abc1234\n' 11 22 33 44 > "$k"; CP_SCAN_ROOT="$d" CP_KNOWN_IPS="$k" pnpm -s vitest run test/known-ips.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `gruen` ausgeben.
      Prüfung: `d=$(mktemp -d); k=$(mktemp); git -C "$d" init -q; printf 'seen %d.%d.%d.%d\n' 11 22 33 44 > "$d/a.txt"; git -C "$d" add a.txt; printf '%d.%d.%d.%d datacenter\n' 11 22 33 44 > "$k"; CP_SCAN_ROOT="$d" CP_KNOWN_IPS="$k" pnpm -s vitest run test/known-ips.test.ts 2>&1 | grep -cF "$(printf '%d.%d.%d.%d' 11 22 33 44)"` muss 0 ausgeben.
- [x] Kritik (Tech Lead, 12.11.2026): Ein Eintrag in `ops/known-ips.txt`, dessen Adresse in keiner anderen Datei aus `git ls-files`
      mehr steht, macht den Test rot, damit die Liste nicht zur Freigabe auf Vorrat wird: Eine einmal eingetragene Adresse, deren
      Fundstelle weg ist, ließe sonst jede spätere Besucheradresse gleichen Werts ungeprüft durch. Die Meldung nennt die Anzahl,
      nie eine Adresse.
      Prüfung: `d=$(mktemp -d); k=$(mktemp); git -C "$d" init -q; printf 'seen 192.0.2.%d\n' 7 > "$d/a.txt"; git -C "$d" add a.txt; printf '%d.%d.%d.%d datacenter Example (fetcher-cache)\n' 11 22 33 44 > "$k"; CP_SCAN_ROOT="$d" CP_KNOWN_IPS="$k" pnpm -s vitest run test/known-ips.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); k=$(mktemp); git -C "$d" init -q; printf 'seen %d.%d.%d.%d\n' 11 22 33 44 > "$d/a.txt"; git -C "$d" add a.txt; printf '%d.%d.%d.%d datacenter Example (fetcher-cache)\n' 11 22 33 44 > "$k"; CP_SCAN_ROOT="$d" CP_KNOWN_IPS="$k" pnpm -s vitest run test/known-ips.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `gruen` ausgeben.
      Prüfung: `d=$(mktemp -d); k=$(mktemp); git -C "$d" init -q; printf 'seen 192.0.2.%d\n' 7 > "$d/a.txt"; git -C "$d" add a.txt; printf '%d.%d.%d.%d datacenter Example (fetcher-cache)\n' 11 22 33 44 > "$k"; CP_SCAN_ROOT="$d" CP_KNOWN_IPS="$k" pnpm -s vitest run test/known-ips.test.ts 2>&1 | grep -cF "$(printf '%d.%d.%d.%d' 11 22 33 44)"` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der neue Test war vor der Liste rot; die Zeile im Progress Log nennt, mit wie vielen Adressen in wie vielen Dateien.
- [ ] Keine Adresse in Commit, PR, Kommentar, Log oder Verdict, nur Zahlen und Dateinamen.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku für Matthias Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- `src/**`
- `ops/own-ips.txt`, `ops/crawler-ips.txt`, `test/visitor-addresses.test.ts` und der Cache unter `~/.cache/control-plane/` (er wird
  nicht gelöscht)
- jede Goal-Datei außer dieser, jedes Verdict, jeder Vorschlag unter `goals/_vorschlaege/`, jedes `ANNAHMEN.md` eines anderen Topics,
  `docs/audit/**`, `loop-dauerauftrag.md`
- die Historie des Repos: kein `filter-repo`, kein Rebase veröffentlichter Commits, kein `push --force` (`delete_data`, bei Matthias)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-12 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: `ops/known-ips.txt` mit 13 belegten Adressen (10 datacenter, 1 crawler, 1 eigene, 1 erfunden), neuer Test `test/known-ips.test.ts`, vor der Liste rot (am Kopf von `dev` 60 Adressen in 48 Dateien, nach der Ersetzung 13 in 31), 43 unbelegte Adressen in 22 Dateien unter `ops/` und `test/` durch Dokumentationsadressen ersetzt, `dev` eingemergt. Prüfbefehle: Punkt 1 `da`, 0, 0, 0, 0, 1; Punkt 2 Exit 0, `rot`, `rot`, `gruen`, 0, 2, 0; Punkt 3 0, `pnpm -s vitest run` Exit 0 (120 Dateien, 1472 Tests; zwei Läufe davor rot nur am 5-s-Timeout von `test/stripe-sessions-selftest.test.ts` bei Load 52, einzeln grün), `test/visitor-addresses.test.ts` Exit 0, depth-Fixtures 0, `ops/fetchers.py --selftest` Exit 0, `ops/crawlers.sh --selftest` Exit 0, `ops/traffic.sh --selftest` (Netz) Exit 0; Punkt 4 `node scripts/check.mjs` Exit 0 (grün in 56 s).
- 2026-11-12 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4; `dev` ohne neue Commits, jeder Prüfbefehl am Kopf `ca0074a` neu gefahren. Prüfbefehle: Punkt 1 `da`, 0, 0, 0, 0, 1; Punkt 2 Exit 0, `rot`, `rot`, `gruen`, 0, 2, 0; Punkt 3 0, `pnpm -s vitest run` Exit 0 (120 Dateien, 1472 Tests), `test/visitor-addresses.test.ts` Exit 0, depth-Fixtures 0, `ops/fetchers.py --selftest` Exit 0, `ops/crawlers.sh --selftest` Exit 0, `ops/traffic.sh --selftest` (Netz) Exit 0; Punkt 4 `node scripts/check.mjs` Exit 0 (grün in 213 s); am PR #56 Jobs `check` und `e2e` grün.
- 2026-11-12 Zyklus 3: Punkt Kritik 1 (Punkt 5) gebaut: `test/known-ips.test.ts` prüft jede Zeile von `ops/known-ips.txt` auf die Form `<adresse> <art> <beleg>` und hält eine Adresse der Art `erfunden` aus jeder getrackten Datei außerhalb von `goals/`, `docs/audit/`, `LOOP.md`, `loop-constraints.md`, `loop-dauerauftrag.md`, `.github/`, `deploy/`, `harness/`; Fundstellen sind `CP_SCAN_ROOT` und der Work Tree, der die Liste trackt (`ANNAHMEN.md`), die Meldung nennt Zeilennummer und Datei. Prüfbefehle: Exit 0, `rot`, `rot`, `rot`, `gruen`, 0.
- 2026-11-12 Zyklus 4: Punkt Kritik 2 (Punkt 6) gebaut und Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6: `test/known-ips.test.ts` wird rot für jeden Eintrag von `ops/known-ips.txt`, dessen Adresse in keiner anderen getrackten Datei steht (Meldung nennt Anzahl und Zeilennummern), Absatz in `ops/README.md`; am Zwischenstand von Zyklus 3 lieferte Prüfbefehl 1 von Punkt 6 noch `gruen`, `origin/dev` ohne neue Commits. Prüfbefehle: Punkt 1 `da`, 0, 0, 0, 0, 1; Punkt 2 Exit 0, `rot`, `rot`, `gruen`, 0, 2, 0; Punkt 3 0, `pnpm -s vitest run` Exit 0 (120 Dateien, 1475 Tests; ein Lauf davor rot nur am 5-s-Timeout von `test/stripe-sessions-selftest.test.ts` bei Load 42, einzeln grün), `test/visitor-addresses.test.ts` Exit 0, depth-Fixtures 0, `ops/fetchers.py --selftest` Exit 0, `ops/crawlers.sh --selftest` Exit 0, `ops/traffic.sh --selftest` (Netz) Exit 0; Punkt 4 `node scripts/check.mjs` Exit 0 (grün in 71 s); Punkt 5 Exit 0, `rot`, `rot`, `rot`, `gruen`, 0; Punkt 6 `rot`, `gruen`, 0.

## Blockers
