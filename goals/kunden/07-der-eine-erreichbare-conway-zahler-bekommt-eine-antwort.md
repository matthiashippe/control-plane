# Kunden Goal 07: Der eine erreichbare Conway-Zahler bekommt eine Antwort

## Status
ACTIVE

## Active Objective
Von 16 Wallets, die in den 30 Tagen bis 18.11.2026 bei Conway aufgeladen haben, zahlt keine bei uns, und nur ein Betreiber ist
öffentlich erreichbar, über sein offenes Issue in `Conway-Research/automaton` (`docs/kunden/conway-zahler.md`, Zeilen 4, 51 und 66).
Die Leitzahl „Conway-Zahler, die bei uns zahlen“ entsteht nur, wenn jemand `bash ops/conway-payers.sh` von Hand startet. Nach diesem
Goal hat dieser Betreiber in seinem Issue eine Antwort, die ihm zeigt, wie seine Runtime mit einer geänderten Zeile `conwayApiUrl`
bei uns ohne weitere Änderung weiterläuft und was eine Aufladung kostet, gepostet Wort für Wort nach Matthias' „ok“ am Human Gate
`public_post`; und `ops/status.sh` zeigt die Zählungen der Zeile `OVERLAP topped up` in jedem Lauf, damit Triage und Kurs-Check
sehen, ob er oder ein anderer Conway-Zahler wechselt.
Leitzahl: Conway-Zahler mit Aufladung in 30 Tagen, die auch bei uns zahlen (0 von 16 am 19.11.2026).
Widerlegt, wenn das Issue bis zum Gate geschlossen ist oder der Betreiber dort schon eine Antwort von uns hat; dann entfällt die
Antwort, und das Goal liefert nur die Zählung in `ops/status.sh`.
MVP: Funktion, weil ein zahlender Conway-Kunde, der wechselt, die Leitzahl von 0 auf 1 hebt, und ohne laufende Zählung niemand merkt,
ob es geschieht.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel: Der einzige erreichbare Betreiber, der heute bei Conway zahlt, liest in seinem Issue, wie er mit einer Zeile zu uns wechselt,
  und der Loop sieht in jedem Takt, ob ein Conway-Zahler bei uns zahlt.
- Quelle der Kette: `ROADMAP.md`, Topic `kunden`, Glied 07; Loop-Triage 20.11.2026 (PRO-25822, PRO-25825). Übernimmt
  `goals/_vorschlaege/kunden-weg-2026-11-19-1.md` und `goals/_vorschlaege/kunden-kritik-2026-11-19-3.md`.
- Welches Issue es ist, steht nicht im Repo, auch nicht im Progress Log (`goals/kunden/ANNAHMEN.md`, kunden 02): Du findest es lokal,
  indem du die Liste aus `CP_PAYERS_LIST=<temp> bash ops/conway-payers.sh` mit `python3 ops/conway-reach.py --way issues` gegen die
  Issue-Suche hältst; die Liste bleibt im Temp-Ordner (Modus 0600) und wird danach gelöscht. Der Entwurf liegt unter
  `goals/kunden/antworten-07/<nummer>.md` im Format von `goals/kanal/antworten-03/` (Kopfzeile als HTML-Kommentar, dann der Text), weil
  `ops/post-the-answers.py` nur diesen Ordner liest. Die Nummer eines öffentlichen Issues darf dort stehen; nie eine Adresse, eine
  Wallet, ein Betrag, den er bei Conway zahlte, und kein Satz, der sagt, dass er bei Conway zahlt.
- Der Text, Englisch, kurz und verkäuferisch, Nutzen vorn, nur echte Zahlen: bezieht
  sich auf das, was in seinem Issue steht; nennt die eine Zeile `"conwayApiUrl": "<URL>"` mit der Adresse, die unsere Seite `/conway`
  heute dafür nennt; was bei uns ohne Änderung läuft (SIWE, Guthaben über x402 auf Base, Inferenz), die Startgutschrift und die Stufen
  der Aufladung (`TOPUP_TIERS_USD`); nichts, was wir nicht liefern (Sandboxes und Domains nur, wenn `ops/live.sh` sie heute grün meldet).
  `python3 ops/before-the-answers.py --folder goals/kunden/antworten-07` muss vor dem Gate grün sein.
