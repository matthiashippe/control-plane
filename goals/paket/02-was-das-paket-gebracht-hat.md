# Paket Goal 02: Was das Paket gebracht hat

## Status
PLANNED

## Active Objective
Seit dem 22.11.2026 um 18:30:27 UTC liegt das Release `v0.2.2-maintained.1` des Forks `matthiashippe/automaton` öffentlich
(`gh release view v0.2.2-maintained.1 -R matthiashippe/automaton --json publishedAt`): Wer es installiert und startet, meldet sich
ohne Einstellung bei `https://automatonhost.com` an, und jede Anfrage seiner Runtime trägt `User-Agent: automaton-maintained/<version>`.
Ob das jemand tut, misst heute kein Werkzeug. Nach diesem Goal zählt `ops/package-yield.sh` aus dem Caddy-Zugriffslog je Woche die
fremden Anschlüsse, deren erste Anmeldung (`POST /v1/auth/verify` mit 200) die Kennung des Pakets trägt, und wie viele davon danach
zahlten, nur als Summen, eigene Adressen aus `own_ips` heraus, mit Selbsttest in beide Richtungen. In `goals/paket/ertrag.md` steht
die Messung über die 14 Tage nach dem Release und das Urteil, ob das Paket weiter gepflegt wird oder ein anderer Kanal kommt.
Leitzahl: neue fremde Anmeldungen je Woche mit der Kennung des Pakets, und ihre Zahlungen.
Widerlegt ist paket 01, wenn in den 14 Tagen nach dem Release keine neue fremde Anmeldung mit der Kennung ankommt; dann heißt das
Urteil `anderer Kanal`.
MVP: Funktion, weil erst die Messung zeigt, ob der Kanal Paket zahlende Automatons bringt oder die Arbeit in einen anderen Kanal muss.

## Voraussetzungen
- paket Goal 01 DONE
- frühestens 2026-12-07

## Kontext für den Maker
- Ziel in einem Satz: Der Tech Lead entscheidet am Tag der Messung mit gezählten Anmeldungen und Zahlungen, ob das Paket weiter
  gepflegt wird oder neue zahlende Automatons über einen anderen Kanal kommen müssen.
- Quelle: `ROADMAP.md`, Topic `paket`, Glied 02; Widerlegung aus paket 01 (`goals/paket/01-die-runtime-kommt-mit-unserer-adresse.md`,
  Active Objective).
- Warum frühestens 07.12.: Das Fenster sind genau die 14 Tage aus der Widerlegung von paket 01, vom Release
  `2026-11-22T18:30:27Z` bis `2026-12-06T18:30:27Z`, und der Loop Master startet ein Goal mit `frühestens` um 00:00 UTC. Das feste
  Fenster macht die Zahlen wiederholbar; Caddy hält das Log 720 Stunden (`roll_keep_for` in `deploy/Caddyfile`), also reicht es am
  07.12. noch bis etwa 07.11. zurück.
- Bestand, den das Werkzeug nutzt und nicht ändert: `ops/access-log.sh` (ganzes Log samt gedrehter Dateien, Exit 2 wenn nicht
  lesbar), `ops/conway-arrivals.sh` mit `conway_own_list` (eigene Adressen aus `own_ips`, Exit 2 bei leerer oder fehlender Liste) und
  `ops/conway_arrivals.py` (`read_log` liefert je Zeile `ts ip method path status referer agent`, `is_sign_in`, `own_addresses`).
  Aufbau, Schalter, Selbsttest ohne Netz (gefälschtes `ssh` vorn im `PATH`, `CP_OWN_IPS_SEEN` im Temp-Ordner) und Test nach dem
  Vorbild von `ops/github-yield.sh` und `test/github-yield.test.ts`.
- Aufruf:
  `ops/package-yield.sh --since <ISO UTC> --until <ISO UTC>` (Produktion: das Log über `ops/access-log.sh` mit `CP_HOST` und
  `CP_SSH_KEY`), `ops/package-yield.sh --log <datei> --since … --until …` (dieselbe Zählung aus einer Datei),
  `ops/package-yield.sh --selftest` (ohne Netz). `--since` und `--until` sind ISO-Zeiten in UTC wie bei `ops/github-yield.sh`,
  `--until` liegt nach `--since`, sonst Exit 1. Exit 2, wenn das Log nicht lesbar ist, die eigene Liste fehlt oder leer ist oder das
  Fenster keine einzige Zeile hat. Die Datenbank liest das Werkzeug nicht.
