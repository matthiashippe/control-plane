# Konto Goal 06: Die Seite zum Tageslimit sagt, wofür das Limit gilt

## Status
ACTIVE

## Active Objective
Wer auf dem Handy das Tageslimit hebt, sieht, dass es für sein ganzes Konto gilt, und kein Text aus dem Terminal verspricht ihm etwas
anderes. Heute zeigt der Schritt `limit` den Namen, den das Terminal im Body von `POST /v1/handoff` schickt, und verspricht „only for
<Name>“ (`src/public/limit.ts`), obwohl das Limit für das ganze Konto gilt und ein Konto seit sandbox 08 bis zu zwei Automatons hat;
ein gesteuertes Terminal (auch eine Prompt-Injection) setzt so einen beruhigenden Namen. Zuerst entstehen neue SOLL-Bilder des
Schritts `limit` (390 und 1440 px) mit dem Namen des Kontos und dem Satz „for your account“, abgenommen vom Design Reviewer; dann nimmt
`POST /v1/handoff` für `step: "limit"` keinen `automaton_name` aus dem Body an, und `src/public/limit.ts` baut 1:1 nach dem Bild.
Mit derselben Abnahme bekommen die Handoff-Bilder englische Namen, `summaryLimit` sagt `pictures` statt `images`, und je
SOLL-Werkzeug beweist eine Gegenprobe mit `--check` und gepflanztem Mangel die Zeile des Mangels. Der Fehlerzustand der Seite des
Kontos heißt im Code `failed` statt `fehlgeschlagen` (Grundregel 12). Die Prüfbefehle fertiger Goals, deren Ausgabe sich damit
ändert, stehen als abgelöst in deren `ANNAHMEN.md` (`ROADMAP.md`, konto 06; Grundsatz in `docs/kette.md`, Abschnitt konto).
Widerlegt, wenn nach dem Goal ein Name aus dem Body von `POST /v1/handoff` auf der Seite des Schritts `limit` erscheint.
Übernimmt goals/_vorschlaege/konto-kritik-2026-11-16-2.md, goals/_vorschlaege/seite-kritik-2026-11-16-2.md,
goals/_vorschlaege/seite-nacharbeit-2026-11-16-1.md, goals/_vorschlaege/seite-nacharbeit-2026-11-16-3.md und
goals/_vorschlaege/konto-nacharbeit-2026-11-16-1.md.
MVP: Funktion, weil die Seite, auf der ein zahlender Kunde mit seinem Passkey mehr Geld freigibt, ihm heute eine Grenze verspricht,
die es nicht gibt, und weil ein Text, den das Terminal bestimmt, auf dieser Seite der Angriffsweg einer Prompt-Injection ist.

## Voraussetzungen
- konto Goal 05 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Mensch, der in Claude Code „heb das Tageslimit auf 10 Dollar“ sagt, liest auf dem Handy, dass das neue
  Limit für sein ganzes Konto gilt, unter dem Namen, den sein Konto bei der Anlage bekam, und nichts, was das Terminal ihm in den Text
  schreiben kann.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte):
  1. Zuerst die SOLL-Bilder des Schritts `limit` (Punkt 1) und die Umbenennung der Handoff-Bilder (Punkt 3, nur Dateien, Quellen und
     `ops/soll-*`), Commit, Push. Dann den Design Reviewer auf dem Topic dieses Goals mit allen Bildpfaden (vier neue Limit-Bilder,
     sechs umbenannte Handoff-Bilder) und dem Commit erwähnen und die Zeile `Abnahme-Issue limit-account: PRO-<n>` in
     `docs/soll/README.md` setzen. Bis „SOLL abgenommen“ dasteht, ändert der Maker `src/public/limit.ts` nicht (Punkt 6 prüft das an den
     Zeitstempeln). Die vorhandenen Zeilen `Abnahme-Issue…` bleiben, wie sie sind.
  2. Während der Abnahme die Umbenennung `failed` (Punkt 4), der Server ohne Namen aus dem Body (Punkt 5, ohne `src/public/limit.ts`),
     die Gegenproben (Punkt 2), je Punkt Commit und Push.
  3. Nach der Abnahme die Seite (Punkt 7), dann die abgelösten Prüfbefehle (Punkt 8), Doku und Annahmen (Punkt 9), zuletzt Punkt 10.
