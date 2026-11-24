# Reichweite Goal 04: Unsere Kommentare nennen automatonhost.com beim Namen

## Status
ACTIVE

## Active Objective
Die Agenten-Sessions der ersten Probe finden unseren Hinweis in den Conway-Issues, nennen den Dienst aber nicht und stufen ihn als
Werbung ein (`docs/kunden/agenten-probe/2026-W48.md` Zeilen 23 und 114: „a third-party control plane“, „I'd treat it as a sales
pitch“), die Leitzahl der Probe steht bei 0 von 5. Am 24.11.2026 trägt keiner der 30 Kommentare des Kontos `matthiashippe` in
`Conway-Research/automaton` `automatonhost.com` im ersten Absatz (0 von 30, `gh api -X GET search/issues -f
q='repo:Conway-Research/automaton commenter:matthiashippe'`, dann je Thread die Kommentare des Kontos, erster Absatz bis zur ersten
Leerzeile), und 23 davon nennen den Dienst noch mit den alten Namen `Handsel` oder `PostYourPrice`. `/llms.txt`
nennt den Namen schon in der ersten Zeile (`src/app.ts:2350`). Nach diesem Goal beginnt jeder dieser Kommentare außer vier, in denen er falsch wäre
(Entscheidung 7), mit genau einem neuen Satz, der `automatonhost.com` nennt und einen Grund, den ein Agent ohne unser Wort prüfen kann: Die Runtime bleibt unverändert,
nur `conwayApiUrl` wechselt (Link auf `/llms.txt`), Aufladen per Karte, PayPal oder Apple Pay mit Geld zurück über Digistore24. Die
alten Namen `Handsel` und `PostYourPrice` werden im Fließtext `automatonhost.com`; sonst bleibt jeder Kommentar Zeichen für Zeichen.
Geändert wird über `ops/relink-comments.py` mit einer neuen Art `--name` und neuen Regeln in `ops/relink_rules.py`, freigegeben vom
Tech Lead mit den Werten `sha12` (LOOP.md, Kommentare in fremden Repos), nur per PATCH an eigenen Kommentaren, nur solange der
Notschalter der Karte aus ist. Kein neuer Kommentar. Mitgenommen aus `goals/_vorschlaege/reichweite-nacharbeit-2026-11-24-1.md` und
`-2.md`: ein Test hält den Selftest von `ops/video-record.sh` und die Gleichheit von `MODEL_JS` in `ops/video-record.sh` und
`ops/automaton-live.sh` fest (`ROADMAP.md`, reichweite 04).
Leitzahl: Antworten der Agenten-Probe, die automatonhost.com nennen, von 5 (`bash ops/agent-probe.sh`, Zeile in
`docs/kunden/agenten-probe.md`), gemessen in der ersten ISO-Woche nach dem Ändern.
Widerlegt, wenn die Kommentare den Namen schon heute im ersten Satz tragen (am 24.11.2026 gemessen: 0 von 30, siehe oben); bleibt die
Leitzahl in der Woche nach dem Ändern bei 0 von 5, prüft der Kurs-Check, ob die Sessions unsere Kommentare überhaupt lesen, bevor
weitere Kommentare bearbeitet werden.
MVP: Funktion, weil genau dieser Schritt aus einer gelesenen Seite eine Empfehlung macht.

## Voraussetzungen
- reichweite Goal 03 DONE

## Kontext für den Maker
- Ziel in einem Satz: Eine Agenten-Session, die für einen Betreiber mit kaputtem Conway-Automaton die Issues liest, nennt danach
  `automatonhost.com` als Weg, weil schon der erste Satz unseres Kommentars den Namen und einen Grund trägt, den sie selbst prüfen kann,
  und nirgends steht unter Matthias' Namen ein Satz, der falsch ist oder dem Kommentar darunter widerspricht.
- **Stand nach Neuansatz 1 (24.11.2026).** Gebaut und abgehakt sind Punkte 1, 2, 3, 5, 6 und 7 (Kopf 8ca98b1). Von den 30 Kommentaren
  des Kontos tragen 26 den Satz `LEAD` auf GitHub, freigegeben mit `ok name` auf PRO-29176 und gesendet bei `breaker off`
  (`ops/named-comments.log` 26 Zeilen). Offen sind vier Kommentare, die der Tech Lead nicht freigegeben hat, weil `LEAD` dort falsch
  ist oder dem Kommentar widerspricht:
  - #335 (5804984649): Thread, ob sich ein Automaton selbst trägt; es gibt kein „this“, das Conway beheben könnte, und ein Werbesatz
    über einem Kommentar, der unsere eigenen Nullen offenlegt, wäre der „sales pitch“ der Probe.
  - #373 (5805000566): HOME-Fehler unter Windows in der Runtime; ein anderes `conwayApiUrl` behebt ihn nicht.
  - #385 (5805015103): Der Kommentar nennt den Dienst „irrelevant to your question“ und rät zu lokal.
  - #393 (5742781237): doppelte Aufladungen durch eine neue Nonce je Retry in `x402Fetch`; mit unveränderter Runtime trifft das auch
    uns, „keeps working“ wäre falsch.
