Schwere: 3
Goal: hosting 07
Befund: Eine Sandbox, deren Löschen `sandboxd` ablehnt, bucht nach hosting 07 weiter Credits des Kunden; das Goal macht den Fall nur sichtbar, die Abrechnung läuft bis zum Eingriff des Betriebs weiter.
Beleg: src/sandbox/service.ts:442 (`billOne` bucht jede Zeile `running` in `sandboxes`, egal ob ihr Automaton `failed` ist) | src/automaton/sweep.ts:119
Empfehlung: Eigenes Goal im Topic abrechnung: Scheitert das Löschen der Sandbox eines Automatons mit Status `failed`, stoppt der Sweep sie (`POST /v1/sandboxes/{id}/stop`, wie beim leeren Guthaben), damit keine Schritte mehr gebucht werden, und die Abrechnung bucht für eine Zeile in `sweep_failures` ab `first_failed_at` nichts mehr; Test mit dem nachgebauten `sandboxd`, rot vor dem Fix.
