Schwere: 2
Goal: kanal 04
Befund: Der Wert bindet das Senden an den Trockenlauf, aber nicht an den Text, den Matthias am Gate `public_post` liest. Der Trockenlauf druckt je Entwurf nur die ersten 90 Zeichen (`opens:`) und `sha12`; den vollen Text für die Karte liest der Tech Lead getrennt aus der Datei. Ändert sich der Entwurf zwischen beiden Lesevorgängen, steht in der Karte ein anderer Text als der, über den der Wert gerechnet wurde, und Matthias' „ok“ deckt ihn trotzdem.
Beleg: `ops/post-the-answers.py`, Zweig `send == 0`: `print(f"            opens: {first[:90]}")` und `print(f"  #{number}  sha12 {values[-1][1]}")`, kein Ausdruck von `body`.
Empfehlung: Der Trockenlauf druckt je Entwurf den vollständigen `body` zwischen `--- #<n> sha12 <wert> ---` und `--- end #<n> ---`; die Schritte für Matthias übernehmen Text und Wert aus genau dieser einen Ausgabe. Test in `test/answers-approved.test.ts`: der Block zwischen den Markern ist Byte für Byte `body_to_send` des Entwurfs, und `sha256` darüber (mit `node:crypto`) ist der Wert in der Kopfzeile.
MVP: Funktion, weil die Freigabe erst dann am gelesenen Text hängt, wenn Text und Wert aus demselben Lauf stammen.
