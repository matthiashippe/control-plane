# Konto Goal 14: Der Start aus Claude Code sagt, dass das Konto noch nicht an ist, und das Einschalten ist vorbereitet

## Status
ACTIVE

## Active Objective
Wer heute dem README folgt, scheitert nicht mehr an einem Versprechen, das der Dienst nicht hält, und Matthias kann das Konto in
konto 15 mit einem Befehl prüfen, statt Werte auf dem Server von Hand nachzusehen. Heute (beim Schreiben am 2026-11-19 am Code von
`dev` 3e9375a gelesen):

1. `README.md`, Absatz „Run an automaton from Claude Code“, sagt: Plugin installieren, Claude bitten, Handy und Passkey legen das
   Konto an. Auf dem Server steht kein Wert `CP_KONTO_*` (konto 05, Kontext Zeile 31 und 32), also antwortet `POST /v1/handoff` mit
   `step: "konto"` 503 `konto_unavailable` (`src/handoff/routes.ts`, `KONTO_OFF`), und `start_automaton` in `mcp/server.mjs` reicht
   die Nachricht für API-Kunden weiter („Leave out step or send step "confirm"“), mit der ein Mensch in Claude Code nichts anfangen
   kann.
2. Ob die Werte aus `docs/konto/euro.md`, Abschnitt `## Für konto 06`, Punkt 4 auf dem Server stehen und ob der Gasschlüssel im
   Container lesbar ist, prüft kein Werkzeug; konto 15 hängt genau daran.

Danach sagt der Absatz im README, dass der Start aus Claude Code noch nicht freigeschaltet ist, `start_automaton` antwortet bei 503
`konto_unavailable` mit einem Satz für den Menschen, und `ops/konto-ready.sh` meldet über SSH je Wert nur `set`, `missing` oder
`wrong`, nie den Wert (`ROADMAP.md`, konto 14).
Widerlegt, wenn `POST /v1/handoff` mit `step: "konto"` auf dem Server schon heute nicht mit 503 antwortet, also die Werte schon
stehen; dann ist dieses Goal nur noch das Werkzeug aus Punkt 3, und der README-Absatz bleibt.
Übernimmt goals/_vorschlaege/konto-kritik-2026-11-18-4.md (Teil README und Vorbereitung; das Einschalten selbst ist konto 15).
MVP: Funktion, weil ein Mensch, der heute das Plugin installiert, an einer 503 scheitert (Grundregel 4), und weil konto 15 ohne
Prüfwerkzeug am Server von Hand nachsehen müsste.

## Voraussetzungen
- konto Goal 13 DONE