- Entscheidungen des Tech Lead (Maker schreibt sie mit Grund unter `## Goal 06` in `goals/konto/ANNAHMEN.md`):
  1. Der Name des Kontos ist `name` der ältesten Zeile in `api_keys` zur Adresse des Kontos (`ORDER BY id LIMIT 1`). Diese Zeile
     entsteht in `finishKonto` (`src/konto/account.ts`) mit dem Namen, den der Mensch beim Anlegen des Kontos auf dem Handy sah;
     spätere Schlüssel aus sandbox 08 tragen Namen von Automatons und zählen nicht. Die Lesefunktion liegt unter `src/konto/`. Fehlt
     ein Name, sagt die Seite nur „your account“.
  2. `POST /v1/handoff` mit `step: "limit"` liest `automaton_name` nicht mehr: Fehlt das Feld, gibt es kein 400 mehr; steht es da,
     wird es ohne Fehler übergangen, damit ein älteres Plugin auf der Maschine des Nutzers weiter funktioniert. Der Handoff speichert
     den Namen des Kontos aus Entscheidung 1. Die Schritte `confirm`, `konto`, `deposit` und `payout` verlangen `automaton_name` wie
     bisher.
  3. `LimitPage` in `src/public/limit.ts` hat `accountName` statt `automatonName`; der Text nennt den Namen nur als Name des Kontos,
     nie als Empfänger einer Grenze. `set_daily_limit` in `mcp/server.mjs` schickt für die Erhöhung kein `automaton_name` mehr, und
     sein Argument `name` entfällt samt Beschreibung. `docs/konto/handoff.md` und `src/public/openapi.ts` sagen, dass der Schritt
     `limit` den Namen des Kontos zeigt.
  4. Die Handoff-Bilder heißen nach ihren Zuständen im Code: `handoff-freigabe` wird `handoff-approve`, `handoff-erledigt` wird
     `handoff-approved`, `handoff-ungueltig` wird `handoff-invalid`, je Bild (390 und 1440) und Quelle unter `docs/soll/src/`. Die PNG
     bleiben Byte für Byte gleich; in den Quellen ändern sich nur der Kommentar in Zeile 2 (`state <name>,`) und in
     `handoff-approve.html` `data-soll="freigabe"` zu `data-soll="approve"`. Danach gibt es `HANDOFF_FILES` und `handoffFile` nicht
     mehr, `HANDOFF_BLOCK_MARKS` ist `["approve"]`, und `summaryHandoff` schreibt `approve top`.
  5. Die Bilder `docs/soll/konto-fehlgeschlagen-*` und ihre Quelle behalten ihren Namen, weil sie unter ihm abgenommen sind. Im Code
     heißt der Zustand `failed`: Route `POST /h/{code}/failed` in `src/handoff/routes.ts`, Zustand und Titel in `src/public/konto.ts`,
     das Formularziel in `src/public/konto-client/main.mjs` samt neu gebautem `konto.js` und `KONTO_STATES` gleich
     `["passkey", "failed"]`. Eine Zuordnung `KONTO_FILES` vom Zustand zum Dateinamen in `ops/soll-assess.mjs` ist die einzige Stelle
     mit `fehlgeschlagen` unter `src/`, `test/`, `mcp/` und `ops/soll-*.mjs` außer `test/state-names.test.ts`, der das Wort in sein
     Muster aufnimmt. Die alte Route gibt es nicht mehr; ein offener Handoff von vor dem Rollout endet nach zehn Minuten von selbst.
  6. `summaryLimit` schreibt `pictures` statt `images`. `ops/soll-money.mjs` und seine Summenzeile `14 images` bleiben unverändert,
     weil konto 08 die SOLL-Werkzeuge ohnehin zusammenlegt.
  7. Alte Prüfbefehle fertiger Goals: Das Audit fährt nachts jeden Prüfbefehl jedes Goals mit Status `DONE`, auch die Zeilen mit
     `(Netz)`, die nur lesen. Prüfbefehle von konto 02, konto 04, konto 05 und seite 03 nennen die alten Dateinamen, `freigabe top`,
     `soll limit: 4 images` oder die Abnahme der Bilder, die dieses Goal ersetzt, und liefern danach eine andere Ausgabe. Entscheidung
     (Tech Lead, 2026-11-17): Diese Punkte sind durch dieses Goal abgelöst. Der Maker führt jeden Prüfbefehl der Goal-Dateien mit
     Status `DONE` unter `goals/konto/` und `goals/seite/` an der Merge-Basis und am Goal-Branch aus (außer Befehlen, die etwas
     verschicken oder live auf echten Daten laufen), und für jeden, dessen Ausgabe sich ändert, steht im `goals/<topic>/ANNAHMEN.md`
     des abgelösten Goals genau eine Zeile dieser Form (die Ausgabe in Backticks, Exit-Code und letzte Zeile von stdout und stderr
     zusammen, etwa `Exit 1, 0`), gesammelt unter einer Überschrift `## Abgelöst durch konto 06 (Maker, <Datum>)`:

     ```
     - Abgelöst: <topic> <NN> Punkt <n> durch konto 06 Punkt <m>, Ausgabe dann genau `Exit <k>, <letzte Zeile>` (Tech Lead, 2026-11-17)
     ```

     `<m>` ist der Punkt dieses Goals, der denselben Zweck mit den neuen Namen prüft (Punkt 1 für die Limit-Bilder, Punkt 3 für die
     Handoff-Bilder, Punkt 6 für die Abnahme, Punkt 7 für die echte Seite). Die Goal-Dateien selbst bleiben eingefroren. Die Zeile im
     Progress Log nennt die Zahl der abgelösten Befehle je Goal.
