# Werbung Goal 04: Die Zeile der Woche kommt durch das Gate

## Status
DONE

## Active Objective
Seit code-host 4e741a19 (PRO-29405) committet der Richtungs-Check die Agenten-Probe der Woche in seinem Pflege-PR kurs. Das Gate
(`courseRule` und `agentProbeGrowth` in `paperclip/lib/loop-gate.mjs` des code-host) nimmt in `docs/kunden/agenten-probe.md` nur
Zeilen an, die hinter der letzten Zeile angehängt sind, das Format `PROBE_LINE` haben und keinen Gedankenstrich tragen, und unter
`docs/kunden/agenten-probe/` nur neue Dateien `<JJJJ-Www>.md`. Zwei Wege von `bash ops/agent-probe.sh --week` brechen das heute:
Fehlt der Datei das Zeilenende am Schluss, klebt die neue Zeile an der letzten alten (das Gate meldet „Zeile geändert“), und liegt
die Antwortdatei der Woche schon im Repo, aber ohne Zeile, fragt `--week` fünf neue Sessions und überschreibt sie (das Gate meldet
„Antworten einer Woche geändert“). Kein Test prüft das, und die erste neue Woche 2026-W49 käme beim Richtungs-Check um den
03.12.2026 sonst abgelehnt zurück. Nach diesem Goal hängt `--week` jede Zeile auf eine eigene Zeile hinter die letzte, ändert keine
bestehende Zeile und keine bestehende Antwortdatei, zählt eine vorhandene Antwortdatei ohne Zeile neu statt zu fragen, und
`### Weekly run` in `ops/README.md` sagt dem Richtungs-Check, was in seinen PR gehört.
Leitzahl: Antworten, die automatonhost.com nennen, von 5, und daneben `seen` von 5, je Woche eine Zeile im Repo.
Widerlegt, wenn der erste Richtungs-Check nach dem Merge seine Zeile der Woche 2026-W49 nicht durch das Gate bekommt.
MVP: Funktion, weil ohne die Zeile im Repo keine Woche mit der vorigen verglichen werden kann.

## Voraussetzungen
- werbung Goal 03 DONE

## Kontext für den Maker
- Ziel in einem Satz: Jede Woche landet die Zeile der Agenten-Probe samt Antworten mit dem Pflege-PR des Richtungs-Checks auf
  `dev`, damit die Zahl der Woche, die zeigt, ob Agenten einem Betreiber mit kaputtem Conway-Automaton automatonhost.com nennen,
  neben der Zahl der Vorwoche steht.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Erst die zweite und dritte Zeile zeigen, ob reichweite 04 und
  die Texte aus werbung 01 die Empfehlung der Agenten bewegen. Eine abgelehnte Zeile kostet eine ganze Woche Messung.
- Quelle: `ROADMAP.md`, Topic `werbung`, Glied 04 (Tech Lead 25.11.2026, PRO-29756). Übernimmt
  `goals/_vorschlaege/werbung-kritik-2026-11-24-1.md`; dazu die Zeile der Watch List in `STATE.md` zu
  `goals/_vorschlaege/werbung-nacharbeit-2026-11-25-1.md` (Testdatei über 500 Zeilen), weil dieses Goal neue Fälle braucht.
- Regel des Gates, Stand code-host d1d1f67b, `paperclip/lib/loop-gate.mjs` Zeilen 472 bis 490: Jede Zeile von vorher steht nachher
  an derselben Stelle (verglichen wird Zeile für Zeile nach Abschneiden genau eines Zeilenendes am Schluss), jede neue Zeile
  erfüllt `PROBE_LINE`, genau
  `/^- \d{4}-W\d{2} \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z model \S.* via (?:sessions|recount)$/`, und trägt weder U+2013 noch U+2014.
  Antwortdateien müssen im PR den Status `added` haben. Die Prüfbefehle unten bilden diese Regel ohne code-host nach.