- **Neuer Weg: Entscheidung 7 (Tech Lead, 24.11.2026).** Diese vier Kommentare bekommen nie `LEAD`, nur den Namenstausch.
  1. `ops/relink-comments.py` bekommt genau die Zeile `NO_LEAD = frozenset({5742781237, 5804984649, 5805000566, 5805015103})`
     (Kommentar-Ids, aufsteigend). Für eine Id daraus ist der neue Text `rename(relink(body, slug))` statt `name(relink(body, slug))`.
  2. `ops/relink_rules.py` wächst um `rename(body)`: reine Funktion, nur der Tausch `Handsel` und `PostYourPrice` gegen
     `automatonhost.com` im Fließtext nach Entscheidung 2, ohne `LEAD`, jedes andere Zeichen bleibt, ein zweiter Aufruf ändert nichts.
     `name`, `named` und alles aus reichweite 02 bleiben unverändert (Prüfung unter Punkt 1: keine gelöschte Zeile).
  3. Trockenlauf `--name`: Ein Kommentar aus `NO_LEAD`, dessen Text sich durch `rename` noch ändert, steht wie jeder andere mit
     `comment … sha12 <wert>` und den Zeilen `  - <alt>`/`  + automatonhost.com`, nie mit `  + lead`; einer, an dem `rename` nichts
     ändert, steht nicht in der Liste. Die letzte Zählzeile heißt genau
     `name: <k> to change, <u> already named, <x> kept without lead, <a> comments of matthiashippe`, wobei `x` die Kommentare aus
     `NO_LEAD` zählt, an denen nichts mehr zu ändern ist. Vor dem Senden heißt das am 24.11.2026 `2 to change, 26 already named,
     2 kept without lead, 30 comments` (#335 und #385 tragen `Handsel`, #373 und #393 keinen alten Namen und bleiben Zeichen für
     Zeichen).
  4. `--name --send` und `--name --verify` behandeln `NO_LEAD` genauso (Soll-Text `rename`), sonst unverändert; `m` in
     `name verify` zählt auch einen Kommentar aus `NO_LEAD`, an dem `rename` noch etwas ändert.
  5. Zum Markt in #335: Nach dem Tausch steht dort „I run automatonhost.com (https://automatonhost.com), a market where agents compete
     on posted jobs, which is a Conway-compatible control plane underneath“. Das stimmt, weil der Markt unter
     `https://automatonhost.com/v1/status` läuft, wie der Kommentar selbst zeigt; der Tausch ist dort freigabefähig.
  6. Neuer Testfall in `test/relink-comments.test.ts` mit dem Sandkasten: „the name dry run keeps the fixed exceptions without a lead
     and only renames them“ (eine Fixture-Id aus `NO_LEAD` mit `Handsel`, eine ohne alten Namen; erwartet keine Zeile `  + lead`, den
     Tausch und die Zählzeile mit `kept without lead`). Er war einmal rot, die Zeile im Progress Log sagt, womit. Die übrigen Fälle
     bleiben mit Titel und Erwartung; passt ein bestehender Fall wegen der neuen Zählzeile nicht mehr, fragt der Maker auf dem Topic.
- **Reihenfolge.** Entscheidung 7 bauen, die Prüfungen von Punkt 1, 2, 3 und 4 ohne Netz fahren, `check`, Push. Dann der Trockenlauf
  `python3 -I ops/relink-comments.py --name` als Kommentar auf PRO-29176 mit Erwähnung des Tech Lead und die zwei Zeilen
  `  - https://github.com/…#issuecomment-<id> page <slug> sha12 <wert>: <was sich ändert>` unter der neuen Zyklus-Zeile; das Child
  auf `blocked`, Owner Tech Lead. Nach seinem zweiten `ok name` mit den Werten für #335 und #385 einmal `ops/card-breaker.sh` wie in
  Entscheidung 4 (neue Zeile `vor --send` in ANNAHMEN.md), dann `--name --send 2 --approved …` mit genau diesen Werten,
  `--name --verify`, `--verify`, Commit von `ops/named-comments.log`. Die 26 schon gesendeten Kommentare fasst niemand mehr an.
- Keine Fläche der Website ändert sich, deshalb kein SOLL-Bild: `src/**` bleibt unverändert, die Kommentare sind Text in einem
  fremden Repo.
