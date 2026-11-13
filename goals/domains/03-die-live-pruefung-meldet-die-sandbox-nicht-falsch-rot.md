# Domains Goal 03: Die Live-Prüfung meldet die Sandbox nicht falsch rot und lässt keinen Schlüssel liegen

## Status
DONE

## Active Objective
`ops/live.sh` wartet nach einem neuen Client-Schlüssel (`changed=1` von `ops/sandbox/setup.sh --client-key`), bis ein
Abrechnungstakt nach dem neuen Schlüssel vergangen ist (mehr als 60 s, `RECHECK_MS` in `src/sandbox/service.ts`), bevor es die
Sandbox anlegt, und legt die Dateien mit `LIVE_SANDBOX_KEY` in `domains_search_live` und `sandbox_live` in ein Verzeichnis aus
`mktemp -d`, das ein `trap … EXIT INT TERM` in `live()` löscht. Der Dienst bleibt, wie er ist (`ROADMAP.md`, domains 03; übernimmt
`goals/_vorschlaege/sandbox-kritik-2026-11-12-5.md` und `goals/_vorschlaege/domains-kritik-2026-11-13-1.md`).
MVP: Funktion, weil eine Live-Prüfung, die nach einem Rollout falsch rot meldet, nach `LOOP.md` (Release) einen Revert des
schuldigen Merges auslöst, also eine gute Änderung zurücknimmt, und weil ein abgebrochener Lauf heute den Schlüssel unseres eigenen
Kontos als Datei in `/tmp` des code-host liegen lässt.

## Voraussetzungen
- domains Goal 02 DONE
- sandbox Goal 05 DONE

## Kontext für den Maker
- Widerlegt ist das Glied nicht: `sandbox_live` ruft `setup.sh --client-key` und schickt `POST /v1/sandboxes` ohne Pause danach,
  und `domains_search_live` und `sandbox_live` legen die Header-Datei mit `hdr="$(mktemp)"` an und löschen sie erst nach `curl`;
  `live()` hat kein `trap`, nur der Selbsttest hat `trap 'rm -rf "$dir"' RETURN` (`grep -n 'mktemp\|trap' ops/live.sh`).
- Beleg für das falsche Rot: `docker logs --timestamps --since 2026-11-12T18:00:00Z deploy-cp-1 | grep -F "key not accepted"` ergab
  5 Zeilen von 18:18:48 bis 18:22:48 UTC, der Release PRO-18839 um 18:23 `FAIL sandbox` mit 501, `bash ops/live.sh` gegen 22:50 UTC
  dann `OK sandbox`. Ursache: Nach einem gescheiterten Aufruf an `sandboxd` antwortet `POST /v1/sandboxes` 60 s lang sofort 501
  (`knownDown` mit `RECHECK_MS = 60_000` in `src/sandbox/service.ts`). Das bleibt so, weil die sofortige 501 verhindert, dass die
  Runtime Guthaben für eine Sandbox kauft, die nicht startet; die Prüfung wartet, nicht der Dienst.
- Annahme: sandbox 05 steht unter Voraussetzungen, weil es auf `goal/sandbox-05` `sandbox_live`, den Selbsttest und
  `test/live-selftest.test.ts` ändert (Hintergrundlauf `sleep 25; echo bg-ok`); dieses Goal baut auf dessen Stand, damit kein
  Merge-Konflikt in denselben Zeilen entsteht.
- Warten: nur nach `SETUP CLIENT-KEY OK changed=1`, nicht nach `changed=0`, damit der übliche Lauf nicht länger dauert. Die Wartezeit
  steht einmal in `ops/live.sh` als Zahl in Sekunden; ein vitest-Test liest sie und `RECHECK_MS` aus `src/sandbox/service.ts` und
  verlangt, dass sie größer ist als `RECHECK_MS / 1000`, damit ein späteres `RECHECK_MS` die Prüfung nicht still wieder falsch rot
  macht. Wie der Test die Zahl findet (etwa eine Zeile `CLIENT_KEY_WAIT_S=` wie `DOMAINS_PATH=`), entscheidest du und hältst es in
  `goals/domains/ANNAHMEN.md` fest.
