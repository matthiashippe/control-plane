# Adressen Goal 01: Besucheradressen aus den Actions-Logs und im Gate gesperrt

## Status
ACTIVE

## Active Objective
Kein Besucher des Dienstes findet seine Adresse in den Logs der Actions des öffentlichen Repos, und kein PR bringt den Cache von
`ops/fetchers.py` am Gate vorbei zurück ins Repo (`loop-constraints.md`, Grundregel 8). Zuerst zählt ein neues Werkzeug
`ops/actions-log-addresses.sh`, ohne eine Adresse auszugeben, wie viele fremde Adressen die Logs der sechs `deploy`-Läufe vom 10. bis
12.11.2026 enthalten (42879222074, 42895005251, 43164473390, 43260817090, 43277458881, 43322130930), und `docs/adressen/actions-logs.md`
hält nur die Zahlen fest. Dann löscht Matthias am Human Gate `delete_data` diese sechs Logs und trägt `ops/fetcher-cache.tsv` in
`deny_paths` von `gate.yaml` ein, das nur ein Mensch ändert. Danach belegt das Goal mit Netz, dass keiner der sechs Läufe mehr ein Log
liefert und kein Lauf von `deploy.yml` eine fremde Adresse trägt, und ohne Netz, dass `gate.yaml` auf `dev` den Eintrag hat und ein
grüner Drill des Loop Masters nach dem Eintrag lief.
Widerlegt, wenn die Zählung 0 ergibt; dann entfällt das Löschen und es bleibt der Eintrag im Gate. Übernimmt
`goals/_vorschlaege/loop-triage-2026-11-13-1.md` und `goals/_vorschlaege/betrieb-redteam-2026-11-13-1.md`.
MVP: Funktion, weil die Datenschutzerklärung der Seite die Löschung nach 30 Tagen zusagt, GitHub die Logs aber 90 Tage öffentlich
lesbar hält, und weil heute nur `.gitignore` und ein Test den Cache aus dem Repo halten, nicht das Gate.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel: Ein Kunde, der seine Adresse sucht, findet sie weder im Repo noch in dessen Actions-Logs, und das bleibt so, auch wenn ein
  späterer Lauf den Cache wieder hinzufügen will.
- Gemessen vom Tech Lead am 13.11.2026 um 23:30 UTC, nur Zahlen: Alle sechs Läufe liefern noch ein Log. Fremde Adressen stehen in
  Zeilen einer Anfrage (`<Zeit>  <Adresse>  <Methode> <Pfad>  <Status>`, aus dem alten `ops/deploy-window.sh` unter `AFFECTED`) in
  fünf der sechs Läufe, zusammen 2 verschiedene; 42879222074 hat keine. Von 103 Läufen von `deploy.yml` (ab 10.11.2026, 14:55 UTC)
  trägt kein anderer eine, 42839001716 liefert schon kein Log mehr. Die Zeile `(new own address <Adresse>, written to own-ips.txt)`
  nennt eine Adresse des GitHub-Rechners, keine eines Besuchers, und zählt deshalb nicht. Die Zählung ist also nicht 0, das Goal läuft
  bis zum Human Gate; ergibt deine Zählung doch 0, setzt du Punkt 3 nicht um, sondern nennst es im Kommentar, und der Tech Lead
  entscheidet.
- Entscheidung Tech Lead (13.11.2026): `ops/actions-log-addresses.sh` (Bash, Kommentare und Ausgabe Englisch) liest Logs aus einem
  Ordner (`--dir <ordner>`, je Lauf ein Unterordner mit dem Namen der Lauf-ID, darin beliebig tief `*.txt`, so wie `unzip` das Archiv
  von `gh api repos/<repo>/actions/runs/<id>/logs` auspackt) oder lädt sie selbst (`--runs <id>,<id>,…` oder `--workflow <datei>`,
  dann alle Läufe dieses Workflows, nicht nur die ersten 20; Repo aus `CP_REPO`, Standard `matthiashippe/control-plane`) in einen
  Ordner aus `mktemp -d`, den es am Ende löscht. Fremd ist eine IPv4-Adresse in einer Zeile mit einer HTTP-Methode, gefolgt von
  einem Pfad ab `/`, die in keiner der Listen `CP_OWN_IPS_FILE` (Standard `ops/own-ips.txt`), `CP_KNOWN_IPS` (Standard
  `ops/known-ips.txt`) und `CP_CRAWLER_IPS` (Standard `ops/crawler-ips.txt`) steht und nicht in `0.0.0.0/8`, `10.0.0.0/8`,
  `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12` oder `192.168.0.0/16` liegt; Dokumentationsadressen zählen, damit Tests sie als
  Besucher pflanzen können. Ausgabe je Lauf eine Zeile `<id> <n>` (verschiedene fremde Adressen dieses Laufs) oder `<id> no-log`
  (Log nicht mehr abrufbar), aufsteigend nach ID, zuletzt `total <n>` (verschiedene fremde Adressen über alle Läufe). Nie eine
  Adresse, auch nicht auf stderr. Scheitert `gh` beim Auflisten oder mit einem anderen Fehler als einem fehlenden Log, endet es mit
  Exit 2 und ohne Zeile `total`, damit ein Netzfehler nie als 0 gelesen wird.
