Schwere: 2
Goal: hosting 01
Befund: Scheitert im Sweep das Löschen der Sandbox einer Zeile `failed` (oder die Abfrage einer Zeile `active` ohne `started_at`), kehrt `sweepAutomatons` ohne Log-Zeile zurück; lehnt `sandboxd` das Löschen einer einzelnen Sandbox dauerhaft ab (etwa 409 oder 500 statt Unerreichbarkeit), bucht diese Sandbox weiter Credits ab und der Betrieb sieht davon nichts, weil auch der Rückgabewert nur Erfolge zählt.
Beleg: `src/automaton/sweep.ts:99` (`if (res.status !== 200) return;` im Weg für Zeilen `failed`), `src/automaton/sweep.ts:76` (dasselbe bei der Abfrage)
Empfehlung: Je gescheitertem Löschen eine Log-Zeile `[automaton] <id>: sweep could not delete sandbox <sandbox_id> (<status>), retrying next round` und ein Zähler `failed` im Rückgabewert; ab einer Zeile, die länger als eine Stunde so steht, ein Wert in `ops/status.sh`, den die Ops-Triage gegen eine Schwelle in `ops/README.md` liest. Test mit dem nachgebauten `sandboxd` (`answer` mit 500 für `DELETE`), rot vor dem Fix.
Übernommen: ROADMAP.md, Glied hosting 07 (2026-11-18)
