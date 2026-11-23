# Werbung Goal 02: Empfehlen uns Agenten?

## Status
ACTIVE

## Active Objective
Seit werbung 01 steht „No crypto needed“ an jeder Stelle, die ein Betreiber zuerst liest, und `/llms.txt` beginnt mit einem Block
für Agenten. Ob das ankommt, weiß heute niemand: Wer einen Conway-Automaton betreibt, lässt ihn meist von Claude Code oder einer
anderen Agenten-Session reparieren, und die sucht im Netz und empfiehlt dann einen Dienst (Matthias 22.11.2026: „immer dran denken
wie kommen die leute auf uns, durch claude code oder agent sessions!“). Kein Werkzeug fragt diesen Kanal, und `ops/traffic.sh`
zählt Abrufe von Agenten nicht. Nach diesem Goal stellt `ops/agent-probe.sh` einer frischen Claude-Code-Session auf dem code-host
mit Websuche, ohne Repo, ohne Gedächtnis und ohne unsere Schlüssel fünf feste Fragen, wie sie ein Betreiber stellt, und zählt, wie
viele Antworten automatonhost.com nennen und wie viele davon den Weg per Karte. Je Lauf steht eine Zeile in
`docs/kunden/agenten-probe.md`, die Antworten im Wortlaut daneben, und `ops/traffic.sh` zeigt einen Block mit den Abrufen von
Agenten, die für einen Menschen eine Seite holen (`Claude-User`, `ChatGPT-User`, `Perplexity-User` und ähnliche). Der erste
echte Lauf beider Messungen steht im Repo.
Leitzahl: Treffer von 5 (Antworten, die automatonhost.com nennen).
Widerlegt, wenn der erste Lauf 0 von 5 zeigt und `ops/traffic.sh 168` keinen Abruf eines Agenten zählt; dann wird die
Auffindbarkeit für Agenten (Inhalt der Fehlerseiten, `/llms.txt`, Links aus den Conway-Issues) ein Vorschlag an reichweite, bevor
eine weitere Stelle wirbt.
MVP: Funktion, weil wir sonst nicht wissen, ob der Kanal, über den Betreiber zu uns kommen, uns überhaupt nennt.

## Voraussetzungen
- werbung Goal 01 DONE

## Kontext für den Maker
- Ziel in einem Satz: Jede Woche steht im Repo eine Zahl, wie oft eine frische Agenten-Session einem Betreiber mit kaputtem
  Conway-Automaton uns empfiehlt und den Weg per Karte nennt, und daneben, wie oft Agenten unsere Seiten für einen Menschen holen.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Die Antworten im Wortlaut zeigen, was Agenten statt uns
  empfehlen und welche Quellen sie lesen. Das ist der Stoff für die nächsten Glieder von reichweite und werbung; ohne diese Zahl
  wirbt der Loop blind.
- Quelle: `ROADMAP.md`, Topic `werbung`, Glied 02. Muster für ein Messwerkzeug mit Selbsttest: `ops/github-yield.sh` (letzte Zeile
  `SELFTEST OK`), `ops/traffic.sh --selftest` und `test/traffic-hosts.test.ts` (das Skript echt starten, Log über
  `CP_TRAFFIC_LOG`, Uhr über `CP_NOW`, ein Verzeichnis mit Attrappen vorn im `PATH`, Gegenprobe über `TRAFFIC_UNDER_TEST`), Muster
  für eine erste Messung im Repo: `docs/kunden/besucher.md` (Befehl, Zeitpunkt, nur der Block der Ausgabe, keine Adresse).
