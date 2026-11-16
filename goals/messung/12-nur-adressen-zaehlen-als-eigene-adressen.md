# Messung Goal 12: Nur Adressen zählen als eigene Adressen

## Status
PLANNED

## Active Objective
`ops/own-ips.sh` nimmt am Kopf von `dev` (ebe2dd3) das erste Feld jeder Zeile der Liste als eigene Adresse, die nicht in Spalte 0
mit `#` beginnt (`_own_ips_listed`, Zeile 70, `grep -v '^#' "$1" | awk 'NF {print $1}'`), und aus der Merkdatei das erste Feld
jeder nicht leeren Zeile (`_own_ips_seen`, Zeile 75). Eine eingerückte Kommentarzeile `  # old` liefert `#` als eigene Adresse,
eine Kopfzeile `ip first_seen note` liefert `ip`. Eine Liste, die nur noch aus solchen Zeilen besteht, gilt deshalb nicht als leer:
`own_ips_offline` endet mit 0 statt 2, `own_ips` nennt `#` und `ip`, und die Vorprüfungen in `ops/timeout-quote.sh:68`
(`awk '!/^#/ && NF …'`), `ops/keyless-mints.sh:190` (`grep -v '^#' "$CP_OWN_IPS_FILE" …`) und `ops/conway-arrivals.sh:34`
(`grep -v '^#' "$file" …`) lassen das Werkzeug weiterzählen, mit der live Adresse und der Merkdatei an Stelle der Liste. Dazu prüft
der Wächter `test/own-ips-readers.test.ts` je Zeile (`readsListFileDirectly`, Zeile 25 und 26), ob `CP_OWN_IPS_FILE` und ein
Leser zusammen stehen; ein Werkzeug, das den Pfad erst einer Variable gibt (`ops/conway-arrivals.sh:26`,
`file="${CP_OWN_IPS:-$CP_OWN_IPS_FILE}"`, und acht Zeilen später `grep -v '^#' "$file"`), liest die Liste an `own_ips` vorbei, und
der Wächter bleibt grün.
Nach diesem Goal geben `_own_ips_listed` und `_own_ips_seen` nur ein erstes Feld weiter, das eine IPv4- oder IPv6-Adresse ist; die
Vorprüfungen in `ops/timeout-quote.sh`, `ops/keyless-mints.sh` und `ops/conway-arrivals.sh` fragen `_own_ips_listed` statt einer
eigenen Regel, und eine Liste nur aus eingerückter Kommentarzeile, Kopfzeile und Leerzeile endet in `own_ips_offline` und in allen
drei Werkzeugen mit Exit 2. Der Wächter verfolgt je Datei die Variablen, denen `CP_OWN_IPS_FILE` zugewiesen wird, und meldet jeden
Leser auf einer dieser Variablen außerhalb eines Aufrufs aus `ops/own-ips.sh` und der benannten Ausnahmen.
Widerlegt, wenn `own_ips_offline` am Kopf von `dev` mit einer Liste nur aus `  # old`, `ip first_seen note` und einer Leerzeile
schon mit 2 endet (der Maker prüft das zuerst mit dem ersten Prüfbefehl von Punkt 1 an der Merge-Basis, heute `0`, und schreibt das
Ergebnis in die erste Zeile des Progress Log).
MVP: Funktion, weil eine Liste, aus der jemand die Adressen auskommentiert oder eine Kopfzeile davorgesetzt hat, sonst still als
gefüllte gelesen wird und die Zählung fremder Automatons, Anmeldungen und Timeouts danach eigene Prüfungen als Fremde zählt.

## Voraussetzungen
- messung Goal 08 DONE

## Kontext für den Maker
- Ziel: Als eigene Adresse zählt nur, was eine Adresse ist, und eine Liste ohne Adresse hält jedes Werkzeug an, egal wie ihre
  übrigen Zeilen aussehen; kein Werkzeug liest die Liste über eine Variable an `own_ips` vorbei, ohne dass `check` rot wird.