- Test `test/actions-log-addresses.test.ts` ohne Netz, mit `--dir` und einem nachgebauten `gh` vorn im `PATH` (wie die Fakes in
  `test/deploy-window.test.ts`): die Fälle aus der zweiten Prüfung von Punkt 1, ein Lauf mit Adressen nur aus den drei Listen
  (`<id> 0`), ein nachgebautes `gh`, das für einen Lauf das Log verweigert (`<id> no-log`, Exit 0), eines, das schon beim Auflisten
  scheitert (Exit 2, keine Zeile `total`), und eines, das mehr als 20 Läufe liefert (alle erscheinen). Jede Ausgabe ist frei von
  Adressen. Fixtures nur mit Adressen aus `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` und privaten Bereichen.
- `ops/README.md`: ein kurzer Abschnitt zu `ops/actions-log-addresses.sh` (wozu, Aufruf, was als fremd zählt, dass es nie eine
  Adresse ausgibt).
- `docs/adressen/actions-logs.md` (Deutsch): Abschnitt `## Zählung vor dem Löschen` mit dem Befehl in einem Codeblock
  (`bash ops/actions-log-addresses.sh --runs <die sechs IDs>`), `Gemessen: <JJJJ-MM-TT HH:MM> UTC`, darunter die sieben Zeilen der
  Ausgabe ab Spalte 0 außerhalb eines Codeblocks, dann eine Zeile `Läufe von deploy.yml mit fremden Adressen: <k> von <m>` aus
  `--workflow deploy.yml`. Ein Zähler, der nichts findet, ist erst belegt, wenn er einen gepflanzten Treffer findet (Grundregel 3):
  Das leistet die zweite Prüfung von Punkt 1. Nach dem Human Gate Abschnitt `## Nach dem Löschen` mit `Keine Logs mehr: <JJJJ-MM-TT
  HH:MM> UTC` (Zeit deiner Prüfung) und der Ausgabe von `--workflow deploy.yml`, wieder ab Spalte 0, mit der Zeile `total 0`.
- Ablauf: Punkte 1 und 2 bauen, Progress-Log-Zeile, Commit, Push, Draft-PR. Dann `## Status` auf `BLOCKED matthias` und unter
  `## Blockers` die Zeilen `Art: matthias`, `Gate: delete_data`, `Aufgabe: Logs der sechs deploy-Läufe vom 10. bis 12.11. löschen und
  ops/fetcher-cache.tsv in deny_paths von gate.yaml eintragen`, `Worum: <ein Satz mit der Zahl aus Punkt 2>` und `Empfehlung:` mit dem
  fertigen Befehl `for id in 42879222074 42895005251 43164473390 43260817090 43277458881 43322130930; do gh api -X DELETE
  repos/matthiashippe/control-plane/actions/runs/$id/logs; done` und der Zeile `  - "ops/fetcher-cache.tsv"` unter `- "*.db"` im Block
  „Schlüssel und lokaler Zustand“ von `gate.yaml` auf `dev`. Commit, Push. Den Rest macht der Loop Master.
- Nach dem Gate: `origin/dev` in den Goal-Branch mergen (dann steht der Eintrag in `gate.yaml` auch dort, ohne dass der PR die Datei
  ändert), Punkt 3 messen, Punkt 4 prüfen. Den Drill nach einer Änderung an `gate.yaml` startet der Loop Master selbst
  („gate.yaml geändert“); steht er noch aus, wartet Punkt 4 auf ihn und du nennst das im Kommentar, statt ihn zu umgehen.
- Unter `src/` ändert sich nichts, `ops/` und `docs/` liegen nicht im Laufzeitpfad von `deploy.yml`, also löst das Goal keinen Rollout
  aus (Grundregel 5).
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Neue Dateien vor dem lokalen
  `check` stagen, weil die Regeln nur `git ls-files` lesen. Geladene Logs nur in einem Ordner aus `mktemp -d`, danach löschen. Gib in
  keinem Log, Kommentar, Commit, PR oder Verdict eine Adresse aus, nur Zahlen.

