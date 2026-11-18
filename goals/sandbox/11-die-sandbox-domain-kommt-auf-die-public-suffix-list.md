# Sandbox Goal 11: Die Sandbox-Domain kommt auf die Public Suffix List

## Status
BLOCKED fachlich

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
- Befund vom 17.11.2026 (Matthias im Kundenkonto bei INWX, Dialog „Verlängerungsoption“): `sandboxhost.de` läuft bis 15.11.2027
  17:50 und verlängert sich jährlich automatisch. INWX verlängert eine `.de` nicht im Voraus: manuell erst ab 60 Tagen vor Ablauf
  (`https://kb.inwx.com/en-us/19/47`), und eine `.de` läuft in Jahresschritten. Zwei Jahre Restlaufzeit sind damit nicht erreichbar.
  Folge nach der Annahme zur Laufzeit unten: Das Kästchen zur Laufzeit im PR-Text bleibt leer, darunter ein ehrlicher Satz (eine `.de`
  wird nur in Jahresschritten registriert und verlängert, `sandboxhost.de` verlängert sich jedes Jahr automatisch, bezahlt bis
  2027-11-15, und wir halten sie verlängert, solange sie auf der Liste steht); der Satz in Reason for PSL Inclusion, die Registrierung
  sei vor der Einreichung verlängert worden, fällt weg. Das Gate ist nur noch `public_post`, `server_kauf` entfällt, die Aufgabe an
  Matthias hat keinen Schritt bei INWX mehr, und `Empfehlung:` nennt zusätzlich, dass das leere Kästchen eine Ablehnung
  wahrscheinlicher macht; Matthias entscheidet am Gate, ob trotzdem gepostet wird. Der Schritt mit `INWX` unter `## Schritte` in
  `psl.md` bleibt, als Blick auf die Laufzeit im Kundenkonto ohne Kauf. Zyklus 4 fasst PR-Text, Prüfwert und Blockers neu.
- Korrektur von Matthias am 17.11.2026 (privates Board, Karte zum Human Gate): PostYourPrice wird nach außen weder genannt noch
  verlinkt. Das Angebot, um das es hier geht, sind die Automatons: Sandboxes, in denen Automatons laufen, betrieben von HTC; mit
  PostYourPrice hat das nichts zu tun. Zyklus 3 fasst deshalb Eintrag, PR-Text, Prüfwert und Blockers neu, alles andere bleibt.
  In `psl-entry.txt` und `psl-pr-body.md` steht danach weder `PostYourPrice` noch `postyourprice.com`, weder `cp.hippe.eu` (leitet
  dorthin um) noch `Handsel` noch ein Link auf `matthiashippe/control-plane` (die README dort nennt PostYourPrice).
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
- `psl-entry.txt`: Zeile 1 `// Hanseatic Tech Company : https://hanseatictechcompany.com`, Zeile 2 `// Submitted by Matthias Hippe <Adresse>`,
  Zeile 3 `sandboxhost.de`. Welche Adresse, steht in der Annahme zur Mail unten.
