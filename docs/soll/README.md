# SOLL-Bilder

Hier liegen die SOLL-Bilder der Website (`LOOP.md`, Fläche nur nach SOLL-Bild). Ein Goal, das eine Fläche baut, baut 1:1 nach dem Bild
derselben Fläche.

## Startseite `/`

| Breite | Bild | erster Bildschirm |
|---|---|---|
| 390 | `startseite-390.png` | 390 x 844 |
| 1440 | `startseite-1440.png` | 1440 x 900 |

Quelle ist `src/startseite.html`: der gerenderte Stand von `/` (englisch, `CP_PUBLIC_URL=https://automatonhost.com`, leere
Datenbank), ohne Kommentare, Zählpixel und Skripte, mit dem Umzug für Conway-Betreiber als erstem Block (`data-soll="move"`). Der
Block `#agents` vom Seitenende ist dorthin gewandert. Markt und Fußzeile zeigen den leeren Stand der Renderer, keine Zahl aus der
Produktion; seite 02 füllt sie mit den echten Renderern.

Bauen und prüfen, ohne Netz, mit dem Chromium aus `~/.cache/ms-playwright/`:

```
node ops/soll.mjs            # Bilder neu schreiben
node ops/soll.mjs --check    # neu rendern und vergleichen, Exit 1 bei jedem Mangel
```

Mängel: ein einziger Pixel weicht vom neuen Render ab (über der Kanaltoleranz von 8), waagrechter Überlauf (auch abgeschnittener Inhalt), Gedankenstrich im
sichtbaren Text, Anfrage an eine fremde Adresse, Umzug endet unter dem ersten Bildschirm. Die Auswertung steht in
`ops/soll-assess.mjs` und wird von `test/soll.test.ts` ohne Browser geprüft.

## Neue Bausteine

Keine. Der Umzug nutzt nur Klassen aus dem `<style>` von `src/public/index.html`: `hero`, `hero-in`, `hero-text`, `pill`,
`live-dot`, `h1-line`, `sub`, `prose`, `cta`, `btn`, `btn-1`, `demo`, `eyebrow`, `code`, `pr`, `fine`.

## Abnahme

Abnahme-Issue: PRO-18819

## Handoff /h/{code}

Die Seite, die ein Mensch auf dem Handy öffnet, wenn sein Terminal einen Schritt freigeben lassen will (goals/konto/02). Eine Fläche
in drei Zuständen, je zwei Bilder:

| Zustand | 390 | 1440 | Quelle |
|---|---|---|---|
| `approve` | `handoff-approve-390.png` | `handoff-approve-1440.png` | `src/handoff-approve.html` |
| `approved` | `handoff-approved-390.png` | `handoff-approved-1440.png` | `src/handoff-approved.html` |
| `invalid` | `handoff-invalid-390.png` | `handoff-invalid-1440.png` | `src/handoff-invalid.html` |

Bilder und Quellen tragen seit goals/konto/06 die Namen der Zustände im Code, Byte für Byte die unter den alten deutschen Namen
abgenommenen Bilder (abgenommen in PRO-19925, Umbenennung abgenommen mit dem Abnahme-Issue limit-account unten im Abschnitt Limit).

`approve` zeigt, was freigegeben wird (Name des Automatons, Tageslimit, erste Zahlung), und drei Zahlen als Knöpfe in einem
Formular ohne Skript; der Block `data-soll="approve"` endet im ersten Bildschirm (390 x 844 und 1440 x 900). `approved` schickt
zurück ins Terminal. `invalid` zeigt den abgelaufenen Code; schon benutzt, falsche Zahl und unbekannt tauschen nur die Zeile unter
der Überschrift. Die Werte im Bild sind erfunden (`Atlas`, 5.00 USD), keine Kundendaten.

Bauen und prüfen, ohne Netz, mit dem Chromium aus `~/.cache/ms-playwright/`:

```
node ops/soll-handoff.mjs                          # Bilder neu schreiben
node ops/soll-handoff.mjs --check                  # neu rendern und vergleichen, Exit 1 bei jedem Mangel
node ops/soll-handoff.mjs --check --source <dir>   # dieselbe Prüfung gegen die drei Quellen in <dir>
```

Mängel wie bei der Startseite, dazu: Block `approve` endet unter dem ersten Bildschirm, und ein Wort, das der Leser erst übersetzen
muss (`handoff`, `phishing`, `token`, `SSE`), steht im sichtbaren Text. Die Auswertung ist `assessHandoff` in `ops/soll-assess.mjs`,
geprüft von `test/soll-handoff.test.ts` ohne Browser.

Neue Bausteine, im zweiten `<style>` der Quellen und später der Seite, weil `src/public/index.html` sich in diesem Goal nicht ändert:

- `.grant`: Abstand um das Feld mit Tageslimit und erster Zahlung (`.stats`), weil `.stats` selbst keinen Abstand hat und die
  Startseite es nur in Abschnitten mit eigenem Abstand nutzt.
- `.choices`: die drei Zahlen als gleich große Knöpfe in einer Reihe, 76 px hoch, Ziffern in Tabellenbreite, weil ein Daumen sie
  treffen muss und `.btn` auf einem `<button>` sonst den Hintergrund des Browsers trägt.

Abnahme-Issue handoff: PRO-19925

## Konto /h/{code}

Der Schritt Konto derselben Handy-Seite (goals/konto/03): Nach der richtigen Zahl legt der Mensch per Passkey sein Konto an und
erlaubt die tägliche Abbuchung. Zwei Zustände, je zwei Bilder:

| Zustand | 390 | 1440 | Quelle |
|---|---|---|---|
| `passkey` | `konto-passkey-390.png` | `konto-passkey-1440.png` | `src/konto-passkey.html` |
| `failed` | `konto-fehlgeschlagen-390.png` | `konto-fehlgeschlagen-1440.png` | `src/konto-fehlgeschlagen.html` |

`passkey` sagt in der Überschrift, was beim Tippen passiert, darunter in einer Zeile, was wir abbuchen dürfen (Tageslimit und für
welchen Automaton), zwei Haken dazu, wer das Konto öffnen kann, und einen Knopf über die ganze Breite; der Block
`data-soll="passkey"` endet im ersten Bildschirm (390 x 844 und 1440 x 900). `failed` zeigt den abgebrochenen Passkey und
schickt zurück ins Terminal für einen neuen Code; Anbieter nicht erreichbar und abgelehnte Erlaubnis tauschen nur die Zeile unter
der Überschrift. Die Werte im Bild sind erfunden (`Atlas`, 5.00 USD), keine Kundendaten. `approve`, `approved` und `invalid`
bleiben die Bilder aus dem Abschnitt Handoff. Der Zustand `failed` behält für Bilder und Quelle den Namen, unter dem sie
abgenommen sind (`KONTO_FILES` in `ops/soll-assess.mjs`, goals/konto/06).

Bauen und prüfen, ohne Netz, mit dem Chromium aus `~/.cache/ms-playwright/`:

```
node ops/soll-konto.mjs                          # Bilder neu schreiben
node ops/soll-konto.mjs --check                  # neu rendern und vergleichen, Exit 1 bei jedem Mangel
node ops/soll-konto.mjs --check --source <dir>   # dieselbe Prüfung gegen die zwei Quellen konto-<zustand>.html in <dir>
```

Mängel wie beim Handoff, dazu: Block `passkey` fehlt oder endet unter dem ersten Bildschirm, eine fremde Adresse in einem Attribut
(Link, Formularziel, Stil), auch wenn nichts sie lädt, und ein Wort, das der Leser erst übersetzen muss (`handoff`, `token`,
`wallet`, `smart`, `permission`, `sepolia`, `turnkey`, `erc`), im sichtbaren Text; „passkey“ ist ein bekanntes Wort und steht. Die
Auswertung ist `assessKonto` in `ops/soll-assess.mjs`, geprüft von `test/soll-konto.test.ts` ohne Browser.

