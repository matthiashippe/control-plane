Schwere: 3
Goal: domains 01
Befund: domains 01 wartet auf `sandbox Goal 01 DONE`, also auf den Serverkauf am Human Gate, braucht laut Kontext aber nur `docs/sandbox/vertrag.md` und `plan.md`, die auf `goal/sandbox-01` fertig sind; damit steht der ganze Loop still.
Beleg: `git ls-tree --name-only origin/dev docs/sandbox/` -> leer; `git show origin/goal/sandbox-01:docs/sandbox/vertrag.md | grep -c /v1/domains` -> 10 | goals/domains/01-die-domain-endpunkte-der-runtime.md:13
Empfehlung: Tech Lead schneidet sandbox 01 so, dass Vertrag und Plan ohne den Serverkauf auf dev landen (Serverkauf in ein eigenes Goal sandbox 02), oder macht domains 01 nur von den Vertragsdateien abhängig. Dann baut domains 01 die Domain-Endpunkte jetzt statt nach dem Kauf.

Loop-Kritik 2026-11-11, Growth Lead. Alle drei aktiven Goals (abrechnung 04, kanal 01, sandbox 01) warten auf Matthias, seite 01 auf Budget.