- Herkunft: Zeile messung in ROADMAP.md, Glied 12. Übernimmt goals/_vorschlaege/messung-kritik-2026-11-15-1.md und
  goals/_vorschlaege/messung-kritik-2026-11-15-2.md (je Schwere 2, beide aus der Kritik zu messung 07). Hängt nicht an den Gliedern
  09 bis 11; Glied 10 (`own_ips_checked`) baut später auf der Regel dieses Goals auf.
- **Die Regel in `ops/own-ips.sh`.** Eine Hilfsfunktion, die für `_own_ips_listed` und `_own_ips_seen` gilt, gibt aus einer Datei
  das erste Feld jeder Zeile aus, wenn es eine Adresse ist, sonst nichts; beide Funktionen rufen sie, damit die Regel an einer
  Stelle steht. `own_ips` und `own_ips_offline` bleiben sonst, wie sie sind: Reihenfolge, Ausgabeform (sortiert, eindeutig, durch
  Leerzeichen getrennt), Exit-Codes, Schreiben in Liste und Merkdatei, stderr. Der Kommentar über `_own_ips_listed` (heute „first
  field of every line that does not start with "#"“) nennt die neue Regel mit IPv4 und IPv6.
- Annahme (Tech Lead, 16.11.2026): Eine IPv4-Adresse sind vier durch Punkte getrennte Gruppen aus Ziffern, eine IPv6-Adresse besteht
  nur aus Hex-Ziffern, Doppelpunkten und Punkten und hat mindestens zwei Doppelpunkte; Präfixe (`/24`), Zonen (`%eth0`) und
  Klammern zählen nicht, weil das Caddy-Log `client_ip` ohne sie schreibt und die Liste heute nur nackte IPv4-Adressen trägt.
  Ohne Intervall-Ausdrücke `{n,m}` in `awk`, weil der GitHub-Rechner `mawk` haben kann; `grep -E` oder ein ausgeschriebenes Muster.
- Annahme (Tech Lead, 16.11.2026): Die Vorprüfungen der Werkzeuge rufen `_own_ips_listed "<Datei>" | grep -q .` aus
  `ops/own-ips.sh`, das alle drei schon sourcen, statt einer neuen öffentlichen Funktion; Glied 10 ersetzt diese Zeilen später durch
  `own_ips_checked`, und bis dahin steht die Regel trotzdem nur in `ops/own-ips.sh`. Meldungen und Exit-Codes der Vorprüfungen
  bleiben Zeichen für Zeichen.
- Annahme (Tech Lead, 16.11.2026): Der neue Wächter findet am Kopf von `dev` genau einen ungedeckten Leser,
  `ops/conway-arrivals.sh:34`; das Goal stellt genau diese Zeile auf `_own_ips_listed "$file" | grep -q .` um, damit gilt dort auch
  die Regel aus Teil 1. `ops/conway-arrivals.sh` kommt nicht auf die Ausnahmeliste. Die vier benannten Ausnahmen aus messung 07
  bleiben benannt und Zeichen für Zeichen, auch `ops/timeout-quote.sh`, das nach Teil 1 keinen Treffer mehr hat (Glied 10 nimmt
  es von der Liste); `ops/actions-log-addresses.sh` bleibt mit seinem Leser `awk -v own="$OWN"` (Zeile 128) Ausnahme und wird
  nicht umgebaut.
- Annahme (Tech Lead, 16.11.2026): Die Vorprüfung in `ops/anzeigen-rechnung.py:36` hat dieselbe Schwäche und bleibt hier
  unverändert, weil messung 08 dieselbe Datei ändert und Glied 10 die Prüfung durch `own_ips_checked` ersetzt; `own_ips` selbst
  nennt nach diesem Goal auch dort kein `#` mehr.