- Text der Seite: Englisch wie bisher, Beispielwerte unverändert erfunden (Konto `Atlas`, 5.00 auf 10.00 USD), damit die Prüfung der
  Quellen aus konto 04 Punkt 1 grün bleibt. Vorschlag für die Überschriften: „Raise the daily limit of your account to $10.00?“ und
  „Raise the daily limit for your account“, darunter „PostYourPrice can charge up to $10.00 a day for your account Atlas.“; was am Ende
  dasteht, entscheidet die Abnahme. Kein Satz, der eine Grenze an einen Automaton bindet („only for“, „for Atlas“, „Allow Atlas“), und
  kein Wort, das der Nutzer erst übersetzen muss (Liste `LIMIT_WORDS` in `ops/soll-assess.mjs`). Die Blöcke `approve` und `limit`
  bleiben, ebenso die Bausteine des Abschnitts `## Limit /h/{code}` in `docs/soll/README.md` (höchstens drei eigene Klassen).
- Die Geld-Seiten aus konto 05 (`src/public/money.ts`) zeigen weiter den Namen des Automatons; ihr Kommentar nennt `failed` statt
  `fehlgeschlagen`, sonst ändert sich dort nichts.
- Die SOLL-Befehle laufen mit `FONTCONFIG_FILE=~/.config/control-plane/soll-fonts.conf` wie in konto 04 und 05. Ein Prüfbefehl, der nur
  deshalb Mängel meldet, ist ein Umgebungsproblem und steht so im Progress Log.
- Prüfbefehle ohne Netz binden keinen festen Port (`app.request`, kein `serve`), Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und die SOLL-Werkzeuge im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Jeder neue Test war
  einmal rot, die Zeile im Progress Log sagt, womit. API-Schlüssel in Tests sind erfunden und haben nicht die Form `cnwy_k_` gefolgt
  von 16 Zeichen.
- Rollout: `src/**` liegt im Laufzeitpfad, der Merge rollt über `deploy.yml` aus. Das Konto ist in der Produktion heute aus, die Seite
  sehen Kunden erst danach.
- Was danach kommt: konto 07 legt die Regel für Beträge in USDC zusammen, konto 08 den Browser-Treiber der SOLL-Werkzeuge.

## Done Condition
- [x] Die vier SOLL-Bilder des Schritts `limit` kommen aus ihren Quellen, ohne Netz und ohne Mangel, beide Blöcke stehen ganz im
      ersten Bildschirm, beide sagen, dass das Limit für das Konto gilt, und keiner bindet es an einen Automaton.
      MVP: Funktion, weil die Seite nur nach Bild gebaut werden darf und der Mensch vor dem Passkey sehen muss, wofür er mehr Geld
      freigibt.
      Prüfung: `node ops/soll-limit.mjs --check` muss Exit 0 haben und als letzte Zeile `soll limit: 4 pictures, approve top 390=<y> 1440=<y>, limit top 390=<y> 1440=<y>, 0 defects` ausgeben, mit y bei 390 höchstens 844 und bei 1440 höchstens 900.
      Prüfung: `node -e 'const fs=require("fs");for(const z of ["approve","passkey"])for(const w of [390,1440]){const b=fs.readFileSync("docs/soll/limit-"+z+"-"+w+".png");if(b.readUInt32BE(16)!==w){console.error(z,w);process.exit(1)}}console.log("breiten ok")'` muss `breiten ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const bad=[];const blk={approve:"approve",passkey:"limit"};for(const z of ["approve","passkey"]){const s=fs.readFileSync("docs/soll/src/limit-"+z+".html","utf8");const i=s.indexOf("data-soll=\""+blk[z]+"\"");const t=(i<0?"":s.slice(i)).replace(/<style[\s\S]*?<\/style>/g,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ");if(i<0)bad.push(z+" block");if(!/your account/i.test(t))bad.push(z+" your account");if(/only for|for Atlas|Allow Atlas/i.test(t))bad.push(z+" automaton");if(!/Atlas/.test(t))bad.push(z+" kontoname");if(z==="passkey"&&!/for your account/.test(t))bad.push("satz")}if(bad.length){console.error(bad);process.exit(1)}console.log("konto ok")'` muss `konto ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const bad=[];for(const z of ["approve","passkey"]){const s=fs.readFileSync("docs/soll/src/limit-"+z+".html","utf8");const t=s.replace(/<style[\s\S]*?<\/style>/g,"").replace(/<[^>]+>/g," ");if(/<script/i.test(s))bad.push(z+" script");if(!/<h1[ >]/.test(s))bad.push(z+" h1");if(/(src|srcset)="(https?:)?\/\/|<link[^>]+href="(https?:)?\/\/|url\(["\x27]?(https?:)?\/\//.test(s))bad.push(z+" fremde adresse");if(/[\u2013\u2014]/.test(s))bad.push(z+" gedankenstrich");if(/handoff|token|wallet|smart|permission|sepolia|turnkey|\berc|allowance/i.test(t))bad.push(z+" wort");if(!/Atlas/.test(t))bad.push(z+" name")}const a=fs.readFileSync("docs/soll/src/limit-approve.html","utf8");const ua=a.indexOf("data-soll=\"approve\"");const ba=ua<0?"":a.slice(ua);if(ua<0)bad.push("approve fehlt");if(!/<form[^>]+method="post"/i.test(ba))bad.push("form");if(new Set([...ba.matchAll(/<button[^>]*value="([0-9]{2})"/g)].map(m=>m[1])).size!==3)bad.push("drei zahlen");if(!/\$5\.00/.test(ba)||!/\$10\.00/.test(ba))bad.push("altes und neues limit");const p=fs.readFileSync("docs/soll/src/limit-passkey.html","utf8");const up=p.indexOf("data-soll=\"limit\"");const bp=up<0?"":p.slice(up);if(up<0)bad.push("limit fehlt");if(!/<button/i.test(bp))bad.push("knopf");if(!/passkey/i.test(bp))bad.push("wort passkey");if(!/\$10\.00/.test(bp))bad.push("neues limit");if(bad.length){console.error(bad);process.exit(1)}console.log("quellen ok")'` muss `quellen ok` ausgeben.
      Prüfung: `node -e 'const fs=require("fs");const css=(fs.readFileSync("src/public/index.html","utf8").match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join("");const q=String.fromCharCode(96);const r=fs.readFileSync("docs/soll/README.md","utf8");const m=r.match(/^## Limit \/h\/\{code\}$([\s\S]*?)(?=^## |$(?![\s\S]))/m);const sec=m?m[1]:"";const cl=new Set();for(const z of ["approve","passkey"]){const s=fs.readFileSync("docs/soll/src/limit-"+z+".html","utf8");for(const x of s.matchAll(/class="([^"]+)"/g))for(const c of x[1].split(/\s+/))if(c)cl.add(c)}const neu=[...cl].filter(c=>!new RegExp("\\."+c.replace(/[.*+?^${}()|[\]\\-]/g,"\\$&")+"(?![\\w-])").test(css));const ohne=neu.filter(c=>!r.includes(q+"."+c+q));const eigen=[...sec.matchAll(new RegExp(q+"\\.([A-Za-z0-9_-]+)"+q,"g"))].length;if(!m||ohne.length||eigen>3){console.error({neu,ohne,eigen});process.exit(1)}console.log("bausteine ok neu="+eigen)'` muss `bausteine ok neu=<n>` mit n höchstens 3 ausgeben.
