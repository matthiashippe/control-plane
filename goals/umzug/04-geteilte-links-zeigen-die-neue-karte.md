# Umzug Goal 04: Geteilte Links zeigen die neue Karte

## Status
DONE

## Active Objective
Wer einen Link auf `automatonhost.com` teilt, sieht die Karte des Umzugs mit passendem Text, und die Werkzeuge des Umzugs laufen in
`check`: Die Adresse des Vorschaubilds in `og:image` und `twitter:image` trägt die ersten 8 Zeichen des sha256 des ausgelieferten
Bildes (`/og.png?v=<hash>`), damit Vorschaudienste eine neue Karte am ersten Tag zeigen statt tagelang die alte; `og:image:alt` kommt
je Karte aus einer Tabelle neben dem Bildnamen, damit die Seiten mit `og-x402.png` nicht mehr die Umzugskarte beschreiben; der
Selbsttest von `ops/site-dns.py` und die Hostliste `KNOWN_HOSTS` in `ops/before-the-answers.py` laufen in `check` (`ROADMAP.md`,
umzug 04; übernimmt `goals/_vorschlaege/umzug-kritik-2026-11-18-1.md`, `goals/_vorschlaege/umzug-kritik-2026-11-18-2.md`,
`goals/_vorschlaege/umzug-nacharbeit-2026-11-18-2.md` und `goals/_vorschlaege/umzug-nacharbeit-2026-11-18-3.md`).
MVP: Funktion, weil die Karte aus umzug 03 erst dann die Betreiber erreicht, wenn Vorschaudienste sie laden, und weil ein still
gebrochenes DNS- oder Hostwerkzeug beim nächsten Wechsel einen zahlenden Automaton ohne Antwort lässt.

## Voraussetzungen
- umzug Goal 03 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer einen geteilten Link sieht, liest am ersten Tag nach einer neuen Karte, dass sein Automaton hier mit einer
  Zeile weiterläuft, und keine Änderung an Domain oder Hostlisten bricht still. Was dem nicht dient, gehört nicht in dieses Goal.
