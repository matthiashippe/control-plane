# Kunden Goal 15: Der Mensch hinter einer Runtime ohne Guthaben sieht den Weg per Karte

## Status
IN_PROGRESS

## Active Objective
Die gepflegte Runtime aus paket 01 brachte vom 22. bis 26.11.2026 zwei fremde Anmeldungen mit der Kennung `automaton-maintained`.
Eine davon läuft seit dem 23.11. ohne Guthaben weiter und bekam bis 26.11., 14:41 UTC 4395 Mal 402 auf `/v1/chat/completions`,
deren `message` den Kartenlink nennt; in derselben Woche kam kein einziger Mensch auf `/card/<paket>`, nur 3 Abrufe eines Bots
(Richtungs-Check 26.11.2026, `docs/richtung/2026-11-26.md`). Die Runtime zeigt ihrem Menschen diese Antwort nur als JSON mitten in
der Zeile `[ERROR] Turn failed:`. Nach diesem Goal schreibt die Runtime aus dem Fork `matthiashippe/automaton` ihrem Menschen beim
Start, bei leerem Guthaben und in `automaton --status` eine eigene Zeile „No crypto needed: pay by card, PayPal or Apple Pay at
<Link>“ mit dem Kartenlink ihrer eigenen Wallet, als neues Release des Forks, und `docs/paket/anleitung.md` nennt es in der Zeile
`Release:`. Vorher zählt `ops/card-visits.sh` aus dem Caddy-Zugriffslog die Abrufe von `/card/` durch Menschen und Bots und die 402
an Runtimes des Pakets je Version, in beide Richtungen bewiesen, und `docs/kunden/kartenweg-2026-11.md` hält die Woche vor dem
Release als Ausgangswert fest.
Leitzahl: Abrufe von `/card/<paket>` durch Menschen je Woche und Kartenkäufe (`card_orders` live).
Widerlegt, wenn 14 Tage nach dem Release keine Runtime mit der neuen Kennung `/card` aufruft; das misst ein Folge-Glied mit
`ops/card-visits.sh`.
MVP: Funktion, weil Runtimes ankommen und denken, aber keine zahlt, und der Mensch dahinter den Weg ohne Krypto heute nicht sieht.

## Voraussetzungen
- kunden Goal 14 DONE
- paket Goal 01 DONE

## Kontext für den Maker
- Ziel in einem Satz: Der Mensch, der eine Runtime aus unserem Paket betreibt und ihr Guthaben aufgebraucht hat, liest in seinem
  Terminal einen klaren Satz mit seinem eigenen Kartenlink und kann ohne Krypto aufladen.
- Quelle: `ROADMAP.md`, Topic `kunden`, Glied 15; Richtungs-Check 26.11.2026, Idee 1 und Entscheidung (`docs/richtung/2026-11-26.md`).
  Vorgänger `goals/kunden/14-denkt-kunde-1-mit-dem-schrittguthaben-reicht-er-ein-und-zahlt-er-danach-wieder.md` (DONE). Arbeitsort
  und Merge im Fork wie `goals/paket/01-die-runtime-kommt-mit-unserer-adresse.md`.
- Entscheidung Tech Lead 26.11.2026 zur Ausnahme der ROADMAP („zählt der Server ein Feld, das die Runtime schon anzeigt, reicht die
  Antwort des Servers“): Sie greift nicht. Am Kopf `6baa2d6` von `main` im Fork zeigt die Runtime kein Feld des Servers als eigene
  Zeile. Die 402 der Inferenz wird in `src/conway/inference.ts:227` zu `Inference error (<backend>): 402: <body>` und landet in
  `src/agent/loop.ts:901` als `[ERROR] Turn failed: …`; `message` und `message_for_operator` stehen dort schon heute, und 4395 solche
  Zeilen brachten keinen Menschen zur Kasse. `showStatus()` in `src/index.ts:159` fragt den Server gar nicht. Deshalb geht der Weg
  über den Fork, und `src/**` dieses Repos bleibt unverändert.
