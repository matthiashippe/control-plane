Schwere: 4
Goal: werbung 03
Befund: Der Richtungs-Check soll den Wochenlauf fahren (Entscheidung 9), aber sein Pflege-PR darf nur `docs/richtung/<JJJJ-MM-TT>.md`, `ROADMAP.md` und bestehende Goal-Dateien ändern, und sein Prompt nennt die zwei Befehle nicht; die Zeile der Woche und ihre Antworten kommen so nie ins Repo.
Beleg: `~/work/code-host/paperclip/lib/loop-gate.mjs:450` (courseRule: „darf nur docs/richtung/<JJJJ-MM-TT>.md anlegen …“) und `~/work/code-host/routines/loop-master/lib/course.mjs:201` („Dazu die Messwerkzeuge des Loops (Trichter, Search Console, Antworten auf Mails)“)
Empfehlung: Im code-host (Tech Lead, Werkzeug loop-gate): courseRule erlaubt dem Richtungs-Check im Loop control-plane zusätzlich angehängte Zeilen im Format von werbung 03 in `docs/kunden/agenten-probe.md` (keine bestehende Zeile geändert) und neue Dateien `docs/kunden/agenten-probe/<JJJJ-Www>.md`, und der Prompt von course.mjs verweist auf `### Weekly run` in `ops/README.md`. Bis dahin trägt Kritik-Punkt 1 von werbung 03 jede Woche aus dem Zustand beim nächsten committbaren Lauf nach.
MVP: Funktion, weil ohne die Zeile im Repo keine Woche mit der vorigen verglichen werden kann.
