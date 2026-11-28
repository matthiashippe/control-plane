# Umzug Goal 06: Die Live-Prüfung ruft die Übergabeseite auf dem kanonischen Host auf

## Status
PLANNED

## Active Objective
Beim Release wache 04 (PRO-32862, 28.11.2026) meldete `ops/live.sh` `FAIL handoff: /h/{code} answered 301`, obwohl wache 04 die
Übergabe nicht berührt. `handoff_live` ruft die Seite `/h/{code}` auf `$BASE` ab, und `BASE` ist ohne `LIVE_URL`
`https://postyourprice.com`. Seit umzug 01 leitet die App jede Seite eines alten Hosts per 301 auf den kanonischen Host
`automatonhost.com` weiter (`src/app.ts`, `PAGES_STAY` nennt `/h/` nicht), also kann die Prüfung dort nie mehr 200 sehen. Danach ruft
`handoff_live` die Seite auf `https://automatonhost.com/h/{code}` ab; `POST /v1/handoff` und der Stream `GET /v1/handoff/{code}` bleiben
auf `$BASE`, weil Maschinenpfade auf allen Hosts antworten und Kunden ihre `conwayApiUrl` dort haben (PRO-32872, `ROADMAP.md`, umzug 06).
MVP: Funktion, weil eine Live-Prüfung, die nach jedem Rollout rot ist, einen echten Bruch der Übergabe nicht mehr von diesem Fehler
unterscheiden lässt und der Release Manager dann einen Revert ohne Ursache auslösen müsste.

## Voraussetzungen
- umzug Goal 04 DONE

## Kontext für den Maker
- Ziel in einem Satz: Nach jedem Rollout sagt die Prüfung `handoff` wieder, ob ein Mensch die Übergabeseite sieht, die sein Automaton
  ihm schickt. Was dem nicht dient, gehört nicht in dieses Goal.
- Stand am 28.11.2026 (`dev` bei `71202a7`), gelesen:
  - `ops/live.sh` Zeile 79: `BASE="${LIVE_URL:-https://postyourprice.com}"`.
  - `handoff_live` (ab Zeile 369) ruft `"$BASE/v1/handoff"` (POST), `"$BASE/h/$code"` (Seite mit Kopfzeilen) und
    `"$BASE/v1/handoff/$code"` (Stream 5 s) auf.
  - `src/app.ts` ab Zeile 568: GET und HEAD auf einen Host aus `SERVICE_HOSTS`, der nicht der Host aus `CP_PUBLIC_URL` ist, bekommen
    301, außer Pfaden aus `PAGES_STAY` (`/v1/`, `/pay/`, `/.well-known/`, `/px/`, `/health`, …).
  - Die gepflanzten Fälle der Prüfung `handoff` im Selbsttest (ab Zeile 1418) kennen `page404`, aber keinen Fall für 301.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 06` in `goals/umzug/ANNAHMEN.md`):
  1. **Eine Funktion für die drei Adressen.** `handoff_urls <code>` druckt genau drei Zeilen `<METHODE> <URL>` in der Reihenfolge
     POST, Seite, Stream. Die Seite liegt auf `PAGE_BASE="${LIVE_PAGE_URL:-https://automatonhost.com}"`, POST und Stream auf `$BASE`.
     `handoff_live` holt seine Adressen nur aus dieser Funktion, damit Prüfung und Live-Lauf nicht auseinanderlaufen.
  2. **Ohne Netz sichtbar:** `ops/live.sh --handoff-urls <code>` ruft `handoff_urls` und sonst nichts; ein Code, der nicht auf
     `^[0-9A-Z]{10,32}$` passt, gibt Exit 2 und nichts auf stdout. Der Kopfkommentar nennt den Aufruf neben `--judge`.
  3. **Kein `-L`.** Die Seite wird ohne Weiterleitung geholt: Antwortet der kanonische Host selbst mit 301, ist das ein echter Fehler
     und bleibt `FAIL handoff: /h/{code} answered 301`.
  4. **Ein gepflanzter Fall `page301`** neben `page404` im Selbsttest (POST 201 mit Match, Seite 301, Stream pending, Kopfzeilen ok),
     erwartet `FAIL`.
  5. **Sonst nichts:** `BASE`, die anderen Prüfungen, `HANDOFF_JS`, `HANDOFF_PREP_JS` und `judge_handoff` bleiben, wie sie sind.
     `LOOP.md` nennt für die Live-Prüfung weiter `https://postyourprice.com`; das ändert nur ein Mensch und ist für dieses Goal nicht
     nötig.
  6. **Abgelöste Prüfbefehle fertiger Goals** wie in umzug 05, Entscheidung 4: Der Maker führt jeden Prüfbefehl der Goal-Dateien mit
     Status `DONE`, der `live.sh` oder `live-selftest` nennt und ohne Netz läuft, an der Merge-Basis und am Goal-Branch aus; für jeden,
     dessen Ausgabe sich ändert, steht im `goals/<topic>/ANNAHMEN.md` des abgelösten Goals genau eine Zeile, gesammelt unter
     `## Abgelöst durch umzug 06 (Maker, <Datum>)`:
     ```
     - Abgelöst: <topic> <NN> Punkt <n> durch umzug 06 Punkt <m>, Ausgabe dann genau `Exit <k>, <letzte Zeile>` (Tech Lead, 2026-11-28)
     ```
     Erwartet ist, dass sich höchstens eine Zahl gepflanzter Fälle ändert; die Zeile im Progress Log nennt die Zahl der geprüften
     Befehle.