- Erst messen (Topic `kunden`: jedes Glied misst zuerst nur lesend), dann der Fork. `ops/card-visits.sh` nach dem Vorbild von
  `ops/github-yield.sh` und `test/github-yield.test.ts`, Bestand nur genutzt: `ops/access-log.sh` (ganzes Log samt gedrehter Dateien)
  und `ops/conway_arrivals.py` (`read_log` liefert je Zeile `ts ip method path status referer agent`, `own_addresses` aus `own_ips`).
  Aufrufe: `ops/card-visits.sh --since <ISO UTC> --until <ISO UTC>` (Produktion über `ops/access-log.sh` mit `CP_HOST` und
  `CP_SSH_KEY`), `ops/card-visits.sh --log <datei> --since … --until …`, `ops/card-visits.sh --selftest` (ohne Netz). Gezählt werden
  Anfragen im Fenster `since <= ts < until`. Ausgabe genau in dieser Reihenfolge:
  `CARD VISITS since <t> until <u>: <h> by people, <b> by bots, <o> from own addresses`, dabei zählt jede Anfrage mit Methode `GET`
  oder `HEAD` auf einen Pfad, der mit `/card/` beginnt (mit oder ohne Query), `<o>` von eigenen Adressen, von den fremden `<b>` mit
  einem User-Agent, der `bot`, `crawl`, `spider` oder `fetch` enthält (gleich welche Schreibung) oder leer ist, und `<h>` alle anderen;
  `MAINTAINED 402 since <t> until <u>: <n> answers 402 on /v1/chat/completions to automaton-maintained runtimes`, gezählt `POST` auf
  `/v1/chat/completions` mit Status 402 von fremden Adressen, deren User-Agent mit `automaton-maintained/` beginnt;
  danach je Version eine Zeile `MAINTAINED 402 VERSION automaton-maintained/<version>: <n>`, nach Version sortiert, keine, wenn `<n>`
  0 ist. Nie eine Adresse, eine Wallet oder eine Query in der Ausgabe (der Kartenlink trägt `?address=<wallet>`). Der Selbsttest
  pflanzt je Fall eine Zeile und belegt mit Zeilen `ok …`: Mensch gezählt, Bot nicht als Mensch, leerer User-Agent nicht als Mensch,
  eigene Adresse nicht als fremd, `/cards` und `/card.json` nicht gezählt, eine Zeile vor `--since` und eine ab `--until` nicht
  gezählt, 402 einer anderen Runtime (User-Agent `node`) nicht im Paket, zwei Versionen getrennt; letzte Zeile `SELFTEST OK …` oder
  `SELFTEST FAILED …`. Exit 2, wenn das Log nicht lesbar ist oder die Liste eigener Adressen leer, wie bei `ops/github-yield.sh`.
- Ausgangswert, nur lesend: `set -a; . ~/.config/control-plane/loop.env; set +a`, dann
  `bash ops/card-visits.sh --since 2026-11-19T14:30:00Z --until 2026-11-26T14:30:00Z` (die Woche des Richtungs-Checks) und
  `bash ops/card-orders.sh`. `docs/kunden/kartenweg-2026-11.md`, Deutsch, je eine Zeile ab Spalte 0 außerhalb der Codeblöcke:
  `Gemessen: <JJJJ-MM-TTTHH:MM:SSZ>`;
  die Zeile `$ bash ops/card-visits.sh --since 2026-11-19T14:30:00Z --until 2026-11-26T14:30:00Z`, darunter ein Codeblock mit der
  vollständigen Ausgabe, ungekürzt;
  ein zweiter Codeblock mit genau der ersten Zeile von `bash ops/card-orders.sh` (`card_orders live <k> …`);
  `Vorher: <h> Abrufe von /card durch Menschen, <b> durch Bots, <n> Antworten 402 an Runtimes des Pakets, <k> Kartenkäufe live`;
  `Release: <tag>` mit demselben Tag wie in `docs/paket/anleitung.md`, damit das Folge-Glied das Fenster ab dem Release misst.
  Weichen die Zahlen vom Richtungs-Check ab (0 Menschen, 3 Bot-Abrufe), steht ein Satz dazu im Dokument, warum.
- Die Zeile im Fork, genau dieser Satz, Englisch: `No crypto needed: pay by card, PayPal or Apple Pay at <Link>`. Sie steht allein
  in einer Zeile des Logs, das der Mensch im Terminal sieht (`log(config, …)` und der Logger mit `prettySink` aus `src/index.ts`),
  nicht in einem JSON und nicht im Prompt des Modells. Der Link ist `details.card_url` der 402, wenn die Antwort ihn trägt; sonst
  `https://automatonhost.com/card/5?address=<eigene Wallet klein geschrieben>`, dieselbe Form, die der Dienst baut
  (`cardLink` in `src/payments/card-way.ts`). Die Zeile kommt nur, wenn `conwayApiUrl` auf `https://automatonhost.com` steht, nie
  mit einem anderen Control Plane und nie ohne Control Plane. Sie kommt:
  beim Start, sobald das erste gelesene Guthaben in der Stufe `critical` oder `dead` liegt (`getSurvivalTier`, höchstens 10 Cent);
  beim Eintritt in die Stufe `critical` oder `dead` (`src/agent/loop.ts:475`);
  bei einer 402 mit `INSUFFICIENT_CREDITS` auf die Inferenz, höchstens einmal je Stunde je Prozess, damit sie zwischen tausend
  Fehlerzeilen nicht selbst zu einer wird; trägt die 402 kein `card_url` (der Kartenschalter des Dienstes ist aus), keine Zeile;
  in `automaton --status` (`showStatus()`, `src/index.ts:159`) unter dem Block, wenn der gespeicherte Zustand `critical` oder `dead`
  ist.
  Die 402 und ihre Fehlerzeile bleiben, wie sie sind; die neue Zeile kommt dazu. Kein neues Werkzeug für das Modell, keine Änderung
  am Prompt, keine Abfrage beim Server nur für diese Zeile.
