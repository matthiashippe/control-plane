Schwere: 3
Goal: sandbox 11
Befund: Die Freigabe-Zeile, die Punkte 9 und 10 anerkennen (`Freigabe public_post: ok, … Prüfwert <12 Hex>`), nennt die Verlängerung bei INWX nicht; sagt Matthias „ok“, ohne verlängert zu haben, postet der Ablauf einen PR-Text mit angekreuztem Kästchen „at least two years remaining“ und dem Satz „its registration was extended“, der dann falsch ist.
Beleg: goals/sandbox/11-die-sandbox-domain-kommt-auf-die-public-suffix-list.md:218 (Muster ohne Verlängerung) | docs/sandbox/psl-pr-body.md (Kästchen zu zwei Jahren angekreuzt), docs/sandbox/psl.md Abschnitt Laufzeit („vermutlich für ein Jahr bezahlt“)
Empfehlung: Der Maker schreibt die Freigabe-Zeile nur mit dem Zusatz `Verlängerung bestätigt: <Ablaufdatum laut INWX>` und postet nichts ohne ihn; die Schritte für Matthias am Human Gate verlangen das Ablaufdatum aus dem INWX-Kundenkonto. Künftige Goals mit Gate `server_kauf` nehmen den Kauf in das Muster der Freigabe-Zeile auf.