- Selbsttest für das Warten, Zeilen `planted sandbox-wait <fall>: <Ausgabe des Richters>`: `new-key` (der echte `sandbox_live` mit
  `changed=1` wartet mehr als 60 s vor dem Anlegen, OK), `old-key` (mit `changed=0` ohne Warten, OK), `no-wait` (Anlegen direkt nach
  `changed=1`, FAIL) und `short` (genau 60 s, FAIL). Der Selbsttest schläft nicht wirklich: Das Warten läuft über eine Funktion, die
  der Selbsttest ersetzt und die die Sekunden mitzählt, sonst reißt `check` seine Zeitgrenze.
- Falle: `sandbox_live` startet `bash "$ROOT/ops/sandbox/setup.sh"` als Kindprozess, und die Funktionen `curl` und `ssh` des
  Selbsttests gelten dort nicht; mit leerem `CP_HOST` lädt das Skript `loop.env` und greift auf den Sandbox-Server. Der Selbsttest
  darf `setup.sh` deshalb nie starten: Der Aufruf wird ersetzbar (Variable oder Funktion), und der Selbsttest legt eine Attrappe ein,
  die `SETUP CLIENT-KEY OK changed=1` oder `changed=0` ausgibt. Ohne Netz heißt auch: kein `ssh` und kein `curl` im Kindprozess.
- Selbsttest für die Dateien, Zeilen `planted key-cleanup <fall>: <Ausgabe des Richters>`: `term-search` (ein schlafender `curl` in
  `domains_search_live`, der Lauf von `live()` beendet mit `kill -TERM`, OK, wenn `TMPDIR` des Laufs danach leer ist), `term-sandbox`
  (dasselbe während `POST /v1/sandboxes` in `sandbox_live`, OK bei leerem `TMPDIR`) und `leftover` (ein `TMPDIR` mit einer liegen
  gebliebenen Datei, FAIL). Der Lauf bekommt ein eigenes `TMPDIR` aus dem Selbsttest, eine Schlüsseldatei mit einem erfundenen
  Schlüssel, `CP_HOST=fake.invalid` und Attrappen für `curl`, `ssh` und `setup.sh`. Bash führt einen `trap` erst aus, wenn das
  Kommando im Vordergrund endet: Der Selbsttest muss nach `kill -TERM` binnen 15 s fertig sein, wie du das erreichst (etwa kurzer
  Schlaf der Attrappe oder Signal an die Prozessgruppe), hältst du in `goals/domains/ANNAHMEN.md` fest.
- Der `trap` löscht nur das eigene Verzeichnis, ruft kein Netz und gibt den Schlüssel nie aus; er verträgt sich mit dem `trap … RETURN`
  des Selbsttests. Eine Sandbox, die ein Abbruch zwischen Anlegen und `DELETE` liegen lässt, ist nicht Teil dieses Goals.
- Die Fälle des Selbsttests aus domains 02 und sandbox 05 bleiben, wie sie sind.
- Danach schneller zu mehr zahlenden fremden Automatons: Die Live-Prüfung nach jedem Rollout bleibt ein Signal, dem der Release
  Manager glauben kann, und nimmt keine gute Änderung an Sandbox oder Abrechnung mehr zurück, nur weil der Client-Schlüssel gerade
  neu ist.

## Done Condition
- [x] Der Selbsttest prüft das Warten in beide Richtungen: der echte `sandbox_live` wartet nach `changed=1` mehr als 60 s und nach
      `changed=0` nicht, ein Anlegen direkt nach `changed=1` und eines nach genau 60 s sind FAIL.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `LIVE SELFTEST OK` ausgeben.
      Prüfung: `bash ops/live.sh --selftest | grep -cE '^planted sandbox-wait (new-key|old-key): OK '` muss `2` ausgeben.
      Prüfung: `bash ops/live.sh --selftest | grep -cE '^planted sandbox-wait (no-wait|short): FAIL '` muss `2` ausgeben.