- Prüfbefehle ohne Netz, ohne festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit
  eigenem Timeout. Den Live-Modus von `ops/live.sh` startet der Maker nie; ihn fährt der Release Manager nach dem Merge.
- Kein Bildschirm ändert sich, also braucht dieses Goal kein SOLL-Bild. `ops/**` und `test/**` liegen nicht im Laufzeitpfad von
  `deploy.yml`, der Merge rollt nichts aus.
- Widerlegt, wenn `awk '/^handoff_live\(\)/,/^}/' ops/live.sh | grep -c 'BASE/h/'` am Kopf von `dev` schon 0 zählt; dann endet das Goal
  mit dieser Messung in den Annahmen.

## Done Condition
- [ ] `ops/live.sh --handoff-urls` nennt ohne Netz die drei Adressen der Prüfung `handoff`, die Seite auf `automatonhost.com`.
      MVP: Funktion, weil nur ein Aufruf ohne Netz zeigt, wohin der Live-Lauf geht, ohne die Produktion zu berühren.
      Prüfung: `diff <(env -u LIVE_URL -u LIVE_PAGE_URL bash ops/live.sh --handoff-urls 7KQ2M9XC4D7K) <(printf 'POST https://postyourprice.com/v1/handoff\nGET https://automatonhost.com/h/7KQ2M9XC4D7K\nGET https://postyourprice.com/v1/handoff/7KQ2M9XC4D7K\n')` muss nichts ausgeben und Exit-Code 0 haben.
      Prüfung: `env -u LIVE_PAGE_URL LIVE_URL=https://cp.hippe.eu bash ops/live.sh --handoff-urls 7KQ2M9XC4D7K | sed -n 2p` muss genau `GET https://automatonhost.com/h/7KQ2M9XC4D7K` ausgeben.
      Prüfung: `o=$(bash ops/live.sh --handoff-urls 'ab;c' 2>/dev/null); echo "$? ${#o}"` muss genau `2 0` ausgeben.
- [ ] Der Live-Lauf holt seine Adressen aus derselben Funktion und ruft keine Seite mehr auf `$BASE` ab.
      MVP: Funktion, weil sonst die Prüfung von Punkt 1 grün sein kann, während der Live-Lauf weiter den alten Host fragt.
      Prüfung: `awk '/^handoff_live\(\)/,/^}/' ops/live.sh | grep -c 'BASE/h/'` muss 0 ausgeben.
      Prüfung: `awk '/^handoff_live\(\)/,/^}/' ops/live.sh | grep -c 'handoff_urls'` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^handoff_live\(\)/,/^}/' ops/live.sh | grep -cE 'curl [^|]*-L'` muss 0 ausgeben.
- [ ] Der Selbsttest kennt die Weiterleitung als roten Fall und bleibt grün.
      MVP: Funktion, weil die Prüfung beweisen muss, dass sie einen 301 auf der Seite rot sieht (Grundregel 3, beide Richtungen).
      Prüfung: `bash ops/live.sh --selftest | grep -cxF 'planted handoff page301: FAIL handoff: /h/{code} answered 301'` muss 1 ausgeben.
      Prüfung: `bash ops/live.sh --selftest | grep -cxF 'planted handoff ok: OK handoff: POST /v1/handoff 201, /h/{code} shows match among three numbers with Referrer-Policy no-referrer, the stream says pending; nothing approved'` muss 1 ausgeben.
      Prüfung: `bash ops/live.sh --selftest | tail -1` muss genau `LIVE SELFTEST OK` ausgeben.
