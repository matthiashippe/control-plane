# Seite Goal 03: Code auf Englisch

## Status
PLANNED

## Active Objective
Grundregel 12 (`loop-constraints.md`: Bezeichner, Kommentare, Testnamen, Fehlermeldungen und Log-Zeilen Englisch, ausnahmslos) gilt
wieder ohne Ausnahme für die Namen, die seite 01, seite 02, konto 02, domains 01 und fehler 02 und 04 deutsch ins Repo gebracht haben.
Dieses Goal benennt sie um, wie es die drei übernommenen Vorschläge verlangen: `VERTRAG` wird `CONTRACT_FILE`, die deutschen
Kommentare in `test/domains.test.ts` und `test/sandbox-api.test.ts` werden englische Paraphrasen mit Verweis auf
`docs/sandbox/vertrag.md`, die Arten `erfunden` und `eigene` der Adressliste werden `invented` und `own`, die Kommentare in
`.gitignore` englisch, und in den SOLL-Werkzeugen und auf der Startseite werden `--pruefen`, `umzugBottom`, `"fehlt"`, `id="umzug"`,
`data-soll="umzug"` und die Summenzeilen englisch (`--check`, `moveBottom`, `missing`, `move`,
`soll: <n> pictures, move top …, <n> defects`). Die Seite sieht danach gleich aus, und jedes SOLL-Werkzeug meldet gegen dieselben
Bilder dieselben Werte wie vorher. Doku für Matthias bleibt Deutsch.
Widerlegt, wenn einer der alten Namen am Kopf von `dev` noch in Code, Test oder Log-Zeile steht.
MVP: Funktion, weil ein Bruch von Grundregel 12 ein Regelbruch ist und keine Schönheit (ROADMAP Zeile 21), und weil danach alle drei
SOLL-Werkzeuge dasselbe Flag und dieselbe Zeile in derselben Sprache führen, gegen die jede Linse prüft.

## Voraussetzungen
- seite Goal 02 DONE
- konto Goal 03 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer im öffentlichen Repo liest (Maker, Linsen, der Agent eines Kunden), findet nur englische Namen im Code,
  und die Startseite für Conway-Umsteiger bleibt Pixel für Pixel, wie sie ist.
- Warum konto 03 vorher fertig sein muss: konto 03 (heute am Human Gate) bringt `ops/soll-konto.mjs` mit `--pruefen` und eine dritte
  Summenzeile in `ops/soll-assess.mjs`, und seine Prüfbefehle rufen `node ops/soll.mjs --pruefen` und
  `node ops/soll-handoff.mjs --pruefen`. Landete dieses Goal vorher, könnte konto 03 nicht mehr grün werden, und sein Merge brächte die
  alten Namen zurück. Deshalb benennt dieses Goal die drei Werkzeuge zusammen um.
