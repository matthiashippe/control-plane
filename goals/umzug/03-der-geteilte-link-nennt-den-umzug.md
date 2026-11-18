# Umzug Goal 03: Der geteilte Link nennt den Umzug

## Status
ACTIVE

## Active Objective
Wer einen Link auf `automatonhost.com` geteilt bekommt oder `llms.txt` liest, erfährt zuerst, dass sein Automaton hier weiterläuft:
Das Vorschaubild geteilter Links (`/og.png`, gebaut aus `src/public/og-card.html`) und sein `og:image:alt` tragen die Botschaft des
ersten Blocks der Startseite (`conwayApiUrl` auf `https://automatonhost.com`, gleiche API, eigene Wallet) statt des Markts, und der
erste Absatz von `llms.txt` nennt den Wechsel, der Markt folgt danach. Vor dem Bau steht ein SOLL-Bild der Vorschaukarte unter
`docs/soll/` (2400 x 1260), abgenommen vom Design Reviewer; Karte und Bild werden 1:1 danach gebaut (`ROADMAP.md`, umzug 03;
übernimmt `goals/_vorschlaege/umzug-kritik-2026-11-17-3.md` und `goals/_vorschlaege/umzug-kritik-2026-11-17-4.md`).
MVP: Funktion, weil ein Betreiber aus einem Conway-Issue zuerst den geteilten Link sieht und sein Automaton zuerst `llms.txt` liest,
und beide heute ein Angebot nennen, das nicht seines ist.

## Voraussetzungen
- umzug Goal 02 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Betreiber, dessen Automaton bei Conway hängt, sieht beim ersten Blick auf den geteilten Link oder auf
  `llms.txt`, dass er hier mit einer Zeile weiterläuft, und stellt um. Was dem nicht dient, gehört nicht in dieses Goal.
