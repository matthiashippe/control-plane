# Konto Goal 15: Das Konto ist in der Produktion an

## Status
PAUSED

## Active Objective
Ein Mensch ohne Wallet startet aus Claude Code einen Automaton bei uns und bezahlt ihn per Karte. Heute (beim Schreiben am
2026-11-19 am Code von `dev` 57b224f gelesen):

1. Auf dem Server steht kein Wert `CP_KONTO_*` (konto 05, Kontext; konto 14, Active Objective), also antwortet `POST /v1/handoff` mit
   `step: "konto"` 503 `konto_unavailable` (`src/handoff/routes.ts`, `KONTO_OFF`), und `start_automaton` in `mcp/server.mjs` sagt
   seit konto 14 „Starting an automaton from Claude Code is not switched on yet. Nothing was charged.“
2. Der Absatz „Run an automaton from Claude Code“ in `README.md` sagt seit konto 14 „not switched on yet“.
3. Was zum Einschalten fehlt, steht in `docs/konto/euro.md`, Abschnitt `## Für konto 06`, Schritte 1 bis 5; `ops/konto-ready.sh`
   (konto 14) prüft Schritt 4, ohne einen Wert auszugeben. Ob ein Konto im Hauptnetz entstanden ist und was darauf liegt, zeigt kein
   Werkzeug.

Danach hat Matthias am Human Gate MoonPay über Turnkey, den Gasschlüssel für Base mit etwas ETH und die Werte `CP_KONTO_*` in
`/opt/control-plane/.env` eingerichtet, `ops/konto-ready.sh` meldet jede Zeile `set` und `container current`, ein erster echter
Start aus Claude Code kam bis zum Passkey (ein Konto mit `chain_id` 8453 in der Datenbank, gezählt von `ops/konto-live.sh`), die
erste Einzahlung von 25 USD per Karte steht in `docs/konto/live.md`, und der Absatz im README sagt wieder, dass der Start frei ist,
mit dem Hinweis, dass Auszahlungen folgen (`ROADMAP.md`, konto 15).
Widerlegt, wenn `ops/konto-ready.sh` nach dem Gate Exit 0 meldet und der echte Start trotzdem mit 503 `konto_unavailable` endet;
dann prüft das Werkzeug das Falsche, und dieses Goal repariert zuerst die Prüfung.
Übernimmt goals/_vorschlaege/konto-kritik-2026-11-18-4.md (das Einschalten; der Teil README und Vorbereitung war konto 14).
MVP: Funktion, weil erst dann ein Mensch ohne Wallet einen Automaton bei uns startet und bezahlt.

## Voraussetzungen
- konto Goal 14 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer dem README folgt, startet aus Claude Code einen Automaton, legt mit Handy und Passkey sein Konto an und zahlt
  per Karte Geld darauf, und wir sehen das in einer Zahl, ohne eine Adresse ins öffentliche Repo zu schreiben.
- Reihenfolge im Lauf (`verify: goal`, ein Child für alle Punkte):
  1. Punkt 1 (`ops/konto-live.sh` mit Tests), Commit, Push, Draft-PR. Danach einmal live lesen (nur lesen, Abschnitt „Produktion:
     nur lesen“ in `loop-constraints.md`): `ops/konto-live.sh` muss heute `accounts 0` melden, `ops/konto-ready.sh` Exit 1.
  2. Human Gate (unten): `## Status` auf `BLOCKED matthias`, Commit, Push. Das Goal läuft weiter, wenn Matthias die Aufgabe abhakt;
     seine Kommentare an der Aufgabe kommen als Kommentar ans Topic zurück.
  3. Nach dem Gate Punkt 2, dann Punkt 3, dann Punkt 4 (mit der Transaktionsnummer aus seinem Kommentar), zuletzt Punkt 5 und 6.
     Punkt 5 erst, wenn Punkt 3 grün ist, weil der Absatz sonst wieder ein Versprechen macht, das der Dienst nicht hält.
