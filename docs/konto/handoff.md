# Der Weg aufs Handy: Vertrag

Ein Terminal (Claude Code, später das Tool `start_automaton` aus konto 04) braucht für einen Schritt die Freigabe des Menschen auf
seinem Handy. Es legt dafür einen Handoff an, zeigt Kurzlink, QR-Code und eine zweistellige Zahl, der Mensch öffnet die Seite
`/h/{code}`, sieht, was er freigibt, und tippt die Zahl aus dem Terminal. Das Terminal erfährt den Ausgang über einen Strom, den nur es
lesen kann. Gebaut in goals/konto/02, die Entscheidungen mit Grund stehen in `goals/konto/ANNAHMEN.md` unter `## Goal 02`.

## Anfrage

`POST /v1/handoff`, ohne API-Schlüssel, JSON:

| Feld | Typ | Regel |
|---|---|---|
| `automaton_name` | String | 1 bis 64 Zeichen, auf der Seite HTML-escaped |
| `daily_limit_usdc` | String | ganze Zahl in atomaren USDC (6 Dezimalen), größer 0, Vielfaches von 10000 (ganze Cent) |
| `amount_usdc` | String | wie `daily_limit_usdc`; die erste Zahlung |

Beispiel: `{"automaton_name":"Atlas","daily_limit_usdc":"5000000","amount_usdc":"5000000"}` zeigt die Seite als `$5.00`. Ein Betrag
als Zahl statt String, mit Komma oder Punkt, negativ, null oder kein Vielfaches von 10000 ergibt 400, ebenso ein leerer oder zu langer
Name. Mehr Anfragen von einer Adresse, als das Rate Limit der Pfade ohne Schlüssel erlaubt (60 je Minute, gemeinsam mit `/v1/auth/*`
und `/pay/*`), ergeben 429 mit `Retry-After`.

## Antwort

201, JSON:

| Feld | Inhalt |
|---|---|
| `code` | öffentlicher Code, Crockford-Base32, mindestens 10 Zeichen aus mindestens 50 Bit Zufall |
| `url` | Kurzlink `<siteOrigin()>/h/<code>`, etwa `https://postyourprice.com/h/7KQ2M9XC4D` |
| `qr` | der Kurzlink als QR-Code in Textform fürs Terminal: Halbblöcke (`▀`, `▄`, `█`, Leerzeichen) mit Ruhezone, eine Zeile je zwei Modulreihen |
| `match` | Zahl von 10 bis 99, die das Terminal zeigt und der Mensch auf dem Handy wählt |
| `expires_at` | Ablauf in ISO 8601 UTC, genau 600 Sekunden nach der Anlage |
| `poll_token` | Geheimnis des Terminals, mindestens 32 Zeichen; gespeichert wird nur sein Hash |

Das Terminal zeigt `qr`, `url` und `match` und behält `poll_token` für sich. Wer nur den QR-Code oder den Link sieht, kennt weder die
Zahl noch das Token.

## Zustände

| Zustand | wann | Seite `/h/{code}` |
|---|---|---|
| `pending` | nach der Anlage, bis zu einer Wahl oder bis zum Ablauf | `freigabe`: was freigegeben wird und drei verschiedene zweistellige Zahlen, darunter `match` an zufälliger Stelle |
| `done` | die richtige Zahl wurde gewählt | `erledigt` direkt nach der Wahl, danach `ungueltig` |
| `burned` | eine falsche Zahl wurde gewählt; der Code ist verbrannt, auch die richtige Zahl gibt danach nichts mehr frei | `ungueltig` |
| `expired` | 600 Sekunden nach der Anlage ohne Wahl | `ungueltig` |

Jeder Code gilt genau einmal. Die Wahl ist ein Formular (`POST /h/{code}`, Feld `pick`), das ohne JavaScript funktioniert. Ein
unbekannter Code ergibt 404 mit der Seite `ungueltig`; mehr unbekannte Codes von einer Adresse, als das Rate Limit erlaubt (20 in 10
Minuten), ergeben 429. Jede Antwort von `/h/{code}` trägt `Cache-Control: no-store`, `Referrer-Policy: no-referrer` und `noindex`
(Kopfzeile `X-Robots-Tag` und `<meta name="robots">`); der Pfad steht nicht in der Sitemap.

`GET /v1/handoff/{code}` mit `Authorization: Bearer <poll_token>` antwortet als Server-Sent Events (`text/event-stream`): sofort ein
Ereignis `state` mit `{"state":"pending"}` oder dem Endzustand, danach jeden Wechsel, und der Strom endet nach `done`, `burned` oder
`expired`. Alle 15 Sekunden hält ein Kommentar die Verbindung über Caddy offen. Ohne Token oder mit dem Token eines anderen Handoffs
kommt 401 ohne Zustand im Körper, für einen unbekannten Code 404.

## Für konto 03 und 04

- konto 03 ersetzt den Platzhalter hinter der Freigabe: Heute bestätigt `done` nur, dass der Mensch mit der richtigen Zahl
  freigegeben hat. konto 03 hängt an genau diese Stelle die Kontoanlage per Passkey und meldet ihr Ergebnis über denselben Strom
  `GET /v1/handoff/{code}`, den nur das Terminal mit `poll_token` lesen kann. Ob ein Schritt einen API-Schlüssel verlangt, entscheidet
  konto 03; `POST /v1/handoff` selbst bleibt ohne Schlüssel, weil das Konto erst über diesen Weg entsteht.
- konto 04 baut das Tool im Terminal gegen diese Antwort: `POST /v1/handoff`, dann `qr`, `url` und `match` zeigen, dann
  `GET /v1/handoff/{code}` mit `poll_token` lesen, bis `done`, `burned` oder `expired` kommt. Bei `burned` oder `expired` legt das
  Tool einen neuen Handoff an, statt den alten zu wiederholen.
- Ein Desktop-Browser ohne Passkey nutzt dieselbe Antwort (Link statt QR-Code); eine eigene Desktop-Seite baut erst das Goal, das sie
  braucht.
- Beträge bleiben Strings in atomaren USDC und werden mit bigint gerechnet, nie als float.