- Human Gate `public_post` wie in kanal 03: `## Status` auf `BLOCKED matthias`, unter `## Blockers` die Zeilen `Art: matthias`,
  `Gate: public_post`, `Aufgabe:`, `Worum:`, `Empfehlung:`, darunter der Link des Issues und der volle Text des Entwurfs, dazu `sha12`
  und die Sendezeile aus dem Trockenlauf `python3 ops/post-the-answers.py --folder goals/kunden/antworten-07`. Steht zu dieser Zeit
  ein anderes Goal am Gate `public_post` (kanal 06 und 07 bereiten die nächste Runde vor), nennt die Zeile `Empfehlung:` beide
  Entwürfe, damit Matthias eine Freigabe für alle Antworten gibt; dieses Goal wartet dafür nicht auf kanal, weil ein Text mit der
  Prüfung des Werts aus kanal 04 sicher genug ist und der Betreiber sonst bis frühestens 26.11. wartet. Erst wenn am Topic „Matthias hat
  den Kommentar auf seinem privaten Board mit „ok“ freigegeben“ steht, postest du genau diesen Text mit
  `python3 ops/post-the-answers.py --folder goals/kunden/antworten-07 --send 1 --only <nummer> --approved <nummer>:<sha12>` und
  schreibst den Link ins Progress Log. Nach dem Commit mit `BLOCKED matthias` ändert sich der Entwurf nicht mehr.
- Zählung in `ops/status.sh`: ein Feld `conway_overlap` im JSON mit `wallets`, `known`, `inference`, `paid` und `paid_conway_after`
  aus der Zeile `OVERLAP topped up` von `ops/conway-payers.sh` (dieselbe Quelle, nur lesend), dazu `window` aus der Zeile `PAYERS`;
  ist die Quelle nicht lesbar, `{"status": "unknown", "reason": "<kurz>"}` statt der Zahlen. Nie eine Adresse oder ein Hash.
  `CP_CONWAY_PAYERS_CMD` ersetzt im Test den Aufruf. Test `test/status-conway-overlap.test.ts` mit nachgebautem Befehl ohne Netz:
  Zählungen kommen als Zahlen an (Testname enthält `counts`), eine nicht lesbare Quelle ergibt `unknown` (`unknown`), eine Ausgabe mit
  einer Adresse oder einem Hash darin bricht ab, statt sie weiterzugeben (`no address`); rot vor dem Fix.
  `.claude/skills/ops-triage/SKILL.md` steht nicht in `merge_allowlist`, deshalb ändert dieses Goal den Skill nicht; die Triage liest
  das neue Feld aus dem JSON wie jedes andere.
- `goals/kunden/ANNAHMEN.md`: Zeilen `- <Datum>, kunden 07: …`, mindestens zur Wahl der URL und dazu, warum das Goal nicht auf kanal 06
  und 07 wartet.
- Zugang: `set -a; . ~/.config/control-plane/loop.env; set +a`, Werte nie ausgeben. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout. Kein Build, kein Test auf dem Server.

## Done Condition
- [x] `ops/status.sh` zeigt die Zählungen der Zeile `OVERLAP topped up` als Feld `conway_overlap`, ohne Adresse und ohne Hash; in
      beide Richtungen bewiesen.
      Prüfung: `pnpm -s vitest run test/status-conway-overlap.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/status-conway-overlap.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/counts/,/unknown/,/no address/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `pnpm -s vitest run test/status-alarm-path.test.ts test/status-alarm-received.test.ts test/conway-payers.test.ts` muss Exit-Code 0 haben.
      Prüfung: `bash ops/conway-payers.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
- [x] Die Antwort entfällt nach der Widerlegung: Das eine erreichbare Issue trägt schon eine Antwort von uns aus einer Runde vor dem
      20.11.2026, und es liegt kein Entwurf bereit (Kritik Tech Lead 2026-11-20, `ANNAHMEN.md`).
      Prüfung: `ls goals/kunden/antworten-07 2>/dev/null | wc -l` muss 0 ausgeben.
      Prüfung: `grep -cE "^- 2026-11-20, kunden 07: Die Widerlegung der Goal-Datei greift" goals/kunden/ANNAHMEN.md` muss 1 ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; D=$(mktemp -d); CP_PAYERS_LIST=$D/p bash ops/conway-payers.sh >/dev/null 2>&1; while read -r a; do gh api -X GET search/issues -f "q=$a repo:Conway-Research/automaton" --jq '.items[].number'; sleep 2; done < $D/p | sort -u > $D/n; grep -E "^[0-9]{4}-" ops/posted-answers.log | awk '$1 < "2026-11-20T00:00:00Z" {print $2}' | sort -u > $D/a; echo "unanswered $(comm -23 $D/n $D/a | wc -l) of $(wc -l < $D/n)"; rm -rf $D` muss `unanswered 0 of 1` ausgeben.
- [x] Ohne freigegebenen Text ist nichts gepostet: Der Goal-Branch fügt `ops/posted-answers.log` keinen Eintrag hinzu.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- ops/posted-answers.log | grep -c "^+[0-9]"` muss 0 ausgeben.
- [x] Die Annahmen stehen fest, und nichts im Repo verbindet das Issue mit einer Wallet.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 07: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
      Prüfung: `cat goals/kunden/ANNAHMEN.md goals/kunden/07-der-eine-erreichbare-conway-zahler-bekommt-eine-antwort.md | grep -cE "0x[0-9a-fA-F]{40}|[0-9a-f]{64}"` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor der Änderung rot; die Zeile im Progress Log nennt, womit.