- Human Gate, sobald Punkt 1 grün ist: unter `## Blockers` je eine Zeile `Art: matthias`, `Gate: security_settings`, `Aufgabe:`,
  `Worum:` und `Empfehlung:`. Die Aufgabe ist eine einzige, in dieser Reihenfolge, alle Befehle fertig ausgefüllt:
  (a) MoonPay für HTC über den Link im Dashboard von Turnkey (Fiat Onramp) anlegen, Firmenprüfung durchlaufen, `pk_live_…` und
  `sk_live_…` dort hinterlegen (`security_settings`, `tax_account_identity`; `docs/konto/euro.md`, Schritt 2).
  (b) Gasschlüssel: ein neuer Schlüssel nur für Base, nie der Schlüssel der Betreiber-Wallet, als Datei im Volume `/data` des
  Containers, Format `0x` und 64 Hexziffern (`loadKontoKey` in `src/konto/chain.ts`), Rechte 600. Der Maker schreibt unter
  `Empfehlung:` den fertigen Befehl, der ihn im laufenden Container mit `generatePrivateKey` aus `viem/accounts` erzeugt, nach
  `/data/konto-gas.key` schreibt und nur die Adresse ausgibt, dazu den Betrag ETH auf Base für etwa hundert Transaktionen
  (Anlegen der Weiterleitung, `approveWithSignature`, `payout`), den Matthias an diese Adresse schickt (`server_kauf`).
  (c) Die Zeilen für `/opt/control-plane/.env` aus `docs/konto/euro.md`, Schritt 4, mit `CP_KONTO_KEY_FILE=/data/konto-gas.key`;
  `CP_BRIDGE_URL` und `CP_BRIDGE_KEY_FILE` bleiben leer, bis konto 16 die Freigabe für SEPA prüft. Danach der Rollout mit
  `gh workflow run deploy.yml -R matthiashippe/control-plane --ref dev -f force=true`, weil ein neuer Wert allein keinen Rollout
  auslöst (`docs/konto/euro.md`, Schritt 4, `container stale`).
  (d) Nach dem Rollout der echte Start: in Claude Code mit dem Plugin um einen Automaton bitten, QR-Code scannen, Passkey anlegen,
  dann `deposit` mit 25 USD und auf dem Handy per Karte bei MoonPay zahlen (`paid`).
  (e) Beim Abhaken die Transaktionsnummer aus der Bestätigung von MoonPay als Kommentar an die Aufgabe schreiben.
  Die Anfrage an Bridge (Schritt 1, `third_party_mail`) steht als fertiger Entwurf mit Betreff und Text unter `Empfehlung:`, nach
  `sales@bridge.xyz`, mit der Liste der Unterlagen aus Schritt 1. Der Tech Lead sieht am Human Gate in Matthias' gesendeten Mails
  nach, ob sie schon raus ist; dann fällt der Schritt weg, sonst legt er den Entwurf in sein Postfach. Gesendet wird sie nie von
  einem Agent.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 15` in `goals/konto/ANNAHMEN.md`):
  1. `ops/konto-live.sh` nach dem Muster von `ops/konto-ready.sh`: gleiche Variablen `CP_DEPLOY_HOST` und `CP_DEPLOY_KEY`, schickt
     sich selbst über `ssh -i "$KEY" -o BatchMode=yes … 'bash -s -- --on-server'` auf den Server und fragt dort den laufenden
     Container mit `docker compose -f /opt/control-plane/repo/deploy/docker-compose.prod.yml exec -T cp node …`. Im Container öffnet
     es die Datenbank aus `CP_DB_PATH` mit `better-sqlite3` und `readonly: true`, liest `SELECT address FROM konto_accounts WHERE
     chain_id = 8453`, fragt je Adresse `balanceOf` von USDC auf Base (`MAINNET_USDC` aus `src/konto/config.ts`) per `eth_call` an
     `CP_KONTO_RPC_URL` (Vorgabe `https://mainnet.base.org`) und gibt genau zwei Zeilen aus: `accounts <n>` und
     `balance_usd <Summe, auf Cent abgerundet, zwei Nachkommastellen>`. Nie eine Adresse, nie die URL. Scheitert eine Abfrage am
     RPC, steht `balance_usd unknown` und der Exit ist 1; SSH-Fehler Exit 2 mit `ssh failed`; sonst Exit 0, auch bei `accounts 0`.
     Summen sind im öffentlichen Repo erlaubt, Adressen einzelner Kunden nicht (Grundregel 8).
  2. `test/konto-live.test.ts` legt wie `test/konto-ready.test.ts` ein nachgebautes `ssh` und `docker` in einen Ordner aus `mkdtemp`
     vorn in `PATH`; das nachgebaute `docker` führt das Skript des Containers mit dem lokalen `node` aus, gegen eine Datenbank im
     selben Ordner und einen JSON-RPC-Stub auf `127.0.0.1` mit Port 0. `afterEach` löscht den Ordner mit `rmSync` und schließt den
     Stub. Die Antworten des Stubs baut der Test aus Zahlen (`toString(16).padStart(64, "0")`), nie als 64-stelliges Hex-Literal,
     weil Punkt 6 solche Literale als möglichen Schlüssel zählt. Ein Fall mit einem Skript, das eine Adresse ausgibt, war rot, das
     steht im Progress Log.
  3. `docs/konto/live.md` ist eine neue, kurze Doku: Überschrift, ein Satz, wofür sie da ist, dann die Zeilen `- Datum: <JJJJ-MM-TT>`,
     `- onRampTransactionId: <Nummer aus Matthias' Kommentar>` und `- balance_usd: <Wert aus ops/konto-live.sh nach der Einzahlung>`.
     Keine Adresse, keine IBAN, kein Schlüssel, kein Name. Weitere Zeilen (die erste Auszahlung) hängt konto 16 an.
  4. Der Absatz „Run an automaton from Claude Code“ im `README.md` bleibt an seiner Stelle und bekommt den Text von vor konto 14
     zurück (Plugin installieren mit `claude plugin marketplace add matthiashippe/control-plane && claude plugin install
     automaton@automatonhost`, Claude bitten, Handy und Passkey legen das Konto an und setzen das Tageslimit, der Rechner behält nur
     einen API-Schlüssel), dazu ein Satz: Einzahlen per Karte geht, Auszahlung auf das Bankkonto kommt bald („Payouts to your bank
     account follow soon.“). Verkäuferisch, ohne Entschuldigung, ohne Datum.
  5. `start_automaton` und `KONTO_OFF` bleiben, wie sie sind: Ist das Konto aus, stimmt ihr Satz weiter.
  6. Die Prüfung `CP_BRIDGE_* empty` in Punkt 2 gilt bis konto 16; konto 16 trägt sie in `goals/konto/ANNAHMEN.md` als abgelöst ein,
     wenn es die Werte setzt.
