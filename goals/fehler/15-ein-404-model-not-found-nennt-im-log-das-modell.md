# Fehler Goal 15: Ein 404 `model_not_found` nennt im Log das Modell

## Status
ACTIVE

## Active Objective
Der einzige fremde Kunde mit Sandbox und Inferenz bekam am 2026-11-21 fünfmal 404 auf `POST /v1/chat/completions` (`bash
ops/sandbox-customer.sh --since 2026-11-21T00:00:00Z` -> `PATH 1 halt POST /v1/chat/completions 404`), laut
`src/inference/proxy.ts:287` `model_not_found`. Welches Modell seine Runtime wollte, ist nicht mehr lesbar: Der Dienst schreibt bei
`model_not_found` keine Zeile, und sein Log beginnt mit dem Neustart vom 2026-11-26 um 08:27 UTC. Berechnet wurde keine dieser
Anfragen, angehalten hat ihn keine. Ein Verdacht steht im Code: `DEFAULT_OPENROUTER_ALIASES` (`src/inference/openrouter.ts:70`)
lässt `gpt-5.3` absichtlich weg, die Runtime am Pin `d8f8168` fragt laut Kommentar in `src/inference/proxy.ts:278` aber nach
`gpt-5.2`, `gpt-5-mini` und `gpt-5.3`. Nach diesem Goal schreibt der Dienst bei jedem `model_not_found` eine Zeile mit dem
angefragten Modell und ohne Adresse, `docs/fehler/modelle-am-pin.md` nennt jede Modell-ID, die die Runtime am Pin anfragen kann,
mit Fundstelle und ob der Dienst sie bedient, und jede ID, die OpenRouter unter genau diesem Namen führt, bekommt einen Alias.
Leitzahl: 404 `model_not_found` an fremde Runtimes je Woche, deren Modell im Log fehlt, Ziel 0; dazu IDs am Pin ohne Antwort und
ohne Begründung in `docs/fehler/modelle-am-pin.md`, Ziel 0.
Widerlegt, wenn der Dienst am Kopf von `dev` bei `model_not_found` schon eine Zeile mit dem Modell schreibt.
MVP: Funktion, weil ein Fehler eines echten Nutzers (Grundregel 4) nur behoben werden kann, wenn wir sehen, wonach er fragte.

## Voraussetzungen
- fehler Goal 14 DONE

## Kontext für den Maker
- Ziel in einem Satz: Fragt eine fremde Runtime nach einem Modell, das wir nicht bedienen, sehen wir im Log welches, und jede ID,
  die die unveränderte Runtime anfragen kann und die es bei OpenRouter unter diesem Namen gibt, bekommt eine Antwort statt 404.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Die Runtime am Pin wählt ihr Modell aus einer festen Liste; jede
  ID daraus ohne Antwort ist ein Zug, in dem ein fremder Automaton bei uns nichts bekommt und zum nächsten Anbieter weiterzieht.
- Quelle: `ROADMAP.md`, Topic `fehler`, Glied 15 (Tech Lead 27.11.2026, PRO-31352 aus der Triage PRO-31345). Übernimmt
  `goals/_vorschlaege/fehler-2026-11-26-1.md`. Die 501 auf `/v1/domains/search` bleibt, wie `docs/errors.md` sie begründet.