- Regeln der Zählung, je fremder Adresse (nicht in der eigenen Liste):
  - Kennung: Der `User-Agent` beginnt mit `automaton-maintained/`.
  - Neue Anmeldung: die erste Zeile der Adresse in `[since, until)` mit `is_sign_in` und Kennung. Hatte dieselbe Adresse irgendwann vor
    `--since` eine Anmeldung mit 200 (gleich welcher `User-Agent`), zählt sie nicht als neu, sondern unter `known before`.
  - Woche: Woche `n` beginnt bei `since + (n-1) * 7 Tage`; je angefangener Woche bis `--until` steht eine Zeile, auch mit 0. Eine neue
    Anmeldung zählt in der Woche ihres Zeitpunkts.
  - Gezahlt: dieselbe Adresse hat nach ihrer neuen Anmeldung und vor `--until` eine Anfrage auf `/pay/` mit 200, gleich welcher
    `User-Agent` (die Aufladung der Runtime läuft über `x402Fetch` auf `GET /pay/<usd>/<adresse>`, `src/conway/topup.ts` im Fork).
  - Fehler: eine Adresse, die in `[since, until)` mit Kennung eine Antwort mit Status ab 400 außer 402 bekam (402 ist der normale
    Weg von x402). Gezählt werden Adressen, nicht Zeilen.
- Ausgabe, genau diese Zeilen in dieser Reihenfolge, keine Adresse und keine Wallet darin:
  `WEEK <n> from <ISO UTC>: <a> first sign-ins, <b> paid` (je Woche),
  `TOTAL since <since> until <until>: <a> first sign-ins, <b> paid, <k> known before`,
  `ANY since <since> until <until>: <n> foreign addresses sent automaton-maintained/, <e> got an error`,
  `WINDOW since <since>: <lines> log line(s), <f> foreign address(es), up to <last> UTC`.
- Neue Fixtures, nur Adressen aus RFC 5737: `ops/fixtures/package-yield.log` (Caddy-JSON wie `ops/fixtures/github-yield.log`) und
  `ops/fixtures/package-yield-own-ips.txt` mit `203.0.113.99`. Eine Wallet im Pfad von `/pay/` ist erfunden und besteht aus Nullen
  mit einer `1` am Ende. Die Zeilen:
  `198.51.100.21` meldet sich am 23.11. mit Kennung an (200), zahlt danach auf `/pay/` mit 200 (User-Agent `node`) und bekommt auf
  `/v1/chat/completions` einmal 402;
  `198.51.100.22` meldet sich am 01.12. mit Kennung an und zahlt nicht;
  `198.51.100.23` meldete sich am 15.11. mit User-Agent `node` an und am 24.11. mit Kennung;
  `198.51.100.24` meldet sich am 25.11. mit User-Agent `node` an;
  `198.51.100.25` bekommt am 26.11. mit Kennung auf `POST /v1/auth/verify` 500;
  `198.51.100.26` meldet sich am 06.12. um 19:00 UTC mit Kennung an (nach `--until`);
  `203.0.113.99` (eigene) meldet sich am 23.11. mit Kennung an und zahlt.
- Erwartet mit `--since 2026-11-22T18:30:27Z --until 2026-12-06T18:30:27Z` und der Fixture-Liste:
  `WEEK 1 from 2026-11-22T18:30:27Z: 1 first sign-ins, 1 paid`, `WEEK 2 from 2026-11-29T18:30:27Z: 1 first sign-ins, 0 paid`,
  `TOTAL …: 2 first sign-ins, 1 paid, 1 known before`, `ANY …: 4 foreign addresses sent automaton-maintained/, 1 got an error`.
  Gegenprobe mit einer eigenen Liste, die nur `192.0.2.1` nennt: Woche 1 `2 first sign-ins, 2 paid`, `TOTAL …: 3 first sign-ins,
  2 paid, 1 known before`, `ANY …: 5 …, 1 got an error`. Gegenprobe mit dem Log, in dem jeder `User-Agent` `node` heißt (der Selbsttest
  schreibt es in seinen Temp-Ordner): jede Zeile `WEEK` mit `0 first sign-ins, 0 paid` und `ANY …: 0 …, 0 got an error`, damit die
  Null als gemessen belegt ist und nicht von Blindheit kommt (Grundregel 3).
