Schwere: 2
Goal: sandbox 07
Befund: Die Domain der freigegebenen Ports steht nicht auf der Public Suffix List, also kann eine Sandbox unter `sbx-<id>-<port>.sandboxhost.dev` ein Cookie für die ganze Domain setzen, das der Browser an jede andere Sandbox schickt.
Beleg: `curl -s https://publicsuffix.org/list/public_suffix_list.dat | grep -c sandboxhost` -> 0 | goals/sandbox/ANNAHMEN.md, Abschnitt Goal 07, Zeile „Public Suffix List“
Empfehlung: Nach dem Kauf einen PR an `publicsuffix/list` vorbereiten (Eintrag `sandboxhost.dev` in der privaten Sektion, TXT-Eintrag `_psl.sandboxhost.dev` mit dem Link auf den PR); posten erst nach Freigabe von Matthias am Gate `public_post`. Bis dahin schützt, dass die Zahlung unter einer anderen Domain läuft.