## Done Condition
- [x] `ops/actions-log-addresses.sh` zählt fremde Adressen in Zeilen einer Anfrage je Lauf und über alle, ohne eine Adresse
      auszugeben, und endet bei einem Fehler von `gh` mit Exit 2 statt mit einer 0.
      MVP: Funktion, weil die Zählung vor dem Löschen und die Prüfung danach sonst niemand wiederholen kann.
      Prüfung: `test -x ops/actions-log-addresses.sh && echo da` muss `da` ausgeben.
      Prüfung: `d=$(mktemp -d); mkdir -p "$d/logs/1/deploy" "$d/logs/2"; printf '05:57:46  203.0.113.7  POST /v1/chat/completions  503\n06:00:01  10.0.0.1  GET /health  200\n06:00:02  198.51.100.1  GET /health  200\n(new own address 198.51.100.9, written to own-ips.txt)\n' > "$d/logs/1/deploy/3_x.txt"; printf '16:41:04  203.0.113.7  GET /v1/credits/balance  502\n18:15:25  203.0.113.8  POST /v1/chat/completions  402\n' > "$d/logs/2/0_deploy.txt"; printf '198.51.100.1 2026-11-13 test\n' > "$d/own"; CP_OWN_IPS_FILE="$d/own" CP_KNOWN_IPS=/dev/null CP_CRAWLER_IPS=/dev/null bash ops/actions-log-addresses.sh --dir "$d/logs" | tr '\n' ' '` muss `1 1 2 2 total 2 ` ausgeben.
      Prüfung: `d=$(mktemp -d); printf '#!/bin/sh\nexit 1\n' > "$d/gh"; chmod +x "$d/gh"; PATH="$d:$PATH" bash ops/actions-log-addresses.sh --workflow deploy.yml > "$d/out" 2>&1; echo "$? $(grep -c '^total' "$d/out")"` muss `2 0` ausgeben.
      Prüfung: `pnpm -s vitest run test/actions-log-addresses.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c 'actions-log-addresses.sh' ops/README.md` muss mindestens 1 ausgeben.
- [x] `docs/adressen/actions-logs.md` nennt je der sechs Läufe die Zahl fremder Adressen, die Zahl verschiedener über alle sechs und
      die Zahl der Läufe von `deploy.yml` mit fremden Adressen, mit Befehl und Zeit, und keine Adresse.
      MVP: Funktion, weil Matthias am Gate wissen muss, was er löscht, und weil die Zahl das Goal widerlegen kann.
      Prüfung: `awk '/^## Zählung vor dem Löschen/{f=1;next} /^## /{f=0} f' docs/adressen/actions-logs.md | grep -cE '^(42879222074|42895005251|43164473390|43260817090|43277458881|43322130930) [0-9]+$'` muss 6 ausgeben.
      Prüfung: `awk '/^## Zählung vor dem Löschen/{f=1;next} /^## /{f=0} f' docs/adressen/actions-logs.md | grep -cE '^total [0-9]+$'` muss 1 ausgeben.
      Prüfung: `awk '/^## Zählung vor dem Löschen/{f=1;next} /^## /{f=0} f' docs/adressen/actions-logs.md | grep -cE '^Gemessen: 2026-11-[0-9]{2} [0-9]{2}:[0-9]{2} UTC$'` muss 1 ausgeben.
      Prüfung: `awk '/^## Zählung vor dem Löschen/{f=1;next} /^## /{f=0} f' docs/adressen/actions-logs.md | grep -cE '^Läufe von deploy\.yml mit fremden Adressen: [0-9]+ von [0-9]+$'` muss 1 ausgeben.
      Prüfung: `grep -cE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' docs/adressen/actions-logs.md` muss 0 ausgeben.
- [x] Nach dem Human Gate `delete_data` liefert keiner der sechs Läufe mehr ein Log, kein Lauf von `deploy.yml` trägt eine fremde
      Adresse, und die Doku hält das fest.
      MVP: Funktion, weil erst das die Adressen aus dem öffentlichen Repo nimmt.
      Prüfung (Netz): `gh api repos/matthiashippe/control-plane --jq .full_name >/dev/null && for id in 42879222074 42895005251 43164473390 43260817090 43277458881 43322130930; do gh api repos/matthiashippe/control-plane/actions/runs/$id/logs >/dev/null 2>&1 && echo "$id log"; done | wc -l` muss 0 ausgeben.
      Prüfung (Netz): `bash ops/actions-log-addresses.sh --workflow deploy.yml | awk '$1=="total"{print $2}'` muss `0` ausgeben.
      Prüfung: `awk '/^## Nach dem Löschen/{f=1;next} /^## /{f=0} f' docs/adressen/actions-logs.md | grep -cE '^Keine Logs mehr: 2026-(11|12)-[0-9]{2} [0-9]{2}:[0-9]{2} UTC$'` muss 1 ausgeben.
      Prüfung: `awk '/^## Nach dem Löschen/{f=1;next} /^## /{f=0} f' docs/adressen/actions-logs.md | grep -cx 'total 0'` muss 1 ausgeben.
