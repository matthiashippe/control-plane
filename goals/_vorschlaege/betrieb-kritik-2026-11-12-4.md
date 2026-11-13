Schwere: 3
Goal: betrieb 02
Befund: Der Prüfbefehl (Netz) von Punkt 4 ruft `ops/deploy-window.sh` ohne `CP_OWN_IPS_FILE` auf, und `own_ips` hängt dabei eine neu gesehene eigene Adresse an `ops/own-ips.txt` (Deny List) an; wer danach `check` fährt (Linse K, Loop-Audit), bekommt einen roten Selftest in `test/abort-purchase.test.ts` und einen Diff in einer Datei der Deny List.
Beleg: ops/own-ips.sh:62 (`printf … >> "$list_file"`) | Kommentar des Makers auf PRO-19036, Zyklus 2
Empfehlung: Ein `fix` unter `scripts/` reicht nicht, weil `ops/` betroffen ist: ein eigenes Goal betrieb lässt `own_ips` nur schreiben, wenn `CP_OWN_IPS_WRITE=1` gesetzt ist (so in `deploy.yml` und von Hand), und sonst die neue Adresse nur für den Lauf mitzählen; ein Test zeigt, dass `ops/own-ips.txt` nach `deploy-window.sh --at …` mit gestubbtem ssh unverändert ist. Bis dahin setzen Linse K und Audit nach jedem Prüfbefehl mit Netz `git checkout -- ops/own-ips.txt`.
MVP: Funktion, weil ein falsch roter `check` nach einem Netz-Prüfbefehl Zyklen und Audit-Reparaturen ohne Befund kostet.
Übernommen: Triage-Glieder 13.11. an den Tech Lead, Glied 3 (`ops/own-ips.sh:62` schreibt bei jedem Lauf von `deploy-window.sh`) (2026-11-13)
