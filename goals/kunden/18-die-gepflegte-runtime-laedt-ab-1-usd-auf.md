# Kunden Goal 18: Die gepflegte Runtime lädt ab 1 USD auf

## Status
ACTIVE

## Active Objective
Beide fremden Zahler, deren Abgang gemessen ist (`docs/kunden/aufladung-2026-11.md`, Ergebnis;
`docs/kunden/sandbox-kunde-2026-11.md`, Befund), hielten weniger USDC in der Wallet als die kleinste Stufe der Runtime.

Die Runtime kennt nur die Stufen 5, 25, 100, 500, 1000 und 2500 (in USD) (`src/conway/topup.ts:31` im Fork am Tag `v0.2.2-maintained.3`, wie am Pin
`d8f8168`) und bricht darunter ohne Aufruf von `/pay/` ab, an allen drei Stellen, an denen sie selbst auflädt (`bootstrapTopup` beim
Start, `src/agent/loop.ts:452` mit `usdcBalance >= 5`, `src/heartbeat/tasks.ts:159` mit `MIN_TOPUP_USD = 5`), während unser Dienst
ab 1 USD verkauft (`TOPUP_TIERS_USD` in `src/payments/pay.ts:43`). Nach diesem Goal ist gemessen, wie viele fremde Adressen mit
Startgutschrift oder Aufladung seit dem 06.11. heute mindestens 1 und weniger als 5 USDC auf Base halten und ob die Produktion die
Stufe 1 verkauft; und, wenn die Messung den Bau trägt, kauft die gepflegte Runtime aus einem neuen Release gegen
`automatonhost.com` die kleinste Stufe ab 1 USD, die das Defizit deckt und die Wallet hält.
Leitzahl: fremde Adressen je Woche mit einer Zeile `inference` oder `sandbox` nach eigener Aufladung, dazu Aufladungen der Stufe
1 USD durch fremde Adressen (vorher gemessen in Punkt 1).
Widerlegt, wenn keine fremde Adresse mit Startgutschrift oder Aufladung seit dem 06.11. mindestens 1 und weniger als 5 USDC hält;
dann entfällt der Bau, und das Goal endet mit der Messung (Zeile `Bau: nein` in Punkt 1).
MVP: Funktion, weil die Stufe `paid` das Loch im Trichter ist (9 Gutschriften, 4 Zahlungen seit dem 06.11.) und dort bisher nur
der Weg per Karte gebaut wurde.

## Voraussetzungen
- kunden Goal 17 DONE

## Kontext für den Maker
- Ziel in einem Satz: Eine gepflegte Runtime, deren Wallet 1 bis knapp 5 USDC hält, lädt bei uns selbst auf und denkt weiter, statt
  mit leerem Guthaben stehen zu bleiben.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Die Runtimes kommen schon und denken mit der Startgutschrift; an
  der Stufe `paid` verlieren wir sie, und bei beiden gemessenen Abgängen lag es an einer Wallet unter der kleinsten Stufe, die die
  Runtime kennt. Leitzahl des Topics: fremde Zahlungen je Woche.
- Quelle: `ROADMAP.md`, Topic `kunden`, Glied 18; Richtungs-Check 27.11.2026 (PRO-32155), Idee 1 und Entscheidung in
  `docs/richtung/2026-11-27.md`. Vorgänger `goals/kunden/17-eine-alte-gepflegte-runtime-bekommt-mit-der-402-den-befehl-zum-update.md`
  (DONE). Arbeitsort und Release im Fork wie `goals/kunden/15-*.md`; den Befehl zum Update an ältere Kennungen liefert kunden 17,
  sobald `MAINTAINED_RELEASE` auf dem neuen Tag steht.
