# Fehler Goal 02: Besucheradressen raus aus dem öffentlichen Repo

## Status
PLANNED

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
- [ ] `ops/fetchers.py` liest und schreibt den Cache nur am Ort aus `CP_FETCHER_CACHE` (Standard `~/.cache/control-plane/fetcher-cache.tsv`),
      die Datei ist aus dem Repo genommen und steht in `.gitignore`. Der Test fährt `ops/fetchers.py` mit gepflanzten Zeilen und einem
      Cache-Pfad aus `mktemp` und verlangt, dass dort geschrieben wird und neben dem Skript keine Datei entsteht; mit dem Skript von heute
      ist er rot, die Zeile im Progress Log nennt es.
      Prüfung: `git ls-files ops/fetcher-cache.tsv | wc -l` muss 0 ausgeben.
      Prüfung: `git check-ignore -q ops/fetcher-cache.tsv && echo ignoriert` muss `ignoriert` ausgeben.
      Prüfung: `grep -c 'with_name("fetcher-cache.tsv")' ops/fetchers.py` muss 0 ausgeben.
      Prüfung: `grep -c "CP_FETCHER_CACHE" ops/fetchers.py` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/fetcher-cache.test.ts` muss Exit-Code 0 haben.
- [ ] Keine Datei im Repo trägt eine Adresse aus dem Cache, die nicht als Rechenzentrum erkannt ist, außer den eigenen aus
      `ops/own-ips.txt` und höchstens fünf belegten Crawler-Adressen aus `ops/crawler-ips.txt`; unter `src/` ändern sich nur Kommentare.
      Prüfung: `test -s "$HOME/.cache/control-plane/fetcher-cache.tsv" && echo vorhanden` muss `vorhanden` ausgeben.
      Prüfung: `git ls-files -z | xargs -0 grep -ohE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' 2>/dev/null | sort -u | grep -cxFf <(awk -F'\t' 'NR>1 && $3!="datacenter"{print $1}' "$HOME/.cache/control-plane/fetcher-cache.tsv" | sort -u | grep -vxFf <(cat ops/own-ips.txt ops/crawler-ips.txt 2>/dev/null | grep -oE '^[0-9.]+'))` muss 0 ausgeben.
      Prüfung: `cat ops/crawler-ips.txt 2>/dev/null | grep -cE '^[0-9.]+ ' | awk '{print ($1 <= 5) ? "passt" : "zu viele"}'` muss `passt` ausgeben, auch wenn die Datei fehlt.
      Prüfung: `git diff origin/dev...HEAD -- src | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vcE '^[+-][[:space:]]*(\*|//|/\*)'` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run` muss Exit-Code 0 haben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
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

## Blockers
