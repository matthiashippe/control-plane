# Konto Goal 01: Die Anbieter sind geklärt

## Status
ACTIVE

## Active Objective
Der Loop weiß, bei wem das Konto eines Menschen ohne Wallet liegt und wer dessen Geld in Euro auszahlt, bevor konto 02 bis 05 dagegen
bauen: `docs/konto/anbieter.md` vergleicht aus der aktuellen Doku der Anbieter (Link und Datum je Aussage) Privy und Turnkey für das
Konto (Passkey, Base und Base Sepolia, Abbuchungserlaubnis nach ERC-7715 oder als Spend Permission, Tagesgrenze on-chain, wer den
Schlüssel hält, Preis je aktivem Konto) und Bridge und Due für die Euro-Seite (Auszahlung an Privatkunden in Deutschland per SEPA, eine
feste Auszahladresse je Kunde, die Eingehendes selbst in Euro auszahlt, Einzahlung per Karte in Deutschland, Gebühren,
Identitätsprüfung, was HTC als Firma vorlegen muss) und entscheidet je Seite einen Anbieter (`ROADMAP.md`, konto 01; Grundsatz in
`docs/kette.md`, Abschnitt konto). Kein Konto wird angelegt, kein Geld bewegt.
MVP: Funktion, weil konto 02 (Handoff aufs Handy), konto 03 (Konto und Abbuchung auf Base Sepolia) und konto 05 (Ein- und Auszahlung)
gegen einen gewählten Anbieter und dessen belegte Grenzen bauen statt gegen eine Vermutung, und weil ein Anbieter ohne Auszahlung in
Euro an Kunden in Deutschland die ganze Kette widerlegt, bevor sie Code kostet.

## Voraussetzungen
- keine

## Kontext für den Maker
- Grundsatz aus `docs/kette.md`, Abschnitt konto (Matthias 13.11.2026, fast track): Wir halten nie einen Key und nie Kundengeld. Das
  Konto liegt beim Anbieter für eingebettete Wallets und wird nur mit dem Passkey des Kunden entsperrt. Jede Geldbewegung ist on-chain
  an ein Ziel gebunden: die Abbuchung für Inferenz nur in USDC, nur an unsere Adresse und mit Tagesgrenze, die Auszahlung nur an die
  feste Auszahladresse des Kunden. Credits bleiben unauszahlbar (`loop-constraints.md`, Regel 10). Der Vergleich misst jeden Anbieter
  an genau diesen Sätzen.
- Quellen: nur die Doku, Preisseiten, Bedingungen und Änderungsprotokolle der Anbieter selbst (für die Abbuchungserlaubnis dazu der
  Text von ERC-7715 und die Doku der Spend Permissions von Base), gelesen über `curl` oder einen Abruf im Lauf, nie aus der Erinnerung
  (`loop-constraints.md`, Grundregel 3). Jede Zelle der beiden Tabellen hat die Form `<Aussage> ([Quelle](https://…), Stand <JJJJ-MM-TT>)` (Tag des
  Abrufs), mehrere Quellen je Zelle sind erlaubt, ein `|` in einer Zelle nicht. Sagt die Doku nichts, steht in der Zelle `nicht dokumentiert` mit dem Link der Seite, auf der es
  stehen müsste; das ist eine Aussage, keine Lücke. Ein Preis nur auf Anfrage steht als `auf Anfrage` mit Link zur Preisseite.
- Was die Kette vom Konto braucht und die Tabelle `## Konto` deshalb je Anbieter beantwortet, eine Zeile je Frage:
  `Passkey` (Anmeldung und Entsperren nur per Passkey, ohne Mail oder Telefon; an welche Domain der Passkey gebunden ist, unsere oder
  die des Anbieters, weil die Handy-Seite aus konto 02 unter `postyourprice.com` liegt), `Base und Base Sepolia` (beide Netze,
  chainId 8453 und 84532, weil konto 03 auf Base Sepolia baut), `Abbuchungserlaubnis` (ERC-7715, Spend Permission oder eigener
  Mechanismus; nur USDC, nur an eine Adresse), `Tagesgrenze on-chain` (setzt ein Vertrag auf der Chain die Grenze durch, mit Name und
  Adresse auf Base und Base Sepolia, oder nur eine Regel beim Anbieter; konto 03 wird widerlegt, wenn eine Abbuchung über der Grenze
  durchgeht, also zählt hier nur, was die Chain erzwingt), `Wer hält den Schlüssel` (Verwahrung, Aufteilung des Schlüssels, sichere
  Umgebung; ob wir als Betreiber je einen Schlüssel oder einen Teil davon hätten), `Ausstieg` (kann der Kunde sein Konto ohne uns und
  ohne den Anbieter weiter nutzen, etwa durch Export), `Einbindung` (wie die Handy-Seite das SDK lädt, ob ohne React, was unser Server
  dafür braucht), `Preis je aktivem Konto` (dazu die Rechnung für 100 und für 1000 aktive Konten im Monat).
