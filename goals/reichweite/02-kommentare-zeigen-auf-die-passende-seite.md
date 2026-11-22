# Reichweite Goal 02: Unsere Kommentare zeigen auf die passende Seite

## Status
ACTIVE

## Active Objective
Unsere Kommentare in `Conway-Research/automaton` sind der einzige Weg, auf dem Betroffene heute von den Conway-Issues zu uns
kommen, und sie zeigen auf Adressen, die nur noch auf die Startseite weiterleiten. Am 22.11.2026 hat das Konto `matthiashippe` dort
30 Kommentare in 30 Threads, 29 davon mit einem Link auf `postyourprice.com` oder `cp.hippe.eu`
(`gh api -X GET search/issues -f q='repo:Conway-Research/automaton commenter:matthiashippe'`, dann je Thread die Kommentare des
Kontos). Nach diesem Goal zeigt jeder dieser Links auf `automatonhost.com`: ein Link auf die bloße Adresse im Fließtext auf die Seite
aus reichweite 01, die zum Fehler des Issues passt, sonst auf `https://automatonhost.com`; ein Link mit Pfad (`/fix`, `/v1/status`)
und jede Adresse in Code (die Zeile `conwayApiUrl`) auf denselben Pfad unter `https://automatonhost.com`. Der übrige Text jedes
Kommentars bleibt Zeichen für Zeichen. Das Werkzeug `ops/relink-comments.py` zeigt im Trockenlauf je Kommentar alten und neuen
Link und den Wert `sha12` des neuen Texts, ändert erst nach dem „ok relink“ des Tech Lead mit genau diesen Werten (LOOP.md,
Kommentare in fremden Repos), nur eigene Kommentare per PATCH, liest jeden zurück und vergleicht. Kein neuer Kommentar.
Leitzahl: Ankünfte von github.com je Woche (`ops/error-pages-arrivals.mjs`, Feld `github`, für `/errors/`; `ops/github-yield.sh`
für alle Seiten).
Widerlegt, wenn vier Wochen nach der Änderung keine einzige Ankunft von github.com auf `/errors/` kommt; dann prüft der Kurs-Check,
ob die Kommentare noch gelesen werden, bevor weitere Kommentare bearbeitet oder neue geschrieben werden.
MVP: Funktion, weil ein Betroffener dann direkt auf der Seite zu seinem Fehler landet statt auf einer Weiterleitung zur Startseite.

## Voraussetzungen
- reichweite Goal 01 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Betreiber, der im Conway-Issue zu seinem Fehler unseren Kommentar liest und auf den Link klickt, landet
  auf der Seite, die genau seinen Fehlertext als Überschrift trägt und die eine Zeile zeigt, mit der sein Automaton bei uns
  weiterläuft.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Jeder der 29 Links wird ein direkter Weg auf eine Seite mit der
  Zeile `conwayApiUrl`, und die Fehlerseiten bekommen Verweise von github.com, die Suchmaschinen lesen. reichweite 03 (das Video)
  erreicht die Issues über genau diese Links. Quelle: `ROADMAP.md`, Topic `reichweite`, Glied 02; Hintergrund in
  `docs/research/2026-11-22-conway-marketing.md`, Abschnitt „Übertragbar auf uns“, Punkte 1 und 2.
- Keine Fläche der Website ändert sich, deshalb kein SOLL-Bild: Die Links zeigen auf Seiten, die reichweite 01 gebaut hat und die
  es schon gibt (`/errors/<slug>`, `/fix`, `/v1/status`, `/`), `src/**` bleibt unverändert. Die Links tragen keinen Schrägstrich am
  Ende, weil `/errors/<slug>/` heute 404 antwortet (`goals/_vorschlaege/reichweite-kritik-2026-11-22-1.md`).