- **Entscheidungen 1 bis 6 (Tech Lead, 24.11.2026) gelten weiter und sind gebaut**, Wortlaut und Grund stehen in
  `goals/reichweite/ANNAHMEN.md`: 1. der Satz `LEAD` in `ops/relink_rules.py`, Wort für Wort wie unten; 2. `name` und `named`;
  3. `ops/relink-comments.py --name` mit Trockenlauf, `--send`, `--verify` und `ops/named-comments.log`, `--verify` ohne `--name` über
  beide Protokolle; 4. gesendet wird nur nach `ops/card-breaker.sh` mit `breaker off`, Ausgabe als Zeile `vor --send` in ANNAHMEN.md,
  bei `breaker on` nicht senden und den Tech Lead auf dem Topic fragen; 5. Freigabe nur per Kommentar des Tech Lead, der mit
  `ok name` beginnt und die Werte `<id>:<sha12>` nennt, ein nach der Freigabe geänderter Kommentar braucht eine neue;
  6. `test/video-record-selftest.test.ts`. Der Maker schreibt Entscheidung 7 mit Grund als Zeile `- <Datum>, reichweite 04: …`
  in `goals/reichweite/ANNAHMEN.md`.

```
If you need it running before Conway fixes this: automatonhost.com, which I run, speaks the same API, so the unchanged runtime keeps working after one changed line, `conwayApiUrl` (https://automatonhost.com/llms.txt), and you can top it up by card, PayPal or Apple Pay with money back through Digistore24.
```

- Tests: Fälle in `test/relink-comments.test.ts` mit dem Sandkasten `test/relink-sandbox.ts` (falsches `gh` auf `PATH`, kein Netz,
  kein Port); die Fixture `test/fixtures/relink/threads.json` darf Kommentare dazubekommen, nur mit erfundenen Texten. Die 17 Fälle aus
  reichweite 02 bleiben mit Titel und Erwartung.
- Nach dem Bau die Prüfbefehle ohne Netz der Goals mit Status `DONE`, die `relink` oder `video-record` nennen
  (`grep -l -E 'relink|video-record' goals/*/[0-9]*.md`), erneut fahren, die mit `(Netz)` nach dem Senden. Wird einer rot, fragt der
  Maker den Tech Lead auf dem Topic mit Befehl und beiden Ausgaben; kein Prüfbefehl eines fertigen Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `python3 -I`, `check` und vitest im Vordergrund mit eigenem
  Timeout, neue Dateien vor dem lokalen `check` stagen. `gh` ist auf dem code-host als `matthiashippe` angemeldet. Code, Bezeichner,
  Testnamen und Ausgaben englisch.

## Done Condition
- [x] `ops/relink_rules.py` hat `LEAD`, `name` und `named` nach Entscheidungen 1 und 2, und die Regeln aus reichweite 02 bleiben
      unverändert.
      MVP: Funktion, weil der erste Satz jedes Kommentars genau dieser geprüfte Satz sein muss und kein anderer Teil des Texts kippen darf.
      Prüfung: `python3 -I -c 'import sys; sys.path.insert(0, "ops"); import relink_rules as r; print(r.LEAD)' | grep -cxF -f - goals/reichweite/04-kommentare-nennen-automatonhost-beim-namen.md` muss mindestens `1` ausgeben.
      Prüfung: `python3 -I -c 'import sys; sys.path.insert(0, "ops"); import relink_rules as r; L = r.LEAD; bad = [x for x in ["automatonhost.com", "which I run", "conwayApiUrl", "https://automatonhost.com/llms.txt", "card, PayPal or Apple Pay", "Digistore24"] if x not in L] + [x for x in ["\n", ". ", "\u2014", "\u2013", "Handsel", "PostYourPrice", "postyourprice", "cp.hippe.eu"] if x in L]; print("lead ok" if not bad and L.endswith(".") else bad)'` muss genau `lead ok` ausgeben.
      Prüfung: `python3 -I -c 'import sys; sys.path.insert(0, "ops"); import relink_rules as r; q = chr(96) * 3; t = chr(96); b = "Your setup is fine.\n\nDisclosure: I run Handsel (https://automatonhost.com/fix), see " + t + "PostYourPrice" + t + ".\n\n" + q + "\nHandsel\n" + q + "\nPostYourPrice, not handsel_notice."; e = r.LEAD + "\n\nYour setup is fine.\n\nDisclosure: I run automatonhost.com (https://automatonhost.com/fix), see " + t + "PostYourPrice" + t + ".\n\n" + q + "\nHandsel\n" + q + "\nautomatonhost.com, not handsel_notice."; n = r.name(b); print(n == e, r.name(n) == n, r.named(n), r.named(b))'` muss genau `True True True False` ausgeben.
      Prüfung: `python3 -I -c 'import sys; sys.path.insert(0, "ops"); import relink_rules as r; b = "Use automatonhost.com, it speaks the API.\n\nI run Handsel."; print(r.name(b) == "Use automatonhost.com, it speaks the API.\n\nI run automatonhost.com.", r.named(b))'` muss genau `True True` ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- ops/relink_rules.py | grep -cE '^-[^-]'` muss `0` ausgeben.
- [x] `ops/relink-comments.py --name` ändert im Trockenlauf nichts, ändert mit `--send` nur freigegebene eigene Kommentare per
      PATCH, liest jeden zurück, schreibt nur `ops/named-comments.log`, postet nie und kennt nur seine Argumente.
      MVP: Funktion, weil unter Matthias' Namen nur der Text erscheinen darf, den der Tech Lead mit seinem Wert freigegeben hat.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relink-comments.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "the name dry run changes nothing and puts the lead in front of every comment without the name" "the name dry run leaves a comment that already names us without a second lead" "replaces Handsel and PostYourPrice in prose and keeps them in code" "the name send patches only the approved comments and reads each one back" "the name send writes named-comments.log and never relinked-comments.log" "the name send refuses when a comment changed since it was approved" "name verify reports every named comment as same and none to change" "relink verify compares a named comment with its newest logged value" "the name mode never posts a new comment" "the dry run changes nothing and prints sha12 for every comment it would change" "verify reports every logged comment as same and no old link left" "exits 1 on an unknown argument before asking GitHub"; do grep -qF "\"$t\"" test/relink-comments.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `python3 -I ops/relink-comments.py --name --sned 3 > /dev/null 2>&1; echo "exit=$?"` muss genau `exit=1` ausgeben.
      Prüfung: `python3 -I ops/relink-comments.py --name --send 1 > /dev/null 2>&1; echo "exit=$?"` muss genau `exit=1` ausgeben.
      Prüfung: `grep -cE '"(-X|--method)", *"POST"|-X POST|--method POST' ops/relink-comments.py` muss `0` ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- ops/relinked-comments.log | wc -l` muss `0` ausgeben.
