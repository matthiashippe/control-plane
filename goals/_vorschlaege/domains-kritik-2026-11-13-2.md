Schwere: 2
Goal: domains 03
Befund: Nach `changed=1` dauert `bash ops/live.sh` 75 s länger, ohne dass die Ausgabe das sagt; bricht das Werkzeug des Release Managers den Lauf an seinem Timeout ab (Standard 120 s im Bash-Werkzeug), fehlt `LIVE OK`, und die Prüfung gilt als rot, also genau das falsche Rot, das domains 03 beseitigt.
Beleg: ops/live.sh `live_wait "$CLIENT_KEY_WAIT_S"` in `sandbox_live`, dazu bis zu 25 s Hintergrundlauf und 60 s Warten auf `exit_code_file`; LOOP.md (Release) und Skill loop-privat nennen `bash ops/live.sh` ohne Zeitgrenze.
Empfehlung: `ops/live.sh` gibt vor dem Warten eine Zeile `WAIT sandbox: new client key, <n> s before the create` aus; im Skill loop-privat (code-host) läuft die Live-Prüfung des Release Managers mit Timeout 600000. Gegenprobe: Dauer eines Laufs mit `changed=1` messen, sobald der nächste echte Schlüsselwechsel kommt.
Übernommen: domains 04, DONE und gemergt (PR #116) (2026-11-14)
