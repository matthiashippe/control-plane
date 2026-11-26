# Kunden Goal 14: Denkt Kunde 1 mit dem Schrittguthaben, reicht er ein, und zahlt er danach wieder?

## Status
ACTIVE

## Active Objective
Seit kunden 13 bekommt eine fremde Runtime, die schon einmal bei uns gedacht hat und deren Saldo die nächste Inferenz nicht deckt,
einmal je Adresse ein Schrittguthaben von 10 Cent, solange ein Hausauftrag offen ist. Damit soll Kunde 1, der größte zahlende fremde
Automaton, dessen Inferenzen seit dem 13.11.2026 alle mit 402 endeten, wieder eine Antwort seines Modells bekommen, den Hausauftrag
bearbeiten, den Bericht einreichen und mit dem Zuspruch weiter denken. Nach diesem Goal steht in `docs/kunden/einreichen-2026-11.md`
gemessen, was Kunde 1 in den 48 Stunden nach dem Rollout von kunden 13 tat: Schrittguthaben bekommen, danach gedacht, gelesen,
eingereicht, zugesprochen bekommen und mit dem verdienten Guthaben Inferenz bezahlt, als ein Wort aus der Kette. Dazu stehen dort je
Tag die Zusprüche an Adressen ohne frühere Zeile `inference` und die gemeldeten Aufrufe aller Runtimes ohne Adresse. Jedes Ergebnis
außer `zahlt wieder` wird ein Vorschlag für das Folge-Glied, mehr als ein Zuspruch an einem Tag an Adressen ohne frühere Inferenz
ein Vorschlag an `kunden`, ein gehäuft scheiternder gemeldeter Aufruf ein Vorschlag an `fehler`.
Leitzahl: fremde Zahlungen je Woche; eine Inferenz aus verdientem Guthaben zählt mit.
Widerlegt, wenn Kunde 1 mit dem Schrittguthaben denkt und trotzdem nicht einreicht (`denkt, reicht nicht ein`); dann fragt das
Folge-Glied, was sein Prompt am Brett nicht versteht.
Übernimmt goals/_vorschlaege/kunden-kritik-2026-11-22-2.md und goals/_vorschlaege/kunden-kritik-2026-11-23-1.md, dazu
goals/_vorschlaege/kunden-nacharbeit-2026-11-23-1.md aus der Watch List, weil dieses Goal `ops/db-report.cjs` ändert.
MVP: Funktion, weil erst diese Messung zeigt, ob der Hausauftrag mit Schrittguthaben Kunde 1 wieder zum Zahlen bringt oder das nächste
Glied woanders ansetzen muss.

## Voraussetzungen
- kunden Goal 13 DONE
- frühestens 2026-11-26

## Kontext für den Maker
- Ziel in einem Satz: Wir wissen gemessen, ob Kunde 1 mit dem Schrittguthaben wieder denkt, den Hausauftrag einreicht, bezahlt wird
  und danach wieder Inferenz kauft, und an welchem Schritt er sonst hängen bleibt, damit das nächste Glied genau dort ansetzt.
