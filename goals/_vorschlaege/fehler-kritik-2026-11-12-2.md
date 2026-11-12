Schwere: 4
Goal: fehler 01
Befund: Die Warnung wirkt erst mit dem nächsten Rollout des Laufzeitpfads, aber das Guthaben reicht am 12.11. um 11:03 UTC nur noch 3,7 Tage und fällt in weniger als einem Tag unter die Schwelle.
Beleg: docs/betrieb/guthaben.md:46 („beim Verbrauch von heute fällt er in weniger als einem Tag darunter“) und docs/betrieb/guthaben.md:54 (wirkt mit dem nächsten Rollout)
Empfehlung: Der Release Manager prüft nach dem Merge von fehler 01, ob der nächste Rollout des Laufzeitpfads innerhalb von 24 Stunden kommt; sonst ein Goal, das `ops/` nach dem Merge auf den Server bringt (Pfad `ops/**` in `release` der Registrierung), statt auf einen fremden Rollout zu warten.
