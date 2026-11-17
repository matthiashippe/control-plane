Schwere: 2
Goal: messung 09
Befund: `WATCHDOG_SEVERITIES` in `ops/status.sh` ist nur in eine Richtung an `ops/watchdog.sh` gebunden: Der Fall „every severity that ops/watchdog.sh reports counts as its delivery“ verlangt, dass jede Severity des Watchdogs zählt, aber nicht, dass jede gezählte Severity noch vom Watchdog kommt. Entfernt jemand `WARNING` aus dem Watchdog oder benennt es um, zählt `received` den alten Titel weiter, und ein anderer Sender mit diesem Titel setzt es still auf `ok`.
Beleg: ops/status.sh (`WATCHDOG_SEVERITIES = ("ALIVE", "OK", "OUTAGE", "WARN", "WARNING")`), test/status-alarm-received.test.ts (Fall „every severity …“, nur `toBeGreaterThanOrEqual(5)`)
Empfehlung: In einem späteren Glied messung: Der Fall liest auch die Zeile `WATCHDOG_SEVERITIES` aus `ops/status.sh` und verlangt Gleichheit der beiden Mengen; Gegenprobe mit einer Kopie, in der eine sechste Severity steht.
MVP: Funktion, weil `received` sonst nach einer Änderung am Watchdog wieder fremde Meldungen zählen kann.
Übernommen: ROADMAP.md, Glied messung 14 (PR #227) (2026-11-17)