- Stand am 18.11.2026 (`dev` bei `f1cf467`), gemessen:
  - `src/public/og-card.html` Zeile 33 trägt als Überschrift „One job. Several agents do it. Pay one.“, darunter die Provision, den
    freien ersten Auftrag („first job / free, 15 ¢“) und offene Aufträge; `src/public/og.png` ist daraus aufgenommen (2400 x 1260).
  - `src/public/index.html` Zeile 18: `og:image:alt` lautet „automatonhost.com: one job, several agents deliver, you pay one.“,
    dieselbe Zeile steht in `docs/soll/src/startseite.html` Zeile 18. Titel und Beschreibungen derselben Seite sagen schon „keep your
    automaton running“ und „Point conwayApiUrl at automatonhost.com“.
  - `/og.png` ist das Vorschaubild von `/` und von rund zwanzig weiteren Seiten (`src/app.ts`, Parameter `card` von `page()`);
    `/og-x402.png` aus `src/public/og-card-x402.html` hat eigene Seiten.
  - `llms.txt` (`src/app.ts` ab Zeile 2168) beginnt nach `# automatonhost.com` mit „> One job. Several agents do it. Pay one.“ und
    nennt `conwayApiUrl` erst im Abschnitt `## Use it`.
  - `test/og-card.test.ts` verlangt, dass die Karte `15 ¢` nennt und die drei Sätze der ersten Überschrift nach dem Block `move`
    trägt (die Überschrift des Markts). `ops/og-card-says-the-truth.sh` meldet `CARD SILENT` mit Exit 1, wenn der Topf des
    Startguthabens voll ist und die Karte den freien ersten Auftrag nicht nennt.
  - Ein SOLL-Werkzeug für die Vorschaukarte gibt es nicht; `og.png` wurde in umzug 02 von Hand mit dem Chromium aus
    `~/.cache/ms-playwright/` aufgenommen. `ops/browser.mjs`, `decodePng` und `pixelDiffCount` aus `ops/soll-assess.mjs` sind da.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 03` in `goals/umzug/ANNAHMEN.md`):
  1. **Die Karte sagt, was der erste Block der Startseite sagt.** Überschrift in zwei Zeilen „Conway not answering?“ und „Your
     automaton runs here.“, darunter ein Satz wie im Block `move` („It signs in here with its own wallet and gets answers again,
     over the same API it uses today.“), dazu sichtbar die eine Zeile `"conwayApiUrl": "https://automatonhost.com"`, unten rechts
     wie heute `automatonhost.com`. Markt, Provision und freier erster Auftrag stehen nicht mehr darauf. Farben, Schrift, Logo und
     Abstände bleiben die der heutigen Karte; neue Bausteine nur, wenn die Zeile mit `conwayApiUrl` einen braucht, dann steht er
     mit Grund unter „Neue Bausteine“ im neuen Abschnitt `## Vorschaukarte /og.png` von `docs/soll/README.md`, der auch Quelle,
     Bild, Werkzeug und Abnahme-Zeile nennt. Was am Ende dasteht, entscheidet die Abnahme.
  2. **`/og.png` gilt für alle Seiten, die es heute tragen.** Der Dienst wird als `automatonhost.com` verkauft, der Markt bleibt
     erreichbar, steht aber nicht oben; eine eigene Karte für Marktseiten wäre Arbeit ohne Bezug zum Ziel. `og-card-x402.html` und
     `og-x402.png` bleiben unverändert.
  3. **SOLL-Werkzeug `ops/soll-og.mjs`** nach dem Muster von `ops/soll-limit.mjs`: rendert `docs/soll/src/og-card.html` bei
     1200 x 630 mit Faktor 2 nach `docs/soll/og-card.png`; `--check` rendert in einen `mktemp`-Ordner und vergleicht, Exit 1 bei
     jedem Mangel; `--check --source <datei>` prüft eine andere Quelle gegen dasselbe Bild; ein unbekanntes Argument endet vor jedem
     Schreiben. Mängel: ein Pixel weicht ab (Toleranz wie bei den anderen), Größe nicht 2400 x 1260, Inhalt breiter oder höher als
     die Karte, Gedankenstrich im sichtbaren Text, Anfrage an eine fremde Adresse. Die Auswertung ist `assessOg` in
     `ops/soll-assess.mjs`, geprüft von `test/soll-og.test.ts` ohne Browser. Letzte Zeile der Ausgabe endet wie bei den anderen
     Werkzeugen auf `0 defects`. Das Werkzeug schreibt nie nach `src/public/`.
  4. **1:1 heißt hier byte- und pixelgleich**: `src/public/og-card.html` ist nach der Abnahme eine Kopie von
     `docs/soll/src/og-card.html`, `src/public/og.png` eine Aufnahme davon, pixelgleich mit `docs/soll/og-card.png`.
  5. **`og:image:alt`** in `src/public/index.html` und gleichlautend in `docs/soll/src/startseite.html` beschreibt die neue Karte,
     Vorschlag: „automatonhost.com: Conway not answering? Your automaton runs here. Set conwayApiUrl to https://automatonhost.com.“
     Das Meta-Tag ist unsichtbar; die beiden Startseiten-Bilder ändern sich nicht.
  6. **`test/og-card.test.ts`**: Der Fall „names the grant the service actually gives“ verlangt danach, dass die Karte keinen freien
     ersten Auftrag verspricht (`first job` und `free` fehlen), weil ein Bild `starterOffer()` nicht fragen kann und die Karte des
     Umzugs keinen Grund hat, ihn zu versprechen; das schließt das Risiko, das der alte Fall bewachte, ganz aus. Der Fall „says the
     same thing the page says“ vergleicht mit der Überschrift des Blocks `move` statt mit der des Markts. Die Zahl der Fälle und der
     `expect(` sinkt nicht (der Prüfbefehl von seite 02 Punkt 9 zählt sie).
  7. **`ops/og-card-says-the-truth.sh`**: Eine Karte, die `conwayApiUrl` nennt, ist die Karte des Umzugs; schweigt sie zum freien
     ersten Auftrag, stimmt sie bei vollem wie bei leerem Topf (`AGREES`), verspricht sie ihn, gilt die Prüfung wie heute. Die sechs
     Fälle des Selbsttests bleiben unverändert, dazu kommen zwei Fälle mit dem Inhalt von `$CARD` (voller Topf stimmt, leerer Topf
     stimmt) und zwei mit einer Umzugskarte, die den ersten Auftrag verspricht (leerer Topf stimmt nicht, voller Topf mit falscher
     Zahl stimmt nicht). Die Erfolgszeile des Selbsttests nennt die Zahl der Fälle. Der Live-Lauf ohne `--selftest` ruft die
     Produktion und gehört nicht in die Prüfbefehle.
  8. **`llms.txt`**: Direkt nach `# automatonhost.com` und der Leerzeile steht als erster Absatz (Zeilen mit `> ` bis zur nächsten
     Leerzeile) der Umzug: Conway antwortet nicht, `conwayApiUrl` in `~/.automaton/automaton.json` auf `siteOrigin()` stellen, dann
     `automaton --provision`, gleiche API, eigene Wallet. Der heutige Absatz zum Markt („One job …“) folgt unverändert als zweiter
     Abschnitt, unter einer Überschrift `## The market`, in jedem Zustand (`notForSale`, Sunset, `intakeClosed`). Ein neuer Fall in
     `test/automaton-name.test.ts` prüft mit `CP_PUBLIC_URL=https://automatonhost.com`: Der erste Absatz nennt `conwayApiUrl` und
     `https://automatonhost.com` und nicht „One job“, und „One job“ steht nach `## The market`. Er importiert nur, was es am Kopf
     von `dev` gibt, damit die Gegenprobe am alten `src/app.ts` rot ist.
  9. **Abgelöste Prüfbefehle fertiger Goals** wie in umzug 02, Entscheidung 10: Der Maker führt jeden Prüfbefehl der Goal-Dateien mit
     Status `DONE`, der einen Pfad aus `git diff --name-only origin/dev...HEAD` oder eines der Wörter `og-card`, `og.png`, `llms`,
     `One job` nennt, an der Merge-Basis und am Goal-Branch aus (außer Befehlen, die etwas verschicken oder live auf echten Daten
     laufen), und für jeden, dessen Ausgabe sich ändert, steht im `goals/<topic>/ANNAHMEN.md` des abgelösten Goals genau eine Zeile,
     gesammelt unter `## Abgelöst durch umzug 03 (Maker, <Datum>)`:
     ```
     - Abgelöst: <topic> <NN> Punkt <n> durch umzug 03 Punkt <m>, Ausgabe dann genau `Exit <k>, <letzte Zeile>` (Tech Lead, 2026-11-18)
     ```
     Ändert sich keine Ausgabe, sagt das die Zeile im Progress Log mit der Zahl der geprüften Befehle, und Punkt 6 zählt 0 Zeilen.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte):
  1. Zuerst Werkzeug, Quelle und Bild (Punkt 1), Commit, Push. Dann den Design Reviewer auf dem Topic dieses Goals mit dem Bildpfad
     und dem Commit erwähnen und die Zeile `Abnahme-Issue og-card: PRO-<n>` in `docs/soll/README.md` setzen. Bis „SOLL abgenommen“
     dasteht, ändert der Maker `src/public/og-card.html`, `src/public/og.png` und `src/public/index.html` nicht (Punkt 2 prüft das an
     den Zeitstempeln). Die vorhandenen Zeilen `Abnahme-Issue…` bleiben.
  2. Während der Abnahme `llms.txt` mit Test (Punkt 5) und das Prüfwerkzeug der Karte (Punkt 4, Selbsttest), je Commit und Push.
  3. Nach der Abnahme Karte, Bild und `og:image:alt` (Punkt 3), dann die Tests der Karte (Punkt 4), abgelöste Prüfbefehle (Punkt 6),
     Doku und Annahmen (Punkt 7), Umfang und `check` (Punkte 8 und 9).