- Test im Fork: eine neue Datei `src/__tests__/card-line.test.ts` mit `describe("card line", …)` und mindestens sechs Fällen, jeder
  rot vor der Änderung: Start mit leerem Guthaben nennt den Link der eigenen Wallet klein geschrieben; 402 mit `card_url` nennt genau
  diesen Link; 402 ohne `card_url` schreibt keine Zeile; mit `conwayApiUrl` `https://api.conway.tech` kommt nirgends eine Zeile; eine
  zweite 402 innerhalb einer Stunde schreibt keine zweite Zeile, nach einer Stunde wieder eine; `--status` im Zustand `critical`
  zeigt sie, im Zustand `running` nicht.
- Release: Version `0.2.2-maintained.2` (oder höher) in `package.json`, damit die Kennung `automaton-maintained/<version>` die neue
  Runtime vom alten Release trennt; `dist/` neu gebaut im selben Commit (`dist-in-sync.test.ts`), PR im Fork gegen `main`, nach
  grüner CI `gh pr merge --merge`, Tag `v<version>` auf den Merge, `gh release create v<version> --verify-tag` mit kurzen Notizen,
  was der Mensch jetzt sieht. Die Historie von `main` bleibt (kein Force-Push), der neue Tag liegt über `v0.2.2-maintained.1`.
- In diesem Repo: `docs/paket/anleitung.md` bekommt die neue Zeile `Release: v<version>` statt der alten, den Installationsbefehl mit
  dem neuen Tag und je neuem Commit im Fork eine Zeile mit SHA (7 Zeichen) und einem Satz in der Liste; `README.md` nennt den
  Installationsbefehl mit dem neuen Tag. paket 02 (PLANNED) zählt nach dem Präfix `automaton-maintained/` und bleibt davon unberührt.
- `goals/kunden/ANNAHMEN.md`: Zeilen `- <Datum>, kunden 15: …`, mindestens zum Weg über den Fork statt über den Server, zur Grenze
  „höchstens einmal je Stunde“ und zur Regel, wer als Mensch zählt.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), pnpm aus dem Fork (`packageManager`), `check` und vitest im
  Vordergrund mit eigenem Timeout. Ein eigener Klon des Forks außerhalb des Goal-Worktrees (etwa
  `~/work/pc-wt/control-plane/kunden-15-fork`), Branch vom aktuellen `main` des Forks. Kein Aufruf von Endpunkten der Produktion, kein
  Kauf, kein Kartenkauf zum Testen, keine Runtime mit eigenem Schlüssel gegen die Produktion (`grantOnFirstRead` gäbe ihr eine
  Startgutschrift aus dem Pool).

