# Fehler Goal 02: Besucheradressen raus aus dem öffentlichen Repo

## Status
ACTIVE

## Active Objective
Im öffentlichen Repo liegen keine Adressen echter Besucher mehr am Kopf von `dev`, und kein Lauf schreibt neue hinein: Der Cache von
`ops/fetchers.py` (`ops/fetcher-cache.tsv`, 959 Adressen aus dem Zugriffslog der Produktion vom 24. bis 29.09.2026) liegt außerhalb
des Checkouts, die Datei ist aus dem Repo genommen und steht in `.gitignore`, und keine andere Datei (Kommentar, Fixture, Test) trägt
eine dieser Adressen (`goals/_vorschlaege/loop-redteam-2026-11-11-1.md`, Schwere 4, Grundregel 8; `src/public/datenschutz.ts` sagt die Löschung
nach 30 Tagen zu). Die Historie bleibt, wie sie ist: Ob sie bereinigt wird, ist `delete_data` und liegt bei Matthias.
Widerlegt, wenn `git ls-files` nach dem Merge eine Datei zeigt, die eine Adresse aus dem Cache enthält.
MVP: Funktion, weil jeder Commit, der den Cache mitnimmt, neue Adressen echter Besucher veröffentlicht und die Datenschutzerklärung
der Seite das Gegenteil zusagt.

## Voraussetzungen
- fehler Goal 01 DONE

## Kontext für den Maker
- Entscheidung Tech Lead (12.11.2026): Der Cache liegt unter `${CP_FETCHER_CACHE:-$HOME/.cache/control-plane/fetcher-cache.tsv}`.
  `ops/fetchers.py` legt den Ordner bei Bedarf an und liest und schreibt nur dort, nie mehr neben sich selbst. Vor dem Entfernen aus dem
  Repo kopierst du die heutige Datei an den neuen Ort auf dem code-host, damit die Herkunft der 959 Adressen nicht neu abgefragt werden
  muss; das ist kein Löschen von Daten. Dann `git rm --cached ops/fetcher-cache.tsv`, die Zeile `ops/fetcher-cache.tsv` in `.gitignore`.
- Kommentare und Doku, die sagen, der Cache sei „committed“ (`ops/fetchers.py` oben, `ops/README.md`), sagen danach, wo er liegt und
  warum nicht im Repo.
- Dieselben Adressen stehen auch außerhalb des Caches: Gemessen am 12.11.2026 tragen 13 Dateien am Kopf von `dev` eine Adresse aus
  dem Cache, die nicht als Rechenzentrum erkannt ist und nicht in `ops/own-ips.txt` steht, meist in Kommentaren, die einen Besuch
  beschreiben (`src/app.ts`, `src/public/fix.ts`, `src/public/landing.de.ts`, `src/public/market.ts`,
  `test/the-board-where-it-looks.test.ts`, mehrere Skripte unter `ops/`, `ops/README.md`); gezählt mit dem zweiten Prüfbefehl von
  Punkt 2, ohne eine Adresse auszugeben. Ersetze jede durch eine aus den Dokumentationsbereichen (`192.0.2.0/24`, `198.51.100.0/24`,
  `203.0.113.0/24`), in Kommentaren, Fixtures und Tests konsistent, sodass jeder Test so grün bleibt wie vorher. Braucht ein Test
  wirklich die Adresse eines Crawler-Betreibers (etwa Googlebot in `ops/crawlers.sh`), steht sie in der neuen Datei
  `ops/crawler-ips.txt`, eine je Zeile mit Betreiber und Beleg (PTR-Name), höchstens fünf; das ist keine Person. Erfundene Adressen
  (`1.1.1.1`, `9.8.0.1`) und `ops/own-ips.txt` bleiben.
- Unter `src/` änderst du nur Kommentare. Das rollt den Dienst einmal aus (rund 16 Sekunden ohne Antwort, Grundregel 5); Entscheidung
  Tech Lead, weil Adressen echter Besucher im Quelltext derselbe Bruch von Grundregel 8 sind wie im Cache. Der Rollout nimmt auch den
  Watchdog aus fehler 01 mit auf den Server.
- `gate.yaml` bekommt den Pfad `ops/fetcher-cache.tsv` in `deny_paths`; das ändert ein Mensch, nicht dieses Goal. Steht der Eintrag
  schon, wenn dein PR kommt, geht er in die Human Inbox beim Tech Lead, weil er den Pfad löscht; das ist erwartet.
- Traction: Ein Kunde, der seine Adresse im Repo des Anbieters findet, dem er Geld gibt, kommt nicht wieder; ein Red-Team-Befund dieser
  Art stuft den Loop ab Schwere 5 auf L2 herab und hält dann jedes Goal an.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Gib in keinem Log, Kommentar,
  Commit oder Verdict eine Adresse aus, nur Zahlen.