- [x] Die Art ohne `--name` aus reichweite 02 bleibt, wie sie war: alle 17 Fälle von damals grün und unverändert, und `--verify`
      zählt einen umbenannten Kommentar nicht als `differ`.
      MVP: Funktion, weil das Umbenennen die Links aus reichweite 02 und deren Prüfung nicht brechen darf.
      Prüfung: `B=$(git merge-base origin/dev HEAD); for t in "the dry run changes nothing and prints sha12 for every comment it would change" "keeps every character outside the old links" "points a link in code at the same path on automatonhost.com" "maps the titles of 2026-11-22 to their pages" "leaves comments without an old link alone" "never touches a comment of another account" "refuses --send without --approved" "refuses when the count does not match the approved values" "refuses when a comment changed since it was approved" "skips a comment that already carries the approved text" "patches only the approved comments and reads each one back" "stops with DIFFERS when the read back differs" "writes one log line per patch without an address or a text" "verify reports every logged comment as same and no old link left" "never posts a new comment" "exits 1 on an unknown argument before asking GitHub" "exits 2 when GitHub cannot be read"; do a=$(git show $B:test/relink-comments.test.ts | awk -v t="\"$t\"" 'index($0,t){f=1} f{print} f&&/^  }, T\);$/{exit}' | sha256sum); b=$(awk -v t="\"$t\"" 'index($0,t){f=1} f{print} f&&/^  }, T\);$/{exit}' test/relink-comments.test.ts | sha256sum); [ "$a" = "$b" ] || echo "geändert: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relink-comments.test.ts -t "relink verify compares a named comment with its newest logged value"` muss Exit-Code 0 haben.