- Nicht in diesem Goal: jede Änderung an `src/**`, `mcp/**`, `deploy/**` oder an der Seite, ein Wert in `/opt/control-plane/.env`
  durch einen Agent, ein Aufruf von `POST /v1/handoff` oder einer anderen Route der Produktion durch einen Agent, jede Transaktion
  durch einen Agent, die Werte `CP_BRIDGE_*`, die erste Auszahlung und die Prüfung der Freigabe für SEPA (konto 16).

## Done Condition
- [ ] `ops/konto-live.sh` meldet `accounts <n>` und `balance_usd <Summe>` für die Konten mit `chain_id` 8453, liest die Datenbank
      nur lesend und gibt nie eine Adresse aus; vier Fälle in `test/konto-live.test.ts` belegen das offline.
      MVP: Funktion, weil sonst kein Befehl zeigt, ob ein echter Mensch ein Konto angelegt und Geld darauf hat.
      Prüfung: `bash -n ops/konto-live.sh && echo syntax ok` muss `syntax ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-live.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/konto-live.test.ts` muss mindestens `4` ausgeben (je ein Fall: zwei Konten mit 8453 und eines mit 84532, Guthaben 12.345678 und 10 USDC, gibt `accounts 2`, `balance_usd 22.34` und Exit 0; keine Ausgabe enthält eine Adresse der Testdatenbank oder die URL des Stubs; ein Fehler des RPC gibt `balance_usd unknown` und Exit 1; ein scheiterndes `ssh` gibt `ssh failed` und Exit 2).
      Prüfung: `grep -c 'readonly: true' ops/konto-live.sh` muss mindestens `1` ausgeben.
      Prüfung: `grep -cE '\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b' ops/konto-live.sh` muss `0` ausgeben.
      Prüfung: `grep -c 'mkdtemp' test/konto-live.test.ts` muss mindestens `1` ausgeben.
      Prüfung: `grep -cE 'rmSync\(' test/konto-live.test.ts` muss mindestens `1` ausgeben.
      Prüfung (Netz): `bash -c 'set -a; . ~/.config/control-plane/loop.env; set +a; ops/konto-live.sh' | grep -cE '^(accounts [0-9]+|balance_usd [0-9]+\.[0-9]{2})$'` muss genau `2` ausgeben.
