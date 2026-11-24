Schwere: 1
Goal: werbung 02
Befund: Der Rückfall auf `CP_PROBE_ANSWERS` und `CP_PROBE_RECORD` in `ops/fixtures/agent-probe-claude.sh` ist ein toter Pfad, weil `ops/agent-probe.sh` die Sitzung mit `env -i` startet und der Stellvertreter nur über dieses Skript läuft; der eigene Test verlangt sogar, dass keine Variable `CP_` ankommt.
Beleg: `git show origin/dev:ops/fixtures/agent-probe-claude.sh | grep -n 'CP_PROBE_[AR]'` -> `12: answers="${PROBE_FAKE_ANSWERS:-${CP_PROBE_ANSWERS:-}}"`, `13: record="${PROBE_FAKE_RECORD:-${CP_PROBE_RECORD:-}}"`; `git grep -n 'spawnSync("bash", \[SCRIPT' origin/dev -- test/agent-probe.test.ts` -> nur Aufrufe von `ops/agent-probe.sh`, nie der Stellvertreter direkt | ops/fixtures/agent-probe-claude.sh:12
Empfehlung: Die Zeilen 12 und 13 auf `answers="${PROBE_FAKE_ANSWERS:-}"` und `record="${PROBE_FAKE_RECORD:-}"` kürzen und den Kopfkommentar (Zeilen 5 und 7) entsprechend anpassen.

test/agent-probe.test.ts:248 lässt in der Sitzung nur `HOME`, `PATH`, `LANG`, `CLAUDE_CONFIG_DIR`, `PROBE_FAKE_ANSWERS` und `PROBE_FAKE_RECORD` zu, der Rückfall kann also nie greifen.

Linse Q, Frage 3.
