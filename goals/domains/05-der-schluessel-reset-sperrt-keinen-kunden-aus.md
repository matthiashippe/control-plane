# Domains Goal 05: Der Schlüssel-Reset sperrt keinen Kunden aus

## Status
ACTIVE

## Active Objective
`ops/sandbox/setup.sh --client-key-reset <address>` verweigert mit `SETUP CLIENT-KEY-RESET FAIL: foreign sandbox running`, ohne
`cp.pub` zu verschieben, wenn `sandboxd` eine laufende Sandbox eines Kontos außerhalb von `src/bounties/ours.ts` kennt, und legt
bei jedem Reset auf dem Sandbox-Server einen Timer an (`--restore-after <s>`, Standard 120, `systemd-run --on-active=<s>`), der
`cp.pub.prev` zurück nach `cp.pub` legt, wenn `cp.pub` dann noch fehlt. Selbsttest auf dem nachgebauten Sandbox-Server mit beiden
Fällen, rot vor dem Fix; geändert werden nur `ops/sandbox/setup.sh` und `ops/README.md`, der Dienst bleibt, wie er ist
(`ROADMAP.md`, domains 05; übernimmt `goals/_vorschlaege/domains-kritik-2026-11-14-1.md`).
MVP: Funktion, weil der Schalter aus domains 04 jedem zahlenden Kunden die Anlage und jeden Aufruf seiner laufenden Sandbox nimmt,
bis jemand `--client-key` fährt; bricht ein Lauf zwischen Reset und `--client-key` ab, bleibt das so, und niemand merkt es vor der
nächsten Live-Prüfung.

## Voraussetzungen
- domains Goal 04 DONE

## Kontext für den Maker
- Ziel: Ein fremder Automaton, der bei uns eine Sandbox betreibt, verliert sie nie, weil wir den Schlüsselwechsel messen; der Reset
  läuft nur, wenn keine fremde Sandbox läuft, und heilt sich nach spätestens `--restore-after` Sekunden selbst.
- Widerlegt ist das Glied nicht: `client_key_reset` prüft vor dem Verschieben nur, ob es `cp.pub` gibt, fragt keine Sandbox ab und
  legt nichts zurück (`grep -n 'client_key_reset()' -A12 ops/sandbox/setup.sh`, `grep -c 'systemd-run' ops/sandbox/setup.sh` gibt
  `0`). Die Prüfung auf fremde Sandboxes stand in domains 04 nur im Kontext für den Maker und wurde von Hand gemacht.
- Was „fremd“ heißt: `sandboxd` kennt nur Konten der Form `acct-<hex>` (Feld `owner` in `/var/lib/sandboxd/state.json` auf dem
  Sandbox-Server, Status `running`). Welche Adresse dahinter steht, weiß nur der Zahlungsserver (Tabelle `sandbox_owners`, gesetzt in
  `ownerFor` in `src/sandbox/service.ts`). Eigen ist eine Adresse, die `ourAddresses` aus `src/bounties/ours.ts` als eigen erkennt
  (`OUR_ADDRESSES`, dazu Schlüssel in `api_keys` mit einem Namen aus `OUR_KEY_NAMES`). Fremd ist jede laufende Sandbox, deren Konto
  nicht auf eine eigene Adresse zeigt, auch ein Konto, das `sandbox_owners` gar nicht kennt.
- Die Listen aus `src/bounties/ours.ts` bekommen keine dritte Kopie (`test/ours.test.ts` hält schon zwei gegeneinander, und `test/`
  ist hier gesperrt): Quelle ist zur Laufzeit dieselbe Definition, entweder `src/bounties/ours.ts` des Checkouts oder das gebaute
  Modul im Container. Welchen Weg du nimmst, entscheidest du und hältst es in `goals/domains/ANNAHMEN.md` fest.
- Lesen nach `loop-constraints.md`, Produktion: `state.json` auf dem Sandbox-Server nur lesend über `ssh_host` und ein Snippet mit
  Root-Präfix `$1` wie `CP_PUB_READ`; der Zahlungsserver nur mit `docker exec deploy-cp-1 node -e …` und `readonly: true`, Zugang wie
  in `client_key` (`~/.config/control-plane/loop.env`). Ausgegeben werden nur Zahlen, nie ein Konto, eine Adresse oder `CP_HOST`.
- Fail closed: Kann `setup.sh` eine der beiden Seiten nicht lesen (Datei fehlt, kein JSON, ssh scheitert, Abfrage scheitert),
  verweigert der Reset mit einer Zeile `SETUP CLIENT-KEY-RESET FAIL: …` und verschiebt nichts. Ein Reset, den man nicht prüfen
  kann, ist ein Reset, der einen Kunden aussperren kann.
- Ein lesender Schalter `--foreign-sandboxes <address>` mit der letzten Zeile `SETUP FOREIGN-SANDBOXES OK running=<n> foreign=<m>`
  benutzt dieselbe Funktion wie der Reset. So lässt sich die Prüfung gegen den echten Sandbox-Server belegen, ohne einen Kunden
  auszusperren; einen echten Reset macht dieses Goal nicht.
