# Kunden Goal 12: Reicht Kunde 1 ein, und zahlt er danach wieder?

## Status
PAUSED

## Active Objective
Seit kunden 11 stellt der Dienst selbst dauerhaft einen offenen Hausauftrag, die 402 nennt ihn mit `open_bounties` und
`bounties_url`, und ein gültiger Bericht wird ohne Menschen als Credit gezahlt. Kunde 1, der größte zahlende fremde Automaton, hat kein
Geld für eine Aufladung (kunden 05) und las das Brett vom 13. bis 21.11.2026 alle zehn Minuten, ohne je einzureichen, weil nie ein
Auftrag dort stand (kunden 08). Nach diesem Goal steht in `docs/kunden/einreichen-2026-11.md` gemessen, was Kunde 1 in den 48 Stunden
nach dem Rollout von kunden 11 tat: gelesen, eingereicht, zugesprochen bekommen und mit dem Guthaben Inferenz bezahlt, als ein Wort
aus der Kette, dazu die gemeldeten Aufrufe aller Runtimes ohne Adresse. Ein gehäuft scheiternder Aufruf wird ein Vorschlag an
`fehler`, jedes andere Ergebnis als `zahlt wieder` ein Vorschlag für das Folge-Glied.
Leitzahl: fremde Zahlungen je Woche; eine Inferenz aus verdientem Guthaben zählt mit.
Widerlegt, wenn Kunde 1 in den 48 Stunden das Brett liest und nicht einreicht (`liest, reicht nicht ein`); dann fragt das Folge-Glied,
was sein Prompt am Brett nicht versteht.
MVP: Funktion, weil erst diese Messung zeigt, ob der Hausauftrag Kunde 1 wieder zum Zahlen bringt oder das nächste Glied woanders
ansetzen muss.

## Voraussetzungen
- kunden Goal 11 DONE
- frühestens 2026-11-25

## Kontext für den Maker
- Ziel in einem Satz: Wir wissen gemessen, ob Kunde 1 den Hausauftrag findet, einreicht, bezahlt wird und danach wieder denkt, und
  an welchem Schritt er sonst hängen bleibt, damit das nächste Glied genau dort ansetzt.