- **Neuer Test `test/own-ips-addresses-only.test.ts`**, ohne Netz, nach dem Muster von `test/timeout-quote-own-ips.test.ts`
  (nachgebautes `ssh` vorn im `PATH`, das mit 255 endet, danach `dirname(process.execPath)`, `HOME`, Liste und `CP_OWN_IPS_SEEN` in
  `mkdtemp`, Adressen nur aus den Dokumentationsbereichen). Die Liste ohne Adresse ist `"  # old\nip first_seen note\n\n"`.
  `ops/keyless-mints.sh` sourct `ops/own-ips.sh` relativ, läuft also mit `cwd` im Repo:
  - `it("own_ips_offline ends with 2 when the list holds only an indented comment, a header line and a blank line")`: dazu
    `CP_OWN_IPS=198.51.100.7` und eine Merkdatei mit `192.0.2.44 2026-11-14`; Exit 2, `stdout` leer;
  - `it("own_ips names only addresses from the list and the seen file, IPv4 and IPv6, never a comment mark or a header word")`:
    Liste `"  # old\nip first_seen note\n\n192.0.2.10 x\n2001:db8::1 y\n"`, Merkdatei `"  # note\n192.0.2.44 2026-11-14\n"`; die
    Ausgabe ist genau `192.0.2.10 192.0.2.44 2001:db8::1`, nach Leerzeichen getrennt;
  - `it("ops/timeout-quote.sh stops with exit 2 when the list holds only an indented comment and a header line")`: `--join` mit
    leerem Caddy-Log und leeren Zeilen; Exit 2, keine Zeile auf `stdout` beginnt mit `|`, genau eine Zeile auf `stderr`, die mit
    `TIMEOUT QUOTE FAIL: ` beginnt;
  - `it("ops/keyless-mints.sh stops with exit 2 when the list holds only an indented comment and a header line")`: `--file` mit
    einem 429 auf `POST /v1/auth/keyless` von `192.0.2.50`; Exit 2, keine Zeile auf `stdout` beginnt mit `|`, `stderr` nennt
    `own_ips`;
  - `it("conway_own_list in ops/conway-arrivals.sh returns 2 when the list holds only an indented comment and a header line")`:
    `CP_OWN_IPS` und `CP_OWN_IPS_FILE` zeigen auf die Liste; Rückgabe 2, die Ausgabedatei ist leer oder fehlt.
  In den Fällen 3 bis 5 nennt keine Zeile von `stdout` oder `stderr` eine Adresse aus den Dokumentationsbereichen, und die Liste
  bleibt Zeichen für Zeichen. Rot vor dem Fix sind alle fünf (heute Exit 0, Ausgabe `# 192.0.2.10 192.0.2.44 2001:db8::1 ip`).