- Der Timer: zuerst der Timer, dann das Verschieben; scheitert `systemd-run`, bleibt `cp.pub`, wo es ist, und der Reset meldet
  FAIL. Der Befehl des Timers ist ein Snippet mit Root-Präfix wie `CP_PUB_RESET` und legt `cp.pub.prev` nur dann nach `cp.pub`, wenn
  `cp.pub` fehlt; einen Schlüssel, den `--client-key` inzwischen geschrieben hat, überschreibt er nie. Ein fester Unit-Name, damit ein
  zweiter Reset den alten Timer ersetzt statt an einem belegten Namen zu scheitern. `--restore-after` nimmt nur ganze Sekunden von
  60 bis 3600 (Standard 120), sonst Exit 2 mit Usage-Zeile, weil ein zu kurzer Timer die Messung aus domains 04 abschneidet: Dort
  kam `--client-key` 88 s nach dem Reset.
- Die letzte Zeile eines gelungenen Resets bleibt `SETUP CLIENT-KEY-RESET OK moved=<0|1>`, weil die Fälle `moved`, `again` und
  `reinstall` des Selbsttests sie lesen; den Timer nennst du in einer Zeile davor.
- Selbsttest in `bash ops/sandbox/setup.sh --selftest`, im Muster von `selftest_client_key_reset` (Root-Präfix in `mktemp -d`, kein
  Netz, `ssh` und `curl` als Attrappen, die scheitern), dazu eine Attrappe für `systemd-run` auf `PATH`, die den Aufruf in eine Datei
  schreibt; „Timer abgelaufen“ heißt, der Selbsttest führt den aufgezeichneten Befehl gegen das Root-Präfix aus. Für die Abfrage am
  Zahlungsserver ist der beste Beleg dasselbe Snippet wie im Container gegen eine Datenbank aus `mktemp` mit `sandbox_owners` und
  `api_keys`. Zeilen `selftest client-key-reset: ok (<fall>)` oder `FAIL <fall>: <warum>`:
  - `foreign`: eine fremde Sandbox läuft (neben einer eigenen), letzte Zeile `SETUP CLIENT-KEY-RESET FAIL: foreign sandbox running`,
    Exit ungleich 0, `cp.pub` mit demselben Hash wie vorher, kein Aufruf von `systemd-run`;
  - `ours`: nur eine eigene Sandbox läuft und eine fremde ist gestoppt, `moved=1`, genau ein Aufruf von `systemd-run` mit
    `--on-active=120`;
  - `unknown`: `state.json` nicht lesbar, FAIL, `cp.pub` unverändert;
  - `no-timer`: `systemd-run` scheitert, FAIL, `cp.pub` unverändert;
  - `restore`: Timer abgelaufen ohne `--client-key`, `cp.pub` wieder da mit dem Inhalt von vorher, und `sandboxd` liest wieder genau
    `cp.pub` und den Prüfschlüssel;
  - `keep`: Timer abgelaufen, nachdem `--client-key` einen anderen Schlüssel geschrieben hat, `cp.pub` bleibt dieser Schlüssel.
- Die Fälle `moved`, `again` und `reinstall` aus domains 04, `client-key` aus domains 03 und `image-pin` bleiben, wie sie sind, und
  bleiben grün; dafür bekommen sie die Attrappen für die Abfrage (keine fremde Sandbox) und `systemd-run`.
- `ops/README.md`: eine Zeile zu `--client-key-reset` mit `--restore-after` und zu `--foreign-sandboxes`, was sie tun und wann man
  sie fährt; der Kopf von `setup.sh` nennt beide Schalter.
- Nicht Teil dieses Goals: `sandboxd`, der Dienst unter `src/`, die Live-Prüfung `ops/live.sh` und ein echter Reset in der
  Produktion.

## Done Condition
- [x] `--client-key-reset` verweigert bei einer laufenden fremden Sandbox und bei einer Seite, die es nicht lesen kann, und lässt
      `cp.pub` dann unverändert; mit nur eigenen Sandboxes verschiebt es wie bisher.
      Prüfung: `bash ops/sandbox/setup.sh --selftest | grep -cE '^selftest client-key-reset: ok \((foreign|ours|unknown)\)$'` muss `3` ausgeben.
- [x] Jeder Reset legt zuerst einen Timer an, der `cp.pub` zurücklegt, wenn es dann noch fehlt, und nie einen neueren Schlüssel
      überschreibt; ohne Timer kein Reset.
      Prüfung: `bash ops/sandbox/setup.sh --selftest | grep -cE '^selftest client-key-reset: ok \((no-timer|restore|keep)\)$'` muss `3` ausgeben.
      Prüfung: `bash ops/sandbox/setup.sh --client-key-reset 192.0.2.1 --restore-after 30; echo "exit $?"` muss als letzte Zeile `exit 2` ausgeben.
