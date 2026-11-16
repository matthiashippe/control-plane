# sandboxhost.de auf der Public Suffix List

Vorbereitung des PR an `publicsuffix/list` (Goal sandbox 11). Gepostet wird erst nach Matthias' Freigabe am Human Gate
`public_post`; die Verlängerung der Domain ist ein Kauf am Gate `server_kauf`.

## Warum

Jeder freigegebene Port einer Sandbox heißt `sbx-<id>-<port>.sandboxhost.de`, und dahinter läuft fremder Code des Kunden. Solange
`sandboxhost.de` nicht auf der Public Suffix List (PSL) steht, hält ein Browser alle diese Namen für dieselbe Site: Der Dienst einer
Sandbox kann mit `Set-Cookie: …; Domain=sandboxhost.de` oder per JavaScript ein Cookie setzen, das der Browser an jede andere Sandbox
schickt, und so die Sitzung im Dienst eines anderen Kunden überschreiben oder unterschieben. Mit dem Eintrag in der privaten Sektion
ist jeder Name unter `sandboxhost.de` eine eigene Site, und so ein Cookie wird nicht mehr angenommen. Die Zahlung läuft unter
`postyourprice.com` und ist davon nicht betroffen.

## Vorher

Gemessen am 2026-11-16 vom code-host, nur lesend.

PSL, die Liste selbst (`herokuapp.com` ist die Gegenprobe gegen eine leere Antwort und gibt 1):

```
curl -s https://publicsuffix.org/list/public_suffix_list.dat | grep -c sandboxhost
curl -s https://publicsuffix.org/list/public_suffix_list.dat | grep -cE '^(sandboxhost\.de|herokuapp\.com)$'
```

PSL: 0 Einträge für sandboxhost, 2026-11-16 20:25 UTC

TXT im DNS (Gegenprobe: `dig +short TXT _psl.pages.dev` gibt zur selben Zeit `"https://github.com/publicsuffix/list/pull/1093"`,
`dig` sieht also solche Einträge):

```
dig +short TXT _psl.sandboxhost.de
```

TXT _psl.sandboxhost.de: leer, 2026-11-16 20:25 UTC

Konten mit Sandbox aus der Datenbank der Produktion, geöffnet mit `readonly: true`:

```
set -a; . ~/.config/control-plane/loop.env; set +a
ssh -i "$CP_SSH_KEY" "$CP_HOST" docker exec deploy-cp-1 node -e '…'
  require("better-sqlite3")("/data/cp.db", { readonly: true })
  SELECT count(DISTINCT address) AS accounts, count(*) AS sandboxes FROM sandboxes WHERE id NOT LIKE 'creating:%'
-> {"accounts":1,"sandboxes":68}
```

Konten mit Sandbox: 1 (eigene eingeschlossen), Sandboxes: 68, 2026-11-16 20:30 UTC

Gegenprobe in beide Richtungen: Das eigene Konto der Live-Prüfung (`ops/live.sh`) legt Sandboxes an, eine 0 bei `accounts` hieße
also, dass die Abfrage nichts sieht. Dieselbe Abfrage mit `WHERE address = ?` und der Nulladresse gibt `{"accounts":0}`, sie zählt
also nicht jede Zeile. Ohne Filter stehen 68 Zeilen in der Tabelle, keine davon mit `creating:`. Mehr als dieses eine Konto hat bisher
keine Sandbox angelegt; der PR-Text nennt darum höchstens 1 Konto.

Gefragt und nicht gefunden: `gh api -X GET search/issues -f q='repo:publicsuffix/list sandboxhost' -q .total_count` gibt 0, es gibt
keinen PR und kein Issue zu `sandboxhost` in `publicsuffix/list`.

## Eintrag

Inhalt von `docs/sandbox/psl-entry.txt`, Byte für Byte so, wie er in die private Sektion von `public_suffix_list.dat` kommt:

```
// PostYourPrice : https://postyourprice.com
// Submitted by Matthias Hippe <matthias@hanseatictech.de>
sandboxhost.de
```

Die Adresse steht schon öffentlich in `README.md`, `LICENSE.md` und im Impressum (`src/public/terms.ts`). Sortiert wird nach dem
Namen der Organisation ohne Rücksicht auf Groß- und Kleinschreibung. Nachbarn in der privaten Sektion am 2026-11-16 um 20:25 UTC:

Davor: // Postman, Inc : https://postman.com
Danach: // prequalifyme.today : https://prequalifyme.today

Der Eintrag kommt mit je einer Leerzeile davor und danach zwischen die beiden Abschnitte; geprüft mit
`printf '%s\n' <Davor> <Kopfzeile> <Danach> | LC_ALL=C sort -fc`.

## PR

PR-Titel: Add sandboxhost.de
Prüfwert: b3fa541138d7