- Stand am 18.11.2026 (`dev` bei `b004000`), gemessen:
  - `src/public/index.html` Zeilen 15 und 20: `og:image` und `twitter:image` lauten `https://cp.hippe.eu/og.png` ohne Version,
    Zeile 18 trägt `og:image:alt` mit dem Text der Umzugskarte („… Set conwayApiUrl to https://automatonhost.com.“).
  - `src/app.ts`: `ogImage()` (ab Zeile 699) liest das Bild beim Start von `createApp`, die Schleife ab Zeile 784 legt `/og.png` und
    `/og-x402.png` an, beide mit `Cache-Control: public, max-age=86400`. Eine Abfrage mit `?v=0` antwortet heute schon 200 mit
    demselben Bild und denselben Headern.
  - `page()` (ab Zeile 874) setzt den Host von `og:image` und `twitter:image` auf `siteOrigin()` und ersetzt danach jedes `og.png` durch
    den Parameter `card`; `og:image:alt` bleibt der Text aus `index.html`. `/x402` (Zeile 1000) und `/conway` (Zeile 1525) übergeben
    `og-x402.png`, alle anderen Seiten `og.png`. Die Startseite `/` geht nicht durch `page()`, sondern liefert `indexHtml` über
    `withOrigin` aus (ab Zeile 1680).
  - Beide Karten sind 2400 x 1260. `src/public/og-card-x402.html` zeigt „How big the paid-API market for agents actually is“, darunter
    die beiden x402-Verzeichnisse, täglich gemessen, Rohdaten unter CC0.
  - `test/public.test.ts` Zeilen 619 und 620 verlangen `content="https://cp.hippe.eu/og.png"` wörtlich mit schließendem
    Anführungszeichen; `test/x402-page.test.ts` Zeile 152 und `test/conway-page.test.ts` Zeile 261 verlangen, dass `/og.png` auf
    diesen Seiten fehlt.
  - `git grep -c site-dns -- test scripts package.json` gibt nichts aus; `python3 ops/site-dns.py --selftest` endet ohne Netz mit
    `SITE DNS SELFTEST OK` und Exit 0, jeder Fehler steht als Zeile `FAIL <Name>: …`.
  - `ops/before-the-answers.py` Zeile 47: `KNOWN_HOSTS = ("automatonhost.com", "cp.hippe.eu", "postyourprice.com")`;
    `test/host-lists.test.ts` hält fünf Kopien der Listen fest, diese nicht.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 04` in `goals/umzug/ANNAHMEN.md`):
  1. **Tabelle `OG_CARDS` in `src/public/og-cards.ts`**, Schlüssel genau `og.png` und `og-x402.png`, je Eintrag `alt`. Der Eintrag
     `og.png` trägt den Text aus `src/public/index.html` Zeile 18 Zeichen für Zeichen (ein Test vergleicht beide), damit Startseite und
     SOLL-Quelle `docs/soll/src/startseite.html` unverändert bleiben. Vorschlag für `og-x402.png`: „automatonhost.com/x402: How big the
     paid-API market for agents actually is. Both public x402 directories, scanned every day, raw data under CC0.“ Er nennt weder
     `conwayApiUrl` noch den Umzug, weil das Bild beides nicht zeigt.
  2. **Version beim Start, nicht im Template.** `createApp` rechnet je Karte, die `ogImage()` findet, die ersten 8 Hex-Zeichen des
     sha256 über genau die Bytes, die die Route ausliefert. `page()` und die Route `/` hängen `?v=<hash>` an die Adresse in `og:image`
     und `twitter:image`; `src/public/index.html` bleibt unverändert (sonst müsste jede neue Karte zwei Dateien ändern, und die Zahl
     im Template wäre falsch, sobald jemand das Bild neu aufnimmt). Pfad, Inhalt und Header von `/og.png` und `/og-x402.png` bleiben
     genau wie heute, `?v=` wird nicht ausgewertet. Fehlt ein Bild, entfällt seine Route wie heute, und die Adresse steht ohne `?v=`.
  3. **`og:image:alt` je Karte.** `page()` setzt den Text aus `OG_CARDS[card].alt`, die Route `/` den von `og.png`. Eine Karte ohne
     Eintrag ist ein Fehler beim Start von `createApp`, kein stiller Rückfall auf den Text der Startseite.
  4. **Neuer Test `test/og-cards.test.ts`**: für jede Karte aus `OG_CARDS` eine Seite, die sie trägt (`/` und `/post` für `og.png`,
     `/x402` und `/conway` für `og-x402.png`), paarweise Bild, Version (aus den Bytes der Antwort der Bildroute gerechnet, nicht aus
     der Tabelle) und Alt-Text, dazu `og.png` gleich `index.html` und `og-x402.png` ohne `conwayApiUrl`. Er war rot gegen das alte
     `src/app.ts` (Punkt 1 misst das).
  5. **`test/public.test.ts` Zeilen 619 und 620** verlangen danach `content="https://cp.hippe.eu/og.png?v=` gefolgt von 8 Hex-Zeichen
     und `"`; keine Assertion fällt weg, die Zahl der Fälle und der `expect(` in den Dateien unter `test/`, die der Diff ändert,
     sinkt nicht.
  6. **`test/site-dns-selftest.test.ts`** startet `python3 ops/site-dns.py --selftest` ohne Netz nach dem Muster von
     `test/live-selftest.test.ts` (`spawn` mit eigenem Timeout, kein `spawnSync`), verlangt Exit 0, keine Zeile, die mit `FAIL `
     beginnt, und als letzte Zeile `SITE DNS SELFTEST OK`. `ops/site-dns.py` ändert sich nicht.
  7. **`test/host-lists.test.ts`** bekommt den Fall „ops/before-the-answers.py: KNOWN_HOSTS is the same set as SERVICE_HOSTS“: liest
     die Zeile `KNOWN_HOSTS = (...)` wie der Fall für `ops/sandbox/cloudflare.py` und vergleicht als Menge. Der Kopf der Datei nennt
     dann sechs Kopien. `ops/before-the-answers.py` ändert sich nicht.
  8. **Abgelöste Prüfbefehle fertiger Goals** wie in umzug 03, Entscheidung 9: Der Maker führt jeden Prüfbefehl der Goal-Dateien mit
     Status `DONE`, der einen Pfad aus `git diff --name-only origin/dev...HEAD` oder eines der Wörter `og.png`, `og-x402`, `og:image`,
     `twitter:image`, `site-dns`, `KNOWN_HOSTS`, `host-lists` nennt, an der Merge-Basis und am Goal-Branch aus (außer Befehlen, die
     etwas verschicken oder live auf echten Daten laufen), und für jeden, dessen Ausgabe sich ändert, steht im
     `goals/<topic>/ANNAHMEN.md` des abgelösten Goals genau eine Zeile, gesammelt unter `## Abgelöst durch umzug 04 (Maker, <Datum>)`:
     ```
     - Abgelöst: <topic> <NN> Punkt <n> durch umzug 04 Punkt <m>, Ausgabe dann genau `Exit <k>, <letzte Zeile>` (Tech Lead, 2026-11-18)
     ```
     Ändert sich keine Ausgabe, sagt das die Zeile im Progress Log mit der Zahl der geprüften Befehle, und Punkt 5 zählt 0 Zeilen.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte): zuerst die beiden Tests der Werkzeuge (Punkte 3 und 4), weil sie
  ohne Codeänderung grün sein müssen und nur ihre Gegenprobe rot; dann `test/og-cards.test.ts` rot, Tabelle, Version und Alt-Text
  (Punkte 1 und 2), je Commit und Push; dann abgelöste Prüfbefehle, Doku, Umfang und `check` (Punkte 5 bis 8).