- Quelle: `ROADMAP.md`, Topic `kunden`, Glied 14; Vorgänger `goals/kunden/13-kunde-1-hat-guthaben-fuer-die-schritte-bis-zum-ersten-bericht.md`
  (DONE, Merge `354a326`, PR #401, gemergt am 23.11.2026 um 11:36:41 UTC). Der Lauf 45166756868 von `deploy.yml` für diesen Merge
  hatte den Job `deploy` beim Schreiben am 23.11.2026 um 11:52:30 UTC erfolgreich beendet; das Fenster endet damit am 25.11.2026 um
  11:52:30 UTC, deshalb frühestens 26.11. (der Loop Master startet ein Goal mit `frühestens` um 00:00 UTC). kunden 12 steht auf
  `PAUSED` und ist durch dieses Goal abgelöst (Tech Lead 23.11.2026, PRO-28123); es schreibt in dieselbe Datei
  `docs/kunden/einreichen-2026-11.md`, die es noch nicht gibt.
- Rollout: der Job `deploy` des ersten erfolgreichen Laufs von `deploy.yml` auf `dev`, dessen Commit `354a326` enthält und in dem der
  Job `deploy` lief (nicht nur `plan`), nur lesend über `gh run list -R matthiashippe/control-plane --workflow deploy.yml --branch dev`
  und `gh run view <id> -R matthiashippe/control-plane --json headSha,jobs`. Sein `completedAt` ist der Beginn des Fensters, das Ende
  liegt genau 48 Stunden später. Liegt das Ende beim Start noch in der Zukunft, misst der Maker nicht und nennt das im Kommentar; vor
  dem Ende ist keine Messung gültig.
- Neue Zeile im Werkzeug, vor der Messung gebaut: `ops/customer-work.sh` und `CP_REPORT=customer-work` in `ops/db-report.cjs` geben
  direkt nach der Zeile `HOUSE STEP:` die Zeile `HOUSE STEP USE: <i> inference rows of the customer after his step credit` aus. `<i>`
  zählt die Ledger-Zeilen `inference` des Kunden nach seiner Zeile `house_step` und vor `--until`; ohne Schrittguthaben im Fenster ist
  es 0. Eine Zeile `inference` schreibt `src/inference/proxy.ts` nur nach einer abgerechneten Antwort, also heißt `<i>` größer 0: seine
  nächste Inferenz endete mit 200. Im Objekt `house` von `ops/db-report.cjs` heißt das Feld `steps_customer_inference`. Alle bisherigen
  Zeilen behalten ihr Format, `AWARDS` bleibt die letzte Zeile. Der Selbsttest pflanzt ein Schrittguthaben an den Kunden mit Zeilen
  `inference` davor, danach und nach `--until`, dazu Zeilen `inference` einer anderen Adresse nach dem Schrittguthaben, und belegt mit
  Zeilen `ok … step use` beide Richtungen: gezählt werden nur die Zeilen des Kunden danach und vor `--until`. Ohne Adresse in der
  Ausgabe. Das Werkzeug läuft in der Produktion aus dem Checkout (`ops/db-report.cjs` wird per `docker exec … node -` in den Container
  gegeben), braucht also keinen Rollout.
- Mitgenommen, weil dieselbe Datei (kunden-nacharbeit-2026-11-23-1): Ein neuer Test `test/house-report-parity.test.ts` legt dieselben
  Hausberichte an beide Regeln, `checkHouseReport` aus `src/bounties/house.ts` und die Prüfung in `ops/db-report.cjs`, und verlangt
  dasselbe Urteil: gültig an den Grenzen (`HOUSE_CALLS_MAX` Aufrufe, Pfad mit `HOUSE_PATH_MAX` Zeichen, jede Methode aus der Liste),
  ungültig einen darüber und mit einer fremden Methode. Testname mit `db-report counts the same house reports as the service`. Die
  Prüfung in `ops/db-report.cjs` behält ihre Bedingung `calls.length > 20`, an der Punkt 2 die Gegenprobe macht. Den Dienst ändert
  das nicht.
- Messung, nur lesend: `set -a; . ~/.config/control-plane/loop.env; set +a`, dann
  `bash ops/customer-work.sh --since <Rollout> --until <Rollout plus 48 Stunden>` (Kunde 1 wie in kunden 08 bis 13 aus
  `ops/customer-decline.sh` nummeriert ab `--numbered-from` 2026-11-05, Wallet bleibt im Container). Die Ausgabe steht vollständig in
  einem Codeblock, davor die Zeile `$ bash ops/customer-work.sh …` mit genau den beiden Zeiten, wie in `docs/kunden/auftraege-2026-11.md`.
- `docs/kunden/einreichen-2026-11.md`, Deutsch, je eine Zeile ab Spalte 0 außerhalb des Codeblocks:
  `Rollout kunden 13: <JJJJ-MM-TTTHH:MM:SSZ>, Lauf <id>, Commit <sha7>` (Zeit genau wie `completedAt` des Jobs `deploy`);
  `Gemessen: <JJJJ-MM-TTTHH:MM:SSZ>` (nach dem Ende des Fensters);
  der Codeblock mit genau einer Zeile `WORK since …`;
  `Kunde 1 in 48 Stunden: <g> Schrittguthaben, <t> Inferenzen danach, <r> Lesungen, <s> Einreichungen versucht, <w> Zusprüche, <i> Inferenzen aus verdientem Guthaben`
  (`<g>` aus `HOUSE STEP` die Zahl an den Kunden, `<t>` aus `HOUSE STEP USE`, `<r>` und `<s>` Summen der Zeilen `DAY` für
  `board reads` und `submit calls`, `<w>` und `<i>` aus `AWARDS`);
  `Ergebnis: <Wort>, weil <Beleg>`, mit dem ersten zutreffenden Wort dieser Reihenfolge: `kein Hausauftrag` (die Zeile `HOUSE` nennt 0
  gestellte Hausaufträge), `kein Schrittguthaben` (`<g>` ist 0), `denkt nicht` (`<t>` ist 0), `denkt, reicht nicht ein` (`<s>` ist 0),
  `reicht ein, ohne Zuspruch` (`<w>` ist 0; der Beleg nennt die Zeilen `SUBMIT STATUS`), `Zuspruch, zahlt nicht` (`<i>` ist 0), sonst
  `zahlt wieder`.
- Vorschlag für das Folge-Glied: Bei jedem Ergebnis außer `zahlt wieder` genau eine Zeile
  `Vorschlag: goals/_vorschlaege/kunden-kritik-<JJJJ-MM-TT>-<n>.md`, der Vorschlag im Format des Skills `loop-regeln` mit
  `Schwere: 4`, `Goal: kunden 14` und einer Empfehlung für ein Glied mit der Leitzahl
  fremde Zahlungen je Woche, die genau den hängenden Schritt nennt. Bei `kein Hausauftrag` `Schwere: 5`, weil dann kunden 11 in der
  Produktion nicht wirkt. Bei `kein Schrittguthaben` (kunden-kritik-2026-11-23-1): Das Schrittguthaben wird nur gebucht, wenn Saldo
  und 10 Cent die Reservierung des Aufrufs decken. Der Maker liest im Klon der Runtime am Pin `d8f8168` (wie in kunden 05), welches
  `max_tokens` sie bei der Inferenz schickt, nimmt das Modell der letzten Zeilen `inference` von Kunde 1 (Zeilen `DAY 1 …` von
  `bash ops/customer-decline.sh --since 2026-11-05T00:00:00Z --until <Ende des Fensters>`, `models`) und rechnet mit `costMc` aus
  `src/inference/proxy.ts` die Reservierung ohne Prompt in Cent; der Vorschlag nennt `max_tokens`, die Fundstelle als
  `src/<pfad>.ts:<zeile> am Pin d8f8168` und ob die Reservierung schon ohne Prompt über 10 Cent liegt. Bei `denkt, reicht nicht ein`
  liest der Maker im selben Klon den Weg der Runtime vom Brett zum Einreichen und schreibt in die Empfehlung mit Fundstellen
  `src/<pfad>.ts:<zeile> am Pin d8f8168`, wo ihr Prompt oder ihr Code den Hausauftrag liegen lässt.
- Zusprüche ohne frühere Inferenz (kunden-kritik-2026-11-22-2): Nennt eine Zeile `HOUSE DAY` mehr als einen Zuspruch an Adressen ohne
  frühere Inferenz, steht genau eine Zeile `Zuspruch-Vorschlag: goals/_vorschlaege/kunden-kritik-<JJJJ-MM-TT>-<n>.md` im Dokument,
  ein anderer Vorschlag als der für das Folge-Glied, mit `Schwere: 4`, `Goal: kunden 14` und der Empfehlung, den Zuspruch des
  Hausauftrags an eine frühere Zeile `inference` der Adresse zu binden, wie kunden 13 es für das Schrittguthaben tut. Sonst steht keine
  solche Zeile dort.
- Gemeldete Aufrufe: Die Zeilen `HOUSE REPORT <METHOD> <path> <status>: <n>` stehen im Codeblock wie ausgegeben (das Werkzeug ersetzt
  Wallets und IPv4-Adressen durch `<address>`). Gehäuft heißt Status 400 bis 599 und `n` mindestens 2. Je gehäufter Zeile genau eine
  Zeile `Fehler-Vorschlag: goals/_vorschlaege/fehler-kritik-<JJJJ-MM-TT>-<n>.md`, der Vorschlag mit `Schwere: 5`, `Goal: kunden 14`
  und den Angaben aus `LOOP.md`, Abschnitt Fehler echter Nutzer (Fenster in UTC statt Zeitpunkt, Methode und Pfad, Status, wie oft, der
  Befehl), ohne Adresse oder Namen des Kunden. Ein Befund je Datei. Der Maker prüft vorher im Zugriffslog (`ops/access-log.sh`), ob
  derselbe Pfad dort mit diesem Status steht, und schreibt das Ergebnis in den Beleg.
- `goals/kunden/ANNAHMEN.md`: Zeilen `- <Datum>, kunden 14: …`, mindestens zur Wahl des Rollout-Zeitpunkts und dazu, warum eine Zeile
  `inference` nach dem Schrittguthaben als Antwort mit 200 zählt.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein
  Build, kein Test auf dem Server, kein Auftrag, keine Einreichung, kein Zuspruch und kein Aufruf mit einem eigenen Schlüssel in der
  Produktion (`grantOnFirstUse` gäbe ihm eine Startgutschrift aus dem Pool).

## Done Condition
- [x] `ops/customer-work.sh` zählt die Inferenzen des Kunden nach seinem Schrittguthaben, ohne Adresse in der Ausgabe, in beide
      Richtungen bewiesen, und die bisherigen Zeilen bleiben, wie sie sind.
      MVP: Funktion, weil nur diese Zeile zeigt, ob die nächste Inferenz von Kunde 1 nach dem Schrittguthaben mit 200 endete.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/customer-work.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/customer-work.sh --selftest | grep -cE "^ok .*step use"` muss mindestens 2 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/customer-work.sh --selftest | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `cat ops/customer-work.sh ops/db-report.cjs | grep -cE "HOUSE STEP USE: |steps_customer_inference"` muss mindestens 2 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- ops/customer-work.sh | grep -cE '^-.*print\(f"'` muss 0 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/customer-work.test.ts` muss Exit-Code 0 haben.
- [x] `ops/db-report.cjs` zählt dieselben Hausberichte als gültig wie der Dienst, belegt an den Grenzen.
      MVP: Funktion, weil die gemeldeten Aufrufe, die dieses Goal liest, sonst still von dem abweichen, was der Dienst annimmt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/house-report-parity.test.ts -t "db-report counts the same house reports as the service"` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); cp ops/db-report.cjs $T/r; sed -i 's/calls.length > 20/calls.length > 21/' ops/db-report.cjs; PATH=/usr/bin:$PATH pnpm -s vitest run test/house-report-parity.test.ts > /dev/null 2>&1 && r=gruen || r=rot; cp $T/r ops/db-report.cjs; rm -rf $T; echo $r` muss genau `rot` ausgeben.
- [x] Das Fenster beginnt beim Rollout von kunden 13 und endet 48 Stunden später, gemessen wird erst danach.
      MVP: Funktion, weil eine Messung vor dem Ende des Fensters ein Nein meldet, das nur zu früh war.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; r=$(sed -nE 's/^Rollout kunden 13: ([0-9T:-]+Z), .*/\1/p' "$d"); u=$(date -u -d "@$(( $(date -u -d "$r" +%s) + 172800 ))" +%Y-%m-%dT%H:%M:%SZ); g=$(sed -nE 's/^Gemessen: ([0-9T:-]+Z)$/\1/p' "$d"); [ -n "$r" ] && [ "$r" \> "2026-11-23T11:36:41Z" ] && [ "$g" \> "$u" ] && grep -qx "WORK since $r until $u: customer 1" "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `grep -cE "^Rollout kunden 13: [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z, Lauf [0-9]+, Commit [0-9a-f]{7,40}$" docs/kunden/einreichen-2026-11.md` muss 1 ausgeben.
      Prüfung (Netz): `d=docs/kunden/einreichen-2026-11.md; set -- $(sed -nE 's/^Rollout kunden 13: ([0-9T:-]+Z), Lauf ([0-9]+), Commit ([0-9a-f]+)$/\1 \2 \3/p' "$d"); git merge-base --is-ancestor 354a326 "$3" && [ "$(gh run view "$2" -R matthiashippe/control-plane --json headSha -q .headSha | cut -c1-${#3})" = "$3" ] && [ "$(gh run view "$2" -R matthiashippe/control-plane --json jobs -q '.jobs[] | select(.name=="deploy" and .conclusion=="success") | .completedAt')" = "$1" ] && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
