Schwere: 1
Goal: sandbox 08
Befund: `automatonOfKey` in `src/automaton/scope.ts` ruft erst `isAutomatonKey` und wiederholt danach dessen Arbeit (Abschneiden von `Bearer `, dieselbe Abfrage auf `api_keys`), sodass jede Anfrage mit einem Schlüssel an die Schlüssel-, Sandbox- und Automaton-Routen zweimal dieselbe Abfrage stellt.
Beleg: `git grep -n 'SELECT name FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL' origin/dev -- src` -> `src/automaton/keys.ts:31`, `src/automaton/scope.ts:20` | src/automaton/scope.ts:17, src/automaton/keys.ts:27
Empfehlung: `automatonOfKey` fragt einmal ab und gibt Id oder null zurück, `isAutomatonKey` wird `automatonOfKey(db, key) !== null`.
MVP: Schönheit

Linse Q, Frage 2 (Logik-Duplikate), Merge 792a490.
Verworfen: MVP: Schönheit ohne belegten Fehler, und der Kurs-Check vom 17.11. (PRO-23529) sieht den Detail-Anteil über der Schwelle; die doppelte Abfrage ist ein Lesezugriff auf einen Index (2026-11-17)