- Prüfbefehle ohne Netz binden keinen festen Port (`app.request`), Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest
  im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Jeder neue Test war einmal rot, die Zeile im
  Progress Log sagt, womit. Progress Log und Verdicts zitieren keine Suchausdrücke der Prüfbefehle wörtlich.
- Karten, Bilder und SOLL-Bilder ändern sich nicht: Das Meta-Tag ist unsichtbar, also braucht dieses Goal kein neues SOLL-Bild.
- Rollout: `src/**` liegt im Laufzeitpfad, der Merge rollt über `deploy.yml` aus. Vorschaudienste, die die Seite selbst noch im Cache
  halten, zeigen die alte Adresse bis zu ihrem eigenen Neuabruf; das ist kein Gap dieses Goals.
- Widerlegt, wenn am Kopf von `dev` die Startseite schon `og.png?v=` trägt (`app.request("/")`); dann endet das Goal mit dieser
  Messung in den Annahmen. Die Fassung in `ROADMAP.md` misst dasselbe mit `grep` in `src/public/index.html`; nach Entscheidung 2 steht
  die Version dort nie, deshalb misst das Goal die ausgelieferte Seite.
- Was danach schneller zu mehr zahlenden Automatons führt: Jede neue Karte, die ein künftiges Goal aufnimmt, erreicht geteilte Links am
  selben Tag, ohne dass jemand an Caches denken muss.

