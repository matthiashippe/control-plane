# Fehler Goal 17: gpt-4.1, -mini und -nano bekommen eine Antwort statt 404

## Status
ACTIVE

## Active Objective
Worker und Planer der unveränderten Runtime fragen ohne eigenen OpenAI-Schlüssel bei uns nach `gpt-4.1`, `gpt-4.1-mini` und
`gpt-4.1-nano` (`src/inference/provider-registry.ts:79`, `:90` und `:101` am Pin `d8f8168`, `src/agent/loop.ts:154` bis `:169`), und
die drei stehen in der Grundliste, aus der der Betreiber im Setup sein Modell wählt (`STATIC_MODEL_BASELINE`). OpenRouter führt alle
drei unter genau `openai/<id>` (`docs/fehler/modelle-am-pin.md`, gelesen 2026-11-27T14:40:38Z), der Dienst antwortet trotzdem mit
404 `model_not_found`, weil der Katalog nur lädt, was `CP_OPENROUTER_MODELS` nennt (`src/inference/openrouter.ts:354`), in der
Produktion `openai/gpt-5.2,openai/gpt-5-mini`, und ein Alias ohne geladenes Ziel wegfällt (`defaultAliases()`). Nach diesem Goal lädt
der Dienst die drei Modelle immer dazu, wenn OpenRouter sie führt, mit Alias auf die ID der Runtime, zum selben Preis wie jedes
Modell (Einkauf mal 1,3), ohne dass jemand `/opt/control-plane/.env` ändert.
Leitzahl: 404 `model_not_found` mit `model=gpt-4.1`, `model=gpt-4.1-mini` oder `model=gpt-4.1-nano` im Log des Dienstes je Woche,
Ziel 0 (vorher gemessen in Punkt 1).
Widerlegt, wenn `/v1/models` am Kopf von `dev` mit `CP_OPENROUTER_MODELS=openai/gpt-5.2,openai/gpt-5-mini` schon `gpt-4.1` führt.
MVP: Funktion, weil ein fremder Automaton, dessen Worker bei uns 404 bekommt, diese Arbeit bei einem anderen Anbieter kauft oder gar
nicht tut.

## Voraussetzungen
- fehler Goal 16 DONE

## Kontext für den Maker
- Ziel in einem Satz: Eine unveränderte Runtime bekommt auf jede Modell-ID, die sie am Pin anfragt und die OpenRouter unter diesem
  Namen führt, eine Antwort statt 404.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Worker und Planer sind die Teile der Runtime, die eigenständig
  Aufgaben abarbeiten; bekommen sie bei uns 404, bleibt die Arbeit liegen, für die ein Betreiber zahlt, und er sucht einen Anbieter,
  bei dem sie läuft.
- Quelle: `ROADMAP.md`, Topic `fehler`, Glied 17 (Tech Lead 28.11.2026, PRO-32469 aus der Triage PRO-32461, Glied 2). Übernimmt
  `goals/_vorschlaege/fehler-kritik-2026-11-27-5.md`. Vorgänger `goals/fehler/15-ein-404-model-not-found-nennt-im-log-das-modell.md`
  (DONE, ausgerollt mit dem Lauf von `deploy.yml` an `c1149a2`, Job `deploy` fertig 2026-11-27T16:10:23Z), dessen Log-Zeile
  `[inference] model_not_found model=<id> known=<n>` hier gezählt wird.
