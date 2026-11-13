# Sandbox Ende zu Ende mit der unveränderten Runtime (sandbox 04)

Die unveränderte Runtime `Conway-Research/automaton` am Pin `d8f8168` legt über ihren eigenen Client und ihre eigenen Werkzeuge eine
Sandbox an, führt darin `echo ok` aus, schreibt und liest eine Datei, bekommt auf `expose_port` die Antwort 409
`port_exposure_unavailable` und läuft weiter, listet die Sandbox, löscht sie und sieht sie danach nicht mehr. Der Gang steht genau
einmal im Repo, in `harness/e2e/sandbox-walk.mjs`; `harness/e2e/full.sh` (Job `e2e` jedes PR und vor jedem Rollout) und
`ops/runtime-sandbox.sh` (Produktion) rufen beide diese Datei auf.

## Lauf gegen die Produktion

13.11.2026, 01:10:22 bis 01:10:28 UTC, auf dem code-host, mit dem eigenen Konto `live-sandbox`, bezahlt aus dessen Credits, ohne
Topup und ohne Wallet-Bewegung:

```sh
bash ops/runtime-sandbox.sh
```

Ausgabe:

```
runtime: d8f8168, git status --porcelain empty
RUNTIME SANDBOX OK pin=d8f8168 create_sandbox=201 exec=200 write_file=200 read_file=200 expose_port=409 list_sandboxes=200 delete=200 list_after_delete=200 ledger_rows=1 hold_mc=0
```

Im Ledger der Produktion steht für diese Sandbox genau eine Zeile der Art `sandbox` (Anlegen und gleich Löschen ist ein begonnener
Schritt von 6 Minuten, 100 mc für die Stufe klein, `docs/sandbox/plan.md`, `## Preis`), die Reservierung ist danach 0. Gelesen mit
`readonly: true` im Container `cp`, nur die beiden Zahlen verlassen die Datenbank. Kein Aufruf der Runtime bekam 429, 500, 502, 503
oder 504. Das Messwerkzeug ist in beide Richtungen bewiesen: `bash ops/runtime-sandbox.sh --selftest` (18 Fälle, jeder Fall war beim
Bau einmal rot).

## Was der Harness abdeckt und was nicht

Abgedeckt: der ganze Weg der Runtime durch das Control Plane bis zu `sandboxd` mit echter Signatur (Schlüssel, den `cp` beim ersten
Start anlegt), Anlegen, Ausführen als echter Prozess, Dateien, 409 für Ports, Liste, Löschen, die eine Ledger-Zeile, die
Reservierung auf 0, ein konsistentes Ledger und ein Nachbau ohne übrige Sandbox, Container oder Netz. `pnpm e2e` wird rot, wenn
eines davon fehlt (`sandbox=false` in der Schlusszeile).

Nicht abgedeckt: Isolation, Grenzen und Netz der Sandbox. Der Nachbau unter `harness/sandboxd/` führt Befehle als Prozess in seinem
eigenen Container aus, ohne gVisor, ohne eigene Platte und ohne eigenes Netz; das prüft sandbox 02 gegen den echten Server.
Ebenso nicht: lange Befehle über 30 s (sandbox 05) und freigegebene Ports (sandbox 06).