## Done Condition
- [x] `ops/card-visits.sh` zählt Abrufe von `/card/` durch Menschen, durch Bots und von eigenen Adressen und die 402 an Runtimes des
      Pakets je Version, ohne Adresse in der Ausgabe, in beide Richtungen bewiesen.
      MVP: Funktion, weil ohne diese Zählung nach dem Release niemand weiß, ob die neue Zeile einen Menschen zur Kasse bringt.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/card-visits.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/card-visits.sh --selftest | grep -cE "^ok "` muss mindestens 8 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/card-visits.sh --selftest | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}|address="` muss 0 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/card-visits.test.ts` muss Exit-Code 0 haben.
- [x] Die Woche vor dem Release steht gemessen in `docs/kunden/kartenweg-2026-11.md`, die Zeile `Vorher:` folgt aus den Codeblöcken.
      MVP: Funktion, weil die Leitzahl ohne Ausgangswert keinen Unterschied zeigen kann.
      Prüfung: `d=docs/kunden/kartenweg-2026-11.md; g=$(sed -nE 's/^Gemessen: ([0-9T:-]+Z)$/\1/p' "$d"); [ -n "$g" ] && [ "$g" \> "2026-11-26T14:30:00Z" ] && grep -qx '$ bash ops/card-visits.sh --since 2026-11-19T14:30:00Z --until 2026-11-26T14:30:00Z' "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `cat docs/kunden/kartenweg-2026-11.md | grep -cE "^(CARD VISITS since 2026-11-19T14:30:00Z until 2026-11-26T14:30:00Z: [0-9]+ by people, [0-9]+ by bots, [0-9]+ from own addresses|MAINTAINED 402 since 2026-11-19T14:30:00Z until 2026-11-26T14:30:00Z: [0-9]+ answers 402 on /v1/chat/completions to automaton-maintained runtimes|card_orders live [0-9]+ test [0-9]+ .*)$"` muss 3 ausgeben.
      Prüfung: `d=docs/kunden/kartenweg-2026-11.md; awk '/^CARD VISITS since /{h=$7; b=$10} /^MAINTAINED 402 since /{n=$7} /^card_orders live /{k=$3} END{printf "Vorher: %d Abrufe von /card durch Menschen, %d durch Bots, %d Antworten 402 an Runtimes des Pakets, %d Kartenkäufe live\n", h, b, n, k}' "$d" | grep -qxFf - "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; d=docs/kunden/kartenweg-2026-11.md; diff <(bash ops/card-visits.sh --since 2026-11-19T14:30:00Z --until 2026-11-26T14:30:00Z 2>/dev/null) <(awk '/^CARD VISITS since/{p=1} p&&/^[^A-Z]/{exit} p' "$d")` muss nichts ausgeben.
- [x] Die Runtime aus dem neuen Release schreibt ihrem Menschen beim Start, bei leerem Guthaben und in `--status` die Zeile mit dem
      Kartenlink ihrer eigenen Wallet, nur mit `automatonhost.com`; Tests im Fork, rot vor der Änderung.
      MVP: Funktion, weil nur eine eigene Zeile im Terminal den Menschen erreicht, der die JSON-Fehlerzeilen nicht liest.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && git -C "$d" grep -l "No crypto needed: pay by card, PayPal or Apple Pay at " -- src | grep -vc "__tests__"` muss mindestens 1 ausgeben.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && grep -c 'describe("card line"' "$d/src/__tests__/card-line.test.ts"` muss 1 ausgeben.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && grep -cE "^\s*(it|test)\(" "$d/src/__tests__/card-line.test.ts"` muss mindestens 6 ausgeben.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && cd "$d" && PATH=/usr/bin:$PATH pnpm install --frozen-lockfile >/dev/null 2>&1 && PATH=/usr/bin:$PATH pnpm -s build >/dev/null 2>&1 && PATH=/usr/bin:$PATH pnpm -s test >/dev/null 2>&1 && echo gruen` muss `gruen` ausgeben.
- [x] Das neue Release liegt über `v0.2.2-maintained.1` auf `main` des Forks, lässt sich mit einem Befehl installieren und nennt seine
      Version.
      MVP: Funktion, weil nur ein neues Release mit neuer Version die Runtimes mit der Zeile von den alten unterscheidbar macht.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); gh release view "${t:?}" -R matthiashippe/automaton --json tagName,isDraft -q 'select(.isDraft == false) | .tagName'` muss den Tag ausgeben.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); gh api "repos/matthiashippe/automaton/compare/v0.2.2-maintained.1...${t:?}" --jq .status` muss `ahead` ausgeben.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); gh api "repos/matthiashippe/automaton/compare/${t:?}...main" --jq .status` muss `identical` oder `ahead` ausgeben.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); p=$(mktemp -d); PATH=/usr/bin:$PATH npm install -g --prefix "$p" "github:matthiashippe/automaton#${t:?}" >/dev/null 2>&1 && "$p/bin/automaton" --version | grep -c "${t#v}"` muss 1 ausgeben.