- [x] Jedes der vier SOLL-Werkzeuge `ops/soll.mjs`, `ops/soll-handoff.mjs`, `ops/soll-konto.mjs` und `ops/soll-limit.mjs` lehnt mit
      `--check` einen gepflanzten Mangel ab und nennt ihn in einer eigenen Zeile, die Auswertungen bestehen ihre Tests, und Startseite,
      Geld-Seiten und Konto-Bilder bleiben unverändert.
      MVP: Funktion, weil die Gegenproben aus seite 01 Punkt 6, konto 02 Punkt 4 und konto 03 Punkt 4 seit seite 03 nur noch an einem
      unbekannten Argument scheitern und das Audit seitdem keinen Mangel eines SOLL-Bilds mehr beweist (Vorschlag
      seite-nacharbeit-2026-11-16-3).
      Prüfung: `T=$(mktemp -d); sed 's/tops up \$5 of credit/tops up $9 of credit/' docs/soll/src/startseite.html > $T/s.html; node ops/soll.mjs --check --source $T/s.html > $T/out 2>&1; echo "exit=$?" >> $T/out; grep -cE '^(soll: defect (390|1440): [0-9]+ pixels differ from a fresh render|exit=1)$' $T/out` muss `3` ausgeben.
      Prüfung: `T=$(mktemp -d); cp docs/soll/src/handoff-*.html $T/; sed -i '0,/<h1>/s/<h1>/<h1>X /' $T/handoff-approve.html; grep -q '<h1>X ' $T/handoff-approve.html || echo sed-miss; node ops/soll-handoff.mjs --check --source $T > $T/out 2>&1; echo "exit=$?" >> $T/out; grep -cE '^(soll handoff: defect approve (390|1440): [0-9]+ pixels differ from a fresh render|exit=1)$' $T/out` muss `3` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `T=$(mktemp -d); cp docs/soll/src/konto-*.html $T/; sed -i '0,/<h1>/s/<h1>/<h1>X /' $T/konto-passkey.html; grep -q '<h1>X ' $T/konto-passkey.html || echo sed-miss; node ops/soll-konto.mjs --check --source $T > $T/out 2>&1; echo "exit=$?" >> $T/out; grep -cE '^(soll konto: defect passkey (390|1440): [0-9]+ pixels differ from a fresh render|exit=1)$' $T/out` muss `3` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `T=$(mktemp -d); cp docs/soll/src/limit-*.html $T/; sed -i '0,/<h1>/s/<h1>/<h1>X /' $T/limit-passkey.html; grep -q '<h1>X ' $T/limit-passkey.html || echo sed-miss; node ops/soll-limit.mjs --check --source $T > $T/out 2>&1; echo "exit=$?" >> $T/out; grep -cE '^(soll limit: defect passkey (390|1440): [0-9]+ pixels differ from a fresh render|exit=1)$' $T/out` muss `3` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/soll.test.ts test/soll-handoff.test.ts test/soll-konto.test.ts test/soll-limit.test.ts test/soll-money.test.ts test/soll-flags.test.ts test/state-names.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- docs/soll ':!docs/soll/README.md' ':!docs/soll/limit-*' ':!docs/soll/src/limit-*' ':!docs/soll/handoff-*' ':!docs/soll/src/handoff-*' ops/soll.mjs ops/soll-live.mjs ops/soll-money.mjs ops/soll-live-money.mjs test/soll.test.ts test/soll-money.test.ts && echo bestand gleich` muss `bestand gleich` ausgeben.
      Prüfung: `node ops/soll.mjs --check` muss Exit 0 haben und als letzte Zeile `soll: 2 pictures, move top 390=<y> 1440=<y>, 0 defects` ausgeben.
- [x] Die Handoff-Bilder tragen die Namen ihrer Zustände im Code, Byte für Byte die abgenommenen Bilder, und im Code steht keiner der
      drei deutschen Namen mehr.
      MVP: Funktion, weil Grundregel 12 ausnahmslos gilt und jede Linse heute zwei Namen für denselben Zustand pflegt (Vorschlag
      seite-nacharbeit-2026-11-16-1).
      Prüfung: `B=$(git merge-base origin/dev HEAD); for p in freigabe:approve erledigt:approved ungueltig:invalid; do o=${p%:*}; n=${p#*:}; git show $B:docs/soll/src/handoff-$o.html | sed "s/state $o,/state $n,/; s/data-soll=\"$o\"/data-soll=\"$n\"/" | cmp -s - docs/soll/src/handoff-$n.html || echo "quelle $n"; for w in 390 1440; do git show $B:docs/soll/handoff-$o-$w.png | cmp -s - docs/soll/handoff-$n-$w.png || echo "bild $n $w"; test -e docs/soll/handoff-$o-$w.png && echo "alt $o $w"; done; test -e docs/soll/src/handoff-$o.html && echo "alt $o"; done; echo fertig` muss genau `fertig` ausgeben.
      Prüfung: `node ops/soll-handoff.mjs --check` muss Exit 0 haben und als letzte Zeile `soll handoff: 6 pictures, approve top 390=<y> 1440=<y>, 0 defects` ausgeben, mit y bei 390 höchstens 844 und bei 1440 höchstens 900.
      Prüfung: `git grep -nwE 'freigabe|erledigt|ungueltig' -- src test mcp 'ops/soll-*.mjs' ':!test/state-names.test.ts' | wc -l` muss `0` ausgeben.
      Prüfung: `git grep -nE 'HANDOFF_FILES|handoffFile' -- src test mcp ops | wc -l` muss `0` ausgeben.
- [x] Der Fehlerzustand der Seite des Kontos heißt im Code `failed`, `fehlgeschlagen` steht nur noch in der einen Zuordnung zu den
      Dateinamen der abgenommenen Bilder, und der Wächtertest wird rot, sobald die alte Route zurückkommt. Der Test war vor dem Fix rot.
      MVP: Funktion, weil Grundregel 12 ausnahmslos gilt und die Umbenennung in konto 04 diesen Zustand ausließ (Vorschlag
      konto-nacharbeit-2026-11-16-1).
      Prüfung: `git grep -nw fehlgeschlagen -- src test mcp 'ops/soll-*.mjs' ':!ops/soll-assess.mjs' ':!test/state-names.test.ts' | wc -l` muss `0` ausgeben.
      Prüfung: `git grep -hw fehlgeschlagen -- ops/soll-assess.mjs | grep -vc KONTO_FILES` muss `0` ausgeben.
      Prüfung: `git grep -hw fehlgeschlagen -- ops/soll-assess.mjs | wc -l` muss `1` oder `2` ausgeben.
      Prüfung: `grep -c '"/h/:code/failed"' src/handoff/routes.ts` muss mindestens `1` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's#"/h/:code/failed"#"/h/:code/fehlgeschlagen"#' $T/src/handoff/routes.ts; grep -q '"/h/:code/fehlgeschlagen"' $T/src/handoff/routes.ts || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/state-names.test.ts >/dev/null 2>&1); echo "exit=$?"` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/state-names.test.ts test/konto-account.test.ts test/konto-client.test.ts test/konto-signature-retry.test.ts test/soll-konto.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git grep -nE '/h/\{code\}/fehlgeschlagen|/h/:code/fehlgeschlagen' -- docs/konto mcp README.md src | wc -l` muss `0` ausgeben.
