Schwere: 3
Goal: betrieb 02
Befund: Ob Caddy nach dem Merge wirklich keine 502 mehr am Neustart schickt, misst niemand, weil die Caddyfile-Änderung `cp` nicht neu startet und der Abschnitt `## Nachher` nur auf den nächsten Rollout verweist; die Widerlegung des Goals hat damit keinen Prüfer.
Beleg: `grep -n "^## Nachher" -A3 docs/betrieb/neustart.md` -> Verweis auf den Schritt „Deploy-Fenster“ des nächsten Rollouts, der `cp` neu startet | docs/betrieb/neustart.md
Empfehlung: Ein Kettenglied betrieb nach dem ersten Rollout nach dem Merge, der `cp` neu startet, misst dessen Fenster mit `bash ops/deploy-window.sh --at <Container-Start>` (Zeit aus dem Log von `deploy.yml`) und schreibt die Zeile `BAD GATEWAY` nach `## Nachher`; steht dort mehr als 0, ist betrieb 02 widerlegt. Lokal belegt am 12.11.2026 mit caddy v2.11.7: auch eine nicht auflösbare Upstream-Adresse (der Fall, wenn der Container `cp` neu angelegt wird) hält Caddy die volle `lb_try_duration` und antwortet erst danach 502, der Retry deckt also auch den DNS-Fall, nicht nur „connection refused“.
MVP: Funktion, weil erst die Messung zeigt, dass die zahlenden Kunden am Neustart keinen Fehler mehr sehen.
Übernommen: Triage-Glieder 13.11. an den Tech Lead, Glied 2 (502 im Fenster des nächsten Rollouts, der `cp` neu startet; betrieb 02 rollte nur `deploy/Caddyfile` aus) (2026-11-13)