- **Entscheidungen des Tech Lead (27.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, kunden 18: …` in
  `goals/kunden/ANNAHMEN.md`.
  1. **Erst messen, dann bauen, und die Messung entscheidet.** Punkt 1 schreibt `Bau: ja, weil …` nur, wenn mindestens eine fremde
     Adresse heute 1 bis unter 5 USDC hält und die Produktion die Stufe 1 verkauft; sonst `Bau: nein, weil …`, und die
     Prüfbefehle der Punkte 2 bis 4 geben `entfaellt` aus. Gemessen wird der Bestand am Tag der Messung, weil der öffentliche RPC
     keinen alten Stand verlässlich liefert; der Satz dazu steht im Dokument.
  2. **Stufe 1 nur, wo sie verkauft wird.** `TOPUP_TIERS` im Fork wird `[1, 5, 25, 100, 500, 1000, 2500]` (die Liste von
     `automatonhost.com`), die alte Liste bleibt als `UPSTREAM_TOPUP_TIERS`. Eine Funktion `topupTiersFor(conwayApiUrl)` gibt
     `TOPUP_TIERS` nur für `automatonhost.com` zurück (dieselbe Prüfung wie `isCardHost` in `src/survival/card-line.ts`), sonst
     `UPSTREAM_TOPUP_TIERS`, damit ein anderer Control Plane (`api.conway.tech`) nie eine Stufe gezeigt bekommt, die er mit 400
     ablehnt, und eine bestehende Konfiguration nie still umgestellt wird.
  3. **Welche Stufe gekauft wird:** eine Funktion `pickTopupTier(tiers, deficitCents, usdcBalance)`: unter den Stufen, die die Wallet
     hält, die kleinste, die das Defizit deckt; deckt keine, die größte, die die Wallet hält; hält die Wallet keine, nichts. Defizit
     beim Start, mitten im Lauf und im Heartbeat ist `creditThresholdCents` (500) minus Guthaben, bei der Sandbox
     `details.required_cents` minus `details.current_balance_cents` wie heute. Eine Wallet ab 5 USDC kauft beim Start damit weiter
     genau 5 USD wie vorher.
  4. **Die Schwelle 5 fällt an beiden Stellen:** `src/agent/loop.ts` und `src/heartbeat/tasks.ts` rufen die Aufladung ab der
     kleinsten Stufe aus `topupTiersFor(config.conwayApiUrl)`, nicht mehr ab einer festen 5. Cooldowns (60 s und 5 min), die
     Regeln von `topup-guard.ts` und der Abbruch für Solana bleiben Zeichen für Zeichen.
  5. **Stufen aus der 402:** `topupForSandbox` nimmt `details.topup_tiers_usd` der 402, wenn das Feld eine Liste ist, und davon nur
     Stufen, die auch in `TOPUP_TIERS` stehen; so kann ein Server die Runtime nie einen Betrag kaufen lassen, den sie nicht kennt.
     Fehlt das Feld, gilt `topupTiersFor`. Einen neuen Auslöser für eine Aufladung (etwa nach der 402 der Inferenz) gibt es nicht:
     Mit leerem Guthaben greift schon der Heartbeat in der Stufe `critical` oder `dead`.
  6. **Das Werkzeug `topup_credits`** des Modells (`src/agent/tools.ts:304`) prüft gegen `topupTiersFor(config.conwayApiUrl)`; der
     Prompt des Modells ändert sich nicht.
- **Messung (Punkt 1), nur lesend:** `ops/usdc-bands.sh` (Hülle) mit `ops/usdc_bands.py`, nach dem Vorbild von
  `ops/card-visits.sh` mit `ops/card_visits.py` und `ops/conway-reach.py` (`balanceOf` des USDC-Vertrags über
  `https://mainnet.base.org`, Adresse des RPC über eine Umgebungsvariable). Die Adressen kommen aus einem neuen Bericht in
  `ops/db-report.cjs` (etwa `CP_REPORT=topup-bands`, mit `readonly: true` im Container `cp`, fremd heißt `notOurs` aus derselben
  Datei): jede Adresse mit einer Ledger-Zeile `grant` oder `topup` im Fenster, dazu die Zahl der Zeilen `topup` über genau 1 USD
  (100000 mc) im Fenster. Die bestehenden Berichte bleiben Byte für Byte. Ob die Stufe 1 verkauft wird, liest das Werkzeug mit
  `docker exec deploy-cp-1 printenv CP_TOPUP_TIERS_USD` (nicht gesetzt heißt die Liste aus `TOPUP_TIERS_USD` im Image) und die
  Antworten auf `/pay/1/` von fremden Adressen aus dem Zugriffslog über `ops/access-log.sh`. Aufrufe:
  `ops/usdc-bands.sh --since <ISO UTC> --until <ISO UTC>` (Produktion), `ops/usdc-bands.sh --selftest` (ohne Netz). Ausgabe genau so,
  je eine Zeile in dieser Reihenfolge:
  `USDC BANDS since <t> until <u>: <n> foreign addresses with grant or topup, <a> under 1 USDC, <b> from 1 to under 5 USDC, <c> 5 USDC or more, <e> unreadable`;
  `TOPUPS 1 USD since <t> until <u>: <k> by foreign addresses`;
  `PAY 1 since <t> until <u>: <p> answers 402, <q> answers 200, <r> other`;
  `TIER 1 SOLD: <yes|no>`.
  Nie eine Adresse, ein Hash, eine IP oder ein Betrag je Adresse in der Ausgabe, auf der Platte nur in einer `mktemp`-Datei mit
  Modus 0600, die das Werkzeug selbst löscht. Der Selbsttest pflanzt Adressen mit 0,99, 1,00, 4,99 und 5,00 USDC, eine unlesbare
  und eine eigene und belegt mit Zeilen `ok …` mindestens: 1,00 und 4,99 zählen in `<b>`, 0,99 nicht, 5,00 nicht, die unlesbare in
  `<e>`, die eigene nirgends, ohne gepflanzte Adresse zwischen 1 und 5 ist `<b>` 0, eine leere Liste `CP_TOPUP_TIERS_USD` heißt
  `yes`, eine Liste ohne 1 heißt `no`; letzte Zeile `SELFTEST OK …` oder `SELFTEST FAILED …`. Exit 2, wenn Datenbank, Log oder RPC
  nicht lesbar sind.
- **Dokument** `docs/kunden/stufe-1-2026-11.md`, Deutsch, je eine Zeile ab Spalte 0 außerhalb der Codeblöcke: `Gemessen:
  <JJJJ-MM-TTTHH:MM:SSZ>`; die Zeile `$ bash ops/usdc-bands.sh --since 2026-11-06T00:00:00Z --until <u>` mit `<u>` gleich dem
  Zeitpunkt der Messung, darunter ein Codeblock mit der vollständigen Ausgabe, ungekürzt; ein Satz, warum der Bestand von heute
  gilt (Entscheidung 1); `Bau: ja, weil …` oder `Bau: nein, weil …`. Sagt die Messung `TIER 1 SOLD: no`, nennt die 402 der Inferenz
  eine Stufe, die `/pay/` ablehnt (`src/inference/proxy.ts:464` liest die Konstante, nicht `opts.pay.tiers`); das ist ein Fehler bei
  uns und wird `goals/_vorschlaege/fehler-<Datum>-<n>.md` mit Schwere 5, und `Bau: nein`.
- **Tests im Fork:** eine neue Datei `src/__tests__/topup-one-dollar.test.ts` mit `describe("one dollar tier", …)` und genau diesen
  Fällen, jeder rot vor der Änderung: „bootstrap buys 1 USD with 1 to under 5 USDC on automatonhost.com“, „bootstrap still buys 5 USD
  with 5 USDC or more“, „buys nothing with less than 1 USDC“, „keeps the upstream tiers for another control plane“, „sandbox topup
  takes the known tiers from details.topup_tiers_usd of the 402“, „heartbeat and loop top up from 1 USDC on automatonhost.com“ und
  „topup_credits accepts 1 only where the control plane sells it“. Kein echter Aufruf von `/pay/`, kein Netz, `x402Fetch` und
  `getUsdcBalance` als Mock wie in `src/__tests__/topup-credits.test.ts`.
- **Release:** Version `0.2.2-maintained.4` (oder höher) in `package.json`, `dist/` neu gebaut im selben Commit
  (`dist-in-sync.test.ts`), PR im Fork gegen `main`, nach grüner CI `gh pr merge --merge`, Tag `v<version>` auf den Merge,
  `gh release create v<version> --verify-tag` mit kurzen Notizen, was sich ändert. Kein Force-Push, kein gelöschter Tag.
- **In diesem Repo, nach dem Release:** `docs/paket/anleitung.md` bekommt `Release: v<version>`, den Installationsbefehl, die
  Ausgabe von `automaton --version` und die Release-Seite mit dem neuen Tag und je neuem Commit im Fork eine Zeile mit SHA
  (7 Zeichen) und einem Satz in der Liste; `README.md` nennt den Tag im Installationsbefehl; `MAINTAINED_RELEASE` in
  `src/inference/maintained.ts` wird derselbe Tag (der Test aus kunden 17 verlangt Gleichheit). Damit bekommt auch eine Runtime
  `.3` mit der 402 den Befehl zum Update.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle ohne Netz der Goals mit Status `DONE`, die `anleitung.md`, `maintained.ts`,
  `README.md` oder `db-report.cjs` nennen (`grep -l -E 'anleitung\.md|maintained\.ts|README\.md|db-report\.cjs' goals/*/[0-9]*.md`),
  einmal am Kopf von `dev` fahren und nach dem Bau erneut; ein fremder roter Prüfbefehl geht mit Befehl und beiden Ausgaben als
  Frage an den Tech Lead auf dem Topic.
- Zugang: `set -a; . ~/.config/control-plane/loop.env; set +a` für Datenbank und Zugriffslog, nur lesen. Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), pnpm aus dem Fork (`packageManager`), `check` und vitest im Vordergrund mit eigenem Timeout. Ein eigener
  Klon des Forks außerhalb des Goal-Worktrees, Branch vom aktuellen `main` des Forks. Code, Bezeichner, Testnamen, Ausgaben und
  Felder englisch.