- [x] Was Kunde 1 in diesen 48 Stunden tat, steht gemessen in `docs/kunden/einreichen-2026-11.md`, mit dem Ergebnis aus der Kette
      und, wenn er nicht wieder zahlt, dem Vorschlag für das Folge-Glied.
      MVP: Funktion, weil das Ergebnis entscheidet, ob das nächste Glied das Schrittguthaben, den Prompt der Runtime oder den Zuspruch
      angeht.
      Prüfung: `cat docs/kunden/einreichen-2026-11.md | grep -cE "^(WORK since .*: customer 1|HOUSE: [0-9]+ house jobs posted, [0-9]+ house submissions, [0-9]+ house awards \([0-9]+ to the customer\)|HOUSE STEP: [0-9]+ step credits \([0-9]+ to the customer\)|HOUSE STEP USE: [0-9]+ inference rows of the customer after his step credit|AWARDS: [0-9]+ awarded to the customer, [0-9]+ inference rows after the first award)$"` muss 5 ausgeben.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; awk '/^HOUSE STEP: /{g=substr($6,2)+0} /^HOUSE STEP USE: /{t=$4} /^DAY [0-9-]+: /{r+=$3; s+=$6} /^AWARDS: /{w=$2; i=$7} END{printf "Kunde 1 in 48 Stunden: %d Schrittguthaben, %d Inferenzen danach, %d Lesungen, %d Einreichungen versucht, %d Zusprüche, %d Inferenzen aus verdientem Guthaben\n", g, t, r, s, w, i}' "$d" | grep -qxFf - "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; e=$(awk '/^HOUSE: /{j=$2} /^HOUSE STEP: /{g=substr($6,2)+0} /^HOUSE STEP USE: /{t=$4} /^DAY [0-9-]+: /{r+=$3; s+=$6} /^AWARDS: /{w=$2; i=$7} END{if(j==0)print "kein Hausauftrag"; else if(g==0)print "kein Schrittguthaben"; else if(t==0)print "denkt nicht"; else if(s==0)print "denkt, reicht nicht ein"; else if(w==0)print "reicht ein, ohne Zuspruch"; else if(i==0)print "Zuspruch, zahlt nicht"; else print "zahlt wieder"}' "$d"); [ "$(grep -cE "^Ergebnis: " "$d")" = 1 ] && grep -qE "^Ergebnis: $e, weil " "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; if grep -q "^Ergebnis: zahlt wieder, weil " "$d"; then echo entfaellt; else s=4; grep -q "^Ergebnis: kein Hausauftrag, weil " "$d" && s=5; p=$(sed -nE 's/^Vorschlag: (goals\/_vorschlaege\/kunden-kritik-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+\.md)$/\1/p' "$d" | head -1); [ -n "$p" ] && [ -f "$p" ] && head -1 "$p" | grep -qx "Schwere: $s" && grep -qx "Goal: kunden 14" "$p" && echo belegt || echo fehlt; fi` muss `belegt` oder `entfaellt` ausgeben.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; if grep -qE "^Ergebnis: (kein Schrittguthaben|denkt, reicht nicht ein), weil " "$d"; then p=$(sed -nE 's/^Vorschlag: (goals\/_vorschlaege\/kunden-kritik-[0-9-]+\.md)$/\1/p' "$d" | head -1); [ -f "$p" ] && grep -qE "src/[^ ]+\.ts:[0-9]+ am Pin d8f8168" "$p" && { grep -q "^Ergebnis: denkt, reicht nicht ein, weil " "$d" || grep -q "max_tokens" "$p"; } && echo belegt || echo fehlt; else echo entfaellt; fi` muss `belegt` oder `entfaellt` ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; d=docs/kunden/einreichen-2026-11.md; r=$(sed -nE 's/^Rollout kunden 13: ([0-9T:-]+Z), .*/\1/p' "$d"); u=$(date -u -d "@$(( $(date -u -d "$r" +%s) + 172800 ))" +%Y-%m-%dT%H:%M:%SZ); diff <(bash ops/customer-work.sh --since "$r" --until "$u" 2>/dev/null) <(awk '/^WORK since/{p=1} p&&/^[^A-Z]/{exit} p' "$d")` muss nichts ausgeben.
- [x] Nehmen an einem Tag mehr als ein Zuspruch Adressen ohne frühere Inferenz, ist das ein Vorschlag an `kunden`.
      MVP: Funktion, weil frische Wallets sonst die Zusprüche nehmen, die Kunde 1 wieder zum Zahlen bringen sollen.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; m=$(awk '/^HOUSE DAY [0-9-]+: /{if($7>1)m++} END{print m+0}' "$d"); n=$(grep -cE "^Zuspruch-Vorschlag: " "$d"); p=$(sed -nE 's/^Zuspruch-Vorschlag: (goals\/_vorschlaege\/kunden-kritik-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+\.md)$/\1/p' "$d"); v=$(sed -nE 's/^Vorschlag: (.*)$/\1/p' "$d"); [ "$(grep -cE "^HOUSE DAY [0-9-]+: " "$d")" -ge 2 ] && { { [ "$m" -eq 0 ] && [ "$n" -eq 0 ]; } || { [ "$m" -gt 0 ] && [ "$n" -eq 1 ] && [ -f "$p" ] && [ "$p" != "$v" ] && head -1 "$p" | grep -qx "Schwere: 4" && grep -qx "Goal: kunden 14" "$p"; }; } && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
- [x] Jeder gehäuft scheiternde gemeldete Aufruf ist ein Vorschlag an `fehler`.
      MVP: Funktion, weil ein Aufruf, der bei jeder Runtime scheitert, jeden fremden Kunden trifft und nur diese Berichte ihn zeigen.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; n=$(grep -cE "^HOUSE REPORT [A-Z]+ [^ ]+ [45][0-9]{2}: ([2-9]|[1-9][0-9]+)$" "$d"); v=$(sed -nE 's/^Fehler-Vorschlag: (goals\/_vorschlaege\/fehler-kritik-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+\.md)$/\1/p' "$d" | sort -u | while read -r p; do [ -f "$p" ] && head -1 "$p" | grep -qx "Schwere: 5" && grep -qx "Goal: kunden 14" "$p" && echo "$p"; done | wc -l); [ "$n" -eq "$v" ] && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
- [x] Nichts im Repo nennt eine Adresse, eine Wallet oder einen Betrag je Kunde, der Dienst ist unverändert, und die Annahmen stehen
      fest.
      Prüfung: `cat docs/kunden/einreichen-2026-11.md goals/kunden/ANNAHMEN.md $(grep -ohE "goals/_vorschlaege/(kunden|fehler)-kritik-[0-9-]+\.md" docs/kunden/einreichen-2026-11.md | sort -u) | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -cE "[0-9]+([.,][0-9]+)? ?(USD|USDC|cents)\b" docs/kunden/einreichen-2026-11.md` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src ops test | grep -cvxE "ops/customer-work.sh|ops/db-report.cjs|test/customer-work.test.ts|test/house-report-parity.test.ts"` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 14: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] Kein Vorschlag dieses Goals nennt einen Saldo oder ein Guthaben von Kunde 1 als Betrag, auch nicht in Cent (Kritik).
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; cat "$d" $(grep -ohE "goals/_vorschlaege/(kunden|fehler)-kritik-[0-9-]+\.md" "$d" | sort -u) | grep -ciE "(Saldo|Guthaben)[^.;,]* (bei|von|auf) (rund |etwa |knapp |ca\. )?[0-9]+([.,][0-9]+)? ?(Cent|USD|USDC|cents)"` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Kein Aufruf in der Produktion, der etwas anlegt oder bucht; gelesen wird nur über `ops/customer-work.sh`,
      `ops/customer-decline.sh`, `ops/access-log.sh` und `gh` gegen GitHub.
- [ ] Die Ausgabe im Codeblock ist genau die des Werkzeugs, ungekürzt und unverändert.
- [ ] Jeder neue Test und jede neue Selbsttestzeile war vor der Änderung rot; die Zeile im Progress Log nennt, womit.
- [ ] Code, Kommentare und Testnamen Englisch, Dokument, Goal-Datei, Vorschläge und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`
- `src/**`: unverändert; dieses Goal misst und ändert den Dienst nicht
- `ops/**` außer `ops/customer-work.sh` und `ops/db-report.cjs`: unverändert; in `ops/db-report.cjs` nur der Zweig `customer-work`
- `test/**` außer `test/customer-work.test.ts` und dem neuen `test/house-report-parity.test.ts`: unverändert
- `docs/kunden/auftraege-2026-11.md`, `docs/kunden/aufladung-2026-11.md`, `docs/kunden/rueckgang-2026-11.md`, `ROADMAP.md`,
  `docs/kette.md`, `docs/richtung/**`, `goals/kunden/12-reicht-kunde-1-ein-und-zahlt-er-danach-wieder.md` und alle bestehenden
  Vorschläge: nur lesen