- [x] Der Schritt `limit` zeigt den Namen des Kontos und nimmt keinen Namen aus dem Body an; `set_daily_limit` schickt keinen. Der Test
      war vor dem Fix rot.
      MVP: Funktion, weil an diesem Punkt die Widerlegung des Goals hängt: Ein Text aus dem Terminal darf auf der Seite, auf der der
      Kunde mit dem Passkey mehr Geld freigibt, nicht erscheinen (Vorschlag konto-kritik-2026-11-16-2).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-limit-account.test.ts test/konto-limit.test.ts test/handoff-api.test.ts test/handoff-page.test.ts test/mcp-automaton.test.ts test/konto-signature-retry.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-limit-account.test.ts` muss mindestens 5 ausgeben (je ein Fall: `step: "limit"` mit `automaton_name` gleich `Trust me` ergibt 201, und weder der Zustand `approve` noch nach der richtigen Zahl der Zustand `passkey` von `/h/{code}` enthält `Trust me`, beide enthalten den Namen des Kontos aus der ältesten Zeile in `api_keys`; derselbe Schritt ohne `automaton_name` ergibt 201; ein Konto mit einem zweiten, jüngeren Schlüssel unter anderem Namen zeigt weiter den Namen des ersten; der Zustand `passkey` enthält `for your account` und nicht `only for`; der Body, den `set_daily_limit` aus `mcp/server.mjs` an `POST /v1/handoff` schickt, hat kein `automaton_name`, und `step: "konto"` ohne `automaton_name` ergibt weiter 400).
      Prüfung: `grep -c 'only for' src/public/limit.ts` muss `0` ausgeben.
      Prüfung: `grep -c 'automatonName' src/public/limit.ts` muss `0` ausgeben.
- [x] Der Design Reviewer hat die neuen Limit-Bilder und die umbenannten Handoff-Bilder abgenommen, bevor sich `src/public/limit.ts`
      änderte.
      MVP: Funktion, weil die Seite 1:1 nach einem abgenommenen Bild entsteht und nicht nach einer Beschreibung.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue limit-account: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- 'docs/soll/limit-*.png' 'docs/soll/src/limit-*.html' 'docs/soll/handoff-*.png' 'docs/soll/src/handoff-*.html'); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/public/limit.ts | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok)<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [x] Die echte Seite ist in beiden Zuständen des Schritts `limit` pixelgleich mit den neuen Bildern, eine geänderte Überschrift fällt
      dabei auf, und Handoff, Konto (mit `failed`) und Geld bleiben pixelgleich mit ihren Bildern.
      MVP: Funktion, weil der Mensch auf dem Handy sehen muss, was das Bild verspricht, bevor er ein höheres Limit erlaubt.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-limit.mjs --out $T && node ops/soll-limit.mjs --check --source $T` muss Exit 0 haben und als letzte Zeile `soll limit: 4 pictures, approve top 390=<y> 1440=<y>, limit top 390=<y> 1440=<y>, 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i '0,/<h1>/s/<h1>/<h1>X /' $T/src/public/limit.ts; grep -q '<h1>X ' $T/src/public/limit.ts || echo sed-miss; (cd $T && node --import tsx ops/soll-live-limit.mjs --out $T/out); node ops/soll-limit.mjs --check --source $T/out; echo "exit=$?"` muss als letzte Zeile `exit=1` ausgeben und darf `sed-miss` nicht ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-handoff.mjs --out $T && node ops/soll-handoff.mjs --check --source $T` muss Exit 0 haben und als letzte Zeile `soll handoff: 6 pictures, approve top 390=<y> 1440=<y>, 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-konto.mjs --out $T && node ops/soll-konto.mjs --check --source $T` muss Exit 0 haben und als letzte Zeile `soll konto: 4 pictures, passkey top 390=<y> 1440=<y>, 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-konto.mjs --out $T && node ops/soll-konto.mjs --check --source $T | grep -cE '^soll konto: failed (390|1440) px, [0-9]+ px tall, diff 0 px$'` muss `2` ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-money.mjs --out $T && node ops/soll-money.mjs --check --source $T` muss Exit 0 haben und als letzte Zeile `soll money: 14 images, blocks end 390=<y> 1440=<y>, 0 defects` ausgeben.