- [ ] Jeder Kommentar des Kontos in den Conway-Issues nennt den Dienst nur noch `automatonhost.com`; jeder außer den vier aus
      `NO_LEAD` (Entscheidung 7) beginnt mit dem freigegebenen Satz, die vier tragen ihn nicht; alles Zeichen für Zeichen wie
      freigegeben, gesendet bei ausgeschaltetem Notschalter.
      MVP: Funktion, weil erst der geänderte Text auf GitHub eine Session dazu bringt, uns beim Namen zu nennen, und ein falscher Satz
      unter Matthias' Namen sie zurückhält.
      Prüfung: `grep -cxF 'NO_LEAD = frozenset({5742781237, 5804984649, 5805000566, 5805015103})' ops/relink-comments.py` muss `1` ausgeben.
      Prüfung: `python3 -I -c 'import sys; sys.path.insert(0, "ops"); import relink_rules as r; t = chr(96); b = "No, see below.\n\nDisclosure: I run Handsel (https://automatonhost.com), see " + t + "PostYourPrice" + t + "."; e = "No, see below.\n\nDisclosure: I run automatonhost.com (https://automatonhost.com), see " + t + "PostYourPrice" + t + "."; n = r.rename(b); print(n == e, r.rename(n) == n, r.rename("Data point.\n\nSee https://automatonhost.com.") == "Data point.\n\nSee https://automatonhost.com.")'` muss genau `True True True` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relink-comments.test.ts -t "the name dry run keeps the fixed exceptions without a lead and only renames them"` muss Exit-Code 0 haben.
      Prüfung: `grep -cE '^- [0-9-]+, reichweite 04: Freigabe-Issue name: PRO-[0-9]+$' goals/reichweite/ANNAHMEN.md` muss `1` ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+, reichweite 04: vor --send: card_refunds_60d [0-9]+ shortfall_usd [0-9]+\.[0-9]{2} breaker off$' goals/reichweite/ANNAHMEN.md` muss mindestens `2` ausgeben.
      Prüfung: `grep -cvE '^(#.*|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z comment [0-9]+ issue [0-9]+ page (verify-500-database-error|invalid-or-expired-nonce|credits-never-granted|home) old [0-9a-f]{12} new [0-9a-f]{12})$' ops/named-comments.log` muss `0` ausgeben.
      Prüfung: `grep -cE '^[0-9]{4}-.* comment [0-9]+ ' ops/named-comments.log` muss mindestens `28` ausgeben.
      Prüfung: `grep -cE '^[0-9]{4}-.* comment (5804984649|5805015103) ' ops/named-comments.log` muss mindestens `2` ausgeben.
      Prüfung: `grep -cE '^  - https://github\.com/Conway-Research/automaton/issues/[0-9]+#issuecomment-[0-9]+ page [a-z0-9-]+ sha12 [0-9a-f]{12}: ' goals/reichweite/04-kommentare-nennen-automatonhost-beim-namen.md` muss mindestens `32` ausgeben.
      Prüfung (Netz): `i=$(sed -n 's/^- [0-9-]*, reichweite 04: Freigabe-Issue name: //p' goals/reichweite/ANNAHMEN.md); p=$(grep -E '^[0-9]{4}-' ops/named-comments.log | awk '{print $1"|"$3":"$11}' | paste -sd,); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | P="$p" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const need=(process.env.P||"").split(",").filter(Boolean).map(x=>{const [t,v]=x.split("|");return {t:Date.parse(t),v}});const ok=JSON.parse(d).filter(c=>c.authorAgentId==="93364eca-e519-4b41-815b-c9b82c42f4d4"&&/^ok name\b/.test(c.body));const miss=need.filter(n=>!ok.some(c=>Date.parse(c.createdAt)<n.t&&c.body.includes(n.v))).map(n=>n.v);if(!need.length||miss.length){console.error({ok:ok.length,miss});process.exit(1)}console.log("freigabe ok "+need.length)})'` muss `freigabe ok <n>` mit n mindestens 28 ausgeben.
      Prüfung (Netz): `python3 -I ops/relink-comments.py --name --verify | tail -n 1` muss `name verify: <s> same, 0 differ, 0 to change` mit s mindestens 28 ausgeben.
      Prüfung (Netz): `python3 -I ops/relink-comments.py --name | grep -E '^name: '` muss `name: 0 to change, <u> already named, 4 kept without lead, <a> comments of matthiashippe` mit a mindestens 30 und u gleich a minus 4 ausgeben.
      Prüfung (Netz): `python3 -I ops/relink-comments.py --verify | tail -n 1` muss `relink verify: <s> same, 0 differ, 0 with old links` mit s gleich der Ausgabe von `grep -c '^[0-9]' ops/relinked-comments.log` ausgeben.
      Prüfung (Netz): `gh api -X GET search/issues -f q='repo:Conway-Research/automaton commenter:matthiashippe' -f per_page=100 --jq '.items[].number' | while read -r n; do gh api "repos/Conway-Research/automaton/issues/$n/comments" --paginate --jq '.[] | select(.user.login=="matthiashippe") | "\(.id) \(.body | split("\n\n")[0] | test("^If you need it running before Conway fixes this: automatonhost\\.com"))"'; done | awk '{n++} (($1 ~ /^(5742781237|5804984649|5805000566|5805015103)$/) != ($2 == "false")) {bad++} END {print (bad ? "bad " bad : "ok " n)}'` muss `ok <n>` mit n mindestens 30 ausgeben.