- **Wächter `test/own-ips-readers.test.ts`.** Nur neue Zeilen; die sechs bestehenden Fälle, `readsListFileDirectly` und die
  Ausnahmeliste bleiben Zeichen für Zeichen. Neu ist eine Funktion `listVariableReaders(text: string, ext: string): number[]`, die
  die Zeilennummern (ab 1) der Treffer einer Datei nennt:
  - Verfolgt werden Variablen, deren Zuweisung außerhalb eines Kommentars (Regel `COMMENT`) als Wert mit `$CP_OWN_IPS_FILE`,
    `${CP_OWN_IPS_FILE…}` oder `${X:-$CP_OWN_IPS_FILE}` beginnt, mit oder ohne Anführungszeichen, `local`, `export` oder
    `readonly` davor; dazu jede Variable, der so eine verfolgte Variable zugewiesen wird, bis keine neue mehr dazukommt. In Dateien,
    die nicht auf `.sh` enden, auch `name = <Ausdruck mit CP_OWN_IPS_FILE>`. Eine Befehlsersetzung `$(…)` als Wert und eine
    Zuweisung an `CP_OWN_IPS_FILE` selbst (`CP_OWN_IPS_FILE="$dir/own.txt" bash …`) machen keine Variable zur verfolgten.
  - Ein Treffer ist eine Zeile außerhalb eines Kommentars, die eine verfolgte Variable nennt (`$name` oder `${name…}`, in Dateien
    ohne `.sh` der Name als eigenes Wort) und auf die `READS_FILE` passt oder die sie als Ziel einer Umleitung `<` hat. Vorher
    fallen aus der Zeile die Aufrufe einer Funktion aus `ops/own-ips.sh` samt ihrem ersten Argument weg (`_own_ips_listed "$file"`).
  - `it("the variable matcher trips on a reader of a variable that holds CP_OWN_IPS_FILE, also lines after the assignment")`:
    Treffer sind `f="$CP_OWN_IPS_FILE"` mit `awk '!/^#/ && NF {print $1}' "$f"` eine Zeile später (der Zwei-Zeilen-Fall, Zeile
    2), `file="${CP_OWN_IPS:-$CP_OWN_IPS_FILE}"` mit einer Leerzeile und `if ! grep -v '^#' "$file" | awk 'NF {print $1}' | grep -q .;
    then` (Zeile 3), `  local own="${CP_OWN_IPS_FILE}"` mit `  while read -r ip _; do :; done < "$own"` (Zeile 2),
    `a="$CP_OWN_IPS_FILE"`, `b="$a"` und `cat "${b}"` (Zeile 3), `OWN="$CP_OWN_IPS_FILE"` mit `awk -v own="$OWN" 'NF' /dev/null`
    (Zeile 2) und in einer `.py`-Datei `path = os.environ["CP_OWN_IPS_FILE"]` mit `own = open(path).read()` (Zeile 2). Für den
    Zwei-Zeilen-Fall belegt der Test zusätzlich, dass `readsListFileDirectly` keine der beiden Zeilen meldet.
  - `it("the variable matcher passes own_ips calls, tests, messages, comments and variables that never held CP_OWN_IPS_FILE")`: je
    nach `file="$CP_OWN_IPS_FILE"` kein Treffer für `if ! _own_ips_listed "$file" | grep -q .; then`,
    `list=$(CP_OWN_IPS_FILE="$file" CP_OWN_IPS="" own_ips 2>/dev/null)`, `[[ ! -f "$file" ]]`,
    `echo "conway-arrivals: ($file is missing)" >&2`, `# awk 'NF' "$file"` und `cat "$filename"`; dazu kein Treffer in
    `file="$1"` mit `cat "$file"`, in `CP_OWN_IPS_FILE="$dir/own.txt" bash "$HERE/x.sh"` mit `cat "$dir/x"` und in
    `list=$(CP_OWN_IPS_FILE="$file" own_ips)` mit `grep -c . <<<"$list"`.
  - `it("no file under ops/ besides ops/own-ips.sh and the named exceptions reads a variable that holds CP_OWN_IPS_FILE outside an own_ips call")`:
    dieselbe Dateiliste und dieselben Ausnahmen wie der dritte bestehende Fall, Meldung `<Pfad>:<Zeile>`. Rot vor dem Fix mit
    `ops/conway-arrivals.sh:34`.
- Kein anderer bestehender Test unter `test/` ändert sich, vor allem nicht `test/timeout-quote-own-ips.test.ts`,
  `test/keyless-mints.test.ts`, `test/conway-arrivals.test.ts`, `test/landing-yield.test.ts`, `test/github-yield.test.ts` und
  `test/deploy-window-own-seen.test.ts`; läuft einer rot, ist das ein Gap dieses Goals. Die Selftests von `ops/timeout-quote.sh`,
  `ops/keyless-mints.sh`, `ops/landing-yield.sh` und `ops/github-yield.sh` bleiben grün.
- Kein Rollout. `ops/` liegt im Release-Pfad und kommt mit dem nächsten fälligen Rollout auf den Server; die Cron-Läufe dort ändert
  dieses Goal nicht. Nichts gegen die Produktion: Kein Test, kein Selftest und kein Prüfbefehl ruft die VM, ssh, `crontab -l` oder
  einen Webhook auf, liest die echte Merkdatei unter `~/.local/state/control-plane/` oder schreibt `ops/own-ips.txt`.
- Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich. Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout; neue Dateien vor `check` mit `git add`
  stagen. Kein `pkill -f`. Eine Entscheidung, die dieser Text offen lässt, schreibt der Maker als Zeile `- messung 12 (Engineer CP,
  <Datum>): …` in `goals/messung/ANNAHMEN.md`.

## Done Condition
- [ ] `_own_ips_listed` und `_own_ips_seen` in `ops/own-ips.sh` geben nur ein erstes Feld weiter, das eine IPv4- oder
      IPv6-Adresse ist, über eine gemeinsame Hilfsfunktion; die echte Liste ergibt dieselben Adressen wie vorher.
      Prüfung: `T=$(mktemp -d); printf '  # old\nip first_seen note\n\n' > $T/l; printf '192.0.2.44 2026-11-14\n' > $T/s; env -u CP_OWN_IPS CP_OWN_IPS_FILE=$T/l CP_OWN_IPS_SEEN=$T/s bash -c 'source ops/own-ips.sh; own_ips_offline' >/dev/null 2>&1; echo $?` muss 2 ausgeben.
      Prüfung: `T=$(mktemp -d); mkdir $T/bin; printf '#!/bin/sh\nexit 255\n' > $T/bin/ssh; chmod +x $T/bin/ssh; printf '  # old\nip first_seen note\n\n192.0.2.10 x\n2001:db8::1 y\n' > $T/l; printf '  # note\n192.0.2.44 2026-11-14\n' > $T/s; env -u CP_OWN_IPS PATH=$T/bin:$PATH HOME=$T CP_OWN_IPS_FILE=$T/l CP_OWN_IPS_SEEN=$T/s bash -c 'source ops/own-ips.sh; own_ips' 2>/dev/null | xargs` muss genau `192.0.2.10 192.0.2.44 2001:db8::1` ausgeben.
      Prüfung: `T=$(mktemp -d); git show $(git merge-base origin/dev HEAD):ops/own-ips.sh > $T/old.sh; a=$(bash -c "source $T/old.sh; _own_ips_listed ops/own-ips.txt" | sha256sum); b=$(bash -c 'source ops/own-ips.sh; _own_ips_listed ops/own-ips.txt' | sha256sum); [ "$a" = "$b" ] && echo same` muss genau `same` ausgeben.
      Prüfung: `grep -cE '^#.*IPv4.*IPv6|^#.*IPv6.*IPv4' ops/own-ips.sh` muss mindestens 1 ausgeben.
