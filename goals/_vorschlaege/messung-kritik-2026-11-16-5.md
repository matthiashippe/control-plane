Schwere: 2
Goal: messung 10
Befund: `ops/keyless-mints.sh` (Zeile 188 bis 196) baut die Sperre der eigenen Liste nach messung 10 als einziges Werkzeug noch selbst, mit `grep -v '^#' … | awk 'NF { found = 1 } …'` statt `_own_ips_listed`, und steht deshalb weiter in `READER_EXCEPTIONS` von `test/own-ips-readers.test.ts`. Ändert messung 12 die Leseregel in `_own_ips_listed`, läuft diese Kopie auseinander, und der Wächter meldet es wegen der Ausnahme nicht.
Beleg: ops/keyless-mints.sh (`if ! grep -v '^#' "$CP_OWN_IPS_FILE" 2>/dev/null | awk …`), test/own-ips-readers.test.ts (Eintrag `ops/keyless-mints.sh`), Annahme in goals/messung/10-eine-sperre-fuer-die-eigene-liste-statt-drei.md
Empfehlung: In messung 12 oder dem Glied danach: `ops/keyless-mints.sh` ruft `own = $(own_ips_checked "$CP_OWN_IPS_FILE")`, bei 2 die Zeile `keyless-mints: <Zeile>, so nothing is counted.` und `exit 2`; der Eintrag in `READER_EXCEPTIONS` fällt weg, und ein Fall in `test/keyless-mints.test.ts` hält fest, dass ein `own_ips` mit Exit 1 nicht zählt.
MVP: Funktion, weil die Zählung keyloser Mints sonst als letzte die eigene Liste anders liest als alle anderen Werkzeuge.
Übernommen: ROADMAP.md, Glied messung 14 (PR #227) (2026-11-17)