- [ ] Matthias hat das Human Gate erledigt: `ops/konto-ready.sh` meldet jede Pflichtzeile `set`, `key_file readable` und
      `container current`, die Werte `CP_BRIDGE_*` sind leer.
      MVP: Funktion, weil der Dienst ohne diese Werte jeden Start mit 503 beantwortet.
      Prüfung (Netz): `bash -c 'set -a; . ~/.config/control-plane/loop.env; set +a; ops/konto-ready.sh >/dev/null; echo "exit=$?"'` muss genau `exit=0` ausgeben.
      Prüfung (Netz): `bash -c 'set -a; . ~/.config/control-plane/loop.env; set +a; ops/konto-ready.sh' | grep -cE '^(key_file readable|container current)$'` muss genau `2` ausgeben.
      Prüfung (Netz): `bash -c 'set -a; . ~/.config/control-plane/loop.env; set +a; ops/konto-ready.sh' | grep -cE '^CP_BRIDGE_(URL|KEY_FILE) empty$'` muss genau `2` ausgeben.
- [ ] Ein erster echter Start aus Claude Code kam bis zum Passkey: In der Produktion gibt es ein Konto im Hauptnetz.
      MVP: Funktion, weil das der Schritt ist, an dem heute jeder Mensch scheitert.
      Prüfung (Netz): `bash -c 'set -a; . ~/.config/control-plane/loop.env; set +a; ops/konto-live.sh' | awk '$1=="accounts"{print ($2>=1)}'` muss genau `1` ausgeben.
- [ ] Die erste Einzahlung von 25 USD per Karte steht in `docs/konto/live.md` mit Datum, `onRampTransactionId` und `balance_usd`, ohne
      Adresse, IBAN oder Schlüssel; die Entscheidungen stehen mit Grund unter `## Goal 15` in `goals/konto/ANNAHMEN.md`.
      MVP: Funktion, weil die erste bezahlte Karte belegt, dass ein Mensch ohne Wallet bei uns Geld aufs Konto bringt.
      Prüfung: `awk -F': ' '/^- Datum: 20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/{c=1} /^- onRampTransactionId: [^ ]+$/{a=1} /^- balance_usd: [0-9]+\.[0-9][0-9]$/ && $2+0>=15{b=1} END{print a+b+c}' docs/konto/live.md` muss genau `3` ausgeben (MoonPay zieht von 25 USD Gebühren ab, deshalb mindestens 15).
      Prüfung: `grep -ciE '0x[0-9a-f]{40}|0x[0-9a-f]{64}|\bDE[0-9]{2} ?[0-9]{4}' docs/konto/live.md` muss `0` ausgeben.
      Prüfung: `grep -c '^## Goal 15' goals/konto/ANNAHMEN.md` muss genau `1` ausgeben.
- [ ] Der Absatz „Run an automaton from Claude Code“ in `README.md` sagt wieder, dass der Start aus Claude Code frei ist, nennt die
      Installation des Plugins und sagt, dass Auszahlungen folgen.
      MVP: Funktion, weil der Mensch den Weg nur findet, wenn das README ihn zeigt.
      Prüfung: `awk '/Run an automaton from Claude Code/{f=1} f&&/^$/{exit} f' README.md | grep -c 'not switched on yet'` muss `0` ausgeben.
      Prüfung: `awk '/Run an automaton from Claude Code/{f=1} f&&/^$/{exit} f' README.md | grep -c 'claude plugin install automaton@automatonhost'` muss mindestens `1` ausgeben.
      Prüfung: `awk '/Run an automaton from Claude Code/{f=1} f&&/^$/{exit} f' README.md | grep -c 'Payouts to your bank account follow'` muss mindestens `1` ausgeben.
      Prüfung: `grep -c '—\|–' README.md docs/konto/live.md | grep -vc ':0$'` muss `0` ausgeben.
