Schwere: 4
Goal: sandbox 12
Befund: Das Loop-Audit vom 20.11. hat den Prüfbefehl `bash ops/sandbox/probe.sh <IP>` aus sandbox 12 Punkt 3 live gegen den Sandbox-Host mit Kundensandboxes gefahren und als GRÜN geführt, obwohl die Zeile direkt darüber denselben Host mit „ruft ein Produktionssystem auf, nie im Audit“ auslässt.
Beleg: `git show origin/dev:docs/audit/2026-11-20.md | sed -n '1768,1769p'` -> :1768 `NICHT GELAUFEN sandbox 12 Punkt 3: bash ops/sandbox/setup.sh --check <IP> (ruft ein Produktionssystem auf, nie im Audit)`, :1769 `GRÜN sandbox 12 Punkt 3: bash ops/sandbox/probe.sh <IP> | grep -cxE …`, beide mit demselben Host | docs/audit/2026-11-20.md:1769, ops/sandbox/probe.sh
Empfehlung: Das Audit streicht jeden Prüfbefehl, der `ops/sandbox/probe.sh` oder `ops/sandbox/setup.sh` mit einer Host-Adresse aufruft, vor dem Lauf und berichtet ihn als `NICHT GELAUFEN … (läuft live, nie im Audit)`, unabhängig davon, ob das Goal neu ist; die Audit-Routine (QA Skeptiker) bekommt das als Reparatur, und sandbox 12 Punkt 3 bekommt eine Zeile in `goals/sandbox/ANNAHMEN.md`, dass der Punkt im Audit nie läuft.

## Herleitung

`probe.sh` meldet sich per SSH als root am Sandbox-Host an, legt zwei Sandboxes per `POST /v1/sandboxes` an, schreibt und löscht eine Datei auf dem Host, gibt per `ports/expose` einen Port frei, löst einen OOM aus, ruft aus der Sandbox eine externe Seite auf und löscht am Ende die eigenen Sandboxes. Das ist ein schreibender Live-Lauf auf einem Host, auf dem seit sandbox 03 (`DONE`) zahlende Kunden laufen (`ops/sandbox/setup.sh:25` `--foreign-sandboxes`, `docs/sandbox/plan.md`).

Gebrochen ist die Audit-Regel aus dem Skill `loop-regeln` (Nachtläufe, Loop-Audit): Ein Prüfbefehl, der einen Live-Lauf startet, läuft im Audit nie, auch nicht mit `(Netz)`, weil Prüfer keine Produktionssysteme aufrufen (seit 16.11.2026). Das Audit sperrt offenbar nur Prüfzeilen, die es schon kennt: sandbox 02 Punkt 4 und sandbox 07 Punkt 4 mit demselben `probe.sh` stehen vom 17. bis 20.11. auf NICHT GELAUFEN, sandbox 12 ist erst seit 19.11. `DONE` und lief am 20.11. durch. Vor der Regel lief `probe.sh` auch am 13., 15. und 16.11.

Schwere 4 statt 5: `loop-constraints.md:75-82` (Produktion nur lesen) regelt wörtlich den Zahlungsserver, den `probe.sh` nur mit GET `/health` aufruft; verletzt sind die Audit-Regel des Skills und die Kern-Regel für Prüfagenten. Die Probe räumt ihre Sandboxes wieder ab (`left=0`).