- Je Datei-Paar ein Commit (ROADMAP), damit jedes Paar für sich grün bleibt und ein Revert genau eine Umbenennung trifft:
  1. `test/domains.test.ts` und `test/sandbox-api.test.ts`: `VERTRAG` wird `CONTRACT_FILE`. Die Kommentare mit deutschem Zitat aus
     den Zellen von `docs/sandbox/vertrag.md` (heute in `test/domains.test.ts` die Zeilen mit `// vertrag.md row:` und ihre
     Fortsetzungen) werden englische Paraphrasen mit Verweis `docs/sandbox/vertrag.md:<Zeile>` auf die Zeile der Tabelle. Was der Test
     prüft, ändert sich nicht.
  2. `ops/known-ips.txt`, `test/known-ips.test.ts` und die Tabelle in `ops/README.md`: die Arten `erfunden` und `eigene` werden
     `invented` und `own`, in Liste, Regex, Testname und Fehlermeldung, in einem Commit, damit Liste und Test zusammen grün bleiben.
     Dazu `.gitignore`: beide Kommentare englisch (heute „Python-Bytecode aus den ops-Skripten …“ und „Cache von ops/fetchers.py …“),
     die Muster bleiben.
  3. `ops/soll.mjs`, `ops/soll-handoff.mjs`, `ops/soll-konto.mjs`, `ops/soll-assess.mjs` und ihre Tests unter `test/soll*.test.ts`:
     `--pruefen` wird `--check`, und jedes der drei Werkzeuge lehnt ein unbekanntes Argument ab, bevor es rendert oder schreibt: Exit 1,
     auf stderr genau eine Zeile `unknown argument: <arg>`, nichts auf stdout, kein Bild geschrieben. Das Werkzeug nennt das alte Flag
     dabei nicht selbst, es gibt nur das Argument zurück; Werte nach `--source` und `--pictures` sind keine unbekannten Argumente. So
     schreibt ein alter Prüfbefehl mit `--pruefen` keine Bilder unter `docs/soll/` neu, sondern endet sofort. In `ops/soll-assess.mjs`
     werden in jeder Summenzeile `Bilder`, `oben`, `Mängel` und `fehlt` zu `pictures`, `top`, `defects` und `missing`, und
     `umzugBottom` wird `moveBottom` samt Meldungen (`block move ends at …`, `block data-soll="move" is missing`). Die Namen der Blöcke
     `freigabe` und `passkey` und die Zustände `freigabe`, `erledigt`, `ungueltig` der Handoff-Bilder bleiben, weil sie in Dateinamen
     abgenommener Bilder des Topics konto stehen; der Maker legt dafür einen Vorschlag `goals/_vorschlaege/seite-nacharbeit-<Datum>-1.md`
     an (Goal konto 02, Empfehlung: im nächsten konto-Goal mit neuer Abnahme umbenennen). Neu ist `test/soll-flags.test.ts` (Code
     Englisch): je Werkzeug ein Fall, `--pruefen` endet mit Exit 1, der einen Zeile auf stderr und ohne geänderte Datei unter
     `docs/soll/`. Der Test war vor der Änderung rot; die Zeile im Progress Log nennt es.
  4. `src/public/index.html` und `docs/soll/src/startseite.html` mit den Tests, die am Block hängen (gefunden mit
     `grep -rln 'umzug' test`): `id="umzug"` und `data-soll="umzug"` werden `move`, auch im Selektor von `ops/soll.mjs`. In beiden HTML-
     Dateien ändert sich sonst kein Zeichen, auch nicht im `<style>`; die Bilder `docs/soll/*.png` bleiben, wie sie sind, denn die
     Seite sieht danach gleich aus und braucht keine neue Abnahme. Kein Test wird gestrichen, übersprungen oder schwächer.
  Die Zeilen `- Abgelöst:` (unten) und Doku gehen in einen eigenen Commit.
- Doku: `docs/soll/README.md` nennt die Befehle mit `--check` und den Block `data-soll="move"`, bleibt sonst Deutsch. `ops/README.md`
  nennt in der Tabelle der Adressliste `invented` und `own`.