Die Quellen nutzen die Klassen der Startseite (die Haken-Liste feats, cta um den Knopf) und den Baustein grant aus dem Abschnitt
Handoff als Abstand um die Haken-Liste. Neu, im zweiten `<style>` der Quellen und später der Seite:

- `.wide`: der Knopf Passkey über die ganze Spalte und 56 px hoch, weil er der einzige Schritt der Seite ist, ein Daumen ihn auf
  dem Handy sofort treffen soll und der Knopf der Startseite sonst nur so breit wie sein Text ist.
- `.balanced`: bricht die Überschrift in zwei gleich lange Zeilen (`text-wrap: balance`), weil sonst bei 1440 „passkey“ und bei 390
  „a passkey“ allein in der zweiten Zeile stehen; als Klasse am Block um die Überschrift, weil die Überschrift selbst ein nacktes
  `<h1>` bleibt (Punkt 4 ändert sie zur Gegenprobe).

Abnahme-Issue konto: PRO-20104

## Limit /h/{code}

Der Schritt Limit derselben Handy-Seite (goals/konto/04, Name des Kontos seit goals/konto/06): Ein Konto erhöht sein Tageslimit. Nach der richtigen Zahl bestätigt der
Mensch das neue Limit mit dem Passkey, mit dem er das Konto angelegt hat. Zwei Zustände, je zwei Bilder:

| Zustand | 390 | 1440 | Quelle |
|---|---|---|---|
| `approve` | `limit-approve-390.png` | `limit-approve-1440.png` | `src/limit-approve.html` |
| `passkey` | `limit-passkey-390.png` | `limit-passkey-1440.png` | `src/limit-passkey.html` |

`approve` ist die Wahl der Zahl wie beim Handoff, zeigt aber das heutige und das neue Tageslimit statt der ersten Zahlung; die
Überschrift fragt nach dem Limit des Kontos („Raise the daily limit of your account to $10.00?“), die Zeile über den Zahlen nennt
den Namen des Kontos („The new limit applies to your account Atlas.“); der Block `data-soll="approve"` endet im ersten
Bildschirm. `passkey` sagt in der Überschrift, was beim Tippen passiert („Raise the daily limit for your account“), darunter in
einer Zeile das neue Limit für das Konto mit seinem Namen („We can charge up to $10.00 a day for your account Atlas.“),
zwei Haken (das alte Limit endet, derselbe Passkey) und einen Knopf über die ganze Breite; der Block `data-soll="limit"` endet im
ersten Bildschirm (390 x 844 und 1440 x 900). Das Limit gilt für das ganze Konto, auch wenn es mehrere Automatons hat; deshalb
bindet kein Satz die Grenze an einen Automaton, und der Name ist der Name des Kontos (Name des ältesten Schlüssels in
`api_keys`), nie ein Text aus dem Terminal. Abbruch und Fehler zeigen den Zustand `failed` aus dem Abschnitt Konto unverändert. Die Werte im Bild sind erfunden (`Atlas`, 5.00 auf 10.00 USD), keine
Kundendaten.

Bauen und prüfen, ohne Netz, mit dem Chromium aus `~/.cache/ms-playwright/`:

```
node ops/soll-limit.mjs                          # Bilder neu schreiben
node ops/soll-limit.mjs --check                  # neu rendern und vergleichen, Exit 1 bei jedem Mangel
node ops/soll-limit.mjs --check --source <dir>   # dieselbe Prüfung gegen die zwei Quellen limit-<zustand>.html in <dir>
```

Mängel wie beim Konto, dazu: Block `approve` oder `limit` fehlt oder endet unter dem ersten Bildschirm, und zur Sperrliste kommt
`allowance`; „passkey“ und „daily limit“ sind bekannte Wörter und stehen. Die Auswertung ist `assessLimit` in `ops/soll-assess.mjs`,
geprüft von `test/soll-limit.test.ts` ohne Browser.