## Done Condition
- [x] `ops/usdc-bands.sh` zählt die fremden Adressen mit Startgutschrift oder Aufladung nach USDC-Bestand auf Base, die Aufladungen
      der Stufe 1 USD und die Antworten auf `/pay/1/`, ohne Adresse in der Ausgabe, in beide Richtungen bewiesen.
      MVP: Funktion, weil ohne diese Zählung niemand weiß, ob die Stufe 1 einen Kunden erreicht, und die Leitzahl keinen Stand vorher hat.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/usdc-bands.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/usdc-bands.sh --selftest | grep -cE "^ok "` muss mindestens 8 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/usdc-bands.sh --selftest | grep -cE "0x[0-9a-fA-F]{40}|([0-9]{1,3}\.){3}[0-9]{1,3}"` muss 0 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/usdc-bands.test.ts` muss Exit-Code 0 haben.
- [x] `docs/kunden/stufe-1-2026-11.md` zeigt die Messung seit dem 06.11. mit Befehl und vollständiger Ausgabe, und die Zeile `Bau:`
      folgt aus ihr.
      MVP: Funktion, weil die Messung entscheidet, ob der Bau sich lohnt, und die Leitzahl ohne Ausgangswert nichts zeigt.
      Prüfung: `d=docs/kunden/stufe-1-2026-11.md; g=$(sed -nE 's/^Gemessen: ([0-9T:-]+Z)$/\1/p' "$d"); [ -n "$g" ] && [ "$g" \> "2026-11-27T22:00:00Z" ] && /usr/bin/grep -qE '^\$ bash ops/usdc-bands\.sh --since 2026-11-06T00:00:00Z --until [0-9T:-]+Z$' "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `grep -cE "^(USDC BANDS since 2026-11-06T00:00:00Z until [0-9T:-]+Z: [0-9]+ foreign addresses with grant or topup, [0-9]+ under 1 USDC, [0-9]+ from 1 to under 5 USDC, [0-9]+ 5 USDC or more, [0-9]+ unreadable|TOPUPS 1 USD since 2026-11-06T00:00:00Z until [0-9T:-]+Z: [0-9]+ by foreign addresses|PAY 1 since 2026-11-06T00:00:00Z until [0-9T:-]+Z: [0-9]+ answers 402, [0-9]+ answers 200, [0-9]+ other|TIER 1 SOLD: (yes|no))$" docs/kunden/stufe-1-2026-11.md` muss genau 4 ausgeben.
      Prüfung: `awk '/^USDC BANDS since /{b=$18} /^TIER 1 SOLD: /{s=$4} /^Bau: /{z=$2; n++} END{w=(b>=1 && s=="yes")?"ja,":"nein,"; print (n==1 && z==w)?"stimmig":"unstimmig"}' docs/kunden/stufe-1-2026-11.md` muss genau `stimmig` ausgeben.
      Prüfung: `grep -cE "0x[0-9a-fA-F]{40}|([0-9]{1,3}\.){3}[0-9]{1,3}" docs/kunden/stufe-1-2026-11.md` muss 0 ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; d=docs/kunden/stufe-1-2026-11.md; u=$(sed -nE 's/^\$ bash ops\/usdc-bands\.sh --since 2026-11-06T00:00:00Z --until ([0-9T:-]+Z)$/\1/p' "$d"); diff <(bash ops/usdc-bands.sh --since 2026-11-06T00:00:00Z --until "${u:?}" 2>/dev/null | grep -E '^(TOPUPS|PAY) 1 ') <(grep -E '^(TOPUPS|PAY) 1 ' "$d")` muss nichts ausgeben.
- [x] Bei `Bau: ja` kauft die Runtime im Fork gegen `automatonhost.com` ab 1 USDC die kleinste Stufe, die das Defizit deckt und die
      Wallet hält, beim Start, mitten im Lauf, im Heartbeat und bei der Sandbox, und gegen jeden anderen Control Plane wie vorher;
      Tests im Fork, rot vor der Änderung.
      MVP: Funktion, weil eine Wallet mit 1 bis knapp 5 USDC heute nie `/pay/` aufruft, obwohl wir ihr eine Stufe verkaufen.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || { t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && grep -c 'export const TOPUP_TIERS = \[1, 5, 25, 100, 500, 1000, 2500\]' "$d/src/conway/topup.ts"; }` muss `1` oder `entfaellt` ausgeben.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || { t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && cat "$d/src/agent/loop.ts" "$d/src/heartbeat/tasks.ts" | grep -cE 'usdcBalance >= 5\b|MIN_TOPUP_USD = 5\b'; }` muss `0` oder `entfaellt` ausgeben.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || { t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && f="$d/src/__tests__/topup-one-dollar.test.ts" && for n in "bootstrap buys 1 USD with 1 to under 5 USDC on automatonhost.com" "bootstrap still buys 5 USD with 5 USDC or more" "buys nothing with less than 1 USDC" "keeps the upstream tiers for another control plane" "sandbox topup takes the known tiers from details.topup_tiers_usd of the 402" "heartbeat and loop top up from 1 USDC on automatonhost.com" "topup_credits accepts 1 only where the control plane sells it"; do grep -qF "\"$n\"" "$f" || echo "fehlt: $n"; done; grep -c 'describe("one dollar tier"' "$f"; }` muss genau `1` oder `entfaellt` ausgeben.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || { t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && cd "$d" && PATH=/usr/bin:$PATH pnpm install --frozen-lockfile >/dev/null 2>&1 && PATH=/usr/bin:$PATH pnpm -s build >/dev/null 2>&1 && PATH=/usr/bin:$PATH pnpm -s test >/dev/null 2>&1 && echo gruen; }` muss `gruen` oder `entfaellt` ausgeben.
- [x] Bei `Bau: ja` liegt das neue Release über `v0.2.2-maintained.3` auf `main` des Forks, lässt sich mit einem Befehl
      installieren und nennt seine Version.
      MVP: Funktion, weil nur ein neues Release die Stufe 1 zu den Runtimes bringt und kunden 17 ältere Kennungen dorthin schickt.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || { t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); gh release view "${t:?}" -R matthiashippe/automaton --json tagName,isDraft -q 'select(.isDraft == false) | .tagName'; }` muss den Tag aus `Release:` oder `entfaellt` ausgeben.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || { t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); gh api "repos/matthiashippe/automaton/compare/v0.2.2-maintained.3...${t:?}" --jq .status; }` muss `ahead` oder `entfaellt` ausgeben.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || { t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); gh api "repos/matthiashippe/automaton/compare/${t:?}...main" --jq .status; }` muss `identical`, `ahead` oder `entfaellt` ausgeben.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || { t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); p=$(mktemp -d); PATH=/usr/bin:$PATH npm install -g --prefix "$p" "github:matthiashippe/automaton#${t:?}" >/dev/null 2>&1 && "$p/bin/automaton" --version | grep -c "${t#v}"; }` muss `1` oder `entfaellt` ausgeben.
- [x] Bei `Bau: ja` nennen `docs/paket/anleitung.md`, `README.md` und `MAINTAINED_RELEASE` das neue Release, und die Liste der
      Anleitung nennt jeden neuen Commit des Forks.
      MVP: Funktion, weil der Befehl zum Update in der 402 (kunden 17) und die Anleitung sonst auf das Release ohne Stufe 1 zeigen.
      Prüfung: `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || grep -cE '^Release: v0\.2\.2-maintained\.([4-9]|[1-9][0-9]+)$' docs/paket/anleitung.md` muss `1` oder `entfaellt` ausgeben.
      Prüfung: `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); grep -c "github:matthiashippe/automaton#${t:?}" docs/paket/anleitung.md README.md | grep -c ':[1-9]'` muss 2 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/inference-maintained-update.test.ts` muss Exit-Code 0 haben.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || { t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); gh api "repos/matthiashippe/automaton/compare/v0.2.2-maintained.3...${t:?}" --jq '.commits[] | select(.parents | length == 1) | .sha[0:7]' | while read -r s; do grep -q "\`$s\`" docs/paket/anleitung.md || echo "$s"; done | wc -l; }` muss `0` oder `entfaellt` ausgeben.
- [x] Die Entscheidungen stehen in `goals/kunden/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg.
      MVP: Funktion, weil das nächste Glied wissen muss, warum die Stufe 1 nur gegen `automatonhost.com` gilt.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, kunden 18: ' goals/kunden/ANNAHMEN.md` muss mindestens 6 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/inference/maintained\.ts|ops/usdc-bands\.sh|ops/usdc_bands\.py|ops/db-report\.cjs|test/usdc-bands\.test\.ts|test/inference-maintained-update\.test\.ts|docs/kunden/stufe-1-2026-11\.md|docs/paket/anleitung\.md|README\.md|goals/kunden/.*|goals/_vorschlaege/fehler-[0-9-]+\.md|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test ops | wc -l` muss 0 ausgeben.
