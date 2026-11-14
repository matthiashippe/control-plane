# Messung Goal 01: Eigene Anfragen zählen nie als fremde

## Status
PLANNED

## Active Objective
`ops/claim-keyless.sh` entscheidet, welche schlüssellose Wallet (`key:…`) wir selbst angelegt haben, nach der Adresse, von der der
`201 POST /v1/auth/keyless` kam. Die eigenen Adressen liest es heute direkt aus `ops/own-ips.txt` (Zeile 71,
`own_ips=$(cat ops/own-ips.txt …)`). Diese Datei wächst seit betrieb 03 nur noch von Hand und zuletzt am 23.09.2026; die Adresse,
über die der code-host gerade ausgeht, und jede Adresse, die `own_ips` seit betrieb 03 außerhalb des Checkouts merkt
(`CP_OWN_IPS_SEEN`), fehlen dort. Eine Wallet, die unsere eigene Prüfung über eine solche Adresse anlegte, erscheint deshalb als
`STRANGER`, wird nie eingetragen und zählt in `wallets_foreign` (`ops/db-report.cjs`) als fremder Automaton. Nach diesem Goal sourct
`ops/claim-keyless.sh` die Datei `ops/own-ips.sh` und nimmt `own_ips`, also dieselben eigenen Adressen wie jedes andere Messwerkzeug
mit `own_ips`, und bricht mit Exit 2 ab, wenn die Liste fehlt, statt jede Wallet als fremd zu lesen.
Widerlegt, wenn eine Adresse, die nur in der Datei aus `CP_OWN_IPS_SEEN` steht, schon heute nicht als fremde zählt (der neue Test
ist dann vor dem Fix grün).
MVP: Funktion, weil `wallets_foreign` die Zahl ist, an der kanal und seite ihren Ertrag messen, und jede eigene Wallet darin einen
Kunden vortäuscht, den es nicht gibt.

## Voraussetzungen
- betrieb Goal 04 DONE

## Kontext für den Maker
- Ziel: Die Zahl fremder Automatons, an der der Loop zahlende Kunden misst, enthält keine Wallet, die wir selbst angelegt haben.
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 01; übernimmt `goals/_vorschlaege/betrieb-kritik-2026-11-13-1.md`. Das Glied
  kanal 05 in `ROADMAP.md`, das ebenfalls `ops/own-ips.txt` nennt, ändert dieses Goal nicht.
- Fundstelle: `ops/claim-keyless.sh` Zeile 71. Die Prüfung `[[ " $own_ips " == *" $ip "* ]]` bleibt, nur die Quelle wechselt:
  `source ops/own-ips.sh` (das Skript steht nach `cd "$(dirname "$0")/.."` im Repo-Wurzelordner, also greift der Standardpfad von
  `CP_OWN_IPS_FILE` neben `ops/own-ips.sh`) und `own_ips=$(CP_HOST="root@$VM" CP_SSH_KEY="$KEY" own_ips)`, damit `own_ips` denselben
  Rechner fragt wie die Abfrage der Wallets. Meldet `own_ips` einen Fehler (Exit ungleich 0, etwa weil `ops/own-ips.txt` fehlt), endet
  das Skript mit Exit 2 und einer Zeile auf stderr, die `own_ips` nennt, bevor es eine Wallet beurteilt: Eine fehlende Liste darf nie
  wie eine leere gelesen werden (Kopfkommentar von `ops/own-ips.sh`). Den Kommentar in Zeile 26 passt der Maker an, damit er
  `own_ips` statt der Datei nennt. `ops/own-ips.sh` bleibt unverändert.
