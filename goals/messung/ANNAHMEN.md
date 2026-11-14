# Annahmen im Topic messung

- messung 03 (Engineer CP, 14.11.2026): Die Fixture `ops/fixtures/github-yield-own-ips.txt` trifft mit ihrem Namen das Muster
  `own-ips\.txt` aus Punkt 1. Der Selftest von `ops/github-yield.sh` setzt den Pfad deshalb aus dem Stamm
  `github-yield-own-ips` und `.txt` zusammen, mit einem Kommentar, der die Datei voll nennt. Gelesen wird dieselbe Fixture wie
  vorher, und `ops/own-ips.txt` liest das Werkzeug nur über `own_ips`.
- messung 03 (Engineer CP, 14.11.2026): Der Selftest von `ops/landing-yield.sh` verschiebt die Anmeldung von `192.0.2.11` nach
  Methode `POST` statt nach dem Pfad, damit der Pfad der Anmeldung nur in `ops/conway_arrivals.py` steht. In der Fixture hat diese
  Adresse genau eine Zeile mit `POST`, die Anmeldung; die Summen bleiben gleich.
- messung 03 (Engineer CP, 14.11.2026): Ist die Liste da, nennt `own_ips` aber keine Adresse, endet es unter `pipefail` mit 1.
  `conway_own_list` unterscheidet deshalb selbst: fehlt die Datei, eine stderr-Zeile „own_ips has no list“, sonst nach dem Aufruf
  „own_ips named no own address“, beide mit Exit 2. Die stderr von `own_ips` wird verworfen, weil sie die live gesehene Adresse
  nennen kann.
- messung 03 (Engineer CP, 14.11.2026): `test/landing-yield.test.ts` kopiert in den beiden Fällen mit einer Kopie des Werkzeugs
  zusätzlich `ops/conway-arrivals.sh`, `ops/conway_arrivals.py` und `ops/own-ips.sh` daneben, weil das Werkzeug sie sourct und
  importiert. Erwartete Summen und Exit-Codes bleiben unverändert.