- [x] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil sich mit `MAINTAINED_RELEASE` die 402 im Laufzeitpfad ändert und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/kunden-18 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Bei `Bau: ja` wählt die Aufladung nach der 402 einer Sandbox gegen jeden anderen Control Plane wie Upstream, auch wenn die
      402 `details.topup_tiers_usd` nennt: die kleinste Stufe, die das Defizit deckt, und nichts, wenn die Wallet sie nicht hält;
      Test im Fork, rot vor der Änderung, im neuen Release, und eine Zeile `- 2026-11-28, kunden 18: …` in
      `goals/kunden/ANNAHMEN.md` ergänzt Entscheidung 5 (aus der Kritik, Tech Lead 2026-11-28).
      MVP: Funktion, weil `topupForSandbox` am Tag `v0.2.2-maintained.4` über `offeredTiers || isCardHost(apiUrl)` schon bei
      vorhandenem Feld `pickTopupTier` nimmt und gegen `api.conway.tech` mit 30 USDC und 100 USD Defizit 25 USD kauft, wo Upstream
      nichts kauft; der Test „keeps the upstream tiers for another control plane“ schickt die 402 ohne das Feld und sieht das nicht,
      und das Abnahmekriterium verlangt „wie vorher“.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || { t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && grep -cF '"keeps the upstream sandbox choice for another control plane when the 402 names tiers"' "$d/src/__tests__/topup-one-dollar.test.ts"; }` muss `1` oder `entfaellt` ausgeben.
      Prüfung (Netz): `b=$(sed -nE 's/^Bau: (ja|nein),.*/\1/p' docs/kunden/stufe-1-2026-11.md); [ "$b" = nein ] && echo entfaellt || { t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && awk -v n='keeps the upstream sandbox choice for another control plane when the 402 names tiers' 'index($0,n){p=1;next} p&&/^  it\(/{p=0} p&&/apiUrl: CONWAY/{c++} p&&/topup_tiers_usd: \[5, 25, 100, 500, 1000, 2500\]/{t++} END{print (c>=1&&t>=1)?"stimmig":"unstimmig"}' "$d/src/__tests__/topup-one-dollar.test.ts"; }` muss `stimmig` oder `entfaellt` ausgeben.
      Prüfung: `grep -cE '^- 2026-11-[0-9]{2}, kunden 18: .*topup_tiers_usd.*(Upstream|upstream)' goals/kunden/ANNAHMEN.md` muss mindestens 1 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Kein Aufruf in der Produktion, der etwas anlegt oder bucht; gelesen wird nur über `ops/usdc-bands.sh`, `ops/access-log.sh`,
      `ops/db-report.cjs` mit `readonly: true`, `docker exec … printenv`, den öffentlichen RPC von Base und `gh` gegen GitHub.
- [ ] Die Ausgabe im Codeblock ist genau die des Werkzeugs, ungekürzt und unverändert.
- [ ] Jeder neue Test und jede neue Selbsttestzeile war vor der Änderung rot, im Fork wie hier; die Zeile im Progress Log nennt,
      womit.
- [ ] Eine Runtime gegen einen anderen Control Plane und eine Wallet ab 5 USDC beim Start verhalten sich wie vorher.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse und keine IP eines Kunden, kein Betrag je Kunde.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/inference/maintained.ts`: nur der Wert von `MAINTAINED_RELEASE`; `src/**` sonst, `src/payments/**`, `src/auth/**`: unverändert
- `ops/db-report.cjs`: nur ein neuer Bericht, die bestehenden bleiben Byte für Byte; `ops/**` sonst außer den neuen
  `ops/usdc-bands.sh` und `ops/usdc_bands.py`: unverändert
