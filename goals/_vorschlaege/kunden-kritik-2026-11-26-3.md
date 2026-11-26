Schwere: 2
Goal: kunden 14
Befund: Der Vorschlag, den kunden 14 auf seinem Goal-Branch mitbringt, trägt `Schwere: 5`, nennt aber keine verletzte Regel aus `loop-constraints.md` und kein Human Gate, sondern eine falsch gezogene Zeile der Ergebnis-Kette.
Beleg: `git show origin/goal/kunden-14:goals/_vorschlaege/kunden-kritik-2026-11-26-1.md | head -3` -> `Schwere: 5`, `Goal: kunden 14`, Befund zum Wort `kein Hausauftrag` ohne Grundregel
Empfehlung: Vor dem Merge von kunden 14 die Schwere des Vorschlags auf 3 setzen oder im Befund die Grundregel nennen, die er bricht; sonst geht er als Reparatur über die Triage und zählt beim Loop Master unter den offenen Vorschlägen ab Schwere 4, die Red Team und Kritik pausieren.