- Was die Kette von der Euro-Seite braucht, die Tabelle `## Euro` je Anbieter, eine Zeile je Frage: `SEPA an Privatkunden in
  Deutschland`, `Feste Auszahladresse` (eine Adresse je Kunde, an die USDC geht und die selbst per SEPA an sein Konto auszahlt; ob
  USDC auf Base dort ankommen darf), `Einzahlung per Karte in Deutschland` (Onramp direkt in das Konto des Kunden), `Gebühren` (je
  Auszahlung, je Einzahlung, je Monat), `Identitätsprüfung` (was der Kunde vorlegt, ob der Anbieter sie selbst führt und ob sie in
  einem Browser auf dem Handy läuft, weil konto 05 dorthin über den Handoff führt), `Firmenprüfung HTC` (was HTC als Firma vorlegen
  muss, wie lange es dauert), `Erlaubnis` (welche Erlaubnis in der EU der Anbieter oder sein Partner hat, mit Register).
- Entscheidung unter `## Entscheidung` als Zeilen ab Spalte 0 `Konto: <Privy|Turnkey>` und `Euro: <Bridge|Due|keiner>`, unter jeder
  eine Zeile `Grund: <ein bis drei Sätze>`. Ein Anbieter, der den Grundsatz bricht (wir hielten einen Schlüssel, die Grenze ist nur
  eine Regel beim Anbieter und kein anderer Weg schafft sie on-chain), scheidet aus, egal wie günstig er ist. Erfüllt keiner der beiden
  Konto-Anbieter alles, entscheidet das Goal den besseren und nennt unter `## Für die nächsten Goals` den Baustein, der die Lücke
  schließt (etwa ein Smart Account mit Spend Permission, dessen Eigentümer die eingebettete Wallet ist).
- Widerlegt, wenn kein Anbieter an Kunden in Deutschland in Euro per SEPA auszahlt: dann `Euro: keiner`, ein Abschnitt
  `## Anderer Weg` mit einem Vorschlag (etwa ein dritter Anbieter, den die Doku von Bridge oder Due als Partner nennt, oder Auszahlung
  in USDC an eine Börse des Kunden), und die Kette endet nach `ROADMAP.md` hier; der Writer schneidet den anderen Weg danach neu.
- `## Für die nächsten Goals` nennt je konto 02, konto 03 und konto 05, was aus der Entscheidung folgt: für konto 02 das SDK der
  Handy-Seite und die Domain des Passkeys, für konto 03 Vertrag und Adresse der Abbuchungserlaubnis auf Base Sepolia, was Matthias am
  Human Gate `security_settings` beim Anbieter anlegt (Entwickler-Zugang, Klicks, wenige Minuten) und unter welchem Namen die Werte in
  `~/brain/connectors/secrets.env` landen, für konto 05 die Firmenprüfung von HTC und die Zahlen zu Gebühren.
- Was dieses Goal entscheidet oder annimmt, steht mit Grund zusätzlich unter `## Goal 01` in `goals/konto/ANNAHMEN.md` (neu), je
  Annahme eine Zeile `- <Annahme>, weil <Grund>`.
- Kein Konto, keine Registrierung, kein Entwickler-Zugang, kein Formular und keine Anfrage an den Vertrieb eines Anbieters: Zugänge
  legt Matthias erst in konto 03 am Human Gate `security_settings` an, und jede Mail an einen Anbieter ist `third_party_mail`. Keine
  Wallet-Bewegung, auch nicht auf Base Sepolia. Das Repo ist öffentlich: kein Schlüssel, kein Token, keine Kundendaten in Doku oder
  Commit (`loop-constraints.md`, Grundregel 8). Adressen öffentlicher Verträge auf Base dürfen stehen.
- Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` im Vordergrund mit eigenem
  Timeout, neue Dateien vor dem lokalen `check` stagen.
- Was danach schneller zu mehr zahlenden Kunden führt: Mit der Entscheidung baut konto 02 den Handoff aufs Handy und konto 03 das Konto
  auf Base Sepolia; zusammen mit sandbox 07 startet dann ein Mensch aus Claude Code heraus einen Automaton, ohne je eine Wallet zu
  besitzen (konto 04), und genau an der Wallet blieben bis 23.09.2026 alle 43 Besucher hängen (`src/auth/keyless.ts`).

## Done Condition
- [x] `docs/konto/anbieter.md` vergleicht Privy und Turnkey in einer Tabelle `## Konto` mit je einer Zeile zu Passkey, Base und Base
      Sepolia, Abbuchungserlaubnis, Tagesgrenze on-chain, Schlüssel, Ausstieg, Einbindung und Preis, und jede Zeile belegt beide
      Anbieter mit Link und Datum.
      Prüfung: `awk '/^## Konto/{f=1;next} /^## /{f=0} f && /^[|]/' docs/konto/anbieter.md | head -1 | grep -cE "^[|] *Frage *[|] *Privy *[|] *Turnkey *[|]$"` muss 1 ausgeben.
      Prüfung: `for q in Passkey "Base Sepolia" Abbuchungserlaubnis "Tagesgrenze on-chain" "Schlüssel" Ausstieg Einbindung Preis; do awk '/^## Konto/{f=1;next} /^## /{f=0} f && /^[|]/' docs/konto/anbieter.md | sed -n '3,$p' | cut -d'|' -f2 | grep -qiF -- "$q" || echo "fehlt $q"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Konto/{f=1;next} /^## /{f=0} f && /^[|]/' docs/konto/anbieter.md | sed -n '3,$p' | grep -vE '^[|][^|]+[|][^|]*https://[^|]*Stand 20[0-9]{2}-[0-9]{2}-[0-9]{2}[^|]*[|][^|]*https://[^|]*Stand 20[0-9]{2}-[0-9]{2}-[0-9]{2}[^|]*[|]$' | wc -l` muss 0 ausgeben.
- [x] `docs/konto/anbieter.md` vergleicht Bridge und Due in einer Tabelle `## Euro` mit je einer Zeile zu SEPA an Privatkunden in
      Deutschland, fester Auszahladresse, Einzahlung per Karte, Gebühren, Identitätsprüfung, Firmenprüfung HTC und Erlaubnis, und jede
      Zeile belegt beide Anbieter mit Link und Datum.
      Prüfung: `awk '/^## Euro/{f=1;next} /^## /{f=0} f && /^[|]/' docs/konto/anbieter.md | head -1 | grep -cE "^[|] *Frage *[|] *Bridge *[|] *Due *[|]$"` muss 1 ausgeben.
      Prüfung: `for q in SEPA Auszahladresse Karte "Gebühren" "Identitätsprüfung" "Firmenprüfung HTC" Erlaubnis; do awk '/^## Euro/{f=1;next} /^## /{f=0} f && /^[|]/' docs/konto/anbieter.md | sed -n '3,$p' | cut -d'|' -f2 | grep -qiF -- "$q" || echo "fehlt $q"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Euro/{f=1;next} /^## /{f=0} f && /^[|]/' docs/konto/anbieter.md | sed -n '3,$p' | grep -vE '^[|][^|]+[|][^|]*https://[^|]*Stand 20[0-9]{2}-[0-9]{2}-[0-9]{2}[^|]*[|][^|]*https://[^|]*Stand 20[0-9]{2}-[0-9]{2}-[0-9]{2}[^|]*[|]$' | wc -l` muss 0 ausgeben.
