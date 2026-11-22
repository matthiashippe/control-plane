# Karte Goal 03: Kauft jemand per Karte, und denkt sein Automaton danach?

## Status
PLANNED

## Active Objective
Seit karte 02 steht der Weg zur Kasse von Digistore24 auf der Startseite (Block `card` direkt nach dem Umzug), im README, im Plugin
(`card_top_up`) und in der 402 bei leerem Saldo (`card_url`), und die drei Pakete zu 5, 20 und 50 EUR sind freigegeben. Ob das
Zahler bringt, weiß noch niemand. Nach diesem Goal steht in `docs/kunden/karte-2026-11.md` gemessen, was in den sieben Tagen nach dem
Rollout von karte 02 geschah: wie viele fremde Adressen den Block sahen, wie viele zur Kasse klickten, wie viele Käufe je Paket
ankamen, wie viele erstattet wurden und wie viele Käufer danach mit diesem Guthaben Inferenz liefen, als Summen ohne Adresse, dazu
ein Ergebnis aus `kauft und denkt`, `kauft, denkt nicht`, `klickt, kauft nicht`, `klickt nicht`. Jedes andere Ergebnis als
`kauft und denkt` wird ein Vorschlag für das Folge-Glied, der genau den Schritt nennt, an dem es hängt. Gemessen wird mit einem neuen
Werkzeug `ops/card-funnel.sh`, das nur liest und in beide Richtungen bewiesen ist.
Leitzahl: fremde Käufe per Karte je Woche (`ops/card-funnel.sh`, Zeilen `ORDERS`) und die Käufer, die danach Inferenz laufen (Zeile
`BUYERS`).
Widerlegt, wenn in den sieben Tagen keine fremde Adresse den Block `card` sieht (dann ist auch karte 02 widerlegt: Der Block sitzt an
der falschen Stelle) oder Käufe ankommen und kein Käufer danach denkt (dann hängt es nach der Kasse, nicht davor).
MVP: Funktion, weil erst die Messung zeigt, ob die Karte Zahler bringt und an welchem Schritt das nächste Glied ansetzen muss.

## Voraussetzungen
- karte Goal 02 DONE
- frühestens 2026-11-30

## Kontext für den Maker
- Ziel in einem Satz: Wir wissen gemessen, ob Menschen ohne Wallet per Karte Guthaben kaufen und ihr Automaton danach damit denkt, und
  an welchem Schritt (sehen, klicken, kaufen, denken) es sonst hängen bleibt, damit das nächste Glied genau dort ansetzt.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Das Ergebnis entscheidet, ob das nächste Glied die Sichtbarkeit
  (werbung), die Kasse (karte) oder den Weg vom Guthaben zur ersten Antwort baut. Ohne Messung baut die Kette blind weiter.
