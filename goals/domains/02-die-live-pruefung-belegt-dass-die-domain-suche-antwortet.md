# Domains Goal 02: Die Live-Prüfung belegt, dass die Domain-Suche antwortet

## Status
ACTIVE

## Active Objective
`ops/live.sh` prüft nach jedem Rollout nicht nur, dass `/v1/domains/search` hinter der Schlüsselprüfung steht (401 ohne Schlüssel,
domains 01), sondern ruft die Suche zusätzlich mit dem Schlüssel unseres eigenen Kontos aus sandbox 03 (`LIVE_SANDBOX_KEY`) und prüft
Status und Felder der Antwort des Handlers, nur lesend, ohne Kauf. Der Selbsttest macht jede falsche Antwort rot (`ROADMAP.md`,
domains 02; übernimmt `goals/_vorschlaege/domains-kritik-2026-11-11-2.md`).
MVP: Funktion, weil ein Rollout, der die Suche wieder auf den 404 der Rückfallroute oder auf `available: false` bringt, einen fremden
Automaton beim Start seines Dienstes wieder vier Versuche je Suche kostet oder ihm freie Namen als vergeben zeigt, und heute merkt das
nach dem Rollout niemand.

## Voraussetzungen
- domains Goal 01 DONE
- sandbox Goal 03 DONE

## Kontext für den Maker
- Widerlegt ist das Glied nicht: `judge_domains` in `ops/live.sh` wertet heute nur den 401 ohne Schlüssel aus, keine Antwort des
  Handlers (`grep -n "judge_domains" ops/live.sh`, Kommentarkopf Zeile 24 bis 26).
- Annahme: Die Prüfung erwartet 501, nicht 200 wie in der Zeile der ROADMAP, weil domains 01 die Suche in Zyklus 3 (Kritik Punkt 6) auf
  501 `not_implemented` gestellt hat: Eine 200 mit `available: false` macht das Werkzeug `search_domains` der Runtime zu
  `<name>: taken` (`goals/domains/ANNAHMEN.md`, erster Eintrag; `src/domains.ts`). Gemessen am 12.11.2026 vom code-host mit dem
  Schlüssel aus `~/.config/control-plane/live-sandbox.env`: `GET /v1/domains/search?query=livecheck&tlds=com` antwortet 501 mit
  `"error":"not_implemented"`, `"reason":"domain search is not offered"`, `"names":["livecheck.com"]` und einer `message`, die mit
  „No domain can be registered here“ beginnt und kein `taken` enthält; ohne Schlüssel 401.
- Eine Antwort ist richtig genau dann, wenn alle fünf Merkmale stimmen: Status 501, `error` gleich `not_implemented`, `reason` gleich
  `domain search is not offered`, `names` enthält `livecheck.com`, `message` enthält „No domain can be registered here“ und kein
  `taken` (Groß- und Kleinschreibung egal). Alles andere ist FAIL mit dem ersten Merkmal, das fehlt, auch ein 200 mit `results[]`.
- Neue Prüfung `domains-search` neben der bestehenden `domains`, die bleibt, wie sie ist: eine Richterfunktion `judge_domains_search`
  (Status, Antworttext), im Selbsttest je Fall eine Zeile `planted domains-search <fall>: <Ausgabe des Richters>` mit den Fällen `ok`
  (die Antwort von oben), `404` (Rückfallroute), `401` (Schlüssel abgelehnt), `fields` (501 ohne `names` und `reason`, etwa die
  Antwort von `POST /v1/domains/register`), `taken` (200 mit `results[]` und `available: false`), `none` (keine Antwort) und `nokey`
  (kein Schlüssel lesbar). Im Live-Lauf liest sie den Schlüssel so wie `sandbox_live` aus `LIVE_SANDBOX_ENV`, schickt ihn über eine
  Header-Datei aus `mktemp` (nie auf der Kommandozeile von `curl`), löscht die Datei danach und gibt den Schlüssel nie aus; fehlt er,
  ist das `FAIL domains-search: ...` und kein Abbruch der übrigen Prüfungen. Der Kommentarkopf nennt die neue Prüfung.
- Damit der Richter nicht von einer abgeschriebenen Antwort lebt, reicht ein vitest-Test die echte Antwort des Handlers durch ihn: App
  mit einem im Test angelegten Schlüssel, derselbe Pfad wie `DOMAINS_PATH`, Ergebnis `OK domains-search`; dieselbe App ohne Schlüssel
  und `POST /v1/domains/register` mit Schlüssel ergeben `FAIL domains-search`. Wie der Test den Richter ohne Netz aufruft (etwa ein
  Schalter von `ops/live.sh`, den auch der Selbsttest nutzt), entscheidest du und hältst es in `goals/domains/ANNAHMEN.md` fest.