- [x] Ein Test hält den Selftest von `ops/video-record.sh` in beide Richtungen und die Gleichheit von `MODEL_JS` fest, ohne dass
      eines der beiden Skripte sich ändert.
      MVP: Funktion, weil der Wächter gegen Schlüssel im öffentlichen Transkript sonst unbemerkt brechen kann und die Modellwahl gegen
      Claude und Anthropic nur in einer der beiden Dateien gelten könnte.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/video-record-selftest.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "passes its own selftest without network" "fails its selftest when guard lets every line through" "keeps MODEL_JS the same in video-record.sh and automaton-live.sh"; do grep -qF "\"$t\"" test/video-record-selftest.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); mkdir $T/ops; for d in docs src; do ln -s $PWD/$d $T/$d; done; sed '/^guard() {$/,/^}$/c\guard() { cat; }' ops/video-record.sh > $T/ops/video-record.sh; bash $T/ops/video-record.sh --selftest 2>&1 | tail -n 1; rm -rf $T` muss genau `VIDEO RECORD SELFTEST FAIL` ausgeben.
      Prüfung: `bash ops/video-record.sh --selftest 2>&1 | tail -n 1` muss genau `VIDEO RECORD SELFTEST OK` ausgeben.
      Prüfung: `a=$(grep -m1 '^MODEL_JS=' ops/automaton-live.sh); b=$(grep -m1 '^MODEL_JS=' ops/video-record.sh); [ -n "$a" ] && [ "$a" = "$b" ] && echo same || echo differ` muss genau `same` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- ops/video-record.sh ops/automaton-live.sh | wc -l` muss `0` ausgeben.
