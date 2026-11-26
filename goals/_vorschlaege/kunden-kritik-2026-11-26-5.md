Schwere: 2
Goal: kunden 15
Befund: `docs/paket/anleitung.md` sagt unter dem Installationsbefehl weiter, `automaton --version` gebe `automaton-maintained 0.2.2-maintained.1` aus, und verlinkt die Release-Seite von `v0.2.2-maintained.1`, obwohl Zeile `Release:` und Befehl schon das neue Release nennen. Die Deny List von kunden 15 erlaubte nur Zeile `Release:`, Befehl und Commit-Liste.
Beleg: `docs/paket/anleitung.md:19` und `:20`, `goals/kunden/ANNAHMEN.md` (letzte Zeile zu kunden 15)
Empfehlung: Beim nächsten Glied, das die Anleitung berührt, beide Zeilen aus der Zeile `Release:` ableiten und eine Prüfung ergänzen, die jede Nennung von `0.2.2-maintained.` außerhalb der Commit-Liste gegen den Tag in `Release:` abgleicht.
MVP: Schönheit, weil der Befehl selbst stimmt und nur die erwartete Ausgabe veraltet ist.