- Heute gemessen (Tech Lead, 25.11.2026, Skript auf `dev` 2714255): eine Datei ohne Zeilenende am Schluss ergibt `changed 5`
  (Punkt 1, erste Prüfung), eine vorhandene Antwortdatei ohne Zeile ergibt fünf Sessions und eine überschriebene Datei (Punkt 2,
  erste Prüfung), eine unlesbare Antwortdatei ergibt `exit=0 1` und eine überschriebene Datei (Punkt 2, zweite Prüfung). Der
  Nachtrag mehrerer Wochen aus dem Zustand ist schon heute richtig (Punkt 1, zweite Prüfung) und bleibt als Absicherung.
- Muster: `ops/agent-probe.sh` (Nachtrag aus dem Zustand ab dem Block mit `answers.md`, Neuzählung `week_recount`, Anhängen mit
  `printf '%s\n' "$line" >> "$OUT"` an drei Stellen), `test/agent-probe.test.ts` (Aufruf über `AGENT_PROBE_UNDER_TEST`) und
  `goals/werbung/03-probe-jede-woche.md` (Entscheidungen 4 bis 6, Kritik 1, Progress Log).
- **Entscheidungen des Tech Lead (25.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- 2026-11-25, werbung 04: …`
  (Datum des Baus) unter einer neuen Überschrift `## werbung 04: Die Zeile der Woche kommt durch das Gate` in
  `goals/werbung/ANNAHMEN.md`.
  1. **Vor jedem Anhängen ein Zeilenende.** Endet die Datei aus `CP_PROBE_OUT` nicht mit einem Zeilenende, schreibt `--week` vor der
     ersten neuen Zeile genau ein `\n`, an jeder der drei Stellen, die heute anhängen (Nachtrag aus dem Zustand, Neuzählung, Lauf
     mit Sessions). Eine leere oder fehlende Datei bekommt kein Zeilenende vorweg. Keine bestehende Zeile, kein Leerraum und keine
     Leerzeile der Datei ändert sich, auch keine Leerzeilen am Schluss.
  2. **Eine Antwortdatei ohne Zeile wird neu gezählt, nicht neu gefragt.** Liegt `<CP_PROBE_ANSWERS_DIR>/<JJJJ-Www>.md` der laufenden
     Woche, aber weder eine Zeile dieser Woche in `CP_PROBE_OUT` (altes oder neues Format) noch `<Zustand>/<JJJJ-Www>/line`, ruft
     `--week` keine Session auf, zählt die Datei mit `week_recount` wie in werbung 03 (Entscheidung 5 dort) und hängt die Zeile mit
     `via recount` an. Die UTC-Zeit kommt aus der Zeile `Run <UTC>, …` im Kopf der Datei, das Modell ist das häufigste der Zeilen
     `Model: <Modell>` (bei Gleichstand das zuerst genannte), wie im Lauf mit Sessions. Die Antwortdatei bleibt Byte für Byte, wie
     sie ist; Zeile und Kopie der Antworten gehen wie bei jeder Neuzählung nach `<Zustand>/<JJJJ-Www>/line` und `answers.md`.
  3. **Eine unlesbare Antwortdatei hält den Lauf an.** Hat diese Datei nicht genau fünf Abschnitte `## q1` bis `## q5`, schreibt
     `--week` keine Zeile, ruft keine Session auf, lässt die Datei unverändert, gibt auf stderr genau
     `cannot recount <JJJJ-Www>: answers file has <n> of 5 questions` aus und endet mit Exit 1. So sieht der Richtungs-Check den
     Fehler, statt dass eine Woche mit falscher Zahl oder überschriebenen Antworten ins Repo geht.
  4. **Neue Fälle in eine eigene Datei.** `test/agent-probe.test.ts` hat 582 Zeilen und bleibt unverändert; die neuen Fälle stehen in
     `test/agent-probe-week.test.ts` und rufen das Skript über dieselbe Variable `AGENT_PROBE_UNDER_TEST` auf (Watch List,
     `goals/_vorschlaege/werbung-nacharbeit-2026-11-25-1.md`). Das weicht vom Wortlaut der ROADMAP ab, die `test/agent-probe.test.ts`
     nennt; der Zweck bleibt derselbe.
  5. **`PROBE_LINE` als Kopie mit Herkunft.** Die neue Testdatei trägt den Ausdruck aus `paperclip/lib/loop-gate.mjs` Wort für Wort
     als Konstante `PROBE_LINE`, darüber ein Kommentar mit Datei, Repo `PropertyPilotTech/code-host` und Commit `d1d1f67b`, und die
     Prüfung „bestehende Zeilen unverändert, neue Zeilen erfüllen `PROBE_LINE`, kein Gedankenstrich“ als Hilfsfunktion
     `gateAcceptsProbeLog(before, after)` nach `agentProbeGrowth`. Kein Test liest den code-host, weil der Loop ohne ihn prüfbar
     bleiben muss.
  6. **`### Weekly run` sagt, was in den PR gehört.** Neue Absätze unter der bestehenden Überschrift: Der Richtungs-Check committet auf
     seinem Branch `loop/kurs/<YYYY-MM-DD-HHMM>-richtung` die angehängte Zeile in `docs/kunden/agenten-probe.md` und die neue Datei
     `docs/kunden/agenten-probe/<YYYY-Www>.md`, sonst nichts unter `docs/kunden/`; seine Analyse `docs/richtung/<YYYY-MM-DD>.md`
     nennt die Zeile der Woche wörtlich, und der Block aus `bash ops/traffic.sh --agents 168` steht nur in der Analyse, nie in
     `docs/kunden/agenten-probe.md`, weil das Gate dort nur angehängte Zeilen im Format von `--week` annimmt. Endet `--week` mit
     Exit 1, kommt keine Zeile in den PR, und die Analyse nennt die Ausgabe. Bestehende Absätze des Abschnitts bleiben.
- **Tests.** Neue Fälle in `test/agent-probe-week.test.ts` mit genau den Namen aus Punkt 3. Jeder neue Fall war einmal rot: die
  Fälle zu den Entscheidungen 1 bis 3 gegen das Skript der Merge-Basis, die übrigen gegen eine Mutante (etwa Anhängen vor der
  letzten Zeile, eine Zeile mit Gedankenstrich, Überschreiben einer vorhandenen Antwortdatei beim Nachtrag); die Zeile im Progress
  Log sagt, womit. Kein Test geht ins Netz, ruft `claude` auf oder bindet einen festen Port.
- Vor dem Bau die Prüfbefehle von werbung 03 einmal am Kopf von `dev` fahren und nach dem Bau erneut. Wird einer rot, ohne dass sein
  Zweck verletzt ist, fragt der Maker den Tech Lead auf dem Topic mit Befehl und beiden Ausgaben; kein Prüfbefehl eines fertigen
  Goals wird umgeschrieben.
- Kein echter Lauf: Dieses Goal fährt `--week` nur gegen Fixtures in temporären Ordnern. Die Woche 2026-W49 fragt der
  Richtungs-Check, nicht der Maker.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Code, Bezeichner, Testnamen und Ausgaben englisch, `ANNAHMEN.md` deutsch. Dieses Goal
  ändert nichts unter `src/` und löst darum keinen Rollout aus.

## Done Condition
- [x] `--week` hängt jede Zeile auf eine eigene Zeile hinter die letzte, auch wenn der Datei das Zeilenende am Schluss fehlt, und
      ändert dabei keine bestehende Zeile und keine bestehende Antwortdatei, auch nicht beim Nachtrag mehrerer Wochen.
      MVP: Funktion, weil das Gate jede andere Änderung an `docs/kunden/agenten-probe.md` ablehnt und die Woche dann fehlt.
      Prüfung: `T=$(mktemp -d); printf '# Kopf\n\nText.\n\n- 2026-W40 2026-10-01T00:00:00Z model x host 0/5 card 0/5 seen 0/5 old 0/5 failed 0/5 answers docs/kunden/agenten-probe/2026-W40.md via sessions' > $T/p.md; cp $T/p.md $T/b.md; CP_NOW=1795000000 CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-strict CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "exit=$? $(node -e 'const fs=require("fs");const L=t=>{const s=t.replace(/\r?\n$/,"");return s?s.split(/\r?\n/):[]};const a=L(fs.readFileSync(process.argv[1],"utf8")),b=L(fs.readFileSync(process.argv[2],"utf8"));const R=/^- \d{4}-W\d{2} \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z model \S.* via (?:sessions|recount)$/;const at=a.findIndex((l,i)=>b[i]!==l);const bad=b.slice(a.length).filter(l=>!R.test(l)||/[\u2013\u2014]/.test(l)).length;console.log(at>=0?"changed "+(at+1):bad?"bad "+bad:"growth ok "+(b.length-a.length))' $T/b.md $T/p.md)"; rm -rf $T` muss genau `exit=0 growth ok 1` ausgeben.
      Prüfung: `T=$(mktemp -d); mkdir $T/a $T/b; s="CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-strict CP_PROBE_STATE_DIR=$T/state"; env $s CP_NOW=1795000000 CP_PROBE_OUT=$T/a/p.md CP_PROBE_ANSWERS_DIR=$T/a bash ops/agent-probe.sh --week > /dev/null 2>&1; env $s CP_NOW=1795604800 CP_PROBE_OUT=$T/a/p.md CP_PROBE_ANSWERS_DIR=$T/a bash ops/agent-probe.sh --week > /dev/null 2>&1; printf '# Kopf\n\nText mit Absatz.\n\n## Läufe\n\n- 2026-W40 2026-10-01T00:00:00Z model x host 0/5 card 0/5 seen 0/5 old 0/5 failed 0/5 answers docs/kunden/agenten-probe/2026-W40.md via sessions\n' > $T/b/p.md; cp $T/b/p.md $T/b.md; printf 'keep\n' > $T/b/2026-W47.md; env $s CP_NOW=1796209600 CP_PROBE_OUT=$T/b/p.md CP_PROBE_ANSWERS_DIR=$T/b bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "exit=$? $(node -e 'const fs=require("fs");const L=t=>{const s=t.replace(/\r?\n$/,"");return s?s.split(/\r?\n/):[]};const a=L(fs.readFileSync(process.argv[1],"utf8")),b=L(fs.readFileSync(process.argv[2],"utf8"));const R=/^- \d{4}-W\d{2} \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z model \S.* via (?:sessions|recount)$/;const at=a.findIndex((l,i)=>b[i]!==l);const bad=b.slice(a.length).filter(l=>!R.test(l)||/[\u2013\u2014]/.test(l)).length;console.log(at>=0?"changed "+(at+1):bad?"bad "+bad:"growth ok "+(b.length-a.length))' $T/b.md $T/b/p.md) $([ "$(cat $T/b/2026-W47.md)" = keep ] && echo kept) $(ls $T/b/*-W*.md | wc -l)"; rm -rf $T` muss genau `exit=0 growth ok 3 kept 3` ausgeben.
      Prüfung: `T=$(mktemp -d); printf '# Kopf\n\nText.\n\n' > $T/p.md; cp $T/p.md $T/b.md; CP_NOW=1795000000 CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-strict CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "exit=$? $(head -c $(wc -c < $T/b.md) $T/p.md | cmp -s - $T/b.md && echo prefix) $(tail -n 1 $T/p.md | grep -cE '^- 2026-W47 ')"; rm -rf $T` muss genau `exit=0 prefix 1` ausgeben.
- [x] Liegt die Antwortdatei der Woche schon vor, aber keine Zeile, zählt `--week` sie ohne Session neu und lässt sie unverändert;
      eine Antwortdatei ohne fünf Fragen hält den Lauf mit Exit 1 an (Entscheidungen 2 und 3).
      MVP: Funktion, weil ein zweiter Lauf fünf Sessions kostet und eine überschriebene Antwortdatei das Gate ablehnt.
      Prüfung: `T=$(mktemp -d); mkdir $T/a $T/b; s="CP_NOW=1795000000 CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh"; env $s CP_PROBE_ANSWERS=ops/fixtures/agent-probe-two-hits CP_PROBE_OUT=$T/a/p.md CP_PROBE_ANSWERS_DIR=$T/a CP_PROBE_STATE_DIR=$T/as bash ops/agent-probe.sh --week > /dev/null 2>&1; cp $T/a/2026-W47.md $T/b/; printf '# Kopf\n' > $T/b/p.md; env $s CP_PROBE_ANSWERS=ops/fixtures/agent-probe-strict CP_PROBE_OUT=$T/b/p.md CP_PROBE_ANSWERS_DIR=$T/b CP_PROBE_STATE_DIR=$T/bs CP_PROBE_RECORD=$T/rec bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "exit=$? $([ -s $T/rec ] || echo still) $(cmp -s $T/a/2026-W47.md $T/b/2026-W47.md && echo kept) $(tail -n 1 $T/b/p.md | grep -oE '^- 2026-W47 2026-11-18T11:06:40Z model [^ ]+ host [0-5]/5 card [0-5]/5 seen [0-5]/5 old [0-5]/5 failed [0-5]/5|via [a-z]+$' | sed -E 's/^- 2026-W47 [^ ]+ model [^ ]+ //' | paste -sd' ')"; rm -rf $T` muss genau `exit=0 still kept host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5 via recount` ausgeben.
      Prüfung: `T=$(mktemp -d); printf '# Kopf\n' > $T/p.md; printf 'alt\n' > $T/2026-W47.md; CP_NOW=1795000000 CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-strict CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state CP_PROBE_RECORD=$T/rec bash ops/agent-probe.sh --week > $T/o 2>&1; echo "exit=$? $(grep -c '^- ' $T/p.md) $([ -s $T/rec ] || echo still) $([ "$(cat $T/2026-W47.md)" = alt ] && echo kept) $(grep -cE '^cannot recount 2026-W47: answers file has 0 of 5 questions$' $T/o)"; rm -rf $T` muss genau `exit=1 0 still kept 1` ausgeben.
- [x] Je Regel ein Fall in `test/agent-probe-week.test.ts`, die Regel des Gates steht dort als Kopie mit Herkunft, und die neuen
      Fälle sind gegen das Skript der Merge-Basis rot.
      MVP: Funktion, weil eine Regel ohne roten Fall nicht bewiesen ist (`loop-constraints.md`, Grundregel 3).
      Prüfung: `for t in "appends the weekly line on its own line when the log lacks a final newline" "appends only after the last line of a log with prose and headings" "writes only lines that the loop gate accepts as PROBE_LINE" "keeps every existing line and answers file when it carries several weeks" "counts an answers file of the week without a line again instead of asking" "refuses to recount an answers file without five questions"; do grep -qF "\"$t\"" test/agent-probe-week.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -cF '^- \d{4}-W\d{2} \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z model \S.* via (?:sessions|recount)$' test/agent-probe-week.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE 'paperclip/lib/loop-gate\.mjs.*d1d1f67b|d1d1f67b.*paperclip/lib/loop-gate\.mjs' test/agent-probe-week.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c 'gateAcceptsProbeLog' test/agent-probe-week.test.ts` muss mindestens 2 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/agent-probe-week.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); git archive $(git merge-base origin/dev HEAD) ops | tar -x -C $T; AGENT_PROBE_UNDER_TEST=$T/ops/agent-probe.sh PATH=/usr/bin:$PATH pnpm -s vitest run test/agent-probe-week.test.ts > /dev/null 2>&1 && echo gruen || echo rot; rm -rf $T` muss genau `rot` ausgeben.
- [x] `### Weekly run` in `ops/README.md` sagt, was der Richtungs-Check in seinen PR legt (Entscheidung 6), und die Entscheidungen
      stehen in `goals/werbung/ANNAHMEN.md`.
      MVP: Funktion, weil der Richtungs-Check den Wochenlauf aus genau diesem Abschnitt liest.
      Prüfung: `node -e 'const s=require("fs").readFileSync("ops/README.md","utf8");const i=s.indexOf("### Weekly run");const j=s.indexOf("\n#",i+5);const t=i<0?"":s.slice(i,j<0?undefined:j);const need=["loop/kurs/<YYYY-MM-DD-HHMM>-richtung","docs/kunden/agenten-probe/<YYYY-Www>.md","docs/richtung/<YYYY-MM-DD>.md","bash ops/agent-probe.sh --week","bash ops/traffic.sh --agents 168","exit 1"];const miss=need.filter(n=>!t.toLowerCase().includes(n.toLowerCase()));console.log(miss.length?"fehlt: "+miss.join(", "):"pr ok")'` muss genau `pr ok` ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+, werbung 04: ' goals/werbung/ANNAHMEN.md` muss mindestens 6 ausgeben.
