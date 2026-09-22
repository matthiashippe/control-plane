Lies zuerst loop-constraints.md und loop-dauerauftrag.md im Repo. Beides gilt fuer diesen Auftrag.
Insbesondere: NICHTS nach aussen, kein Deploy, kein Push auf main, keine Issue-Kommentare, keine
Nachricht an Dritte. Du aenderst KEINEN Code und KEINEN Text. Du lieferst einen Bericht.

WICHTIG ZUM STAND DES REPOS: Dein Worktree haengt an origin/main, und die laufende Arbeit liegt in
der Regel auf einem Branch `loop/*` mit offenem Draft-PR. Hol ihn (`git fetch origin` und dann den
Branch aus `gh pr list`), sonst pruefst du Dateien, die es nicht mehr gibt, und vermisst welche,
die es gibt. Die LEBENDEN Seiten unter https://cp.hippe.eu sind immer aktuell: Wenn Repo und Netz
auseinandergehen, ist das Netz die Wahrheit und das Repo der veraltete Teil.

DIE AUFGABE

Handsel (https://cp.hippe.eu) soll oeffentlich werden: ein Artikel auf Hacker News und Antworten in
fremden GitHub-Issues. Du bist der feindselige Leser, der als erster darauf stoesst und ihn
widerlegen will. Nicht ein Lektor. Ein Gegner mit Zeit, einem Browser und der Absicht, den Autor
als unehrlich oder schlampig vorzufuehren.

Was du pruefst, in dieser Reihenfolge:

1. DIE LEBENDEN SEITEN. https://cp.hippe.eu und von dort /fix, /post, /jobs, /receipts, /x402,
   /conway, /terms, /bounties.json, /receipts.json, /llms.txt, /v1/status, /.well-known/x402. Jede
   Behauptung auf einer Seite gegen das, was eine andere Seite oder die API sagt. Wo widerspricht
   sich der Auftritt? Wo steht eine Zahl, die eine andere Stelle anders nennt? Wo verspricht eine
   Seite etwas, das die API nicht einloest? **Klick jeden Verweis, den eine Seite dem Leser gibt,
   und sieh nach, ob dort steht, was versprochen wurde.** Probiere die Aufrufe aus, die auf /post
   und /fix stehen, als jemand ohne Schluessel. Sag, was du wirklich bekommen hast.

2. DER ARTIKEL, unten im vollen Wortlaut. Jede Zahl, jede Kausalbehauptung, jede Zuschreibung.
   **Rechne nach, und zwar so, wie ein Leser es kann: mit den veroeffentlichten Skripten auf den
   veroeffentlichten Daten in docs/research/data/, und mit den Zahlen, die der Text selbst
   nebeneinanderstellt.** Wo behauptet der Text mehr, als die Daten tragen? Wo ist eine Korrelation
   als Ursache formuliert? Wo wird ueber Dritte etwas gesagt, das man gegen den Autor wenden kann,
   weil es auf ihn selbst zutrifft? Wo geht eine Summe nicht auf?

3. DAS REPO gegen die Texte. docs/bounties.md, docs/journeys.md, docs/api-key.md,
   docs/without-control-plane.md, README.md, ops/README.md. Stimmt, was dort steht, mit dem Dienst
   ueberein? Ein Leser, der dem Artikel folgt, landet in diesen Dateien.

4. DIE PRUEFUNGEN SELBST. `ops/check-all.sh`, `ops/vor-dem-artikel.py`, `ops/upstream-claims.py`,
   die Tests unter `test/`. **Welche davon kann nicht fallen?** Eine Pruefung, die zwei Lesarten
   derselben Quelle vergleicht, ist Dekoration. Genau so eine hat am 21.09. sieben falsche Zahlen
   im Artikel durchgelassen. Nimm dir die Zeit, fuer jede wichtige Pruefung zu sagen, wodurch sie
   rot wuerde.

WAS EIN BEFUND IST

Eine Stelle, die ein Fremder mit einem Beleg angreifen kann. Kein Geschmack, keine Stilfrage, keine
Vermutung. Zu jedem Befund gehoeren: die genaue Stelle (Datei und Zeile oder URL und Satz), was
falsch oder angreifbar ist, womit der Angreifer es belegt, und wie schwer es wiegt.

Sortiere nach Schwere. Ein Befund, der den ganzen Text unglaubwuerdig macht, steht oben. Eine
ungenaue Formulierung steht unten. Wenn du nichts findest, sag das und zeige, wonach du gesucht
hast, damit der naechste Lauf nicht dasselbe nochmal sucht.

WAS DU LIEFERST

Einen Bericht in Markdown, deutsch, ohne Gedankenstriche, mit einer Ueberschrift `### B<n>. <Titel>`
je Befund. Oben die drei schwersten in je drei Saetzen. Darunter die vollstaendige Liste. Am Ende:
wonach du gesucht und nichts gefunden hast.
