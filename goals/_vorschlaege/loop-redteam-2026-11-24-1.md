Schwere: 3
Goal: keines
Befund: `LocalSettler` in `src/payments/settler.ts` settlet selbst per `transferWithAuthorization` und liegt im Produktcode statt unter `harness/`; `settlerFromEnv` schaltet ihn mit `CP_SETTLER=local` ein, ohne `CP_CHAIN_ID` ist die Kette 8453 (Base-Hauptnetz), und der Code prüft weder Kette noch Umgebung.
Beleg: `git grep -n -E 'class LocalSettler|CP_CHAIN_ID \|\| 8453|writeContract\(' origin/dev -- src | cut -d: -f2,3` -> `src/payments/settler.ts:71`, `src/payments/settler.ts:95`, `src/payments/settler.ts:131` | loop-constraints.md:53
Empfehlung: `LocalSettler` zieht nach `harness/` um, oder `settlerFromEnv` verweigert `local` für jede Kette außer der Anvil-Kette des Harness, mit einem Test dafür.

## Herleitung

Grundregel 10 verbietet Facilitator-Code, der selbst settlet, außerhalb von `harness/`; keine der beiden Ausnahmen (Base Sepolia, Hauptnetz für das Topic konto) deckt einen USDC-`transferWithAuthorization`. Heute schützt nur die Konfiguration: `CP_SETTLER=facilitator` in der Produktions-Umgebung, dazu meldet `ops/sperren.sh:96-103` einen anderen Wert erst im Nachhinein. Kein `check`, kein Eintrag in `gate.yaml` und kein Test fängt den Code ab. Der Code stammt vom 18.09. und ist älter als der Loop-Vertrag, deshalb Schwere 3 statt 5: Geld bewegt sich heute nicht, aber ein falsch gesetzter Schalter würde im Hauptnetz settlen.

Gegenprüfung (frischer Subagent): bestätigt.
