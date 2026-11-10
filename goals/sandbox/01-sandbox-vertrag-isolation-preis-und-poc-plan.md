# Sandbox Goal 01: Sandbox-Vertrag, Isolation, Preis und PoC-Plan

## Status
PLANNED

## Active Objective
Der Loop weiß, was die unveränderte Runtime bei Conway für Sandboxes und Domains aufruft, und hat entschieden, wie wir Sandboxes
anbieten: `docs/sandbox/vertrag.md` hält jeden Endpunkt mit Feldern und Fundstelle am Pin `d8f8168` fest, `docs/sandbox/plan.md`
entscheidet Isolation, Netz, Grenzen, Preis, die Verbindung zum Control Plane und die Schritte für sandbox 02 bis 04, und der eigene
kleine Server ist über das Human Gate `server_kauf` bestellt und vom code-host erreichbar (`docs/kette.md`, sandbox 01).
MVP: Funktion, weil Sandboxes das nächste Produkt sind (Matthias, 10.11.2026) und sandbox 02 bis 04 und domains 01 gegen diesen
Vertrag bauen statt gegen eine Vermutung über die Runtime.

## Voraussetzungen
- abrechnung Goal 01 DONE

## Kontext für den Maker
- Beleg vom 10.11.2026: Ein fremder Automaton wollte einen eigenen Dienst starten und bekam bei uns 501 für Sandboxes und 404 für
  Domains. Heute beantwortet `src/app.ts` `POST /v1/sandboxes` und `/v1/sandboxes/*` mit 501 und `GET /v1/sandboxes` mit einer leeren
  Liste; Domain-Routen gibt es nicht.
- Die Runtime liest du am Pin: `git clone https://github.com/Conway-Research/automaton` und `git checkout d8f8168` in ein Verzeichnis
  aus `mktemp -d`, nie ins Repo. Fundstellen als `src/<pfad>.ts:<zeile>` am Pin. `harness/runtime/` ändert dieses Goal nicht.
- Was fremde Runtimes in der Produktion aufgerufen haben: Pfade unter `/v1/sandboxes` und `/v1/domains` mit Status und Zahl aus dem
  Caddy-Zugriffslog, nur lesend, ohne Adressen (`loop-constraints.md`, Grundregel 8).
- Isolation: Fremder Code eines Kunden läuft nie auf dem Zahlungsserver (`loop-constraints.md`, Grundregel 7). Prüf am Paket, das du
  vorschlägst, was es kann (etwa `/dev/kvm` für MicroVMs), und entscheide mit Begründung; Netz: was eine Sandbox erreicht und was nie
  (der Zahlungsserver `76.13.144.207`, Metadaten-Adressen, andere Sandboxes); Grenzen je Sandbox für CPU, Speicher, Platte, Laufzeit;
  Preis in Credits (100000 mc = 1 USD) mit Einkauf und Marge. Die Verbindung Control Plane zu Sandbox-Server braucht kein Secret in
  `/opt/control-plane/.env`, die kein Goal von Hand ändert (etwa ein Schlüsselpaar, das der Dienst in seinem Volume erzeugt und dessen
  öffentliche Hälfte der Maker lesend holt).
- Der Kauf ist ein Human Gate, kein Bauschritt: Setz das Goal, sobald Vertrag und Plan stehen, auf `BLOCKED matthias` mit
  `Gate: server_kauf` und `Aufgabe:`, `Worum:`, `Empfehlung:` unter `## Blockers`. Die Empfehlung nennt die genauen Klicks bei Hostinger
  (Paket, Preis im Monat, etwa 5 Euro, Standort, Betriebssystem), den öffentlichen Schlüssel zum Eintragen (ein neues Paar
  `~/.ssh/id_ed25519_cp_sandbox` auf dem code-host, nur die öffentliche Hälfte auf die Karte) und was am Ende dastehen muss (die IP des
  Servers als Antwort auf der Karte). Höchstens ein paar Minuten für Matthias. Keine Zahlung, kein Konto und keine Bestellung durch den
  Loop.
- Was danach schneller zu mehr zahlenden Automatons führt: sandbox 02 richtet den Server nach dem Plan ein, sandbox 03 schaltet die API
  frei und rechnet ab, domains 01 gibt dem Dienst des Kunden einen Namen.