- [ ] Die übrigen Felder von `ops/status.sh` bleiben Name für Name und Typ für Typ wie auf `origin/dev`.
- [ ] Nichts wird gepostet ohne den Kommentar der Freigabe am Topic; gepostet wird nur über `ops/post-the-answers.py`.
- [ ] Code, Kommentare, Testnamen und der Entwurf Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `.claude/**`, `scripts/check.mjs`,
  `deploy/**`, `harness/**`, `src/**`, `.env*`, `*.db`
- `ops/conway-payers.sh`, `ops/conway-reach.py`, `ops/post-the-answers.py`, `ops/before-the-answers.py` und ihre Fixtures: unverändert
- `goals/kanal/**`, `docs/kunden/conway-zahler.md`, `ROADMAP.md`, `docs/kette.md` und alle bestehenden Vorschläge: nur lesen
- jeder Kommentar in einem fremden Repo ohne die Freigabe am Topic, jede Mail an Dritte, jedes Schreiben in der Produktion
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-20 Zyklus 1: Punkte 1, 4, 5 gebaut: Feld `conway_overlap` in `ops/status.sh` aus den Zeilen `OVERLAP topped up` und `PAYERS` von `ops/conway-payers.sh`, `unknown` mit Grund bei nicht lesbarer Quelle, Abbruch bei Adresse oder Hash; `test/status-conway-overlap.test.ts` rot gegen `ops/status.sh` von `origin/dev` (7 von 7), als Mutation ohne die Prüfung auf Adresse oder Hash rot (1 von 7); gegen die Produktion 16 Wallets, 0 bekannt, 0 zahlend. Punkte 2 und 3 offen, weil die Widerlegung der Goal-Datei greift: Das eine erreichbare Issue trägt schon eine Antwort von uns (`ANNAHMEN.md`), also kein Entwurf und kein Gate. Prüfbefehle: P1 vitest Exit 0, `alle`, vitest Exit 0 (33 Tests), `SELFTEST OK`; P2 0 statt 1, kein Treffer statt mindestens 1, Prüfungen 3 bis 6 ohne Entwurf nicht gelaufen; P3 0 statt 1, `--verify-posted` nicht gelaufen; P4 4, 0; P5 `check` Exit 0 (237 Dateien, 2499 Tests).
- 2026-11-20 Zyklus 2: Abschluss gemeldet, Punkte 1, 4, 5; Punkte 2 und 3 bleiben offen, weil die Widerlegung der Goal-Datei greift (`ANNAHMEN.md`, kunden 07), über den Vertrag entscheidet der Tech Lead in der Kritik. Prüfbefehle: P1 vitest Exit 0, `alle`, vitest Exit 0 (33 Tests), `SELFTEST OK`; P2 0 statt 1, kein Treffer statt mindestens 1, Prüfung 5 gibt nichts aus, Prüfungen 3, 4 und 6 ohne Entwurf nicht gelaufen; P3 0 statt 1, `--verify-posted` nicht gelaufen; P4 4, 0; P5 `check` Exit 0 (2499 Tests, 242 s); `dev` ohne neue Commits, Merge ohne Änderung.
- 2026-11-20 Zyklus 3: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5; die Punkte 2 und 3 in der Fassung der Kritik belegt, ohne Codeänderung. Prüfbefehle: P1 vitest Exit 0, vitest Exit 0, `SELFTEST OK`; P2 0, 1, Netz `unanswered 0 of 1` (Gegenprobe mit leerer Antwortliste `unanswered 1 of 1`, 16 Wallets); P3 0 (Gegenprobe mit gepflanzter Zeile im Log 1); P4 5, 0; P5 `check` Exit 0 (2499 Tests, 195 s).

## Blockers