- **Entscheidungen des Tech Lead (28.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, fehler 17: …` in
  `goals/fehler/ANNAHMEN.md`.
  1. **Gebaut wird unabhängig von der Messung**, anders als die Triage vorschlug (eine Woche Log abwarten). Die Runtime am Pin schickt
     diese IDs nachweislich (Fundstellen oben), OpenRouter führt sie genau unter diesem Namen, und jede Anfrage bis dahin ist ein 404
     an einen zahlenden Kunden (Grundregel 4). Punkt 1 misst den Stand vorher, er ist kein Gate.
  2. **Kein Human Gate, kein Wert in `/opt/control-plane/.env`.** Eine Änderung an `.env` der Produktion macht keine Rolle, und
     Matthias will keine Karte, die eine Rolle selbst lösen kann (Grundregel 9). Darum lädt der Code die Modelle der Runtime am Pin
     selbst dazu: eine Konstante `RUNTIME_PIN_MODELS = ["openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano"]` in
     `src/inference/openrouter.ts`, vereinigt mit der Liste aus `CP_OPENROUTER_MODELS` (oder `DEFAULT_OPENROUTER_MODELS`), ohne
     Doppel, Reihenfolge erst die Liste aus der Umgebung. `CP_OPENROUTER_MODELS` behält seine Bedeutung für alles andere.
  3. **Ein Modell der Runtime, das OpenRouter nicht führt, hält den Start nie auf.** Heute bricht der Start ab, wenn ein konfiguriertes
     Modell bei OpenRouter fehlt (`test/openrouter.test.ts`, „aborts the start when a configured model is missing at OpenRouter“);
     das bleibt für die Liste aus der Umgebung Zeichen für Zeichen. Fehlt eines aus `RUNTIME_PIN_MODELS`, bleibt es draußen, sein
     Alias fällt weg, und der Dienst schreibt beim Start genau eine Zeile `[inference] pin model not offered model=<id>`.
  4. **Aliase:** `DEFAULT_OPENROUTER_ALIASES` bekommt `gpt-4.1`, `gpt-4.1-mini` und `gpt-4.1-nano` auf `openai/<id>`. `gpt-5.3`
     bleibt ohne Alias (fehler 15 Entscheidung 3).
  5. **Preis wie jedes Modell:** aus dem Katalog von OpenRouter mal 1,3, kein eigener Preis, keine eigene Grenze; `parameter_style`
     und Reservierung wie bei jedem anderen Modell. Ob `gpt-4.1` `max_tokens` oder `max_completion_tokens` braucht, liest der Maker aus
     `/models` von OpenRouter (öffentlich, nur lesend) und hält es im Test fest.
- **Messung (Punkt 1), nur lesend:** Zeilen `[inference] model_not_found model=gpt-4.1…` seit dem Rollout von fehler 15
  (2026-11-27T16:10:23Z) im Log des laufenden Containers (`docker logs deploy-cp-1`) und in den gesicherten Logs ersetzter Container
  (`/var/log/cp-history/cp-*.log.gz`, geschrieben vom Schritt „Log des laufenden Containers sichern“ in `deploy.yml`), je ID gezählt,
  ohne Adresse. Gegenprobe (Grundregel 3): derselbe Zähler über eine Kopie mit einer gepflanzten Zeile zählt eins mehr. Ergebnis in
  `docs/fehler/modelle-am-pin.md` unter einer neuen Überschrift `## 404 je Modell seit fehler 15`, je eine Zeile ab Spalte 0:
  `Gemessen: <JJJJ-MM-TTTHH:MM:SSZ>`, `NOT_FOUND gpt-4.1 since 2026-11-27T16:10:23Z: <n>` und ebenso für `gpt-4.1-mini`,
  `gpt-4.1-nano` und `other`, dazu der Befehl und ein Satz zur Gegenprobe. Die bestehenden Abschnitte bleiben, nur die Zeilen
  `MODEL gpt-4.1…` werden zu `alias openai/gpt-4.1…` mit Fundstelle.
- **Tests:** eine neue Datei `test/openrouter-pin-models.test.ts` mit genau diesen Fällen, jeder rot vor der Änderung: „serves gpt-4.1,
  gpt-4.1-mini and gpt-4.1-nano with CP_OPENROUTER_MODELS naming only gpt-5.2 and gpt-5-mini“, „leaves a pin model out when
  OpenRouter does not offer it and still starts“, „still aborts the start when a model from CP_OPENROUTER_MODELS is missing“, „lists
  no model twice when CP_OPENROUTER_MODELS names a pin model“ und „charges a pin model at the catalogue price times 1.3“. Kein Netz,
  `fetch` als Mock wie in `test/openrouter.test.ts`. Dort ändert sich nur, was die Vorgaben mit den geladenen Zielen gleichsetzt
  (Zeile 95), damit die drei neuen Aliase zählen.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle ohne Netz der Goals mit Status `DONE`, die `openrouter.ts`, `openrouter.test.ts` oder
  `modelle-am-pin.md` nennen (`grep -l -E 'openrouter\.ts|openrouter\.test\.ts|modelle-am-pin' goals/*/[0-9]*.md`), einmal am Kopf
  von `dev` fahren und nach dem Bau erneut; ein fremder roter Prüfbefehl geht mit Befehl und beiden Ausgaben als Frage an den Tech Lead
  auf dem Topic.
- Zugang: `set -a; . ~/.config/control-plane/loop.env; set +a`, dann `ssh -i "$CP_SSH_KEY" "$CP_HOST"`, nur lesen. Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Rollout mit dem Merge (`src/**`). Code,
  Bezeichner, Testnamen, Log-Zeilen englisch. Kein Claude- und kein Anthropic-Modell (Grundregel 11).

## Done Condition
- [x] `docs/fehler/modelle-am-pin.md` nennt je ID, wie oft sie seit dem Rollout von fehler 15 404 bekam, mit Befehl und Gegenprobe.
      MVP: Funktion, weil die Leitzahl ohne Stand vorher nicht zeigt, ob das Goal einen 404 weniger bringt.
      Prüfung: `grep -cE '^NOT_FOUND (gpt-4\.1|gpt-4\.1-mini|gpt-4\.1-nano|other) since 2026-11-27T16:10:23Z: [0-9]+$' docs/fehler/modelle-am-pin.md` muss genau 4 ausgeben.
      Prüfung: `d=docs/fehler/modelle-am-pin.md; g=$(sed -nE 's/^Gemessen: ([0-9T:-]+Z)$/\1/p' "$d" | tail -1); [ -n "$g" ] && [ "$g" \> "2026-11-28T06:00:00Z" ] && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `grep -cE '0x[0-9a-fA-F]{40}|([0-9]{1,3}\.){3}[0-9]{1,3}' docs/fehler/modelle-am-pin.md` muss 0 ausgeben.
- [x] Der Dienst lädt `openai/gpt-4.1`, `openai/gpt-4.1-mini` und `openai/gpt-4.1-nano` zusätzlich zu `CP_OPENROUTER_MODELS`, mit
      Alias auf die ID der Runtime, und startet auch, wenn OpenRouter eines davon nicht führt; Tests rot vor der Änderung.
      MVP: Funktion, weil Worker und Planer der Runtime sonst auf jede Anfrage 404 bekommen.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/openrouter-pin-models.test.ts test/openrouter.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "serves gpt-4.1, gpt-4.1-mini and gpt-4.1-nano with CP_OPENROUTER_MODELS naming only gpt-5.2 and gpt-5-mini" "leaves a pin model out when OpenRouter does not offer it and still starts" "still aborts the start when a model from CP_OPENROUTER_MODELS is missing" "lists no model twice when CP_OPENROUTER_MODELS names a pin model" "charges a pin model at the catalogue price times 1.3"; do grep -qF "\"$t\"" test/openrouter-pin-models.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -cE '"gpt-4\.1(-mini|-nano)?": "openai/gpt-4\.1(-mini|-nano)?"' src/inference/openrouter.ts` muss genau 3 ausgeben.
      Prüfung: `grep -c '^export const RUNTIME_PIN_MODELS = \["openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano"\];$' src/inference/openrouter.ts` muss genau 1 ausgeben.
      Prüfung: `grep -c -E 'claude|anthropic' src/inference/openrouter.ts` muss 0 ausgeben.
- [x] `docs/fehler/modelle-am-pin.md` führt die drei IDs als Alias statt als missing.
      MVP: Funktion, weil das nächste Glied aus dieser Liste liest, welche IDs der Runtime noch 404 bekommen.
      Prüfung: `grep -cE '^MODEL gpt-4\.1(-mini|-nano)?: alias openai/gpt-4\.1(-mini|-nano)?, ' docs/fehler/modelle-am-pin.md` muss genau 3 ausgeben.
      Prüfung: `grep -cE '^MODEL gpt-4\.1(-mini|-nano)?: missing' docs/fehler/modelle-am-pin.md` muss 0 ausgeben.
- [x] Die Entscheidungen stehen in `goals/fehler/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg.
      MVP: Funktion, weil das nächste Glied wissen muss, warum der Katalog Modelle außerhalb von `CP_OPENROUTER_MODELS` lädt.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, fehler 17: ' goals/fehler/ANNAHMEN.md` muss mindestens 5 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/inference/openrouter\.ts|test/openrouter-pin-models\.test\.ts|test/openrouter\.test\.ts|docs/fehler/modelle-am-pin\.md|goals/fehler/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
- [x] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil sich der Katalog im Laufzeitpfad ändert und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/fehler-17 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Eine Anfrage mit `model: "gpt-4.1-mini"` bekommt nach dem Rollout 200 und wird nach `usage` mal 1,3 abgerechnet.
- [ ] Wer heute `gpt-5.2` oder `gpt-5-mini` nutzt, merkt nichts: gleiche Anfrage an den Anbieter, gleiche Abrechnung.
- [ ] Ein Modell der Runtime, das OpenRouter nicht mehr führt, legt den Dienst nie still.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse und keine IP eines Kunden, kein Betrag je Kunde.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/**` außer `src/inference/openrouter.ts`, `src/payments/**`, `src/auth/**`: unverändert
- `test/**` außer dem neuen `test/openrouter-pin-models.test.ts` und der Gleichsetzung in `test/openrouter.test.ts` Zeile 95:
  unverändert
- `docs/fehler/modelle-am-pin.md`: nur die drei Zeilen `MODEL gpt-4.1…` und der neue Abschnitt; `docs/**` sonst, `ROADMAP.md`,
  `STATE.md`, bestehende Goal-Dateien und Vorschläge: unverändert
- `/opt/control-plane/.env`, Compose, Cron und Datenbank der Produktion, ein Rollout oder Neustart durch einen Agent; gelesen wird nur
  mit `docker logs`, `zcat` auf `/var/log/cp-history/` und `docker exec deploy-cp-1 printenv CP_OPENROUTER_MODELS`
- kein Claude- und kein Anthropic-Modell, kein `ANTHROPIC_API_KEY`
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-28 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut: `RUNTIME_PIN_MODELS` lädt gpt-4.1, -mini und -nano als `optionalModels` hinter `CP_OPENROUTER_MODELS` mit drei Aliasen, ein fehlendes Modell der Runtime hält den Start nicht auf, gpt-4.1-nano bekommt die Grenze in `max_completion_tokens`, weil OpenRouter für nano nur dieses Feld listet; Messung 404 je ID seit fehler 15 je 0 (Gegenprobe je ID 1). Neue Tests rot vor der Änderung: alle fünf in `test/openrouter-pin-models.test.ts` (vier mit `expected [ 'openai/gpt-5.2', …(1) ]` statt der Pin-Modelle, einer mit `RUNTIME_PIN_MODELS is not iterable`). Fremde DONE-Goals (fehler 13, 15, abrechnung 01) vor und nach dem Bau grün. Prüfbefehle: P1 `4`, `stimmig`, `0`; P2 vitest Exit 0 (21 Tests), Testnamen nichts fehlt, Aliase `3`, `RUNTIME_PIN_MODELS` `1`, claude/anthropic `0`; P3 `3`, `0`; P4 `7`, Pfade `0`, gelöschte Tests `0`; P5 `e2e pass` am Code-Commit 7a292c8 (PR #500); P6 `check: grün in 202 s`.
- 2026-11-28 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6; dev (f1306aa) war schon im Branch. Prüfbefehle am Kopf 62afaf7: P1 `4`, `stimmig`, `0`; P2 vitest Exit 0 (21 Tests), Testnamen nichts fehlt, Aliase `3`, `RUNTIME_PIN_MODELS` `1`, claude/anthropic `0`; P3 `3`, `0`; P4 `7`, Pfade `0`, gelöschte Tests `0`; P5 `1` (e2e pass am Kopf 62afaf7, Lauf 46124271505); P6 `check: grün in 187 s`.

## Blockers
- keine