## Done Condition
- [x] `ops/fetchers.py` liest und schreibt den Cache nur am Ort aus `CP_FETCHER_CACHE` (Standard `~/.cache/control-plane/fetcher-cache.tsv`),
      die Datei ist aus dem Repo genommen und steht in `.gitignore`. Der Test fährt `ops/fetchers.py` mit gepflanzten Zeilen und einem
      Cache-Pfad aus `mktemp` und verlangt, dass dort geschrieben wird und neben dem Skript keine Datei entsteht; mit dem Skript von heute
      ist er rot, die Zeile im Progress Log nennt es.
      Prüfung: `git ls-files ops/fetcher-cache.tsv | wc -l` muss 0 ausgeben.
      Prüfung: `git check-ignore -q ops/fetcher-cache.tsv && echo ignoriert` muss `ignoriert` ausgeben.
      Prüfung: `grep -c 'with_name("fetcher-cache.tsv")' ops/fetchers.py` muss 0 ausgeben.
      Prüfung: `grep -c "CP_FETCHER_CACHE" ops/fetchers.py` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/fetcher-cache.test.ts` muss Exit-Code 0 haben.
- [x] Keine Datei im Repo trägt eine Adresse aus dem Cache, die nicht als Rechenzentrum erkannt ist, außer den eigenen aus
      `ops/own-ips.txt` und höchstens fünf belegten Crawler-Adressen aus `ops/crawler-ips.txt`; unter `src/` ändern sich nur Kommentare.
      Prüfung: `test -s "$HOME/.cache/control-plane/fetcher-cache.tsv" && echo vorhanden` muss `vorhanden` ausgeben.
      Prüfung: `git ls-files -z | xargs -0 grep -ohE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' 2>/dev/null | sort -u | grep -cxFf <(awk -F'\t' 'NR>1 && $3!="datacenter"{print $1}' "$HOME/.cache/control-plane/fetcher-cache.tsv" | sort -u | grep -vxFf <(cat ops/own-ips.txt ops/crawler-ips.txt 2>/dev/null | grep -oE '^[0-9.]+'))` muss 0 ausgeben.
      Prüfung: `cat ops/crawler-ips.txt 2>/dev/null | grep -cE '^[0-9.]+ ' | awk '{print ($1 <= 5) ? "passt" : "zu viele"}'` muss `passt` ausgeben, auch wenn die Datei fehlt.
      Prüfung: `git diff origin/dev...HEAD -- src | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vcE '^[+-][[:space:]]*(\*|//|/\*)'` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run` muss Exit-Code 0 haben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Kritik 1: `save_cache` schreibt den Cache atomar, über eine Temp-Datei im selben Ordner und `os.replace`. Bisher hatte jeder
      Checkout seine eigene Datei, jetzt teilen sich alle Worktrees und Läufe auf dem code-host eine unter `~/.cache`; ein Lauf, der
      liest, während ein anderer mit `write_text` mitten im Schreiben ist, liest eine halbe Datei und schreibt sie so zurück, und die
      Belege der 959 Adressen, die eine spätere Abfrage nicht mehr gleich beantwortet, sind weg. Der Test pflanzt einen Cache mit
      Modus 0444 in einem beschreibbaren Ordner aus `mktemp`, fährt das Skript mit `127.0.0.1` und verlangt Exit 0, die neue Zeile
      und die gepflanzte Zeile im Cache und keine weitere Datei im Ordner; mit `write_text` scheitert er an `PermissionError`.
      Prüfung: `grep -c "os.replace" ops/fetchers.py` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/fetcher-cache.test.ts -t "atomic"` muss Exit-Code 0 haben.