- [x] Was werbung 03 prüft, bleibt: Die Fälle und Daten von werbung 02 und 03 sind unverändert und grün, und der Selbsttest läuft.
      MVP: Funktion, weil ein fertiges Goal nicht rot werden darf, nur weil ein neues daneben baut.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/agent-probe.test.ts test/traffic-agents.test.ts` muss Exit-Code 0 haben.
      Prüfung: `bash ops/agent-probe.sh --selftest 2>&1 | tail -n 1` muss genau `SELFTEST OK` ausgeben.
      Prüfung: `T=$(mktemp -d); CP_PROBE_CLAUDE=ops/fixtures/agent-probe-claude.sh CP_PROBE_ANSWERS=ops/fixtures/agent-probe-strict CP_PROBE_OUT=$T/p.md CP_PROBE_ANSWERS_DIR=$T CP_PROBE_STATE_DIR=$T/state bash ops/agent-probe.sh --week > /dev/null 2>&1; echo "exit=$? $(tail -n 1 $T/p.md | grep -oE 'host [0-5]/5 card [0-5]/5 seen [0-5]/5 old [0-5]/5 failed [0-5]/5')"; rm -rf $T` muss genau `exit=0 host 3/5 card 2/5 seen 1/5 old 0/5 failed 0/5` ausgeben.
      Prüfung: `git diff --quiet $(git merge-base origin/dev HEAD) HEAD -- test/agent-probe.test.ts test/traffic-agents.test.ts docs/kunden ops/fixtures goals/werbung/01-karte-zuerst-ueberall.md goals/werbung/02-empfehlen-uns-agenten.md goals/werbung/03-probe-jede-woche.md && echo unveraendert` muss genau `unveraendert` ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, nichts unter `src/` ändert sich, kein Test fällt weg, und keine Datei nennt eine
      Adresse oder einen Schlüssel.
      MVP: Funktion, weil ein Messwerkzeug den Dienst nicht berührt und keinen Rollout auslösen darf.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(ops/agent-probe\.sh|ops/README\.md|test/agent-probe-week\.test\.ts|goals/werbung/.*|goals/_vorschlaege/werbung-[a-z0-9-]+\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src deploy mcp harness .github | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test ops docs | wc -l` muss 0 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- . | perl -CSD -ne 'print if /^\+/ && /0x[0-9a-fA-F]{40}|sk-[A-Za-z0-9_-]{20,}|[\x{2013}\x{2014}]/' | wc -l` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Kritik 1: `### Weekly run` unterscheidet die zwei Wege, auf denen `--week` mit Exit 1 endet. Fallen Sessions aus
      (stderr `<n> of 5 sessions failed; …`), hat `--week` die Zeile mit `failed <n>/5` und die Antwortdatei schon angelegt und die
      Woche im Zustand als gefragt vermerkt; beide gehören wie jede Woche in den PR, weil das Gate die Zeile annimmt und die Woche
      sonst erst eine Woche später über den Nachtrag aus dem Zustand ins Repo kommt oder fehlt, wenn der nächste Lauf einen anderen
      Zustand hat. Nur bei `cannot recount <YYYY-Www>: …` kommt keine Zeile in den PR. Ein Fall in `test/agent-probe-week.test.ts`
      belegt, dass eine Woche mit ausgefallenen Sessions an einer Datei ohne Zeilenende am Schluss eine Zeile ergibt, die das Gate
      annimmt.
      MVP: Funktion, weil der heutige Satz „When `--week` ends with exit 1, no line goes into the PR“ den Richtungs-Check eine
      gemessene Woche zurückhalten lässt, die das Gate annehmen würde (Tech Lead, Kritik 25.11.2026, gemessen mit
      `ops/fixtures/agent-probe-fails` gegen die Datei auf `dev`: Zeile `failed 5/5 … via sessions` angehängt, Exit 1).
      Prüfung: `node -e 'const s=require("fs").readFileSync("ops/README.md","utf8");const i=s.indexOf("### Weekly run");const j=s.indexOf("\n#",i+5);const t=(i<0?"":s.slice(i,j<0?undefined:j)).replace(/\s+/g," ");const miss=["of 5 sessions failed","cannot recount <YYYY-Www>"].filter(n=>!t.includes(n));console.log(miss.length?"fehlt: "+miss.join(", "):t.includes("When `--week` ends with exit 1, no line goes into the PR")?"widerspruch":"exit ok")'` muss genau `exit ok` ausgeben.
      Prüfung: `grep -cF '"keeps a week with failed sessions as a line the gate accepts"' test/agent-probe-week.test.ts` muss genau 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/agent-probe-week.test.ts -t "keeps a week with failed sessions as a line the gate accepts"` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); git archive $(git merge-base origin/dev HEAD) ops | tar -x -C $T; AGENT_PROBE_UNDER_TEST=$T/ops/agent-probe.sh PATH=/usr/bin:$PATH pnpm -s vitest run test/agent-probe-week.test.ts -t "keeps a week with failed sessions as a line the gate accepts" > /dev/null 2>&1 && echo gruen || echo rot; rm -rf $T` muss genau `rot` ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Zeile jeder Woche und ihre Antwortdatei kommen mit dem Pflege-PR des Richtungs-Checks durch das Gate.