Der PR-Text ist `docs/sandbox/psl-pr-body.md`, Byte für Byte, wie `gh pr create --body-file` ihn postet. Er folgt der Vorlage
`.github/pull_request_template.md` des PSL-Repos samt ihren Kommentaren, nur die Stellen zum Ausfüllen sind gefüllt. Angekreuzt ist
jedes Kästchen, das am Tag des Postens wahr ist; das Kästchen zur Rollenadresse bleibt leer, weil die Adresse die des Impressums ist.
Das Kästchen zu zwei Jahren Restlaufzeit ist angekreuzt und gilt erst nach der Verlängerung bei INWX; geht die nicht, wird es leer,
und es gibt einen neuen Prüfwert.

Der Prüfwert sind die ersten 12 Zeichen von sha256 über den Titel mit Zeilenende, dann den PR-Text, dann den Eintrag:

```
{ sed -nE 's/^PR-Titel: (.+)$/\1/p' docs/sandbox/psl.md; cat docs/sandbox/psl-pr-body.md docs/sandbox/psl-entry.txt; } | sha256sum | cut -c1-12
```

Er bindet die Freigabe an genau diesen Text, wie `sha12` bei `ops/post-the-answers.py`.

## TXT

Die PSL prüft für jeden Eintrag einen TXT-Eintrag, der auf den PR zeigt. Er bleibt stehen, solange `sandboxhost.de` auf der Liste
steht. `<n>` ist die Nummer des PR, die es erst nach `gh pr create` gibt.

Name: _psl.sandboxhost.de
Wert: https://github.com/publicsuffix/list/pull/<n>
Befehl: python3 ops/sandbox/cloudflare.py psl-txt https://github.com/publicsuffix/list/pull/<n>
Prüfen: dig +short TXT _psl.sandboxhost.de

`psl-txt` nimmt nur eine URL `https://github.com/publicsuffix/list/pull/<n>`, schreibt nur in die Zone `sandboxhost.de` mit dem
Token `sbx-ports`, legt genau diesen einen Eintrag an oder ändert nur ihn und löscht nie. `dig` zeigt danach den Wert in
Anführungszeichen.

## Laufzeit

Gekauft: 2026-11-15 bei INWX
Nötig: mindestens zwei Jahre Restlaufzeit am Tag der Einreichung, danach mehr als ein Jahr
RDAP: Status active, letzte Änderung 2026-11-15T17:55:10+01:00, kein Ablaufdatum, 2026-11-16 20:25 UTC

`curl -s https://rdap.denic.de/domain/sandboxhost.de | jq -c '{ldhName, events, status}'` zeigt nur das Ereignis „last changed“;
DENIC nennt für `.de` kein Ablaufdatum. `docs/sandbox/ports.md` sagt zur Laufzeit nur „etwa 6 € im Jahr“, also ist die Domain
vermutlich für ein Jahr bezahlt. Beleg für die zwei Jahre ist Matthias' Bestätigung der Verlängerung am Gate.

## Schritte

Ablauf nach der Freigabe, in dieser Reihenfolge. Davor geht nichts an `publicsuffix/list` und nichts ins DNS.

1. Matthias verlängert `sandboxhost.de` im Kundenkonto bei INWX (Domains, `sandboxhost.de`, Verlängerung im Voraus) auf mindestens
   zwei Jahre Restlaufzeit und bestätigt das am Gate. Danach steht im Kundenkonto ein Ablaufdatum nach dem 2028-11-16.
2. Der Maker rechnet den Prüfwert mit dem Befehl aus `## PR` neu und vergleicht ihn mit dem freigegebenen. Weicht er ab, geht nichts
   raus, und es gibt ein neues Gate. Danach steht die Zeile „Freigabe public_post: ok, …“ im Progress Log der Goal-Datei.
3. `gh repo fork publicsuffix/list --clone=false`, dann den Fork in einen Ordner aus `mktemp -d` klonen, Branch `sandboxhost-de`, den
   Inhalt von `psl-entry.txt` mit je einer Leerzeile zwischen die Abschnitte `Davor` und `Danach` setzen, Commit
   `Add sandboxhost.de`, Push auf den Fork. Danach zeigt `git diff HEAD~1` genau vier neue Zeilen und keine andere Änderung.
4. `gh pr create -R publicsuffix/list --head matthiashippe:sandboxhost-de --title "Add sandboxhost.de" --body-file docs/sandbox/psl-pr-body.md`.
   Danach gibt es den PR mit der Nummer `<n>`.
5. `python3 ops/sandbox/cloudflare.py psl-txt https://github.com/publicsuffix/list/pull/<n>`, letzte Zeile `PSL TXT OK`. Danach zeigt
   `dig +short TXT _psl.sandboxhost.de` den Wert `"https://github.com/publicsuffix/list/pull/<n>"`.
6. Eine Kopie des PR-Texts aus `mktemp`, in der nur `XXXX` durch `<n>` ersetzt ist, dann
   `gh pr edit <n> -R publicsuffix/list --body-file <Kopie>`. Danach zeigt der PR die echte Nummer im Abschnitt DNS Verification.
7. Link des PR, Ausgabe von `dig` und das Ergebnis der Checks des PSL-Repos ins Progress Log, unter `## Blockers` „Gate public_post
   erledigt: …“, `## Status` auf `ACTIVE`. Jede Antwort an die Maintainer und jede weitere Änderung am PR ist ein neues `public_post`
   mit fertigem Text.