- `psl-pr-body.md` übernimmt die Vorlage vollständig, auch ihre HTML-Kommentare und die Zeilen `<!-- FILL IN: … -->` und
  `<!-- END FILL IN -->`, und füllt nur die Stellen dazwischen; die Beispielzeilen zu Cloudflare und Let's Encrypt und die Zeile
  „REMOVE THIS LINE …“ fallen weg, weil der PR keine Grenze eines Dritten umgeht (wir nutzen Origin-CA-Zertifikate von Cloudflare,
  nicht Let's Encrypt). Ein Kästchen wird nur angekreuzt, wenn es am Tag des Postens wahr ist. Inhalt: Description of Organization
  (wer HTC ist: Hanseatic Tech Company UG (haftungsbeschränkt), Frankfurt am Main, so wie das Impressum
  `https://hanseatictechcompany.com/impressum` sie nennt, kein Wohnort und keine Person als Firma; was HTC hier anbietet: gehostete
  Sandboxes für Agents der Open-Source-Runtime Automaton (`https://github.com/Conway-Research/automaton`), je Automaton eine eigene
  Sandbox auf einem eigenen Server, bezahlt aus seinem Guthaben, ein freigegebener Port unter `sbx-<id>-<port>.sandboxhost.de`;
  dass Matthias Hippe den Dienst bei HTC gebaut hat, betreibt und einreicht; kein Produktname, keine Marke), Organization Website
  `https://hanseatictechcompany.com`, Reason for PSL Inclusion (jede Sandbox bekommt für einen freigegebenen Port einen eigenen Namen
  `sbx-<id>-<port>.sandboxhost.de`, in dem fremder Code des Kunden läuft; ohne Eintrag kann dieser Code Cookies für die ganze Domain
  setzen; warum kein anderer Weg reicht: das Präfix `__Host-` schützt nur Dienste, deren Code es benutzt, und wir schreiben den Code
  der Kunden nicht vor, ein Filter für `Set-Cookie` im Proxy fängt kein Cookie, das JavaScript im Browser setzt, und eine eigene
  registrierbare Domain je Sandbox ist nicht machbar; Konto und Zahlung laufen unter einer anderen Domain, die der Text nicht nennt; die Bestätigung zur Laufzeit von
  mindestens zwei Jahren), die Zahl der Nutzer als
  `0 (current actual count: at most <a> accounts with at least one sandbox, our own test accounts included, measured <JJJJ-MM-TT>)`
  mit `<a>` aus `## Vorher`, DNS Verification mit `dig +short TXT _psl.sandboxhost.de` und
  `"https://github.com/publicsuffix/list/pull/XXXX"` (Platzhalter `XXXX` wie in der Vorlage), Abuse Contact
  `matthias@hanseatictech.de` (steht in `LICENSE.md`); die Frage nach der Rollenadresse bleibt ehrlich unangekreuzt, mit dem Satz,
  dass die Adresse die des Einreichers bei HTC ist. Keine Zahl ohne Messung, nichts, was
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
  Spalte 0: `Art: matthias`, `Gate: public_post` (seit 17.11.2026 ohne `server_kauf`, Befund oben),
  `Aufgabe:`, `Worum:`, `Empfehlung:`. Darunter als nummerierter Punkt das Ziel `https://github.com/publicsuffix/list` (neuer PR),
  der PR-Titel, der vollständige PR-Text, der Eintrag und der Prüfwert, damit der Tech Lead sie ganz in die Karte übernimmt
  (Matthias liest auf der Karte, nicht in einer MD-Datei). `Aufgabe:` nennt die Freigabe mit „ok“ (seit 17.11.2026 ohne
  Verlängerung bei INWX, Befund oben). `Worum:` sagt in zwei
  Sätzen, warum (Cookies einer Sandbox an andere Sandboxes) und was gepostet wird. `Empfehlung:` nennt, dass die Richtlinien der PSL
  2000 bis 3000 Nutzer erwarten und der PR ehrlich `<a>` Konten nennt, die Aufnahme also abgelehnt werden oder lange liegen kann,
  empfiehlt trotzdem Verlängerung und Freigabe (wenige Euro, wenige Minuten, kein Schaden bei Ablehnung) und nennt den Rückfall im
  Proxy. Nach dem Commit mit `BLOCKED matthias` ändert sich keine der drei Dateien unter `docs/sandbox/psl*` mehr (einzige
  Ausnahme: die Korrektur von Matthias vom 17.11.2026 in Zyklus 3; für deren neuen Commit mit `BLOCKED matthias` gilt die Regel wieder).
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
- Entscheidung (Matthias, 17.11.2026, ersetzt die Annahme des Tech Leads vom 16.11.): Die Kopfzeile nennt HTC mit
  `https://hanseatictechcompany.com`, nicht PostYourPrice. Grund: PostYourPrice ist nicht das Angebot hinter den Sandboxes und wird
  nach außen nicht verlinkt; die Maintainer finden auf der Seite von HTC die Firma und im Impressum Anschrift und Kontakt, den Dienst
  selbst beschreibt der PR-Text. Unter `sandboxhost.de` antwortet weiter nichts. Die Zeile „Kopfzeile“ unter `## Goal 11` in
  `goals/sandbox/ANNAHMEN.md` zieht Zyklus 3 nach.
- Annahme (Tech Lead, 16.11.2026): PR-Text und Eintrag liegen als eigene Dateien neben `psl.md`, weil `gh pr create --body-file` dann
  genau die freigegebenen Bytes postet und der Prüfwert über sie gerechnet wird; `psl.md` erklärt sie für Matthias.

## Done Condition
- [ ] Die Ausgangslage ist gemessen: Einträge für `sandboxhost` in der PSL, das TXT `_psl.sandboxhost.de` und die Zahl der Konten mit
      Sandbox stehen mit Befehl und Uhrzeit unter `## Vorher` in `docs/sandbox/psl.md`, ohne Adresse und ohne Sandbox-ID.
      Prüfung: `awk '/^## Vorher/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -cE '^(PSL: [0-9]+ Einträge für sandboxhost|TXT _psl\.sandboxhost\.de: .+|Konten mit Sandbox: [0-9]+ \(eigene eingeschlossen\), Sandboxes: [0-9]+), 20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC$'` muss 3 ausgeben.
      Prüfung: `for w in public_suffix_list.dat 'dig +short TXT _psl.sandboxhost.de' readonly; do awk '/^## Vorher/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -qF -- "$w" || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -cE '0x[0-9a-fA-F]{40}|([0-9]{1,3}\.){3}[0-9]{1,3}' docs/sandbox/psl.md` muss 0 ausgeben.
      Prüfung (Netz): `curl -s https://publicsuffix.org/list/public_suffix_list.dat | grep -cE '^(sandboxhost\.de|herokuapp\.com)$'` muss 1 ausgeben, solange die PSL den Eintrag nicht aufgenommen hat (der Eintrag herokuapp.com ist die Gegenprobe gegen eine leere Antwort).
- [ ] Der Eintrag steht in `docs/sandbox/psl-entry.txt` genau so, wie er in die private Sektion kommt, mit einer Adresse, die vor dem
      Goal schon öffentlich im Repo stand, und `docs/sandbox/psl.md` nennt die Nachbarn, zwischen die er alphabetisch gehört.
      Prüfung: `grep -cE '^(// [A-Za-z0-9][^:]* : https://[a-z0-9./-]+|// Submitted by [A-Z][^<]* <[^ <>]+@[^ <>]+>|sandboxhost\.de)$' docs/sandbox/psl-entry.txt` muss 3 ausgeben.
      Prüfung: `echo "$(wc -l < docs/sandbox/psl-entry.txt) $(sed -n 3p docs/sandbox/psl-entry.txt) $(grep -c '[[:space:]]$' docs/sandbox/psl-entry.txt)"` muss `3 sandboxhost.de 0` ausgeben.
      Prüfung: `m=$(sed -nE '2s/^.*<([^>]+)>$/\1/p' docs/sandbox/psl-entry.txt); [ -n "$m" ] && git grep -qF -- "$m" "$(git merge-base origin/dev HEAD)" -- README.md LICENSE.md src/public/terms.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE '^(Davor|Danach): // .+ : https?://.+$' docs/sandbox/psl.md` muss 2 ausgeben.
      Prüfung (Netz): `f=$(mktemp); curl -s https://publicsuffix.org/list/public_suffix_list.dat > "$f"; a=$(sed -nE 's/^Davor: (.+)$/\1/p' docs/sandbox/psl.md); b=$(sed -nE 's/^Danach: (.+)$/\1/p' docs/sandbox/psl.md); e=$(head -1 docs/sandbox/psl-entry.txt); [ "$(sed -n '/===BEGIN PRIVATE DOMAINS===/,/===END PRIVATE DOMAINS===/p' "$f" | grep -E '^// [^ ].* : https?://' | grep -A1 -xF -- "$a" | tail -1)" = "$b" ] && printf '%s\n' "$a" "$e" "$b" | LC_ALL=en_US.UTF-8 sort -fc` muss Exit-Code 0 haben.
- [ ] Der PR-Text in `docs/sandbox/psl-pr-body.md` folgt der Vorlage des PSL-Repos mit allen Abschnitten, jede Stelle zum Ausfüllen ist
      gefüllt, die Beispielzeilen sind entfernt, und die Zahl der Nutzer ist die gemessene.
      Prüfung: `head -1 docs/sandbox/psl-pr-body.md` muss `# Public Suffix List (PSL) Submission` ausgeben.
      Prüfung: `for h in '### Checklist of required steps' '## Description of Organization' '**Organization Website:**' '## Reason for PSL Inclusion' '**Number of THOUSANDS of distinct users this request is being made to serve:**' '## DNS Verification' '**Abuse Contact:**'; do grep -qxF -- "$h" docs/sandbox/psl-pr-body.md || echo "fehlt $h"; done` muss nichts ausgeben.
      Prüfung: `echo "$(grep -c '<!-- FILL IN: ' docs/sandbox/psl-pr-body.md) $(grep -c '<!-- END FILL IN -->' docs/sandbox/psl-pr-body.md)"` muss `6 7` ausgeben.
      Prüfung: `awk '/<!-- FILL IN: /{f=1;n=0;next} /<!-- END FILL IN -->/{if(f&&n==0)e++;f=0} f&&NF{n++} END{print e+0}' docs/sandbox/psl-pr-body.md` muss 0 ausgeben.
      Prüfung: `grep -cE 'REMOVE THIS LINE|letsencrypt\.org/docs/rate-limits|add-domain-to-cf' docs/sandbox/psl-pr-body.md` muss 0 ausgeben.
      Prüfung: `for w in sandboxhost.de _psl.sandboxhost.de https://hanseatictechcompany.com https://hanseatictechcompany.com/impressum https://github.com/Conway-Research/automaton Automaton Set-Cookie __Host- 'pull/XXXX' 'current actual count:'; do grep -qF -- "$w" docs/sandbox/psl-pr-body.md || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `cat docs/sandbox/psl-entry.txt docs/sandbox/psl-pr-body.md | grep -ciE 'postyourprice|cp\.hippe\.eu|handsel|matthiashippe/control-plane'` muss 0 ausgeben.
      Prüfung: `n=$(sed -nE 's/^Konten mit Sandbox: ([0-9]+) .*/\1/p' docs/sandbox/psl.md); [ -n "$n" ] && grep -cF "current actual count: at most $n accounts" docs/sandbox/psl-pr-body.md` muss 1 ausgeben.
      Prüfung (Netz): `gh api repos/publicsuffix/list/contents/.github/pull_request_template.md -q .content | base64 -d | grep -E '^(#+ |\*\*)' | while IFS= read -r l; do grep -qxF -- "$l" docs/sandbox/psl-pr-body.md || echo "fehlt $l"; done` muss nichts ausgeben.
      Prüfung (Netz): `[ "$(gh api repos/publicsuffix/list/contents/.github/pull_request_template.md -q .content | base64 -d | grep -cE '^ *\* \[[ x]\]')" = "$(grep -cE '^ *\* \[[ x]\]' docs/sandbox/psl-pr-body.md)" ]` muss Exit-Code 0 haben.
- [ ] Titel und Prüfwert stehen in `docs/sandbox/psl.md`, und der Prüfwert ist der von Titel, PR-Text und Eintrag.
      Prüfung: `grep -cE '^PR-Titel: .*sandboxhost\.de.*$' docs/sandbox/psl.md` muss 1 ausgeben.
      Prüfung: `v=$(sed -nE 's/^Prüfwert: ([0-9a-f]{12})$/\1/p' docs/sandbox/psl.md); [ -n "$v" ] && [ "$v" = "$({ sed -nE 's/^PR-Titel: (.+)$/\1/p' docs/sandbox/psl.md; cat docs/sandbox/psl-pr-body.md docs/sandbox/psl-entry.txt; } | sha256sum | cut -c1-12)" ]` muss Exit-Code 0 haben.
- [ ] `ops/sandbox/cloudflare.py psl-txt <url>` legt genau das TXT `_psl.<domain>` in der Zone der Ports an oder ändert nur dieses,
      verweigert jede andere URL ohne Aufruf der API und fasst die Zahlungszone nie an; der Test gegen einen nachgebauten
      Cloudflare-Server war vor dem Fix rot.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/cloudflare-psl-txt.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in psl-txt _psl.sandboxhost.de TXT POST PATCH DELETE 'PSL TXT OK' CLOUDFLARE_API_BASE CLOUDFLARE_SBX_API_TOKEN CLOUDFLARE_HTC_API_TOKEN postyourprice.com HOME; do grep -qF -- "$w" test/cloudflare-psl-txt.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -cE 'listen\([1-9]|port: *[1-9]' test/cloudflare-psl-txt.test.ts` muss 0 ausgeben.
      Prüfung: `echo "$(grep -c 'psl-txt' ops/sandbox/cloudflare.py) $(grep -c 'CLOUDFLARE_API_BASE' ops/sandbox/cloudflare.py)" | awk '{print ($1>=2 && $2>=1) ? "passt" : "fehlt"}'` muss `passt` ausgeben.
      Prüfung: `python3 ops/sandbox/cloudflare.py --selftest | tail -1` muss `CLOUDFLARE SELFTEST OK` ausgeben.
- [ ] `docs/sandbox/psl.md` nennt das TXT mit Name, Wert, Befehl und Prüfung, die Laufzeit der Domain und die Schritte in der
      Reihenfolge, in der sie nach der Freigabe laufen.
      Prüfung: `awk '/^## TXT/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -cxE 'Name: _psl\.sandboxhost\.de|Wert: https://github\.com/publicsuffix/list/pull/<n>|Befehl: python3 ops/sandbox/cloudflare\.py psl-txt https://github\.com/publicsuffix/list/pull/<n>|Prüfen: dig \+short TXT _psl\.sandboxhost\.de'` muss 4 ausgeben.
      Prüfung: `awk '/^## Laufzeit/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -cE '^(Gekauft: 2026-11-15 bei INWX|Nötig: mindestens zwei Jahre Restlaufzeit am Tag der Einreichung, danach mehr als ein Jahr|RDAP: .+, 20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC)$'` muss 3 ausgeben.
      Prüfung: `awk '/^## Schritte/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -oE 'INWX|Prüfwert|gh repo fork|gh pr create|psl-txt|gh pr edit' | uniq | paste -sd' '` muss `INWX Prüfwert gh repo fork gh pr create psl-txt gh pr edit` ausgeben.
      Prüfung: `awk '/^## Schritte/{f=1;next} /^## /{f=0} f' docs/sandbox/psl.md | grep -cE '^[0-9]+\. '` muss mindestens 6 ausgeben.
      Prüfung (Netz): `curl -s https://rdap.denic.de/domain/sandboxhost.de | jq -r .ldhName` muss `sandboxhost.de` ausgeben.
- [ ] Der Rückfall für eine Ablehnung durch die PSL steht als Vorschlag mit Schwere, und die Entscheidungen dieses Goals stehen mit
      Grund unter `## Goal 11` in `goals/sandbox/ANNAHMEN.md`.
      Prüfung: `git diff --name-only --diff-filter=A $(git merge-base origin/dev HEAD) HEAD -- goals/_vorschlaege | xargs -r grep -lE '^Schwere: [1-5]$' | xargs -r grep -l 'Set-Cookie' | wc -l` muss mindestens 1 ausgeben.
      Prüfung: `for w in public_post server_kauf Prüfwert Restlaufzeit Set-Cookie Rollenadresse sbx-ports; do awk '/^## Goal 11/{f=1;next} /^## /{f=0} f' goals/sandbox/ANNAHMEN.md | grep -qiF -- "$w" || echo "fehlt $w"; done` muss nichts ausgeben.
- [ ] Alle neuen Texte sind ohne Gedankenstrich, und keine Mailadresse in ihnen ist neu im öffentlichen Repo.
      Prüfung: `cat docs/sandbox/psl.md docs/sandbox/psl-pr-body.md docs/sandbox/psl-entry.txt | grep -c $'\xe2\x80\x93\|\xe2\x80\x94'` muss 0 ausgeben.
      Prüfung: `cat docs/sandbox/psl.md docs/sandbox/psl-pr-body.md docs/sandbox/psl-entry.txt | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' | sort -u | while read -r m; do git grep -qF -- "$m" "$(git merge-base origin/dev HEAD)" -- README.md LICENSE.md src/public || echo "neu $m"; done` muss nichts ausgeben.
- [ ] Die Goal-Datei endet am Human Gate: `## Status` ist `BLOCKED matthias`, unter `## Blockers` stehen `Art: matthias`, das Gate
      `public_post`, `Aufgabe:`, `Worum:`, `Empfehlung:` und der Prüfwert; ist die Freigabe schon da, steht statt
      dessen ihre Zeile im Progress Log.
      Prüfung: `f=goals/sandbox/11-die-sandbox-domain-kommt-auf-die-public-suffix-list.md; [ "$(awk '/^## Status/{getline; print; exit}' "$f")" = "BLOCKED matthias" ] || grep -qE '^- .*Freigabe public_post: ok, .*Prüfwert [0-9a-f]{12}' "$f"` muss Exit-Code 0 haben.
      Prüfung: `f=goals/sandbox/11-die-sandbox-domain-kommt-auf-die-public-suffix-list.md; grep -qE '^- .*Freigabe public_post: ok, .*Prüfwert [0-9a-f]{12}' "$f" || [ "$(awk '/^## Blockers/{f=1;next} /^## /{f=0} f' "$f" | grep -cE '^(Art: matthias|Gate: public_post|Aufgabe: .+|Worum: .+|Empfehlung: .+)$')" = 5 ]` muss Exit-Code 0 haben.
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
- [ ] Die Karte an Matthias enthält PR-Titel, PR-Text, Eintrag und Prüfwert vollständig, seit 17.11.2026 ohne Verlängerung bei INWX,
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
- max Zyklen: 4 (ein Zyklus mehr für die Korrektur von Matthias vom 17.11.2026)
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Zyklus 1: Punkte 1 bis 12 gebaut (Messung, Eintrag, PR-Text, Prüfwert 797b2b2ddd05, `cloudflare.py psl-txt` mit Test, Vorschlag zum Rückfall, Annahmen, Human Gate). Prüfbefehle: Punkt 1 3, leer, 0, 1; Punkt 2 3, `3 sandboxhost.de 0`, Exit 0, 2, Exit 0; Punkt 3 Kopfzeile, leer, `6 7`, 0, 0, leer, 1, leer, Exit 0; Punkt 4 1, Exit 0; Punkt 5 vitest 13 passed (vorher gegen das cloudflare.py von dev 4 failed | 9 passed, weil `psl-txt` fehlte), leer, 0, passt, `CLOUDFLARE SELFTEST OK`; Punkt 6 4, 3, Reihenfolge passt, 7, `sandboxhost.de`; Punkt 7 1, leer; Punkt 8 0, leer (zwei Beispieladressen aus einem Kommentar der Vorlage entfernt); Punkt 9 drei mal Exit 0; Punkt 10 vier mal Exit 0; Punkt 11 0; Punkt 12 check grün in 93 s.
- 2026-11-16 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12; `origin/dev` (eef4c76) gemergt, nur die neue Goal-Datei konto 05 kam dazu, alle Prüfbefehle am Merge `dcf476f` neu gelaufen. Prüfbefehle: P1 3, leer, 0, Netz 1; P2 3, `3 sandboxhost.de 0`, Exit 0, 2, Netz Exit 0; P3 Kopfzeile, leer, `6 7`, 0, 0, leer, 1, Netz leer, Netz Exit 0; P4 1, Exit 0; P5 vitest Exit 0 (13 passed), leer, 0, passt, `CLOUDFLARE SELFTEST OK`; P6 4, 3, `INWX Prüfwert gh repo fork gh pr create psl-txt gh pr edit`, 7, Netz `sandboxhost.de`; P7 1, leer; P8 0, leer; P9 drei mal Exit 0; P10 Netz vier mal Exit 0; P11 0; P12 `node scripts/check.mjs` Exit 0 (grün in 120 s, 193 Dateien, 2134 Tests).
- 2026-11-17 Korrektur von Matthias auf der Karte zum Human Gate: PostYourPrice kommt aus dem PR, das Angebot sind die Automatons (Sandboxes von HTC). `## Status` von `BLOCKED matthias` auf `ACTIVE`, Kopfzeile, Website, Beschreibung und Abuse Contact im Kontext neu vorgegeben, Done-Punkte 2, 3, 4 und 9 offen, Prüfung gegen PostYourPrice in Punkt 3, Budget 4 Zyklen. Zyklus 3 baut Eintrag, PR-Text, Prüfwert und Blockers neu und setzt das Human Gate wieder.
- 2026-11-17 Zyklus 3: Punkte 3, 4 und 9 gebaut, Punkt 2 gebaut und offen (Korrektur von Matthias: Eintrag `// Hanseatic Tech Company : https://hanseatictechcompany.com`, PR-Text ohne PostYourPrice mit HTC nach dem Impressum und den Automatons, Abuse Contact die URL des Impressums, Prüfwert 669a014158af statt 797b2b2ddd05, Human Gate neu; `origin/dev` 232660a gemergt). Punkt 2 bleibt offen, weil die Netz-Prüfung mit `LC_ALL=C sort -fc` die richtige Stelle ablehnt: Nach der Sortierung des PSL-Werkzeugs (`collate.New(language.MustParse("en"))`) steht der Eintrag zwischen `Häkkinen.fi` und `Hashbang`, nach Bytes stünde `Häkkinen.fi` dahinter (`LC_ALL=en_US.utf8 sort -c` Exit 0, `LC_ALL=C sort -fc` Exit 1, Nachbarschaft in der Liste Exit 0; Begründung in ANNAHMEN.md, Kopfzeile). Prüfbefehle: P1 3, leer, 0, Netz 1; P2 3, `3 sandboxhost.de 0`, Exit 0, 2, Netz Exit 1; P3 Kopfzeile, leer, `6 7`, 0, 0, leer, 0, 1, Netz leer, Netz Exit 0; P4 1, Exit 0; P5 vitest Exit 0 (13 passed), leer, 0, passt, `CLOUDFLARE SELFTEST OK`; P6 4, 3, `INWX Prüfwert gh repo fork gh pr create psl-txt gh pr edit`, 7, Netz `sandboxhost.de`; P7 1, leer; P8 0, leer; P9 drei mal Exit 0; P10 Netz vier mal Exit 0; P11 0; P12 `node scripts/check.mjs` Exit 0 (grün in 182 s, 198 Dateien, 2180 Tests).

- 2026-11-17 Prüfbefehl korrigiert (Mac-Session für Matthias): Die Netz-Prüfung 5 von Punkt 2 sortiert jetzt mit `LC_ALL=en_US.UTF-8 sort -fc` statt nach Bytes, wie das PSL-Werkzeug (Collation en); nach Bytes fiel der Nachbar `Häkkinen.fi` durch, obwohl die Stelle stimmt. Auf dem code-host gemessen: en_US.UTF-8 Exit 0 für Häkkinen.fi, Hanseatic Tech Company, Hashbang; Gegenprobe mit Hanseatic vor Häkkinen.fi Exit 1; Nachbarschaft in der Liste passt. Punkt 2 damit erfüllt (übrige Prüfungen laut Zyklus 3: 3, `3 sandboxhost.de 0`, Exit 0, 2). Status bleibt `BLOCKED matthias`.
- 2026-11-17 Zyklus 3: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12; Punkt 2 nach der korrigierten Netz-Prüfung aus b3a5324 erfüllt (Nachbarschaft Häkkinen.fi und Hashbang, `en_US.UTF-8` Exit 0), Annahme zur Kopfzeile nachgezogen, `dev` ist im Branch. Prüfbefehle am Kopf b3a5324: P1 3, leer, 0, Netz 1; P2 3, `3 sandboxhost.de 0`, Exit 0, 2, Netz Exit 0; P3 bis P11 wie in der Zeile Zyklus 3 oben; P12 `node scripts/check.mjs` Exit 0 (grün in 182 s, 2180 Tests, Code-Stand seitdem gleich).

- 2026-11-17 Laufzeit (Mac-Session für Matthias): INWX verlängert `.de` nicht im Voraus, `sandboxhost.de` läuft bis 15.11.2027 mit jährlicher automatischer Verlängerung. `## Status` von `BLOCKED matthias` auf `ACTIVE`, Befund oben im Kontext, Gate nur noch `public_post`, Done-Punkte 3, 4 und 9 offen, Prüfung von Punkt 9 auf `Gate: public_post` und `Aufgabe: .+`. Zyklus 4 setzt das Kästchen zur Laufzeit leer mit ehrlichem Satz, streicht die Verlängerung aus Reason und Aufgabe, rechnet den Prüfwert neu und setzt das Human Gate wieder.
- 2026-11-17 Zyklus 4: Punkte 3, 4 und 9 gebaut (Laufzeit nach dem Befund von INWX: Kästchen zu zwei Jahren Restlaufzeit leer mit Zeile „Not checked“, Satz zur Verlängerung in Reason durch „paid until 2027-11-15 … keep it renewed for as long as sandboxhost.de is listed“ ersetzt, Kästchen zur Einhaltung der Richtlinien ehrlich leer, `psl.md` Laufzeit und Schritt 1 ohne Kauf, Prüfwert 8bd619501adc statt 669a014158af, Human Gate neu nur `public_post`). Prüfbefehle: P1 3, leer, 0, Netz 1; P2 3, `3 sandboxhost.de 0`, Exit 0, 2, Netz Exit 0; P3 Kopfzeile, leer, `6 7`, 0, 0, leer, 0, 1, Netz leer, Netz Exit 0; P4 1, Exit 0; P5 vitest Exit 0 (13 passed), leer, 0, passt, `CLOUDFLARE SELFTEST OK`; P6 4, 3, `INWX Prüfwert gh repo fork gh pr create psl-txt gh pr edit`, 7, Netz `sandboxhost.de`; P7 1, leer; P8 0, leer; P9 drei mal Exit 0 (vorher am Kopf 6ec7b71 Exit 1, Status ACTIVE); P10 Netz vier mal Exit 0; P11 0; P12 `node scripts/check.mjs` Exit 0 (grün in 131 s, 198 Dateien, 2180 Tests, nach dem Merge von `origin/dev` 6d19b92).
- 2026-11-17 Zyklus 4: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12; `origin/dev` (6d19b92) gemergt, alle Prüfbefehle danach neu gelaufen. Prüfbefehle: wie in der Zeile Zyklus 4 oben, unverändert nach dem Merge (P11 0, P4 Exit 0, P9 drei mal Exit 0); P12 `node scripts/check.mjs` Exit 0 (grün in 131 s, 2180 Tests).
- 2026-11-18 BLOCKED fachlich: Matthias gibt den PR an die Public Suffix List nicht frei (18.11.2026, 20:28: kein PR an die Public Suffix List, nichts geht unter seinem GitHub-Konto raus), das Human Gate `public_post` bleibt zu, und das Soll dieses Goals ist nicht erreichbar; den Schutz gegen Cookies über Sandbox-Grenzen baut sandbox 12 im Proxy (ROADMAP.md auf dev, Commit 64264a2). `origin/dev` (c9554e3) gemergt, jede andere Datei des Branches auf die Merge-Basis zurückgesetzt (`docs/sandbox/psl.md`, `docs/sandbox/psl-pr-body.md`, `docs/sandbox/psl-entry.txt`, `ops/sandbox/cloudflare.py`, `test/cloudflare-psl-txt.test.ts`, `goals/sandbox/ANNAHMEN.md`, `goals/_vorschlaege/sandbox-nacharbeit-2026-11-16-1.md`), nichts gepostet, kein TXT gesetzt, Kästchen 1 bis 9 leer, weil ihre Dateien nicht mehr auf dem Branch liegen. Prüfbefehle: P10 Netz vier mal Exit 0; P11 0; P12 `node scripts/check.mjs` Exit 0 (grün in 147 s); P1 bis P9 nicht mehr erfüllbar (Dateien zurückgesetzt, Status nicht `BLOCKED matthias`).

## Blockers
Art: fachlich
Grund: Matthias gibt den PR an die Public Suffix List nicht frei (18.11.2026, 20:28): Kein PR an die Public Suffix List, nichts geht unter seinem GitHub-Konto raus. Das Human Gate `public_post` öffnet sich damit nie, und das Soll dieses Goals (PR fertig vorbereitet, gepostet erst nach Freigabe) hat keinen Zweck mehr. Den Schutz gegen Cookies über Sandbox-Grenzen baut sandbox 12 im eigenen Proxy: `sandboxd` oder `ops/sandbox/sandbox.caddy` entfernt `Domain` aus jedem `Set-Cookie` (ROADMAP.md auf dev, Commit 64264a2). Die Deny List dieses Goals sperrt `ops/sandbox/` außer `cloudflare.py`, darum gehört der Bau nicht hierher.
Merge: ohne PASS landen nur diese Goal-Datei und die Verdicts; nichts aus dem PSL-Paket kommt nach dev.

## Ehrliche Lücken
- Punkte 1 bis 8: gebaut und von K und B in Zyklus 4 mit PASS beurteilt (Commit 075ffae, Verdicts `11-z4-K.md` und `11-z4-B.md`). Nach Matthias' Absage sind Messung, Eintrag, PR-Text, Prüfwert, `cloudflare.py psl-txt` samt Test, Doku zu TXT und Laufzeit und der Vorschlag zum Rückfall ohne Zweck und auf die Merge-Basis zurückgesetzt; die Arbeit bleibt in der Historie des Branches (Kopf vor dem Zurücksetzen 74db551). Ihre Prüfbefehle finden die Dateien nicht mehr.
- Punkt 9: Das Goal sollte am Human Gate `public_post` enden und nach Matthias' „ok“ posten. Matthias hat am 18.11.2026 abgelehnt, also kommt die Freigabe-Zeile nie, und `## Status` steht nicht mehr auf `BLOCKED matthias`. Neu vorlegen mit anderem Text hilft nicht, weil die Absage dem PR als Ganzem gilt.
- Was bleibt erfüllt: Punkt 10 (nichts in `publicsuffix/list`, kein TXT `_psl.sandboxhost.de`), Punkt 11 (nur eigene Dateien) und Punkt 12 (`check` grün).