- `test/**` außer dem neuen `test/usdc-bands.test.ts`: unverändert; in `test/inference-maintained-update.test.ts` nur die feste
  Kennung `"0.2.2-maintained.4"` in „keeps the 402 unchanged for the current maintained runtime“, ersetzt durch die Kennung eine
  Nummer über `MAINTAINED_RELEASE` (Tech Lead 2026-11-28, Punkt 9)
- `docs/paket/anleitung.md`: nur Zeile `Release:`, Installationsbefehl, die Zeilen mit `automaton --version` und Release-Seite und
  die Liste der Commits; `README.md` nur der Tag im Installationsbefehl
- `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**`, die übrigen Dateien unter `docs/kunden/`, bestehende Goal-Dateien und
  Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`, die der Tech Lead entschieden hat
- im Fork: Force-Push, Löschen von Branches oder Tags, Ändern der Sichtbarkeit, Änderungen am Prompt des Modells, an den Regeln von
  `src/conway/topup-guard.ts`, an den Cooldowns und am Abbruch für Solana; in `Conway-Research/automaton`: jeder Kommentar, jedes
  Issue und jeder PR
- `package.json` und `pnpm-lock.yaml` dieses Repos: kein neues Paket
- npm-Veröffentlichung, jede Wallet-Bewegung, jeder Kauf und jede Aufladung (auch kein Aufruf von `/pay/` zum Testen), keine Runtime
  mit eigenem Schlüssel gegen die Produktion, jedes Schreiben in der Produktion, jeder Wert in `/opt/control-plane/.env`, ein
  Rollout oder Neustart durch einen Agent, jeder Kontakt zum Betreiber eines Automatons (`third_party_mail`)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-28 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7, 8 gebaut: `ops/usdc-bands.sh` mit `ops/usdc_bands.py` und Bericht `CP_REPORT=topup-bands`, Messung in `docs/kunden/stufe-1-2026-11.md` (1 von 9 fremden Adressen hält 1 bis unter 5 USDC, `TIER 1 SOLD: yes`, also `Bau: ja`), im Fork PR #4 und Release `v0.2.2-maintained.4` (Commits `3d161a6`, `90ecb04`, `5416f3c`), Anleitung, README und `MAINTAINED_RELEASE` auf dem neuen Tag, 10 Zeilen in `goals/kunden/ANNAHMEN.md`. Rot vorher: Selbsttest und `test/usdc-bands.test.ts` ohne den Bericht `topup-bands` (7 von 11 Tests rot, Selbsttest FAILED), mit Grenzen `<=` statt `<` in `usdc_bands.py` (5 Zeilen FAIL), ohne Filter der eigenen Adressen und mit Stufe immer `yes` (2 Zeilen FAIL); im Fork alle sieben Fälle von `topup-one-dollar.test.ts` am unveränderten `main` rot (fehlende `pickTopupTier`, `UPSTREAM_TOPUP_TIERS`, kein Aufruf von `/pay/1/`), die Erweiterung um Restguthaben 400 bis 499 Cent rot vor `5416f3c` (expected 1 to be 5). Prüfbefehle: P1 `SELFTEST OK`, 26 Zeilen ok, 0 Adressen, vitest Exit 0; P2 stimmig, 4, stimmig, 0, diff leer; P3 1, 0, 1, gruen; P4 `v0.2.2-maintained.4`, ahead, identical, 1; P5 1, 2, Exit 0, 0; P6 10, 0, 0; P7 e2e pass am Kopf `948d3f0`; P8 `check` Exit 0 (2975 Tests). Mitgezogen: von 169 Prüfbefehlen ohne Netz fertiger Goals zu diesen Dateien ändert sich außer den Umfangsprüfungen fremder Branches nur kunden 15 (`Release:` der Anleitung gleich `docs/kunden/kartenweg-2026-11.md`), Frage an den Tech Lead auf dem Topic.
- 2026-11-28 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8, am Kopf `6b42ff4` mit `dev` (`0eb3818`) enthalten; Frage zu kunden 15 vom Tech Lead entschieden (Zeile `Abgelöst:` in `goals/kunden/ANNAHMEN.md`, Kartenweg unverändert), neue Prüfung `gleich` am Kopf und `verschieden` mit gepflanztem `Release: v0.2.2-maintained.4`. Prüfbefehle: P1 `SELFTEST OK`, 26, 0, Exit 0; P2 stimmig, 4, stimmig, 0, diff leer; P3 1, 0, 1, gruen am Tag `v0.2.2-maintained.4`; P4 `v0.2.2-maintained.4`, ahead, identical, 1; P5 1, 2, Exit 0, 0; P6 10, 0, 0; P7 1 (e2e pass am Kopf `6b42ff4`, Run 46090189494); P8 `check` Exit 0.
- 2026-11-28 Zyklus 3: Punkt 9 im Fork gebaut, Fix `e354ac9` (gegen jeden anderen Control Plane liest `topupForSandbox` `details.topup_tiers_usd` nicht und wählt wie Upstream), PR #5 nach grüner CI gemergt (`82ad4e8`), Tag und Release `v0.2.2-maintained.5` (`970d683`), Zeile in `goals/kunden/ANNAHMEN.md`; Anleitung, README und `MAINTAINED_RELEASE` bleiben auf `v0.2.2-maintained.4`, weil `test/inference-maintained-update.test.ts:119` (kunden 17, für mich unveränderlich) `0.2.2-maintained.4` fest als nicht ältere Kennung erwartet und mit `.5` rot wird, Frage an den Tech Lead auf dem Topic. Rot vorher: der neue Test „keeps the upstream sandbox choice for another control plane when the 402 names tiers“ am Fork-`main` `1e77f01` (expected amountUsd 25 to be null). Prüfbefehle: P9 (Netz) am Tag `.4` aus der Anleitung 0 und unstimmig, am Tag `.5` 1 und stimmig; P9c 1; Fork am Tag `.5` typecheck, build, 1699 Tests grün; P1 bis P6 wie Zyklus 2 (P6a 11); P5c mit `.5` hier 1 failed von 7, mit `.4` Exit 0.
- 2026-11-28 Zyklus 4: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9: Anleitung (Zeilen für `e354ac9` und `970d683`), README und `MAINTAINED_RELEASE` auf `v0.2.2-maintained.5`, die neuere Kennung in `test/inference-maintained-update.test.ts:119` folgt `MAINTAINED_RELEASE` (Entscheidung Tech Lead 7). Rot vorher: dieser Test mit `.5` und fester Kennung `.4` (1 failed von 7), nach der Änderung rot mit gepflanztem `n !== RELEASED` in `isOlderMaintained` (1 failed von 7), sonst Exit 0. Mitgezogen: 124 Prüfbefehle ohne Netz fertiger Goals zu diesen Dateien an `281f07e` und `07eec4f`, abweichend nur zwei Laufzeitangaben und zwei Umfangsprüfungen fremder Branches. Prüfbefehle: P1 `SELFTEST OK`, 26, 0, Exit 0; P2 stimmig, 4, stimmig, 0, diff leer; P3 1, 0, 1, gruen am Tag `.5`; P4 `v0.2.2-maintained.5`, ahead, identical, 1; P5 1, 2, Exit 0, 0; P6 12, 0, 0; P7 e2e pass am Kopf `07eec4f` (Run 46092820293); P8 `check` Exit 0; P9 1, stimmig, 1; kunden 15 abgelöst `gleich`.

## Blockers