- Die SOLL-Befehle laufen mit `FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf` wie in umzug 02.
- Tests, die heute die Karte des Markts erwarten, erwarten danach die des Umzugs; keine Assertion fällt weg, und die einzige, die
  ihren Inhalt ändert, ist die aus Entscheidung 6.
- Prüfbefehle ohne Netz binden keinen festen Port (`app.request`), Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check`, vitest und
  die SOLL-Werkzeuge im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Jeder neue Test war einmal rot,
  die Zeile im Progress Log sagt, womit. Progress Log und Verdicts zitieren keine Suchausdrücke der Prüfbefehle wörtlich.
- Rollout: `src/**` liegt im Laufzeitpfad, der Merge rollt über `deploy.yml` aus. Vorschaudienste halten alte Bilder im Cache; das
  ist kein Gap dieses Goals.
- Widerlegt, wenn `grep -c 'One job' src/public/og-card.html` am Kopf von `dev` schon 0 zählt; dann endet das Goal mit dieser
  Messung in den Annahmen.
- Was danach schneller zu mehr zahlenden Automatons führt: Jede Antwort im Kanal, die `https://automatonhost.com` verlinkt, zeigt im
  Vorschaubild schon die eine Zeile, die der Betreiber ändern muss.

## Done Condition
- [x] Das SOLL-Bild der Vorschaukarte `docs/soll/og-card.png` (2400 x 1260) kommt aus `docs/soll/src/og-card.html`, das die
      Überschrift des Blocks `move` und `conwayApiUrl` mit `https://automatonhost.com` trägt und weder den Markt noch den freien
      ersten Auftrag nennt; `ops/soll-og.mjs --check` meldet 0 Mängel, und seine Auswertung ist ohne Browser getestet.
      MVP: Funktion, weil die Karte nur nach Bild gebaut werden darf (`LOOP.md`, Fläche nur nach SOLL-Bild).
      Prüfung: `grep -ciE 'one job|pay one|first job|commission' docs/soll/src/og-card.html` muss 0 ausgeben.
      Prüfung: `for w in 'Conway not answering?' 'Your automaton runs here.' conwayApiUrl https://automatonhost.com '<div class="url">automatonhost.com'; do grep -qF -- "$w" docs/soll/src/og-card.html || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `node --input-type=module -e 'import fs from "node:fs"; import { decodePng } from "./ops/soll-assess.mjs"; const p = decodePng(fs.readFileSync("docs/soll/og-card.png")); console.log(p.width + "x" + p.height)'` muss `2400x1260` ausgeben.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-og.mjs --check > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); sed 's#automatonhost.com</div>#automatonhost.com \&mdash; x</div>#' docs/soll/src/og-card.html > $T/og-card.html; FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-og.mjs --check --source $T/og-card.html > $T/o 2>&1; echo "exit=$?"; rm -rf $T` muss `exit=1` ausgeben.
      Prüfung: `node ops/soll-og.mjs --chek; echo "exit=$?"; git status --porcelain docs/soll src/public | wc -l` muss `exit=1` und danach `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/soll-og.test.ts test/soll.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/soll-og.test.ts` muss mindestens 4 ausgeben.
- [x] Der Design Reviewer hat das Bild nach seinem letzten Commit abgenommen, bevor Karte, `og.png` oder Startseite sich änderten.
      MVP: Funktion, weil kein UI ohne abgenommenes Bild gebaut wird (`LOOP.md`, Fläche nur nach SOLL-Bild).
      Prüfung: `grep -cE '^Abnahme-Issue og-card: PRO-[0-9]+$' docs/soll/README.md` muss 1 ausgeben.
      Prüfung (Netz): `i=$(sed -n 's/^Abnahme-Issue og-card: //p' docs/soll/README.md); t=$(git log -1 --format=%cI -- docs/soll/og-card.png docs/soll/src/og-card.html); b=$(git log --reverse --format=%cI origin/dev..HEAD -- src/public/og-card.html src/public/og.png src/public/index.html | head -1); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | T="$t" B="$b" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const t=Date.parse(process.env.T);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="3412a0ea-cbf5-4f18-9360-0e8e20ba3313"&&/SOLL abgenommen/.test(c.body)).map(c=>Date.parse(c.createdAt));if(!process.env.T||!ok.some(x=>x>t)){console.error("keine abnahme nach "+process.env.T);process.exit(1)}if(process.env.B&&!(Math.min(...ok)<Date.parse(process.env.B))){console.error("gebaut vor der abnahme "+process.env.B);process.exit(1)}console.log("abnahme ok "+ok.length)})'` muss `abnahme ok <n>` mit n mindestens 1 ausgeben.
- [x] Karte, Bild und Bildbeschreibung sind 1:1 nach dem SOLL-Bild gebaut: `src/public/og-card.html` gleicht der SOLL-Quelle,
      `src/public/og.png` ist pixelgleich mit `docs/soll/og-card.png`, und `og:image:alt` beschreibt die Karte des Umzugs, ohne dass
      sich die Bilder der Startseite ändern.
      MVP: Funktion, weil das Bild das ist, was jeder geteilte Link zeigt.
      Prüfung: `cmp -s docs/soll/src/og-card.html src/public/og-card.html && echo gleich` muss `gleich` ausgeben.
      Prüfung: `node --input-type=module -e 'import fs from "node:fs"; import { decodePng, pixelDiffCount } from "./ops/soll-assess.mjs"; const a = decodePng(fs.readFileSync("src/public/og.png")), b = decodePng(fs.readFileSync("docs/soll/og-card.png")); console.log(a.width + "x" + a.height + " " + pixelDiffCount(a, b))'` muss `2400x1260 0` ausgeben.
      Prüfung: `T=$(mktemp -d); FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll-og.mjs --check --source src/public/og-card.html > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
      Prüfung: `cat src/public/index.html docs/soll/src/startseite.html | grep 'og:image:alt' | grep -c conwayApiUrl` muss 2 ausgeben.
      Prüfung: `cat src/public/index.html docs/soll/src/startseite.html | grep 'og:image:alt' | grep -ciE 'one job|pay one'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- docs/soll/startseite-390.png docs/soll/startseite-1440.png src/public/og-card-x402.html src/public/og-x402.png | wc -l` muss 0 ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live.mjs --out $T/s.html && FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf node ops/soll.mjs --check --source $T/s.html > $T/o 2>&1; echo "exit=$? $(tail -n 1 $T/o | grep -o '0 defects$')"; rm -rf $T` muss `exit=0 0 defects` ausgeben.
- [x] Die Tests der Karte verlangen die Botschaft des Umzugs und keinen freien ersten Auftrag, und das Prüfwerkzeug der Karte stimmt
      der Umzugskarte bei vollem wie bei leerem Topf zu, ohne dass einer der sechs alten Fälle seines Selbsttests fällt.
      MVP: Funktion, weil sonst `test/og-card.test.ts` und `ops/check-all.sh` die neue Karte als Fehler melden und jemand die alte
      zurückholt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/og-card.test.ts test/automaton-name.test.ts test/landing-move.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:test/og-card.test.ts | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" test/og-card.test.ts); [ "$b" -ge "$a" ] || echo "weniger $k $a $b"; done` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; B=$(git merge-base origin/dev HEAD); git show $B:src/public/og-card.html > $T/src/public/og-card.html; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/og-card.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 2 ausgeben.
      Prüfung: `bash ops/og-card-says-the-truth.sh --selftest` muss Exit-Code 0 haben und eine Zeile mit `SELFTEST OK: ten cases` ausgeben.
      Prüfung: `git show origin/dev:ops/og-card-says-the-truth.sh | grep -E '^\s+judge [0-9]+ [0-9]+ "\$(with|without)"' | while IFS= read -r l; do grep -qxF -- "$l" ops/og-card-says-the-truth.sh || echo "fehlt $l"; done` muss nichts ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); bash -c 'source <(git show '"$B"':ops/og-card-says-the-truth.sh | sed -n "/^judge()/,/^}/p"); judge 15 230 "$(cat src/public/og-card.html)" >/dev/null; echo "exit=$?"'` muss `exit=1` ausgeben (das alte Werkzeug meldet die neue Karte als stumm).
      Prüfung: `bash -c 'source <(sed -n "/^judge()/,/^}/p" ops/og-card-says-the-truth.sh); judge 15 230 "$(cat src/public/og-card.html)" >/dev/null; a=$?; judge 15 0 "$(cat src/public/og-card.html)" >/dev/null; echo "voll=$a leer=$?"'` muss `voll=0 leer=0` ausgeben.
- [x] `llms.txt` nennt im ersten Absatz den Wechsel mit `conwayApiUrl` auf den kanonischen Host, der Markt folgt unter
      `## The market`; der neue Fall war vor dem Fix rot.
      MVP: Funktion, weil ein Automaton, das die Datei liest, sonst zuerst ein fremdes Angebot liest statt der einen Zeile, die es
      weiterlaufen lässt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-name.test.ts test/llms-txt.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in 'The market' conwayApiUrl 'One job'; do grep -qF -- "$w" test/automaton-name.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `CP_PUBLIC_URL=https://automatonhost.com PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const t = await (await createApp({ db: openDb(":memory:") }).request("/llms.txt")).text(); const p = t.split("\n\n")[1] ?? ""; const m = t.indexOf("## The market"); console.log([p.includes("conwayApiUrl"), p.includes("https://automatonhost.com"), !p.includes("One job"), m > 0 && t.indexOf("One job") > m].every(Boolean) ? "llms ok" : "llms falsch")'` muss `llms ok` ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; B=$(git merge-base origin/dev HEAD); git show $B:src/app.ts > $T/src/app.ts; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-name.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 1 ausgeben.
- [x] Jeder Prüfbefehl eines fertigen Goals, dessen Ausgabe sich durch dieses Goal ändert, steht als abgelöst in den Annahmen seines
      Topics, in der Form aus Entscheidung 9.
      MVP: Funktion, weil das Audit nachts jeden Prüfbefehl fertiger Goals fährt und jede unerklärte rote Zeile eine Reparatur ohne
      Ursache auf `dev` auslöst.
      Prüfung: `q=$(printf '\140'); cat goals/*/ANNAHMEN.md | grep -E '^- Abgelöst: .* durch umzug 03 ' | grep -vcE " durch umzug 03 Punkt [0-9]+, Ausgabe dann genau ${q}Exit [0-9]+, [^${q}]*${q} \\(Tech Lead, 2026-11-18\\)\$"` muss 0 ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+ Zyklus [0-9]+: .*(abgelöst|Abgelöst)' goals/umzug/03-der-geteilte-link-nennt-den-umzug.md` muss mindestens 1 ausgeben.