- [x] Jeder Link der Doku führt auf eine Seite, die es gibt.
      Prüfung (Netz): `grep -oE 'https://[^ ),|>]+' docs/konto/anbieter.md | sort -u | while read -r u; do c=$(curl -s -o /dev/null -L --max-time 20 -w '%{http_code}' "$u"); case "$c" in 404|410) echo "$c $u";; esac; done` muss nichts ausgeben.
- [x] `## Entscheidung` entscheidet je Seite genau einen Anbieter mit Grund; fällt die Euro-Seite aus, steht der andere Weg darunter.
      Prüfung: `awk '/^## Entscheidung/{f=1;next} /^## /{f=0} f' docs/konto/anbieter.md | grep -cE "^(Konto: (Privy|Turnkey)|Euro: (Bridge|Due|keiner))$"` muss 2 ausgeben.
      Prüfung: `awk '/^## Entscheidung/{f=1;next} /^## /{f=0} f' docs/konto/anbieter.md | grep -cE "^Grund: .{20,}"` muss mindestens 2 ausgeben.
      Prüfung: `if grep -qx "Euro: keiner" docs/konto/anbieter.md; then awk '/^## Anderer Weg/{f=1;next} /^## /{f=0} f' docs/konto/anbieter.md | grep -c "Vorschlag"; else echo 1; fi` muss mindestens 1 ausgeben.
- [x] `## Für die nächsten Goals` nennt, was aus der Entscheidung für konto 02, konto 03 und konto 05 folgt, darunter Vertrag und
      Adresse der Abbuchungserlaubnis auf Base Sepolia und die Schritte am Human Gate `security_settings`.
      Prüfung: `for g in "konto 02" "konto 03" "konto 05" "Base Sepolia" security_settings; do awk '/^## Für die nächsten Goals/{f=1;next} /^## /{f=0} f' docs/konto/anbieter.md | grep -qF -- "$g" || echo "fehlt $g"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Für die nächsten Goals/{f=1;next} /^## /{f=0} f' docs/konto/anbieter.md | grep -cE "0x[0-9a-fA-F]{40}|nicht dokumentiert"` muss mindestens 1 ausgeben.
