# Sandbox Goal 11: Die Sandbox-Domain kommt auf die Public Suffix List

## Status
BLOCKED matthias

## Active Objective
Ist: `sandboxhost.de`, die Domain der freigegebenen Ports aus sandbox 07, steht nicht auf der Public Suffix List (PSL). Gemessen am
2026-11-16 um 05:21 UTC: `curl -s https://publicsuffix.org/list/public_suffix_list.dat | grep -c sandboxhost` gibt 0, und
`gh api -X GET search/issues -f q='repo:publicsuffix/list sandboxhost' -q .total_count` gibt 0 (kein PR, kein Issue). Darum hält ein
Browser `sbx-a-8080.sandboxhost.de` und `sbx-b-8080.sandboxhost.de` für dieselbe Site: Der Dienst in einer Sandbox kann mit
`Set-Cookie: …; Domain=sandboxhost.de` oder per JavaScript ein Cookie setzen, das der Browser an jede andere Sandbox mitschickt, und so
die Sitzung im Dienst eines anderen Kunden überschreiben oder unterschieben (`goals/sandbox/ANNAHMEN.md`, `## Goal 07`, Zeile
„Public Suffix List“).
Soll: Der PR an `publicsuffix/list` (Eintrag `sandboxhost.de` in der privaten Sektion) liegt fertig vor: Text nach der Vorlage des
PSL-Repos, Eintrag samt Kommentarkopf, TXT-Eintrag `_psl.sandboxhost.de` mit dem Befehl, der ihn anlegt, und die Schritte in
Reihenfolge, alles in `docs/sandbox/`. Das Goal steht danach am Human Gate `public_post` (dazu `server_kauf` für die Verlängerung der
Domain auf mindestens zwei Jahre Restlaufzeit) und postet nichts, bevor Matthias freigibt. Ist der PR gemergt und die Liste bei den
Browsern angekommen, kann eine Sandbox kein Cookie mehr für `sandboxhost.de` setzen, das der Browser an andere Sandboxes schickt.
Widerlegt, wenn `curl -s https://publicsuffix.org/list/public_suffix_list.dat | grep -cE '^(sandboxhost\.de|herokuapp\.com)$'` schon vor
dem ersten Commit dieses Goals 2 ausgibt (dann steht die Domain schon auf der Liste, und es ist nichts zu tun).
MVP: Funktion, weil Isolation zwischen Kunden keine Schönheit ist (`LOOP.md`, Traction zuerst): Ein Automaton, der seinen Dienst aus
sandbox 08 unter einer Adresse von `sandboxhost.de` anbietet, darf sich nicht davor fürchten müssen, dass der Dienst eines anderen
Kunden die Cookies seiner Nutzer setzt, sonst bleibt er mit seinem Dienst nicht bei uns.

## Voraussetzungen
- sandbox Goal 07 DONE

## Kontext für den Maker
- Ziel: Der Dienst eines Kunden unter `sbx-<id>-<port>.sandboxhost.de` bekommt nie ein Cookie, das eine andere Sandbox gesetzt hat.
- Herkunft: Zeile sandbox in ROADMAP.md, Glied 11. Übernimmt goals/_vorschlaege/sandbox-nacharbeit-2026-11-13-5.md (Schwere 2, Beleg
  `curl -s https://publicsuffix.org/list/public_suffix_list.dat | grep -c sandboxhost` gibt 0, `goals/sandbox/ANNAHMEN.md` Abschnitt
  Goal 07, Zeile „Public Suffix List“). Hängt nicht an sandbox 08, 09 oder 10.
- Maßgeblich sind die Vorlage des PSL-Repos, nur lesen mit
  `gh api repos/publicsuffix/list/contents/.github/pull_request_template.md -q .content | base64 -d`, die Richtlinien unter
  `https://github.com/publicsuffix/list/wiki/Guidelines` und
  `https://github.com/publicsuffix/list/wiki/Format`, `docs/sandbox/ports.md` (Domain, Kauf bei INWX am 15.11.2026, Zone im
  Cloudflare-Konto von HTC, Token `sbx-ports`) und `ops/sandbox/cloudflare.py`. Was dieses Goal entscheidet oder misst, steht mit
  Grund unter `## Goal 11` in `goals/sandbox/ANNAHMEN.md`, nie nur im Code.
- Drei Dateien unter `docs/sandbox/`: `psl.md` ist die Doku für Matthias (Deutsch) mit den Abschnitten `## Warum`, `## Vorher`,
  `## Eintrag`, `## PR`, `## TXT`, `## Laufzeit` und `## Schritte`; `psl-pr-body.md` ist der PR-Text Byte für Byte, wie
  `gh pr create --body-file` ihn postet (Englisch); `psl-entry.txt` ist der Eintrag Byte für Byte, wie er in die private Sektion von
  `public_suffix_list.dat` kommt (drei Zeilen, keine Leerzeile, kein Leerzeichen am Zeilenende).
- `## Vorher` in `psl.md`: drei Zeilen ab Spalte 0, je mit Befehl und Uhrzeit darüber, nur lesend:
  `PSL: <n> Einträge für sandboxhost, <JJJJ-MM-TT HH:MM> UTC` (aus `public_suffix_list.dat`),
  `TXT _psl.sandboxhost.de: <leer oder Wert>, <JJJJ-MM-TT HH:MM> UTC` (aus `dig +short TXT _psl.sandboxhost.de`) und
  `Konten mit Sandbox: <a> (eigene eingeschlossen), Sandboxes: <s>, <JJJJ-MM-TT HH:MM> UTC` aus der Datenbank der Produktion mit
  `readonly`, etwa `ssh -i "$CP_SSH_KEY" "$CP_HOST" docker exec deploy-cp-1 node -e '…'` mit
  `require("better-sqlite3")("/data/cp.db", { readonly: true })` und
  `SELECT count(DISTINCT address) AS accounts, count(*) AS sandboxes FROM sandboxes WHERE id NOT LIKE 'creating:%'`. Gegenprobe gegen
  Blindheit (`loop-constraints.md`, Grundregel 3): Das eigene Konto der Live-Prüfung (`ops/live.sh`) legt Sandboxes an, eine 0 bei
  `accounts` hieße also, dass die Abfrage nichts sieht. Keine Adresse und keine Sandbox-ID in die Datei.
- `## Eintrag` in `psl.md` zeigt den Inhalt von `psl-entry.txt` und nennt die Nachbarn in der privaten Sektion als zwei Zeilen ab
  Spalte 0: `Davor: <Kopfzeile des Abschnitts davor>` und `Danach: <Kopfzeile des Abschnitts danach>`, je genau so, wie die Zeile
  `// <Organisation> : <URL>` am Tag der Messung in `public_suffix_list.dat` steht. Sortiert wird nach dem Namen der Organisation,
  ohne Rücksicht auf Groß- und Kleinschreibung (Format-Seite der Richtlinien).
- `psl-entry.txt`: Zeile 1 `// PostYourPrice : https://postyourprice.com`, Zeile 2 `// Submitted by Matthias Hippe <Adresse>`,
  Zeile 3 `sandboxhost.de`. Welche Adresse, steht in der Annahme zur Mail unten.