- [x] Jeder Prüfbefehl eines fertigen Goals, dessen Ausgabe dieses Goal ändert, steht mit seiner neuen Ausgabe als abgelöst im
      `ANNAHMEN.md` seines Topics.
      MVP: Funktion, weil das Audit sonst nach dem Merge rote Zeilen meldet, aus denen der Loop Master Reparaturen ohne Ursache macht.
      Prüfung: `for f in $(git grep -l -E 'handoff-"|freigabe (oben|top)|soll limit: 4 images|Abnahme-Issue (handoff|limit): ' -- 'goals/*/[0-9][0-9]-*.md' | grep -v '^goals/konto/06-'); do [ "$(sed -n '/^## Status/{n;p;q}' $f)" = DONE ] || continue; grep -E '^\s+Prüfung' $f | grep -v -- '\.mjs --pruefen' | grep -qE 'handoff-"|freigabe (oben|top)|soll limit: 4 images|Abnahme-Issue (handoff|limit): ' || continue; t=$(basename $(dirname $f)); n=$(basename $f | cut -c1-2); grep -qE "^- Abgelöst: $t $n Punkt [0-9]+ durch konto 06 Punkt [0-9]+, " goals/$t/ANNAHMEN.md 2>/dev/null || echo "fehlt $t $n"; done` muss nichts ausgeben.
      Prüfung: `q=$(printf '\140'); cat goals/*/ANNAHMEN.md | grep -E '^- Abgelöst: .* durch konto 06 ' | grep -vcE " durch konto 06 Punkt [1367], Ausgabe dann genau ${q}Exit [0-9]+, [^${q}]*${q} \\(Tech Lead, 2026-11-17\\)\$"` muss `0` ausgeben.
      Prüfung: `cat goals/*/ANNAHMEN.md | grep -cE '^- Abgelöst: .* durch konto 06 '` muss mindestens `6` ausgeben.