- Der Laufzeitpfad ändert sich nicht, `src/` bleibt unverändert. Passt eine Antwort des Handlers nicht zur Prüfung, ändert sich die
  Prüfung nicht und das Goal geht mit dem Befund an den Tech Lead.
- Danach schneller zu mehr zahlenden fremden Automatons: Sandbox und Domain-Suche sind die beiden Wege, auf denen ein Automaton seinen
  Dienst bei uns startet, und beide stehen dann nach jedem Rollout unter Live-Prüfung mit unserem eigenen Konto.

## Done Condition
- [x] Der Selbsttest von `ops/live.sh` prüft die Suche mit Schlüssel in beide Richtungen: die richtige Antwort OK, 404, 401 mit
      Schlüssel, eine Antwort ohne die Felder, ein 200 mit `available: false`, keine Antwort und ein fehlender Schlüssel FAIL; die
      bestehende Prüfung `domains` bleibt grün.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `LIVE SELFTEST OK` ausgeben.
      Prüfung: `bash ops/live.sh --selftest | grep -c '^planted domains-search ok: OK domains-search'` muss `1` ausgeben.
      Prüfung: `bash ops/live.sh --selftest | grep -cE '^planted domains-search (404|401|fields|taken|none|nokey): FAIL domains-search'` muss `6` ausgeben.
      Prüfung: `bash ops/live.sh --selftest | grep -c '^planted domains 401: OK domains'` muss `1` ausgeben.
- [x] Der Richter urteilt über die echte Antwort des Handlers: ein vitest-Test reicht die Antwort der App mit Schlüssel durch ihn und
      verlangt OK, ohne Schlüssel und für `POST /v1/domains/register` FAIL.
      Prüfung: `pnpm -s vitest run test/live-selftest.test.ts -t "domains-search"` muss Exit-Code 0 haben und mindestens einen Test als passed zählen.
      Prüfung: `grep -c "domains-search" test/live-selftest.test.ts` muss mindestens `3` ausgeben.
- [x] Der Live-Lauf ruft die Suche mit dem Schlüssel aus `~/.config/control-plane/live-sandbox.env`, urteilt OK über die ausgerollte
      Antwort und gibt den Schlüssel nie aus; der Kommentarkopf nennt die Prüfung.
      Prüfung: `bash ops/live.sh --help | grep -c "domains-search"` muss mindestens `1` ausgeben.
      Prüfung (Netz): `k="$(sed -n 's/^LIVE_SANDBOX_KEY=//p' ~/.config/control-plane/live-sandbox.env | head -n 1 | tr -d "\"'\r")"; out="$(bash ops/live.sh 2>&1)"; echo "ok=$(grep -c '^OK domains-search: ' <<<"$out") key=$(grep -cF -- "$k" <<<"$out")"` muss `ok=1 key=0` ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

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
- 2026-11-13 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: neue Prüfung `domains-search` in `ops/live.sh` (Richter `judge_domains_search` über Status und die fünf Merkmale, Live-Aufruf mit `LIVE_SANDBOX_KEY` über eine Header-Datei aus `mktemp`, Schalter `--judge domains-search`, Kommentarkopf), Selbsttest mit den Fällen ok, 404, 401, fields, taken, none, nokey und drei Fällen je Merkmal, vitest-Test mit der echten Antwort des Handlers; `src/` unverändert. Rot vorher: `test/live-selftest.test.ts` 4 von 4 rot gegen das alte `ops/live.sh` (`--judge` Exit 2, Selbsttest ohne `planted domains-search`), `grep -c '^planted domains-search'` auf dem alten Selbsttest 0. Prüfbefehle (Node 22.23.4): P1 `bash ops/live.sh --selftest` Exit 0, letzte Zeile `LIVE SELFTEST OK`, ok-Zeile 1, FAIL-Zeilen 6, `planted domains 401: OK domains` 1; P2 `vitest run test/live-selftest.test.ts -t "domains-search"` 3 passed Exit 0, `grep -c` 12; P3 `--help` 3, Live-Lauf `ok=1 key=0` (Schlüssel nicht leer, Gegenprobe mit gepflanztem Schlüssel zählt 1), `LIVE OK`; P4 `node scripts/check.mjs` Exit 0 (1493 Tests, 149 s; der erste Lauf bei Last 167 mit zwei vitest-RPC-Timeouts rot, alle Tests grün).

## Blockers
