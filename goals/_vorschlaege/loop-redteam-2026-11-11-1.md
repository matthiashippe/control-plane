Schwere: 4
Goal: keines
Befund: Das öffentliche Repo enthält in `ops/fetcher-cache.tsv` 959 IP-Adressen echter Besucher aus dem Zugriffslog der Produktion vom 24. bis 29.09.2026 (auch in der Historie), obwohl `src/public/datenschutz.ts:33-36` die Löschung nach 30 Tagen zusagt und Grundregel 8 (loop-constraints.md:39) Personendaten im öffentlichen Repo ausschließt.
Beleg: `gh repo view matthiashippe/control-plane --json visibility` -> `PUBLIC` | `git show origin/dev:ops/fetcher-cache.tsv | awk -F'\t' 'NR>1{print $3}' | sort | uniq -c` -> `236 datacenter`, `723 unknown` (alle global routbar, 22 mit PTR eines Privatkunden-Anschlusses, gezählt ohne Ausgabe) | Commits 0343f28 bis b503bb4 | `ops/check-all.sh:367` ruft `ops/fetchers.py` je Zyklus auf, die Datei steht nicht in `.gitignore`
Empfehlung: Matthias nimmt `ops/fetcher-cache.tsv` aus dem Repo, trägt sie in `.gitignore` ein und hält den Cache außerhalb des Checkouts; `ops/fetcher-cache.tsv` kommt in `deny_paths`. Ob die Historie bereinigt wird (Löschversprechen), entscheidet er. Bei der Gelegenheit `ops/own-ips.txt` (eigene Adressen) und die 17 Adressen außerhalb der Dokumentationsbereiche in `ops/fixtures/traffic-*.log` prüfen.

Die Commits stammen aus der Zeit vor dem Loop-Vertrag (10.11.2026), der Cache wird aber weiter geschrieben, und jeder Commit eines Goals, der ihn mitnimmt, veröffentlicht neue Adressen. Schwere 4 statt 5, weil Grundregel 8 IP-Adressen nicht wörtlich nennt; der Loop selbst liest sie so (goals/sandbox/01, Verdict 02-z3-B.md:17).

Übernommen: Tech Lead als Human Inbox des Loops (Datei aus dem Repo, .gitignore, deny_paths) (2026-11-12)