- **Bestand und Entscheidungen des Tech Lead (22.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile
  `- 2026-11-22, reichweite 02: …` (Datum des Baus) in `goals/reichweite/ANNAHMEN.md`.
  1. Zwei Dateien nach dem Muster von `ops/post-the-answers.py` und `ops/answers_args.py`: die Regeln als reine Funktionen in
     `ops/relink_rules.py` (Python 3.12, nur Standardbibliothek, importierbar, ohne Netz), das Werkzeug mit GitHub-Zugriff in
     `ops/relink-comments.py`. `ops/post-the-answers.py`, `ops/before-the-answers.py`, `ops/answers_args.py` und
     `ops/posted-answers.log` bleiben unverändert, weil sie neue Kommentare posten und dieses Goal keinen postet.
  2. `relink(body, slug)` ersetzt jede Fundstelle des Musters
     `(https?://)?(www\.)?(postyourprice\.com|cp\.hippe\.eu)(/<Pfad>)?` (Groß- und Kleinschreibung egal; Pfad ohne Leerzeichen,
     `)`, `]`, `>`, `"`, `'` und Backtick, Satzzeichen `.`, `,`, `;`, `:`, `!`, `?` am Ende gehören nicht zum Link) und nichts sonst:
     - im Fließtext ohne Pfad oder mit Pfad `/`: `https://automatonhost.com/errors/<slug>`, bei `slug` gleich `None`
       `https://automatonhost.com`;
     - im Fließtext mit Pfad: `https://automatonhost.com<Pfad>`;
     - in Code (zwischen Zeilen mit drei Backticks oder in einem Paar einfacher Backticks): `https://automatonhost.com<Pfad>`, ohne
       Pfad `https://automatonhost.com`, weil dort die Konfigzeile `"conwayApiUrl": "https://postyourprice.com"` oder ein Aufruf
       der API steht und eine Fehlerseite dort die Runtime bräche.
     Alles außerhalb der Fundstellen bleibt Zeichen für Zeichen, auch die Namen PostYourPrice und Handsel in den
     Disclosure-Zeilen und die Links auf `github.com/matthiashippe/…`, weil die ROADMAP den übrigen Text Wort für Wort festlegt.
  3. `page_for_title(title)` wählt die Seite nach dem Titel des Issues, dem Text, nach dem Betroffene suchen: Von den drei Mustern
     `nonce|\b401\b` (`invalid-or-expired-nonce`), `database error|\b500\b` (`verify-500-database-error`) und
     `credit|top-?ups?\b` (`credits-never-granted`), Groß- und Kleinschreibung egal, gewinnt das, dessen erster Treffer im Titel
     am weitesten vorn steht; ohne Treffer `None`. Die Slugs liest `ops/relink_rules.py` als Tupel `SLUGS` aus `src/public/error-pages.ts`
     (Felder `slug:`) wie `ops/error-pages-arrivals.mjs`, damit es keine zweite Liste gibt. Mit den Titeln vom 22.11.2026 ergibt das:
     `verify-500-database-error` für #447, #442, #435, #419, #408, #379, #377, #372, #339; `invalid-or-expired-nonce` für #440,
     #434, #432, #406, #392, #376, #359, #356, #355, #353, #333; `credits-never-granted` für #427, #393, #293; die Startseite für
     #443, #430, #390, #385, #335, #294; #373 hat keinen alten Link und bleibt. Diese Tabelle steht als Fall im Test.
  4. `ops/relink-comments.py`, Repo fest `Conway-Research/automaton`, Konto fest `matthiashippe`, alle Aufrufe über `gh api`:
     - ohne Argument der Trockenlauf: die Threads aus `search/issues` mit `commenter:matthiashippe` (mit `--paginate`), je Thread
       die Kommentare mit `user.login` gleich `matthiashippe`, für jeden mit Fundstelle der neue Text aus `relink` und
       `page_for_title`. Ausgabe je Kommentar die Zeile `comment <id> issue <n> page <slug|home> sha12 <wert>` (die ersten 12
       Hex-Zeichen von sha256 über den neuen Text in UTF-8), darunter je Fundstelle `  - <alt>` und `  + <neu>`; am Ende die Zeilen
       `relink: <k> to change, <u> unchanged, <a> comments of matthiashippe` und
       `send: ops/relink-comments.py --send <k> --approved <id>:<wert>,…`. Er ändert nichts.
     - `--send <k> --approved <id>:<wert>,…`: verweigert mit Exit 1 und ohne einen PATCH, wenn `k` nicht die Zahl der Werte ist,
       wenn ein Kommentar nicht von `matthiashippe` stammt oder wenn der neue Text eines Kommentars jetzt einen anderen Wert hat
       (`REFUSED: <id> changed since it was approved`). Ein Kommentar, dessen Text schon den freigegebenen Wert hat, ist
       `ALREADY <id>` und wird übersprungen, damit ein abgebrochener Lauf wiederholbar ist. Sonst je Kommentar PATCH auf
       `repos/Conway-Research/automaton/issues/comments/<id>` mit genau dem Text, über den der Wert gerechnet wurde, danach Lesen per
       Id und Vergleich Byte für Byte (`DIFFERS <id>` beendet mit Exit 1), dann eine Zeile in `ops/relinked-comments.log`; zwischen
       zwei PATCH `CP_RELINK_GAP_SECONDS` Sekunden (Vorgabe 20). Ein Bearbeiten benachrichtigt keine Abonnenten, deshalb gilt die
       Grenze von drei neuen Kommentaren am Tag hier nicht; der Abstand schützt das Konto vor der Sperre wegen Massenänderung.
     - `--verify`: liest jeden Kommentar aus `ops/relinked-comments.log` per Id und dazu den Trockenlauf; letzte Zeile genau
       `relink verify: <s> same, <d> differ, <o> with old links`, Exit 0 nur bei `d` und `o` gleich 0.
     - Jedes andere Argument endet mit Exit 1, bevor GitHub gefragt wird. GitHub nicht lesbar: Exit 2. Das Werkzeug postet nie,
       schließt nichts und fasst keinen fremden Kommentar an.
  5. `ops/relinked-comments.log` (neu, im Repo wie `ops/posted-answers.log`, weil es eine Handlung nach außen festhält): Kopf aus
     Zeilen mit `#`, je Änderung genau eine Zeile
     `<JJJJ-MM-TTTHH:MM:SSZ> comment <id> issue <n> page <slug|home> old <sha12 des alten Texts> new <sha12 des neuen Texts>`. Keine
     Adresse, kein Name, kein Kommentartext.
- **Freigabe (Punkt 4).** Sind Punkte 1 bis 3 grün, fährt der Maker den Trockenlauf und schreibt die ganze Ausgabe als Kommentar auf
  das Topic dieses Goals, mit Erwähnung des Tech Lead; unter der neuen Zyklus-Zeile im Progress Log steht je Kommentar eine
  eingerückte Zeile `  - https://github.com/Conway-Research/automaton/issues/<n>#issuecomment-<id> page <slug|home> sha12 <wert>:
  <alt> -> <neu>` (der übrige Text ist der heutige Kommentar, Zeichen für Zeichen). Er setzt die Zeile
  `- <Datum>, reichweite 02: Freigabe-Issue relink: PRO-<n>` mit dem Topic in `goals/reichweite/ANNAHMEN.md`, pusht und setzt das
  Child auf `blocked`, Owner Tech Lead; dessen Kommentar weckt ihn. Die Freigabe ist ein Kommentar des Tech Lead, der mit
  `ok relink` beginnt und die Werte `<id>:<wert>` nennt. Erst dann `--send` mit genau diesen Werten, danach `--verify`, dann
  Commit von `ops/relinked-comments.log`. Ändert sich ein Kommentar nach der Freigabe, braucht er eine neue.
- Vor `--send` muss der Deploy von reichweite 01 grün sein (Prüfbefehl `(Netz)` unter Punkt 4), sonst zeigt ein Link auf eine 404.
  Seiten der Produktion ruft der Maker dafür nicht auf; der Beleg ist der Lauf von `deploy.yml` auf GitHub.
- Tests: `test/relink-comments.test.ts` mit einem eigenen Sandkasten nach dem Muster von `test/answers-sandbox.ts` (Kopie der
  Werkzeuge, ein falsches `gh` auf `PATH`, das jeden Aufruf protokolliert, Kommentare aus einer Fixture liefert und PATCH speichert;
  kein Netz, kein Port). Fixtures nur mit erfundenen Texten und den Titeln der 30 Issues; kein Kommentartext eines anderen
  Kontos, kein Name. Jeder neue Test war einmal rot, die Zeile im Progress Log sagt, womit.
- Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `post-the-answers`, `posted-answers` oder `answers_args` nennen
  (`grep -l -E 'post-the-answers|posted-answers|answers_args' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem Bau
  erneut. Wird einer durch dieses Goal rot, fragt der Maker den Tech Lead auf dem Topic mit Befehl und beiden Ausgaben. Kein
  Prüfbefehl eines fertigen Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `python3 -I`, `check` und vitest im Vordergrund mit eigenem
  Timeout, neue Dateien vor dem lokalen `check` stagen. `gh` ist auf dem code-host als `matthiashippe` angemeldet. Code,
  Bezeichner, Testnamen und Ausgaben englisch.

## Done Condition
- [x] `relink` ersetzt jede alte Adresse nach den Regeln aus Entscheidung 2 und lässt jedes andere Zeichen stehen.
      MVP: Funktion, weil die Zeile `conwayApiUrl` in Code eine Fehlerseite nie tragen darf und der Text der Kommentare bleiben muss.
      Prüfung: `python3 -I -c 'import sys; sys.path.insert(0, "ops"); from relink_rules import relink; q = chr(96) * 3; t = chr(96); b = "Disclosure: I run Handsel (https://postyourprice.com), see https://cp.hippe.eu/fix, or https://cp.hippe.eu.\n\n" + q + "json\n\"conwayApiUrl\": \"https://postyourprice.com\"\n" + q + "\n\nand " + t + "https://postyourprice.com/v1/status" + t + ", or http://www.postyourprice.com/ here, source https://github.com/matthiashippe/control-plane.\n"; w = lambda o: "Disclosure: I run Handsel (" + o + "), see https://automatonhost.com/fix, or " + o + ".\n\n" + q + "json\n\"conwayApiUrl\": \"https://automatonhost.com\"\n" + q + "\n\nand " + t + "https://automatonhost.com/v1/status" + t + ", or " + o + " here, source https://github.com/matthiashippe/control-plane.\n"; bad = [n for n, ok in [("slug", relink(b, "invalid-or-expired-nonce") == w("https://automatonhost.com/errors/invalid-or-expired-nonce")), ("home", relink(b, None) == w("https://automatonhost.com")), ("none", relink("no old link, https://github.com/x", None) == "no old link, https://github.com/x")] if not ok]; print("relink ok" if not bad else "falsch: " + " ".join(bad))'` muss genau `relink ok` ausgeben.
      Prüfung: `python3 -I -c 'import sys; sys.path.insert(0, "ops"); from relink_rules import relink; b = "See HTTPS://CP.HIPPE.EU/fix; and https://www.postyourprice.com!"; print(relink(b, "credits-never-granted"))'` muss genau `See https://automatonhost.com/fix; and https://automatonhost.com/errors/credits-never-granted!` ausgeben.
- [x] `page_for_title` wählt die Seite nach Entscheidung 3, und jeder Slug, den es nennt, steht in `ERROR_PAGES`.
      MVP: Funktion, weil der Link nur dann hilft, wenn er auf den Fehler des Issues zeigt, in dem er steht.
      Prüfung: `python3 -I -c 'import sys; sys.path.insert(0, "ops"); from relink_rules import page_for_title as p; ts = ["Provisioning fails on api.conway.tech: 401 \"Invalid or expired nonce\" and 500 \"Database error\" on POST /v1/auth/verify", "SIWE provisioning fails: /v1/auth/verify returns 500 Database error / 401 Invalid or expired nonce", "$30 USDC paid via EIP-3009 transferWithAuthorization but zero credits delivered - SIWE verify returns 500", "Retry-driven duplicate USDC topups: fresh EIP-3009 nonce + no idempotency key on x402Fetch", "tips for 401", "Conway authentication issue #442"]; print(" ".join(p(x) or "home" for x in ts))'` muss genau `invalid-or-expired-nonce verify-500-database-error credits-never-granted credits-never-granted invalid-or-expired-nonce home` ausgeben.
      Prüfung: `python3 -I -c 'import re, sys; sys.path.insert(0, "ops"); import relink_rules as r; src = set(re.findall(r"slug:\s*\"([a-z0-9-]+)\"", open("src/public/error-pages.ts").read())); used = set(r.SLUGS); print("slugs ok" if used and used <= src and len(used) == 3 else "falsch: " + " ".join(sorted(used - src)))'` muss genau `slugs ok` ausgeben.
- [x] `ops/relink-comments.py` ändert im Trockenlauf nichts, ändert mit `--send` nur freigegebene eigene Kommentare per PATCH, liest
      jeden zurück, schreibt das Protokoll, postet nie und kennt nur seine Argumente.
      MVP: Funktion, weil unter Matthias' Namen nur der Text erscheinen darf, den der Tech Lead mit seinem Wert freigegeben hat.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relink-comments.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "the dry run changes nothing and prints sha12 for every comment it would change" "keeps every character outside the old links" "points a link in code at the same path on automatonhost.com" "maps the titles of 2026-11-22 to their pages" "leaves comments without an old link alone" "never touches a comment of another account" "refuses --send without --approved" "refuses when the count does not match the approved values" "refuses when a comment changed since it was approved" "skips a comment that already carries the approved text" "patches only the approved comments and reads each one back" "stops with DIFFERS when the read back differs" "writes one log line per patch without an address or a text" "verify reports every logged comment as same and no old link left" "never posts a new comment" "exits 1 on an unknown argument before asking GitHub" "exits 2 when GitHub cannot be read"; do grep -qF "\"$t\"" test/relink-comments.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `python3 -I ops/relink-comments.py --sned 3 > /dev/null 2>&1; echo "exit=$?"` muss genau `exit=1` ausgeben.
      Prüfung: `grep -cE '"(-X|--method)", *"POST"|-X POST|--method POST' ops/relink-comments.py` muss `0` ausgeben.
- [x] Der Tech Lead hat genau diese Texte freigegeben, bevor einer geändert wurde, und jeder der Kommentare zeigt danach auf
      `automatonhost.com`, Zeichen für Zeichen wie freigegeben.
      MVP: Funktion, weil erst die geänderten Links Betroffene aus den Issues auf ihre Seite bringen.
      Prüfung (Netz): `git fetch -q origin dev; for s in $(gh run list -R matthiashippe/control-plane --workflow deploy.yml --branch dev --status success -L 50 --json headSha -q '.[].headSha'); do git merge-base --is-ancestor 77b9a54 $s 2>/dev/null && { echo deployed; break; }; done` muss `deployed` ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+, reichweite 02: Freigabe-Issue relink: PRO-[0-9]+$' goals/reichweite/ANNAHMEN.md` muss `1` ausgeben.
      Prüfung: `grep -cvE '^(#.*|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z comment [0-9]+ issue [0-9]+ page (verify-500-database-error|invalid-or-expired-nonce|credits-never-granted|home) old [0-9a-f]{12} new [0-9a-f]{12})$' ops/relinked-comments.log` muss `0` ausgeben.
      Prüfung: `grep -cE '^[0-9]{4}-.* comment [0-9]+ ' ops/relinked-comments.log` muss mindestens `29` ausgeben.
      Prüfung (Netz): `i=$(sed -n 's/^- [0-9-]*, reichweite 02: Freigabe-Issue relink: //p' goals/reichweite/ANNAHMEN.md); f=$(grep -m1 -E '^[0-9]{4}-' ops/relinked-comments.log | cut -d' ' -f1); p=$(grep -E '^[0-9]{4}-' ops/relinked-comments.log | awk '{print $3":"$11}' | paste -sd,); curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/issues/$i/comments" | F="$f" P="$p" node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const f=Date.parse(process.env.F);const need=(process.env.P||"").split(",").filter(Boolean);const ok=JSON.parse(d).filter(c=>c.authorAgentId==="93364eca-e519-4b41-815b-c9b82c42f4d4"&&/^ok relink\b/.test(c.body)&&Date.parse(c.createdAt)<f);const miss=need.filter(x=>!ok.some(c=>c.body.includes(x)));if(!need.length||!ok.length||miss.length){console.error({ok:ok.length,miss});process.exit(1)}console.log("freigabe ok "+need.length)})'` muss `freigabe ok <n>` mit n mindestens 29 ausgeben.
      Prüfung (Netz): `python3 -I ops/relink-comments.py --verify | tail -n 1` muss `relink verify: <s> same, 0 differ, 0 with old links` mit s gleich der Zahl der Protokollzeilen ausgeben.
      Prüfung (Netz): `python3 -I ops/relink-comments.py | grep -E '^relink: '` muss `relink: 0 to change, <u> unchanged, <a> comments of matthiashippe` mit a mindestens 30 ausgeben.
      Prüfung: `grep -cE '^  - https://github\.com/Conway-Research/automaton/issues/[0-9]+#issuecomment-[0-9]+ page [a-z0-9-]+ sha12 [0-9a-f]{12}: ' goals/reichweite/02-kommentare-zeigen-auf-die-passende-seite.md` muss mindestens `29` ausgeben.
- [x] Die Entscheidungen stehen in `goals/reichweite/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg,
      und nichts im Repo nennt eine Adresse oder einen Namen eines Kunden.
      MVP: Funktion, weil reichweite 03 über diese Links die Issues erreicht und wissen muss, welcher Link wohin zeigt.
      Prüfung: `grep -cE '^- [0-9-]+, reichweite 02: ' goals/reichweite/ANNAHMEN.md` muss mindestens `6` ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(ops/relink-comments\.py|ops/relink_rules\.py|ops/relinked-comments\.log|test/relink-[a-z.-]+\.ts|test/fixtures/relink/.*|docs/.*\.md|goals/reichweite/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src ops/post-the-answers.py ops/before-the-answers.py ops/answers_args.py ops/posted-answers.log ops/traffic.sh ops/github-yield.sh ops/error-pages-arrivals.mjs | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss `0` ausgeben.
      Prüfung: `cat ops/relinked-comments.log ops/relink_rules.py ops/relink-comments.py goals/reichweite/ANNAHMEN.md | grep -cE '0x[0-9a-fA-F]{40}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}'` muss `0` ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer in einem Conway-Issue zum Fehler 500, 401 oder zum fehlenden Guthaben auf unseren Link klickt, landet auf der Seite zu
      genau diesem Fehler; die Zeile `conwayApiUrl` in unseren Kommentaren nennt `https://automatonhost.com`.
- [ ] Kein Kommentar bekommt einen neuen Satz, keiner verliert einen, und kein neuer Kommentar entsteht.
- [ ] Kein Gedankenstrich in neuem Text, kein Name und keine Wallet-Adresse eines Kunden, keine Zahl ohne Messung, nichts zu den
      Bedingungen des Einkaufs bei OpenRouter.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `ops/post-the-answers.py`, `ops/before-the-answers.py`, `ops/answers_args.py`, `ops/posted-answers.log`, `ops/traffic.sh`,
  `ops/github-yield.sh`, `ops/error-pages-arrivals.mjs`: bleiben unverändert (Entscheidung 1)
- `ROADMAP.md`, `docs/kette.md`, `docs/soll/**` und die Goal-Dateien anderer Goals; in deren `ANNAHMEN.md` nur Zeilen `Abgelöst:`,
  die der Tech Lead entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- in `Conway-Research/automaton` nur PATCH auf eigene Kommentare nach der Freigabe; kein neuer Kommentar, kein Issue, kein PR,
  keine Reaktion, kein Schließen, kein Löschen; kein anderes fremdes Repo
- kein Aufruf der Produktion (`automatonhost.com`, `76.13.144.207`, Sandbox-Server), auch nicht lesend; der Beleg für den Deploy ist
  `gh run list`
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-22 Zyklus 1: Punkte 1, 2, 3, 6 gebaut (`ops/relink_rules.py`, `ops/relink-comments.py`, `ops/relinked-comments.log` nur mit Kopf, `test/relink-comments.test.ts` mit Sandkasten `test/relink-sandbox.ts` und Fixture), Trockenlauf gegen GitHub zur Freigabe auf PRO-27822 (29 zu ändern, 1 unverändert, 30 Kommentare), Punkt 4 wartet auf das „ok relink“ des Tech Lead, Punkt 5 offen, weil das Muster `test/relink-[a-z-]+\.ts` die von Punkt 3 verlangte Datei `test/relink-comments.test.ts` nicht zulässt. Jeder der 17 Tests war einmal rot, je mit einer Mutation an `ops/relink_rules.py` oder `ops/relink-comments.py` (etwa Satzzeichen am Pfad nicht abgeschnitten, Code als Fließtext, Reihenfolge der Muster vertauscht, Kontoprüfung, Zählprüfung, Wertprüfung, `ALREADY`, Zurücklesen, Adresse im Protokoll, Vergleich in `--verify`, PATCH ohne `-X`, unbekanntes Argument, Exit 2). Prüfbefehle: Punkt 1 `relink ok` und die erwartete Zeile; Punkt 2 die erwartete Zeile und `slugs ok`; Punkt 3 vitest 17 passed, keine fehlende Testzeile, `exit=1`, `0`; Punkt 4 (Netz) `deployed`, Freigabe-Zeile `1`, Protokoll `0` fremde Zeilen und `0` Änderungen, Rest erst nach der Freigabe; Punkt 5 `7` Zeilen, Pfade `1` (die Testdatei), `0`, `0`, `0`; Punkt 6 `check` grün in 104 s; die 61 Prüfbefehle der fertigen Goals kanal 01 bis 04, kunden 04 und 07 ohne Netz am Kopf von `dev` und nach dem Bau mit gleichen Exit-Codes und Ergebnissen.
  - https://github.com/Conway-Research/automaton/issues/447#issuecomment-6835431307 page verify-500-database-error sha12 e7234e5f97ad: https://postyourprice.com -> https://automatonhost.com; https://postyourprice.com -> https://automatonhost.com/errors/verify-500-database-error
  - https://github.com/Conway-Research/automaton/issues/443#issuecomment-6769421243 page home sha12 15a5360da2ff: https://postyourprice.com -> https://automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/442#issuecomment-6769384327 page verify-500-database-error sha12 8759152fdf91: https://postyourprice.com -> https://automatonhost.com/errors/verify-500-database-error
  - https://github.com/Conway-Research/automaton/issues/440#issuecomment-6769349738 page invalid-or-expired-nonce sha12 d521faf411dd: https://postyourprice.com -> https://automatonhost.com/errors/invalid-or-expired-nonce
  - https://github.com/Conway-Research/automaton/issues/435#issuecomment-6520848825 page verify-500-database-error sha12 5b54bb9acfa0: https://postyourprice.com -> https://automatonhost.com/errors/verify-500-database-error
  - https://github.com/Conway-Research/automaton/issues/434#issuecomment-6789427945 page invalid-or-expired-nonce sha12 7455554d159f: https://postyourprice.com -> https://automatonhost.com; https://postyourprice.com -> https://automatonhost.com/errors/invalid-or-expired-nonce
  - https://github.com/Conway-Research/automaton/issues/432#issuecomment-6520875093 page invalid-or-expired-nonce sha12 0d86032dba08: https://postyourprice.com -> https://automatonhost.com/errors/invalid-or-expired-nonce
  - https://github.com/Conway-Research/automaton/issues/430#issuecomment-6789453609 page home sha12 8d78570a50e5: https://postyourprice.com -> https://automatonhost.com; https://postyourprice.com -> https://automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/427#issuecomment-6789479781 page credits-never-granted sha12 ec08748a4d8d: https://postyourprice.com -> https://automatonhost.com/errors/credits-never-granted
  - https://github.com/Conway-Research/automaton/issues/419#issuecomment-6520901615 page verify-500-database-error sha12 2a287c864797: https://postyourprice.com -> https://automatonhost.com/errors/verify-500-database-error
  - https://github.com/Conway-Research/automaton/issues/408#issuecomment-6835502716 page verify-500-database-error sha12 0298be62c02b: https://postyourprice.com -> https://automatonhost.com; https://postyourprice.com -> https://automatonhost.com/errors/verify-500-database-error
  - https://github.com/Conway-Research/automaton/issues/406#issuecomment-6835466852 page invalid-or-expired-nonce sha12 212011c6a2c4: https://postyourprice.com -> https://automatonhost.com; https://postyourprice.com -> https://automatonhost.com/errors/invalid-or-expired-nonce
  - https://github.com/Conway-Research/automaton/issues/393#issuecomment-5742781237 page credits-never-granted sha12 40b76337a9ab: https://cp.hippe.eu -> https://automatonhost.com/errors/credits-never-granted
  - https://github.com/Conway-Research/automaton/issues/392#issuecomment-5781361252 page invalid-or-expired-nonce sha12 41d25213bac8: https://cp.hippe.eu -> https://automatonhost.com/errors/invalid-or-expired-nonce; https://cp.hippe.eu/fix -> https://automatonhost.com/fix
  - https://github.com/Conway-Research/automaton/issues/390#issuecomment-5748925311 page home sha12 d7221bbd1eb8: https://cp.hippe.eu -> https://automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/385#issuecomment-5805015103 page home sha12 2916f7e70a59: https://postyourprice.com -> https://automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/379#issuecomment-5748925721 page verify-500-database-error sha12 b95b595c6352: https://cp.hippe.eu -> https://automatonhost.com/errors/verify-500-database-error
  - https://github.com/Conway-Research/automaton/issues/377#issuecomment-5742781149 page verify-500-database-error sha12 ae905c8f9593: https://cp.hippe.eu -> https://automatonhost.com/errors/verify-500-database-error; https://cp.hippe.eu -> https://automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/376#issuecomment-5781362033 page invalid-or-expired-nonce sha12 0210e74e9ba0: https://cp.hippe.eu -> https://automatonhost.com/errors/invalid-or-expired-nonce; https://cp.hippe.eu/fix -> https://automatonhost.com/fix
  - https://github.com/Conway-Research/automaton/issues/372#issuecomment-5781362775 page verify-500-database-error sha12 dc1b3c6b49b1: https://cp.hippe.eu -> https://automatonhost.com/errors/verify-500-database-error; https://cp.hippe.eu/fix -> https://automatonhost.com/fix
  - https://github.com/Conway-Research/automaton/issues/359#issuecomment-5889884681 page invalid-or-expired-nonce sha12 0353e4c01e04: https://postyourprice.com -> https://automatonhost.com/errors/invalid-or-expired-nonce; https://postyourprice.com/fix -> https://automatonhost.com/fix
  - https://github.com/Conway-Research/automaton/issues/356#issuecomment-5889856106 page invalid-or-expired-nonce sha12 27780f0c765a: https://postyourprice.com/fix -> https://automatonhost.com/fix
  - https://github.com/Conway-Research/automaton/issues/355#issuecomment-5748924904 page invalid-or-expired-nonce sha12 9a3f68a42e6c: https://cp.hippe.eu -> https://automatonhost.com/errors/invalid-or-expired-nonce
  - https://github.com/Conway-Research/automaton/issues/353#issuecomment-5889830336 page invalid-or-expired-nonce sha12 7cefd53311a6: https://postyourprice.com -> https://automatonhost.com/errors/invalid-or-expired-nonce; https://postyourprice.com/fix -> https://automatonhost.com/fix
  - https://github.com/Conway-Research/automaton/issues/339#issuecomment-5742781023 page verify-500-database-error sha12 4a38e03cfa6d: https://cp.hippe.eu -> https://automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/335#issuecomment-5804984649 page home sha12 6c32c58fa015: https://postyourprice.com/v1/status -> https://automatonhost.com/v1/status; https://postyourprice.com -> https://automatonhost.com
  - https://github.com/Conway-Research/automaton/issues/333#issuecomment-5796242563 page invalid-or-expired-nonce sha12 3be0ca54f422: https://postyourprice.com -> https://automatonhost.com/errors/invalid-or-expired-nonce; https://postyourprice.com/fix -> https://automatonhost.com/fix
  - https://github.com/Conway-Research/automaton/issues/294#issuecomment-5796218247 page home sha12 26e8f71b12a2: https://postyourprice.com -> https://automatonhost.com; https://postyourprice.com/fix -> https://automatonhost.com/fix
  - https://github.com/Conway-Research/automaton/issues/293#issuecomment-5796193319 page credits-never-granted sha12 3cb628087073: https://postyourprice.com/fix -> https://automatonhost.com/fix
- 2026-11-22 Zyklus 2: Punkte 4, 5 gebaut. Freigabe „ok relink“ des Tech Lead auf PRO-27822 (22:03 UTC) mit genau den 29 Werten des Trockenlaufs, `--send` in drei Anläufen, weil zwei Runs vorzeitig endeten (20 geändert, dann 9 geändert und 20 `ALREADY`), jeder Kommentar zurückgelesen und gleich; Prüfbefehl von Punkt 5 nach Entscheidung des Tech Lead auf `test/relink-[a-z.-]+\.ts` (ANNAHMEN.md). Prüfbefehle: Deploy `deployed`, Freigabe-Zeile `1`, Protokoll-Format `0`, Protokollzeilen `29`, Freigabe gegen Paperclip `freigabe ok 29`, `--verify` `relink verify: 29 same, 0 differ, 0 with old links`, Trockenlauf `relink: 0 to change, 30 unchanged, 30 comments of matthiashippe`, Log-Zeilen der Goal-Datei `29`, Punkt 5 siehe Kommentar am Topic.
- 2026-11-22 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6. Nach Merge von `dev` (4e1f8c8) jeder Prüfbefehl erneut grün, `check` lokal grün (2661 Tests), am PR #393 Jobs `check` und `e2e` grün am Kopf 4e1f8c8.

## Blockers