- [x] Die Wartezeit hängt an `RECHECK_MS`: ein vitest-Test liest beide Zahlen und verlangt, dass die Wartezeit größer ist als
      `RECHECK_MS / 1000`.
      Prüfung: `pnpm -s vitest run test/live-selftest.test.ts -t "RECHECK_MS"` muss Exit-Code 0 haben und mindestens einen Test als passed zählen.
- [x] Ein mit `kill -TERM` abgebrochener Lauf lässt keine Datei liegen, weder während der Domain-Suche noch während des Anlegens der
      Sandbox, und eine liegen gebliebene Datei ist FAIL.
      Prüfung: `bash ops/live.sh --selftest | grep -cE '^planted key-cleanup (term-search|term-sandbox): OK '` muss `2` ausgeben.
      Prüfung: `bash ops/live.sh --selftest | grep -c '^planted key-cleanup leftover: FAIL '` muss `1` ausgeben.
      Prüfung: `t="$(mktemp -d)"; TMPDIR="$t" bash ops/live.sh --selftest >/dev/null; echo "left=$(find "$t" -mindepth 1 | wc -l)"; rm -rf "$t"` muss `left=0` ausgeben.
- [x] Der Live-Lauf bleibt grün, lässt in seinem `TMPDIR` nichts liegen und gibt den Schlüssel nie aus.
      Prüfung (Netz): `t="$(mktemp -d)"; k="$(sed -n 's/^LIVE_SANDBOX_KEY=//p' ~/.config/control-plane/live-sandbox.env | head -n 1 | tr -d "\"'\r")"; out="$(TMPDIR="$t" bash ops/live.sh 2>&1)"; echo "ok=$(grep -c '^OK sandbox: ' <<<"$out") live=$(tail -n 1 <<<"$out") left=$(find "$t" -mindepth 1 | wc -l) key=$(grep -cF -- "$k" <<<"$out")"; rm -rf "$t"` muss `ok=1 live=LIVE OK left=0 key=0` ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Ein mit `kill -KILL` abgebrochener Lauf, gegen den kein `trap` hilft (Timeout eines Agent-Werkzeugs, Abbruch eines Runs), lässt
      den Schlüssel nur bis zum nächsten Lauf liegen: `live()` legt seinen Ordner mit festem Präfix an und löscht beim Start die Ordner
      dieses Präfixes aus früheren Läufen, deren Prozess nicht mehr lebt, und keine andere Datei in `TMPDIR`. Selbsttest-Fälle
      `kill-sweep` (Lauf während des gehaltenen `curl` in `sandbox_live` mit `kill -KILL` beendet, danach ein zweiter Lauf von `live()`
      mit demselben `TMPDIR`; OK, wenn der Ordner des ersten Laufs danach fehlt) und `foreign` (eine fremde Datei und ein Ordner des
      Präfixes mit lebendem Prozess in `TMPDIR` überstehen den zweiten Lauf, OK). Wie der Ordner seinen Prozess nennt, hältst du in
      `goals/domains/ANNAHMEN.md` fest.
      Prüfung: `bash ops/live.sh --selftest | grep -cE '^planted key-cleanup (kill-sweep|foreign): OK '` muss `2` ausgeben.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `LIVE SELFTEST OK` ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die neuen Fälle im Selbsttest und der neue vitest-Test waren vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/sandbox/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`,
  `~/.config/control-plane/**` (nur lesen)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-13 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: `sandbox_live` wartet nach `SETUP CLIENT-KEY OK changed=1` `CLIENT_KEY_WAIT_S=75` Sekunden über `live_wait` vor dem Anlegen, `setup.sh` ist über `CLIENT_KEY_SETUP` ersetzbar, `live()` legt alle Dateien samt Schlüssel-Headern in einen Ordner aus `mktemp -d` (auch als `TMPDIR`), den `trap` auf EXIT, INT und TERM löscht; Selbsttest-Fälle `sandbox-wait` (new-key, old-key, no-wait, short) durch den echten `sandbox_live` und `key-cleanup` (term-search, term-sandbox als eigene Prozessgruppe mit `kill -TERM`, leftover), vitest-Test `RECHECK_MS`. Rot vorher: Selbsttest ohne die Zeile `live_wait` mit `new-key: FAIL` (created 0 s), ohne `trap` mit `term-search` 3 und `term-sandbox` 4 liegen gebliebenen Dateien, mit Warten auch bei `changed=0` `old-key: FAIL`, jeweils `LIVE SELFTEST FAIL`; vitest `RECHECK_MS` gegen das alte `ops/live.sh` und mit `CLIENT_KEY_WAIT_S=60` je 1 failed. Prüfbefehle (Node 22, Last um 110): P1 `--selftest` Exit 0, letzte Zeile `LIVE SELFTEST OK`, `sandbox-wait` OK 2, FAIL 2; P2 `vitest -t "RECHECK_MS"` 1 passed Exit 0; P3 `key-cleanup` OK 2, leftover FAIL 1, `left=0`; P4 (Netz) `ok=1 live=LIVE OK left=0 key=0` (Schlüssel 39 Zeichen, Gegenprobe mit gepflanztem Schlüssel zählt 1); P5 `node scripts/check.mjs` Exit 0 (1628 Tests, 446 s).
- 2026-11-13 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, nach Merge von `origin/dev` (b5cfc4f, nur `goals/konto/03-…`, `ops/live.sh` seit Zyklus 1 unverändert). Prüfbefehle (Node 22, Last um 90): P1 `--selftest` Exit 0, letzte Zeile `LIVE SELFTEST OK`, `sandbox-wait` OK 2, FAIL 2; P2 `vitest -t "RECHECK_MS"` 1 passed Exit 0; P3 `key-cleanup` OK 2, leftover FAIL 1, `left=0`; P4 (Netz) nicht neu gefahren, weil der Lauf in der Produktion eine Sandbox anlegt und bucht und `ops/live.sh` seit dem Lauf aus Zyklus 1 (`ok=1 live=LIVE OK left=0 key=0`) gleich ist; P5 `node scripts/check.mjs` Exit 0 (1628 Tests, 239 s).
- 2026-11-13 Zyklus 3: Punkt 6 gebaut: `live()` legt seinen Ordner als `live-run.<BASHPID>.XXXXXX` an und löscht vorher über `live_sweep` jeden eigenen Ordner dieses Präfixes in `TMPDIR`, dessen PID nicht mehr läuft, und sonst nichts; Selbsttest-Fälle `kill-sweep` (erster Lauf mit `kill -KILL` während `POST /v1/sandboxes`, zweiter Lauf mit demselben `TMPDIR`) und `foreign` (fremde Datei und Ordner mit lebendem Prozess bleiben), dazu die Richter-Fälle `kill-sweep-kept`, `kill-sweep-none`, `foreign-gone` und `foreign-living` als FAIL und die Erwartungen in `test/live-selftest.test.ts`. Rot vorher: ohne Präfix `kill-sweep: FAIL` (kein Ordner), mit Präfix ohne `live_sweep` `kill-sweep: FAIL` (1 Ordner bleibt), jeweils `LIVE SELFTEST FAIL`; Gegenproben mit `live_sweep` ohne PID-Prüfung und mit Löschen von ganz `TMPDIR` je `foreign: FAIL`. Prüfbefehle (Node 22, Last um 120): P6 `kill-sweep|foreign: OK` 2, `--selftest` Exit 0 und letzte Zeile `LIVE SELFTEST OK`; P1 `sandbox-wait` OK 2, FAIL 2; P2 `vitest -t "RECHECK_MS"` 1 passed Exit 0; P3 `key-cleanup` OK 2, leftover FAIL 1, `left=0`; P4 (Netz) mit dem neuen `live()` `ok=1 live=LIVE OK left=0 key=0` (Schlüssel 39 Zeichen, Gegenprobe mit gepflanztem Schlüssel zählt 1); P5 `node scripts/check.mjs` Exit 0 (1628 Tests, 165 s).
- 2026-11-13 Release: PASS K und B (Zyklus 3), DONE.

## Blockers
