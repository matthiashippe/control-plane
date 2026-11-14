Schwere: 4
Goal: fehler 09
Befund: Die Ops-Triage ruft ops/status.sh nur mit OPENROUTER_API_KEY auf, also bleibt alarm_path.received dort immer unknown und ein falsches Thema fällt weiter niemandem auf.
Beleg: `grep -n 'ops/status.sh' .claude/skills/ops-triage/SKILL.md` -> 15: `OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' ~/brain/connectors/secrets.env | cut -d= -f2) ops/status.sh`
Empfehlung: Folge-Goal im Topic fehler: Schritt 2 der Ops-Triage setzt zusätzlich CP_ALERT_WEBHOOK aus derselben Datei, nur als Umgebung des Aufrufs (nie als Argument, nie in STATE.md oder loop-run-log.md), und die Triage führt alarm_path.received.status red als Befund und zweimal unknown in Folge als Hinweis. Prüfung ohne Netz: ein Test, der den Text des Skills auf CP_ALERT_WEBHOOK in Schritt 2 prüft.