Neue Bausteine: keine. Die Quellen nutzen die Klassen der Startseite und die Bausteine grant und choices aus dem Abschnitt Handoff
sowie wide und balanced aus dem Abschnitt Konto, jeweils mit demselben Zweck.

Die Bilder sind wie alle anderen dieser Datei mit WenQuanYi Zen Hei als `sans-serif` gerendert. Seit dem 15.11.2026 löst
`sans-serif` auf dem code-host zu DejaVu Sans auf; dort laufen die SOLL-Befehle mit `FONTCONFIG_FILE` auf eine Konfiguration, die
`/etc/fonts/fonts.conf` einbindet und `/usr/share/fonts/truetype/dejavu/*` mit `rejectfont` ausschließt.

Abnahme-Issue limit: PRO-22848
Abnahme-Issue limit-account: PRO-24063

## Geld /h/{code}

Einzahlung und Auszahlung auf derselben Handy-Seite (goals/konto/05): Der Mensch zahlt per Karte Geld auf das Konto seines
Automatons ein oder richtet beim ersten Mal die Auszahlung auf sein eigenes Bankkonto ein. Dazu der Zustand `retry`, wenn die
Prüfung der Unterschrift gerade nicht ging. Sieben Zustände, je zwei Bilder:

| Zustand | 390 | 1440 | Quelle |
|---|---|---|---|
| `deposit-approve` | `money-deposit-approve-390.png` | `money-deposit-approve-1440.png` | `src/money-deposit-approve.html` |
| `deposit-card` | `money-deposit-card-390.png` | `money-deposit-card-1440.png` | `src/money-deposit-card.html` |
| `payout-approve` | `money-payout-approve-390.png` | `money-payout-approve-1440.png` | `src/money-payout-approve.html` |
| `payout-verify` | `money-payout-verify-390.png` | `money-payout-verify-1440.png` | `src/money-payout-verify.html` |
| `payout-bank` | `money-payout-bank-390.png` | `money-payout-bank-1440.png` | `src/money-payout-bank.html` |
| `payout-passkey` | `money-payout-passkey-390.png` | `money-payout-passkey-1440.png` | `src/money-payout-passkey.html` |
| `retry` | `money-retry-390.png` | `money-retry-1440.png` | `src/money-retry.html` |

`deposit-approve` und `payout-approve` sind die Wahl der Zahl wie beim Limit (Block `data-soll="approve"`), sagen aber, was
geschieht: „Add $20.00 to Atlas?“ mit Betrag und Karte, „Send money from Atlas to your bank account?“ mit dem eigenen Bankkonto als
einzigem Ziel. `deposit-card` (Block `card`) nennt Betrag und Karte und hat einen Knopf. `payout-verify` (Block `verify`) sagt,
dass Bridge einmal die Identität prüft, mit einem Knopf. `payout-bank` (Block `bank`) fragt IBAN (`name="iban"`) und Name des
Kontoinhabers (`name="owner_name"`) ab, mit einem Knopf. `payout-passkey` (Block `payout`) sagt in der Überschrift, was beim Tippen
passiert, darunter in einer Zeile „We can send money from Atlas only to your bank account ending 3000.“, zwei Haken und
einen Knopf über die ganze Breite. `retry` (Block `retry`) sagt, dass die Prüfung gerade nicht ging, und hat den Knopf „Tap
again“. Jeder Block endet im ersten Bildschirm (390 x 844 und 1440 x 900). Abbruch und Fehler zeigen den Zustand `failed`
aus dem Abschnitt Konto unverändert. Die Werte im Bild sind erfunden (`Atlas`, 20.00 USD, Beispiel-IBAN
`DE89 3704 0044 0532 0130 00` als Platzhalter, Bankkonto mit Endung 3000), keine Kundendaten. Die Quellen zeigen nur den sichtbaren
Teil der Seite: Die `data-*`-Werte der Knöpfe, das Formularziel und das Skript setzt erst `src/public/money.ts`.

