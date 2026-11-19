Schwere: 2
Goal: sandbox 12
Befund: `stripCookieDomain` greift nur in `up.on("response")` von `handleProxy`. `sandboxd` hat heute keinen Handler für `upgrade`, ein WebSocket kommt also gar nicht durch; fügt ein späteres Goal ihn hinzu und reicht den Socket roh durch, kommt ein `Set-Cookie` mit `Domain=sandboxhost.de` in der Antwort `101 Switching Protocols` ungefiltert beim Browser an, und Browser speichern Cookies aus dem Handshake.
Beleg: ops/sandbox/sandboxd.mjs:650 (einzige Stelle mit `stripCookieDomain` im Proxy), ops/sandbox/sandboxd.mjs:755 (`http.createServer(d.handleProxy)` ohne `upgrade`)
Empfehlung: Ein Test in `test/sandboxd-cookie.test.ts` hält fest, dass der Proxy-Server keinen Listener für `upgrade` hat (`proxy.listenerCount("upgrade") === 0`), mit dem Satz, dass ein Goal mit WebSocket die Header der Antwort 101 ebenfalls durch `stripCookieDomain` schickt; so bricht der Test genau dann, wenn jemand den Weg öffnet.