- [x] Die bisherigen Fälle bleiben grün, und der ganze Selbsttest ist grün.
      Prüfung: `bash ops/sandbox/setup.sh --selftest | grep -cE '^selftest client-key-reset: ok \((moved|again|reinstall)\)$'` muss `3` ausgeben.
      Prüfung: `bash ops/sandbox/setup.sh --selftest | grep -cE '^selftest image-pin: ok \((desired|fresh|rebuild|again)\)$'` muss `4` ausgeben.
      Prüfung: `bash ops/sandbox/setup.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `SETUP SELFTEST OK` ausgeben.
- [x] Die Prüfung auf fremde Sandboxes liest den echten Sandbox-Server und den Zahlungsserver, ohne etwas zu ändern, und der Server
      ist danach unverändert.
      Prüfung (Netz): `bash ops/sandbox/setup.sh --foreign-sandboxes 72.62.51.224 | tail -n 1 | grep -cE '^SETUP FOREIGN-SANDBOXES OK running=[0-9]+ foreign=[0-9]+$'` muss `1` ausgeben.
      Prüfung (Netz): `bash ops/sandbox/setup.sh --client-key 72.62.51.224 | tail -n 1` muss `SETUP CLIENT-KEY OK changed=0` ausgeben.
      Prüfung (Netz): `bash ops/sandbox/setup.sh --check 72.62.51.224 | tail -n 1` muss `SETUP CHECK OK changed=0` ausgeben.
- [x] `ops/README.md` nennt beide Schalter.
      Prüfung: `grep -q -- '--restore-after' ops/README.md && grep -q -- '--foreign-sandboxes' ops/README.md && echo yes` muss `yes` ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die neuen Fälle des Selbsttests waren vor dem Fix rot (`foreign` meldete `moved=1`); die Zeile im Progress Log nennt, womit.
- [ ] Gepflanzte Gegenproben sind rot und im Progress Log genannt: ein Reset ohne Abfrage, ein Reset, der bei unlesbarem
      `state.json` verschiebt, ein Timer nach dem Verschieben, ein Timer, der `cp.pub` überschreibt.
- [ ] `goals/domains/ANNAHMEN.md` begründet die Quelle der eigenen Adressen, den Unit-Namen und die Grenzen von `--restore-after`.
- [ ] Keine Ausgabe nennt ein Konto, eine Adresse eines Kunden oder `CP_HOST`.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `test/**`, `harness/**`, `ops/sandbox/**` außer `ops/sandbox/setup.sh`, `ops/live.sh`, `ops/conway-series.sh`,
  `ops/conway-money-series.sh`, `.env*`, `~/.config/control-plane/**` (nur lesen)
- kein `--client-key-reset` gegen den echten Sandbox-Server in diesem Goal
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut: `--client-key-reset` fragt zuerst über `foreign_sandboxes` `state.json` von `sandboxd` (laufende Sandboxes) und am Zahlungsserver `ourAddresses` aus `/app/dist/bounties/ours.js` mit `readonly: true` ab, verweigert bei fremder Sandbox oder unlesbarer Seite und setzt danach den Timer `cp-pub-restore` (`systemd-run --on-active=<s>`, `--restore-after` 60 bis 3600, Standard 120), erst dann wird verschoben; neuer lesender Schalter `--foreign-sandboxes`, `ops/README.md` und Kopf von `setup.sh` nennen beide, Annahmen in `goals/domains/ANNAHMEN.md`. Rot vor dem Fix: neue Fälle gegen den alten `client_key_reset`, `foreign` FAIL mit `SETUP CLIENT-KEY-RESET OK moved=1`, dazu FAIL unknown, no-timer, ours, restore, keep. Gepflanzt und rot: Reset ohne Abfrage (FAIL foreign, unknown, no-timer, ours), Reset, der bei unlesbarem `state.json` verschiebt (FAIL unknown, no-timer, ours), Timer nach dem Verschieben (FAIL no-timer, ours: `timer set after the move`), Timer, der `cp.pub` überschreibt (FAIL keep). Gegenprobe der Abfrage am Zahlungsserver: leer `0`, gepflanztes unbekanntes Konto `1`, Konto der Live-Prüfung `0`, beide `1`. Prüfbefehle: P1 `3`; P2 `3`, `exit 2`; P3 `3`, `4`, Exit 0 mit `SETUP SELFTEST OK`; P4 (Netz) `1` (`SETUP FOREIGN-SANDBOXES OK running=0 foreign=0`), `SETUP CLIENT-KEY OK changed=0`, `SETUP CHECK OK changed=0`; P5 `yes`; P6 `node scripts/check.mjs` Exit 0.
- 2026-11-14 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6; `dev` ohne neue Commits gegenüber dem Goal-Branch, nichts zu mergen. Prüfbefehle: P1 `3`; P2 `3`, `exit 2`; P3 `3`, `4`, Exit 0 mit `SETUP SELFTEST OK`; P4 (Netz) `1` (`SETUP FOREIGN-SANDBOXES OK running=0 foreign=0`), `SETUP CLIENT-KEY OK changed=0`, `SETUP CHECK OK changed=0`; P5 `yes`; P6 `node scripts/check.mjs` Exit 0 (1723 Tests grün).

## Blockers