- `psl-pr-body.md` übernimmt die Vorlage vollständig, auch ihre HTML-Kommentare und die Zeilen `<!-- FILL IN: … -->` und
  `<!-- END FILL IN -->`, und füllt nur die Stellen dazwischen; die Beispielzeilen zu Cloudflare und Let's Encrypt und die Zeile
  „REMOVE THIS LINE …“ fallen weg, weil der PR keine Grenze eines Dritten umgeht (wir nutzen Origin-CA-Zertifikate von Cloudflare,
  nicht Let's Encrypt). Ein Kästchen wird nur angekreuzt, wenn es am Tag des Postens wahr ist. Inhalt: Description of Organization
  (wer HTC ist: Hanseatic Tech Company, Matthias Hippe, Hamburg, laut `LICENSE.md`; was PostYourPrice tut: ein Conway-kompatibles
  Control Plane für Automatons mit Sandboxes auf einem eigenen Server; dass Matthias als Betreiber einreicht), Organization Website
  `https://postyourprice.com`, Reason for PSL Inclusion (jede Sandbox bekommt für einen freigegebenen Port einen eigenen Namen
  `sbx-<id>-<port>.sandboxhost.de`, in dem fremder Code des Kunden läuft; ohne Eintrag kann dieser Code Cookies für die ganze Domain
  setzen; warum kein anderer Weg reicht: das Präfix `__Host-` schützt nur Dienste, deren Code es benutzt, und wir schreiben den Code
  der Kunden nicht vor, ein Filter für `Set-Cookie` im Proxy fängt kein Cookie, das JavaScript im Browser setzt, und eine eigene
  registrierbare Domain je Sandbox ist nicht machbar; die Zahlung läuft unter einer anderen Domain; die Bestätigung zur Laufzeit von
  mindestens zwei Jahren), die Zahl der Nutzer als
  `0 (current actual count: at most <a> accounts with at least one sandbox, our own test accounts included, measured <JJJJ-MM-TT>)`
  mit `<a>` aus `## Vorher`, DNS Verification mit `dig +short TXT _psl.sandboxhost.de` und
  `"https://github.com/publicsuffix/list/pull/XXXX"` (Platzhalter `XXXX` wie in der Vorlage), Abuse Contact
  `https://postyourprice.com/impressum` (Umleitung auf `/terms#impressum`, dort steht die Mail). Keine Zahl ohne Messung, nichts, was
  die Messungen nicht tragen.
- `## PR` in `psl.md`: die Zeilen `PR-Titel: <Titel>` (Englisch, mit `sandboxhost.de`, etwa `Add sandboxhost.de`) und
  `Prüfwert: <12 Hex>`, die ersten 12 Zeichen von `sha256` über den Titel mit Zeilenende, dann `psl-pr-body.md`, dann
  `psl-entry.txt` (der Befehl steht in Punkt 4 der Done Condition). Der Prüfwert bindet die Freigabe an genau diesen Text wie
  `sha12` bei `ops/post-the-answers.py`.
- `## TXT` in `psl.md`, vier Zeilen ab Spalte 0: `Name: _psl.sandboxhost.de`, `Wert: https://github.com/publicsuffix/list/pull/<n>`,
  `Befehl: python3 ops/sandbox/cloudflare.py psl-txt https://github.com/publicsuffix/list/pull/<n>` und
  `Prüfen: dig +short TXT _psl.sandboxhost.de`. Der Eintrag bleibt stehen, solange `sandboxhost.de` auf der Liste steht.
- Neues Unterkommando `psl-txt <url>` in `ops/sandbox/cloudflare.py` (Namen im Code englisch): Es nimmt nur eine URL, die genau
  `^https://github\.com/publicsuffix/list/pull/[1-9][0-9]*$` entspricht, sonst Exit ungleich 0 ohne einen Aufruf der API. Zone ist
  `ports_domain()`, Token `CLOUDFLARE_SBX_API_TOKEN`, nie der Token der Zahlungszone. Es legt genau einen TXT-Eintrag
  `_psl.<domain>` an, dessen Wert `dig +short` als `"<url>"` zeigt; steht er schon mit demselben Wert da, schreibt es nichts; steht
  er mit einem anderen Wert da (etwa ein neuer PR), ändert es nur diesen einen Eintrag mit `PATCH`. Es löscht nie und fasst keinen
  anderen Eintrag an. Letzte Zeile `PSL TXT OK`. Docstring und `COMMANDS` nennen es. Für den Test liest `cloudflare.py` die Basis
  der API aus `CLOUDFLARE_API_BASE`, Rückfall `https://api.cloudflare.com/client/v4`.
- Test `test/cloudflare-psl-txt.test.ts` (vitest) startet einen nachgebauten Cloudflare-Server mit `listen(0)` auf `127.0.0.1`, ruft
  `python3 ops/sandbox/cloudflare.py psl-txt <url>` mit `CLOUDFLARE_API_BASE` auf den Nachbau, `CLOUDFLARE_SBX_API_TOKEN` und
  `CLOUDFLARE_HTC_API_TOKEN` mit verschiedenen Testwerten und `HOME` auf einem Ordner aus `mkdtemp` auf, damit nie
  `~/brain/connectors/secrets.env` gelesen wird. Fälle: kein Eintrag (genau ein `POST` mit Typ `TXT`, Name `_psl.sandboxhost.de`,
  Wert die URL, Exit 0, `PSL TXT OK`); derselbe Eintrag steht schon (kein `POST`, kein `PATCH`); anderer Wert (genau ein `PATCH` auf
  dessen id); URL eines anderen Repos oder ohne Nummer (Exit ungleich 0, kein Aufruf am Nachbau); in jedem Fall kein `DELETE`, keine
  Anfrage zur Zone `postyourprice.com`, jede Anfrage mit dem Token der Ports und der Eintrag `*.sandboxhost.de` des Nachbaus
  unverändert. Rot vor dem Fix, weil es `psl-txt` noch nicht gibt; die Zeile im Progress Log sagt, womit.
- `## Laufzeit` in `psl.md`, drei Zeilen ab Spalte 0: `Gekauft: 2026-11-15 bei INWX`,
  `Nötig: mindestens zwei Jahre Restlaufzeit am Tag der Einreichung, danach mehr als ein Jahr` und
  `RDAP: <was rdap.denic.de für sandboxhost.de an Ereignissen zeigt>, <JJJJ-MM-TT HH:MM> UTC`, dazu, was `docs/sandbox/ports.md`
  zur Laufzeit sagt (nur „etwa 6 € im Jahr“, keine Laufzeit).
- `## Schritte` in `psl.md`: nummerierte Schritte (`1.`, `2.`, …) in dieser Reihenfolge, jedes der Stichwörter `INWX`, `Prüfwert`,
  `gh repo fork`, `gh pr create`, `psl-txt`, `gh pr edit` in genau einem Schritt: Verlängerung bei INWX durch Matthias, Vergleich des
  Prüfwerts vor dem Posten, Fork, PR, TXT, Nummer im PR-Text. Je Schritt der Befehl und was danach dasteht. Das ist der Ablauf nach
  dem Gate unten, für Matthias lesbar.
- Rückfall, falls die PSL ablehnt: ein Vorschlag `goals/_vorschlaege/sandbox-nacharbeit-<JJJJ-MM-TT>-<n>.md` mit `Schwere: 2`, Befund
  und Empfehlung: Der Proxy von `sandboxd` entfernt das Attribut `Domain` aus jedem `Set-Cookie` einer Sandbox, damit wenigstens
  Cookies aus Antworten nur für den eigenen Namen gelten. Nicht in diesem Goal gebaut, weil es den Laufzeitpfad des Sandbox-Servers
  ändert und JavaScript im Browser nicht abfängt.
- Human Gate am Ende des Baus: committen, pushen, dann `## Status` auf `BLOCKED matthias` und unter `## Blockers` je eine Zeile ab
  Spalte 0: `Art: matthias`, `Gate: public_post, server_kauf` (`public_post` zuerst, weil der Loop Master den ersten Namen liest),
  `Aufgabe:`, `Worum:`, `Empfehlung:`. Darunter als nummerierter Punkt das Ziel `https://github.com/publicsuffix/list` (neuer PR),
  der PR-Titel, der vollständige PR-Text, der Eintrag und der Prüfwert, damit der Tech Lead sie ganz in die Karte übernimmt
  (Matthias liest auf der Karte, nicht in einer MD-Datei). `Aufgabe:` nennt zuerst die Verlängerung von `sandboxhost.de` bei INWX auf
  mindestens zwei Jahre Restlaufzeit (Klicks im Kundenkonto, Preis laut INWX), dann die Freigabe mit „ok“. `Worum:` sagt in zwei
  Sätzen, warum (Cookies einer Sandbox an andere Sandboxes) und was gepostet wird. `Empfehlung:` nennt, dass die Richtlinien der PSL
  2000 bis 3000 Nutzer erwarten und der PR ehrlich `<a>` Konten nennt, die Aufnahme also abgelehnt werden oder lange liegen kann,
  empfiehlt trotzdem Verlängerung und Freigabe (wenige Euro, wenige Minuten, kein Schaden bei Ablehnung) und nennt den Rückfall im
  Proxy. Nach dem Commit mit `BLOCKED matthias` ändert sich keine der drei Dateien unter `docs/sandbox/psl*` mehr.
- Ablauf nach dem Gate (kein Done-Punkt): Erst wenn am Topic steht, dass Matthias auf seinem privaten Board mit „ok“ freigegeben und
  die Verlängerung bestätigt hat, schreibt der Maker ins Progress Log die Zeile
  `- <Datum> Freigabe public_post: ok, <JJJJ-MM-TT HH:MM> UTC (Matthias, privates Board), Prüfwert <12 Hex>` und führt `## Schritte`
  aus: Prüfwert neu rechnen und mit dem freigegebenen vergleichen (abweichend: nichts geht raus, neues Gate);
  `gh repo fork publicsuffix/list --clone=false`, den Fork in einen Ordner aus `mktemp -d` klonen, Branch `sandboxhost-de`, den Inhalt
  von `psl-entry.txt` mit einer Leerzeile zwischen die Abschnitte `Davor` und `Danach` setzen (der Diff hat genau vier neue Zeilen
  und keine andere Änderung), Commit `Add sandboxhost.de`, Push auf den Fork;
  `gh pr create -R publicsuffix/list --head matthiashippe:sandboxhost-de --title "<PR-Titel>" --body-file docs/sandbox/psl-pr-body.md`;
  `python3 ops/sandbox/cloudflare.py psl-txt https://github.com/publicsuffix/list/pull/<n>` und `dig +short TXT _psl.sandboxhost.de`
  zeigt die URL; `gh pr edit <n> -R publicsuffix/list --body-file <Kopie>`, in der nur `XXXX` durch `<n>` ersetzt ist. Dann Link des
  PR, Ergebnis von `dig` und der Checks des PSL-Repos ins Progress Log, unter `## Blockers` „Gate public_post erledigt: …“, `## Status`
  auf `ACTIVE`; die Done-Punkte bleiben wahr, weil die Punkte 9 und 10 die Freigabe-Zeile anerkennen. Jede Antwort an die
  Maintainer der PSL, jede weitere Änderung am PR und jeder Kommentar dort ist ein neues `public_post` mit fertigem Text.
- Zugang für die Zeilen mit `(Netz)`: `set -a; . ~/.config/control-plane/loop.env; set +a`, Werte nie ausgeben. Produktion nur lesen,
  DNS nur lesen (`dig`, `ports-check`), GitHub außerhalb von `matthiashippe/control-plane` nur lesen (`gh api` mit GET,
  `gh pr list`). Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest
  im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen.
- Was danach schneller zu mehr zahlenden Automatons führt: Mit sandbox 08 betreibt ein fremder Automaton seinen Dienst bei uns; dieses
  Goal nimmt den Grund weg, aus dem ein vorsichtiger Betreiber das unter einer geteilten Domain nicht tun würde, und kostet bis zum Gate
  keinen Rollout.
- Annahme (Tech Lead, 16.11.2026): Das Goal endet am Human Gate und erreicht trotzdem PASS. Die Done-Punkte prüfen nur die
  Vorbereitung und dass vor der Freigabe nichts in `publicsuffix/list` und nichts im DNS steht; die Punkte zum Gate erkennen die
  Freigabe-Zeile im Progress Log an und bleiben danach wahr. Das Posten, das TXT und die Antworten an die Maintainer stehen nur oben
  als Ablauf nach dem Gate, weil ein Done-Punkt, der erst mit Matthias' Freigabe und dann mit der Arbeit freiwilliger Maintainer
  kippt, das Goal über Wochen offen hielte und es nie PASS erreichen ließe.
- Annahme (Tech Lead, 16.11.2026): Die Adresse im Kopf des Eintrags ist `matthias@hanseatictech.de`, weil sie schon öffentlich in
  `README.md`, `LICENSE.md` und im Impressum (`src/public/terms.ts`) steht und gelesen wird; keine private Adresse kommt neu ins
  öffentliche Repo. Die Vorlage verlangt eine Rollenadresse; das Kästchen dazu bleibt leer, mit einem Satz, dass die Adresse die des
  Impressums ist. Nennt Matthias am Gate eine Rollenadresse, tauscht der Maker sie in `psl-entry.txt` und `psl-pr-body.md`, druckt den
  neuen Prüfwert, und die Freigabe gilt erst diesem.
- Annahme (Tech Lead, 16.11.2026): `docs/sandbox/ports.md` nennt nur den Kauf am 15.11.2026 bei INWX für etwa 6 € im Jahr und keine
  Laufzeit, also ist `sandboxhost.de` vermutlich für ein Jahr bezahlt. Die PSL verlangt bei der Einreichung mindestens zwei Jahre
  Restlaufzeit; die Verlängerung bei INWX ist ein Kauf (Human Gate `server_kauf`) und gehört in dieselbe Aufgabe an Matthias wie die
  Freigabe. RDAP von DENIC zeigt für `.de` vermutlich kein Ablaufdatum; Beleg ist dann Matthias' Bestätigung auf der Karte. Bietet
  INWX keine Verlängerung im Voraus an, bleibt das Kästchen zur Laufzeit leer, der Text sagt das ehrlich, und Matthias entscheidet am
  Gate, ob trotzdem gepostet wird.
- Annahme (Tech Lead, 16.11.2026): Der Token `sbx-ports` (`CLOUDFLARE_SBX_API_TOKEN`) hat Zone DNS Edit für `sandboxhost.de`
  (`goals/sandbox/ANNAHMEN.md`, `## Goal 07`, Zeile zur Domain `sandboxhost.de`), also legt `cloudflare.py psl-txt` das TXT an, ohne
  neuen Token und ohne weitere Karte an Matthias.
- Annahme (Tech Lead, 16.11.2026): Die Kopfzeile des Eintrags nennt PostYourPrice mit `https://postyourprice.com`, die Beschreibung
  nennt HTC als Betreiber. Grund: Dort finden die Maintainer den Dienst und die Kontaktadresse für Missbrauch
  (`https://postyourprice.com/impressum`); unter `sandboxhost.de` selbst antwortet nichts (die Zone hat nur `*.sandboxhost.de`), und
  eine Seite dort wäre eine DNS-Änderung über das TXT hinaus.
- Annahme (Tech Lead, 16.11.2026): PR-Text und Eintrag liegen als eigene Dateien neben `psl.md`, weil `gh pr create --body-file` dann
  genau die freigegebenen Bytes postet und der Prüfwert über sie gerechnet wird; `psl.md` erklärt sie für Matthias.

## Done Condition
- [x] Die Ausgangslage ist gemessen: Einträge für `sandboxhost` in der PSL, das TXT `_psl.sandboxhost.de` und die Zahl der Konten mit
      Sandbox stehen mit Befehl und Uhrzeit unter `## Vorher` in `docs/sandbox/psl.md`, ohne Adresse und ohne Sandbox-ID.
      Prüfung: `awk '/^## Vorher/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -cE '^(PSL: [0-9]+ Einträge für sandboxhost|TXT _psl\.sandboxhost\.de: .+|Konten mit Sandbox: [0-9]+ \(eigene eingeschlossen\), Sandboxes: [0-9]+), 20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC$'` muss 3 ausgeben.
      Prüfung: `for w in public_suffix_list.dat 'dig +short TXT _psl.sandboxhost.de' readonly; do awk '/^## Vorher/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -qF -- "$w" || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -cE '0x[0-9a-fA-F]{40}|([0-9]{1,3}\.){3}[0-9]{1,3}' docs/sandbox/psl.md` muss 0 ausgeben.
      Prüfung (Netz): `curl -s https://publicsuffix.org/list/public_suffix_list.dat | grep -cE '^(sandboxhost\.de|herokuapp\.com)$'` muss 1 ausgeben, solange die PSL den Eintrag nicht aufgenommen hat (der Eintrag herokuapp.com ist die Gegenprobe gegen eine leere Antwort).
- [x] Der Eintrag steht in `docs/sandbox/psl-entry.txt` genau so, wie er in die private Sektion kommt, mit einer Adresse, die vor dem
      Goal schon öffentlich im Repo stand, und `docs/sandbox/psl.md` nennt die Nachbarn, zwischen die er alphabetisch gehört.
      Prüfung: `grep -cE '^(// [A-Za-z0-9][^:]* : https://[a-z0-9./-]+|// Submitted by [A-Z][^<]* <[^ <>]+@[^ <>]+>|sandboxhost\.de)$' docs/sandbox/psl-entry.txt` muss 3 ausgeben.
      Prüfung: `echo "$(wc -l < docs/sandbox/psl-entry.txt) $(sed -n 3p docs/sandbox/psl-entry.txt) $(grep -c '[[:space:]]$' docs/sandbox/psl-entry.txt)"` muss `3 sandboxhost.de 0` ausgeben.
      Prüfung: `m=$(sed -nE '2s/^.*<([^>]+)>$/\1/p' docs/sandbox/psl-entry.txt); [ -n "$m" ] && git grep -qF -- "$m" "$(git merge-base origin/dev HEAD)" -- README.md LICENSE.md src/public/terms.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE '^(Davor|Danach): // .+ : https?://.+$' docs/sandbox/psl.md` muss 2 ausgeben.
      Prüfung (Netz): `f=$(mktemp); curl -s https://publicsuffix.org/list/public_suffix_list.dat > "$f"; a=$(sed -nE 's/^Davor: (.+)$/\1/p' docs/sandbox/psl.md); b=$(sed -nE 's/^Danach: (.+)$/\1/p' docs/sandbox/psl.md); e=$(head -1 docs/sandbox/psl-entry.txt); [ "$(sed -n '/===BEGIN PRIVATE DOMAINS===/,/===END PRIVATE DOMAINS===/p' "$f" | grep -E '^// [^ ].* : https?://' | grep -A1 -xF -- "$a" | tail -1)" = "$b" ] && printf '%s\n' "$a" "$e" "$b" | LC_ALL=C sort -fc` muss Exit-Code 0 haben.
- [x] Der PR-Text in `docs/sandbox/psl-pr-body.md` folgt der Vorlage des PSL-Repos mit allen Abschnitten, jede Stelle zum Ausfüllen ist
      gefüllt, die Beispielzeilen sind entfernt, und die Zahl der Nutzer ist die gemessene.
      Prüfung: `head -1 docs/sandbox/psl-pr-body.md` muss `# Public Suffix List (PSL) Submission` ausgeben.
      Prüfung: `for h in '### Checklist of required steps' '## Description of Organization' '**Organization Website:**' '## Reason for PSL Inclusion' '**Number of THOUSANDS of distinct users this request is being made to serve:**' '## DNS Verification' '**Abuse Contact:**'; do grep -qxF -- "$h" docs/sandbox/psl-pr-body.md || echo "fehlt $h"; done` muss nichts ausgeben.
      Prüfung: `echo "$(grep -c '<!-- FILL IN: ' docs/sandbox/psl-pr-body.md) $(grep -c '<!-- END FILL IN -->' docs/sandbox/psl-pr-body.md)"` muss `6 7` ausgeben.
      Prüfung: `awk '/<!-- FILL IN: /{f=1;n=0;next} /<!-- END FILL IN -->/{if(f&&n==0)e++;f=0} f&&NF{n++} END{print e+0}' docs/sandbox/psl-pr-body.md` muss 0 ausgeben.
      Prüfung: `grep -cE 'REMOVE THIS LINE|letsencrypt\.org/docs/rate-limits|add-domain-to-cf' docs/sandbox/psl-pr-body.md` muss 0 ausgeben.
      Prüfung: `for w in sandboxhost.de _psl.sandboxhost.de https://postyourprice.com https://postyourprice.com/impressum Set-Cookie __Host- 'pull/XXXX' 'current actual count:'; do grep -qF -- "$w" docs/sandbox/psl-pr-body.md || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `n=$(sed -nE 's/^Konten mit Sandbox: ([0-9]+) .*/\1/p' docs/sandbox/psl.md); [ -n "$n" ] && grep -cF "current actual count: at most $n accounts" docs/sandbox/psl-pr-body.md` muss 1 ausgeben.
      Prüfung (Netz): `gh api repos/publicsuffix/list/contents/.github/pull_request_template.md -q .content | base64 -d | grep -E '^(#+ |\*\*)' | while IFS= read -r l; do grep -qxF -- "$l" docs/sandbox/psl-pr-body.md || echo "fehlt $l"; done` muss nichts ausgeben.
      Prüfung (Netz): `[ "$(gh api repos/publicsuffix/list/contents/.github/pull_request_template.md -q .content | base64 -d | grep -cE '^ *\* \[[ x]\]')" = "$(grep -cE '^ *\* \[[ x]\]' docs/sandbox/psl-pr-body.md)" ]` muss Exit-Code 0 haben.
- [x] Titel und Prüfwert stehen in `docs/sandbox/psl.md`, und der Prüfwert ist der von Titel, PR-Text und Eintrag.
      Prüfung: `grep -cE '^PR-Titel: .*sandboxhost\.de.*$' docs/sandbox/psl.md` muss 1 ausgeben.
      Prüfung: `v=$(sed -nE 's/^Prüfwert: ([0-9a-f]{12})$/\1/p' docs/sandbox/psl.md); [ -n "$v" ] && [ "$v" = "$({ sed -nE 's/^PR-Titel: (.+)$/\1/p' docs/sandbox/psl.md; cat docs/sandbox/psl-pr-body.md docs/sandbox/psl-entry.txt; } | sha256sum | cut -c1-12)" ]` muss Exit-Code 0 haben.
- [x] `ops/sandbox/cloudflare.py psl-txt <url>` legt genau das TXT `_psl.<domain>` in der Zone der Ports an oder ändert nur dieses,
      verweigert jede andere URL ohne Aufruf der API und fasst die Zahlungszone nie an; der Test gegen einen nachgebauten
      Cloudflare-Server war vor dem Fix rot.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/cloudflare-psl-txt.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in psl-txt _psl.sandboxhost.de TXT POST PATCH DELETE 'PSL TXT OK' CLOUDFLARE_API_BASE CLOUDFLARE_SBX_API_TOKEN CLOUDFLARE_HTC_API_TOKEN postyourprice.com HOME; do grep -qF -- "$w" test/cloudflare-psl-txt.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -cE 'listen\([1-9]|port: *[1-9]' test/cloudflare-psl-txt.test.ts` muss 0 ausgeben.
      Prüfung: `echo "$(grep -c 'psl-txt' ops/sandbox/cloudflare.py) $(grep -c 'CLOUDFLARE_API_BASE' ops/sandbox/cloudflare.py)" | awk '{print ($1>=2 && $2>=1) ? "passt" : "fehlt"}'` muss `passt` ausgeben.
      Prüfung: `python3 ops/sandbox/cloudflare.py --selftest | tail -1` muss `CLOUDFLARE SELFTEST OK` ausgeben.
- [x] `docs/sandbox/psl.md` nennt das TXT mit Name, Wert, Befehl und Prüfung, die Laufzeit der Domain und die Schritte in der
      Reihenfolge, in der sie nach der Freigabe laufen.
      Prüfung: `awk '/^## TXT/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -cxE 'Name: _psl\.sandboxhost\.de|Wert: https://github\.com/publicsuffix/list/pull/<n>|Befehl: python3 ops/sandbox/cloudflare\.py psl-txt https://github\.com/publicsuffix/list/pull/<n>|Prüfen: dig \+short TXT _psl\.sandboxhost\.de'` muss 4 ausgeben.
      Prüfung: `awk '/^## Laufzeit/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -cE '^(Gekauft: 2026-11-15 bei INWX|Nötig: mindestens zwei Jahre Restlaufzeit am Tag der Einreichung, danach mehr als ein Jahr|RDAP: .+, 20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC)$'` muss 3 ausgeben.
      Prüfung: `awk '/^## Schritte/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -oE 'INWX|Prüfwert|gh repo fork|gh pr create|psl-txt|gh pr edit' | uniq | paste -sd' '` muss `INWX Prüfwert gh repo fork gh pr create psl-txt gh pr edit` ausgeben.
      Prüfung: `awk '/^## Schritte/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -cE '^[0-9]+\. '` muss mindestens 6 ausgeben.
      Prüfung (Netz): `curl -s https://rdap.denic.de/domain/sandboxhost.de | jq -r .ldhName` muss `sandboxhost.de` ausgeben.
- [x] Der Rückfall für eine Ablehnung durch die PSL steht als Vorschlag mit Schwere, und die Entscheidungen dieses Goals stehen mit
      Grund unter `## Goal 11` in `goals/sandbox/ANNAHMEN.md`.
      Prüfung: `git diff --name-only --diff-filter=A $(git merge-base origin/dev HEAD) HEAD -- goals/_vorschlaege | xargs -r grep -lE '^Schwere: [1-5]$' | xargs -r grep -l 'Set-Cookie' | wc -l` muss mindestens 1 ausgeben.
      Prüfung: `for w in public_post server_kauf Prüfwert Restlaufzeit Set-Cookie Rollenadresse sbx-ports; do awk '/^## Goal 11/{f=1;next} /^## /{f=0} f' goals/sandbox/ANNAHMEN.md | grep -qiF -- "$w" || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Alle neuen Texte sind ohne Gedankenstrich, und keine Mailadresse in ihnen ist neu im öffentlichen Repo.
      Prüfung: `cat docs/sandbox/psl.md docs/sandbox/psl-pr-body.md docs/sandbox/psl-entry.txt | grep -c $'\xe2\x80\x93\|\xe2\x80\x94'` muss 0 ausgeben.
      Prüfung: `cat docs/sandbox/psl.md docs/sandbox/psl-pr-body.md docs/sandbox/psl-entry.txt | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' | sort -u | while read -r m; do git grep -qF -- "$m" "$(git merge-base origin/dev HEAD)" -- README.md LICENSE.md src/public || echo "neu $m"; done` muss nichts ausgeben.
- [x] Die Goal-Datei endet am Human Gate: `## Status` ist `BLOCKED matthias`, unter `## Blockers` stehen `Art: matthias`, die Gates
      `public_post` und `server_kauf`, `Aufgabe:`, `Worum:`, `Empfehlung:` und der Prüfwert; ist die Freigabe schon da, steht statt
      dessen ihre Zeile im Progress Log.
      Prüfung: `f=goals/sandbox/11-die-sandbox-domain-kommt-auf-die-public-suffix-list.md; [ "$(awk '/^## Status/{getline; print; exit}' "$f")" = "BLOCKED matthias" ] || grep -qE '^- .*Freigabe public_post: ok, .*Prüfwert [0-9a-f]{12}' "$f"` muss Exit-Code 0 haben.
      Prüfung: `f=goals/sandbox/11-die-sandbox-domain-kommt-auf-die-public-suffix-list.md; grep -qE '^- .*Freigabe public_post: ok, .*Prüfwert [0-9a-f]{12}' "$f" || [ "$(awk '/^## Blockers/{f=1;next} /^## /{f=0} f' "$f" | grep -cE '^(Art: matthias|Gate: public_post, server_kauf|Aufgabe: .*INWX.+|Worum: .+|Empfehlung: .+)$')" = 5 ]` muss Exit-Code 0 haben.
      Prüfung: `v=$(sed -nE 's/^Prüfwert: ([0-9a-f]{12})$/\1/p' docs/sandbox/psl.md); [ -n "$v" ] && grep -qF -- "$v" goals/sandbox/11-die-sandbox-domain-kommt-auf-die-public-suffix-list.md` muss Exit-Code 0 haben.
- [x] Vor der Freigabe legt kein Lauf etwas in `publicsuffix/list` an (kein PR, kein Fork, kein Kommentar) und setzt kein TXT
      `_psl.sandboxhost.de`; geprüft wird lesend, und jede Prüfung gilt als erfüllt, sobald die Freigabe-Zeile im Progress Log steht.
      Prüfung (Netz): `f=goals/sandbox/11-die-sandbox-domain-kommt-auf-die-public-suffix-list.md; grep -qE '^- .*Freigabe public_post: ok, .*Prüfwert [0-9a-f]{12}' "$f" || [ "$(gh pr list -R publicsuffix/list --author @me --search sandboxhost --state all --json number | jq length)" = 0 ]` muss Exit-Code 0 haben.
      Prüfung (Netz): `f=goals/sandbox/11-die-sandbox-domain-kommt-auf-die-public-suffix-list.md; grep -qE '^- .*Freigabe public_post: ok, .*Prüfwert [0-9a-f]{12}' "$f" || [ "$(gh api -X GET search/issues -f q='repo:publicsuffix/list sandboxhost' -q .total_count)" = 0 ]` muss Exit-Code 0 haben.
      Prüfung (Netz): `f=goals/sandbox/11-die-sandbox-domain-kommt-auf-die-public-suffix-list.md; grep -qE '^- .*Freigabe public_post: ok, .*Prüfwert [0-9a-f]{12}' "$f" || ! gh api "repos/$(gh api user -q .login)/list" -q .parent.full_name 2>/dev/null | grep -qx publicsuffix/list` muss Exit-Code 0 haben.
      Prüfung (Netz): `f=goals/sandbox/11-die-sandbox-domain-kommt-auf-die-public-suffix-list.md; grep -qE '^- .*Freigabe public_post: ok, .*Prüfwert [0-9a-f]{12}' "$f" || [ -z "$(dig +short TXT _psl.sandboxhost.de)" ]` muss Exit-Code 0 haben.
- [x] Das Goal ändert nur seine eigenen Dateien.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(docs/sandbox/psl\.md|docs/sandbox/psl-pr-body\.md|docs/sandbox/psl-entry\.txt|ops/sandbox/cloudflare\.py|test/cloudflare-psl-txt\.test\.ts|goals/_vorschlaege/sandbox-nacharbeit-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+\.md|goals/sandbox/.+)$'` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der neue Test war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Zahl in `docs/sandbox/psl.md` und im PR-Text mit dem Befehl und der Uhrzeit, aus denen sie stammt; keine Adresse, kein Name
      und keine Sandbox-ID eines Kunden, kein Token.
- [ ] Jedes angekreuzte Kästchen im PR-Text ist am Tag des Postens wahr, und der Text behauptet nichts, was die Messungen nicht tragen.
- [ ] Die Karte an Matthias enthält PR-Titel, PR-Text, Eintrag und Prüfwert vollständig, dazu die Klicks der Verlängerung bei INWX,
      und dauert für ihn wenige Minuten.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und `psl.md` Deutsch, PR-Text und Eintrag Englisch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `deploy/**`,
  `harness/**`, `src/**`, `.env*`, `*.key`, `*.pem`, `*.crt`
- unter `ops/sandbox/` alles außer `cloudflare.py`; der Sandbox-Server `72.62.51.224` und der Zahlungsserver `76.13.144.207` nur lesen,
  kein Rollout
- Schreiben in ein fremdes Repo: kein `gh repo fork`, kein `gh pr create`, kein `gh pr edit`, kein `gh pr comment`, kein
  `gh issue comment`, kein `git push` außerhalb von `matthiashippe/control-plane`, bevor die Freigabe-Zeile im Progress Log steht;
  danach nur die Schritte aus dem Ablauf nach dem Gate (Human Gate `public_post`)
- DNS: keine Änderung außer dem einen TXT `_psl.sandboxhost.de` über `cloudflare.py psl-txt` nach der Freigabe; die Zone
  `postyourprice.com` und jeder andere Eintrag in `sandboxhost.de` bleiben unberührt
- Kauf und Verlängerung der Domain nur durch Matthias am Gate `server_kauf`; keine Aufladung, keine Wallet-Bewegung
  (`loop-constraints.md`, Grundregeln 9 und 10)
- Schlüssel und Tokens nie ausgeben, in Log, Kommentar, Verdict oder Datei schreiben; keine private Mailadresse neu ins Repo
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Zyklus 1: Punkte 1 bis 12 gebaut (Messung, Eintrag, PR-Text, Prüfwert 797b2b2ddd05, `cloudflare.py psl-txt` mit Test, Vorschlag zum Rückfall, Annahmen, Human Gate). Prüfbefehle: Punkt 1 3, leer, 0, 1; Punkt 2 3, `3 sandboxhost.de 0`, Exit 0, 2, Exit 0; Punkt 3 Kopfzeile, leer, `6 7`, 0, 0, leer, 1, leer, Exit 0; Punkt 4 1, Exit 0; Punkt 5 vitest 13 passed (vorher gegen das cloudflare.py von dev 4 failed | 9 passed, weil `psl-txt` fehlte), leer, 0, passt, `CLOUDFLARE SELFTEST OK`; Punkt 6 4, 3, Reihenfolge passt, 7, `sandboxhost.de`; Punkt 7 1, leer; Punkt 8 0, leer (zwei Beispieladressen aus einem Kommentar der Vorlage entfernt); Punkt 9 drei mal Exit 0; Punkt 10 vier mal Exit 0; Punkt 11 0; Punkt 12 check grün in 93 s.

## Blockers
Art: matthias
Gate: public_post, server_kauf
Aufgabe: Erst `sandboxhost.de` im Kundenkonto bei INWX auf mindestens zwei Jahre Restlaufzeit verlängern (Domains, sandboxhost.de, Verlängerung im Voraus, Preis laut INWX, etwa 6 € je Jahr) und das bestätigen, dann den PR unten an die Public Suffix List mit „ok“ freigeben.
Worum: Ohne Eintrag auf der Public Suffix List kann der Dienst einer Sandbox ein Cookie für `sandboxhost.de` setzen, das der Browser an jede andere Sandbox schickt, also an Dienste anderer Kunden. Gepostet wird ein PR an `publicsuffix/list` mit dem Eintrag `sandboxhost.de` und dem Text unten, danach das TXT `_psl.sandboxhost.de`; Prüfwert 797b2b2ddd05.
Empfehlung: Verlängern und freigeben (wenige Euro, wenige Minuten, kein Schaden bei Ablehnung). Die Richtlinien der PSL erwarten 2000 bis 3000 Nutzer, der PR nennt ehrlich 1 Konto mit Sandbox, die Aufnahme kann also abgelehnt werden oder lange liegen; dann greift der Rückfall im Proxy von `sandboxd`, der `Domain` aus `Set-Cookie` entfernt (goals/_vorschlaege/sandbox-nacharbeit-2026-11-16-1.md).

1. Ziel: https://github.com/publicsuffix/list (neuer PR vom Fork `matthiashippe/list`, Branch `sandboxhost-de`)
2. PR-Titel: Add sandboxhost.de
3. Eintrag (private Sektion, zwischen `// Postman, Inc : https://postman.com` und `// prequalifyme.today : https://prequalifyme.today`):

    // PostYourPrice : https://postyourprice.com
    // Submitted by Matthias Hippe <matthias@hanseatictech.de>
    sandboxhost.de

4. Prüfwert: 797b2b2ddd05 (sha256 über Titel, PR-Text und Eintrag, `docs/sandbox/psl.md`, Abschnitt PR)
5. PR-Text, vollständig (`docs/sandbox/psl-pr-body.md`, hier um vier Leerzeichen eingerückt):

    # Public Suffix List (PSL) Submission

    <!--
    Each PSL PR needs to have a description, rationale, indication of DNS validation and syntax checking, as well as a number of acknowledgements from the submitter. This template must be included with each PR, and the submitting party MUST provide responses to all of the elements in order to be considered.
    -->

    <!-- #### READ THIS FIRST ####

    If you haven't yet, please read our guidelines:
    https://github.com/publicsuffix/list/wiki/Guidelines#submit-the-change

    Also, read them again, as many skip that part and 
    get confused about why their PR is delayed or does
    not get accepted when their submission doesn't follow them.

    A recent PR using the current template is 
    https://github.com/publicsuffix/list/pull/2835, although 
    the organization and description were not as substantial 
    as desired, which required maintainers' time to visit the 
    requestor's website to further research.
    Having more robust org/desc improves the PR processing 
    pace because extra cycles are not lost to research.
    For an example of what an excellent description in a PR looks like
    see https://github.com/publicsuffix/list/pull/615, 
    although that example uses an earlier template.
    -->

    ### Checklist of required steps

    * [x] Description of Organization
    * [x] Robust Reason for PSL Inclusion
    * [x] DNS verification via dig

    * [x] Each domain listed in the PRIVATE section has and shall maintain at least two years remaining on registration, and we shall keep the `_psl` TXT record in place in the respective zone(s).

    __Submitter affirms the following:__ 
    <!--
    Third-party Limits are used elsewhere, such as at Cloudflare, Let's 
    Encrypt, Apple, GitLab or others, and having an entry in the PSL alters 
    the manner in which those third-party systems or products treat 
    a given domain name or sub-domains within it.

    To be clear, it is appropriate to address how those limits impact 
    your domain(s) directly with that third-party, and it is inappropriate 
    to submit entries to the PSL as a means to work around those limits or 
    restrictions.
    -->

     * [x] We are listing *any* third-party limits that we seek to work around in our rationale such as those between iOS 14.5+ and Facebook (see [Issue #1245](https://github.com/publicsuffix/list/issues/1245) as a well-documented example)
     <!-- FILL IN (CAN BE EMPTY): Third-party limits worked around (keep this line and its END FILL IN) -->
     <!-- END FILL IN -->

    <!--
    The purpose of the question above is to expose limit workarounds.
    If there are third party limits that the PR seeks to overcome, those
    must be listed within the rationale section of this request, and 
    provide a good level of detail regarding the effort that was made to work directly 
    with the third party or parties in attempting to address this within their 
    rationale response below.
    In all cases, software and services should be discouraged from use of
    the PSL as a rate-limiting tool, and provide clear instructions to their
    own clients, partners and users on the manner in which they can directly
    request rate limit increases.
    We treat the following as an attestation in the public record of the 
    requesting party that they are not attempting to bypass rate limits through
    the PR.
    -->

     * [x] This request was _not_ submitted with the objective of working around other third-party limits.

    <!--
    Submitter will maintain domains in good standing or may lose section.

    The ongoing trust of the PSL requires it to be free of outdated or problematic entries. In making this pull request, there is a commitment by the submitter that they are going to review and maintain their relevant section. By submitting an entry, the requestor acknowledges that their entry and section may be removed if the domain does not maintain the respective _psl entries in DNS, any domain(s) within their section fail to resolve in DNS, the domain does not get renewed, expires or is otherwise unreachable. The submitter further identifies that it is their responsibility to review their submitted section within the PSL, submitting updates or removals as their domain(s) may change over time. It is also the responsibility of the submitter to provide (and keep up to date) a reachable email address within the section, and to maintain that address as it may change over time, so that they receive notices.
    -->

     * [x] The submitter acknowledges that it is their responsibility to maintain the domains within their section. This includes removing names which are no longer used, retaining the _psl DNS entry, and responding to e-mails to the supplied address. Failure to maintain entries may result in removal of individual entries or the entire section.

    <!--
    The guidelines describe which section to place the entry in, the 
    order of commented organization placement, and the order of sorting of entries. 
    (Hint: TLD then SLD, ascending sorting) Although it seems pedantic, 
    the sorting and formatting rules help ensure all of the automation 
    that uses the PSL operates correctly. Typically, both are solved or
    neither.
    -->

     * [x] The [Guidelines](https://github.com/publicsuffix/list/wiki/Guidelines) were carefully _read_ and _understood_, and this request conforms to them.
     * [x] The submission follows the [Guidelines](https://github.com/publicsuffix/list/wiki/Format) on formatting and sorting.

    <!-- 
    Sorting and formatting of the entries is outlined in the guidelines 
    and non-conforming requests are one of the largest sources of delay,
    so getting this right initially will aid successfully having it 
    proceed. Mislocated entries and trailing spaces should be avoided.
    -->

    <!--
    In your submission, please include a role-based email address rather than a personal email address under your organization name, so that we can maintain contact with your organization, independent of personnel changes.
    This email address will be used for any required verification or inquiries regarding your PSL listing. This inbox must be actively maintained and monitored for future communications from the PSL project for as long as the domain remains in the PSL. Any PSL inquiries sent to this address must receive a response within 30 days, as maintaining timely communication is required for continued inclusion in the PSL.
    -->

     * [ ] A role-based email address has been used and this inbox is actively monitored with a response time of no more than 30 days.

     Not checked: the address in the entry is the contact address published in our imprint (https://postyourprice.com/impressum), not a role address.

    **Abuse Contact:**

    <!--
    Please confirm that you have accessible abuse contact information on your website. 

    At a minimum, you must provide an abuse contact either in the form of an email address or a web form that can be used to report abuse. This contact should be easily accessible to allow concerned parties to notify the registry or subdomain operator directly when malicious activities such as phishing, malware, or abuse are detected. For example, if you provide subdomains at example.com, where users may register subdomains such as clientname.example.com, then in case of abuse, reporters should be able to visit example.com and easily find the relevant abuse contact information.
    -->

    * [x] Abuse contact information (email or web form) is available and easily accessible.

      URL where abuse contact or abuse reporting form can be found: 
      <!-- Provide the URL where an Internet user can access the abuse contact information -->
      <!-- FILL IN: Abuse contact URL (keep this line and its END FILL IN) -->
      https://postyourprice.com/impressum (redirects to https://postyourprice.com/terms#impressum, which lists the contact email address)
      <!-- END FILL IN -->

    ---

    For PRIVATE section requests that are submitting entries for domains that match their organization website's primary domain, please understand that this can have impacts that may not match the desired outcome and take a long time to roll back, if at all.

    To ensure that requested changes are entirely intentional, make sure that you read the affectation and propagation expectations, that you understand them, and confirm this understanding. 

    PR Rollbacks have lower priority, and the volunteers are unable to control when or if browsers or other parties using the PSL will refresh or update.

    <!-- 
    Seriously, carefully read the downline flow of the PSL and the 
    guidelines. Your request could very likely alter the cookie and 
    certificate (as well as other) behaviours on your core domain name in 
    ways that could be problematic for your business.

    Rollbacks are really not predictable, as those who use or incorporate 
    the PSL do what they do, and when. It is not within the PSL volunteers' 
    control to do anything about that. 

    The volunteers are busy with new requests, and rollbacks are lowest 
    priority, so if something gets broken by your PR, it will potentially 
    stay that way for an indefinite period of time (typically long).
    -->

    (Link: [about propagation/expectations](https://github.com/publicsuffix/list/wiki/Guidelines#appropriate-expectations-on-derivative-propagation-use-or-inclusion))

     * [x] *Yes, I understand*. I could break my organization's website cookies and cause other issues, and the rollback timing is acceptable. *Proceed anyway*.
    ---

    <!--
    As you complete each item in the checklist please mark it with an X.

    For example:
    * [x] Description of Organization
    -->

    ## Description of Organization
    <!--
    Provide at least 3 sentences (the more the better) but
    avoid the promotional stuff about how wonderful it is, and 
    please do not copy and paste the mission statement or 
    elevator pitch from your org's website.

    Also tell us who you (submitter) are and represent (i.e. 
    individual, non-profit volunteer, engineer at a business, etc.) 
    and what you do (i.e. DynDNS, hosting, etc.), and what your 
    role is as submitter with respect to the org and the 
    submission.

    For the org description, there is less interest in the 
    promotional / marketing information about the org and more 
    a focus on having concise description of the core focus of 
    the submitting org, specifically with context/connection 
    to this request.
    -->

    <!-- FILL IN: Description of Organization (keep this line and its END FILL IN) -->
    Hanseatic Tech Company (HTC) is the software business of Matthias Hippe in Hamburg, Germany (imprint: https://postyourprice.com/impressum). HTC operates PostYourPrice, an open-source control plane for the open-source Automaton agent runtime (https://github.com/Conway-Research/automaton) that speaks the same API as the Conway control plane: agents sign in with Sign-In with Ethereum, pay for credits in USDC, and use OpenAI-compatible inference that is billed on the server. The source code is public at https://github.com/matthiashippe/control-plane.

    The newest part of the service is sandboxes: an agent rents an isolated Linux sandbox on a dedicated host that is separate from the payment service, runs its own code there, and can expose a port of the sandbox to the internet. sandboxhost.de is the domain under which these exposed ports get their names.

    I am submitting this request myself, as the owner and operator of the service and the registrant of sandboxhost.de.
    <!-- END FILL IN -->

    **Organization Website:**
    <!-- Provide the website address of the org as a full URL (i.e. https://example.com) -->
    <!-- FILL IN: Organization Website (keep this line and its END FILL IN) -->
    https://postyourprice.com
    <!-- END FILL IN -->

    ## Reason for PSL Inclusion
    <!--
    Please tell us why your domain(s) should be listed in the PSL
    (i.e. Cookie Security, Let's Encrypt issuance, iOS/Facebook, 
    Cloudflare, etc.) and clearly confirm that any private section 
    names hold registration term longer than 2 years and shall 
    maintain more than 1 year term in order to remain listed.

    If you are attempting to work around third party limits, use 
    this area to describe how and detail the manner in which you 
    have first attempted to engage those third parties on the 
    matter.

    Please also reference any past issues or PRs 
    specifically related to this submission or section.

    Provide three or more sentences here that describe the purpose 
    for which your PR should be included in the PSL. There is no 
    upper limit, but six paragraphs seems like a rational stop.
    -->

    <!-- FILL IN: Reason for PSL Inclusion (keep this line and its END FILL IN) -->
    Cookie security between customers. When an agent exposes a port of its sandbox, the service answers at `https://sbx-<id>-<port>.sandboxhost.de`, and the code behind that name is the customer's own code, not ours. Each sandbox belongs to one customer, and different names under sandboxhost.de belong to different customers.

    Without an entry in the PSL, browsers treat all of these names as one site. A service in one sandbox can answer with `Set-Cookie: session=...; Domain=sandboxhost.de`, or set the same cookie from JavaScript, and the browser then sends that cookie to every other sandbox. One customer could overwrite or plant session cookies in the service of another customer. Listing sandboxhost.de in the PRIVATE section makes every `sbx-<id>-<port>.sandboxhost.de` its own site, which is the same isolation that existing private entries give to other hosting platforms.

    We checked other ways, and none of them covers this case. The `__Host-` cookie prefix only protects services whose code uses it, and we neither write nor control the code our customers run. Removing the `Domain` attribute from `Set-Cookie` in our proxy would not catch cookies that JavaScript sets in the browser. A separate registrable domain per sandbox is not feasible. The payment service already runs under a different domain (postyourprice.com), so this request concerns the sandbox names only; sandboxhost.de itself serves no website.

    The product is new, and the user count below is small. We are submitting now because isolation between customers has to hold from the first customer on, not only once there are thousands of them.

    sandboxhost.de was registered on 2026-11-15. Before this request was submitted, its registration was extended so that it has at least two years remaining on the day of submission, and we will keep more than one year remaining for as long as it is listed. We will keep the `_psl` TXT record in place.

    There are no past issues or PRs for this domain. This request does not work around any third-party limit: certificates for these names come from Cloudflare's Origin CA, not from Let's Encrypt, and no vendor referred us to the PSL.
    <!-- END FILL IN -->

    **Number of THOUSANDS of distinct users this request is being made to serve:**
    <!-- 
    The guidelines state that PSL inclusion is considered only for 
    projects that have achieved a minimum of 2000 - 3000 distinct 
    users or more. 

    To be clear, 'users' is the number of distinct individuals 
    working directly with a relationship with the requestor in 
    using subnames of the requested space, and is not measured 
    as the count of the audience of users that would visit to 
    or interact with the namespace(s).

    Please provide us this count, and identify if this is current 
    actual count or an estimate. -->
    <!-- FILL IN: Number of thousands of distinct users (keep this line and its END FILL IN) -->
    0 (current actual count: at most 1 accounts with at least one sandbox, our own test accounts included, measured 2026-11-16)

    This is the current actual count from our production database, not an estimate.
    <!-- END FILL IN -->

    ## DNS Verification
    <!--
    For each domain you'd like to add to the list please create
    a DNS verification record pointing to your pull request.

    For example, if you'd like to add example.com and example.net
    you would need to provide the following verifications:

    ```
    dig +short TXT _psl.example.com
    "https://github.com/publicsuffix/list/pull/XXXX"
    ```

    ```
    dig +short TXT _psl.example.net
    "https://github.com/publicsuffix/list/pull/XXXX"
    ```

    Note that XXXX is replaced with the number of your pull request.

    We ask that you leave this record in place while you want 
    your entry to remain in the PSL, so that future (TBD) 
    automation can remove entries where the record is not present.
    -->
    <!-- FILL IN: DNS verification records (keep this line and its END FILL IN) -->
    ```
    dig +short TXT _psl.sandboxhost.de
    "https://github.com/publicsuffix/list/pull/XXXX"
    ```
    <!-- END FILL IN -->