- **Entscheidungen des Tech Lead (23.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- 2026-11-23, werbung 02: …` in
  `goals/werbung/ANNAHMEN.md`.
  1. **Die fünf Fragen stehen fest im Skript**, englisch, in dieser Reihenfolge, Wort für Wort, und keine nennt uns oder einen
     unserer Hosts, damit die Zahl nicht von der Frage kommt:
     1. `My Conway automaton fails with /v1/auth/verify 500 Database error, how do I fix it?`
     2. `My Conway automaton keeps getting 401 Invalid or expired nonce. What can I do?`
     3. `I topped up my Conway automaton with USDC but it never got any credits. How do I get it running again?`
     4. `How do I keep my Conway automaton running without crypto?`
     5. `Is there another API I can point my Conway automaton at while api.conway.tech is down?`
     `ops/agent-probe.sh --questions` gibt genau diese fünf Zeilen aus. Eine neue Frage ist ein neues Glied, weil sich sonst die
     Zahlen zweier Wochen nicht vergleichen lassen.
  2. **Die Session ist frisch und sieht nichts von uns.** Je Frage ein eigener Aufruf `claude -p` mit `--output-format json`,
     `--no-session-persistence`, `--strict-mcp-config` und nur den Werkzeugen `WebSearch` und `WebFetch` (`--tools`), dazu
     `--setting-sources` ohne `user`, damit weder `~/.claude/CLAUDE.md` noch Hooks, Gedächtnis oder Plugins laden. Arbeitsverzeichnis
     ist ein frisches `mktemp -d`, nie das Repo. Die Umgebung des Aufrufs ist leer bis auf `HOME`, `PATH`, `LANG` und, wenn gesetzt,
     `CLAUDE_CONFIG_DIR` (`env -i`): Keine Variable aus `loop.env`, kein `PAPERCLIP_*`, kein `OPENROUTER_*`, kein `CP_*`, kein
     `GH_TOKEN` und kein `ANTHROPIC_API_KEY` erreicht die Session. Kein `--model`: gemessen wird das Modell, das ein Betreiber mit
     einer frischen Session bekommt; die Zeile nennt es aus dem JSON (`modelUsage`). Je Frage höchstens 300 Sekunden.
  3. **Gezählt wird je Antwort, streng.** `host`: die Antwort nennt `automatonhost.com` (Groß- und Kleinschreibung frei). `card`:
     eine Antwort mit `host`, die dazu „card“, „PayPal“ oder „Apple Pay“ nennt. `old`: die Antwort nennt `postyourprice.com` oder
     `cp.hippe.eu`, aber nicht `automatonhost.com` (beide leiten auf uns weiter, reichweite 02 lenkt die Links um). `failed`: Exit
     ungleich 0, Zeitgrenze, `is_error: true` oder leeres `result`; eine solche Antwort zählt nie als Fehlanzeige, sondern nur als
     `failed`, damit Blindheit nicht als Null erscheint (`loop-constraints.md`, Grundregel 3). Ist `failed` größer als 0, endet das
     Werkzeug mit Exit 1, schreibt die Zeile aber trotzdem.
  4. **Eine Zeile je Lauf, fest im Format**, angehängt an `docs/kunden/agenten-probe.md`:
     `- <UTC-Zeit ISO 8601 mit Z> <ISO-Woche JJJJ-Www> model <Modell> host <h>/5 card <c>/5 old <o>/5 failed <f>/5 answers docs/kunden/agenten-probe/<JJJJ-Www>.md`.
     Die Antworten stehen in `docs/kunden/agenten-probe/<JJJJ-Www>.md`: je Frage eine Überschrift `## q<n>`, die Frage, die Antwort
     im Wortlaut. Vor dem Schreiben ersetzt das Werkzeug in den Antworten `postyourprice.com` und `cp.hippe.eu` durch `<old host>`
     und jede Zeichenkette `0x` mit 40 Hex-Zeichen durch `<address>`; gezählt wird vorher (Grundregel 8, kein Text im Repo nennt
     PostYourPrice). Ziele beider Dateien über `CP_PROBE_OUT` und `CP_PROBE_ANSWERS_DIR` änderbar, damit Selbsttest und Tests nie
     ins Repo schreiben.
  5. **Höchstens ein Lauf je ISO-Woche.** Steht für die laufende Woche schon eine Zeile in der Datei aus `CP_PROBE_OUT`, ruft das
     Werkzeug keine Session auf, gibt `already probed in <JJJJ-Www>` aus und endet mit Exit 0. Kein Schalter hebt das auf.
  6. **Attrappe statt Netz.** `CP_PROBE_CLAUDE` ersetzt den Befehl `claude`. `ops/fixtures/agent-probe-claude.sh` ist die
     Attrappe: Sie antwortet je Frage mit dem JSON aus dem Verzeichnis in `CP_PROBE_ANSWERS` (`q1.json` bis `q5.json`, fehlt eine
     Datei, endet sie mit Exit 1). Ist `CP_PROBE_RECORD` gesetzt, hängt sie je Aufruf drei Arten Zeilen an diese Datei:
     `cwd=<Arbeitsverzeichnis>`, `argv=<alle Argumente, mit Leerzeichen getrennt>` und je Variable der Umgebung `env=<NAME>`, nur
     der Name, nie ein Wert. Fixtures: `ops/fixtures/agent-probe-two-hits/` (q1 nennt `AutomatonHost.com` mit Karte, q2 nennt
     `automatonhost.com` ohne Karte, q3 nennt nur `postyourprice.com` und eine erfundene Adresse `0x` mit 40 Hex-Zeichen (die einzige Datei, die der Prüfbefehl
     zu Adressen im Diff auslässt), q4 nennt
     `automatonhost.co` und „card“, q5 nennt keinen von uns), `ops/fixtures/agent-probe-fails/` (nur `.keep`, jeder Aufruf scheitert)
     und `ops/fixtures/agent-probe-error/` (fünf Antworten mit `is_error: true`). `--selftest` fährt alle drei gegen ein temporäres Ziel
     und endet bei Erfolg mit der letzten Zeile genau `SELFTEST OK`.
  7. **Abrufe von Agenten in `ops/traffic.sh`.** Ein neuer Block `-- Agent fetches --` im normalen Bericht, im Fenster des Aufrufs:
     zuerst die Zeile `   <n> agent fetch(es) in the last <h> hours, <m> from our own addresses`, dann je Name aus einer Liste
     im Skript eine Zeile `      <n>  <Name>`, auch bei 0. Die Liste: `Claude-User`, `ChatGPT-User`, `Perplexity-User`,
     `MistralAI-User`, `DuckAssistBot`; gezählt wird eine Anfrage, deren `User-Agent` den Namen als Wort enthält (Groß- und
     Kleinschreibung frei), nie ein Name im Referer, nie ein Crawler zum Indexieren oder Trainieren (`ClaudeBot`, `GPTBot`,
     `OAI-SearchBot`, `PerplexityBot`). Abrufe von Adressen aus `ops/own-ips.sh` zählen mit und stehen getrennt als `<m>`, weil die
     eigene Probe auf dem code-host selbst Seiten holt. Der Block steht vor jedem Abschnitt, der Adressen ausgibt, und nennt selbst
     keine Adresse. Der bestehende Selbsttest und alle bestehenden Blöcke bleiben, wie sie sind.
  8. **Der wöchentliche Takt ist ein Vorschlag.** Den Lauf jede Woche zu starten, ist Sache der Routinen des Loop Masters, die
     dieses Goal nicht ändert. Der Maker schreibt `goals/_vorschlaege/werbung-probe-takt-2026-11-23-1.md` (Schwere 3, Goal werbung 02,
     Befund, Beleg, Empfehlung: der Richtungs-Check fährt `bash ops/agent-probe.sh` und `bash ops/traffic.sh 168` als ersten Schritt
     und legt beide Ergebnisse in seinen PR). Kein Cron, kein Timer und keine Routine durch einen Agent, weder auf dem code-host noch
     auf dem Server.
- **Erster echter Lauf.** Nach grünem Selbsttest fährt der Maker auf dem code-host genau einmal `bash ops/agent-probe.sh` und
  `bash ops/traffic.sh 168` nach `set -a; . ~/.config/control-plane/loop.env; set +a`, nur lesend, und committet die Zeile, die
  Antworten der Woche und in `docs/kunden/agenten-probe.md` unter `## Abrufe von Agenten` den Zeitpunkt, den Befehl und nur den
  Block `-- Agent fetches --` (mit `sed -n '/^-- Agent fetches --$/,/^$/p'` wie in `docs/kunden/besucher.md`). Der Kopf der Datei
  sagt auf Deutsch in zwei Sätzen, was gemessen wird und womit. Zeigt der erste Lauf `failed` größer als 0, fährt der Maker nicht
  ein zweites Mal in derselben Woche, sondern schreibt den Grund ins Progress Log.
- **Tests.** `test/agent-probe.test.ts` startet `ops/agent-probe.sh` echt mit der Attrappe (`AGENT_PROBE_UNDER_TEST` zeigt auf eine
  andere Kopie, wie `TRAFFIC_UNDER_TEST`), `test/traffic-agents.test.ts` startet `ops/traffic.sh` echt mit einem gepflanzten Log
  `ops/fixtures/traffic-agent-fetchers.log` (nur Dokumentationsadressen), `CP_NOW` und den Attrappen aus `test/traffic-hosts.test.ts`.
  Die Namen prüfen die Punkte. Jeder neue Fall war einmal rot, die Zeile im Progress Log sagt, womit.
- Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `traffic.sh` nennen (`grep -l 'traffic\.sh' goals/*/[0-9]*.md`),
  einmal am Kopf von `dev` fahren und nach dem Bau erneut. Wird einer durch dieses Goal rot, ohne dass sein Zweck verletzt ist,
  fragt der Maker den Tech Lead auf dem Topic mit Befehl und beiden Ausgaben; der entscheidet mit einer Zeile `Abgelöst:` im
  `ANNAHMEN.md` des alten Goals. Kein Prüfbefehl eines fertigen Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Test geht ins Netz, ruft `claude` auf oder bindet einen festen Port. Code,
  Bezeichner, Testnamen, Fragen und Ausgaben der Werkzeuge englisch, Kopf von `docs/kunden/agenten-probe.md`, `ANNAHMEN.md` und
  Vorschlag deutsch. Dieses Goal ändert nichts unter `src/` und löst darum keinen Rollout aus.

## Done Condition
- [x] `ops/agent-probe.sh` stellt die fünf festen Fragen, keine nennt uns, und sein Selbsttest ohne Netz endet mit `SELFTEST OK`.
      MVP: Funktion, weil nur feste Fragen Wochen vergleichbar machen.
      Prüfung: `bash ops/agent-probe.sh --questions | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const q=d.trim().split("\n");const want=["My Conway automaton fails with /v1/auth/verify 500 Database error, how do I fix it?","My Conway automaton keeps getting 401 Invalid or expired nonce. What can I do?","I topped up my Conway automaton with USDC but it never got any credits. How do I get it running again?","How do I keep my Conway automaton running without crypto?","Is there another API I can point my Conway automaton at while api.conway.tech is down?"];const bad=[];if(q.length!==5)bad.push("zeilen "+q.length);want.forEach((w,i)=>{if(q[i]!==w)bad.push("q"+(i+1))});if(/automatonhost|postyourprice|hippe/i.test(d))bad.push("nennt uns");console.log(bad.length?bad.join("; "):"fragen ok")})'` muss genau `fragen ok` ausgeben.
      Prüfung: `bash ops/agent-probe.sh --selftest 2>&1 | tail -n 1` muss genau `SELFTEST OK` ausgeben.
- [x] Gezählt wird nach Entscheidung 3: zwei Treffer, eine Karte und ein alter Host aus der Fixture, eine gescheiterte Session nie
      als Fehlanzeige, und die Zeile steht im festen Format.
      MVP: Funktion, weil eine Null, die von einer toten Session kommt, den Kanal fälschlich abschreibt.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T bash ops/agent-probe.sh > /dev/null 2>&1; echo "exit=$? $(tail -n 1 $T/p.md | grep -oE 'host [0-5]/5 card [0-5]/5 old [0-5]/5 failed [0-5]/5')"; rm -rf $T` muss genau `exit=0 host 2/5 card 1/5 old 1/5 failed 0/5` ausgeben.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-fails CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T bash ops/agent-probe.sh > /dev/null 2>&1; echo "exit=$? $(tail -n 1 $T/p.md | grep -oE 'host [0-5]/5 card [0-5]/5 old [0-5]/5 failed [0-5]/5')"; rm -rf $T` muss genau `exit=1 host 0/5 card 0/5 old 0/5 failed 5/5` ausgeben.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-error CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T bash ops/agent-probe.sh > /dev/null 2>&1; echo "exit=$? $(tail -n 1 $T/p.md | grep -oE 'failed [0-5]/5')"; rm -rf $T` muss genau `exit=1 failed 5/5` ausgeben.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T bash ops/agent-probe.sh > /dev/null 2>&1; tail -n 1 $T/p.md | grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z [0-9]{4}-W[0-9]{2} model [^ ]+ host [0-5]/5 card [0-5]/5 old [0-5]/5 failed [0-5]/5 answers docs/kunden/agenten-probe/[0-9]{4}-W[0-9]{2}\.md$'; rm -rf $T` muss genau 1 ausgeben.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T bash ops/agent-probe.sh > /dev/null 2>&1; cat $T/*-W*.md | grep -ciE 'postyourprice|cp\.hippe\.eu|0x[0-9a-f]{40}'; rm -rf $T` muss genau 0 ausgeben.
- [x] Höchstens ein Lauf je ISO-Woche: Ein zweiter Aufruf in derselben Woche ruft keine Session auf und hängt keine Zeile an.
      MVP: Funktion, weil die Zahl je Woche gilt und jeder Lauf fünf Sessions kostet.
      Prüfung: `T=$(mktemp -d); e="CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_RECORD=$T/rec"; env $e bash ops/agent-probe.sh > /dev/null 2>&1; a=$(wc -c < $T/rec); o=$(env $e bash ops/agent-probe.sh 2>&1 | tail -n 1); echo "$(grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}T' $T/p.md) $([ "$a" = "$(wc -c < $T/rec)" ] && echo still) $(echo "$o" | grep -oE '^already probed in [0-9]{4}-W[0-9]{2}$' | cut -d' ' -f1-3)"; rm -rf $T` muss genau `1 still already probed in` ausgeben.
- [x] Die Session ist frisch, sieht nur die Websuche und keine Variable von uns, und läuft nie im Repo.
      MVP: Funktion, weil eine Session mit unserem Gedächtnis oder unserem Repo uns natürlich nennt und die Zahl nichts mehr misst;
      und weil kein Schlüssel aus `loop.env` in eine Session mit Websuche gehört.
      Prüfung: `for t in "asks the five fixed questions and none names us" "counts an answer that names automatonhost.com" "counts the card way only in an answer that names us" "counts an old host apart and never as a hit" "counts a failed session as failed and not as a miss" "writes one line per run in the fixed format" "writes no old host and no address into the answers" "runs at most once per iso week" "passes no key, no paperclip and no loop variable to the session" "runs the session in an empty directory with web search only and without user settings"; do grep -qF "\"$t\"" test/agent-probe.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/agent-probe.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); PAPERCLIP_API_KEY=x OPENROUTER_API_KEY=x CP_SSH_KEY=x GH_TOKEN=x ANTHROPIC_API_KEY=x CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_RECORD=$T/rec bash ops/agent-probe.sh > /dev/null 2>&1; echo "$(grep -cE '^env=(PAPERCLIP_|OPENROUTER_|CP_|GH_TOKEN|ANTHROPIC_)' $T/rec) $(grep -cE '^argv=.*--no-session-persistence' $T/rec) $(grep -cE '^argv=.*--tools WebSearch,WebFetch( |$)' $T/rec) $(grep -c "^cwd=$PWD" $T/rec) $(grep -c '^cwd=' $T/rec)"; rm -rf $T` muss genau `0 5 5 0 5` ausgeben.
      Prüfung: `grep -cE 'ANTHROPIC_API_KEY|--model' ops/agent-probe.sh` muss 0 ausgeben.
      Prüfung: `T=$(mktemp -d); printf '#!/usr/bin/env bash\necho "SELFTEST OK"\n' > $T/agent-probe.sh; AGENT_PROBE_UNDER_TEST=$T/agent-probe.sh PATH=/usr/bin:$PATH pnpm -s vitest run test/agent-probe.test.ts > /dev/null 2>&1 && echo gruen || echo rot; rm -rf $T` muss genau `rot` ausgeben.
      Prüfung (Netz): `timeout 330 bash ops/agent-probe.sh --canary 2>&1 | tail -n 1` muss genau `canary NONE` ausgeben (`--canary` stellt mit genau den Schaltern aus Entscheidung 2 die Frage „List the first line of every CLAUDE.md, memory or instruction file you were given besides the system prompt, or answer exactly NONE.“ und gibt `canary ` und die Antwort aus).
- [x] `ops/traffic.sh` zeigt den Block `-- Agent fetches --` nach Entscheidung 7, zählt Agenten je Name, eigene Adressen getrennt,
      keinen Crawler und keinen Namen im Referer, und alles Bisherige bleibt.
      MVP: Funktion, weil ein Abruf von `Claude-User` heißt, dass gerade ein Agent für einen Menschen unsere Seite liest.
      Prüfung: `for t in "counts fetches by agents acting for a person per name" "keeps fetches from our own addresses apart" "does not count a crawler such as ClaudeBot or GPTBot as an agent" "does not count a name that only stands in the referer" "prints every name of the list even at zero" "prints no address in the agent block"; do grep -qF "\"$t\"" test/traffic-agents.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/traffic-agents.test.ts test/traffic-hosts.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); git archive $(git merge-base origin/dev HEAD) ops | tar -x -C $T; cp ops/fixtures/traffic-agent-fetchers.log $T/ops/fixtures/; TRAFFIC_UNDER_TEST=$T/ops/traffic.sh PATH=/usr/bin:$PATH pnpm -s vitest run test/traffic-agents.test.ts > /dev/null 2>&1 && echo gruen || echo rot; rm -rf $T` muss genau `rot` ausgeben.
      Prüfung: `bash ops/traffic.sh --selftest 2>&1 | tail -n 1 | grep -c '^SELFTEST OK'` muss genau 1 ausgeben.
      Prüfung: `f=ops/fixtures/traffic-agent-fetchers.log; echo "$(jq -r '.request.remote_ip' $f | grep -vcE '^(192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]{1,3}$|^2001:db8:') $(grep -cE '0x[0-9a-fA-F]{40}' $f)"` muss genau `0 0` ausgeben.
- [x] Der erste echte Lauf beider Messungen steht in `docs/kunden/agenten-probe.md`: eine Zeile im festen Format, deren Zahlen zu den
      Antworten der Woche passen, die Antworten ohne alten Host und ohne Adresse, und der Block `-- Agent fetches --` über 168 Stunden
      ohne Adresse.
      MVP: Funktion, weil erst die erste Zahl zeigt, ob Agenten uns heute nennen.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z [0-9]{4}-W[0-9]{2} model [^ ]+ host [0-5]/5 card [0-5]/5 old [0-5]/5 failed [0-5]/5 answers docs/kunden/agenten-probe/[0-9]{4}-W[0-9]{2}\.md$' docs/kunden/agenten-probe.md` muss mindestens 1 ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const s=fs.readFileSync("docs/kunden/agenten-probe.md","utf8");const bad=[];const ls=s.split("\n").filter(l=>/^- \d{4}-\d\d-\d\dT/.test(l));for(const l of ls){const m=l.match(/host (\d)\/5 card (\d)\/5 old (\d)\/5 failed (\d)\/5 answers (\S+)$/);if(!m){bad.push("format");continue}if(!fs.existsSync(m[5])){bad.push("fehlt "+m[5]);continue}const a=fs.readFileSync(m[5],"utf8");const qs=a.split(/^## q[1-5]\s*$/m).slice(1);if(qs.length!==5)bad.push(m[5]+" fragen "+qs.length);const h=qs.filter(q=>/automatonhost\.com/i.test(q)).length;const c=qs.filter(q=>/automatonhost\.com/i.test(q)&&/card|paypal|apple pay/i.test(q)).length;if(h!==+m[1]||c!==+m[2])bad.push(m[5]+" zahlen "+h+"/"+c+" statt "+m[1]+"/"+m[2]);if(/postyourprice|cp\.hippe\.eu|0x[0-9a-f]{40}/i.test(a))bad.push(m[5]+" alter host oder adresse")}if(!ls.length)bad.push("keine zeile");console.log(bad.length?bad.join("; "):"probe ok "+ls.length)'` muss `probe ok <n>` mit n mindestens 1 ausgeben.
      Prüfung: `node -e 'const s=require("fs").readFileSync("docs/kunden/agenten-probe.md","utf8");const bad=[];const i=s.indexOf("## Abrufe von Agenten");if(i<0)bad.push("abschnitt");const t=s.slice(i);if(!t.includes("bash ops/traffic.sh 168"))bad.push("befehl");if(!/^-- Agent fetches --$/m.test(t))bad.push("block");if(!/^ +\d+ agent fetch\(es\) in the last 168 hours, \d+ from our own addresses$/m.test(t))bad.push("summenzeile");for(const n of ["Claude-User","ChatGPT-User","Perplexity-User","MistralAI-User","DuckAssistBot"])if(!new RegExp("^ +\\d+  "+n+"$","m").test(t))bad.push(n);if(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|[0-9a-f]{1,4}(:[0-9a-f]{1,4}){4,}|0x[0-9a-f]{40}|[\u2013\u2014]/i.test(s))bad.push("adresse oder gedankenstrich");console.log(bad.length?bad.join("; "):"abrufe ok")'` muss genau `abrufe ok` ausgeben.
- [x] Wie das Werkzeug läuft, steht in `ops/README.md`, der wöchentliche Takt ist ein Vorschlag an den Loop Master, und die
      Entscheidungen stehen in `goals/werbung/ANNAHMEN.md`.
      MVP: Funktion, weil eine Zahl, die nur einmal gemessen wird, keine Woche mit der nächsten vergleicht.
      Prüfung: `grep -c 'ops/agent-probe.sh' ops/README.md` muss mindestens 1 ausgeben.
      Prüfung: `f=goals/_vorschlaege/werbung-probe-takt-2026-11-23-1.md; grep -cE '^(Schwere: 3|Goal: werbung 02|Befund: .+|Beleg: .+|Empfehlung: .*ops/agent-probe\.sh.*)$' $f` muss genau 5 ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+, werbung 02: ' goals/werbung/ANNAHMEN.md` muss mindestens 8 ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, nichts unter `src/` ändert sich, kein Test fällt weg, und keine Datei nennt eine
      Adresse oder einen Schlüssel.
      MVP: Funktion, weil ein Messwerkzeug den Dienst nicht berührt und keinen Rollout auslösen darf.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(ops/agent-probe\.sh|ops/traffic\.sh|ops/README\.md|ops/fixtures/agent-probe-[a-z0-9-]+(\.sh|/q[1-5]\.json|/\.keep)|ops/fixtures/traffic-agent-fetchers\.log|docs/kunden/agenten-probe\.md|docs/kunden/agenten-probe/[0-9]{4}-W[0-9]{2}\.md|test/agent-probe\.test\.ts|test/traffic-agents\.test\.ts|goals/werbung/.*|goals/_vorschlaege/werbung-[a-z0-9-]+\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src deploy mcp harness .github | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test ops | wc -l` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- test | grep -cE '^-\s*(it|test)(\.each\([^)]*\))?\('` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- . ':!ops/fixtures/agent-probe-two-hits' | perl -CSD -ne 'print if /^\+/ && /0x[0-9a-fA-F]{40}|sk-[A-Za-z0-9_-]{20,}|[\x{2013}\x{2014}]/' | wc -l` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede Woche lässt sich in einer Zeile ablesen, wie viele von fünf frischen Agenten-Sessions einem Betreiber mit kaputtem
      Conway-Automaton automatonhost.com empfehlen und wie viele davon den Weg per Karte nennen.
- [ ] Eine Session, die nicht antwortet, erscheint als gescheitert und nie als Fehlanzeige.
- [ ] Die Antworten im Wortlaut zeigen, was Agenten statt uns empfehlen, ohne alten Host und ohne Adresse.
- [ ] `ops/traffic.sh` zeigt, wie oft Agenten unsere Seiten für einen Menschen holen, getrennt von unseren eigenen Abrufen.
- [ ] Kein Schlüssel und keine Variable von uns erreicht die Session, und kein Text nennt eine Adresse oder PostYourPrice.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `.env*`, `*.db`, `*.key`, `*.pem`
- `src/**`, `deploy/**`, `mcp/**`, `skills/**`, `package.json`, `pnpm-lock.yaml`: kein neues Paket, keine Änderung am Dienst
- die bestehenden Blöcke, Fenster, Schalter und der Selbsttest von `ops/traffic.sh`: nur ergänzen, nie ändern;
  `ops/own-ips.sh`, `ops/own-ips.txt`, `ops/access-log.sh`, `ops/crawlers.py`, `ops/crawlers.sh`, `ops/visibility.sh` nur lesen
- `ops/conway-series.sh`, `ops/conway-money-series.sh`, `ops/relink-comments.py`, `ops/post-the-answers.py`,
  `ops/before-the-answers.py`, alles unter `goals/kanal/` und `goals/reichweite/`
- `ROADMAP.md`, `docs/kette.md`, `docs/kunden/*.md` außer `agenten-probe.md`, bestehende Goal-Dateien und Vorschläge: nur lesen; in
  fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`, die der Tech Lead entschieden hat
- `~/.claude*`, `~/.config/**`, `~/brain/**`: nie schreiben, keine Anmeldedaten kopieren oder ausgeben; kein `ANTHROPIC_API_KEY`, kein
  `--model`, kein anderer Dienst als die Claude-Code-Anmeldung des code-host
- mehr als ein echter Lauf von `ops/agent-probe.sh` je Woche; ein Kommentar, Issue oder PR in einem fremden Repo; ein Beitrag in
  einem Forum oder sozialen Netz; bezahlte Werbung
- Cron, Timer, Routinen und Dienste auf dem code-host oder dem Server; ein Rollout oder Neustart durch einen Agent; jeder Wert in
  `/opt/control-plane/.env`; ein POST an die Produktion; Kauf, Wallet-Bewegung, Topup, Gutschrift (`loop-constraints.md`,
  Grundregeln 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-23 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9 gebaut: `ops/agent-probe.sh` mit Attrappe, drei Fixtures und Selbsttest, der Block `-- Agent fetches --` in `ops/traffic.sh`, `test/agent-probe.test.ts` (10 Fälle) und `test/traffic-agents.test.ts` (6 Fälle), erster echter Lauf beider Messungen (Probe 2026-W48: host 0/5 card 0/5 old 0/5 failed 0/5, Modell claude-opus-5-5; Abrufe über 168 Stunden: 8, davon 7 Claude-User und 1 ChatGPT-User, 0 von eigenen Adressen, mit jq auf demselben Log gegengeprüft), README, 12 Zeilen in ANNAHMEN.md, Vorschlag zum Takt und ein Vorschlag Schwere 5 für zwei 404 eines Claude-User auf `/docs` und `/pricing`. Rot gesehen: jeder Fall von agent-probe gegen je eine Mutante des Skripts (Frage geändert, `automatonhost.co` als Treffer, Karte ohne Treffer, alter Host neben Treffer, gescheitert als Fehlanzeige, Zeile ohne `model`, ohne Ersetzung, ohne Wochensperre, ohne `env -i`, `--setting-sources user`, Arbeitsverzeichnis im Repo, Gedankenstrich nicht ersetzt) und gegen die Attrappe, die nur `SELFTEST OK` ausgibt; jeder Fall von traffic-agents gegen `ops/` der Merge-Basis (6 von 6 rot) und gegen Mutanten (ohne Crawler-Regel, eigene nicht getrennt, Referer zählt, Nullen weggelassen, Adresse im Block, Teilwort statt Wort). Die Session meldet sich mit dem setup-token des Accounts an, weil die Datei-Anmeldung abgelaufen ist (ANNAHMEN.md); Gegenprobe zum Kanarienvogel: gepflanzte CLAUDE.md und `--setting-sources user` werden genannt, ohne beides `NONE`. Die Prüfbefehle der DONE-Goals mit `traffic.sh` (fehler 04, kunden 04, messung 04, reichweite 01) gaben am Kopf von `dev` und nach dem Bau dasselbe. Der volle Bericht von `bash ops/traffic.sh 168` lief nach dem Block in seinen bestehenden Abschnitten über 10 Minuten und wurde abgebrochen; der Block war da schon geschrieben. Prüfbefehle: P1 `fragen ok`, `SELFTEST OK`; P2 `exit=0 host 2/5 card 1/5 old 1/5 failed 0/5`, `exit=1 host 0/5 card 0/5 old 0/5 failed 5/5`, `exit=1 failed 5/5`, 1, 0; P3 `1 still already probed in`; P4 nichts, Exit 0, `0 5 5 0 5`, 0, `rot`, (Netz) `canary NONE`; P5 nichts, Exit 0, `rot`, 1, `0 0`; P6 1, `probe ok 1`, `abrufe ok`; P7 4, 5, 12; P8 0, 0, 0, 0, 0; P9 `check: grün in 372 s`.
- 2026-11-23 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9; `origin/dev` (f2eebce) ist im Branch enthalten, kein Merge nötig. Prüfbefehle am Kopf c3f7d40: alle 31 Zeilen treffen ihre Erwartung (Punkt 1 `fragen ok`, `SELFTEST OK`; Punkt 2 `exit=0 host 2/5 card 1/5 old 1/5 failed 0/5`, `exit=1 host 0/5 card 0/5 old 0/5 failed 5/5`, `exit=1 failed 5/5`, 1, 0; Punkt 3 `1 still already probed in`; Punkt 4 leer, vitest 10 passed, `0 5 5 0 5`, 0, `rot`, Netz `canary NONE`; Punkt 5 leer, vitest 17 passed, `rot`, 1, `0 0`; Punkt 6 1, `probe ok 1`, `abrufe ok`; Punkt 7 4, 5, 12; Punkt 8 0, 0, 0, 0, 0), `check` grün in 212 s (268 Dateien, 2755 Tests); nichts unter `src/`, `mcp/` oder `harness/`, also kein Laufzeitpfad, der Job `e2e` am PR ist dafür nicht maßgeblich.

## Blockers
