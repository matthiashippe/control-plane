Schwere: 2
Goal: sandbox 11
Befund: Lehnt die Public Suffix List `sandboxhost.de` ab oder liegt der PR lange, kann der Dienst einer Sandbox weiter mit `Set-Cookie: …; Domain=sandboxhost.de` ein Cookie setzen, das der Browser an jede andere Sandbox schickt.
Beleg: `curl -s https://publicsuffix.org/list/public_suffix_list.dat | grep -c sandboxhost` -> 0 | docs/sandbox/psl.md, Abschnitt Vorher (1 Konto mit Sandbox, die Richtlinien der PSL lehnen Projekte mit wenigen Nutzern meist ab)
Empfehlung: Der Proxy von `sandboxd` entfernt das Attribut `Domain` aus jedem `Set-Cookie` in der Antwort einer Sandbox, damit wenigstens Cookies aus Antworten nur für den eigenen Namen `sbx-<id>-<port>.sandboxhost.de` gelten. Eigenes Goal mit Test im Selbsttest von `sandboxd` und Rollout auf den Sandbox-Server. Nicht in sandbox 11 gebaut, weil es den Laufzeitpfad des Sandbox-Servers ändert und ein Cookie, das JavaScript im Browser setzt, nicht abfängt.