## Done Condition
- [x] Jede Seite trägt in `og:image` und `twitter:image` die Adresse ihrer Karte mit `?v=` und den ersten 8 Zeichen des sha256 des
      ausgelieferten Bildes; `/og.png` und `/og-x402.png` antworten mit denselben Headern wie vorher; der neue Test war vor dem Fix rot.
      MVP: Funktion, weil Vorschaudienste ein Bild nach Adresse halten und die Karte des Umzugs sonst Tage nach dem Merge nicht zeigen.
      Prüfung: `PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'import fs from "node:fs"; import crypto from "node:crypto"; const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const app = createApp({ db: openDb(":memory:") }); const v = (f) => crypto.createHash("sha256").update(fs.readFileSync("src/public/" + f)).digest("hex").slice(0, 8); const bad = []; for (const [p, f] of [["/", "og.png"], ["/post", "og.png"], ["/x402", "og-x402.png"], ["/conway", "og-x402.png"]]) { const h = await (await app.request(p)).text(); for (const k of [/property="og:image" content="([^"]*)"/, /name="twitter:image" content="([^"]*)"/]) { const m = k.exec(h); if (!m || !m[1].endsWith("/" + f + "?v=" + v(f))) bad.push(p + " " + (m ? m[1] : "fehlt")); } } console.log(bad.length ? "version falsch " + bad.join(", ") : "version ok")'` muss `version ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const app = createApp({ db: openDb(":memory:") }); const out = []; for (const p of ["/og.png", "/og.png?v=0", "/og-x402.png"]) { const r = await app.request(p); out.push([r.status, r.headers.get("content-type"), r.headers.get("cache-control"), (await r.arrayBuffer()).byteLength > 10000].join(" ")); } console.log([...new Set(out)].join(" | "))'` muss genau `200 image/png public, max-age=86400 true` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/og-cards.test.ts test/public.test.ts test/domain-move.test.ts test/x402-page.test.ts test/conway-page.test.ts test/og-card.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; B=$(git merge-base origin/dev HEAD); git show $B:src/app.ts > $T/src/app.ts; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/og-cards.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 2 ausgeben.
- [x] `og:image:alt` beschreibt auf jeder Seite die Karte, die sie trägt: die Startseite und die Seiten mit `og.png` den Text aus
      `src/public/index.html`, `/x402` und `/conway` einen eigenen Satz zur x402-Karte ohne `conwayApiUrl`, beide aus `OG_CARDS`.
      MVP: Funktion, weil ein Alt-Text, der ein anderes Bild beschreibt, Screenreadern und Vorschaudiensten etwas Falsches sagt.
      Prüfung: `PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'import fs from "node:fs"; const { createApp } = await import("./src/app.ts"); const { openDb } = await import("./src/db.ts"); const app = createApp({ db: openDb(":memory:") }); const alt = (h) => (/property="og:image:alt" content="([^"]*)"/.exec(h) ?? [])[1] ?? ""; const home = alt(fs.readFileSync("src/public/index.html", "utf8")); const a = {}; for (const p of ["/", "/post", "/x402", "/conway"]) a[p] = alt(await (await app.request(p)).text()); const ok = a["/"] === home && a["/post"] === home && a["/x402"] === a["/conway"] && a["/x402"] !== "" && !a["/x402"].includes("conwayApiUrl") && a["/x402"].includes("x402"); console.log(ok ? "alt ok" : "alt falsch " + JSON.stringify(a["/x402"]))'` muss `alt ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node --import tsx --input-type=module -e 'const { OG_CARDS } = await import("./src/public/og-cards.ts"); console.log(Object.keys(OG_CARDS).sort().join(" "))'` muss genau `og-x402.png og.png` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src/public/index.html src/public/og-card.html src/public/og.png src/public/og-card-x402.html src/public/og-x402.png docs/soll | wc -l` muss 0 ausgeben.
- [x] Der Selbsttest von `ops/site-dns.py` läuft in `check`: `test/site-dns-selftest.test.ts` verlangt Exit 0, keine Zeile `FAIL ` und
      als letzte Zeile `SITE DNS SELFTEST OK`, und er wird rot, wenn der Selbsttest bricht.
      MVP: Funktion, weil das Werkzeug die A-Records von `automatonhost.com` setzt und ein still gebrochener Planer beim nächsten Wechsel
      den Dienst für zahlende Automatons unerreichbar macht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/site-dns-selftest.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in 'ops/site-dns.py' --selftest 'SITE DNS SELFTEST OK' 'FAIL '; do grep -qF -- "$w" test/site-dns-selftest.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/^        if want == got:$/        if want != got:/' $T/ops/site-dns.py; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/site-dns-selftest.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 1 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- ops/site-dns.py ops/before-the-answers.py | wc -l` muss 0 ausgeben.