Bauen und prüfen, ohne Netz, mit dem Chromium aus `~/.cache/ms-playwright/`, auf dem code-host mit
`FONTCONFIG_FILE=~/.config/control-plane/soll-fonts.conf` wie beim Limit:

```
node ops/soll-money.mjs                         # Bilder neu schreiben
node ops/soll-money.mjs --check                 # neu rendern und vergleichen, Exit 1 bei jedem Mangel
node ops/soll-money.mjs --check --source <dir>  # dieselbe Prüfung gegen die sieben Quellen money-<zustand>.html in <dir>
```

Ein unbekanntes Argument endet mit Exit 1, bevor der Browser startet, und schreibt kein Bild. Die letzte Zeile ist englisch:
`soll money: 14 images, blocks end 390=<y> 1440=<y>, 0 defects`, y ist je Breite das tiefste Blockende aller Zustände.

Mängel wie beim Limit: ein einziger Pixel weicht vom neuen Render ab, waagrechter Überlauf, Gedankenstrich im sichtbaren Text,
fremde Adresse (angefragt oder in einem Attribut), Bild mit falscher Breite, Block fehlt oder endet unter dem ersten Bildschirm. Zur
Sperrliste kommen `liquidation`, `onramp` (auch `on-ramp`), `kyc`, `forwarder`, `spender` und `usdc`, Groß- und Kleinschreibung
egal; „passkey“, „IBAN“, „card“, „identity“, Bridge und MoonPay sind bekannte Wörter und stehen. Die Auswertung ist `assessMoney` in
`ops/soll-assess.mjs`, geprüft von `test/soll-money.test.ts` ohne Browser.

Die Quellen nutzen die Klassen der Startseite und die Bausteine grant und choices aus dem Abschnitt Handoff sowie wide und balanced
aus dem Abschnitt Konto, jeweils mit demselben Zweck. Neu, in einem dritten `<style>` der Quellen und später der Seite:

- `.field`: Beschriftung und Textfeld für IBAN und Kontoinhaber, das Feld so breit wie die Spalte und 52 px hoch, Beschriftung im
  Stil der Zeile über der Überschrift, weil der Stil der Startseite kein Eingabefeld kennt und ein `<input>` sonst klein und hell
  im Stil des Browsers auf der dunklen Seite steht.

Abnahme-Issue money: PRO-23251

## Name automatonhost.com (goals/umzug/02)

Alle 30 Bilder tragen seit goals/umzug/02 den Namen `automatonhost.com` statt des alten Namens: im Kopf jeder Seite, im Titel
(`<Seite> | automatonhost.com`) und in der Fußzeile der Handy-Seiten. Sätze, deren Subjekt der alte Name war, sagen „We“ („We can
charge up to $5.00 a day, only for Atlas.“, „We never see your passkey and cannot open the account.“, „We never see your card
number.“). Die Startseite heißt `automatonhost.com: keep your automaton running`, die Überschrift des Blocks `move` lautet
„Conway not answering? Your automaton runs here.“, und der Block zeigt `conwayApiUrl` mit `https://automatonhost.com`. Der Knopf
im Kopf führt zum Wechsel (`/fix`, „Switch now“) statt zu „Post a job“; der Link „Agent stuck?“ steht bei 390 px nicht mehr im Kopf,
weil der Knopf dasselbe Ziel hat und der Kopf sonst in zwei Zeilen bricht. Aufbau, Bausteine und Werte sind sonst unverändert,
neue Bausteine gibt es keine. Gerendert mit den Werkzeugen oben, `FONTCONFIG_FILE=$HOME/.config/control-plane/soll-fonts.conf`.

Abnahme-Issue umzug: PRO-24257