- Alte Prüfbefehle fertiger Goals: Das Audit fährt nachts jeden Prüfbefehl jedes Goals mit Status `DONE`. Prüfbefehle von seite 01,
  seite 02, konto 02, konto 03 und fehler 04 rufen `--pruefen`, erwarten `Bilder`, `oben` und `Mängel` oder die Arten `erfunden` und
  `eigene` und liefern nach diesem Goal eine andere Ausgabe. Entscheidung (Tech Lead, 2026-11-14): Diese Punkte sind durch dieses Goal
  abgelöst. Der Maker führt jeden Prüfbefehl dieser Goal-Dateien am Goal-Branch aus, und für jeden, dessen Ausgabe sich gegenüber der
  Merge-Basis ändert, steht im `goals/<topic>/ANNAHMEN.md` des abgelösten Goals genau eine Zeile dieser Form (die Ausgabe in
  Backticks, Exit-Code und letzte Zeile von stdout und stderr zusammen, etwa `Exit 1, unknown argument: --pruefen`):

  ```
  - Abgelöst: <topic> <NN> Punkt <n> durch seite 03 Punkt <m>, Ausgabe dann genau `Exit <k>, <letzte Zeile>` (Tech Lead, 2026-11-14)
  ```

  `<m>` ist der Punkt dieses Goals, der denselben Zweck mit den neuen Namen prüft (Punkt 1 für die SOLL-Werkzeuge, Punkt 2 für den
  Block, Punkt 4 für die Adressliste). Die Goal-Dateien selbst bleiben eingefroren. Die Zeile im Progress Log nennt die Zahl der
  abgelösten Befehle je Goal.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check`, vitest und die SOLL-Werkzeuge im Vordergrund mit eigenem Timeout. Die SOLL-
  Werkzeuge brauchen Chromium aus `~/.cache/ms-playwright/` und laufen deshalb nicht in `check`.
- Rollout: `src/public/index.html` liegt im Laufzeitpfad, der Merge rollt über `deploy.yml` aus; die Seite sieht danach gleich aus.
  Die Live-Prüfung macht der Release Manager.
- Was danach schneller zu mehr zahlenden Automatons führt: nichts direkt. Das Goal schließt einen Regelbruch, damit die Linsen bei
  den nächsten Goals der Seite und des Kontos nicht an alten deutschen Namen hängen, die ein Goal-Text vorgegeben hat.

## Done Condition
- [ ] Die drei SOLL-Werkzeuge nehmen `--check`, lehnen `--pruefen` ab, ohne ein Bild zu schreiben, und melden gegen dieselben Bilder
      dieselben Werte wie vorher, als englische Zeile.
      Prüfung: `pnpm -s vitest run test/soll` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/soll-flags.test.ts` muss mindestens 3 ausgeben (je ein Fall für `ops/soll.mjs`, `ops/soll-handoff.mjs` und `ops/soll-konto.mjs`).
      Prüfung: `for t in soll soll-handoff soll-konto; do node ops/$t.mjs --pruefen >/dev/null 2>&1; echo "$t exit=$?"; done; git status --porcelain -- docs/soll | wc -l` muss genau die vier Zeilen `soll exit=1`, `soll-handoff exit=1`, `soll-konto exit=1` und `0` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; for t in soll soll-handoff soll-konto; do a=$(cd $T && node ops/$t.mjs --pruefen | tail -1 | sed -E 's/^(soll[a-z ]*): ([0-9]+) Bilder, ([a-z]+) oben (.*), ([0-9]+) Mängel$/\1: \2 pictures, \3 top \4, \5 defects/; s/=fehlt/=missing/g; s/ umzug top / move top /'); b=$(node ops/$t.mjs --check | tail -1); [ -n "$b" ] && [ "$a" = "$b" ] && echo "$t gleich: $b" || echo "$t anders: $a | $b"; done` muss genau drei Zeilen ausgeben, die mit `soll gleich: soll: 2 pictures, move top `, `soll-handoff gleich: soll handoff: 6 pictures, freigabe top ` und `soll-konto gleich: soll konto: 4 pictures, passkey top ` beginnen und je auf `, 0 defects` enden.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live.mjs --out $T/s.html && node ops/soll.mjs --check --source $T/s.html | tail -1` muss Exit 0 haben und `soll: 2 pictures, move top 390=<y> 1440=<y>, 0 defects` ausgeben.
      Prüfung: `T=$(mktemp -d); node --import tsx ops/soll-live-handoff.mjs --out $T && node ops/soll-handoff.mjs --check --source $T | tail -1; U=$(mktemp -d); node --import tsx ops/soll-live-konto.mjs --out $U && node ops/soll-konto.mjs --check --source $U | tail -1` muss Exit 0 haben und genau die zwei Zeilen `soll handoff: 6 pictures, freigabe top 390=<y> 1440=<y>, 0 defects` und `soll konto: 4 pictures, passkey top 390=<y> 1440=<y>, 0 defects` ausgeben.