- Selbsttest: Zeilen `ok   <Grund>` oder `FAIL <Grund>`, letzte Zeile `SELFTEST OK` oder `SELFTEST FAILED`, mit allen drei Läufen
  oben und einer Zeile, dass die Ausgabe keine Adresse und keine Wallet nennt. Tests in `test/package-yield.test.ts`, mindestens je
  einer, dessen Name `first sign-in`, `own address`, `known before`, `not an error` (die 402), `after until` und `unreadable`
  (Exit 2 bei fehlendem Log) enthält; der Test für `unreadable` erreicht weder Netz noch Server (gefälschtes `ssh`).
- Die Messung, nur lesend gegen die Produktion (`loop-constraints.md`, Produktion: nur lesen):
  `set -a; . ~/.config/control-plane/loop.env; set +a; bash ops/package-yield.sh --since 2026-11-22T18:30:27Z --until 2026-12-06T18:30:27Z`.
  Befehl und vollständige Ausgabe stehen als Codeblock in `goals/paket/ertrag.md` (neue Datei). Dazu im selben oder einem eigenen
  Codeblock `gh api repos/matthiashippe/automaton/traffic/views --jq '"\(.count) \(.uniques)"'` mit Ausgabe, weil bei 0 Anmeldungen
  die Frage ist, ob den Fork überhaupt jemand ansah; die Zahl enthält eigene Aufrufe, das sagt die Datei in einem Satz.
- `goals/paket/ertrag.md` außerhalb der Codeblöcke genau diese Zeilen ab Spalte 0, je eine:
  `Release: v0.2.2-maintained.1, veröffentlicht 2026-11-22T18:30:27Z`;
  `Gemessen: <JJJJ-MM-TTTHH:MM:SSZ>`;
  `Woche 1 ab 2026-11-22T18:30:27Z: <a> neue Anmeldungen mit der Kennung, <b> davon gezahlt` und dasselbe für `Woche 2 ab
  2026-11-29T18:30:27Z`, die Zahlen aus den Zeilen `WEEK` der Ausgabe;
  `Vorher schon angemeldet: <k>` aus `known before`;
  `Runtimes des Pakets mit Fehler: <e> von <n>` aus der Zeile `ANY`;
  `Fork auf GitHub (14 Tage): <v> Aufrufe von <u> Besuchern`;
  zuletzt `Urteil: weiter pflegen, weil …`, wenn die beiden Wochen zusammen mindestens eine neue Anmeldung zählen, sonst
  `Urteil: anderer Kanal, weil …`; die Begründung nennt die Zahlen in Worten eines Satzes. Die Folge des Urteils (nächstes Glied, neuer
  Kanal) entscheidet der Tech Lead, das Goal ändert dafür nichts an `ROADMAP.md`.
- Zählt die Zeile `ANY` mindestens einen Fehler, ist das ein Fehler eines echten Nutzers (Grundregel 4): ein Vorschlag
  `goals/_vorschlaege/fehler-<JJJJ-MM-TT>-<n>.md` mit `Schwere: 5`, `Goal: paket 02`, Pfad und Status als Summe, ohne Adresse, und
  dem Befehl, der ihn zeigt (`ops/conway_arrivals.py` und das Log nur lesend).
- `goals/paket/ANNAHMEN.md` wächst um Zeilen `- <Datum>, paket 02: …`, mindestens zu: Gezählt werden Adressen statt Wallets, weil das
  Log keine Wallet kennt und eine Runtime von einem Anschluss aus arbeitet; Zahlungen per Karte aus einem Browser kommen von einer
  anderen Adresse und fehlen in der Zahl, sie ist eine untere Grenze.
- Code, Kommentare, Testnamen und Ausgabezeilen Englisch, Goal-Datei, `ertrag.md` und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.
  Keine Adresse und keine Wallet eines Kunden in Repo, Progress Log oder Kommentar (Grundregel 8). Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein `pkill -f`.