- Quelle: `ROADMAP.md`, Topic `karte`, Glied 03; Grundsatz in `docs/kette.md`, Abschnitt „karte: Guthaben per Karte über
  Digistore24“ (die Adresse des Automatons reist nur in `custom` und in der IPN und steht nie im Repo). Vorgänger
  `goals/karte/02-der-weg-zur-kasse.md` (DONE, Merge `d373269`, PR #378, gemergt am 22.11.2026 um 21:26:31 UTC); der Lauf von
  `deploy.yml` für diesen Merge (Lauf 45072121638) lief beim Schreiben noch. Muster der Messung: `goals/kunden/12-*.md`.
- Warum frühestens 30.11.: Der Rollout von karte 02 kam frühestens am 22.11.2026 gegen 21:45 UTC, das Fenster von sieben Tagen endet
  also frühestens am 29.11. gegen 21:45 UTC, und der Loop Master startet ein Goal mit `frühestens` um 00:00 UTC.
- Rollout: der Job `deploy` des ersten erfolgreichen Laufs von `deploy.yml` auf `dev`, dessen Commit `d373269` enthält und in dem der
  Job `deploy` lief (nicht nur `plan`), nur lesend über `gh run list -R matthiashippe/control-plane --workflow deploy.yml --branch dev`
  und `gh run view <id> -R matthiashippe/control-plane --json headSha,jobs`. Sein `completedAt` ist der Beginn des Fensters, das Ende
  liegt genau 7 mal 24 Stunden später. Liegt das Ende beim Start des Goals noch in der Zukunft (der Rollout kam später, etwa nach
  einem roten Lauf), misst der Maker nicht und nennt das im Kommentar; vor dem Ende ist keine Messung gültig.
- **Werkzeug `ops/card-funnel.sh`** (neu, Bash mit eingebettetem Node wie `ops/card-orders.sh`, das unverändert bleibt, weil karte 01
  und 02 es prüfen). Aufruf `bash ops/card-funnel.sh --since <JJJJ-MM-TTTHH:MM:SSZ> --until <JJJJ-MM-TTTHH:MM:SSZ>`, ohne beide
  Zeiten oder mit einem anderen Argument Exit 2 mit einer Zeile `usage: …` vor jedem Aufruf ins Netz. Es gibt genau diese sieben
  Zeilen aus, in dieser Reihenfolge:
  `CARD since <since> until <until>`
  `VIEWS: <n> requests for /px/card.png from <a> outside addresses`
  `CLICKS: <n> requests for /card/ from <a> outside addresses`
  je Paket in der Reihenfolge von `CARD_PACKAGES` (771278, 771279, 771280) eine Zeile
  `ORDERS <product_id>: live <n> booked <n> reversed <n> unassigned <n> pending_rate <n>`
  `BUYERS: <b> automatons bought by card, <d> of them ran inference after their first card order, <i> inference rows`
  - `VIEWS` und `CLICKS` aus dem ganzen Zugriffslog (`ops/access-log.sh`), nur Zeilen mit Zeit in `[since, until)`, ohne eigene
    Adressen (`ops/own-ips.sh`, `own_ips`) und ohne bekannte Crawler, wie `ops/depth.sh` sie ausfiltert. `CLICKS` zählt nur
    Anfragen an `/card/<paket>`, die mit einem Status 300 bis 399 beantwortet wurden: Die Weiterleitung baut wache 01; ohne sie
    antwortet der Pfad mit 404, und ein Klick auf einen Knopf von karte 02 verlässt die Seite ohne Spur bei uns (karte 02,
    Entscheidung 8).
  - `ORDERS` und `BUYERS` aus `card_orders` und `ledger` im laufenden Container `cp`, geöffnet mit `readonly: true`, nur Bestellungen
    mit `mode = 'live'` und `created_at` in `[since, until)`. Stand ist `--until`: Eine Bestellung zählt als `reversed` nur, wenn ihr
    `updated_at` vor `--until` liegt, sonst unter dem Status, den sie davor hatte (`booked`, weil `credited_mc` größer 0 ist), damit
    eine spätere Erstattung die gemessene Zeile nicht ändert. Ein Käufer ist eine Adresse mit mindestens einer solchen Bestellung mit
    `credited_mc` größer 0; er denkt, wenn `ledger` für seine Adresse eine Zeile `kind = 'inference'` mit `created_at` nach seiner
    ersten Kartenbestellung und vor `--until` hat; `<i>` zählt diese Zeilen über alle Käufer. Die Spalte `address` verlässt den
    Container nie, kein Betrag erscheint in der Ausgabe.
  - `--selftest` ohne Netz: ein Zugriffslog unter `ops/fixtures/card-funnel-*.log` (nur Dokumentationsadressen aus `192.0.2.0/24`,
    `198.51.100.0/24` und `203.0.113.0/24`, eine davon im Selbsttest über `CP_OWN_IPS` als eigene gesetzt) und eine Datenbank aus
    `ops/fixtures/card-funnel.sql`, die der Selbsttest in eine Datenbank im Speicher lädt; dieselbe Abfrage wie in der Produktion
    läuft dagegen. Gepflanzt sind mindestens: eine eigene und eine fremde Sichtung, ein Crawler, ein Klick mit 302 und einer mit 404,
    je Paket eine Live-Bestellung, eine Testbestellung, eine Bestellung, die vor `--until` erstattet wurde, und eine, die erst danach
    erstattet wurde, ein Käufer mit Inferenz nach dem Kauf, einer nur mit Inferenz davor und eine Bestellung `unassigned`. Die
    erwarteten sieben Zeilen stehen fest im Selbsttest; letzte Zeile `SELFTEST OK`, sonst `SELFTEST FAILED: <was>` und Exit 1.
  - `test/card-funnel.test.ts` (vitest, ohne Netz, ohne Port) fährt das Werkzeug gegen dieselben Fixtures mit den Fällen, die der
    Prüfbefehl von Punkt 2 nennt. Jeder Fall war einmal rot, die Zeile im Progress Log sagt, womit.
- `docs/kunden/karte-2026-11.md`, Deutsch, je eine Zeile ab Spalte 0 außerhalb des Codeblocks:
  `Rollout karte 02: <JJJJ-MM-TTTHH:MM:SSZ>, Lauf <id>, Commit <sha7>` (Zeit genau wie `completedAt` des Jobs `deploy`);
  `Gemessen: <JJJJ-MM-TTTHH:MM:SSZ>` (nach dem Ende des Fensters);
  `Klicks gezählt ab: <JJJJ-MM-TTTHH:MM:SSZ>` (`completedAt` des Jobs `deploy` des Rollouts von wache 01, wenn er im Fenster liegt,
  sonst der Beginn des Fensters, wenn wache 01 schon davor ausgerollt war) oder `Klicks gezählt ab: nie` (wache 01 war bis zum Ende
  des Fensters nicht ausgerollt);
  ein Codeblock mit der Zeile `$ bash ops/card-funnel.sh --since <Rollout> --until <Rollout plus 7 Tage>` und darunter der
  vollständigen, unveränderten Ausgabe;
  `Karte in 7 Tagen: <a> fremde Adressen sahen den Block, <c> Klicks, <k> Käufe (5 EUR <x>, 20 EUR <y>, 50 EUR <z>), <e> erstattet, <d> von <b> Käufern denken danach`
  (a aus `VIEWS`, c aus `CLICKS`, x, y und z die Felder `live` der drei Zeilen `ORDERS`, k ihre Summe, e die Summe der Felder
  `reversed`, b und d aus `BUYERS`);
  `Ergebnis: <Wort>, weil <Beleg>`, mit dem ersten zutreffenden Wort dieser Reihenfolge: `kauft und denkt` (d größer 0),
  `kauft, denkt nicht` (b größer 0), `klickt, kauft nicht` (c größer 0), sonst `klickt nicht`. Der Beleg nennt bei `klickt nicht`
  auch, ob fremde Adressen den Block sahen und ob Klicks überhaupt messbar waren.
- Vorschlag für das Folge-Glied: Bei jedem Ergebnis außer `kauft und denkt` genau eine Zeile
  `Vorschlag: goals/_vorschlaege/karte-kritik-<JJJJ-MM-TT>-<n>.md`, der Vorschlag im Format des Skills `loop-regeln` mit
  `Schwere: 4`, `Goal: karte 03` und einer Empfehlung für ein Glied mit der Leitzahl fremde Käufe per Karte je Woche, die genau den
  hängenden Schritt nennt: bei `kauft, denkt nicht` den Weg vom gebuchten Guthaben zur ersten Inferenz (der Maker liest dafür, ob die
  Runtime am Pin `d8f8168` nach einer 402 von selbst wieder anfragt, Klon wie in kunden 05, Fundstellen als `src/<pfad>.ts:<zeile>`);
  bei `klickt, kauft nicht` die Kasse (Preis, Zahlarten, Sprache); bei `klickt nicht` mit fremden Sichtungen den Block und seine
  Texte, ohne fremde Sichtungen die Stelle und die Wege zur Seite (werbung). Den Vorschlag darf eine Zeile in `docs/kette.md` oder
  `ROADMAP.md` nicht ersetzen; beide bleiben unverändert.
- `goals/karte/ANNAHMEN.md`: Zeilen `- <Datum>, karte 03: …`, mindestens zur Wahl des Rollout-Zeitpunkts, dazu, warum Klicks erst ab
  wache 01 messbar sind und die Zeile `Klicks gezählt ab:` gilt, und dazu, warum eine Inferenz nach dem ersten Kartenkauf als Inferenz
  aus Kartenguthaben zählt (ob der Käufer vorher USDC-Guthaben hatte, nur als ja und nein über alle Käufer).
- Zugang und Werkzeuge: `set -a; . ~/.config/control-plane/loop.env; set +a` für die Messung, Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Kein
  Test geht ins Netz oder bindet einen festen Port. Kein Kauf, auch kein Testkauf, kein POST an `/pay/digistore`, kein Aufruf von
  `/card/` oder `/px/card.png` der Produktion durch einen Agent (das wären eigene Zeilen im Messfenster), kein Wert in
  `/opt/control-plane/.env`, kein Rollout und kein Neustart. Code, Bezeichner, Testnamen und Ausgaben des Werkzeugs englisch.

## Done Condition
- [ ] Das Fenster beginnt beim Rollout von karte 02 und endet sieben Tage später, gemessen wird erst danach, und der Beginn der
      Klickzählung liegt im Fenster oder ist `nie`.
      MVP: Funktion, weil eine Messung vor dem Ende des Fensters ein Nein meldet, das nur zu früh war.
      Prüfung: `d=docs/kunden/karte-2026-11.md; r=$(sed -nE 's/^Rollout karte 02: ([0-9T:-]+Z), .*/\1/p' "$d"); u=$(date -u -d "@$(( $(date -u -d "$r" +%s) + 604800 ))" +%Y-%m-%dT%H:%M:%SZ); g=$(sed -nE 's/^Gemessen: ([0-9T:-]+Z)$/\1/p' "$d"); [ -n "$r" ] && [ "$r" \> "2026-11-22T21:26:31Z" ] && [ "$g" \> "$u" ] && grep -qx "CARD since $r until $u" "$d" && grep -qxF "\$ bash ops/card-funnel.sh --since $r --until $u" "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `grep -cE "^Rollout karte 02: [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z, Lauf [0-9]+, Commit [0-9a-f]{7,40}$" docs/kunden/karte-2026-11.md` muss 1 ausgeben.
      Prüfung: `d=docs/kunden/karte-2026-11.md; r=$(sed -nE 's/^Rollout karte 02: ([0-9T:-]+Z), .*/\1/p' "$d"); u=$(date -u -d "@$(( $(date -u -d "$r" +%s) + 604800 ))" +%Y-%m-%dT%H:%M:%SZ); k=$(sed -nE 's/^Klicks gezählt ab: (.*)$/\1/p' "$d"); c=$(sed -nE 's/^CLICKS: ([0-9]+) .*/\1/p' "$d"); ok=; case "$k" in nie) [ "$c" = 0 ] && ok=1;; 20[0-9][0-9]-*Z) [ ! "$k" \< "$r" ] && [ "$k" \< "$u" ] && ok=1;; esac; [ "$(grep -c '^Klicks gezählt ab: ' "$d")" = 1 ] && [ -n "$ok" ] && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung (Netz): `d=docs/kunden/karte-2026-11.md; set -- $(sed -nE 's/^Rollout karte 02: ([0-9T:-]+Z), Lauf ([0-9]+), Commit ([0-9a-f]+)$/\1 \2 \3/p' "$d"); git merge-base --is-ancestor d373269 "$3" && [ "$(gh run view "$2" -R matthiashippe/control-plane --json headSha -q .headSha | cut -c1-${#3})" = "$3" ] && [ "$(gh run view "$2" -R matthiashippe/control-plane --json jobs -q '.jobs[] | select(.name=="deploy" and .conclusion=="success") | .completedAt')" = "$1" ] && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
- [ ] Das Werkzeug `ops/card-funnel.sh` liest nur, gibt keine Adresse und keinen Betrag aus und ist in beide Richtungen bewiesen.
      MVP: Funktion, weil eine Null ohne Gegenprobe nicht von Blindheit zu unterscheiden ist (`loop-constraints.md`, Grundregel 3).
      Prüfung: `PATH=/usr/bin:$PATH bash ops/card-funnel.sh --selftest 2>&1 | tail -1` muss genau `SELFTEST OK` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-funnel.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "counts views of the card block from outside addresses only" "counts only redirects of /card/ as clicks" "counts live orders per package and leaves test orders out" "counts a refund only when it came before --until" "counts inference only after the first card order of a buyer" "prints no address and no amount" "refuses a window without --since and --until"; do grep -qF "\"$t\"" test/card-funnel.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/card-funnel.sh --since 2026-11-22T00:00:00Z > /dev/null 2>&1; echo "exit=$?"` muss genau `exit=2` ausgeben.
      Prüfung: `grep -cE '\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b' ops/card-funnel.sh` muss 0 ausgeben.
      Prüfung: `grep -c 'readonly: true' ops/card-funnel.sh` muss mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/card-funnel.sh --selftest 2>&1 | grep -cE '0x[0-9a-fA-F]{40}|([0-9]{1,3}\.){3}[0-9]{1,3}|[0-9] ?(USD|EUR|cents|mc)\b'` muss 0 ausgeben.
- [ ] Was in den sieben Tagen geschah, steht gemessen in `docs/kunden/karte-2026-11.md`, mit dem Ergebnis aus der Kette und, wenn
      niemand kauft und denkt, dem Vorschlag für das Folge-Glied.
      MVP: Funktion, weil das Ergebnis entscheidet, ob das nächste Glied die Sichtbarkeit, die Kasse oder den Weg zur ersten Antwort baut.
      Prüfung: `grep -cE "^(CARD since [0-9T:-]+Z until [0-9T:-]+Z|VIEWS: [0-9]+ requests for /px/card\.png from [0-9]+ outside addresses|CLICKS: [0-9]+ requests for /card/ from [0-9]+ outside addresses|ORDERS (771278|771279|771280): live [0-9]+ booked [0-9]+ reversed [0-9]+ unassigned [0-9]+ pending_rate [0-9]+|BUYERS: [0-9]+ automatons bought by card, [0-9]+ of them ran inference after their first card order, [0-9]+ inference rows)$" docs/kunden/karte-2026-11.md` muss 7 ausgeben.
      Prüfung: `d=docs/kunden/karte-2026-11.md; awk '/^VIEWS: /{a=$7} /^CLICKS: /{c=$2} /^ORDERS 771278: /{x=$4} /^ORDERS 771279: /{y=$4} /^ORDERS 771280: /{z=$4} /^ORDERS [0-9]+: /{e+=$8} /^BUYERS: /{b=$2; d=$7} END{printf "Karte in 7 Tagen: %d fremde Adressen sahen den Block, %d Klicks, %d Käufe (5 EUR %d, 20 EUR %d, 50 EUR %d), %d erstattet, %d von %d Käufern denken danach\n", a, c, x+y+z, x, y, z, e, d, b}' "$d" | grep -qxFf - "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `d=docs/kunden/karte-2026-11.md; e=$(awk '/^CLICKS: /{c=$2} /^BUYERS: /{b=$2; t=$7} END{if(t>0)print "kauft und denkt"; else if(b>0)print "kauft, denkt nicht"; else if(c>0)print "klickt, kauft nicht"; else print "klickt nicht"}' "$d"); [ "$(grep -cE '^Ergebnis: ' "$d")" = 1 ] && grep -qF "Ergebnis: $e, weil " "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `d=docs/kunden/karte-2026-11.md; if grep -q "^Ergebnis: kauft und denkt, weil " "$d"; then echo entfaellt; else p=$(sed -nE 's/^Vorschlag: (goals\/_vorschlaege\/karte-kritik-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+\.md)$/\1/p' "$d" | head -1); [ -n "$p" ] && [ -f "$p" ] && head -1 "$p" | grep -qx "Schwere: 4" && grep -qx "Goal: karte 03" "$p" && grep -q "^Empfehlung: " "$p" && echo belegt || echo fehlt; fi` muss `belegt` oder `entfaellt` ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; d=docs/kunden/karte-2026-11.md; r=$(sed -nE 's/^Rollout karte 02: ([0-9T:-]+Z), .*/\1/p' "$d"); u=$(date -u -d "@$(( $(date -u -d "$r" +%s) + 604800 ))" +%Y-%m-%dT%H:%M:%SZ); diff <(bash ops/card-funnel.sh --since "$r" --until "$u" 2>/dev/null | grep -E '^(ORDERS|BUYERS) ') <(grep -E '^(ORDERS|BUYERS) ' "$d")` muss nichts ausgeben.
- [ ] Nichts im Repo nennt eine Wallet, eine fremde IP-Adresse oder einen Betrag je Kunde, Dienst und fertige Werkzeuge bleiben
      unverändert, der Diff bleibt in den Pfaden dieses Goals, und die Annahmen stehen fest.
      MVP: Funktion, weil das Repo öffentlich ist (`loop-constraints.md`, Grundregel 8) und das Folge-Glied wissen muss, wie gezählt wurde.
      Prüfung: `cat docs/kunden/karte-2026-11.md goals/karte/ANNAHMEN.md ops/fixtures/card-funnel* $(grep -ohE "goals/_vorschlaege/karte-kritik-[0-9-]+\.md" docs/kunden/karte-2026-11.md | sort -u) | grep -cE "0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `cat docs/kunden/karte-2026-11.md ops/fixtures/card-funnel* $(grep -ohE "goals/_vorschlaege/karte-kritik-[0-9-]+\.md" docs/kunden/karte-2026-11.md | sort -u) | grep -oE "([0-9]{1,3}\.){3}[0-9]{1,3}" | grep -cvE "^(192\.0\.2|198\.51\.100|203\.0\.113)\."` muss 0 ausgeben.
      Prüfung: `grep -cE "[0-9]+([.,][0-9]+)? ?(USD|USDC|cents|mc)\b|[$][0-9]" docs/kunden/karte-2026-11.md` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src deploy ops/card-orders.sh ops/digistore.mjs ops/digistore-release.mjs ops/access-log.sh ops/own-ips.sh ops/own-ips.txt | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(ops/card-funnel\.sh|ops/fixtures/card-funnel[a-z0-9.-]*|test/card-funnel\.test\.ts|docs/kunden/karte-2026-11\.md|goals/karte/.*|goals/_vorschlaege/karte-kritik-[0-9-]+\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+, karte 03: ' goals/karte/ANNAHMEN.md` muss mindestens 3 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Kein Aufruf in der Produktion, der etwas anlegt, bucht oder eine Zeile ins Messfenster schreibt; gelesen wird nur über
      `ops/card-funnel.sh`, `ops/access-log.sh` und `gh` gegen GitHub.
- [ ] Die Ausgabe im Codeblock ist genau die des Werkzeugs, ungekürzt und unverändert.
- [ ] Dokument, Goal-Datei, Vorschlag und `ANNAHMEN.md` Deutsch, kein Gedankenstrich, keine Adresse und kein Name eines Kunden.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/**`: unverändert; dieses Goal misst und baut am Dienst nichts
- `ops/card-orders.sh`, `ops/digistore.mjs`, `ops/digistore-release.mjs`, `ops/access-log.sh`, `ops/own-ips.sh`, `ops/own-ips.txt`,
  `ops/depth.sh` und jedes andere bestehende Werkzeug unter `ops/`: nur lesen und aufrufen
- `docs/kunden/*.md` außer `docs/kunden/karte-2026-11.md`, `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**`, `docs/soll/**`,
  bestehende Goal-Dateien und Vorschläge: nur lesen
- jeder Kauf und Testkauf, jede Erstattung, jede Änderung an Produkten, Rückgaberegeln oder IPN-Verbindungen im Konto von
  Digistore24, jeder POST an `/pay/digistore`, jeder Abruf von `/card/` oder `/px/card.png` der Produktion, jeder Kontakt zum
  Betreiber eines Automatons (`third_party_mail`)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