- jedes Schreiben in der Produktion, jeder Auftrag, jede Einreichung und jeder Zuspruch dort, jeder Kontakt zum Betreiber eines
  Automatons (`public_post`, `third_party_mail`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-26 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7, 8 gebaut (Zeile `HOUSE STEP USE` und Feld `steps_customer_inference`, Test `test/house-report-parity.test.ts`, Messung des Fensters 2026-11-23T11:52:30Z bis 2026-11-25T11:52:30Z in `docs/kunden/einreichen-2026-11.md`, Ergebnis `kein Hausauftrag`, Vorschlag kunden-kritik-2026-11-26-1 mit Schwere 5, drei Annahmen); rot vorher: die fünf neuen Selbsttestzeilen `step use` ohne Code `FAIL` (`SELFTEST FAILED`), die drei neuen Fälschungstests in `test/customer-work.test.ts` belegen je eine Richtung, der Paritätstest rot mit `calls.length > 21`, `c.path.length > 201`, `HEAD` in der Methodenliste und `c.status > 600`. Befund ab dem Merge gemessen: Schrittguthaben an Kunde 1 vor `completedAt`, 10 Antworten danach, keine Einreichung. Prüfbefehle: Punkt 1 `SELFTEST OK …`, 5, 0, 9, 0, Exit 0; Punkt 2 Exit 0, `rot`; Punkt 3 `stimmig`, 1, `stimmig`; Punkt 4 5, `stimmig`, `stimmig`, `belegt`, `entfaellt`, kein Diff; Punkt 5 `stimmig`; Punkt 6 `stimmig`; Punkt 7 0, 0, 0, 3; Punkt 8 `check` Exit 0 (2895 passed), `e2e` folgt am PR.
- 2026-11-26 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8, nach dem Merge von `origin/dev` (4811f63, nur die Goal-Datei kanal 08) am Kopf a5497f4 jeden Prüfbefehl erneut gefahren, ohne Codeänderung. Prüfbefehle: Punkt 1 `SELFTEST OK …`, 5, 0, 9, 0, Exit 0; Punkt 2 Exit 0, `rot`; Punkt 3 `stimmig`, 1, `stimmig`; Punkt 4 5, `stimmig`, `stimmig`, `belegt`, `entfaellt`, kein Diff gegen die Produktion; Punkt 5 `stimmig`; Punkt 6 `stimmig`; Punkt 7 0, 0, 0, 3; Punkt 8 `check` Exit 0 (2895 passed); Job `e2e` am Kopf siehe PR #451.

## Blockers
