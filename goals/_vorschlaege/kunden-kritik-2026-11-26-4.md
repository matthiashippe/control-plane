Schwere: 3
Goal: kunden 15
Befund: Die Runtimes, die heute ohne Guthaben laufen, tragen `automaton-maintained/0.2.2-maintained.1` und bekommen die neue Zeile nie, weil sie sich nicht selbst aktualisieren; die Woche vor dem Release zählt 4380 Antworten 402, alle an diese Version. Die 402 des Dienstes nennt in `message_for_operator` den Kartenlink, aber nicht den Befehl, mit dem der Mensch die Runtime mit der eigenen Zeile bekommt.
Beleg: `docs/kunden/kartenweg-2026-11.md` (Zeile `MAINTAINED 402 VERSION automaton-maintained/0.2.2-maintained.1: 4380`), `src/inference/proxy.ts` (`message_for_operator`)
Empfehlung: Eigenes Glied im Topic `kunden`, das zuerst misst, ob nach dem Release überhaupt eine Runtime mit `0.2.2-maintained.2` kommt, und erst wenn nicht, der 402 an Runtimes mit einer älteren Kennung `automaton-maintained/` einen Satz mit `npm install -g github:matthiashippe/automaton#<neuer Tag>` anhängt, additiv wie `topup_url`, mit Test.
MVP: Funktion, weil die eine Runtime, die heute 402 bekommt, sonst nie die Zeile zeigt, für die kunden 15 gebaut wurde.