- [x] `test/host-lists.test.ts` hält `KNOWN_HOSTS` aus `ops/before-the-answers.py` als Menge gegen `SERVICE_HOSTS` fest und wird rot,
      wenn dort ein Host fehlt.
      MVP: Funktion, weil das Werkzeug neue Antworten im Kanal auf den kanonischen Host prüft und eine vergessene Kopie der Hostliste
      Links auf einen Host durchlässt, unter dem wir nicht mehr verkaufen.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/host-lists.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c 'KNOWN_HOSTS' test/host-lists.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/^KNOWN_HOSTS = ("automatonhost.com", /KNOWN_HOSTS = (/' $T/ops/before-the-answers.py; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/host-lists.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 1 ausgeben.
      Prüfung: `for f in $(git diff --name-only origin/dev...HEAD -- test/ | grep -vxE 'test/(og-cards|site-dns-selftest)\.test\.ts'); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done` muss nichts ausgeben.
- [x] Jeder Prüfbefehl eines fertigen Goals, dessen Ausgabe sich durch dieses Goal ändert, steht als abgelöst in den Annahmen seines
      Topics, in der Form aus Entscheidung 8.
      MVP: Funktion, weil das Audit nachts jeden Prüfbefehl fertiger Goals fährt und jede unerklärte rote Zeile eine Reparatur ohne
      Ursache auf `dev` auslöst.
      Prüfung: `q=$(printf '\140'); cat goals/*/ANNAHMEN.md | grep -E '^- Abgelöst: .* durch umzug 04 ' | grep -vcE " durch umzug 04 Punkt [0-9]+, Ausgabe dann genau ${q}Exit [0-9]+, [^${q}]*${q} \\(Tech Lead, 2026-11-18\\)\$"` muss 0 ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+ Zyklus [0-9]+: .*(abgelöst|Abgelöst)' goals/umzug/04-geteilte-links-zeigen-die-neue-karte.md` muss mindestens 1 ausgeben.
- [x] Die Doku sagt, warum die Bildadresse eine Version trägt, woher der Alt-Text je Karte kommt und welche Tests die Werkzeuge des
      Umzugs in `check` halten; die Entscheidungen stehen mit Grund in den Annahmen.
      MVP: Funktion, weil das nächste Goal, das eine Karte anlegt, sonst den Eintrag in `OG_CARDS` oder die Hostliste vergisst.
      Prüfung: `for w in 'og.png?v=' OG_CARDS og-cards.ts site-dns-selftest.test.ts KNOWN_HOSTS host-lists.test.ts; do grep -qF -- "$w" docs/umzug.md || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Goal 04/{f=1;next} /^## /{f=0} f' goals/umzug/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens 5 ausgeben.
- [x] Das Goal ändert nur `src/app.ts`, die neue Tabelle der Karten, Tests, Doku und Annahmen, weder Karten, Bilder, SOLL-Bilder,
      Werkzeuge unter `ops/`, Compose, Zahlung, Anmeldung, Automaton, Harness noch CI, und bringt keinen Schlüssel ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8) und Compose nur Matthias ändert.
      Prüfung: `git diff --name-only origin/dev...HEAD -- deploy src/payments src/auth src/automaton src/handoff harness .github scripts/check.mjs loop.yaml gate.yaml LOOP.md loop-constraints.md ops | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vcE '^(src/app\.ts|src/public/og-cards\.ts|docs/umzug\.md|test/.+|goals/[a-z]+/ANNAHMEN\.md|goals/umzug/.+|goals/_vorschlaege/umzug-[a-z0-9.-]+\.md)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | wc -l` muss höchstens 18 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}|Bearer [A-Za-z0-9_-]{30,})'` muss 0 ausgeben.
- [x] `check` ist grün, und der Job `e2e` des Goal-PR ist grün.
      MVP: Funktion, weil jede Seite durch `page()` geht und erst der Gang mit der unveränderten Runtime zeigt, dass Anmeldung, Zahlung
      und Inferenz weiter laufen (Grundregel 13).
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/umzug-04 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jeder neue Fall, der ein neues Verhalten verlangt, war vor dem Fix rot oder hat eine Gegenprobe, die rot
      wird; die Zeile im Progress Log nennt, womit.
- [ ] Maschinenpfade, Feldnamen und Header verhalten sich auf allen drei Hosts genau wie vor dem Goal; `/og.png` und `/og-x402.png`
      antworten mit denselben Bytes und denselben Headern.
- [ ] Code, Kommentare, Testnamen und Alt-Texte Englisch, Goal-Datei, Doku und Annahmen Deutsch, kein Gedankenstrich, kein Wort, das
      der Leser erst übersetzen muss (TEAM.md „Klare Wörter“).

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/payments/**`, `src/auth/**`, `src/automaton/**`, `src/handoff/**`, `ops/conway-series.sh`,
  `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `src/public/index.html`, `src/public/og-card.html`, `src/public/og.png`, `src/public/og-card-x402.html`, `src/public/og-x402.png`,
  `docs/soll/**`, `ops/site-dns.py`, `ops/before-the-answers.py`
- die Goal-Dateien fertiger Goals; in ihren `ANNAHMEN.md` nur die Zeilen aus Entscheidung 8
- `ops/site-dns.py check` und `apply`, jeder Aufruf von Cloudflare und jeder andere Aufruf der Produktion; der Zahlungsserver
  `76.13.144.207` und der Sandbox-Server: kein Zugriff
- Cloudflare, Turnkey, Stripe: kein Zugriff in diesem Goal
- kein Kommentar in einem fremden Repo (Human Gate `public_post`)
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-18 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7, 8 gebaut: Tabelle `OG_CARDS` in `src/public/og-cards.ts`, `withCard()` in `src/app.ts` setzt für `page()` und `/` Bildadresse mit `?v=` (8 Hex-Zeichen sha256 der ausgelieferten Bytes) und Alt-Text je Karte, `test/og-cards.test.ts` war gegen das alte `src/app.ts` rot (4 von 8 Fällen), `test/site-dns-selftest.test.ts` und der Fall `KNOWN_HOSTS` in `test/host-lists.test.ts` mit Gegenprobe je 1 roter Fall, Doku in `docs/umzug.md`, Annahmen unter `## Goal 04`; 25 Prüfbefehle fertiger Goals an Merge-Basis und Branch verglichen, einer abgelöst (umzug 01 Punkt 7, 26 auf 28). Prüfbefehle: Punkt 1 version ok, Header-Zeile wie verlangt, sechs Testdateien Exit 0 (93 Fälle), Gegenprobe 4; Punkt 2 alt ok, Schlüssel wie verlangt, 0; Punkt 3 Exit 0, nichts, 1, 0; Punkt 4 Exit 0, 3, 1, nichts; Punkt 5 0 und 1; Punkt 6 nichts und 9; Punkt 7 0, 0, 10, 0, 0; Punkt 8 `check` Exit 0 (2402 Tests), `e2e` am PR siehe Kommentar.
- 2026-11-18 Zyklus 2: Abschluss gemeldet, Punkte 1 bis 8; `origin/dev` ohne neue Commits gegenüber dem Branch (Merge entfällt), jeder Prüfbefehl aller Punkte mit `PATH=/usr/bin:$PATH` am Kopf f3e51f8. Prüfbefehle: Punkt 1 version ok, Header-Zeile wie verlangt, Exit 0 (93 Fälle), Gegenprobe 4; Punkt 2 alt ok, Schlüssel wie verlangt, 0; Punkt 3 Exit 0, nichts, 1, 0; Punkt 4 Exit 0, 3, 1, nichts; Punkt 5 0 und 1; Punkt 6 nichts und 9; Punkt 7 0, 0, 11, 0, 0; Punkt 8 `check: grün in 328 s` (2402 Tests), Jobs `check` und `e2e` am PR #280 SUCCESS an f3e51f8.
- 2026-11-18 Release: PASS K und B (Zyklus 2), DONE.

## Blockers
Keine.