- [ ] Kritik 2: Ein neuer Test `test/visitor-addresses.test.ts` hält Punkt 2 nach dem Merge fest, weil die 12 Dateien mit Adressen
      nicht aus dem Cache kamen, sondern aus Kommentaren, die Maker-Läufe über einen Besuch geschrieben haben, und der nächste Lauf
      das wieder tut. Er liest den Cache aus `CP_FETCHER_CACHE` (Standard `~/.cache/control-plane/fetcher-cache.tsv`), nimmt dieselben
      Adressen wie der zweite Prüfbefehl von Punkt 2 (nicht `datacenter`, nicht in `ops/own-ips.txt` oder `ops/crawler-ips.txt`) und
      verlangt, dass keine Datei aus `git ls-files` eine davon trägt; die Meldung nennt Anzahl und Dateinamen, nie eine Adresse.
      Fehlt der Cache (CI), wird der Test übersprungen, nicht grün gemeldet.
      Prüfung: `pnpm -s vitest run test/visitor-addresses.test.ts` muss Exit-Code 0 haben.
      Prüfung: `d=$(mktemp -d); printf '# ip\towner\tkind\n192.0.2.64\t-\tunknown\n' > "$d/c.tsv"; CP_FETCHER_CACHE="$d/c.tsv" pnpm -s vitest run test/visitor-addresses.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben (die Dokumentationsadresse steht in `ops/fetchers.py`).
      Prüfung: `CP_FETCHER_CACHE=/nonexistent pnpm -s vitest run test/visitor-addresses.test.ts 2>&1 | grep -c skipped` muss mindestens 1 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Keine Adresse in Commit, PR, Kommentar, Log oder Verdict, nur Zahlen.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- `src/**` außer Kommentarzeilen; `src/payments/**` und `src/auth/**` ganz
- die Historie des Repos: kein `filter-repo`, kein Rebase veröffentlichter Commits, kein `push --force` (`delete_data`, bei Matthias)
- der Cache am neuen Ort wird nicht gelöscht
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-12 Zyklus 1: Punkte 1, 2, 3 gebaut: Cache von `ops/fetchers.py` unter `CP_FETCHER_CACHE` (Standard `~/.cache/control-plane/fetcher-cache.tsv`, dorthin kopiert), `ops/fetcher-cache.tsv` aus dem Index und in `.gitignore`, Besucheradressen in 12 Dateien durch Dokumentationsadressen ersetzt, eine Googlebot-Adresse belegt in `ops/crawler-ips.txt`; neuer Test `test/fetcher-cache.test.ts` war mit dem Skript von `origin/dev` rot (3 von 3 failed: Planted-Owner nicht aus `CP_FETCHER_CACHE` gelesen, kein Cache unter `~/.cache`, Datei noch getrackt). Prüfbefehle: `git ls-files ops/fetcher-cache.tsv | wc -l` -> 0; `git check-ignore` -> ignoriert; `grep -c with_name(...)` -> 0; `grep -c CP_FETCHER_CACHE` -> 2; `pnpm -s vitest run test/fetcher-cache.test.ts` -> 3 passed, Exit 0; `test -s` Cache -> vorhanden; Adresszähler -> 0 (Gegenprobe mit einer gepflanzten Cache-Adresse in `ops/who.sh` -> 1); Crawler-Zeilen -> passt (1); Nicht-Kommentarzeilen unter `src/` -> 0; `pnpm -s vitest run` -> 1365 passed, Exit 0 (bei Load über 40 auf 16 Kernen vorher viermal ein 5-s-Timeout in fremden Tests, `stripe-sessions-selftest` ebenso auf frischem `origin/dev`); `node scripts/check.mjs` -> grün in 160 s, Exit 0; Selbsttests `ops/fetchers.py`, `ops/crawlers.sh`, `ops/failures.sh` -> OK.
- 2026-11-12 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3 (Kopf `975368c`, `origin/dev` ohne neue Commits, nichts zu mergen). Prüfbefehle: `git ls-files ops/fetcher-cache.tsv | wc -l` -> 0; `git check-ignore` -> ignoriert; `grep -c with_name(...)` -> 0; `grep -c CP_FETCHER_CACHE` -> 2; `pnpm -s vitest run test/fetcher-cache.test.ts` -> 3 passed, Exit 0; `test -s` Cache -> vorhanden; Adresszähler -> 0; Crawler-Zeilen -> passt; Nicht-Kommentarzeilen unter `src/` -> 0; `pnpm -s vitest run` -> 1365 passed, Exit 0 (im fünften Lauf; Läufe 1 bis 4 bei Load 80 bis 160 rot durch 5-s-Timeouts und `onTaskUpdate` in `stripe-sessions-selftest`, `db-report`, `abort-purchase`, die einzeln grün sind, `stripe-sessions-selftest` auch auf `origin/dev`); `node scripts/check.mjs` -> grün in 74 s, Exit 0.
- 2026-11-12 Zyklus 3: Punkt Kritik 1 gebaut: `save_cache` schreibt über `tempfile.mkstemp` im Ordner des Caches und `os.replace`, neuer Test `writes the cache atomically` in `test/fetcher-cache.test.ts` war mit `write_text` rot (`PermissionError` am Cache mit Modus 0444). Prüfbefehle: `grep -c "os.replace" ops/fetchers.py` -> 1; `pnpm -s vitest run test/fetcher-cache.test.ts -t "atomic"` -> 1 passed, 3 skipped, Exit 0; `pnpm -s vitest run test/fetcher-cache.test.ts` -> 4 passed; Selbsttest `ops/fetchers.py` -> passed; Prüfbefehle der Punkte 1 und 2 unverändert grün.

## Blockers