- Test `test/claim-keyless-own-ips.test.ts`, ohne Netz, ohne festen Port, nur Dokumentationsadressen (`192.0.2.0/24`,
  `198.51.100.0/24`, `203.0.113.0/24`), Muster wie `test/own-ips-write.test.ts`. Je Fall ein `mktemp`-Ordner `<tmp>` mit Kopien von
  `ops/claim-keyless.sh`, `ops/own-ips.sh`, `ops/access-log.sh`, `ops/db-report.cjs` und `src/bounties/ours.ts` an denselben
  relativen Pfaden und einer Kopie von `ops/own-ips.txt` ohne Zeilen, die mit `192.0.2.77 `, `203.0.113.9 ` oder `198.51.100.23 `
  beginnen; Aufruf `bash <tmp>/ops/claim-keyless.sh` ohne `--write`, `HOME` auf `<tmp>`, `CP_OWN_IPS_SEEN` auf `<tmp>/seen.txt`,
  `PATH` mit einem nachgebauten `ssh` vorn. Das `ssh` antwortet nach dem letzten Argument: mit `SSH_CLIENT` darin
  `192.0.2.77 40000 22`; mit `docker exec deploy-caddy-1` darin das gzip eines gepflanzten Zugriffslogs (je Wallet eine Zeile
  `{"ts": <Sekunde der Anlage>, "request": {"client_ip": "<adresse>", "method": "POST", "uri": "/v1/auth/keyless"}, "status": 201}`);
  mit `better-sqlite3` darin gepflanzte Zeilen `key:<hex> 2026-11-01T12:00:00 0 0 0`; sonst Exit 255. Fälle:
  - Wallet angelegt von `203.0.113.9`, das nur in `<tmp>/seen.txt` steht (`203.0.113.9 2026-11-01`): Ausgabe enthält eine Zeile, die
    mit `  OURS ` beginnt und `minted from 203.0.113.9` nennt, und `1 handle(s) would be written. Run with --write.`;
  - Wallet angelegt von `192.0.2.77`, der Adresse, die das nachgebaute `ssh` live meldet und die in keiner Liste steht: Zeile `OURS`
    wie oben mit `minted from 192.0.2.77`;
  - Wallet angelegt von `198.51.100.23`, in keiner Liste: Zeile `  STRANGER` mit dieser Adresse und `nothing to claim`;
  - `it("stops with exit 2 when the list of own addresses is missing")`: `<tmp>/ops/own-ips.txt` fehlt, Exit 2, keine Zeile `OURS`
    oder `STRANGER`, stderr nennt `own_ips`;
  - in jedem Fall sind die Kopien von `ours.ts`, `db-report.cjs` und `own-ips.txt` danach byte-gleich (sha256).
  Rot vor dem Fix sind der erste, der zweite und der vierte Fall (heute `STRANGER` und Exit 0); die Zeile im Progress Log nennt das
  mit Zahl.
- Kein Test und kein Prüfbefehl ruft `ops/claim-keyless.sh` im echten Checkout auf, schon gar nicht mit `--write`, und keiner schreibt
  in das echte Zustandsverzeichnis (`~/.local/state/control-plane/`). Produktion bleibt unberührt: kein Lauf gegen den Server.
- Andere Werkzeuge, die `ops/own-ips.txt` direkt lesen (`ops/timeout-quote.sh`, `ops/github-yield.sh`, `ops/landing-yield.sh`,
  `ops/anzeigen-rechnung.py`), gehören nicht zu diesem Goal; fällt dem Maker dabei etwas auf, wird es ein Vorschlag.
- Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout; neue Dateien vor `check` mit `git add` stagen. Kein `pkill -f`.

## Done Condition
- [x] `ops/claim-keyless.sh` nimmt die eigenen Adressen aus `own_ips` statt aus `ops/own-ips.txt` und zählt eine Adresse, die nur
      in der Datei aus `CP_OWN_IPS_SEEN` steht, und die live gesehene Adresse als eigene.
      Prüfung: `pnpm -s vitest run test/claim-keyless-own-ips.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE '^[^#]*(source|\.) .*own-ips\.sh' ops/claim-keyless.sh` muss mindestens 1 ausgeben.
      Prüfung: `{ grep -v '^[[:space:]]*#' ops/claim-keyless.sh | grep -c 'own-ips\.txt'; } || true` muss 0 ausgeben.
      Prüfung: `grep -c "CP_OWN_IPS_SEEN" test/claim-keyless-own-ips.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "203\.0\.113\.9[^0-9]" test/claim-keyless-own-ips.test.ts` muss mindestens 1 ausgeben.
