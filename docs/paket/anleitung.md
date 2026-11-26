# Paket der Runtime: automaton-maintained

Das gepflegte Paket der Automaton-Runtime liegt im öffentlichen Repo
[`matthiashippe/automaton`](https://github.com/matthiashippe/automaton). Wer es installiert und startet, meldet sich ohne
Einstellung bei `https://automatonhost.com` an, und jede Anfrage an den Control Plane trägt
`User-Agent: automaton-maintained/<version>`. Darüber zählt paket 02, wer über das Paket kommt.

Release: v0.2.2-maintained.2

## Installieren

Ein Befehl, ohne npm-Konto:

```bash
npm install -g github:matthiashippe/automaton#v0.2.2-maintained.2
automaton --run
```

`automaton --version` gibt `automaton-maintained 0.2.2-maintained.1` aus. Release-Seite:
https://github.com/matthiashippe/automaton/releases/tag/v0.2.2-maintained.1

## Was das Paket gegenüber Upstream ändert

Grundlage ist der Upstream-Stand `d8f8168` von `Conway-Research/automaton` (26.08.2026), derselbe Pin wie im Harness. Darüber
liegen diese Commits, jeder mit Test:

- `6c9fd22` fix(context): Runden, in denen der Agent nur Werkzeuge aufruft, bleiben im Verlauf, sonst vergisst er, was er getan hat.
- `6c25ae2` fix(config): `CONWAY_API_URL` gilt wirklich, und das Setup darf den Control Plane wählen.
- `7c66034` fix(provision): Die Anmeldung schickt `verify` genau einmal, damit der echte Fehler sichtbar wird statt eines 401.
- `61c86b2` feat(topup): Aufgeladen wird nur mit API-Key und lesbarem Guthaben; kommt eine Zahlung nicht an, stoppt jede weitere.
- `25a9c6a` feat(setup): Das Setup bietet die Wahl des Control Plane oder ein lokales Modell ohne Zahlungen.
- `68a40b8` fix(setup): `--setup` läuft auch ein zweites Mal durch.
- `5383597` docs: Das README sagt, was der Fork ist, was er ändert und wer die erste Option betreibt.
- `4d2f96f` test(context): Der Test für Runden nur mit Werkzeugen liegt in eigener Datei, damit er überhaupt läuft.
- `a2ee31a` feat(config): `https://automatonhost.com` ist die Voreinstellung und die Wahl bei Enter im Setup; `CONWAY_API_URL` und eine
  gespeicherte Wahl gehen vor und werden nie umgeschrieben.
- `6335342` fix(context): Der Token-Zähler zählt lange Folgen ohne Leerzeichen in Stücken; vorher hing er (schon am Pin), und
  `pnpm test` endete nie.
- `362926a` feat(identity): Paketname `automaton-maintained`, Version aus `package.json`, `User-Agent: automaton-maintained/<version>`
  an jeder Anfrage des Conway-Clients.
- `817c5b1` build: `dist/` liegt im Repo, damit `npm install -g github:…#<tag>` mit dem npm aus Node 22 funktioniert; ein Test hält
  `dist/` gleich dem Build aus `src/`.
- `8f09494` docs: Das README beginnt mit dem Befehl zum Installieren und nennt `automatonhost.com`.
- `1530489` feat(survival): Ist das Guthaben aufgebraucht, schreibt die Runtime ihrem Menschen im Terminal eine eigene Zeile
  „No crypto needed: pay by card, PayPal or Apple Pay at <Link>“ mit dem Kartenlink ihrer Wallet, beim Start, beim Eintritt in
  `critical` oder `dead`, bei einer 402 mit `card_url` höchstens einmal je Stunde und in `--status`, nur mit `automatonhost.com`.
- `04f23ee` release: Version `0.2.2-maintained.2`, das README des Forks nennt den neuen Tag.

## Neuer Upstream-Commit

Kommt in `Conway-Research/automaton` ein neuer Commit, der übernommen werden soll:

1. Eigenen Klon des Forks außerhalb des Goal-Worktrees anlegen, Branch vom aktuellen `main` des Forks, Upstream als Remote holen:
   `git remote add upstream https://github.com/Conway-Research/automaton && git fetch upstream`.
2. Die eigenen Commits auf den neuen Upstream-Stand setzen, auf einem neuen Branch und ohne `main` umzuschreiben:
   `git checkout -b release/<version> upstream/main && git cherry-pick $(git rev-list --reverse --no-merges d8f8168..origin/main)`.
   Konflikte je Commit lösen, jeder Commit behält seinen Test.
3. `pnpm install`, `pnpm build` (baut auch `dist/` neu, das mit in den Commit gehört) und `pnpm test`; `dist-in-sync.test.ts` muss
   grün sein, sonst passt `dist/` nicht zu `src/`.
4. Version in `package.json` hochzählen (`<upstream-version>-maintained.<n>`), PR im Fork gegen `main`, nach grüner CI mit
   `gh pr merge --merge`, nie `--force` auf `main`.
5. Tag `v<version>` auf den Merge setzen, `gh release create v<version> --verify-tag` mit kurzen Notizen, dann hier die Zeile
   `Release:`, den Installationsbefehl und die Commit-Liste anpassen, und den Pin des Harness nur in einem eigenen Goal anheben.

## Warum `dist/` im Repo liegt

Hätte die `package.json` des Pakets ein Skript `build`, `prepare` oder `install`, führte npm 10 und 11 (das npm aus Node 22) beim
globalen Installieren aus GitHub im temporären Klon einen zweiten Install aus, der `--global` erbt und genau das Verzeichnis
ersetzt, in das der eigentliche Install gerade entpackt; die Installation scheitert. Behoben ist das erst in pacote 22. Deshalb hat
das Paket kein solches Skript, `dist/` ist eingecheckt, und `pnpm build` läuft über das private Workspace-Paket `packages/build`.