- [x] `gate.yaml` sperrt `ops/fetcher-cache.tsv` in `deny_paths`, der Goal-PR ändert `gate.yaml` nicht, und ein grüner Drill des Loop
      Masters lief nach dem Eintrag.
      MVP: Funktion, weil nur das Gate einen PR aufhält, der den Cache wieder hinzufügt, und ein Eintrag erst mit einem Drill gilt.
      Prüfung: `awk '/^deny_paths:/{f=1;next} /^[^ #]/{f=0} f && /^ *- *"?ops\/fetcher-cache\.tsv"? *$/' gate.yaml | wc -l` muss 1 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- gate.yaml | wc -l` muss 0 ausgeben.
      Prüfung: `a=$(git log --format=%cI -S'ops/fetcher-cache.tsv' -- gate.yaml | tail -n 1); ~/work/code-host/tools/loop-master drill control-plane | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const d=JSON.parse(s).counted||{};const a=new Date(process.argv[1]);console.log(d.status==="grün"&&a.getTime()>0&&new Date(d.at)>a?"gezeigt":"fehlt")})' "$a"` muss `gezeigt` ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die neue Testdatei war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Keine Adresse in Commit, PR, Kommentar, Log, Doku oder Verdict, nur Zahlen.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- `src/**` ganz
- Löschen durch den Loop: kein `gh api -X DELETE`, kein `gh run delete`, keine Änderung an Logs, Läufen oder Einstellungen des Repos
  (`delete_data`, `security_settings`, bei Matthias)
- `ops/own-ips.txt`, `ops/known-ips.txt`, `ops/crawler-ips.txt` und der Cache von `ops/fetchers.py` bleiben unverändert;
  `ops/fetchers.py` wird nicht aufgerufen
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Zyklus 1: Punkte 1, 2 und 5 gebaut (Zähler `ops/actions-log-addresses.sh` mit Test und README-Abschnitt, Zählung in `docs/adressen/actions-logs.md`: 5 der 6 Läufe mit fremden Adressen, 2 verschiedene, 5 von 112 Läufen von deploy.yml), Punkte 3 und 4 warten auf das Human Gate `delete_data`; der neue Test war vor dem Skript rot (12 failed, Skript fehlte). Prüfbefehle: P1 `da`, `1 1 2 2 total 2 `, `2 0`, vitest 12 passed Exit 0, README 4; P2 6, 1, 1, 1, 0; P3 offen (Netz: 6 Läufe liefern noch ein Log); P4 Diff gate.yaml 0, Eintrag 0 und Drill offen; P5 `node scripts/check.mjs` Exit 0 (148 Dateien, 1731 Tests).
- 2026-11-14 Zyklus 2: Punkt 3 gebaut (`origin/dev` mit dem Eintrag in `gate.yaml` gemergt, Abschnitt `## Nach dem Löschen` in `docs/adressen/actions-logs.md`: keiner der sechs Läufe liefert ein Log, 0 fremde Adressen in 128 Läufen von deploy.yml), Punkt 4 wartet auf den Drill 20261114-094046Z, den der Loop Master nach der Änderung an `gate.yaml` gestartet hat. Prüfbefehle: P3 Netz 0, Netz `0`, Abschnitt 1, `total 0` 1; P4 Eintrag 1, Diff gate.yaml 0, Drill `fehlt` (Drill läuft, Verdicts der Linsen fehlen); P2 6, 1, 1, 1, 0; P5 `node scripts/check.mjs` Exit 0 (149 Dateien, 1736 Tests).
- 2026-11-14 Zyklus 3: Abschluss gemeldet, Punkte 1, 2, 3, 4 und 5 (`origin/dev` gemergt, Punkt 4 nach dem grünen Drill 20261114-094046Z abgehakt; derselbe Prüfbefehl gab vor dem Takt um 12:00 UTC `fehlt` aus, weil der Takt um 11:50 UTC den Beleg der Linse K noch nicht gelesen hatte). Prüfbefehle: P1 `da`, `1 1 2 2 total 2 `, `2 0`, vitest Exit 0, README 4; P2 6, 1, 1, 1, 0; P3 Netz 0, Netz `0`, Abschnitt 1, `total 0` 1; P4 Eintrag 1, Diff gate.yaml 0, Drill `gezeigt`; P5 `node scripts/check.mjs` Exit 0 (150 Dateien, 1760 Tests).

## Blockers
- keine (Human Gate `delete_data` am 14.11.2026 um 09:32 UTC gelöst: Logs gelöscht, `gate.yaml` auf dev mit Commit 3f1ac20)