- [ ] Keine bestehende Zeile und keine bestehende Antwortdatei ändert sich durch `--week`.
- [ ] Eine Woche, deren Antworten schon im Repo liegen, kostet keine Session.
- [ ] Alles, was werbung 02 und 03 prüfen, bleibt grün.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `.env*`, `*.db`, `*.key`, `*.pem`
- `src/**`, `deploy/**`, `mcp/**`, `skills/**`, `package.json`, `pnpm-lock.yaml`: kein neues Paket, keine Änderung am Dienst
- die fünf Fragen, die Zählregeln von `card`, `seen`, `old` und `failed`, das Format der Zeile von `--week`, die Schalter
  `--questions`, `--selftest` und `--canary` und das Verhalten ohne Schalter von `ops/agent-probe.sh`: nur lesen
- alle Fixtures unter `ops/fixtures/`, `test/agent-probe.test.ts`, `test/traffic-agents.test.ts`, `test/traffic-hosts.test.ts`:
  nie ändern oder streichen
- `ops/traffic.sh` und die übrigen Skripte unter `ops/` außer `ops/agent-probe.sh` und `ops/README.md`: nur lesen
- `docs/kunden/**`, `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**`, bestehende Goal-Dateien und Vorschläge: nur lesen; in
  fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`, die der Tech Lead entschieden hat
- der code-host (`~/work/code-host/**`, auch `paperclip/lib/loop-gate.mjs`): nur lesen; die Regel des Gates ändert dieses Goal nicht
- `~/.claude*`, `~/.config/**`, `~/brain/**`: nie schreiben, keine Anmeldedaten kopieren oder ausgeben; kein `ANTHROPIC_API_KEY`, kein
  `--model`
- jeder echte Lauf mit Sessions, auch `--week` auf dem code-host ohne Fixture; ein Kommentar, Issue oder PR in einem fremden Repo;
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
- 2026-11-25 Zyklus 1: Punkte 1 bis 7 gebaut: `--week` hängt über `append_run_line` an allen drei Stellen jede Zeile auf eine eigene Zeile hinter die letzte, zählt eine Antwortdatei der Woche ohne Zeile ohne Session neu (`via recount`, Zeit aus `Run`, häufigstes Modell) und hält bei einer Antwortdatei ohne `## q1` bis `## q5` mit Exit 1 an; 6 Fälle in `test/agent-probe-week.test.ts` mit `PROBE_LINE` als Kopie aus code-host d1d1f67b und `gateAcceptsProbeLog`, zwei Absätze unter `### Weekly run`, 6 Annahmen. Rot gesehen: Fälle 1, 5 und 6 gegen das Skript der Merge-Basis; Fall 2 gegen eine Mutante, die vor der letzten Zeile einfügt, Fall 3 gegen eine mit Gedankenstrich in der Zeile, Fall 4 gegen eine, die beim Nachtrag eine vorhandene Antwortdatei überschreibt. Die 40 Prüfbefehle von werbung 03 an Merge-Basis und Kopf gleich im Ergebnis, außer den Umfangszählern von werbung 03 (Punkte 9.1 und 9.5 messen den Diff dieses Branches) und einem Fall in `test/agent-probe.test.ts`, den ein Ordner `agent-probe-state-must-not-exist` im Worktree rot machte: Die Gegenprobe von werbung 03 mit dem Skript aus `git archive` legt ihn an, weil der Zustand dann außerhalb von dessen Repo liegt; entfernt, danach grün. Prüfbefehle: P1 `exit=0 growth ok 1`, `exit=0 growth ok 3 kept 3`, `exit=0 prefix 1`; P2 `exit=0 still kept host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5 via recount`, `exit=1 0 still kept 1`; P3 nichts fehlt, `1`, `1`, `13`, vitest Exit 0, `rot`; P4 `pr ok`, `6`; P5 vitest Exit 0, `SELFTEST OK`, `exit=0 host 3/5 card 2/5 seen 1/5 old 0/5 failed 0/5`, `unveraendert`; P6 `0`, `0`, `0`, `0`; P7 check grün in 147 s (280 Dateien, 2880 Tests).
- 2026-11-25 Zyklus 2: Abschluss gemeldet, Punkte 1 bis 7; `dev` ohne neuen Commit seit der Merge-Basis, kein Merge nötig, alle 21 Prüfbefehle am Kopf 1098b68 erneut gefahren. Prüfbefehle: P1 `exit=0 growth ok 1`, `exit=0 growth ok 3 kept 3`, `exit=0 prefix 1`; P2 `exit=0 still kept host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5 via recount`, `exit=1 0 still kept 1`; P3 nichts fehlt, `1`, `1`, `13`, vitest Exit 0 (6 Tests), `rot`; P4 `pr ok`, `6`; P5 vitest Exit 0 (30 Tests), `SELFTEST OK`, `exit=0 host 3/5 card 2/5 seen 1/5 old 0/5 failed 0/5`, `unveraendert`; P6 `0`, `0`, `0`, `0`; P7 check grün in 155 s (280 Dateien, 2880 Tests).
- 2026-11-25 Zyklus 3: Kritik 1 gebaut: `### Weekly run` trennt Exit 1 nach ausgefallenen Sessions (Zeile `failed <n>/5` und neue Antwortdatei gehen in den PR) von `cannot recount <YYYY-Www>` (keine Zeile), der Satz „When `--week` ends with exit 1, no line goes into the PR“ ist ersetzt; neuer Fall `keeps a week with failed sessions as a line the gate accepts` an einer Datei ohne Zeilenende am Schluss, rot gegen das Skript der Merge-Basis (die Zeile klebt an der letzten, `test/agent-probe-week.test.ts:313`); das Skript bleibt unverändert, eine Annahme dazu. Prüfbefehle: P1 bis P6 wie in Zyklus 2 (P3 `14` statt `13`, vitest 7 Tests), P4 `pr ok`, `7`; P7 check grün in 237 s (2881 Tests); P8 `exit ok`, `1`, vitest Exit 0, `rot`.
- 2026-11-25 Zyklus 4: Abschluss gemeldet, Punkte 1 bis 8; `dev` ohne neuen Commit seit der Merge-Basis, alle 25 Prüfbefehle und `check` am Stand von 1d4dc5a gefahren. Prüfbefehle: alle wie erwartet (P1 bis P6 wie in Zyklus 2 mit P3 `14` und vitest 7 Tests, P4 `pr ok`, `7`; P7 check grün in 237 s, 2881 Tests; P8 `exit ok`, `1`, vitest Exit 0, `rot`).
- 2026-11-25 Release: PASS K und B (Zyklus 4), DONE.

## Blockers