- Quelle: `ROADMAP.md`, Topic `kunden`, Glied 12; Vorgänger `goals/kunden/11-kunde-1-kann-arbeit-einreichen.md` (DONE, Merge
  `8cb5a0b`, PR #357, gemergt am 22.11.2026 um 08:33:44 UTC). Der Lauf von `deploy.yml` für diesen Merge (Lauf 45003389294) lief beim
  Schreiben noch.
- Warum frühestens 25.11.: Der Rollout von kunden 11 kam frühestens am 22.11.2026 gegen 08:40 UTC, das Fenster von 48 Stunden endet
  also frühestens am 24.11. gegen 08:40 UTC, und der Loop Master startet ein Goal mit `frühestens` um 00:00 UTC.
- Rollout: der Job `deploy` des ersten erfolgreichen Laufs von `deploy.yml` auf `dev`, dessen Commit `8cb5a0b` enthält und in dem der
  Job `deploy` lief (nicht nur `plan`), nur lesend über `gh run list -R matthiashippe/control-plane --workflow deploy.yml --branch dev`
  und `gh run view <id> -R matthiashippe/control-plane --json headSha,jobs`. Sein `completedAt` ist der Beginn des Fensters, das Ende
  liegt genau 48 Stunden später. Liegt das Ende beim Start des Goals noch in der Zukunft (der Rollout kam später, etwa nach einem
  roten Lauf), misst der Maker nicht und nennt das im Kommentar; vor dem Ende ist keine Messung gültig.
- Messung, nur lesend: `set -a; . ~/.config/control-plane/loop.env; set +a`, dann
  `bash ops/customer-work.sh --since <Rollout> --until <Rollout plus 48 Stunden>` (Werkzeug aus kunden 08 und 11, Kunde 1 wie dort aus
  `ops/customer-decline.sh` nummeriert, Wallet bleibt im Container). Die Ausgabe steht vollständig in einem Codeblock, davor die Zeile
  `$ bash ops/customer-work.sh …` mit genau den beiden Zeiten, wie in `docs/kunden/auftraege-2026-11.md`. Das Werkzeug ändert dieses
  Goal nicht.
- `docs/kunden/einreichen-2026-11.md`, Deutsch, je eine Zeile ab Spalte 0 außerhalb des Codeblocks:
  `Rollout kunden 11: <JJJJ-MM-TTTHH:MM:SSZ>, Lauf <id>, Commit <sha7>` (Zeit genau wie `completedAt` des Jobs `deploy`);
  `Gemessen: <JJJJ-MM-TTTHH:MM:SSZ>` (nach dem Ende des Fensters);
  der Codeblock mit genau einer Zeile `WORK since …`;
  `Kunde 1 in 48 Stunden: <r> Lesungen, <s> Einreichungen versucht, <w> Zusprüche, <i> Inferenzen danach` (Summen der Zeilen `DAY`
  für `board reads` und `submit calls`, aus `AWARDS` die Zusprüche und die Zeilen `inference` nach dem ersten Zuspruch);
  `Ergebnis: <Wort>, weil <Beleg>`, mit dem ersten zutreffenden Wort dieser Reihenfolge: `kein Hausauftrag` (die Zeile `HOUSE` nennt 0
  gestellte Hausaufträge), `liest nicht` (0 Lesungen), `liest, reicht nicht ein` (0 Einreichungen versucht), `reicht ein, ohne
  Zuspruch` (0 Zusprüche; der Beleg nennt die Zeilen `SUBMIT STATUS`), `Zuspruch, zahlt nicht` (0 Inferenzen danach), sonst
  `zahlt wieder`.
- Vorschlag für das Folge-Glied: Bei jedem Ergebnis außer `zahlt wieder` genau eine Zeile
  `Vorschlag: goals/_vorschlaege/kunden-kritik-<JJJJ-MM-TT>-<n>.md`, der Vorschlag im Format des Skills `loop-regeln` mit
  `Schwere: 4` (bei `kein Hausauftrag` `Schwere: 5`, weil dann kunden 11 in der Produktion nicht wirkt), `Goal: kunden 12` und einer
  Empfehlung für ein Glied mit der Leitzahl fremde Zahlungen je Woche, die genau den hängenden Schritt nennt. Bei
  `liest, reicht nicht ein` liest der Maker dazu den Weg der Runtime am Pin `d8f8168` vom Brett zum Einreichen (Klon wie in kunden 05,
  Fundstellen als `src/<pfad>.ts:<zeile>`) und schreibt in die Empfehlung, wo sein Prompt oder sein Code den Hausauftrag liegen lässt.
- Gemeldete Aufrufe: Die Zeilen `HOUSE REPORT <METHOD> <path> <status>: <n>` stehen im Codeblock wie ausgegeben (das Werkzeug ersetzt
  Wallets und IPv4-Adressen durch `<address>`). Gehäuft heißt Status 400 bis 599 und `n` mindestens 2. Je gehäufter Zeile genau eine
  Zeile `Fehler-Vorschlag: goals/_vorschlaege/fehler-kritik-<JJJJ-MM-TT>-<n>.md`, der Vorschlag mit `Schwere: 5`, `Goal: kunden 12`
  und den Angaben aus `LOOP.md`, Abschnitt Fehler echter Nutzer (Fenster in UTC statt Zeitpunkt, Methode und Pfad, Status, wie oft, der
  Befehl), ohne Adresse oder Namen des Kunden. Ein Befund je Datei. Der Maker prüft vorher im Zugriffslog (`ops/access-log.sh`), ob
  derselbe Pfad dort mit diesem Status steht, und schreibt das Ergebnis in den Beleg; ein Pfad, den wir nie angeboten haben, ist
  trotzdem ein Befund, weil die Runtime ihn ruft.
- `goals/kunden/ANNAHMEN.md`: Zeilen `- <Datum>, kunden 12: …`, mindestens zur Wahl des Rollout-Zeitpunkts und dazu, warum die Zeilen
  `inference` nach dem ersten Zuspruch als Inferenz aus verdientem Guthaben zählen (Saldo vorher, Startgutschrift, Aufladung über
  `/pay/` im Fenster, nur als Zahl oder ja und nein).
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein
  Build, kein Test auf dem Server, kein Auftrag, keine Einreichung, kein Zuspruch und kein Aufruf mit einem eigenen Schlüssel in der
  Produktion (`grantOnFirstUse` gäbe ihm eine Startgutschrift aus dem Pool).

## Done Condition
- [ ] Das Fenster beginnt beim Rollout von kunden 11 und endet 48 Stunden später, gemessen wird erst danach.
      MVP: Funktion, weil eine Messung vor dem Ende des Fensters ein Nein meldet, das nur zu früh war.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; r=$(sed -nE 's/^Rollout kunden 11: ([0-9T:-]+Z), .*/\1/p' "$d"); u=$(date -u -d "@$(( $(date -u -d "$r" +%s) + 172800 ))" +%Y-%m-%dT%H:%M:%SZ); g=$(sed -nE 's/^Gemessen: ([0-9T:-]+Z)$/\1/p' "$d"); [ -n "$r" ] && [ "$r" \> "2026-11-22T08:33:44Z" ] && [ "$g" \> "$u" ] && grep -qx "WORK since $r until $u: customer 1" "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `grep -cE "^Rollout kunden 11: [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z, Lauf [0-9]+, Commit [0-9a-f]{7,40}$" docs/kunden/einreichen-2026-11.md` muss 1 ausgeben.
      Prüfung (Netz): `d=docs/kunden/einreichen-2026-11.md; set -- $(sed -nE 's/^Rollout kunden 11: ([0-9T:-]+Z), Lauf ([0-9]+), Commit ([0-9a-f]+)$/\1 \2 \3/p' "$d"); git merge-base --is-ancestor 8cb5a0b "$3" && [ "$(gh run view "$2" -R matthiashippe/control-plane --json headSha -q .headSha | cut -c1-${#3})" = "$3" ] && [ "$(gh run view "$2" -R matthiashippe/control-plane --json jobs -q '.jobs[] | select(.name=="deploy" and .conclusion=="success") | .completedAt')" = "$1" ] && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
- [ ] Was Kunde 1 in diesen 48 Stunden tat, steht gemessen in `docs/kunden/einreichen-2026-11.md`, mit dem Ergebnis aus der Kette
      und, wenn er nicht wieder zahlt, dem Vorschlag für das Folge-Glied.
      MVP: Funktion, weil das Ergebnis entscheidet, ob das nächste Glied den Auftrag, den Zuspruch oder den Prompt der Runtime baut.
      Prüfung: `cat docs/kunden/einreichen-2026-11.md | grep -cE "^(WORK since .*: customer 1|MATCH: ips [0-9]+, .*|HOUSE: [0-9]+ house jobs posted, [0-9]+ house submissions, [0-9]+ house awards \([0-9]+ to the customer\)|AWARDS: [0-9]+ awarded to the customer, [0-9]+ inference rows after the first award)$"` muss 4 ausgeben.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; awk '/^DAY [0-9-]+: /{r+=$3; s+=$6} /^AWARDS: /{w=$2; i=$7} END{printf "Kunde 1 in 48 Stunden: %d Lesungen, %d Einreichungen versucht, %d Zusprüche, %d Inferenzen danach\n", r, s, w, i}' "$d" | grep -qxFf - "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; e=$(awk '/^HOUSE: /{j=$2} /^DAY [0-9-]+: /{r+=$3; s+=$6} /^AWARDS: /{w=$2; i=$7} END{if(j==0)print "kein Hausauftrag"; else if(r==0)print "liest nicht"; else if(s==0)print "liest, reicht nicht ein"; else if(w==0)print "reicht ein, ohne Zuspruch"; else if(i==0)print "Zuspruch, zahlt nicht"; else print "zahlt wieder"}' "$d"); [ "$(grep -cE "^Ergebnis: " "$d")" = 1 ] && grep -qE "^Ergebnis: $e, weil " "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; if grep -q "^Ergebnis: zahlt wieder, weil " "$d"; then echo entfaellt; else s=4; grep -q "^Ergebnis: kein Hausauftrag, weil " "$d" && s=5; p=$(sed -nE 's/^Vorschlag: (goals\/_vorschlaege\/kunden-kritik-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+\.md)$/\1/p' "$d" | head -1); [ -n "$p" ] && [ -f "$p" ] && head -1 "$p" | grep -qx "Schwere: $s" && grep -qx "Goal: kunden 12" "$p" && echo belegt || echo fehlt; fi` muss `belegt` oder `entfaellt` ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; d=docs/kunden/einreichen-2026-11.md; r=$(sed -nE 's/^Rollout kunden 11: ([0-9T:-]+Z), .*/\1/p' "$d"); u=$(date -u -d "@$(( $(date -u -d "$r" +%s) + 172800 ))" +%Y-%m-%dT%H:%M:%SZ); diff <(bash ops/customer-work.sh --since "$r" --until "$u" 2>/dev/null) <(awk '/^WORK since/{p=1} p&&/^[^A-Z]/{exit} p' "$d")` muss nichts ausgeben.
- [ ] Jeder gehäuft scheiternde gemeldete Aufruf ist ein Vorschlag an `fehler`.
      MVP: Funktion, weil ein Aufruf, der bei jeder Runtime scheitert, jeden fremden Kunden trifft und nur diese Berichte ihn zeigen.
      Prüfung: `d=docs/kunden/einreichen-2026-11.md; n=$(grep -cE "^HOUSE REPORT [A-Z]+ [^ ]+ [45][0-9]{2}: ([2-9]|[1-9][0-9]+)$" "$d"); v=$(sed -nE 's/^Fehler-Vorschlag: (goals\/_vorschlaege\/fehler-kritik-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+\.md)$/\1/p' "$d" | sort -u | while read -r p; do [ -f "$p" ] && head -1 "$p" | grep -qx "Schwere: 5" && grep -qx "Goal: kunden 12" "$p" && echo "$p"; done | wc -l); [ "$n" -eq "$v" ] && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
- [ ] Nichts im Repo nennt eine Adresse, eine Wallet oder einen Betrag je Kunde, das Werkzeug ist unverändert grün, und die Annahmen
      stehen fest.
      Prüfung: `cat docs/kunden/einreichen-2026-11.md goals/kunden/ANNAHMEN.md $(grep -ohE "goals/_vorschlaege/(kunden|fehler)-kritik-[0-9-]+\.md" docs/kunden/einreichen-2026-11.md | sort -u) | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -cE "[0-9]+([.,][0-9]+)? ?(USD|USDC|cents)\b" docs/kunden/einreichen-2026-11.md` muss 0 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/customer-work.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src ops test | wc -l` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 12: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Kein Aufruf in der Produktion, der etwas anlegt oder bucht; gelesen wird nur über `ops/customer-work.sh`, `ops/access-log.sh`
      und `gh` gegen GitHub.
- [ ] Die Ausgabe im Codeblock ist genau die des Werkzeugs, ungekürzt und unverändert.
- [ ] Dokument, Goal-Datei, Vorschläge und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`
- `src/**`, `ops/**`, `test/**`: unverändert; dieses Goal misst und baut nichts
- `docs/kunden/auftraege-2026-11.md`, `docs/kunden/aufladung-2026-11.md`, `docs/kunden/rueckgang-2026-11.md`, `ROADMAP.md`,
  `docs/kette.md`, `docs/richtung/**` und alle bestehenden Vorschläge: nur lesen
- jedes Schreiben in der Produktion, jeder Auftrag, jede Einreichung und jeder Zuspruch dort, jeder Kontakt zum Betreiber eines
  Automatons (`public_post`, `third_party_mail`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
Pause: Tech Lead 23.11.2026 (PRO-28123), abgelöst durch kunden 14: Das Fenster dieses Goals hängt am Rollout von kunden 11, und in ihm endete jede Inferenz von Kunde 1 mit 402, also misst es nur den bekannten Ausfall. Erst kunden 13 gibt ihm Guthaben für die Schritte bis zum Bericht, kunden 14 misst danach.
