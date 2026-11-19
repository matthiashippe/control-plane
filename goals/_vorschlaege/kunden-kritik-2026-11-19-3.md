Schwere: 2
Goal: kunden 02
Befund: Die Leitzahl „Conway-Zahler, die bei uns zahlen“ entsteht nur, wenn jemand `bash ops/conway-payers.sh` von Hand startet; ob die Antwort an den einen erreichbaren Betreiber (Vorschlag `kunden-weg-2026-11-19-1.md`) sie von 0 auf 1 hebt, sieht der Loop deshalb erst bei der nächsten Handmessung, und ein neuer Conway-Zahler, der von selbst zu uns wechselt, bleibt ungesehen.
Beleg: `bash ops/conway-payers.sh` -> `OVERLAP topped up: 16 wallets, 0 known here, 0 with inference here, 0 paid here, 0 paid Conway after their last payment here` | docs/kunden/conway-zahler.md:4
Empfehlung: Im Glied, das den Betreiber anspricht, oder in kunden 03 die Zeile `OVERLAP topped up` als eine Zeile in `ops/status.sh` aufnehmen (nur die Zählungen, nie Adresse oder Hash, Quelle wie heute nur lesend), damit Triage und Kurs-Check die Leitzahl in jedem Takt sehen; Selftest ohne Netz in beide Richtungen wie bei `ops/conway-payers.sh --selftest`.
MVP: Funktion, weil ohne laufende Messung niemand merkt, ob ein Conway-Zahler zu uns wechselt.