## Done Condition
- [ ] `ops/package-yield.sh` zählt neue fremde Anmeldungen mit der Kennung je Woche, ihre Zahlungen, vorher bekannte Anschlüsse und
      Fehler nach den Regeln aus dem Kontext, ohne Adresse in der Ausgabe, mit Selbsttest in beide Richtungen und Tests.
      MVP: Funktion, weil ohne das Werkzeug niemand sieht, ob eine Runtime aus dem Paket bei uns ankommt.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/package-yield.sh --selftest | tail -1` muss `SELFTEST OK` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/package-yield.sh --selftest | grep -c '^FAIL'` muss 0 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/package-yield.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(.*(first sign-in|own address|known before|not an error|after until|unreadable)" test/package-yield.test.ts` muss mindestens 6 ausgeben.
      Prüfung: `cat ops/fixtures/package-yield.log ops/fixtures/package-yield-own-ips.txt | grep -oE "([0-9]{1,3}\.){3}[0-9]{1,3}" | grep -vcE "^(192\.0\.2|198\.51\.100|203\.0\.113)\."` muss 0 ausgeben.
- [ ] In `goals/paket/ertrag.md` steht die Messung der 14 Tage nach dem Release mit Befehl und vollständiger Ausgabe, und die Zeilen
      in Worten tragen genau die Zahlen der Ausgabe.
      MVP: Funktion, weil das Urteil über den Kanal nur auf gemessenen Zahlen fallen darf.
      Prüfung: `grep -c "^Release: v0.2.2-maintained.1, veröffentlicht 2026-11-22T18:30:27Z$" goals/paket/ertrag.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Gemessen: 2026-12-(0[7-9]|[12][0-9]|3[01])T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$" goals/paket/ertrag.md` muss 1 ausgeben.
      Prüfung: `grep -c "bash ops/package-yield.sh --since 2026-11-22T18:30:27Z --until 2026-12-06T18:30:27Z" goals/paket/ertrag.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "^WINDOW since 2026-11-22T18:30:27Z: [1-9][0-9]* log line" goals/paket/ertrag.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Woche [12] ab 2026-11-(22|29)T18:30:27Z: [0-9]+ neue Anmeldungen mit der Kennung, [0-9]+ davon gezahlt$" goals/paket/ertrag.md` muss 2 ausgeben.
      Prüfung: `awk '/^WEEK [12] from /{split($0,p,": "); split(p[2],q," "); w[$2]=q[1]" "q[4]} /^Woche [12] ab /{split($0,p,": "); split(p[2],q," "); d[$2]=q[1]" "q[7]} END{exit !(w[1]!="" && w[2]!="" && w[1]==d[1] && w[2]==d[2])}' goals/paket/ertrag.md` muss Exit-Code 0 haben.
      Prüfung: `awk '/^TOTAL since /{split($0,p,": "); split(p[2],q," "); k=q[6]} /^Vorher schon angemeldet: /{v=$NF} END{exit !(k!="" && k==v)}' goals/paket/ertrag.md` muss Exit-Code 0 haben.
      Prüfung: `awk '/^ANY since /{split($0,p,": "); split(p[2],q," "); n=q[1]; e=q[6]} /^Runtimes des Pakets mit Fehler: /{split($0,p,": "); split(p[2],r," "); f=r[1]; g=r[3]} END{exit !(n!="" && n==g && e==f)}' goals/paket/ertrag.md` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^Fork auf GitHub \(14 Tage\): [0-9]+ Aufrufe von [0-9]+ Besuchern$" goals/paket/ertrag.md` muss 1 ausgeben.
      Prüfung: `grep -E "(^|[^0-9.])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9.]|$)|0x[0-9a-fA-F]{40}" goals/paket/ertrag.md | wc -l` muss 0 ausgeben.
- [ ] Das Urteil folgt der Regel: `weiter pflegen` genau dann, wenn die beiden Wochen zusammen mindestens eine neue Anmeldung zählen,
      sonst `anderer Kanal`.
      MVP: Funktion, weil das Urteil entscheidet, wohin die nächste Arbeit für zahlende Automatons geht.
      Prüfung: `grep -cE "^Urteil: (weiter pflegen|anderer Kanal), weil " goals/paket/ertrag.md` muss 1 ausgeben.
      Prüfung: `awk '/^Woche [12] ab /{split($0,p,": "); split(p[2],q," "); s+=q[1]; n++} /^Urteil: /{u=$2" "$3} END{exit !(n==2 && ((s>0 && u=="weiter pflegen,") || (s==0 && u=="anderer Kanal,")))}' goals/paket/ertrag.md` muss Exit-Code 0 haben.
- [ ] Ein Fehler an einer Runtime des Pakets wird ein Vorschlag an das Topic `fehler`.
      MVP: Funktion, weil ein Betreiber, dessen Anmeldung bei uns scheitert, sonst still verloren geht.
      Prüfung: `e=$(sed -n 's/^Runtimes des Pakets mit Fehler: \([0-9][0-9]*\) von [0-9][0-9]*$/\1/p' goals/paket/ertrag.md); test -n "$e" && { test "$e" = 0 || grep -l "^Goal: paket 02" goals/_vorschlaege/fehler-2026-12-*.md; }` muss Exit-Code 0 haben.
- [ ] `goals/paket/ANNAHMEN.md` nennt die Annahmen dieses Goals, ohne Adresse, und die Zeilen von paket 01 bleiben unverändert.
      Prüfung: `grep -cE "^- [0-9-]+, paket 02: " goals/paket/ANNAHMEN.md` muss mindestens 2 ausgeben.
      Prüfung: `diff <(git show origin/dev:goals/paket/ANNAHMEN.md) <(head -n "$(git show origin/dev:goals/paket/ANNAHMEN.md | wc -l)" goals/paket/ANNAHMEN.md) | wc -l` muss 0 ausgeben.
      Prüfung: `grep -E "(^|[^0-9.])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9.]|$)|0x[0-9a-fA-F]{40}" goals/paket/ANNAHMEN.md | wc -l` muss 0 ausgeben.
- [ ] Das Goal ändert nur das neue Werkzeug, seine Fixtures, seinen Test, Dateien unter `goals/paket/` und einen Vorschlag `fehler-…`.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE "^(ops/package-yield\.sh|ops/fixtures/package-yield(\.log|-own-ips\.txt)|test/package-yield\.test\.ts|goals/paket/.*|goals/_vorschlaege/fehler-2026-12-[0-9]{2}-[0-9]+\.md)$" | wc -l` muss 0 ausgeben.
- [ ] `check` ist grün und lässt den Checkout sauber.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs >/dev/null 2>&1; git status --porcelain | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede Zahl in `goals/paket/ertrag.md` mit dem Befehl, aus dem sie stammt, und der Uhrzeit der Messung in UTC; der Zähler ist mit
      gepflanzten Zeilen in beide Richtungen belegt, die Progress-Log-Zeile nennt die Ausgabe des Selbsttests.
- [ ] Keine Adresse, keine Wallet und kein Name eines Kunden in Repo, Progress Log oder Kommentar.
- [ ] Der Fork `matthiashippe/automaton` bleibt unverändert: kein Commit, kein Release, keine Änderung an Beschreibung oder Website.
- [ ] Code, Kommentare, Testnamen und Ausgabezeilen Englisch, Goal-Datei, `ertrag.md` und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `docs/kette.md`, `ops/prompts/**`, `.github/**`,
  `scripts/**`, `src/**`, `harness/**`, `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- alle bestehenden Dateien unter `ops/` und `test/` (auch `ops/conway_arrivals.py`, `ops/conway-arrivals.sh`, `ops/own-ips.sh`,
  `ops/own-ips.txt`, `ops/access-log.sh`): nur lesen, das Werkzeug ruft sie auf
- `goals/paket/01-die-runtime-kommt-mit-unserer-adresse.md`, `goals/paket/verdicts/01-*` und alle bestehenden Vorschläge: nur lesen
- im Fork `matthiashippe/automaton` und in `Conway-Research/automaton`: jede Änderung, jeder Kommentar, jedes Issue und jeder PR
- Produktion nur lesend: kein Rollout, kein Neustart, keine Datei auf dem Server; jede Wallet-Bewegung
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