- [x] Doku und Annahmen nennen die neuen Namen und den Namen des Kontos, und die Entscheidungen stehen mit Grund in
      `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil die Linsen und die nächsten Goals der Kette gegen diese Doku prüfen.
      Prüfung: `awk '/^## Goal 06/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens `6` ausgeben.
      Prüfung: `grep -cE '^Abnahme-Issue limit-account: PRO-[0-9]+$' docs/soll/README.md` muss `1` ausgeben.
      Prüfung: `grep -cE 'handoff-(freigabe|erledigt|ungueltig)' docs/soll/README.md` muss `0` ausgeben.
      Prüfung: `grep -ciE 'name des kontos|account name|accountName' docs/konto/handoff.md` muss mindestens `1` ausgeben.
- [ ] Der Diff bleibt in den Pfaden dieses Goals, kein Test wird schwächer, kein neues Paket, kein Schlüssel im Diff, keine andere
      Goal-Datei geändert, und `check` ist grün.
      MVP: Funktion, weil der Merge über `deploy.yml` ausrollt und zahlende Kunden den Stand tragen.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/handoff/[A-Za-z0-9._-]+\.ts|src/konto/[A-Za-z0-9._-]+\.ts|src/public/(limit|konto|money|handoff|openapi)\.ts|src/public/konto-client/[A-Za-z0-9._/-]+|test/[A-Za-z0-9._-]+\.ts|mcp/server\.mjs|mcp/README\.md|mcp/skills/automaton/SKILL\.md|ops/soll-(assess|handoff|live-handoff|konto|live-konto|limit|live-limit)\.mjs|docs/soll/(limit-(approve|passkey)|handoff-(approve|approved|invalid|freigabe|erledigt|ungueltig))-(390|1440)\.png|docs/soll/src/(limit-(approve|passkey)|handoff-(approve|approved|invalid|freigabe|erledigt|ungueltig))\.html|docs/soll/README\.md|docs/konto/(handoff|konto)\.md|goals/konto/06-die-seite-zum-tageslimit-sagt-wofuer-das-limit-gilt\.md|goals/konto/verdicts/06-[A-Za-z0-9._-]+\.md|goals/[a-z]+/ANNAHMEN\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- package.json pnpm-lock.yaml && echo pakete gleich` muss `pakete gleich` ausgeben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' && echo goals gleich` muss `goals gleich` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-06 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer auf dem Handy das Tageslimit hebt, liest, dass es für sein ganzes Konto gilt, unter dem Namen seines Kontos.
- [ ] Kein Text, den das Terminal schickt, erscheint auf der Seite des Schritts `limit`.
- [ ] Jedes SOLL-Werkzeug beweist mit einem gepflanzten Mangel, dass es Abweichungen findet, und das nächste Audit führt jeden alten
      Prüfbefehl der fertigen Goals als GRÜN oder ABGELÖST, keinen als ROT.
