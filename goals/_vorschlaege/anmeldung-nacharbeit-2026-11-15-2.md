Schwere: 1
Goal: anmeldung 01
Befund: `crawlerMintsToday` und `crawlerMintsPerDay` sind Kopien von `agentMintsToday` und `agentMintsPerDay` mit anderem Namen und anderer Umgebungsvariable, dieselbe Abfrage steht zweimal in `src/auth/keyless.ts`.
Beleg: `git grep -c "WHERE name = ? AND substr(created_at, 1, 10) = ?" origin/dev -- src` -> `src/auth/keyless.ts:2` | src/auth/keyless.ts:131, :136, :168, :173
Empfehlung: Eine Funktion `keylessMintsToday(db, name, now)` und eine `capFromEnv(variable, default)` nehmen beide Fälle auf; die vier exportierten Namen bleiben als dünne Aufrufe, damit die bestehenden Tests unverändert bleiben.
MVP: Schönheit

Linse Q, Frage 2 (Logik-Duplikat), Merge 91e1890. Ändert ein späteres Goal das Zählen des Tages (etwa auf einen Zeitbereich für einen Index), muss es beide Stellen finden, sonst zählen die beiden Grenzen den Tag verschieden. Die doppelte Regel für Crawler in `ops/keyless-mints.sh` zählt hier nicht, sie hält test/keyless-crawler.test.ts gleich.