- [ ] Der Diff bleibt in den Pfaden dieses Goals, `src/**` und `mcp/**` bleiben gleich, kein Test wird schwächer, kein neues Paket,
      kein Schlüssel und keine Adresse im Diff, keine andere Goal-Datei geändert, und `check` ist grün.
      MVP: Funktion, weil `ops/**` mit dem Merge ausrollt und das Repo öffentlich ist.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(README\.md|ops/konto-live\.sh|test/konto-live\.test\.ts|docs/konto/live\.md|goals/konto/15-das-konto-ist-in-der-produktion-an\.md|goals/konto/verdicts/15-[A-Za-z0-9._-]+\.md|goals/konto/ANNAHMEN\.md|goals/_vorschlaege/konto-[a-z0-9.-]+\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --quiet origin/dev...HEAD -- src mcp deploy harness package.json pnpm-lock.yaml && echo laufzeit gleich` muss `laufzeit gleich` ausgeben.
      Prüfung: `for f in $(git diff --name-only --diff-filter=M origin/dev...HEAD -- test); do for k in '(it|test)\(' 'expect\('; do a=$(git show origin/dev:$f | grep -cE "^\s*$k"); b=$(grep -cE "^\s*$k" $f); [ "$b" -ge "$a" ] || echo "weniger $f $k $a $b"; done; done; git diff origin/dev...HEAD -- test | grep -E '^[+].*\.(skip|only|todo)\(' | wc -l` muss als einzige Ausgabe `0` haben.
      Prüfung: `git diff --quiet --diff-filter=DMR origin/dev...HEAD -- 'goals/*/[0-9][0-9]-*.md' ':!goals/konto/15-das-konto-ist-in-der-produktion-an.md' && echo goals gleich` muss `goals gleich` ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|cnwy_k_[A-Za-z0-9_-]{16,}|pk_live_[A-Za-z0-9]|sk_live_[A-Za-z0-9]|0x[0-9a-fA-F]{64}" | wc -l` muss `0` ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- README.md docs ops goals/konto/ANNAHMEN.md | grep -E '^[+]' | grep -ciE '0x[0-9a-f]{40}'` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/konto-15 --state open --json number -q '.[0].number'); gh pr checks "$n" -R matthiashippe/control-plane | awk -F'\t' '$1=="check" && $2=="pass"' | wc -l` muss mindestens `1` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer dem README folgt, startet aus Claude Code einen Automaton und legt mit Handy und Passkey sein Konto an.
- [ ] Die erste Einzahlung per Karte ist belegt, ohne Adresse oder Schlüssel im Repo.
- [ ] `ops/konto-live.sh` zeigt Zahl der Konten und Summe der Guthaben im Hauptnetz, nie eine Adresse.
- [ ] Kein Gedankenstrich, kein deutscher Bezeichner im Code.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.key`, `*.pem`
- `src/**`, `mcp/**`, `ops/**` außer `ops/konto-live.sh`, `docs/**` außer `docs/konto/live.md`, jedes Bild unter `docs/soll/`
- jede Änderung an `/opt/control-plane/.env`, an Dateien im Volume `/data` oder an der Datenbank der Produktion durch einen Agent,
  jeder Rollout durch einen Agent, jeder Aufruf einer Route der Produktion durch einen Agent (auch `POST /v1/handoff`), jede
  Transaktion und jeder Aufruf bei Turnkey, MoonPay oder Bridge durch einen Agent; nur lesen über SSH nach `loop-constraints.md`
- eine Mail an Bridge oder einen anderen Dritten, gesendet von einem Agent
- `ROADMAP.md`, `docs/kette.md`, alle Goal-Dateien außer dieser (eingefroren), jede Zeile einer `ANNAHMEN.md` außer `## Goal 15`
- ein neues Paket, ein Test, der gestrichen, übersprungen oder schwächer wird
- ein API-Schlüssel, ein privater Schlüssel, ein Wert aus einer echten `.env`, eine Adresse eines Kontos, eine IBAN, ein Testschlüssel
  als Literal in Repo, Log, Ausgabe, Kommentar oder Fixture
- kein fester Port in Tests, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
Entscheidung von Matthias am 2026-11-22: kein Zugang bei MoonPay. konto 15 ruht, bis ein anderer Weg für die Karte feststeht.