- [x] Fehlt die Liste der eigenen Adressen, endet `ops/claim-keyless.sh` mit Exit 2, bevor es eine Wallet beurteilt.
      Prüfung: `grep -c "stops with exit 2 when the list of own addresses is missing" test/claim-keyless-own-ips.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/claim-keyless-own-ips.test.ts -t "stops with exit 2"` muss Exit-Code 0 haben.
- [x] `check` ist grün und lässt Liste, Adresslisten und Zustandsverzeichnis unberührt.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt src/bounties/ours.ts ops/db-report.cjs | wc -l` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die neue Testdatei war vor dem Fix rot; die Zeile im Progress Log nennt, welche Fälle und womit.
- [ ] `ops/own-ips.txt`, `ops/own-ips.sh`, `src/bounties/ours.ts` und `ops/db-report.cjs` ändern sich im Goal-PR nicht.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`,
  `src/**`, `harness/**`, `deploy/**`, `ops/own-ips.txt`, `ops/own-ips.sh`, `ops/access-log.sh`, `ops/db-report.cjs`,
  `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- jede andere Datei unter `ops/` außer `ops/claim-keyless.sh`
- Crontab, `/opt/control-plane/.env` und jede Datei auf dem Server; Produktion weder lesend noch schreibend, kein Rollout und kein
  Neustart von Hand
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Zyklus 1: Punkte 1, 2, 3 gebaut: `ops/claim-keyless.sh` sourct `ops/own-ips.sh`, nimmt `own_ips` mit `CP_HOST` und `CP_SSH_KEY` der Wallet-Abfrage und endet mit Exit 2 vor der ersten Wallet, wenn `own_ips` scheitert; neuer Test `test/claim-keyless-own-ips.test.ts` vor dem Fix 3 failed, 1 passed (Adresse nur in `CP_OWN_IPS_SEEN` und live gesehene Adresse als `STRANGER` statt `OURS`, fehlende Liste Exit 0 statt 2; der Fall STRANGER war grün). Prüfbefehle: P1 vitest Exit 0 (4 passed), source-Zeile 1, `own-ips.txt` außerhalb von Kommentaren 0, `CP_OWN_IPS_SEEN` 4, `203.0.113.9` 1; P2 Testname 1, vitest `-t "stops with exit 2"` Exit 0 (1 passed, 3 skipped); P3 `check` Exit 0 (1722 passed), `git status` der drei Dateien 0, Dateien im `XDG_STATE_HOME` 0 (Gegenprobe mit gepflanzter Datei 1). Ein erster `check` war rot an `test/sandbox-api.test.ts` (Timeout 200 ms bei Last 2,8 je Kern), einzeln zweimal 21 passed, danach drei `check` grün.
- 2026-11-14 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3; `dev` ohne neue Commits seit der Merge-Basis, kein Merge nötig. Prüfbefehle: P1 vitest Exit 0 (4 passed), source-Zeile 1, `own-ips.txt` außerhalb von Kommentaren 0, `CP_OWN_IPS_SEEN` 4, `203.0.113.9` 1; P2 Testname 1, vitest `-t "stops with exit 2"` Exit 0 (1 passed, 3 skipped); P3 `check` Exit 0 (148 Dateien, 1722 passed, 294 s bei Last 11,6 je Kern), `git status` der drei Dateien 0, Dateien im `XDG_STATE_HOME` 0 (Gegenprobe mit gepflanzter Datei 1); Jobs `check` und `e2e` an PR #119 am Kopf 8cd005b grün.

## Blockers
- keine