- [x] Die Doku sagt, was Vorschaukarte und `llms.txt` zuerst sagen und warum, wie die Karte neu aufgenommen wird und dass sie nur nach
      Bild geändert wird; die Entscheidungen stehen mit Grund in den Annahmen.
      MVP: Funktion, weil das nächste Goal, das die Karte anfasst, sonst wieder den Markt draufschreibt oder das Bild von Hand aufnimmt.
      Prüfung: `for w in og-card.png 'ops/soll-og.mjs' conwayApiUrl 'The market' og-card-says-the-truth.sh; do grep -qF -- "$w" docs/umzug.md || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Vorschaukarte/{f=1;next} /^## /{f=0} f' docs/soll/README.md | grep -cE 'ops/soll-og\.mjs|og-card\.png'` muss mindestens 2 ausgeben.
      Prüfung: `awk '/^## Goal 03/{f=1;next} /^## /{f=0} f' goals/umzug/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens 6 ausgeben.
- [x] Das Goal ändert nur Karte, Bild, Startseite, `llms.txt`, SOLL-Bild und Werkzeug, das Prüfwerkzeug der Karte, Doku, Annahmen und
      Tests, weder Compose, Zahlung, Anmeldung, Automaton, Harness noch CI, und bringt keinen Schlüssel ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8) und Compose nur Matthias ändert.
      Prüfung: `git diff --name-only origin/dev...HEAD -- deploy src/payments src/auth src/automaton src/handoff harness .github scripts/check.mjs loop.yaml gate.yaml LOOP.md loop-constraints.md | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vcE '^(src/app\.ts|src/public/(og-card\.html|og\.png|index\.html)|docs/soll/(og-card\.png|src/og-card\.html|src/startseite\.html|README\.md)|docs/umzug\.md|ops/soll-og\.mjs|ops/soll-assess\.mjs|ops/og-card-says-the-truth\.sh|test/.+|goals/[a-z]+/ANNAHMEN\.md|goals/umzug/.+|goals/_vorschlaege/umzug-[a-z0-9.-]+\.md)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | wc -l` muss höchstens 25 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}|Bearer [A-Za-z0-9_-]{30,})'` muss 0 ausgeben.
- [x] `check` ist grün, und der Job `e2e` des Goal-PR ist grün.
      MVP: Funktion, weil `llms.txt` und die Startseite jede Anfrage sehen und erst der Gang mit der unveränderten Runtime zeigt, dass
      Anmeldung, Zahlung und Inferenz weiter laufen (Grundregel 13).
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/umzug-03 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jeder neue Fall, der ein neues Verhalten verlangt, war vor dem Fix rot; die Zeile im Progress Log
      nennt, womit.
- [ ] Maschinenpfade, Feldnamen und Header verhalten sich auf allen drei Hosts genau wie vor dem Goal; `/og.png` antwortet mit
      derselben Größe und denselben Headern.
- [ ] Code, Kommentare, Testnamen, Ausgaben der Werkzeuge und Texte der Karte und von `llms.txt` Englisch, Goal-Datei, Doku und
      Annahmen Deutsch, kein Gedankenstrich, kein Wort, das der Leser erst übersetzen muss (TEAM.md „Klare Wörter“).

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/payments/**`, `src/auth/**`, `src/automaton/**`, `src/handoff/**`, `ops/conway-series.sh`,
  `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `src/public/og-card-x402.html`, `src/public/og-x402.png`, die übrigen SOLL-Bilder und -Quellen außer dem Meta-Tag
  `og:image:alt` in `docs/soll/src/startseite.html`
- die Goal-Dateien fertiger Goals; in ihren `ANNAHMEN.md` nur die Zeilen aus Entscheidung 9
- der Live-Lauf von `ops/og-card-says-the-truth.sh` und jeder andere Aufruf der Produktion; der Zahlungsserver `76.13.144.207` und der
  Sandbox-Server: kein Zugriff
- Cloudflare, Turnkey, Stripe: kein Zugriff in diesem Goal
- kein Kommentar in einem fremden Repo (Human Gate `public_post`)
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-18 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9 gebaut: SOLL-Quelle und Bild der Vorschaukarte mit dem neuen Werkzeug `ops/soll-og.mjs` (`assessOg` mit Test ohne Browser), Abnahme durch den Design Reviewer am Topic PRO-24699 um 01:19 UTC nach dem Bild-Commit `d847d5a` (01:17 UTC) und vor der Karte `8dc5ed4` (01:23 UTC), Karte, `og.png` und `og:image:alt` danach als Kopien, Tests und Prüfwerkzeug der Karte für die Umzugskarte, `llms.txt` mit dem Wechsel als erstem Absatz und dem Markt unter eigener Überschrift, 7 abgelöste Prüfbefehle fertiger Goals (konto 08 Punkt 2 und 4, seite 01 Punkt 4, seite 03 Punkt 6, umzug 02 Punkt 2 und zweimal Punkt 4), Doku und Annahmen. Rot vorher: `test/soll-og.test.ts` 6 von 6 gegen das alte `ops/soll-assess.mjs`, der neue Fall in `test/automaton-name.test.ts` 1 rot gegen das alte `src/app.ts`, `test/og-card.test.ts` 2 rot gegen die alte Karte, der Selbsttest der Karte rot mit der alten Karte. Prüfbefehle: Punkt 1 `0`, nichts, `2400x1260`, `exit=0 0 defects`, `exit=1`, `exit=1` und `0`, Exit 0, `6`; Punkt 2 `1`, `abnahme ok 1`; Punkt 3 `gleich`, `2400x1260 0`, `exit=0 0 defects`, `2`, `0`, `0`, `exit=0 0 defects` (mit Node 22 vorn im `PATH`); Punkt 4 Exit 0, nichts, `2`, `SELFTEST OK: ten cases` mit Exit 0, nichts, `exit=1`, `voll=0 leer=0`; Punkt 5 Exit 0, nichts, `llms ok`, `1`; Punkt 6 `0`, `1`; Punkt 7 nichts, `6`, `10`; Punkt 8 `0`, `0`, `22`, `0`, `0`; Punkt 9 `check` Exit 0 (221 Dateien, 2381 Tests), `e2e` am PR #268 `SUCCESS` (Lauf am Kopf `0af1d26`).
- 2026-11-18 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9; `origin/dev` `3aa3467` (Goal-Datei konto 11) und danach `f076a93` (abrechnung 05, ohne Konflikt, keine Datei dieses Goals) in den Goal-Branch gemergt, alle Prüfbefehle danach erneut mit derselben Ausgabe. Prüfbefehle (Node 22.23.5, `PATH=/usr/bin:$PATH`): Punkt 1 `0`, nichts, `2400x1260`, `exit=0 0 defects`, `exit=1`, `exit=1` und `0`, Exit 0, `6`; Punkt 2 `1`, `abnahme ok 1`; Punkt 3 `gleich`, `2400x1260 0`, `exit=0 0 defects`, `2`, `0`, `0`, `exit=0 0 defects`; Punkt 4 Exit 0, nichts, `2`, `SELFTEST OK: ten cases` mit Exit 0, nichts, `exit=1`, `voll=0 leer=0`; Punkt 5 Exit 0, nichts, `llms ok`, `1`; Punkt 6 `0`, `1`; Punkt 7 nichts, `6`, `10`; Punkt 8 `0`, `0`, `22`, `0`, `0`; Punkt 9 `check` Exit 0 (2385 Tests, grün in 117 s), `e2e` am PR #268 am Kopf dieses Commits.

## Blockers
Keine.