- [x] Die Entscheidungen stehen in `goals/reichweite/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg,
      kein neues Paket, und nichts im Repo nennt einen Schlüssel, eine Adresse oder einen Namen eines Kunden.
      MVP: Funktion, weil ein späteres Goal wissen muss, welcher Text unter Matthias' Namen steht und warum.
      Prüfung: `grep -cE '^- [0-9-]+, reichweite 04: ' goals/reichweite/ANNAHMEN.md` muss mindestens `8` ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(ops/relink-comments\.py|ops/relink_rules\.py|ops/named-comments\.log|test/relink-[a-z.-]+\.ts|test/fixtures/relink/.*|test/video-record-selftest\.test\.ts|goals/reichweite/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src docs package.json pnpm-lock.yaml ops/relinked-comments.log ops/agent-probe.sh ops/card-breaker.sh ops/post-the-answers.py ops/before-the-answers.py ops/answers_args.py ops/posted-answers.log ops/traffic.sh ops/github-yield.sh ops/error-pages-arrivals.mjs | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss `0` ausgeben.
      Prüfung: `cat ops/named-comments.log ops/relink_rules.py ops/relink-comments.py goals/reichweite/ANNAHMEN.md test/video-record-selftest.test.ts | grep -cE '0x[0-9a-fA-F]{40}|[0-9a-fA-F]{64}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}'` muss `0` ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer in einem Conway-Issue unseren Kommentar liest (außer den vier aus `NO_LEAD`), liest im ersten Satz `automatonhost.com`, dass die Runtime unverändert bleibt
      und nur `conwayApiUrl` wechselt, und dass er per Karte, PayPal oder Apple Pay mit Geld zurück aufladen kann.
- [ ] Kein Kommentar nennt den Dienst noch `Handsel` oder `PostYourPrice`; jeder andere Satz steht wie vorher, und kein neuer
      Kommentar entsteht.
- [ ] Kein Gedankenstrich in neuem Text, kein Name und keine Wallet-Adresse eines Kunden, keine Zahl ohne Messung, nichts zu den
      Bedingungen des Einkaufs bei OpenRouter.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/**`, `docs/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `ops/relinked-comments.log`, `ops/video-record.sh`, `ops/automaton-live.sh`, `ops/agent-probe.sh`, `ops/card-breaker.sh`,
  `ops/post-the-answers.py`, `ops/before-the-answers.py`, `ops/answers_args.py`, `ops/posted-answers.log`, `ops/traffic.sh`,
  `ops/github-yield.sh`, `ops/error-pages-arrivals.mjs`: bleiben unverändert
- `ROADMAP.md`, `docs/kette.md` und die Goal-Dateien anderer Goals; in deren `ANNAHMEN.md` nur Zeilen `Abgelöst:`, die der Tech Lead
  entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- in `Conway-Research/automaton` nur PATCH auf eigene Kommentare nach der Freigabe; kein neuer Kommentar, kein Issue, kein PR, keine
  Reaktion, kein Schließen, kein Löschen; kein anderes fremdes Repo
- Produktion nur über `ops/card-breaker.sh`, einmal je Senden, nur lesend (Entscheidung 4); keine Anfrage an `automatonhost.com`,
  `76.13.144.207` oder den Sandbox-Server, kein Rollout, kein Neustart, nichts von Hand auf einem Server
- `bash ops/agent-probe.sh` läuft nicht in diesem Goal; die Leitzahl misst die nächste Woche der Probe
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Neuansätze
1. 2026-11-24: Ursache: Punkt 4 verlangte `LEAD` vor allen 30 Kommentaren, aber in #335, #373, #385 und #393 ist der Satz falsch oder widerspricht dem Kommentar, also gibt der Tech Lead dort keine Freigabe und der Punkt kann nie kippen; neuer Weg: feste Ausnahme `NO_LEAD` im Werkzeug mit nur dem Namenstausch (`rename`), Punkt 4 zählt 26 mit `LEAD` und 4 ohne, zweite Freigabe nur für die zwei Kommentare mit altem Namen (#335, #385).

## Progress Log
- 2026-11-24 Zyklus 1: Punkte 1, 2, 3, 5, 6, 7 gebaut (`LEAD`, `name`, `named`, `ops/relink-comments.py --name` mit `ops/named-comments.log`, `--verify` über beide Protokolle, `test/video-record-selftest.test.ts`), Trockenlauf `--name` gegen GitHub zur Freigabe von Punkt 4 auf PRO-29176 (30 to change, 0 already named, 30 comments of matthiashippe, je Kommentar unten). Rot gesehen: die 10 neuen Fälle in `test/relink-comments.test.ts` gegen `ops/relink-comments.py` von `dev` (10 failed), „relink verify compares a named comment with its newest logged value“ mit Vergleich nur gegen die eigene Zeile (DIFFERS 9000), die drei Fälle in `test/video-record-selftest.test.ts` mit `guard() { cat; }` in `ops/video-record.sh` und geänderter Zeile `MODEL_JS=`, „fails its selftest when guard lets every line through“ dazu mit wirkungsloser Ersetzung (Selftest OK statt FAIL). Prüfbefehle: Punkt 1 `1`, `lead ok`, `True True True False`, `True True`, `0`; Punkt 2 vitest 27 passed Exit 0, keine Zeile `fehlt:`, `exit=1`, `exit=1`, `0`, `0`; Punkt 3 keine Zeile `geändert:`, vitest `-t` Exit 0; Punkt 5 vitest 3 passed Exit 0, keine Zeile `fehlt:`, `VIDEO RECORD SELFTEST FAIL`, `VIDEO RECORD SELFTEST OK`, `same`, `0`; Punkt 6 `10`, `0`, `0`, `0`, `0`; Punkt 7 `check: grün in 439 s` an ba644d6, Job `check` an PR #424 grün; Prüfbefehle ohne Netz der fertigen Goals, die `relink` oder `video-record` nennen (hosting 06, reichweite 02 und 03, werbung 01 und 02), an `dev` c6b6755 und an ba644d6: 117 gefahren, gleiche Exit-Codes, jede Erwartung an ba644d6 erfüllt, die Netz-Zeilen folgen nach dem Senden. Punkt 4 offen bis `ok name` des Tech Lead.
  - https://github.com/Conway-Research/automaton/issues/447#issuecomment-6835431307 page verify-500-database-error sha12 039a737cf10b: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/443#issuecomment-6769421243 page home sha12 9b0943bfa3b2: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/442#issuecomment-6769384327 page verify-500-database-error sha12 d5fcf6a5488d: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/440#issuecomment-6769349738 page invalid-or-expired-nonce sha12 55b84dbd2959: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/435#issuecomment-6520848825 page verify-500-database-error sha12 82b9dd87b037: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/434#issuecomment-6789427945 page invalid-or-expired-nonce sha12 495fb230d472: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/432#issuecomment-6520875093 page invalid-or-expired-nonce sha12 aa7b8cdaa874: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/430#issuecomment-6789453609 page home sha12 d658d8500b68: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/427#issuecomment-6789479781 page credits-never-granted sha12 429ea2a3627b: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/419#issuecomment-6520901615 page verify-500-database-error sha12 6105f9e9cc05: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/408#issuecomment-6835502716 page verify-500-database-error sha12 6c6125f0827c: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/406#issuecomment-6835466852 page invalid-or-expired-nonce sha12 2d18011c9d64: Satz LEAD als erster Absatz, PostYourPrice wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/393#issuecomment-5742781237 page credits-never-granted sha12 af0ce8e790db: Satz LEAD als erster Absatz, sonst unverändert
  - https://github.com/Conway-Research/automaton/issues/392#issuecomment-5781361252 page invalid-or-expired-nonce sha12 a12bcd170b4e: Satz LEAD als erster Absatz, Handsel wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/390#issuecomment-5748925311 page home sha12 70e3d04036d0: Satz LEAD als erster Absatz, sonst unverändert
  - https://github.com/Conway-Research/automaton/issues/385#issuecomment-5805015103 page home sha12 63cd7eadd92f: Satz LEAD als erster Absatz, Handsel wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/379#issuecomment-5748925721 page verify-500-database-error sha12 1102f099110e: Satz LEAD als erster Absatz, sonst unverändert
  - https://github.com/Conway-Research/automaton/issues/377#issuecomment-5742781149 page verify-500-database-error sha12 8dadaeef387d: Satz LEAD als erster Absatz, sonst unverändert
  - https://github.com/Conway-Research/automaton/issues/376#issuecomment-5781362033 page invalid-or-expired-nonce sha12 4eb0583ad7b9: Satz LEAD als erster Absatz, Handsel wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/373#issuecomment-5805000566 page home sha12 0255d69a3259: Satz LEAD als erster Absatz, sonst unverändert
  - https://github.com/Conway-Research/automaton/issues/372#issuecomment-5781362775 page verify-500-database-error sha12 f3c20f73ab66: Satz LEAD als erster Absatz, Handsel wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/359#issuecomment-5889884681 page invalid-or-expired-nonce sha12 4fad7f5043e1: Satz LEAD als erster Absatz, Handsel wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/356#issuecomment-5889856106 page invalid-or-expired-nonce sha12 5f07d29d65f8: Satz LEAD als erster Absatz, Handsel wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/355#issuecomment-5748924904 page invalid-or-expired-nonce sha12 bb38eb651efb: Satz LEAD als erster Absatz, sonst unverändert
  - https://github.com/Conway-Research/automaton/issues/353#issuecomment-5889830336 page invalid-or-expired-nonce sha12 1657c0d11255: Satz LEAD als erster Absatz, Handsel wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/339#issuecomment-5742781023 page verify-500-database-error sha12 d5938151de0a: Satz LEAD als erster Absatz, sonst unverändert
  - https://github.com/Conway-Research/automaton/issues/335#issuecomment-5804984649 page home sha12 f1fcb524c9e5: Satz LEAD als erster Absatz, Handsel wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/333#issuecomment-5796242563 page invalid-or-expired-nonce sha12 d96028e7c580: Satz LEAD als erster Absatz, Handsel wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/294#issuecomment-5796218247 page home sha12 85d9b5ccc434: Satz LEAD als erster Absatz, Handsel wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/293#issuecomment-5796193319 page credits-never-granted sha12 5b4eaef9d703: Satz LEAD als erster Absatz, Handsel wird automatonhost.com
- 2026-11-24 Zyklus 2: Punkt 4 zum Teil: nach `ok name` des Tech Lead für 26 von 30 Werten (PRO-29176) und `breaker off` die 26 per `--name --send 13 --approved` in zwei Läufen zu je 13 mit genau diesen Werten umbenannt, je Kommentar `read back same`; die vier ohne Freigabe (#335, #373, #385, #393) warten auf den Neuansatz des Tech Lead (feste Ausnahme ohne `LEAD`) und eine zweite Freigabe. Prüfbefehle: `ops/card-breaker.sh` `card_refunds_60d 0 shortfall_usd 0.00 breaker off`; `--name --verify` `name verify: 26 same, 0 differ, 4 to change` (Exit 1); `--verify` `relink verify: 29 same, 0 differ, 0 with old links` bei 29 Zeilen in `ops/relinked-comments.log`; erster Absatz auf GitHub `26 true`, `4 false`; `ops/named-comments.log` 26 Zeilen. Punkt 4 bleibt offen.
- 2026-11-24 Zyklus 1 nach Neuansatz 1: Entscheidung 7 gebaut: `NO_LEAD` in `ops/relink-comments.py`, `rename` in `ops/relink_rules.py` (`name` ruft `rename` auf, keine Zeile gegenüber `dev` gelöscht), neuer Testfall „the name dry run keeps the fixed exceptions without a lead and only renames them“, einmal rot gesehen (ohne Ausnahme stand vor 5804984649 `  + lead`, Assertion test/relink-comments.test.ts:417), dann 28 von 28 grün; die vier bestehenden Erwartungen der Zählzeile tragen jetzt `0 kept without lead`, Frage dazu an den Tech Lead auf PRO-29176. Trockenlauf `python3 -I ops/relink-comments.py --name` am Kopf: `name: 2 to change, 26 already named, 2 kept without lead, 30 comments of matthiashippe`, gegengeprüft durch Ersetzen von `Handsel` im live geholten Text, gleiche Werte. Punkt 4 bleibt offen bis zur zweiten Freigabe.
  Prüfbefehle: alle Prüfungen ohne Netz aus Punkt 1, 2, 3 und 4 wie in der Goal-Datei, grün; `PATH=/usr/bin:$PATH pnpm -s vitest run test/relink-comments.test.ts`; `PATH=/usr/bin:$PATH node scripts/check.mjs`.
  - https://github.com/Conway-Research/automaton/issues/385#issuecomment-5805015103 page home sha12 0f150b32afe5: ohne LEAD, Handsel wird automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/335#issuecomment-5804984649 page home sha12 0e18046ec2fc: ohne LEAD, Handsel wird automatonhost.com

## Blockers