- **Entscheidungen des Tech Lead (27.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, fehler 15: …` in
  `goals/fehler/ANNAHMEN.md`.
  1. **Die Log-Zeile:** genau an der Stelle, an der `handleChatUncoalesced` heute die 404 baut, `console.log` mit
     `[inference] model_not_found model=<id> known=<n>`, wobei `<n>` die Zahl der IDs in `catalog.modelIds()` ist. `<id>` ist der
     Wert aus der Anfrage, gekürzt auf 120 Zeichen; enthält er ein Zeichen außerhalb von `[A-Za-z0-9._:/@+-]`, steht dort
     `model=<invalid>` (kein Log-Injection über einen Zeilenumbruch). Nie Adresse, Wallet, IP, Schlüssel oder Nachrichten der
     Anfrage. Body und Status der 404 bleiben Byte für Byte.
  2. **Die IDs am Pin** liest der Maker aus einem Klon von `Conway-Research/automaton` am Commit `d8f8168` (nur lesend, in `mktemp
     -d`, nie unter `harness/runtime/`): jede Modell-ID, die der Code als Wert für `model` an `/v1/chat/completions` schicken kann
     (Routing-Matrix, Vorgaben in `src/types.ts`, Rückfälle), je ID eine Zeile `MODEL <id>: <served|alias <ziel>|missing>, <Datei>:<Zeile>
     am Pin d8f8168` in `docs/fehler/modelle-am-pin.md`.
  3. **Wann ein Alias kommt:** nur wenn OpenRouter genau `openai/<id>` führt (gleicher Name, keine Variante wie `-codex`, `-chat`
     oder `-pro`); dann ein Eintrag in `DEFAULT_OPENROUTER_ALIASES`. Sonst bleibt die 404 und die Zeile nennt den Grund. Der Kommentar
     zu `gpt-5.3` in `src/inference/openrouter.ts:70` bleibt gültig, solange OpenRouter nur die Codex-Variante führt. Kein Claude- und
     kein Anthropic-Modell (Grundregel 11). Die Liste von OpenRouter liest der Maker öffentlich und nur lesend
     (`https://openrouter.ai/api/v1/models`), als Zeile `Gelesen: <UTC-Zeit>, <Zahl> Modelle` im Dokument.
  4. **Lesend messen:** die 404 auf `POST /v1/chat/completions` an fremde Adressen je Tag seit 2026-11-21 aus dem Zugriffslog
     (`ops/access-log.sh`, eigene Adressen aus `ops/own-ips.txt`), nur Zählungen, keine Adresse, keine Zeit je Kunde, als Abschnitt
     `## 404 seit 2026-11-21` mit dem Befehl und seiner Ausgabe. Welches Modell diese 404 wollten, zeigt erst die Zeile aus
     Entscheidung 1 nach dem Rollout; das liest der Release Manager in der Live-Prüfung.
- **Tests** in `test/inference-model-not-found.test.ts`, ohne Netz und ohne festen Port, mit einem Spion auf `console.log`: „logs the
  requested model on model_not_found without the address“ (die Zeile trägt das Modell und nicht die Adresse der Anfrage), „logs
  model=<invalid> for a model with a line break“ und, wenn Entscheidung 3 einen Alias bringt, „answers <id> through the default
  alias“. Am Kopf von `dev` ist der erste Fall rot; die Zeile im Progress Log sagt, womit.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `proxy.ts` oder `openrouter.ts` nennen
  (`grep -l -E 'proxy\.ts|openrouter\.ts' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem Bau erneut; ein fremder
  roter Prüfbefehl geht mit Befehl und beiden Ausgaben als Frage an den Tech Lead auf dem Topic.
- Zugang: `set -a; . ~/.config/control-plane/loop.env; set +a` für das Zugriffslog, nur lesen (`loop-constraints.md`, Produktion:
  nur lesen). Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Code,
  Bezeichner, Testnamen und Log-Zeilen englisch.

## Done Condition
- [x] Bei `model_not_found` schreibt der Dienst genau eine Zeile `[inference] model_not_found model=<id> known=<n>` ohne Adresse; die
      Antwort bleibt, wie sie ist.
      MVP: Funktion, weil der nächste 404 eines fremden Kunden sonst wieder ohne das Modell verschwindet.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/inference-model-not-found.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "logs the requested model on model_not_found without the address" "logs model=<invalid> for a model with a line break"; do grep -qF "\"$t\"" test/inference-model-not-found.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'model_not_found model=' src/inference/proxy.ts` muss genau 1 ausgeben.
- [x] `docs/fehler/modelle-am-pin.md` nennt jede Modell-ID der Runtime am Pin mit Fundstelle und Ergebnis, dazu die 404 seit
      2026-11-21 als Zählung; jede ID mit `missing` trägt ihren Grund.
      MVP: Funktion, weil erst die Liste zeigt, welche Züge einer fremden Runtime bei uns ins Leere gehen.
      Prüfung: `grep -c -E '^MODEL [A-Za-z0-9._/-]+: (served|alias [A-Za-z0-9._/-]+|missing, .+), [^ ]+:[0-9]+ am Pin d8f8168' docs/fehler/modelle-am-pin.md` muss mindestens 3 ausgeben.
      Prüfung: `grep -c -E '^(## 404 seit 2026-11-21|Gelesen: )' docs/fehler/modelle-am-pin.md` muss genau 2 ausgeben.
      Prüfung: `grep -c -E '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|0x[0-9a-fA-F]{40}' docs/fehler/modelle-am-pin.md` muss 0 ausgeben.
- [x] Jede ID mit `alias` im Dokument steht in `DEFAULT_OPENROUTER_ALIASES`, keine ID mit `missing` steht dort, und kein Alias zeigt
      auf ein Claude- oder Anthropic-Modell.
      MVP: Funktion, weil ein Alias, den das Dokument nennt und der Code nicht hat, die 404 bestehen lässt.
      Prüfung: `for id in $(grep -oE '^MODEL [A-Za-z0-9._/-]+: alias' docs/fehler/modelle-am-pin.md | cut -d' ' -f2 | tr -d :); do grep -qF "\"$id\":" src/inference/openrouter.ts || echo "fehlt: $id"; done` muss nichts ausgeben.
      Prüfung: `sed -n '/DEFAULT_OPENROUTER_ALIASES/,/^};/p' src/inference/openrouter.ts | grep -ciE 'claude|anthropic'` muss 0 ausgeben.
- [x] Die Entscheidungen stehen in `goals/fehler/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg.
      MVP: Funktion, weil das nächste Glied wissen muss, warum eine ID ohne Alias bleibt.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, fehler 15: ' goals/fehler/ANNAHMEN.md` muss mindestens 3 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/inference/proxy\.ts|src/inference/openrouter\.ts|test/inference-model-not-found\.test\.ts|docs/fehler/modelle-am-pin\.md|goals/fehler/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
- [x] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil sich `src/inference/proxy.ts` im Laufzeitpfad ändert und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/fehler-15 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Nach dem Rollout steht bei jedem 404 `model_not_found` das angefragte Modell im Log des Dienstes, ohne Adresse.
- [ ] Die Antwort 404 selbst, `/v1/models` und jede andere Antwort bleiben für jede ID ohne neuen Alias gleich.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse und keine IP eines Kunden, kein Claude- oder Anthropic-Modell.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/inference/proxy.ts`: nur die Log-Zeile an der 404 `model_not_found`; Reservierung, Abrechnung, 402 und jede andere Antwort
  bleiben Zeichen für Zeichen
- `src/inference/openrouter.ts`: nur Einträge in `DEFAULT_OPENROUTER_ALIASES` nach Entscheidung 3 und der Kommentar darüber
- `src/**` sonst, `ops/**`, `src/payments/**`, `src/auth/**`, `mcp/**`, `README.md`, `docs/errors.md`: unverändert
- `test/**` außer `test/inference-model-not-found.test.ts`: unverändert
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`,
  die der Tech Lead entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- jeder Wert in `/opt/control-plane/.env` (auch `CP_MODEL_ALIASES`), ein Rollout oder Neustart durch einen Agent, jede Abfrage der
  Produktion, die schreibt (`loop-constraints.md`, Produktion: nur lesen)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-27 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut: Log-Zeile `[inference] model_not_found model=<id> known=<n>` an der 404 in `src/inference/proxy.ts`, Test `test/inference-model-not-found.test.ts` (5 Fälle; am Kopf von `dev` `102ccd0` 3 rot mit `expected [] to deeply equal [ Array(1) ]`, der Fall mit dem Zeilenumbruch hinter der Kürzung rot gegen eine Fassung, die nur die ersten 120 Zeichen prüft), `docs/fehler/modelle-am-pin.md` mit sechs IDs am Pin (zwei über bestehende Aliase bedient, `gpt-5.3` und die drei `gpt-4.1`-IDs `missing` mit Grund, kein neuer Alias, Gründe in `goals/fehler/ANNAHMEN.md`), 404 seit 2026-11-21 gezählt mit Gegenprobe; die 310 lokalen Prüfbefehle der 14 DONE-Goals, die `proxy.ts` oder `openrouter.ts` nennen, vorher und nachher mit gleichen Exit-Codes (abweichende Ausgaben nur bei Temp-Pfaden, vitest-Zeilen langsamer Tests, der neuen Log-Zeile und den Umfangsprüfungen fremder Goals, die hier den Diff dieses Goals zählen). Prüfbefehle: P1 vitest Exit 0 (5 passed), Testnamen-Schleife leer, grep 1; P2 6, 2, 0; P3 Schleife leer, 0; P4 4, 0, 0; P5 `e2e pass` am Kopf `ac1860c` (Lauf 46019509890), Zählung 1; P6 `check: grün in 201 s` Exit 0.

## Blockers