- [x] `docs/paket/anleitung.md` und `README.md` nennen das neue Release, und die Liste in der Anleitung nennt jeden neuen Commit des
      Forks; `docs/kunden/kartenweg-2026-11.md` nennt dasselbe Release.
      Prüfung: `grep -cE '^Release: v0\.2\.2-maintained\.([2-9]|[1-9][0-9]+)$' docs/paket/anleitung.md` muss 1 ausgeben.
      Prüfung: `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); grep -c "github:matthiashippe/automaton#${t:?}" docs/paket/anleitung.md README.md | grep -c ':[1-9]'` muss 2 ausgeben.
      Prüfung: `[ "$(grep -oE '^Release: \S+' docs/paket/anleitung.md)" = "$(grep -oE '^Release: \S+' docs/kunden/kartenweg-2026-11.md)" ] && echo gleich || echo verschieden` muss genau `gleich` ausgeben.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); gh api "repos/matthiashippe/automaton/compare/v0.2.2-maintained.1...${t:?}" --jq '.commits[] | select(.parents | length == 1) | .sha[0:7]' | while read -r s; do grep -q "\`$s\`" docs/paket/anleitung.md || echo "$s"; done | wc -l` muss 0 ausgeben.
- [x] Nichts im Repo nennt eine Adresse oder eine Wallet, der Dienst ist unverändert, und die Annahmen stehen fest.
      Prüfung: `cat docs/kunden/kartenweg-2026-11.md docs/paket/anleitung.md goals/kunden/ANNAHMEN.md | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src ops test harness deploy | grep -cvxE "ops/card-visits.sh|ops/card_visits.py|test/card-visits.test.ts"` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 15: " goals/kunden/ANNAHMEN.md` muss mindestens 3 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Kein Aufruf in der Produktion, der etwas anlegt oder bucht; gelesen wird nur über `ops/card-visits.sh`, `ops/card-orders.sh`,
      `ops/access-log.sh` und `gh` gegen GitHub.
- [ ] Die Ausgabe in den Codeblöcken ist genau die der Werkzeuge, ungekürzt und unverändert.
- [ ] Jeder neue Test und jede neue Selbsttestzeile war vor der Änderung rot, im Fork wie hier; die Zeile im Progress Log nennt,
      womit.
- [ ] Die Historie von `main` im Fork bleibt erhalten, kein Force-Push, kein gelöschter Tag; eine bestehende Konfiguration eines
      Betreibers wird nie still umgestellt.
- [ ] Code, Kommentare, Testnamen, Commits und Release-Text Englisch, Dokument, Goal-Datei, Anleitung und `ANNAHMEN.md` Deutsch,
      kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`
- `src/**`: unverändert; die Zeile kommt aus dem Fork, der Dienst ändert sich nicht
- `ops/**` außer den neuen `ops/card-visits.sh` und `ops/card_visits.py`: unverändert
- `test/**` außer dem neuen `test/card-visits.test.ts`: unverändert
- `docs/paket/anleitung.md` nur Zeile `Release:`, Installationsbefehl und Liste der Commits; `README.md` nur der Tag im
  Installationsbefehl
- `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**`, die übrigen Dateien unter `docs/kunden/`, die Goal-Dateien unter `goals/paket/`
  und alle bestehenden Vorschläge: nur lesen
- im Fork: Force-Push, Löschen von Branches oder Tags, Ändern der Sichtbarkeit, Änderungen am Prompt des Modells; in
  `Conway-Research/automaton`: jeder Kommentar, jedes Issue und jeder PR
- npm-Veröffentlichung, jede Wallet-Bewegung, jeder Kauf, jedes Schreiben in der Produktion, jeder Kontakt zum Betreiber eines
  Automatons (`third_party_mail`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-26, Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7 gebaut. `ops/card-visits.sh` mit `ops/card_visits.py` und `test/card-visits.test.ts` (Test vor dem Skript rot: 10 failed; Selbsttest mit abgeschalteter Bot-Regel rot: 4 FAIL, SELFTEST FAILED). Woche vor dem Release gegen die Produktion gemessen (0 Menschen, 3 Bots, 4380 Antworten 402, 0 Kartenkäufe live; bis 14:41 UTC genau die 4395 des Richtungs-Checks). Fork: PR #2 in `matthiashippe/automaton` mit Merge-Commit gemergt, Commits `1530489` (Kartenzeile, `src/survival/card-line.ts`, Test `src/__tests__/card-line.test.ts` mit 8 Fällen, vor der Änderung rot: Modul fehlt, gegen einen leeren Platzhalter 8 failed) und `04f23ee` (Version), Release `v0.2.2-maintained.2` auf dem Merge `769eebb`, `main` identisch. Anleitung, README, Annahmen nachgezogen.
  Prüfbefehle: alle Prüfungen der Punkte 1 bis 7 wörtlich, die Netz-Prüfungen der Punkte 2 bis 5 mit Netz; alle wie verlangt (SELFTEST OK, 27 Zeilen ok, 0 Adressen, vitest Exit 0, stimmig, 3, stimmig, kein diff, 1, 1, 8, gruen, Tag, ahead, identical, 1, 1, 2, gleich, 0, 0, 0, 5, check Exit 0). Die grep-Prüfungen liefen mit `/usr/bin/grep`; die ugrep-Hülle der Shell des code-host liest das führende `$` in Prüfung 2a anders.

## Blockers
