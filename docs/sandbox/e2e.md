# Sandbox Ende zu Ende mit der unveränderten Runtime (sandbox 04)

Die unveränderte Runtime `Conway-Research/automaton` am Pin `d8f8168` legt über ihren eigenen Client und ihre eigenen Werkzeuge eine
Sandbox an, führt darin `echo ok` aus, schreibt und liest eine Datei, gibt mit `expose_port` einen Port frei und bekommt seine
Adresse `https://sbx-<id>-<port>.<domain>`, gibt ihn mit `remove_port` wieder zurück, listet die Sandbox, löscht sie und sieht sie
danach nicht mehr (Ports seit sandbox 07, davor antwortete `expose_port` mit 409). Der Gang steht genau
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

Das ist der Stand vor sandbox 07. Nach dessen Rollout verlangt `ops/runtime-sandbox.sh` für `expose_port` 200 mit einer Adresse
unter der eigenen Domain und dazu `remove_port`; 409 oder eine Adresse unter `postyourprice.com` sind dann `RUNTIME SANDBOX FAIL`.

Im Ledger der Produktion steht für diese Sandbox genau eine Zeile der Art `sandbox` (Anlegen und gleich Löschen ist ein begonnener
Schritt von 6 Minuten, 100 mc für die Stufe klein, `docs/sandbox/plan.md`, `## Preis`), die Reservierung ist danach 0. Gelesen mit
`readonly: true` im Container `cp`, nur die beiden Zahlen verlassen die Datenbank. Kein Aufruf der Runtime bekam 429, 500, 502, 503
oder 504. Das Messwerkzeug ist in beide Richtungen bewiesen: `bash ops/runtime-sandbox.sh --selftest` (26 Fälle, jeder Fall war beim
Bau einmal rot oder zeigt die Gegenrichtung).

## Stempel des Builds (sandbox 10)

`dist/` ist in der Runtime von Git ignoriert, deshalb belegen Pin und leeres `git status --porcelain` allein nicht, dass `dist/` vom
Pin gebaut wurde. Nach jedem Bau schreibt `ops/runtime-sandbox.sh` eine Zeile `<HEAD> <Prüfsumme über dist/>` in
`control-plane-dist.sha256` im Git-Verzeichnis des Clones (`.git/control-plane-dist.sha256` im Cache
`~/.cache/control-plane/automaton-d8f8168`). Vor dem Gang vergleicht es Stempel, Commit und Prüfsumme; fehlt der Stempel oder passt
eines nicht, endet der Lauf mit `RUNTIME SANDBOX FAIL dist/ is not the build at the pin`. Der nächste Lauf löscht dann `dist/`,
baut neu und schreibt den Stempel; von Hand ist nichts zu tun. Der Cache vom 16.11.2026 hat noch keinen Stempel, der erste Lauf nach
sandbox 10 baut ihn darum einmal neu (`pnpm install --frozen-lockfile`, `pnpm build`).

## Was der Harness abdeckt und was nicht

Abgedeckt: der ganze Weg der Runtime durch das Control Plane bis zu `sandboxd` mit echter Signatur (Schlüssel, den `cp` beim ersten
Start anlegt), Anlegen, Ausführen als echter Prozess, Dateien, Freigabe und Rückgabe eines Ports mit der `public_url` unter der
Domain des Nachbaus, Liste, Löschen, die eine Ledger-Zeile, die
Reservierung auf 0, ein konsistentes Ledger und ein Nachbau ohne übrige Sandbox, Container oder Netz. `pnpm e2e` wird rot, wenn
eines davon fehlt (`sandbox=false` in der Schlusszeile).

Nicht abgedeckt: Isolation, Grenzen und Netz der Sandbox. Der Nachbau unter `harness/sandboxd/` führt Befehle als Prozess in seinem
eigenen Container aus, ohne gVisor, ohne eigene Platte und ohne eigenes Netz; das prüft sandbox 02 gegen den echten Server.
Ebenso nicht: ein Aufruf über die `public_url` eines freigegebenen Ports, denn der Nachbau startet keinen Proxy; diesen Weg durch
Cloudflare und Caddy prüfen `ops/sandbox/probe.sh` und die Prüfung `sandbox` in `ops/live.sh` gegen den echten Server. Lange Befehle über 30 s geht seit sandbox 05 ein eigener Gang
(`harness/e2e/long-exec.mjs`, `docs/sandbox/lange-befehle.md`).