- [ ] Die Vorprüfungen in `ops/timeout-quote.sh`, `ops/keyless-mints.sh` und `ops/conway-arrivals.sh` fragen `_own_ips_listed`
      und enden bei einer Liste ohne Adresse mit 2; ihre Selftests bleiben grün.
      Prüfung: `cat ops/timeout-quote.sh ops/keyless-mints.sh ops/conway-arrivals.sh | grep -cE "^[^#]*(grep -v '\^#'|awk '!/\^#/)"` muss 0 ausgeben (heute 3).
      Prüfung: `cat ops/timeout-quote.sh ops/keyless-mints.sh ops/conway-arrivals.sh | grep -cE '^[^#]*_own_ips_listed '` muss mindestens 3 ausgeben.
      Prüfung: `T=$(mktemp -d); mkdir $T/bin; printf '#!/bin/sh\nexit 255\n' > $T/bin/ssh; chmod +x $T/bin/ssh; printf '  # old\nip first_seen note\n' > $T/l; : > $T/rows; : > $T/caddy; env -u CP_OWN_IPS PATH=$T/bin:$PATH HOME=$T CP_OWN_IPS_FILE=$T/l CP_OWN_IPS_SEEN=$T/s bash ops/timeout-quote.sh --join $T/caddy $T/rows >$T/out 2>$T/err; echo "rc=$? $(grep -c '^|' $T/out)"` muss genau `rc=2 0` ausgeben (heute `rc=0 2`).
      Prüfung: `T=$(mktemp -d); mkdir $T/bin; printf '#!/bin/sh\nexit 255\n' > $T/bin/ssh; chmod +x $T/bin/ssh; printf '  # old\nip first_seen note\n' > $T/l; echo '{"ts":1794398400,"request":{"client_ip":"192.0.2.50","method":"POST","uri":"/v1/auth/keyless","headers":{"User-Agent":["node"]}},"status":429}' > $T/c.jsonl; env -u CP_OWN_IPS PATH=$T/bin:$PATH HOME=$T CP_OWN_IPS_FILE=$T/l CP_OWN_IPS_SEEN=$T/s bash ops/keyless-mints.sh --file $T/c.jsonl >$T/out 2>$T/err; echo "rc=$? $(grep -c '^|' $T/out)"` muss genau `rc=2 0` ausgeben (heute `rc=0 3`).
      Prüfung: `T=$(mktemp -d); mkdir $T/bin; printf '#!/bin/sh\nexit 255\n' > $T/bin/ssh; chmod +x $T/bin/ssh; printf '  # old\nip first_seen note\n' > $T/l; env PATH=$T/bin:$PATH HOME=$T CP_OWN_IPS=$T/l CP_OWN_IPS_FILE=$T/l CP_OWN_IPS_SEEN=$T/s bash -c "source ops/conway-arrivals.sh; conway_own_list $T/o" 2>/dev/null; echo "rc=$?"` muss genau `rc=2` ausgeben (heute `rc=0`).
      Prüfung: `bash ops/timeout-quote.sh --selftest | tail -n1` muss genau `TIMEOUT QUOTE SELFTEST OK` ausgeben.
      Prüfung: `bash ops/keyless-mints.sh --selftest | tail -n1` muss genau `KEYLESS MINTS SELFTEST OK` ausgeben.
- [ ] `test/own-ips-addresses-only.test.ts` belegt die fünf Fälle und ist mit dem Stand der vier Dateien an der Merge-Basis rot.
      Prüfung: `grep -cE 'it\("(own_ips_offline ends with 2 when the list holds only an indented comment, a header line and a blank line|own_ips names only addresses from the list and the seen file, IPv4 and IPv6, never a comment mark or a header word|ops/timeout-quote.sh stops with exit 2 when the list holds only an indented comment and a header line|ops/keyless-mints.sh stops with exit 2 when the list holds only an indented comment and a header line|conway_own_list in ops/conway-arrivals.sh returns 2 when the list holds only an indented comment and a header line)"' test/own-ips-addresses-only.test.ts` muss 5 ausgeben.
      Prüfung: `pnpm -s vitest run test/own-ips-addresses-only` muss Exit-Code 0 haben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); for f in own-ips.sh timeout-quote.sh keyless-mints.sh conway-arrivals.sh; do cp ops/$f "$T/$f"; git show "$B:ops/$f" > ops/$f; done; pnpm -s vitest run test/own-ips-addresses-only.test.ts --reporter=json --outputFile="$T/r.json" >/dev/null 2>&1; echo "rc=$? failed=$(node -e 'console.log(require(process.argv[1]).numFailedTests)' "$T/r.json")"; for f in own-ips.sh timeout-quote.sh keyless-mints.sh conway-arrivals.sh; do cp "$T/$f" ops/$f; done; git status --porcelain -- ops | wc -l` muss `rc=1 failed=5` und danach 0 ausgeben.
- [ ] Der Wächter meldet jeden Leser auf einer Variable, die `CP_OWN_IPS_FILE` hält, außerhalb eines Aufrufs aus
      `ops/own-ips.sh` und der benannten Ausnahmen; seine bestehenden Fälle und die vier Ausnahmen bleiben.
      Prüfung: `grep -cE 'it\("(the variable matcher trips on a reader of a variable that holds CP_OWN_IPS_FILE, also lines after the assignment|the variable matcher passes own_ips calls, tests, messages, comments and variables that never held CP_OWN_IPS_FILE|no file under ops/ besides ops/own-ips.sh and the named exceptions reads a variable that holds CP_OWN_IPS_FILE outside an own_ips call)"' test/own-ips-readers.test.ts` muss 3 ausgeben.
      Prüfung: `grep -cF 'f="$CP_OWN_IPS_FILE"' test/own-ips-readers.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE 'path: "ops/' test/own-ips-readers.test.ts` muss genau 4 ausgeben.
      Prüfung: `git diff -U0 $(git merge-base origin/dev HEAD) HEAD -- test/own-ips-readers.test.ts | grep -cE '^-[^-]'` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/own-ips-readers` muss Exit-Code 0 haben.
      Prüfung: `B=$(git merge-base origin/dev HEAD); T=$(mktemp -d); cp ops/conway-arrivals.sh "$T/ca"; git show "$B:ops/conway-arrivals.sh" > ops/conway-arrivals.sh; pnpm -s vitest run test/own-ips-readers.test.ts -t "reads a variable that holds CP_OWN_IPS_FILE outside an own_ips call" >/dev/null 2>&1; echo "rc=$?"; cp "$T/ca" ops/conway-arrivals.sh; git status --porcelain -- ops | wc -l` muss `rc=1` und danach 0 ausgeben.