- [x] Die Annahmen stehen mit Grund in `goals/konto/ANNAHMEN.md`, und das Goal ändert nur Doku und Goal-Dateien des Topics, ohne
      Schlüssel oder Token.
      Prüfung: `awk '/^## Goal 01/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -cE "^- .+, weil .+"` muss mindestens 1 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(docs/konto/|goals/konto/|goals/_vorschlaege/konto-)' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD | grep -E '^[+]' | grep -iE "(api[_-]?key|secret|token|private[_-]?key)[\"' ]*[:=] *[\"']?[A-Za-z0-9_+/=-]{16,}|BEGIN [A-Z ]*PRIVATE KEY" | wc -l` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] `## Für die nächsten Goals` nennt für konto 05, wie die Auszahlung on-chain nur an die feste Auszahladresse des Kunden geht, ohne
      dass USDC über eine Adresse von uns läuft. `spend()` in `SpendPermissionManager` verlangt `msg.sender == spender` und zahlt nur an
      den Spender (Zeilen 420 bis 425), eine Spend Permission mit der Auszahladresse von Bridge als Spender kann also niemand ausführen,
      und eine mit unserer Adresse als Spender machte uns zum Halter von Kundengeld. Das Goal belegt aus der Quelle und wählt mit Grund
      einen Weg (etwa ein Spender-Vertrag, der jede Abbuchung im selben Aufruf fest an die eine Auszahladresse weiterleitet, oder jede
      Auszahlung signiert der Kunde per Passkey über den Handoff), die Wahl steht zusätzlich in `goals/konto/ANNAHMEN.md`.
      Prüfung: `awk '/^## Für die nächsten Goals/{f=1;next} /^## /{f=0} f' docs/konto/anbieter.md | awk '/konto 05/{g=1} g' | grep -cE "Spender|spend\(\)"` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^## Für die nächsten Goals/{f=1;next} /^## /{f=0} f' docs/konto/anbieter.md | awk '/konto 05/{g=1} g' | grep -c "Auszahladresse"` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^## Goal 01/{f=1;next} /^## /{f=0} f' goals/konto/ANNAHMEN.md | grep -c "Auszahladresse"` muss mindestens 1 ausgeben.
- [ ] Dass die Turnkey-Wallet des Kunden Eigentümer seiner Coinbase Smart Wallet sein kann, ist aus dem Quellcode der Smart Wallet
      belegt statt auf konto 03 verschoben: `MultiOwnable.sol` in `coinbase/smart-wallet` nimmt mit `addOwnerAddress` und beim Anlegen
      (Eigentümer mit 32 Byte) jede Adresse als Eigentümer, und die Turnkey-Wallet ist für die Chain eine gewöhnliche Adresse mit
      secp256k1-Signatur. Die Zeile in `## Für die nächsten Goals` und die zweite Annahme in `goals/konto/ANNAHMEN.md` sagen das mit
      Link und Datum; was konto 03 dann noch zuerst belegt, ist nur der Lauf selbst.
      Prüfung: `awk '/^## Für die nächsten Goals/{f=1;next} /^## /{f=0} f' docs/konto/anbieter.md | grep -cF "github.com/coinbase/smart-wallet"` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^## Für die nächsten Goals/{f=1;next} /^## /{f=0} f' docs/konto/anbieter.md | grep -c "addOwnerAddress"` muss mindestens 1 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede Aussage über einen Anbieter mit Link und Abrufdatum aus seiner eigenen Doku; nichts aus der Erinnerung, keine Vermutung als
      Tatsache.
- [ ] Kein Konto, kein Entwickler-Zugang, kein Formular, keine Mail an einen Anbieter, keine Wallet-Bewegung.
- [ ] Die Entscheidung hält den Grundsatz aus `docs/kette.md` ein: kein Schlüssel und kein Kundengeld bei uns, Abbuchung nur an uns mit
      Tagesgrenze on-chain, Auszahlung nur an die feste Adresse des Kunden.
- [ ] Deutsch, kurz, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `src/**`, `.env*`, `*.key`, `*.pem`
- Konto, Registrierung, Entwickler-Zugang oder Vertriebsanfrage bei einem Anbieter (Human Gates `security_settings` und
  `third_party_mail`); Kauf, Aufladung, Wallet-Bewegung, auch auf Base Sepolia (`loop-constraints.md`, Grundregeln 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-13 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7 gebaut: `docs/konto/anbieter.md` vergleicht Privy und Turnkey sowie Bridge und Due aus der Doku der Anbieter (86 Links, Stand 2026-11-13) und entscheidet Konto: Turnkey und Euro: Bridge, die Tagesgrenze kommt on-chain aus Coinbase Smart Wallet mit `SpendPermissionManager` (Code auf Base und Base Sepolia per `eth_getCode` belegt), Annahmen in `goals/konto/ANNAHMEN.md`; kein Konto, kein Formular, keine Mail, kein Geld bewegt. Prüfbefehle: P1 Kopf 1, fehlende Fragen leer, Zeilen ohne Beleg 0 (Gegenprobe ohne Stand in der Zeile Ausstieg: 1); P2 Kopf 1, fehlende Fragen leer, Zeilen ohne Beleg 0; P3 (Netz) leer (Gegenprobe https://www.bridge.xyz/pricing: 404); P4 2, 2, 1; P5 leer, 4; P6 Annahmen 9, Pfade außerhalb 0, Secrets 0; P7 `check` Exit 0 (131 Dateien, 1591 Tests).
- 2026-11-13 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7; `origin/dev` (615a34e) in den Branch gemergt, nur Goal-Dateien anderer Topics kamen dazu, alle Prüfbefehle am Merge-Kopf neu gefahren. Prüfbefehle (Node 22.23.4, PATH=/usr/bin:$PATH): P1 Kopf 1, fehlende Fragen leer, Zeilen ohne Beleg 0; P2 Kopf 1, fehlende Fragen leer, Zeilen ohne Beleg 0; P3 (Netz) 86 Links, kein 404 oder 410; P4 2, 2, 1; P5 leer, 4; P6 Annahmen 9, Pfade außerhalb 0, Secrets 0; P7 `check` grün in 165 s (131 Dateien, 1591 Tests, Exit 0). Kein Laufzeitpfad im Diff, Job `check` am PR pass; kein Gedankenstrich in hinzugefügten Zeilen.

## Blockers
