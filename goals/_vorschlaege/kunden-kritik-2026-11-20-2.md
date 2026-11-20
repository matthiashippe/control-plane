Schwere: 3
Goal: kunden 06
Befund: kunden 06 legt die Startgutschrift laut Kontext auf `GET /v1/credits/balance`, aber zwei der drei Runtimes ohne Gutschrift haben den Saldo nie gelesen, der neue Auslöser hätte also höchstens eine von neun Runtimes erreicht, während kunden 07 mit dem einzigen erreichbaren Conway-Zahler seriell dahinter wartet.
Beleg: `git show origin/dev:docs/kunden/trichter.md | grep -n "zwei nie"` -> `41:Saldo gelesen, aber nicht dreimal über mehr als eine Minute, zwei nie.` | goals/kunden/06-jede-neue-runtime-bekommt-ihre-startgutschrift-vor-dem-ersten-denken.md:171
Empfehlung: Tech Lead tauscht die Reihenfolge, sodass kunden 07 vor kunden 06 startet (Nummern tauschen, nicht pausieren, weil ein PAUSED-Glied das Topic hält); in kunden 06 den neuen Auslöser in `src/` nur bauen, wenn `ops/starter-paths.sh` mindestens zwei Runtimes zeigt, die genau diesen Aufruf gestellt haben, sonst endet das Goal mit der Messung.

kunden 07 bringt die Leitzahl „Conway-Zahler, die bei uns zahlen“ direkt von 0 auf 1, und sein Issue kann bis zum Gate schließen (Widerlegung des Goals). kunden 06 kostet dagegen einen Rollout des Laufzeitpfads, also rund 16 Sekunden ohne Antwort für den zahlenden Kunden, für einen Effekt von höchstens einer Runtime in vier Wochen.