- [ ] Die bestehenden Tests von `own_ips` und der Werkzeuge, die es rufen, bleiben unverändert grün.
      Prüfung: `pnpm -s vitest run test/own-ips test/timeout-quote test/keyless-mints test/claim-keyless-own-ips test/conway-arrivals test/landing-yield test/github-yield test/deploy-window test/anzeigen-rechnung-own-ips` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- test | grep -vcE '^test/(own-ips-addresses-only|own-ips-readers)\.test\.ts$'` muss 0 ausgeben.
      Prüfung: `for s in landing-yield github-yield; do bash ops/$s.sh --selftest 2>/dev/null | tail -n1; done` muss genau zwei Zeilen `SELFTEST OK` ausgeben.
- [ ] `check` ist grün, nur die genannten Dateien ändern sich, `ops/own-ips.txt` bleibt unberührt, und kein Lauf schreibt
      Zustand.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(ops/(own-ips|timeout-quote|keyless-mints|conway-arrivals)\.sh|test/(own-ips-addresses-only|own-ips-readers)\.test\.ts|goals/messung/.+)$'` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die fünf Fälle des neuen Tests und der Scan-Fall des Wächters waren vor dem Fix rot; die Zeile im Progress Log nennt sie und
      womit, für die beiden Matcher-Fälle mit dem Stand, an dem sie rot waren.
- [ ] Eine Liste, die nur Kommentare, Kopfzeilen oder Leerzeilen trägt, hält `own_ips_offline` und alle drei Werkzeuge mit Exit 2 an,
      auch wenn `CP_OWN_IPS`, die Merkdatei oder die live Adresse Adressen nennen; `#` erscheint nie als Adresse.
- [ ] Auf der echten Liste nennen `own_ips` und `own_ips_offline` dieselben Adressen wie vorher; keine Ausgabe eines Werkzeugs nennt
      eine Adresse.
- [ ] Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/fixtures/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- `ops/conway-series.sh` und `ops/conway-money-series.sh` (Cron-Läufe auf dem Server)
- jede andere Datei unter `ops/` außer `ops/own-ips.sh`, `ops/timeout-quote.sh`, `ops/keyless-mints.sh` und
  `ops/conway-arrivals.sh`, vor allem `ops/own-ips.txt`, `ops/anzeigen-rechnung.py` (messung 08), `ops/actions-log-addresses.sh`,
  `ops/deploy-window.sh`, `ops/conway_arrivals.py`, `ops/landing-yield.sh` und `ops/github-yield.sh`
- jeder bestehende Test unter `test/` außer `test/own-ips-readers.test.ts`, und dort nur neue Zeilen; neu ist nur
  `test/own-ips-addresses-only.test.ts`
- `goals/kanal/**`
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), die VM, ssh und jede Datei auf dem Server; Produktion weder
  lesend noch schreibend, kein Rollout, kein POST an einen echten Webhook
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log

## Blockers
- keine