- [ ] Der Block oben auf der Startseite und in ihrer Vorlage heißt `move`, sonst ändert sich in beiden Dateien kein Zeichen, kein Bild
      ändert sich, und die Tests am Block prüfen weiter dasselbe.
      Prüfung: `grep -c 'id="move" data-soll="move"' src/public/index.html docs/soll/src/startseite.html` muss genau `src/public/index.html:1` und `docs/soll/src/startseite.html:1` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); for f in src/public/index.html docs/soll/src/startseite.html; do a=$(git diff -U0 $B HEAD -- $f | grep -E '^-[^-]' | cut -c2- | sed 's/umzug/move/g'); b=$(git diff -U0 $B HEAD -- $f | grep -E '^\+[^+]' | cut -c2-); [ -n "$b" ] && [ "$a" = "$b" ] || echo "mehr $f"; done; git diff --name-only $B HEAD -- 'docs/soll/*.png' 'docs/soll/src/handoff-*' 'docs/soll/src/konto-*' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); for f in $(git diff --name-only --diff-filter=M $B HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show $B:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff --name-only --diff-filter=AM $B HEAD -- test | xargs -r grep -nE '\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `pnpm -s vitest run test/public.test.ts test/depth.test.ts test/fix-page.test.ts test/landing-move.test.ts test/landing-human.test.ts test/catalog-page.test.ts test/landing-german.test.ts test/og-card.test.ts test/readme.test.ts` muss Exit-Code 0 haben.
- [ ] Die Tests der Domains und der Sandbox-API lesen den Vertrag über `CONTRACT_FILE`, und ihre Kommentare sind englisch mit Verweis
      auf die Zeile in `docs/sandbox/vertrag.md`.
      Prüfung: `git grep -n -w VERTRAG -- src ops test | wc -l` muss `0` ausgeben, und `grep -c 'const CONTRACT_FILE = ' test/domains.test.ts test/sandbox-api.test.ts` muss genau `test/domains.test.ts:1` und `test/sandbox-api.test.ts:1` ausgeben.
      Prüfung: `grep -hE '^\s*(//|\*)' test/domains.test.ts test/sandbox-api.test.ts | grep -ciE '[äöüß]|\b(oder|je|Eintrag|Fehler|Antwort|nur|löst|kein|Werkzeug|und|der|die|das|ein|eine)\b'` muss `0` ausgeben, und `grep -cE '^\s*//.*docs/sandbox/vertrag\.md:[0-9]+' test/domains.test.ts` muss mindestens `6` ausgeben.
      Prüfung: `pnpm -s vitest run test/domains.test.ts test/sandbox-api.test.ts` muss Exit-Code 0 haben.
- [ ] Die Adressliste führt die Arten `invented` und `own`, Liste und Test ändern sich nur gemeinsam, und `.gitignore` kommentiert
      englisch.
      Prüfung: `git grep -n -w -E 'erfunden|eigene' -- ops/known-ips.txt test/known-ips.test.ts ops/README.md | wc -l` muss `0` ausgeben.
      Prüfung: `grep -vE '^(#|$)' ops/known-ips.txt | grep -cvE '^([0-9]{1,3}\.){3}[0-9]{1,3} (datacenter|crawler|invented|own) [^ ].*$'` muss `0` ausgeben, und `grep -cE '^([0-9]{1,3}\.){3}[0-9]{1,3} (invented|own) ' ops/known-ips.txt` muss mindestens `2` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); for c in $(git log --no-merges --format=%H $B..HEAD -- ops/known-ips.txt test/known-ips.test.ts); do n=$(git show --name-only --format= $c -- ops/known-ips.txt test/known-ips.test.ts | wc -l); [ "$n" -eq 2 ] || echo "allein $c"; done` muss nichts ausgeben.
      Prüfung: `CP_FETCHER_CACHE=$(mktemp) pnpm -s vitest run test/known-ips.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -E '^#' .gitignore | grep -ciE '[äöüß]|\b(aus|von|der|die|nie|liegt|unter|im|Adressen|echter|Besucher|importiert)\b'` muss `0` ausgeben.
- [ ] Jeder Prüfbefehl eines fertigen Goals, den die Umbenennung ändert, ist mit seiner neuen Ausgabe als abgelöst eingetragen.
      Prüfung: `q=$(printf '\140'); for f in $(git grep -l -E -- '--pruefen|Mängel|umzug oben|umzugBottom|erfunden' -- 'goals/*/[0-9][0-9]-*.md' | grep -v '^goals/seite/03-'); do [ "$(sed -n '/^## Status/{n;p;q}' $f)" = DONE ] || continue; grep -E '^\s+Prüfung' $f | grep -qE -- '--pruefen|Mängel|umzug oben|umzugBottom|erfunden' || continue; t=$(basename $(dirname $f)); n=$(basename $f | cut -c1-2); grep -qE "^- Abgelöst: $t $n Punkt [0-9]+ durch seite 03 Punkt [0-9]+, Ausgabe dann genau ${q}Exit [0-9]+, " goals/$t/ANNAHMEN.md 2>/dev/null || echo "fehlt $t $n"; done` muss nichts ausgeben.
      Prüfung: `q=$(printf '\140'); cat goals/seite/ANNAHMEN.md goals/konto/ANNAHMEN.md goals/fehler/ANNAHMEN.md 2>/dev/null | grep -E '^- Abgelöst: .* durch seite 03 ' | grep -vcE " durch seite 03 Punkt [124], Ausgabe dann genau ${q}Exit [0-9]+, [^${q}]*${q} \\(Tech Lead, 2026-11-14\\)\$"` muss `0` ausgeben.
- [ ] Keiner der alten Namen steht am Goal-Branch noch in Code, Test oder Log-Zeile.
      Prüfung: `git grep -n -E -- '--pruefen|umzugBottom|"fehlt"|\bumzug\b|[0-9]+ Bilder|Bilder,|Mängel|=fehlt' -- src ops test ':!test/soll-flags.test.ts' | wc -l` muss `0` ausgeben.
      Prüfung: `git grep -n -E -- '--pruefen|data-soll="umzug"|id="umzug"' -- docs/soll | wc -l` muss `0` ausgeben.
- [ ] Der Diff bleibt in den Pfaden dieses Goals, unter `src/` ändert sich nur die Startseite, jeder geänderte Test trug vorher einen
      der alten Namen, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(src/public/index\.html|docs/soll/src/startseite\.html|docs/soll/README\.md|ops/soll(-assess|-handoff|-konto|-live|-live-handoff|-live-konto)?\.mjs|ops/known-ips\.txt|ops/README\.md|\.gitignore|test/[a-z0-9-]+\.test\.ts|goals/(seite|konto|fehler)/ANNAHMEN\.md|goals/seite/03-[a-z0-9-]+\.md|goals/seite/verdicts/[A-Za-z0-9._-]+\.md|goals/_vorschlaege/seite-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src | grep -vx 'src/public/index.html' | wc -l` muss `0` ausgeben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); for f in $(git diff --name-only $B HEAD -- test); do [ "$f" = test/soll-flags.test.ts ] && continue; git show $B:$f 2>/dev/null | grep -qE -- '--pruefen|umzugBottom|"fehlt"|umzug|VERTRAG|vertrag\.md row|erfunden|eigene|Bilder|Mängel' || echo "fremd $f"; done` muss nichts ausgeben.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer im Repo nach `--pruefen`, `umzug`, `VERTRAG`, `erfunden` oder `eigene` sucht, findet sie nur noch in Goal-Dateien, Verdicts,
      Vorschlägen und Doku für Matthias.
- [ ] Die Startseite auf `postyourprice.com` sieht nach dem Rollout aus wie vorher, und alle drei SOLL-Werkzeuge melden gegen ihre
      abgenommenen Bilder 0 Mängel.
- [ ] Das nächste Audit führt jeden alten Prüfbefehl der fünf fertigen Goals als ABGELÖST oder GRÜN, keinen als ROT.
- [ ] Kein Gedankenstrich, keine Adresse, kein Name und keine Wallet eines Kunden, keine Zahl ohne Befehl.

## Deny List
- `src/**` außer `src/public/index.html`, ausdrücklich `src/payments/**`, `src/auth/**` und `src/app.ts`
- `docs/soll/*.png`, `docs/soll/src/handoff-*`, `docs/soll/src/konto-*`: die abgenommenen Bilder und Vorlagen; an
  `docs/soll/src/startseite.html` nur `umzug` zu `move`
- alle Goal-Dateien außer dieser, ausdrücklich die fertigen Goals von seite, konto, fehler und domains (eingefroren; abgelöst wird
  nur über `ANNAHMEN.md`); Verdicts anderer Goals; bestehende Vorschläge, neue nur anlegen
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `docs/kette.md`, `ops/prompts/**`, `.github/**`,
  `scripts/check.mjs`, `deploy/**`, `harness/**`, `ops/own-ips.txt`, `ops/access-log.sh`, `ops/conway-series.sh`,
  `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- `docs/sandbox/vertrag.md`: die Tests verweisen auf ihn, er bleibt
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- kein Schreiben auf dem Server, kein Rollout von Hand, kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- keine Adresse eines echten Besuchers in Fixture, Test, Doku, Commit oder Kommentar
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
keine