## Kontext für den Maker
- Ziel in einem Satz: Kein Mensch scheitert an einem Start aus Claude Code, den wir noch nicht anbieten, und das Einschalten in
  konto 15 ist mit einem Befehl prüfbar.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte): zuerst die Tests aus Punkt 2 und Punkt 3 gegen den heutigen Stand,
  rot; dann Punkt 1, Punkt 2, Punkt 3, Punkt 4, zuletzt Punkt 5. Je Punkt Commit und Push.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 14` in `goals/konto/ANNAHMEN.md`):
  1. Der Absatz im README bleibt an seiner Stelle und behält die Zeichenfolge „Run an automaton from Claude Code“, damit konto 15
     ihn nur zurückdreht. Er sagt in einem Satz, dass der Start aus Claude Code noch nicht freigeschaltet ist („not switched on
     yet“), und nennt, was heute schon geht (die unveränderte Runtime mit `conwayApiUrl`, der Absatz darüber). Verkäuferisch, ohne
     Entschuldigung, ohne Datum.
  2. `KONTO_OFF` in `src/handoff/routes.ts` bleibt, wie er ist, weil API-Kunden genau diesen Hinweis brauchen. Die Übersetzung für
     den Menschen macht `start_automaton` in `mcp/server.mjs`: bei 503 mit `error` `konto_unavailable` die Antwort mit
     `error: "konto_unavailable"` und der Nachricht „Starting an automaton from Claude Code is not switched on yet. Nothing was
     charged.“, sonst unverändert.
  3. `ops/konto-ready.sh` liest wie `ops/status.sh` über `ssh -i "$KEY" -o BatchMode=yes … "$HOST"` (gleiche Variablen
     `CP_DEPLOY_HOST`, `CP_DEPLOY_KEY`) die Datei `/opt/control-plane/.env` nur mit `grep` auf Namen und vergleicht auf dem Server,
     nie lokal: Kein Wert verlässt den Server. Je Name eine Zeile `<NAME> set`, `<NAME> missing` oder `<NAME> wrong`:
     `CP_KONTO_CHAIN_ID` muss `8453` sein, `CP_KONTO_MAINNET` `1`, `CP_KONTO_KEY_FILE` und `CP_KONTO_AUTH_PROXY_ID` nicht leer;
     `CP_KONTO_RPC_URL` ist frei (fehlt er, `CP_KONTO_RPC_URL default`). Dazu `key_file readable` oder `key_file unreadable`, geprüft im
     laufenden Container mit `docker compose … exec -T cp test -r "$CP_KONTO_KEY_FILE"`, weil der Container nur das Volume `/data`
     sieht. `CP_BRIDGE_URL` und `CP_BRIDGE_KEY_FILE` stehen als `<NAME> set` oder `<NAME> empty` da, ohne den Exit zu ändern, weil
     sie erst nach konto 16 gesetzt werden. Exit 0 nur, wenn jede Pflichtzeile `set` ist und `key_file readable`, sonst 1;
     SSH-Fehler Exit 2 mit einer Zeile `ssh failed`.
  4. Der Test `test/konto-ready.test.ts` legt ein nachgebautes `ssh` und `docker` in einen Ordner aus `mkdtemp` vorn in `PATH`; das
     nachgebaute `ssh` führt den Befehl lokal aus, mit `/opt/control-plane/.env` umgelenkt auf eine Datei im selben Ordner
     (Variable, die das Skript nur im Test liest, etwa `CP_READY_ENV_FILE`). Der Ordner wird nach jedem Fall gelöscht.
- Nicht in diesem Goal: ein Wert auf dem Server, ein Aufruf von `ops/konto-ready.sh` gegen den echten Server als Prüfbefehl,
  `src/**`, `deploy/**`, das Einschalten und die erste Einzahlung (konto 15), die Prüfung der Freigabe für SEPA (konto 16).

## Done Condition
- [x] Der Absatz „Run an automaton from Claude Code“ in `README.md` sagt, dass der Start aus Claude Code noch nicht freigeschaltet
      ist.
      MVP: Funktion, weil heute jeder, der dem Absatz folgt, an einer 503 scheitert.
      Prüfung: `awk '/Run an automaton from Claude Code/{f=1} f&&/^$/{exit} f' README.md | grep -c 'not switched on yet'` muss mindestens `1` ausgeben.
      Prüfung: `grep -c '—\|–' README.md` muss `0` ausgeben.
- [x] `start_automaton` antwortet bei 503 `konto_unavailable` mit `error: "konto_unavailable"` und dem Satz für den Menschen; ein Fall
      in `test/mcp-automaton.test.ts` zeigt das, und gegen den Stand der Merge-Basis ist dieser Fall rot.
      MVP: Funktion, weil Claude dem Menschen sonst einen Hinweis für API-Kunden vorliest.
      Prüfung: `grep -c 'Starting an automaton from Claude Code is not switched on yet. Nothing was charged.' mcp/server.mjs` muss genau `1` ausgeben.
      Prüfung: `grep -c 'konto_unavailable' test/mcp-automaton.test.ts` muss mindestens `1` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/mcp-automaton.test.ts test/mcp.test.ts test/mcp-money.test.ts` muss Exit-Code 0 haben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); git archive $B | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp test/mcp-automaton.test.ts $T/test/; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/mcp-automaton.test.ts >/dev/null 2>&1); echo "exit=$?"` muss genau `exit=1` ausgeben.
- [x] `ops/konto-ready.sh` meldet je Wert aus `docs/konto/euro.md`, Abschnitt `## Für konto 06`, Punkt 4 `set`, `missing` oder
      `wrong` und `key_file readable` oder `unreadable`, nie einen Wert; fünf Fälle in `test/konto-ready.test.ts` belegen das offline.
      MVP: Funktion, weil konto 15 das Einschalten damit belegt, ohne dass ein Wert den Server verlässt.
      Prüfung: `bash -n ops/konto-ready.sh && echo syntax ok` muss `syntax ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-ready.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-ready.test.ts` muss mindestens `5` ausgeben (je ein Fall: alle Pflichtwerte gesetzt und Schlüssel lesbar gibt Exit 0 und je Name `set`; ein fehlender Name gibt `missing` und Exit 1; `CP_KONTO_CHAIN_ID=84532` gibt `wrong` und Exit 1; leere `CP_BRIDGE_*` geben `empty` und ändern den Exit nicht; keine Ausgabe enthält einen der eindeutigen Testwerte aus der nachgebauten `.env`).
      Prüfung: `grep -cE '(^|[^a-z])(cat|source|less|head|tail)[[:space:]][^|]*\.env|^[[:space:]]*\.[[:space:]][^[:space:]]*\.env' ops/konto-ready.sh` muss `0` ausgeben.
      Prüfung: `grep -c 'mkdtemp' test/konto-ready.test.ts` muss mindestens `1` ausgeben.
      Prüfung: `grep -cE 'rmSync\(' test/konto-ready.test.ts` muss mindestens `1` ausgeben.
- [x] `docs/konto/euro.md`, Abschnitt `## Für konto 06`, nennt nach Punkt 4 den Befehl `ops/konto-ready.sh` und die Ausgabe, die
      dort am Ende stehen muss; die Entscheidungen stehen mit Grund unter `## Goal 14` in `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil die Schritte für Matthias in konto 15 aus diesem Abschnitt kommen.
      Prüfung: `awk '/^## Für konto 06/{f=1} f' docs/konto/euro.md | grep -c 'ops/konto-ready.sh'` muss mindestens `1` ausgeben.
      Prüfung: `grep -c '^## Goal 14' goals/konto/ANNAHMEN.md` muss genau `1` ausgeben.
- [x] Der Diff bleibt in den Pfaden dieses Goals, `src/**` bleibt gleich, kein Test wird schwächer, kein neues Paket, kein Schlüssel
      im Diff, keine andere Goal-Datei geändert, und `check` ist grün.
      MVP: Funktion, weil `ops/**` mit dem Merge ausrollt.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(README\.md|mcp/server\.mjs|ops/konto-ready\.sh|docs/konto/euro\.md|test/(mcp-automaton|konto-ready)\.test\.ts|goals/konto/14-der-start-aus-claude-code-sagt-dass-das-konto-noch-nicht-an-ist\.md|goals/konto/verdicts/14-[A-Za-z0-9._-]+\.md|goals/konto/ANNAHMEN\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- src deploy harness package.json pnpm-lock.yaml && echo laufzeit gleich` muss `laufzeit gleich` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' ':!goals/konto/14-der-start-aus-claude-code-sagt-dass-das-konto-noch-nicht-an-ist.md' && echo goals gleich` muss `goals gleich` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}|pk_live_|sk_live_" | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-14 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer dem README folgt, liest, dass der Start aus Claude Code noch nicht freigeschaltet ist.
- [ ] Claude sagt dem Menschen bei einem Start ohne Konto in einem Satz, dass es noch nicht geht und nichts berechnet wurde.
- [ ] `ops/konto-ready.sh` zeigt, welche Werte für das Konto auf dem Server fehlen, ohne einen Wert auszugeben.
- [ ] Kein Gedankenstrich, kein deutscher Bezeichner im Code.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.key`, `*.pem`
- `src/**`, `mcp/**` außer der Antwort von `start_automaton` auf 503 `konto_unavailable` in `mcp/server.mjs`, `ops/**` außer
  `ops/konto-ready.sh`, `docs/**` außer dem Abschnitt `## Für konto 06` in `docs/konto/euro.md`, jedes Bild unter `docs/soll/`
- jeder Aufruf von `ops/konto-ready.sh`, `ops/status.sh` oder `ssh` gegen den echten Server, jede Änderung an
  `/opt/control-plane/.env`, jeder Aufruf bei Turnkey, MoonPay, Bridge oder einem RPC, jede Transaktion
- `ROADMAP.md`, `docs/kette.md`, alle Goal-Dateien außer dieser (eingefroren), jede Zeile einer `ANNAHMEN.md` außer `## Goal 14`
- ein neues Paket, ein Test, der gestrichen, übersprungen oder schwächer wird
- ein API-Schlüssel, ein privater Schlüssel, ein Wert aus einer echten `.env`, ein Testschlüssel als Literal in Repo, Log, Ausgabe,
  Kommentar oder Fixture
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-19 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut (README-Absatz sagt "not switched on yet", start_automaton übersetzt 503 konto_unavailable, ops/konto-ready.sh mit 7 Offline-Fällen, euro.md und ANNAHMEN.md Goal 14). Prüfbefehle: P1 1 und 0; P2 1, 3, vitest Exit 0, Merge-Basis exit=1; P3 syntax ok, vitest Exit 0, 7, 0, 3, 1; P4 1 und 1; P5 0, laufzeit gleich, 0, goals gleich, 0, check grün (229 Dateien, 2430 Tests), Netz-Prüfung nach dem PR.
- 2026-11-19 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5; `dev` (cf0ec18) war schon im Branch, alle Prüfbefehle am Kopf 3e76905 erneut gefahren. Prüfbefehle: P1 `1`, `0`; P2 `1`, `3`, vitest 48 Tests Exit 0, Merge-Basis `exit=1`; P3 `syntax ok`, vitest 7 Tests Exit 0, `7`, `0`, `3`, `1`; P4 `1`, `1`; P5 `0`, `laufzeit gleich`, `0`, `goals gleich`, `0`, `check` Exit 0 (229 Dateien, 2430 Tests, grün in 85 s), Netz `1`; Jobs `check` und `e2e` an PR #297 für 3e76905 pass.

## Blockers