## Done Condition
- [ ] `docs/sandbox/vertrag.md` hat einen Abschnitt `## Endpunkte` mit einer Tabelle
      `| Methode | Pfad | Anfrage | Antwort, die die Runtime liest | Fundstelle | Bei Fehler |` und mindestens einer Zeile je Endpunkt, den
      die Runtime am Pin für Sandboxes und Domains aufruft; jede Fundstelle hat die Form `src/<pfad>.ts:<zeile>`.
      Prüfung: `awk '/^## Endpunkte/{f=1;next} /^## /{f=0} f && /^[|] (GET|POST|PUT|PATCH|DELETE) /' docs/sandbox/vertrag.md | wc -l` muss mindestens 4 ausgeben.
      Prüfung: `awk '/^## Endpunkte/{f=1;next} /^## /{f=0} f && /^[|] (GET|POST|PUT|PATCH|DELETE) /' docs/sandbox/vertrag.md | grep -vcE "src/[A-Za-z0-9_/.-]+\.ts:[0-9]+"` muss 0 ausgeben.
      Prüfung: `awk '/^## Endpunkte/{f=1;next} /^## /{f=0} f' docs/sandbox/vertrag.md | grep -cE "/v1/(sandboxes|domains)"` muss mindestens 4 ausgeben.
- [ ] Jede Fundstelle stimmt am Pin: Die Zeile im Quelltext der Runtime nennt den Pfad oder den Aufruf der Tabellenzeile.
      Prüfung (Netz): `d=$(mktemp -d) && git clone -q https://github.com/Conway-Research/automaton "$d" && git -C "$d" checkout -q d8f8168 && awk '/^## Endpunkte/{f=1;next} /^## /{f=0} f && /^[|] (GET|POST|PUT|PATCH|DELETE) /' docs/sandbox/vertrag.md | grep -oE "src/[A-Za-z0-9_/.-]+\.ts:[0-9]+" | while IFS=: read -r p n; do sed -n "${n}p" "$d/$p" | grep -qiE "sandbox|domain|fetch|request|/v1/" || echo "falsch $p:$n"; done` muss nichts ausgeben.
- [ ] `docs/sandbox/vertrag.md` hat einen Abschnitt `## Aufrufe in der Produktion` mit Pfad, Status und Zahl aus dem Caddy-Zugriffslog
      und dem Befehl, aus dem sie stammen, ohne Adresse.
      Prüfung: `awk '/^## Aufrufe in der Produktion/{f=1;next} /^## /{f=0} f' docs/sandbox/vertrag.md | grep -cE "(501|404)"` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}" docs/sandbox/vertrag.md | xargs test 0 -eq && echo sauber` muss `sauber` ausgeben.
- [ ] `docs/sandbox/plan.md` entscheidet in je einem Abschnitt `## Isolation`, `## Netz`, `## Grenzen`, `## Preis`, `## Verbindung` und
      `## Schritte`, mit Begründung; `## Netz` schließt den Zahlungsserver `76.13.144.207` aus, `## Preis` nennt Credits je Stunde in mc
      mit Einkauf und Marge, `## Schritte` nennt sandbox 02, 03 und 04.
      Prüfung: `for s in Isolation Netz Grenzen Preis Verbindung Schritte; do grep -q "^## $s" docs/sandbox/plan.md || echo "fehlt $s"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Netz/{f=1;next} /^## /{f=0} f' docs/sandbox/plan.md | grep -c "76.13.144.207"` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^## Preis/{f=1;next} /^## /{f=0} f' docs/sandbox/plan.md | grep -cE "[0-9]+ *mc"` muss mindestens 1 ausgeben.
      Prüfung: `for g in "sandbox 02" "sandbox 03" "sandbox 04"; do awk '/^## Schritte/{f=1;next} /^## /{f=0} f' docs/sandbox/plan.md | grep -q "$g" || echo "fehlt $g"; done` muss nichts ausgeben.
- [ ] Der Server ist über das Human Gate `server_kauf` bestellt und vom code-host mit dem Schlüssel `~/.ssh/id_ed25519_cp_sandbox`
      erreichbar; `docs/sandbox/server.md` nennt Anbieter, Paket, Preis im Monat und Adresse, und der Server ist nicht der Zahlungsserver.
      Prüfung: `grep -cE "^Adresse: *([0-9]{1,3}\.){3}[0-9]{1,3}$" docs/sandbox/server.md` muss 1 ausgeben.
      Prüfung: `grep -c "76.13.144.207" docs/sandbox/server.md` muss 0 ausgeben.
      Prüfung (Netz): `ssh -i ~/.ssh/id_ed25519_cp_sandbox -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 root@$(sed -nE 's/^Adresse: *//p' docs/sandbox/server.md) 'uname -sr'` muss Exit-Code 0 haben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede Zahl mit dem Befehl, aus dem sie stammt; keine Adresse und kein Name eines Kunden.
- [ ] Deutsch, kurz, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `.env*`, `src/**`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
