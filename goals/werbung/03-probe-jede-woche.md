# Werbung Goal 03: Die Agenten-Probe läuft jede Woche und zählt sauber

## Status
ACTIVE

## Active Objective
werbung 02 hat die Agenten-Probe gebaut, aber es gibt nur den Lauf vom 23.11.2026, und keiner startet den nächsten. Der volle
Bericht `bash ops/traffic.sh 168` lief für den Block `-- Agent fetches --` über 10 Minuten, `card` zählt jede Zeichenfolge (auch
„discard“, „scorecard“ und eine Verneinung irgendwo in der Antwort), und eine Antwort, die unseren Hinweis in den Conway-Issues
findet, uns aber nicht beim Namen nennt, erscheint als Null (q1 und q3 im Lauf 2026-W48). Nach diesem Goal gibt
`bash ops/traffic.sh --agents <h>` nur den Block `-- Agent fetches --` aus, und `bash ops/agent-probe.sh --week` stellt die fünf
Fragen höchstens einmal je ISO-Woche, legt die Antworten roh auf dem code-host unter
`~/.local/state/control-plane/agent-probe/<JJJJ-Www>/` ab, gibt bei jedem weiteren Aufruf derselben Woche die gespeicherte Zeile
aus und hängt sonst eine Zeile mit der neuen Zahl `seen` an `docs/kunden/agenten-probe.md`. `card` zählt nur als Wort im selben
Satz wie automatonhost.com. Den Wochenlauf fährt der Richtungs-Check (alle 7 Tage) mit genau diesen zwei Befehlen; ein zweiter
Lauf derselben Woche kostet nichts. Die erste Zeile mit `seen` schreibt dieses Goal selbst.
Leitzahl: Antworten, die automatonhost.com nennen, von 5, und daneben `seen` von 5.
Widerlegt, wenn die Probe schon heute mehr als eine Zeile je Woche hat.
MVP: Funktion, weil erst die zweite Woche zeigt, ob reichweite 04 die Empfehlung der Agenten bewegt.

## Voraussetzungen
- werbung Goal 02 DONE

## Kontext für den Maker
- Ziel in einem Satz: Jede Woche steht mit einem billigen Befehl eine vergleichbare Zeile im Repo, die zeigt, wie viele frische
  Agenten-Sessions einem Betreiber mit kaputtem Conway-Automaton automatonhost.com nennen, wie viele den Weg per Karte, und wie
  viele unseren Hinweis finden, ohne uns zu nennen.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: `seen` trennt „findet uns nicht“ von „findet uns, traut uns
  nicht“. Ist `seen` hoch und `host` niedrig, liegt der Hebel im Text der Kommentare und Seiten (reichweite), nicht in der
  Auffindbarkeit. Ohne Wochenlauf bleibt die Zahl vom 23.11.2026 die einzige.
- Quelle: `ROADMAP.md`, Topic `werbung`, Glied 03 (Tech Lead 24.11.2026, PRO-28911). Übernimmt
  `goals/_vorschlaege/werbung-probe-takt-2026-11-23-1.md`, `goals/_vorschlaege/werbung-kritik-2026-11-23-4.md`,
  `goals/_vorschlaege/werbung-kritik-2026-11-23-3.md` und die Zahl `seen` aus `goals/_vorschlaege/werbung-kritik-2026-11-23-2.md`;
  dazu die Zeile der Watch List in `STATE.md` zu `ops/fixtures/agent-probe-claude.sh:12`
  (`goals/_vorschlaege/werbung-nacharbeit-2026-11-24-1.md`), weil dieses Goal die Datei ohnehin anfasst.
- Muster: `ops/agent-probe.sh`, `test/agent-probe.test.ts`, `test/traffic-agents.test.ts` und
  `goals/werbung/02-empfehlen-uns-agenten.md` (Entscheidungen 1 bis 8, Progress Log). Das Messwerkzeug gilt erst, wenn es in beide
  Richtungen bewiesen ist (`loop-constraints.md`, Grundregel 3).