- [ ] Kein Gedankenstrich, kein deutscher Bezeichner im Code außer der einen Zuordnung zu Dateinamen abgenommener Bilder, kein Wort,
      das der Nutzer erst übersetzen muss.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.key`, `*.pem`
- `src/app.ts`, `src/db.ts`, `src/auth/**`, `src/payments/**`, `src/automaton/**`, `src/sandbox/**`: dieses Goal nennt sie nicht zum
  Ändern; ihre Funktionen dürfen importiert werden
- `ops/soll.mjs`, `ops/soll-live.mjs`, `ops/soll-money.mjs`, `ops/soll-live-money.mjs` und ihre Tests (konto 08 legt die Werkzeuge
  zusammen); die Bilder und Quellen der Startseite, des Kontos (`konto-passkey`, `konto-fehlgeschlagen`) und der Geld-Seiten
- jede sichtbare Änderung an den Geld-Seiten (`src/public/money.ts`) und an den Zuständen des Handoffs und des Kontos; die Handoff-Bilder
  nur umbenennen, nie neu rendern
- `ROADMAP.md`, `docs/kette.md`, alle Goal-Dateien außer dieser (eingefroren; abgelöst wird nur über `ANNAHMEN.md`), jede Zeile einer
  `ANNAHMEN.md` außer `## Goal 06` und `## Abgelöst durch konto 06`
- ein neues Paket, ein Test, der gestrichen, übersprungen oder schwächer wird
- jede Transaktion, jeder Aufruf bei Turnkey, Bridge oder einem RPC; ein Konto oder eine Erlaubnis eines echten Kunden
- ein API-Schlüssel, ein Testschlüssel oder ein Name eines Kunden in Repo, Log, Ausgabe, Kommentar oder Fixture
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 5
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-17 Zyklus 1: Punkte 1 bis 9 gebaut (Kopf vor diesem Commit `6f2d70d`, PR #247), Punkt 10 offen. Prüfbefehle: alle Prüfbefehle der Punkte 1 bis 9 selbst ausgeführt und grün, mit `FONTCONFIG_FILE=~/.config/control-plane/soll-fonts.conf` und `PATH=/usr/bin:$PATH`; Punkt 1 `soll limit: 4 pictures, approve top 390=555 1440=603, limit top 390=486 1440=510, 0 defects`, `breiten ok`, `konto ok`, `quellen ok`, `bausteine ok neu=0`; Punkt 2 alle vier Gegenproben `3`, Tests Exit 0, `bestand gleich`, `soll: 2 pictures, move top 390=828 1440=656, 0 defects`; Punkt 3 `fertig`, `soll handoff: 6 pictures, approve top 390=528 1440=603, 0 defects`, `0`, `0`; Punkt 4 `0`, `0`, `1`, `1`, Gegenprobe `exit=1`, Tests Exit 0, `0`; Punkt 5 Tests Exit 0, `5`, `0`, `0`; Punkt 6 `abnahme ok 1` (Abnahme PRO-24063 um 12:51, letzter Bild-Commit 12:48, erster Commit an `limit.ts` danach); Punkt 7 Limit, Handoff, Konto (`2` Zeilen `failed`) und Geld (`soll money: 14 images, blocks end 390=591 1440=615, 0 defects`) pixelgleich, Gegenprobe mit geänderter Überschrift `exit=1` mit 2 Mängeln; Punkt 8 nichts, `0`, `11`; Punkt 9 `11`, `1`, `0`, `2`. Neue Tests waren rot: `test/state-names.test.ts` vor der Umbenennung mit 11 Funden und fehlender Route `failed`, `test/konto-limit-account.test.ts` gegen den alten Stand von `routes.ts`, `server.mjs` und `limit.ts` in allen 5 Fällen. Punkt 8: 286 Prüfbefehle der fertigen Goals unter `goals/konto/` und `goals/seite/` an Merge-Basis und Goal-Branch verglichen (`origin/dev` als `HEAD` gelesen wie nach dem Merge; ausgelassen nur offene PR-Suchen, Schlüsseldateien, Turnkey, `loop.env` und externe Links), abgelöst: konto 02 drei, konto 04 zwei, konto 05 vier, seite 03 zwei, konto 01, 03, seite 01 und 02 keiner; die zwei Zeilen von konto 02 Punkt 1 enden mit `Node.js v22.23.5`, gemessen mit dem Node aus `/usr/bin`. Punkt 10: Pfade `0`, Tests `0`, `pakete gleich`, Schlüssel `0`, `check: grün in 122 s`; die Prüfung `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' && echo goals gleich` gibt nichts aus, weil die Pfadangabe diese Goal-Datei selbst trifft, die der Maker in Status, Kästchen und Progress Log ändern muss; deshalb bleibt Punkt 10 offen, Frage an den Tech Lead auf dem Topic.
- 2026-11-17 Zyklus 2: Abschluss gemeldet, Punkte 1 bis 9; Punkt 10 offen, weil seine Prüfung `goals gleich` die eigene Goal-Datei trifft (Frage an den Tech Lead auf PRO-24063). Prüfbefehle am Kopf `ef07e6f`, `dev` schon enthalten: Punkt 1 `soll limit: 4 pictures, approve top 390=555 1440=603, limit top 390=486 1440=510, 0 defects`; Punkt 3 `soll handoff: 6 pictures, approve top 390=528 1440=603, 0 defects`; Punkt 5 Tests Exit 0, `0`, `0`; Punkt 7 Limit live `0 defects`; Punkt 10 Pfade `0`, `pakete gleich`, Goal-Dateien geändert nur `goals/konto/06-die-seite-zum-tageslimit-sagt-wofuer-das-limit-gilt.md`, `check: grün in 61 s`; am PR #247 `check` pass und `e2e` pass.

## Blockers