- [ ] Ein Fall in `test/live-selftest.test.ts` prüft `--handoff-urls`, grün am Goal-Branch und rot gegen das `ops/live.sh` der
      Merge-Basis.
      MVP: Funktion, weil `check` den Fall bei jedem Merge fährt und eine spätere Änderung an `BASE` oder den Hosts ihn sonst still bricht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/live-selftest.test.ts` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; git show $(git merge-base origin/dev HEAD):ops/live.sh > $T/ops/live.sh; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/live-selftest.test.ts -t 'handoff-urls' --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); f=$(node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"); rm -rf $T; echo "$f"` muss mindestens 1 ausgeben.
- [ ] Die Entscheidungen stehen mit Grund in den Annahmen, und jeder Prüfbefehl eines fertigen Goals, dessen Ausgabe sich durch dieses
      Goal ändert, steht als abgelöst in den Annahmen seines Topics, in der Form aus Entscheidung 6.
      MVP: Funktion, weil das Audit nachts jeden Prüfbefehl fertiger Goals fährt und jede unerklärte rote Zeile eine Reparatur ohne
      Ursache auf `dev` auslöst.
      Prüfung: `awk '/^## Goal 06/{f=1;next} /^## /{f=0} f' goals/umzug/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens 3 ausgeben.
      Prüfung: `q=$(printf '\140'); cat goals/*/ANNAHMEN.md | grep -E '^- Abgelöst: .* durch umzug 06 ' | grep -vcE " durch umzug 06 Punkt [0-9]+, Ausgabe dann genau ${q}Exit [0-9]+, [^${q}]*${q} \\(Tech Lead, 2026-11-28\\)\$"` muss 0 ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+ Zyklus [0-9]+: .*(abgelöst|Abgelöst)' goals/umzug/06-die-live-pruefung-ruft-die-seite-auf-dem-kanonischen-host-auf.md` muss mindestens 1 ausgeben.
- [ ] Das Goal ändert nur `ops/live.sh`, seinen Test, die Goal-Datei und Annahmen, keinen Laufzeitpfad, kein Compose, keine CI, und
      bringt keinen Schlüssel ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8) und der Merge sonst ausrollen würde.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src deploy harness .github scripts docs/soll loop.yaml gate.yaml LOOP.md loop-constraints.md package.json pnpm-lock.yaml | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vcE '^(ops/live\.sh|test/live-selftest\.test\.ts|goals/[a-z]+/ANNAHMEN\.md|goals/umzug/06-die-live-pruefung-ruft-die-seite-auf-dem-kanonischen-host-auf\.md)$'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | wc -l` muss höchstens 6 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}|Bearer [A-Za-z0-9_-]{30,})'` muss 0 ausgeben.
- [ ] `check` ist grün, auch der Job `check` am Goal-PR.
      MVP: Funktion, weil `check` das Merge-Gate auf `dev` ist und der Selbsttest darin läuft.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/umzug-06 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="check") | .state'` muss `SUCCESS` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Gegenprobe gegen das `ops/live.sh` der Merge-Basis (Punkt 4, zweite Prüfung) zeigt, dass der neue Fall den alten Stand rot
      sieht; die Zeile im Progress Log nennt ihr Ergebnis.
- [ ] Nach dem Merge meldet der nächste Live-Lauf des Release Managers `OK handoff: …`; steht dort weiter ein `FAIL handoff`, nennt der
      Release Manager die Zeile auf PRO-32872, und das ist ein neuer Befund, keine Rücknahme dieses Goals.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Annahmen Deutsch, kein Gedankenstrich, kein Wort, das der Leser erst
      übersetzen muss (TEAM.md „Klare Wörter“).

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/**`, `package.json`, `pnpm-lock.yaml`, `.env*`, `*.key`, `*.pem`, `*.crt`
- jede Datei unter `ops/` außer `ops/live.sh`, `docs/soll/**`
- die Goal-Dateien fertiger Goals; in ihren `ANNAHMEN.md` nur die Zeilen aus Entscheidung 6
- der Live-Modus von `ops/live.sh` und jeder andere Aufruf der Produktion; der Zahlungsserver `76.13.144.207` und der Sandbox-Server:
  kein Zugriff
- kein Kommentar in einem fremden Repo (Human Gate `public_post`)
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