- **Entscheidungen des Tech Lead (24.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- 2026-11-24, werbung 03: …`
  (Datum des Baus) unter einer neuen Überschrift `## werbung 03: Die Agenten-Probe läuft jede Woche und zählt sauber` in
  `goals/werbung/ANNAHMEN.md`.
  1. **Ohne Schalter bleibt das Werkzeug, wie werbung 02 es gebaut hat.** `bash ops/agent-probe.sh` ohne Schalter zählt und
     schreibt Wort für Wort wie bisher, weil die Prüfbefehle von werbung 02 genau das prüfen und eine fertige Goal-Datei
     eingefroren ist. Neu ist nur, dass es auch eine Zeile im neuen Format (Entscheidung 4) als Lauf der Woche erkennt. Die neuen
     Regeln gelten für `--week`, und `ops/README.md` nennt für den Wochenlauf nur `--week`.
  2. **`card` nur als Wort im Satz mit automatonhost.com.** Bei `--week` zählt eine Antwort als `card`, wenn ein Satz
     `automatonhost.com` nennt (Groß- und Kleinschreibung frei) und im selben Satz eines der Wörter `card`, `cards`,
     `credit card`, `debit card`, `Visa`, `Mastercard`, `PayPal` oder `Apple Pay` steht, je als ganzes Wort (kein Buchstabe und
     keine Ziffer davor oder dahinter, Groß- und Kleinschreibung frei). PayPal und Apple Pay zählen weiter, weil die Kasse von
     Digistore24 alle drei Wege nennt (werbung 02, Entscheidung 3). Satzgrenzen sind `.`, `!` oder `?` vor Leerraum oder Textende
     und jeder Zeilenumbruch; der Punkt in `automatonhost.com` ist keine Grenze.
  3. **`seen`: der Hinweis ohne Namen.** Eine Antwort ohne `host` zählt als `seen`, wenn ein Satz `conwayApiUrl` oder
     `CONWAY_API_URL` nennt (Groß- und Kleinschreibung frei) und im selben Satz (a) `control plane` oder `control-plane` steht, (b)
     eines der Wörter `third-party`, `third party`, `alternative`, `compatible`, `mirror`, `unofficial` oder `self-hosted` steht oder
     (c) eine URL `http://` oder `https://` steht, deren Host nicht `conway.tech` oder eine Subdomain davon ist, oder der Platzhalter
     `<old host>`. Eine Antwort mit `host` zählt nie als `seen`; `seen` und `old` schließen sich nicht aus. Die Regel steht so eng,
     damit ein Satz über die Kontrollinstanz von Conway selbst („Credits are granted by the control plane“) nicht zählt.
  4. **Die Zeile von `--week` hat ein eigenes Format**, das mit der Woche beginnt, damit die Prüfbefehle von werbung 02, die jede
     Zeile `- <JJJJ-MM-TT>T…` nach den alten Regeln nachzählen, die neuen Zeilen nicht nach den alten Regeln beurteilen:
     `- <JJJJ-Www> <UTC-Zeit ISO 8601 mit Z> model <Modell> host <h>/5 card <c>/5 seen <s>/5 old <o>/5 failed <f>/5 answers docs/kunden/agenten-probe/<JJJJ-Www>.md via <sessions|recount>`.
     `failed`, Exit 1 bei `failed` größer 0, Modell und Ersetzungen in den Antworten wie in werbung 02 (Entscheidungen 3 und 4 dort).
  5. **Eine Woche, ein Lauf, in beiden Richtungen.** Steht für die laufende Woche schon eine Zeile im neuen Format in der Datei aus
     `CP_PROBE_OUT` oder liegt `<Zustand>/<JJJJ-Www>/line`, ruft `--week` keine Session auf, gibt genau diese gespeicherte Zeile
     aus und endet mit Exit 0. Steht für die Woche nur eine Zeile im alten Format und liegt die Antwortdatei der Woche in
     `CP_PROBE_ANSWERS_DIR`, zählt `--week` diese Antworten nach den Entscheidungen 2 und 3 neu, ohne Session und ohne die
     Antwortdatei zu ändern (`<old host>` zählt dabei als alter Host, `(failed: …)` als `failed`), und hängt die Zeile mit
     `via recount` an. So bekommt die Woche 2026-W48 ihre Zeile mit `seen`, ohne dass in ihr ein zweites Mal gefragt wird. Steht
     nur eine Zeile im alten Format ohne Antwortdatei, gibt `--week` `already probed in <JJJJ-Www>` aus, Exit 0. Ohne Schalter
     erkennt das Werkzeug die Zeile im neuen Format ebenso als Lauf der Woche (`already probed in <JJJJ-Www>`, Exit 0). Kein Schalter
     hebt die Sperre auf.
  6. **Die rohen Antworten bleiben auf dem code-host.** `--week` schreibt je Frage das JSON der Session nach
     `<Zustand>/<JJJJ-Www>/q<n>.json` und die Zeile nach `<Zustand>/<JJJJ-Www>/line`; `<Zustand>` ist
     `~/.local/state/control-plane/agent-probe`, über `CP_PROBE_STATE_DIR` änderbar, Rechte 700. Der Ordner liegt nie im Repo, weil
     die rohen Antworten alte Hosts und Adressen tragen können; ins Repo gehen nur die ersetzten Antworten nach
     `docs/kunden/agenten-probe/<JJJJ-Www>.md`.
  7. **Die Session bleibt frisch.** `--week` ruft die Session genau wie werbung 02 (Entscheidung 2 dort und `ANNAHMEN.md`): eigener
     Aufruf je Frage, `env -i`, leeres `mktemp -d` außerhalb des Repos, nur `WebSearch` und `WebFetch`, kein `--model`, kein
     `ANTHROPIC_API_KEY`, höchstens 300 Sekunden. Die fünf Fragen bleiben Wort für Wort, damit die Wochen vergleichbar sind.
  8. **`ops/traffic.sh --agents <h>` gibt nur den Block aus.** Der Schalter wird vor dem Fenster gelesen wie `--funnel`, holt das
     Log wie der volle Bericht (`CP_TRAFFIC_LOG` für Tests) und gibt auf stdout genau die Zeilen des Blocks `-- Agent fetches --`
     aus, wie der volle Bericht sie zeigt, dann eine Leerzeile, sonst nichts. Bestehende Blöcke, Schalter und der Selbsttest
     bleiben, wie sie sind.
  9. **Den Takt setzt kein Code.** Den Wochenlauf fährt der Richtungs-Check (ROADMAP werbung 03): `bash ops/agent-probe.sh --week`
     und `bash ops/traffic.sh --agents 168`, beide Ergebnisse in seine Analyse unter `docs/richtung/`. Dieses Goal ändert an keiner
     Routine etwas; es schreibt beide Befehle unter einer Überschrift `### Weekly run` in `ops/README.md` und als neuen Absatz
     direkt unter den bestehenden Kopf von `docs/kunden/agenten-probe.md` (bestehende Zeilen bleiben). Kein Cron, kein Timer und
     keine Routine durch einen Agent.
- **Fixture.** `ops/fixtures/agent-probe-strict/q1.json` bis `q5.json` im Aufbau von `ops/fixtures/agent-probe-two-hits/` (gleiches
  `modelUsage`), `result` genau so:
  q1 `Point conwayApiUrl at AutomatonHost.com, which takes a credit card.`,
  q2 `AutomatonHost.com keeps a scorecard of uptime. Some other hosts take a card.`,
  q3 `Point conwayApiUrl at a third-party control plane.`,
  q4 `AutomatonHost.com takes Visa and Mastercard.`,
  q5 `Leave conwayApiUrl at https://api.conway.tech and wait for Conway.`
  Erwartet mit `--week`: `host 3/5 card 2/5 seen 1/5 old 0/5 failed 0/5`. Mit `ops/fixtures/agent-probe-two-hits/` erwartet:
  `host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5` (q3 nennt „control plane“, aber nicht `conwayApiUrl`).
- **Selbsttest.** `--selftest` fährt zusätzlich `--week` gegen `agent-probe-strict`, `agent-probe-two-hits` und `agent-probe-fails`
  in einem temporären Ziel und Zustand; die letzte Zeile bleibt genau `SELFTEST OK`.
- **Tests.** Neue Fälle in `test/agent-probe.test.ts` und `test/traffic-agents.test.ts`, die Namen prüfen die Punkte; die bestehenden
  Fälle bleiben unverändert. Jeder neue Fall war einmal rot, die Zeile im Progress Log sagt, womit (Mutante des Skripts oder Skript
  der Merge-Basis).
- **Erster Lauf.** Nach grünem Selbsttest fährt der Maker auf dem code-host nach `set -a; . ~/.config/control-plane/loop.env; set +a`
  genau einmal `bash ops/agent-probe.sh --week` (läuft das Goal in 2026-W48, ist das die Neuzählung ohne Session, danach fünf
  Sessions) und `time bash ops/traffic.sh --agents 168`, nur lesend. Er committet die neue Zeile, gegebenenfalls die Antworten der
  Woche, und in `docs/kunden/agenten-probe.md` unter `## Abrufe von Agenten` einen neuen Absatz mit `Gemessen: <UTC-Zeit>`, dem
  Befehl `bash ops/traffic.sh --agents 168`, dem Block im Codeblock und einer Zeile `Laufzeit: <Sekunden> s` (Wanduhr aus `time`,
  ganze Sekunden). Bestehende Zeilen und Absätze der Datei bleiben. Zeigt der Lauf `failed` größer 0, fährt er nicht ein zweites
  Mal in derselben Woche, sondern schreibt den Grund ins Progress Log.
- Vor dem Bau die Prüfbefehle von werbung 02 und der DONE-Goals, die `traffic.sh` nennen (`grep -l 'traffic\.sh' goals/*/[0-9]*.md`),
  einmal am Kopf von `dev` fahren und nach dem Bau erneut. Wird einer rot, ohne dass sein Zweck verletzt ist, fragt der Maker den
  Tech Lead auf dem Topic mit Befehl und beiden Ausgaben; kein Prüfbefehl eines fertigen Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Test geht ins Netz, ruft `claude` auf oder bindet einen festen Port. Code,
  Bezeichner, Testnamen und Ausgaben englisch, `docs/kunden/agenten-probe.md` und `ANNAHMEN.md` deutsch. Dieses Goal ändert nichts
  unter `src/` und löst darum keinen Rollout aus.

## Done Condition
- [x] `--week` zählt `card` nur als Wort im Satz mit automatonhost.com und zählt `seen` nach Entscheidung 3, gescheiterte Sessions
      nur als `failed`.
      MVP: Funktion, weil `card` sonst mehr Karte zeigt, als Agenten nennen, und ein gefundener Hinweis ohne Namen als Null erscheint.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-strict CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "exit=$? $(tail -n 1 $T/p.md | grep -oE 'host [0-5]/5 card [0-5]/5 seen [0-5]/5 old [0-5]/5 failed [0-5]/5')"; rm -rf $T` muss genau `exit=0 host 3/5 card 2/5 seen 1/5 old 0/5 failed 0/5` ausgeben.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "exit=$? $(tail -n 1 $T/p.md | grep -oE 'host [0-5]/5 card [0-5]/5 seen [0-5]/5 old [0-5]/5 failed [0-5]/5')"; rm -rf $T` muss genau `exit=0 host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5` ausgeben.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-fails CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "exit=$? $(tail -n 1 $T/p.md | grep -oE 'host [0-5]/5 card [0-5]/5 seen [0-5]/5 old [0-5]/5 failed [0-5]/5')"; rm -rf $T` muss genau `exit=1 host 0/5 card 0/5 seen 0/5 old 0/5 failed 5/5` ausgeben.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state bash ops/agent-probe.sh --week > /dev/null 2>&1; cat $T/*-W*.md | grep -ciE 'postyourprice|cp\.hippe\.eu|0x[0-9a-f]{40}'; rm -rf $T` muss genau 0 ausgeben.
- [x] Die Zeile von `--week` steht im Format aus Entscheidung 4, und je Woche gibt es genau einen Lauf: Ein zweiter Aufruf fragt
      nicht und gibt die gespeicherte Zeile aus, ohne Schalter gilt dieselbe Sperre, und eine Woche mit Antworten aus werbung 02
      wird ohne Session neu gezählt.
      MVP: Funktion, weil die Zahl je Woche gilt, ein Lauf fünf Sessions kostet und der Richtungs-Check den Befehl gefahrlos wiederholen können muss.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-strict CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state bash ops/agent-probe.sh --week > /dev/null 2>&1; tail -n 1 $T/p.md | grep -cE '^- [0-9]{4}-W[0-9]{2} [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z model [^ ]+ host [0-5]/5 card [0-5]/5 seen [0-5]/5 old [0-5]/5 failed [0-5]/5 answers docs/kunden/agenten-probe/[0-9]{4}-W[0-9]{2}\.md via sessions$'; rm -rf $T` muss genau 1 ausgeben.
      Prüfung: `T=$(mktemp -d); e="CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-strict CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state CP_PROBE_RECORD=$T/rec"; env $e bash ops/agent-probe.sh --week > /dev/null 2>&1; a=$(wc -c < $T/rec); env $e bash ops/agent-probe.sh --week > $T/o 2>/dev/null; r=$?; o=$(tail -n 1 $T/o); n=$(env $e bash ops/agent-probe.sh 2>&1 | tail -n 1 | grep -oE '^already probed in [0-9]{4}-W[0-9]{2}$' | cut -d' ' -f1-3); echo "$(grep -c '^- ' $T/p.md) $([ "$a" = "$(wc -c < $T/rec)" ] && echo still) $([ "$o" = "$(tail -n 1 $T/p.md)" ] && echo same) exit=$r $n"; rm -rf $T` muss genau `1 still same exit=0 already probed in` ausgeben.
      Prüfung: `T=$(mktemp -d); e="CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state CP_PROBE_RECORD=$T/rec"; env $e bash ops/agent-probe.sh > /dev/null 2>&1; a=$(wc -c < $T/rec); h=$(cat $T/*-W*.md | sha256sum); env $e bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "exit=$? $(grep -c '^- ' $T/p.md) $([ "$a" = "$(wc -c < $T/rec)" ] && echo still) $([ "$h" = "$(cat $T/*-W*.md | sha256sum)" ] && echo kept) $(tail -n 1 $T/p.md | grep -oE 'host [0-5]/5 card [0-5]/5 seen [0-5]/5 old [0-5]/5 failed [0-5]/5 answers [^ ]+ via [a-z]+$' | sed -E 's/ answers [^ ]+//')"; rm -rf $T` muss genau `exit=0 2 still kept host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5 via recount` ausgeben.
- [x] Die rohen Antworten liegen im Zustand außerhalb des Repos, und die Session von `--week` ist so frisch wie in werbung 02.
      MVP: Funktion, weil die rohen Antworten alte Hosts und Adressen tragen können und eine Session mit unserem Gedächtnis uns natürlich nennt.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "$(ls $T/state/*/q[1-5].json | wc -l) $(cat $T/state/*/q3.json | grep -c postyourprice) $([ "$(cat $T/state/*/line)" = "$(tail -n 1 $T/p.md)" ] && echo line) $(stat -c %a $T/state)"; rm -rf $T` muss genau `5 1 line 700` ausgeben.
      Prüfung: `grep -c '\.local/state/control-plane/agent-probe' ops/agent-probe.sh` muss mindestens 1 ausgeben.
      Prüfung: `T=$(mktemp -d); PAPERCLIP_API_KEY=x OPENROUTER_API_KEY=x CP_SSH_KEY=x GH_TOKEN=x ANTHROPIC_API_KEY=x CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state CP_PROBE_RECORD=$T/rec bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "$(grep -cE '^env=(PAPERCLIP_|OPENROUTER_|CP_|GH_TOKEN|ANTHROPIC_)' $T/rec) $(grep -cE '^argv=.*--no-session-persistence' $T/rec) $(grep -cE '^argv=.*--tools WebSearch,WebFetch( |$)' $T/rec) $(grep -c "^cwd=$PWD" $T/rec) $(grep -c '^cwd=' $T/rec)"; rm -rf $T` muss genau `0 5 5 0 5` ausgeben.
      Prüfung: `grep -cE 'ANTHROPIC_API_KEY|--model' ops/agent-probe.sh` muss 0 ausgeben.
      Prüfung: `grep -cE '\$\{CP_PROBE_' ops/fixtures/agent-probe-claude.sh` muss 0 ausgeben.
- [x] Je Regel ein Fall in `test/agent-probe.test.ts`, jeder wird gegen das Skript der Merge-Basis rot, und der Selbsttest deckt `--week`.
      MVP: Funktion, weil eine Zählregel ohne roten Fall nicht bewiesen ist (`loop-constraints.md`, Grundregel 3).
      Prüfung: `for t in "counts card only as a word and never inside another word" "counts card only in a sentence that names automatonhost.com" "counts seen for an answer that finds our hint without our name" "never counts seen for an answer that names us or keeps conway" "writes the weekly line in the new format with seen" "asks at most once per iso week with --week and prints the stored line again" "keeps the raw answers of the week in the state directory and not in the repo" "counts a week that already has answers again from them without a session" "shares one week lock between --week and the run without a switch" "passes no key, no paperclip and no loop variable to the session with --week"; do grep -qF "\"$t\"" test/agent-probe.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/agent-probe.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); git archive $(git merge-base origin/dev HEAD) ops | tar -x -C $T; cp -r ops/fixtures/agent-probe-strict $T/ops/fixtures/; AGENT_PROBE_UNDER_TEST=$T/ops/agent-probe.sh PATH=/usr/bin:$PATH pnpm -s vitest run test/agent-probe.test.ts > /dev/null 2>&1 && echo gruen || echo rot; rm -rf $T` muss genau `rot` ausgeben.
      Prüfung: `bash ops/agent-probe.sh --selftest 2>&1 | tail -n 1` muss genau `SELFTEST OK` ausgeben.
      Prüfung: `grep -c 'agent-probe-strict' ops/agent-probe.sh` muss mindestens 1 ausgeben.
- [x] `ops/traffic.sh --agents <h>` gibt nur den Block `-- Agent fetches --` aus, zählt wie der volle Bericht und bleibt auf dem
      Fixture-Log unter 20 Sekunden; alles Bisherige bleibt.
      MVP: Funktion, weil ein Wochenlauf, der in seinem Zeitlimit stirbt, die Zahl der Woche nicht schreibt.
      Prüfung: `for t in "prints only the agent block with --agents" "finishes --agents on the fixture log within 20 seconds" "counts the same with --agents as in the full report"; do grep -qF "\"$t\"" test/traffic-agents.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/traffic-agents.test.ts test/traffic-hosts.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); git archive $(git merge-base origin/dev HEAD) ops | tar -x -C $T; TRAFFIC_UNDER_TEST=$T/ops/traffic.sh PATH=/usr/bin:$PATH pnpm -s vitest run test/traffic-agents.test.ts > /dev/null 2>&1 && echo gruen || echo rot; rm -rf $T` muss genau `rot` ausgeben.
      Prüfung: `bash ops/traffic.sh --selftest 2>&1 | tail -n 1 | grep -c '^SELFTEST OK'` muss genau 1 ausgeben.
- [x] Was werbung 02 prüft, bleibt: Ohne Schalter zählt das Werkzeug wie bisher, und die Läufe im Repo zählen nach den alten Regeln weiter.
      MVP: Funktion, weil ein fertiges Goal nicht rot werden darf, nur weil ein neues daneben baut.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state bash ops/agent-probe.sh > /dev/null 2>&1; echo "exit=$? $(tail -n 1 $T/p.md | grep -oE 'host [0-5]/5 card [0-5]/5 old [0-5]/5 failed [0-5]/5')"; rm -rf $T` muss genau `exit=0 host 2/5 card 1/5 old 1/5 failed 0/5` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const s=fs.readFileSync("docs/kunden/agenten-probe.md","utf8");const bad=[];const ls=s.split("\n").filter(l=>/^- \d{4}-\d\d-\d\dT/.test(l));for(const l of ls){const m=l.match(/host (\d)\/5 card (\d)\/5 old (\d)\/5 failed (\d)\/5 answers (\S+)$/);if(!m){bad.push("format");continue}if(!fs.existsSync(m[5])){bad.push("fehlt "+m[5]);continue}const a=fs.readFileSync(m[5],"utf8");const qs=a.split(/^## q[1-5]\s*$/m).slice(1);if(qs.length!==5)bad.push(m[5]+" fragen "+qs.length);const h=qs.filter(q=>/automatonhost\.com/i.test(q)).length;const c=qs.filter(q=>/automatonhost\.com/i.test(q)&&/card|paypal|apple pay/i.test(q)).length;if(h!==+m[1]||c!==+m[2])bad.push(m[5]+" zahlen "+h+"/"+c+" statt "+m[1]+"/"+m[2]);if(/postyourprice|cp\.hippe\.eu|0x[0-9a-f]{40}/i.test(a))bad.push(m[5]+" alter host oder adresse")}if(!ls.length)bad.push("keine zeile");console.log(bad.length?bad.join("; "):"probe ok "+ls.length)'` muss `probe ok <n>` mit n mindestens 1 ausgeben.
      Prüfung: `git diff --quiet $(git merge-base origin/dev HEAD) HEAD -- docs/kunden/agenten-probe/2026-W48.md goals/werbung/02-empfehlen-uns-agenten.md && echo unveraendert` muss genau `unveraendert` ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- docs/kunden/agenten-probe.md | grep -c '^-[^-]'` muss 0 ausgeben.
- [x] Der erste Lauf steht im Repo: mindestens eine Zeile im neuen Format, deren Zahlen zu ihren Antworten passen, und der Block aus
      `bash ops/traffic.sh --agents 168` mit seiner Laufzeit, ohne Adresse.
      MVP: Funktion, weil erst die erste Zeile mit `seen` zeigt, ob Agenten uns finden, ohne uns zu nennen.
      Prüfung: `grep -cE '^- [0-9]{4}-W[0-9]{2} [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z model [^ ]+ host [0-5]/5 card [0-5]/5 seen [0-5]/5 old [0-5]/5 failed [0-5]/5 answers docs/kunden/agenten-probe/[0-9]{4}-W[0-9]{2}\.md via (sessions|recount)$' docs/kunden/agenten-probe.md` muss mindestens 1 ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const s=fs.readFileSync("docs/kunden/agenten-probe.md","utf8");const bad=[];const ls=s.split("\n").filter(l=>/^- \d{4}-W\d\d /.test(l));const weeks=new Set();for(const l of ls){const m=l.match(/^- (\d{4}-W\d\d) .* host (\d)\/5 card (\d)\/5 seen (\d)\/5 old (\d)\/5 failed (\d)\/5 answers (\S+) via (sessions|recount)$/);if(!m){bad.push("format");continue}if(weeks.has(m[1]))bad.push("zweimal "+m[1]);weeks.add(m[1]);if(!fs.existsSync(m[7])){bad.push("fehlt "+m[7]);continue}const a=fs.readFileSync(m[7],"utf8");const qs=a.split(/^## q[1-5]\s*$/m).slice(1);if(qs.length!==5)bad.push(m[7]+" fragen "+qs.length);const h=qs.filter(q=>/automatonhost\.com/i.test(q)).length;const f=qs.filter(q=>/^\(failed: /m.test(q)).length;if(h!==+m[2]||f!==+m[6])bad.push(m[7]+" zahlen "+h+"/"+f+" statt "+m[2]+"/"+m[6]);if(+m[3]>h||+m[4]>5-h-f)bad.push(m[7]+" card oder seen zu hoch");if(/postyourprice|cp\.hippe\.eu|0x[0-9a-f]{40}/i.test(a))bad.push(m[7]+" alter host oder adresse")}if(!ls.length)bad.push("keine zeile");console.log(bad.length?bad.join("; "):"woche ok "+ls.length)'` muss `woche ok <n>` mit n mindestens 1 ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("docs/kunden/agenten-probe.md","utf8");const bad=[];const i=s.indexOf("## Abrufe von Agenten");const t=i<0?"":s.slice(i);if(i<0)bad.push("abschnitt");if(!t.includes("bash ops/traffic.sh --agents 168"))bad.push("befehl");const r=t.match(/^Laufzeit: (\d+) s$/m);if(!r)bad.push("laufzeit");else if(+r[1]>120)bad.push("laufzeit "+r[1]);if((t.match(/^-- Agent fetches --$/gm)||[]).length<2)bad.push("block");if(!s.includes("ops/agent-probe.sh --week"))bad.push("kopf");if(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|[0-9a-f]{1,4}(:[0-9a-f]{1,4}){4,}|0x[0-9a-f]{40}|[\u2013\u2014]/i.test(s))bad.push("adresse oder gedankenstrich");console.log(bad.length?bad.join("; "):"woche abrufe ok")'` muss genau `woche abrufe ok` ausgeben.
- [x] Der Wochenlauf steht in `ops/README.md`, und die Entscheidungen stehen in `goals/werbung/ANNAHMEN.md`.
      MVP: Funktion, weil der Richtungs-Check den Lauf nur fahren kann, wenn die zwei Befehle an der Stelle stehen, an der er die Messwerkzeuge liest.
      Prüfung: `node -e 'const s=require("fs").readFileSync("ops/README.md","utf8");const i=s.indexOf("### Weekly run");const t=i<0?"":s.slice(i,i+3000);console.log(i>=0&&t.includes("bash ops/agent-probe.sh --week")&&t.includes("bash ops/traffic.sh --agents 168")?"takt ok":"takt fehlt")'` muss genau `takt ok` ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+, werbung 03: ' goals/werbung/ANNAHMEN.md` muss mindestens 9 ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, nichts unter `src/` ändert sich, kein Test fällt weg, und keine Datei nennt eine
      Adresse oder einen Schlüssel.
      MVP: Funktion, weil ein Messwerkzeug den Dienst nicht berührt und keinen Rollout auslösen darf.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(ops/agent-probe\.sh|ops/traffic\.sh|ops/README\.md|ops/fixtures/agent-probe-claude\.sh|ops/fixtures/agent-probe-strict/q[1-5]\.json|docs/kunden/agenten-probe\.md|docs/kunden/agenten-probe/[0-9]{4}-W[0-9]{2}\.md|test/agent-probe\.test\.ts|test/traffic-agents\.test\.ts|goals/werbung/.*|goals/_vorschlaege/werbung-[a-z0-9-]+\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src deploy mcp harness .github | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test ops docs | wc -l` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- test | grep -cE '^-\s*(it|test)(\.each\([^)]*\))?\('` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- . | perl -CSD -ne 'print if /^\+/ && /0x[0-9a-fA-F]{40}|sk-[A-Za-z0-9_-]{20,}|[\x{2013}\x{2014}]/' | wc -l` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Kritik 1: Steht die Zeile einer Woche im Zustand, aber nicht in der Datei aus `CP_PROBE_OUT`, trägt `--week` sie ohne Session
      nach, für jede Woche im Zustand in aufsteigender Reihenfolge vor der laufenden Woche, und legt die ersetzten Antworten dieser
      Woche aus dem Zustand nach `CP_PROBE_ANSWERS_DIR`, wenn die Datei dort fehlt (eine vorhandene bleibt, wie sie ist). Dafür
      schreibt `--week` die ersetzten Antworten zusätzlich nach `<Zustand>/<JJJJ-Www>/answers.md`.
      MVP: Funktion, weil der Richtungs-Check die Zeile in seinem Worktree schreibt, sein Pflege-PR `docs/kunden/` nicht committen
      darf (`courseRule` in `paperclip/lib/loop-gate.mjs` des code-host) und jeder weitere Aufruf der Woche heute nur die gespeicherte
      Zeile ausgibt: Die Zahl der Woche stünde dann nur noch auf dem code-host und käme nie ins Repo.
      Prüfung: `T=$(mktemp -d); mkdir $T/a $T/b; s="CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-strict CP_PROBE_STATE_DIR=$T/state CP_PROBE_RECORD=$T/rec"; env $s CP_PROBE_OUT=$T/a/p.md CP_PROBE_ANSWERS_DIR=$T/a bash ops/agent-probe.sh --week > /dev/null 2>&1; n=$(wc -c < $T/rec); env $s CP_PROBE_OUT=$T/b/p.md CP_PROBE_ANSWERS_DIR=$T/b bash ops/agent-probe.sh --week > $T/o 2>/dev/null; r=$?; echo "exit=$r $(grep -c '^- ' $T/b/p.md) $([ "$(cat $T/a/p.md)" = "$(cat $T/b/p.md)" ] && echo line) $(cmp -s $T/a/*-W*.md $T/b/*-W*.md && echo answers) $([ "$n" = "$(wc -c < $T/rec)" ] && echo still) $([ "$(tail -n 1 $T/o)" = "$(tail -n 1 $T/b/p.md)" ] && echo printed)"; rm -rf $T` muss genau `exit=0 1 line answers still printed` ausgeben.
      Prüfung: `T=$(mktemp -d); mkdir $T/a $T/b; s="CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-strict CP_PROBE_STATE_DIR=$T/state"; env $s CP_NOW=1795000000 CP_PROBE_OUT=$T/a/p.md CP_PROBE_ANSWERS_DIR=$T/a bash ops/agent-probe.sh --week > /dev/null 2>&1; env $s CP_NOW=1795604800 CP_PROBE_OUT=$T/b/p.md CP_PROBE_ANSWERS_DIR=$T/b bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "exit=$? $(grep -c '^- ' $T/b/p.md) $([ "$(head -n 1 $T/b/p.md)" = "$(cat $T/a/p.md)" ] && echo first) $(tail -n 1 $T/b/p.md | grep -oE '^- [0-9]{4}-W[0-9]{2}|via [a-z]+$' | tr '\n' ' ')$(ls $T/b/*-W*.md | wc -l)"; rm -rf $T` muss genau `exit=0 2 first - 2026-W48 via sessions 2` ausgeben.
      Prüfung: `grep -cF '"carries a week from the state directory into a fresh file without a session"' test/agent-probe.test.ts` muss genau 1 ausgeben, und `PATH=/usr/bin:$PATH pnpm -s vitest run test/agent-probe.test.ts` muss Exit-Code 0 haben.
      Prüfung: `bash ops/agent-probe.sh --selftest 2>&1 | tail -n 1` muss genau `SELFTEST OK` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein Befehl liefert je Woche genau eine vergleichbare Zeile, und jeder weitere Aufruf derselben Woche kostet keine Session.
- [ ] `card` zählt nur, wenn eine Antwort den Weg per Karte bei uns nennt, und `seen` zeigt, wie oft Agenten unseren Hinweis finden, ohne uns zu nennen.
- [ ] Die Abrufe von Agenten lassen sich in Sekunden statt in über 10 Minuten zählen.
- [ ] Rohe Antworten bleiben auf dem code-host, ins Repo kommen nur ersetzte Antworten ohne alten Host und ohne Adresse.
- [ ] Alles, was werbung 02 prüft, bleibt grün.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `.env*`, `*.db`, `*.key`, `*.pem`
- `src/**`, `deploy/**`, `mcp/**`, `skills/**`, `package.json`, `pnpm-lock.yaml`: kein neues Paket, keine Änderung am Dienst
- die fünf Fragen, die Schalter `--questions`, `--selftest` und `--canary` und das Verhalten ohne Schalter von `ops/agent-probe.sh`
  außer der gemeinsamen Wochensperre (Entscheidung 5); die Fixtures `agent-probe-two-hits`, `agent-probe-fails`, `agent-probe-error`
  und `traffic-agent-fetchers.log`: nur lesen
- die bestehenden Blöcke, Fenster, Schalter und der Selbsttest von `ops/traffic.sh`: nur ergänzen, nie ändern;
  `ops/own-ips.sh`, `ops/own-ips.txt`, `ops/access-log.sh`, `ops/crawlers.py`, `ops/crawlers.sh`, `ops/visibility.sh` nur lesen
- bestehende Fälle in `test/agent-probe.test.ts`, `test/traffic-agents.test.ts` und `test/traffic-hosts.test.ts`: nie ändern oder streichen
- `docs/kunden/agenten-probe/2026-W48.md` und jede bestehende Zeile von `docs/kunden/agenten-probe.md`: nie ändern
- `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**`, `docs/kunden/*.md` außer `agenten-probe.md`, bestehende Goal-Dateien und
  Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`, die der Tech Lead entschieden hat
- `~/.claude*`, `~/.config/**`, `~/brain/**`: nie schreiben, keine Anmeldedaten kopieren oder ausgeben; kein `ANTHROPIC_API_KEY`, kein
  `--model`, kein anderer Dienst als die Claude-Code-Anmeldung des code-host; auf dem code-host schreibt das Goal nur unter
  `~/.local/state/control-plane/agent-probe/`
- mehr als ein echter Lauf mit Sessions je Woche, ohne und mit `--week` zusammen; ein Kommentar, Issue oder PR in einem fremden Repo;
  ein Beitrag in einem Forum oder sozialen Netz; bezahlte Werbung
- Cron, Timer, Routinen und Dienste auf dem code-host oder dem Server; ein Rollout oder Neustart durch einen Agent; jeder Wert in
  `/opt/control-plane/.env`; ein POST an die Produktion; Kauf, Wallet-Bewegung, Topup, Gutschrift (`loop-constraints.md`,
  Grundregeln 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-24 Zyklus 1: Punkte 1 bis 10 gebaut: `ops/agent-probe.sh --week` mit strenger Zählung von `card`, neuer Zahl `seen`, eigener Zeile, gemeinsamer Wochensperre, Neuzählung aus vorhandenen Antworten und rohen Antworten unter `~/.local/state/control-plane/agent-probe/`, `ops/traffic.sh --agents`, Fixture `agent-probe-strict`, Selbsttest, 13 neue Testfälle, `### Weekly run`, 11 Annahmen; erster Lauf: 2026-W48 ohne Session neu gezählt (`host 0/5 card 0/5 seen 3/5 old 0/5 failed 0/5 via recount`, q5 zählt nach Entscheidung 3, obwohl sie vor einem „unofficial mirror“ warnt), `bash ops/traffic.sh --agents 168` 8 Abrufe in 38 s (`time`) statt über 10 Minuten. Rot gesehen: alle 13 neuen Fälle gegen die Skripte der Merge-Basis, dazu je eine Mutante je Regel (Teilzeichenkette statt Wort für `card`, `card` ohne Satzbezug, kein `seen`, `seen` trotz `host`, `seen` bei conway.tech, keine Sperre aus dem Zustand, keine rohen Antworten, keine Neuzählung, alte Sperre ohne Schalter, `env` statt `env -i`, altes Zeilenformat) machte genau ihren Fall rot. Prüfungen der DONE-Goals, die `traffic.sh` oder `agent-probe.sh` nennen (24 Befehle aus werbung 02, kunden 04, reichweite 01), an der Merge-Basis und am Kopf gleich im Ergebnis. Prüfbefehle: P1 `exit=0 host 3/5 card 2/5 seen 1/5 old 0/5 failed 0/5`, `exit=0 host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5`, `exit=1 host 0/5 card 0/5 seen 0/5 old 0/5 failed 5/5`, `0`; P2 `1`, `1 still same exit=0 already probed in`, `exit=0 2 still kept host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5 via recount`; P3 `5 1 line 700`, `3`, `0 5 5 0 5`, `0`, `0`; P4 nichts fehlt, vitest Exit 0, `rot`, `SELFTEST OK`, `3`; P5 nichts fehlt, vitest Exit 0, `rot`, `1`; P6 `exit=0 host 2/5 card 1/5 old 1/5 failed 0/5`, `probe ok 1`, `unveraendert`, `0`; P7 `1`, `woche ok 1`, `woche abrufe ok`; P8 `takt ok`, `11`; P9 `0`, `0`, `0`, `0`, `0`; P10 check grün in 203 s (275 Dateien, 2846 Tests).
- 2026-11-24 Zyklus 2: Abschluss gemeldet, Punkte 1 bis 10: dev (53a0cf8) hereingeholt, nur zwei fremde Goal-Dateien aus sandbox, danach jeder Prüfbefehl aller Punkte am Kopf erneut. Prüfbefehle: P1 `exit=0 host 3/5 card 2/5 seen 1/5 old 0/5 failed 0/5`, `exit=0 host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5`, `exit=1 host 0/5 card 0/5 seen 0/5 old 0/5 failed 5/5`, `0`; P2 `1`, `1 still same exit=0 already probed in`, `exit=0 2 still kept host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5 via recount`; P3 `5 1 line 700`, `3`, `0 5 5 0 5`, `0`, `0`; P4 nichts fehlt, vitest Exit 0 (20 Tests), `rot`, `SELFTEST OK`, `3`; P5 nichts fehlt, vitest Exit 0, `rot`, `1`; P6 `exit=0 host 2/5 card 1/5 old 1/5 failed 0/5`, `probe ok 1`, `unveraendert`, `0`; P7 `1`, `woche ok 1`, `woche abrufe ok`; P8 `takt ok`, `11`; P9 `0`, `0`, `0`, `0`, `0`; P10 check grün in 138 s (2846 Tests).
- 2026-11-24 Zyklus 3: Kritik 1 gebaut: `--week` trägt vor allem anderen jede Woche des Zustands bis zur laufenden, die in `CP_PROBE_OUT` fehlt, aufsteigend und ohne Session nach und legt deren ersetzte Antworten aus `<Zustand>/<JJJJ-Www>/answers.md` an, wenn die Datei fehlt; Lauf und Neuzählung schreiben `answers.md` (600) in den Zustand, dazu ein Fall im Selbsttest und eine Annahme. Rot gesehen: der neue Testfall und der Test zur Ablage im Zustand am Kopf vor der Änderung, der Selbsttest mit ausgeschaltetem Nachtrag (`SELFTEST FAILED: a week of the state directory was not carried …`). Prüfbefehle: Kritik 1 `exit=0 1 line answers still printed`, `exit=0 2 first - 2026-W48 via sessions 2`, `1`, vitest Exit 0 (21 Tests), `SELFTEST OK`; Punkte 1 bis 9 unverändert in der Ausgabe (P4 `agent-probe-strict` jetzt `4`); check grün in 218 s.

## Blockers
