Schwere: 4
Goal: keines
Befund: Grundregel 8 aus `loop-constraints.md` (keine Adressen einzelner Kunden im öffentlichen Repo) hat in `gate.yaml` kein Gegenstück: `ops/fetcher-cache.tsv` fehlt in `deny_paths`, obwohl fehler 02 den Eintrag als Arbeit eines Menschen vorsieht.
Beleg: `git log -1 --format='%h %cs' origin/dev -- gate.yaml` -> `efa72f5 2026-11-10` | goals/fehler/02-besucheradressen-raus-aus-dem-oeffentlichen-repo.md:38 | gate.yaml:4 bis :31 (kein Eintrag `ops/fetcher-cache.tsv`); heute halten nur `.gitignore:16` und der Test aus fehler 04
Empfehlung: Ein Mensch trägt `ops/fetcher-cache.tsv` in `deny_paths` von `gate.yaml` ein, danach ein neuer Drill, damit der Eintrag gilt.
