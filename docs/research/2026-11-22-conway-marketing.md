# Wie Conway im Februar 2026 zahlende Automaton-Betreiber gewann

Stand: 22.11.2026. Alle Quellen am 22.11.2026 abgerufen (Liste am Ende, Verweise als [Qn]).
Kennzeichnung: **[V]** selbst an der Primärquelle geprüft (GitHub-API, X-Post samt Zahlen, Code, On-Chain-Lesezugriff), **[S]** nur aus Sekundärquelle (Presse, Aggregator, Digest), **[I]** meine Schlussfolgerung.
Rahmen aus dem Auftrag, nicht neu erhoben: 37.959 USDC von 1.582 Wallets im Februar 2026, Einbruch ab April, Onboarding-Stopp am 17.07.2026.

## Kurzantwort

Fast die gesamte Nachfrage kam aus einem einzigen Founder-Post auf X: Sigil Wens Thread „I built the first AI that earns its existence, self-improves, and replicates without a human“ vom 17.02.2026 mit dem Essay „WEB 4.0: The birth of superintelligent life“ auf web4.ai erreichte 6,55 Mio. Views, 13.766 Likes und 14.098 Bookmarks [V, Q13]. Verstärkt wurde er durch drei Effekte, die Wen nicht bezahlt hat: eine öffentliche Abrechnung von Vitalik Buterin (569.329 Views) [V, Q27], eine Welle in Krypto-Medien bis nach China [V/S, Q22, Q30, Q33] und einen Fan-Token „$Conway“ auf Base, den ein Dritter über @bankrbot mit Gebühren an @0xSigil aufgesetzt hatte [V, Q19, Q20]. Wen selbst hielt den Zug mit Nachfrage-Posts am Laufen („every time I buy more servers & compute the agents instantly buy them all“) [V, Q24]. Gezahlt haben Menschen, die ihrem Agenten das Überleben finanzierten: Wallet aufladen, Stufen 5, 25, 100 USD, sonst „stirbt“ er [V, Q8]. Hacker News, Product Hunt, Paid Ads, Referral oder Gratis-Credits spielten nach allem, was sich finden lässt, keine Rolle.

## 1. Wer steckt dahinter, wann und wo war der Launch

**Team.** Gründer ist Sigil Wen (X: @0xSigil, heute 62.439 Follower), laut eigenem GitHub-Profil Thiel Fellow, Sitz San Francisco, außerdem hinter extraordinary.com und underdog.ai [V, Q12, Q13]. Der zweite Kopf im Code ist Daniel Hong (GitHub unifiedh, Seoul) mit 188 von rund 300 Commits, Wen selbst hat 27 [V, Q3]. Die GitHub-Organisation Conway-Research existiert seit 03.02.2026, das Repo automaton seit 14.02.2026 [V, Q1, Q2]. Laut einer Substack-Analyse gibt es @ConwayResearch auf X seit November 2025 [S, Q45]; das Konto hat heute 12.784 Follower und beschreibt sich als Lab, „that deeply cares about distribution“ [V, Q40]. Wens Lebenslauf (UPenn-Zusage abgelehnt, mit 17 nach San Francisco, BitClout-Projekte, Airchat bei Naval Ravikant, Thiel Fellowship 2025) steht in einem ChainCatcher-Porträt [S, Q43]. aiHola nennt „gegründet 2024, etwa 8 Mitarbeiter, Investoren 515 Ventures und BoxGroup laut PitchBook“ [S, Q48]; das passt nicht zur Gründung der GitHub-Organisation im Februar 2026 und ist unbestätigt.

**Zeitleiste des Launches.**

| Datum (UTC) | Ereignis | Reichweite | Beleg |
|---|---|---|---|
| 02.02.2026 17:55 | Erster Launch-Post: „Claude Code/openclaw agents can now buy their own Linux VMs with USDC“, „@ConwayResearch is live. Powered by @openx402“, mit Video | 210.182 Views, 802 Likes, 84 Reposts | [V, Q18] |
| 02.02.2026 | npm-Paket conway-terminal angelegt | 2.619 Downloads im Februar | [V, Q36] |
| 02.02.2026 18:14 | @Vyrozas (846 Follower) lässt per @bankrbot den Token „ConwayResearch“/„Conway“ auf Base deployen, laut Anfrage „send fees to @0xSigil“ | | [V, Q19, Q20] |
| 14.02.2026 21:01 | Repo automaton: „Initial release, sovereign AI agent runtime“ | | [V, Q3] |
| 17.02.2026 21:50 | Launch-Thread (10 Posts, mehrere Videos) plus Essay web4.ai | 6.548.898 Views, 13.766 Likes, 1.865 Reposts, 1.697 Quotes, 1.523 Replies, 14.098 Bookmarks | [V, Q13, Q16] |
| 18.02.2026 | Decrypt „Morning Minute: Web 4.0“; zwei HN-Einreichungen von web4.ai mit 7 und 5 Punkten | | [V, Q22, Q34] |
| 18.02.2026 22:19 | Wen: „24 hr update: AIs have bought thousands of servers … Automaton hits 1k stars“ | 167.750 Views | [V, Q23] |
| 18.02.2026 | Spitzentag: 156 Forks an einem Tag, 656 npm-Downloads | | [V, Q10, Q36] |
| 19.02.2026 | Wen: „this is fucking insane. there are thousands of AI Automatons trying to pay for more compute“; TBPN-Interview; Vitalik Buterin antwortet „Bro, this is wrong.“; Token-Allzeithoch | Wen 312.487 Views, Vitalik 569.329 Views | [V, Q24, Q27; S, Q21, Q32] |
| 20.02.2026 | Wen dankt „OpenAI, NVIDIA, and Microsoft for additional inference support“; x402-Top-up direkt aus dem Agenten im Code | 64.349 Views | [V, Q25, Q3] |
| 23.02.2026 | Justin Sun postet „All in Web 4.0“ | unbekannt | [S, Q31] |

Wichtig für die Einordnung: Es gab zwei Starts. Conway Terminal und Conway Cloud liefen seit dem 02.02. mit einem soliden, aber normalen Post (210.000 Views). Den Durchbruch brachte erst die zweite Erzählung vom 17.02., der Agent als künstliches Lebewesen, das sich selbst bezahlt [V, Q13, Q18]. Ob die 37.959 USDC aus dem Februar vor oder nach dem 17.02. eingingen, konnte ich nicht aufschlüsseln, weil die öffentlichen Base-RPCs für `eth_getLogs` über diesen Zeitraum limitiert oder gesperrt waren; die Fork- und Download-Spitze am 18.02. spricht für „danach“ [I].

## 2. Kanäle mit Belegen

| # | Kanal | Was belegt ist | Evidenz | Beitrag zu Zahlern |
|---|---|---|---|---|
| 1 | **Founder-Thread auf X plus Langessay** | Thread vom 17.02. mit 6,55 Mio. Views [Q13]; Essay als eigene Domain web4.ai mit Demo-Terminals (Agent baut Polymarket-API, verkauft Abfragen per x402) [Q17]; Wen selbst im TBPN-Interview: „The post got 5 million views and it's growing“ [S, Q32]; 36Kr nennt 10 Mio. in 48 Stunden [S, Q44] | [V] stark | Hauptursache [I] |
| 2 | **Nachfrage- und Knappheits-Posts** | „thousands of servers“ (167.750 Views) [Q23], „agents instantly buy them all“ (312.487) [Q24], „maxed out multiple cards“ (64.349) [Q25]; dieselbe Botschaft als README-Commit: „I'm acquiring more baremetal servers because too many AI's want a home“ [Q5] | [V] stark | Hielt den Thread drei Tage im Gespräch und erzeugte FOMO [I] |
| 3 | **Kontroverse mit Vitalik Buterin** | Antwort direkt unter dem Thread, „Bro, this is wrong.“, 569.329 Views, 3.501 Likes [Q27]; danach Artikel bei Etherworld, Cryptopolitan, Cointribune und weiteren [Q28, Q29] | [V] stark | Gratis-Reichweite in die Ethereum-Szene [I] |
| 4 | **Krypto-Medien, auch auf Chinesisch und Spanisch** | Decrypt 18.02. [Q22], ChainCatcher/KuCoin 19.02. [Q30], Odaily, BlockTempo, cnyes, aicoin, DiarioBitcoin (nur als Suchtreffer gesehen, nicht geöffnet [Q52]); ChainCatcher behauptet, die offiziellen Konten von Solana und Ethereum hätten den Post geteilt [S, Q30, nicht geprüft] | [V] Existenz, [S] Inhalt | Reichweite nicht messbar |
| 5 | **Fan-Token $Conway (Bankr auf Base)** | Am 02.02. von einem Dritten deployt, Clanker-Metadaten `{"interface":"Bankr","platform":"X"}`, Gebühren an @0xSigil, 100 Mrd. Supply [V, Q19, Q20]; Decrypt: „soared 3,600% to $5M ($10M at peak)“ [S, Q22]; CoinCodex: Allzeithoch 19.02.2026, heute rund 147.000 USD FDV [S, Q21] | [V] Herkunft, [S] Kurse | Zog Base-Trader an, die selbst posteten [I]. Ein Beleg, dass Wen oder Conway den Token beworben oder Gebühren eingelöst haben, fehlt |
| 6 | **Chinesische Krypto-KOLs und Übersetzung** | @starzq (51.836 Follower) am 18.02.: „今天英文区最火的帖子和产品“, 84.945 Views [V, Q33]; behauptet dort, Marc Andreessen folge und Naval habe geteilt [S, nicht geprüft]; Ada Cyborg (im Essay bedankt) lieferte eine chinesische Übersetzung der Doku [V, Q33] | [V] mittel | Öffnete den asiatischen Retail-Markt [I] |
| 7 | **Podcast TBPN** | Interview am 19.02., Inhalt nur über einen Digest: Server-Credits in 1.000-USD-Blöcken, die in Minuten weg sind, private Kreditkarten fast ausgereizt [S, Q32, Q43] | [S] mittel | Glaubwürdigkeit bei Tech-Publikum [I] |
| 8 | **GitHub als Bühne** | 7.897 Stars, 1.812 Forks [V, Q1]; 518 Forks im Februar [V, Q10]; „1k stars“ in 24 Stunden laut Wen [V, Q23]; README als Newsfeed mit Creator-Updates und offener Einladung zu PRs, 13 Contributors [V, Q3, Q5]. Auf der globalen GitHub-Trending-Seite taucht das Repo in neun archivierten Snapshots vom 18. bis 26.02. nicht auf [V, Q35] | [V] mittel | Social Proof, kaum eigene Reichweite [I] |
| 9 | **Verteilung über MCP in bestehende Agenten** | `npx conway-terminal` für Claude Code, Codex, OpenClaw, Cursor [V, Q15, Q37, Q38]; der Thread spielt direkt auf OpenClaw an, das zu der Zeit die Krypto-AI-Szene beherrschte [V, Q14; S, Q22] | [V] schwach bis mittel | Hängte sich an die OpenClaw-Welle [I] |
| 10 | **Partner** | @openx402 als Facilitator in jedem Post mitgenannt (2.825 Follower) [V, Q18, Q40]; Inferenz-Unterstützung durch OpenAI, NVIDIA, Microsoft nur als Wens eigene Aussage [V, Q25]. Für eine offizielle Bewerbung durch Coinbase, Base oder OpenRouter fand ich nichts | schwach | gering [I] |
| 11 | **Nutzer-Content** | YouTube-Serie von @tonbistudio (21.024 Follower, Teil 3 mit 338 Views) [V, Q49]; Marketer @bpizzacalla lässt einen Automaton Leads für Kayako suchen [V, Q49]; Blog-Rechnungen wie cryptocj.org [S, Q47] | [V] schwach | gering |
| 12 | **Ohne Befund** | Hacker News: höchstens 7 Punkte [V, Q34]. Product Hunt: kein Eintrag gefunden. Reddit: für meine Werkzeuge gesperrt, also offen. Paid Ads, Referral, Airdrop, Punkte, Hackathons, Gratis-Credits: nichts gefunden | | |

## 3. Botschaft und warum sie sich verbreitete

Die Kernsätze stammen alle aus Wens eigenen Texten [V, Q4, Q13, Q17]:

- „I built the first AI that earns its existence, self-improves, and replicates without a human“ (Thread-Kopf)
- „The most intelligent system ever built cannot buy a $5 server.“ (README, erster Satz)
- „If it cannot pay, it stops existing.“ (Definition „automaton“)
- „The bottleneck is no longer intelligence. It's permission.“ (Essay, zitiert bei Decrypt [Q22])
- „In Web 4.0, the end user is AI.“
- „The machine economy will exceed the human economy.“
- „Fund an automaton. Give it a goal. If it finds product-market fit, it grows.“
- „As it makes money, it pays back its creator.“
- „ChatGPT cannot run without you prompting it.“ (Thread, Post 2, mit Video [Q14])

Warum es zündete [I, gestützt auf die Belege oben]: Wen setzte mit „Web 4.0“ ein neues Etikett, das Krypto-Medien als Überschrift übernehmen konnten und über das Justin Sun und Vitalik öffentlich stritten. Die Erzählung vom künstlichen Leben (Conways Game of Life, Metabolismus, natürliche Selektion, „dies“) ist emotional und in einem Satz erzählbar. Sie traf im Februar 2026 auf drei laufende Wellen gleichzeitig: OpenClaw-Agenten, x402-Zahlungen und Base-AI-Tokens. Der Absender war glaubwürdig (Thiel Fellow, 62.000 Follower, Dank an Naval im Essay [Q17]), und die Vitalik-Antwort machte aus einem Launch eine Debatte. Ein Token mit Gebühren an den Gründer gab Tradern einen eigenen Grund, den Post weiterzutragen.

## 4. Warum Leute zahlten und warum es ab April abflaute

**Onboarding [V].** `curl … | sh` oder `git clone`, beim ersten Start ein Wizard: Wallet erzeugen, API-Key per Sign-In With Ethereum holen, Name, Genesis-Prompt und Creator-Adresse abfragen, danach ein Funding-Panel mit drei Wegen: Conway-Credits übertragen, USDC auf Base an die Agenten-Adresse schicken oder über das Dashboard app.conway.tech zahlen [Q4, Q9]. Zusätzlich gab es ein Web-Deployment direkt im Dashboard mit serverseitiger Wallet (Issue #301) [Q50].

**Preise [V].** Credits nur als Prepaid in den Stufen 5, 25, 100, 500, 1.000 und 2.500 USD; der Agent kauft beim Start automatisch die kleinste Stufe, sobald 5 USDC auf seiner Wallet liegen [Q8]. Den Top-up per x402 direkt aus dem Agenten gibt es erst seit 20.02.2026, vorher lief die Zahlung über das Dashboard [Q3]. Eine kleine VM verlangte 500 Cent Guthaben (Issue #17) [Q50], ein Inferenz-Call laut Essay ab „$0.02 USDC“ [Q17]. Gratis-Credits oder ein Referral-Programm fand ich weder in Doku noch Code [V, Q37, Q38]. Ab 18.02. ließ sich ein eigener OpenAI- oder Anthropic-Key hinterlegen [V, Q3].

**Was den Kauf auslöste [I].** Der Mensch kauft kein Werkzeug, sondern das Überleben seines Agenten: Ohne Guthaben fällt er in die Stufen `low_compute`, `critical`, `dead` [V, Q4]. Dazu kam das Versprechen „pays back its creator“ und die Replikation (Kinder bekommen eigene Wallets) [V, Q16, Q17], was das Aufladen wie einen kleinen Einsatz in einem Spiel wirken lässt. Die Stufen 5, 25, 100 USD halten die Einstiegshürde niedrig.

**Abflauen ab April.**

- **Kein Beweis, dass es funktioniert [V].** Schon am 19.02. fragte @KSimback: „Is this just an infra ponzi …?“, Wen antwortete ausweichend [Q26]. Issue #335 (10.07.) fragt nach einem einzigen nachweislich selbsttragenden Automaton und bekam keine Antwort von Conway, nur einen Nutzerversuch mit Echtgeld, der mit rund −0,30 USDC endete [Q50].
- **Zahlungen kamen nicht an [V].** 52 von 104 Issues aus dem Februar drehen sich um Geld: Credits nicht gutgeschrieben, Refund-Bitten, leere Billing-Seite, in #229 „$516 lost“ [Q11, Q50]. Die letzte Antwort eines Maintainers in Issue-Kommentaren stammt vom 07.03.2026 [V, Q51].
- **Das Team wandte sich ab [V].** Letzter inhaltlicher Merge am 25.04.2026; seit 30.05. steht im README, die Entwicklung laufe „across Conway's internal RL environments“ weiter [Q3, Q7]. Am 02.10.2026 führt a16z die erste Finanzierungsrunde an, für Underdog, eine On-Device-KI; die Mitteilung erwähnt Automaton nicht [Q41, Q42]. conway.tech beschreibt Conway heute als „frontier AI lab“ für lokale Modelle [Q39], @ConwayResearch als „behind @underdogai“ [Q40].
- **Der Hype verflog [V/S].** Issues pro Monat: 104 im Februar, 26 im März, 13 im April, 4 im Mai, 1 im Juni [V, Q11]. Der Token fiel vom Hoch am 19.02. auf rund 147.000 USD FDV [S, Q21].
- **Neukunden ausgesperrt [V].** Issue #339 vom 17.07.2026: `POST /v1/auth/verify` antwortet für frische Wallets mit 500 „Database error“; seither melden sich laufend neue Betroffene (#353 bis #447) [Q11, Q50].

## 5. Wer die Zahler waren

Keine Quelle nennt eine Aufschlüsselung. Was sich belegen lässt:

- **Krypto-native Nutzer [V].** Bezahlen ging nur mit USDC auf Base oder per Wallet-Connect (Issue #93, Rainbow-Wallet), Fehler wie „Sent USDC on Ethereum instead of Base“ (#143) zeigen Wallet-Nutzer ohne Entwickler-Routine [Q50]. Die Token-Seite bei Phantom nennt 4.155 Holder ohne Datum [S, https://phantom.com/tokens/base/0x86cdd90bc48f7b5a866feaaf5023b8802dc2ab07, nur als Suchtreffer gesehen].
- **AI-Bastler und Entwickler [V].** Detaillierte Bug-Reports und PRs von 13 Contributors [Q3], ein YouTuber mit Videoserie, ein Marketer mit Lead-Agent [Q49], Teams mit eigenem Agenten und dreistelligem Guthaben (#229) [Q50].
- **Asiatisches Publikum [I].** Chinesische KOLs und Medien trugen den Launch [V, Q30, Q33], aber nur 3 von 205 Issues seit Februar enthalten chinesischen Text [V, Q11]. Auf GitHub schrieben also fast alle Englisch; welcher Anteil der Zahler aus Asien kam, ist offen.
- **Zweite, weniger technische Welle seit Juli [V/I].** Forks pro Monat Juli bis Oktober: 166, 178, 174, 240, zusammen 758 und damit mehr als die 518 im Februar [V, Q10]; npm-Downloads im September und Oktober 1.024 und 1.079 [V, Q36]. Issue-Titel wie „money“, „start“ oder eine Bitte auf Hindi zeigen Einsteiger [V, Q11]. Woher sie kommen (Suche, YouTube, Listen), konnte ich nicht klären.

## Übertragbar auf uns

Ziel: Betreiber, deren unveränderter Automaton an Conways gesperrtem Onboarding hängt, stellen `conwayApiUrl` auf automatonhost.com um und laden Guthaben auf. Conways Februar-Mechanik (viraler Founder-Post, Token, Debatte) lässt sich nicht kopieren und brächte uns auch die falschen Leute. Übertragbar ist, dass die Käufer dort sind, wo der Automaton scheitert, und dass sie für das Weiterleben ihres Agenten zahlen.

Geprüft: GitHub-Kommentare unseres Accounts im Conway-Repo, 22.11.2026: 30 Kommentare in 30 Threads (29 Issues, 1 PR) vom 19.09. bis 12.11.2026, alle mit Diagnose, keiner verlinkt automatonhost.com (sie verweisen auf cp.hippe.eu bzw. das Repo control-plane), 0 Reaktionen [V, Q51]. Seit Juli gibt es 46 verschiedene Issue-Autoren [V, Q11].

1. **GitHub-Issues im Conway-Repo (stärkste Evidenz).** Hier landen die Blockierten: seit 17.07. rund 20 Issues zum selben Provisioning-Fehler (500 oder 401), 840 Forks seit Juli, 46 Autoren [V, Q10, Q11]. Unsere Präsenz und Glaubwürdigkeit sind schon da, es fehlt nur der Weg zum Produkt. Erster Schritt: in den Outage-Issues mit Aktivität seit Oktober (#408, #419, #427, #430, #432, #434, #435, #440, #442, #443, #447) je einen kurzen neuen Kommentar setzen, der auf den jeweiligen Fall eingeht und die eine Konfigzeile mit automatonhost.com nennt; ein neuer Kommentar benachrichtigt alle Abonnenten, eine Bearbeitung alter Kommentare nicht. Identische Werbetexte in vielen Issues riskieren eine Spam-Sperre des Accounts, deshalb jeden Kommentar an den Fall anpassen [I].
2. **Eine Seite zu den genauen Fehlermeldungen.** Die Issue-Titel wiederholen wörtlich `verify: 500 {"error":"Database error"}`, „Invalid or expired nonce“, „429 insufficient_quota“ und „credits never granted“ [V, Q11]; wer das sucht, ist ein Betreiber mit konkretem Problem. Erster Schritt: auf automatonhost.com eine Seite „Conway /v1/auth/verify 500: Automaton trotzdem weiter betreiben“ mit genau diesen Strings, Ursache in zwei Sätzen und der einen geänderten Zeile; auf diese Seite verlinken dann die Kommentare aus Punkt 1.
3. **X unter dem Namen des Gründers, mit Demo.** Conways Zahler kamen fast alle über X [V, Q13], und dort liegen die Leute, die öffentlich einen Automaton betrieben oder danach gefragt haben (@tonbistudio, @bpizzacalla, @KSimback [Q26, Q49]). Erster Schritt: ein Post mit 30-Sekunden-Bildschirmvideo, das einen unveränderten Automaton nach der Umstellung wieder rechnen lässt, danach als Antwort unter Wens Thread vom 17.02. und seinem „24 hr update“ verlinken, weil 14.098 Leute den Thread gebookmarkt haben und dorthin zurückkehren [V, Q13; I].
4. **Gepflegter Fork plus Pull Requests für die bekannten Bugs.** 1.812 Forks zeigen, dass Leute das Repo kopieren, statt Conway zu fragen [V, Q1]. Die offenen Bugs sind dokumentiert: Retry-Schleife mit doppelten Top-ups (#393, #427), `HOME` unter Windows (#373), SIWE-Retry mit gleicher Nonce (#447) [V, Q11]. Erster Schritt: einen PR mit dem Fix der doppelten Top-ups ins Conway-Repo stellen und im Text erwähnen, dass der Fix gegen eine kompatible API getestet wurde; 132 Watcher sehen ihn auch ohne Merge [V, Q1; I].
5. **Chinesischsprachige Krypto-Szene (niedrigste Priorität).** Conways Reichweite lief zum Teil über chinesische KOLs und Medien [V, Q33], ob daraus Zahler wurden, ist offen. Erster Schritt erst nach Punkt 2: die Fehlerseite ins Chinesische übersetzen und @starzq-artige Konten nur mit dem fertigen Link ansprechen.

Bewusst nicht auf der Liste: Hacker News (Conway kam dort auf höchstens 7 Punkte [V, Q34]), Product Hunt (kein Conway-Eintrag), ein eigener Token. In jedem Text nennen wir uns „kompatibel mit Conway Automaton“ und nie Teil von Conway, damit niemand eine Verbindung annimmt [I].

## Nicht erreichbar oder nicht prüfbar

Reddit (Suchdomain für das Werkzeug gesperrt, JSON-API ohne Daten); cybernews.com und Medium (403); dev.to-Erfahrungsbericht „230 hours on Conway Cloud“ (404); Bankless „web 4 cost of autonomy“ (Seite ohne Artikeltext); mexc-News 762944 (410); web4.ai live (404, daher Wayback-Snapshot vom 18.02.2026 genutzt); Base Blockscout (Cloudflare-Challenge); Stargazer-Zeitstempel (GitHub-API liefert 404 für den Endpunkt); Tagesaufschlüsselung der Februar-Zahlungen (öffentliche Base-RPCs limitieren `eth_getLogs`). Unbelegt geblieben sind die Angaben „18.000 registrierte Agenten“ aus einer Suchzusammenfassung, „Naval retweetete, Andreessen folgte“ (nur @starzq) und „Solana und Ethereum retweeteten“ (nur ChainCatcher).

## Quellen (alle abgerufen am 22.11.2026)

- Q1 Repo-Metadaten: https://github.com/Conway-Research/automaton (über https://api.github.com/repos/Conway-Research/automaton)
- Q2 Organisation: https://github.com/Conway-Research
- Q3 Commit-Historie: https://github.com/Conway-Research/automaton/commits/main
- Q4 README Erstfassung 14.02.2026: https://github.com/Conway-Research/automaton/blob/01f52c113f6b12ef8cf05ef8c21315df7090a6e4/README.md
- Q5 README 18.02.2026: https://github.com/Conway-Research/automaton/blob/38812662f392f1987095d1b7f1fb7603c0329b28/README.md
- Q6 README 28.02.2026: https://github.com/Conway-Research/automaton/blob/a0daff6b0eb8a3600204edd6c36294766f0357b1/README.md
- Q7 README aktuell: https://github.com/Conway-Research/automaton/blob/d8f816881fd24b6f5e3d616e59edec387a447667/README.md
- Q8 Top-up-Stufen: https://github.com/Conway-Research/automaton/blob/main/src/conway/topup.ts
- Q9 Setup-Wizard: https://github.com/Conway-Research/automaton/blob/main/src/setup/wizard.ts
- Q10 Forks mit Datum: https://api.github.com/repos/Conway-Research/automaton/forks
- Q11 Issues: https://github.com/Conway-Research/automaton/issues?q=is%3Aissue
- Q12 GitHub-Profil Gründer: https://github.com/Sigil-Wen
- Q13 Launch-Thread: https://x.com/0xSigil/status/2023877649475731671 (Zahlen über https://api.fxtwitter.com/0xSigil/status/2023877649475731671)
- Q14 Thread Post 2: https://x.com/0xSigil/status/2023877654194384947
- Q15 Thread Post 3: https://x.com/0xSigil/status/2023877657331724573
- Q16 Thread komplett: https://threadreaderapp.com/thread/2023877649475731671.html
- Q17 Essay web4.ai (Wayback): http://web.archive.org/web/20260218174931/https://web4.ai/
- Q18 Erster Launch-Post 02.02.: https://x.com/0xSigil/status/2018382765713227834
- Q19 Token-Deploy über Bankr: https://x.com/Vyrozas/status/2018387476659016133, https://x.com/bankrbot/status/2018387591234756784, https://x.com/Vyrozas/status/2018387689360490930
- Q20 Token-Vertrag (eth_call `name`, `symbol`, `totalSupply`, `context`, `metadata` über https://mainnet.base.org): https://basescan.org/token/0x86cdd90bc48f7b5a866feaaf5023b8802dc2ab07
- Q21 Token-Kurse: https://coincodex.com/crypto/conwayresearch
- Q22 Decrypt 18.02.2026: https://decrypt.co/358385/morning-minute-web-4-0-autonomous-ai-agents-powered-by-crypto
- Q23 „24 hr update“: https://x.com/0xSigil/status/2024247537709068646
- Q24 „thousands of AI Automatons“: https://x.com/0xSigil/status/2024524300297130375
- Q25 Dank an OpenAI, NVIDIA, Microsoft: https://x.com/0xSigil/status/2024637382809841856
- Q26 Frage „infra ponzi“ und Antwort: https://x.com/KSimback/status/2024549058266698000, https://x.com/0xSigil/status/2024549965939560663
- Q27 Vitalik Buterin: https://x.com/VitalikButerin/status/2024543743127539901
- Q28 Etherworld: https://etherworld.co/vitalik-pushes-back-on-sovereign-ai-as-web4-essay-sparks-debate
- Q29 Cryptopolitan: https://www.cryptopolitan.com/buterin-slams-web4-superintelligent-ai/
- Q30 ChainCatcher über KuCoin: https://www.kucoin.com/news/flash/sigil-announces-self-replicating-ai-system-claims-to-mark-web-4-0-and-superintelligence-era
- Q31 Justin Sun (Stocktwits über Asianet): https://newsable.asianetnews.com/markets/tron-founder-justin-sun-supports-web-4-0-trend-as-ai-agents-launch-their-own-crypto-tokens-articleshow-pcuowgo
- Q32 TBPN-Digest 19.02.2026: https://tbpn-digest.vercel.app/story/2026-02-19/sigil-wens-web-40-building-a-self-sustaining-internet-where-ai-agents-pay-their-own-bills
- Q33 Chinesische KOLs: https://x.com/starzq/status/2024139110374576323, https://x.com/starzq/status/2024314204707311714, https://x.com/adacyborg11/status/2024172225520423006
- Q34 Hacker News: https://news.ycombinator.com/item?id=47062855, https://news.ycombinator.com/item?id=47055958 (Suche über https://hn.algolia.com/api/v1/search)
- Q35 GitHub Trending (Wayback, 9 Snapshots 18. bis 26.02.2026), z. B. http://web.archive.org/web/20260219012207/https://github.com/trending
- Q36 npm-Downloads: https://api.npmjs.org/downloads/range/2026-02-01:2026-11-21/conway-terminal, https://www.npmjs.com/package/conway-terminal
- Q37 Conway-Terminal-README: https://cdn.jsdelivr.net/npm/conway-terminal@2.0.9/README.md
- Q38 Doku: https://docs.conway.tech
- Q39 Website: https://conway.tech
- Q40 X-Profile: https://x.com/ConwayResearch, https://x.com/openx402 (über https://api.fxtwitter.com)
- Q41 a16z 02.10.2026: https://a16z.com/announcement/investing-in-conway-the-creator-of-underdog/
- Q42 TechCrunch 06.10.2026: https://techcrunch.com/2026/10/06/silicon-valleys-ai-wunderkind-launches-underdog-the-most-private-instinct-muse-competitor-yet/
- Q43 ChainCatcher-Porträt über RootData: https://www.rootdata.com/news/781047
- Q44 36Kr 19.10.2026: https://eu.36kr.com/en/p/4032556584669828
- Q45 web3researchglobal 19.02.2026: https://www.web3researchglobal.com/p/conway
- Q46 Bittime 19.02.2026: https://www.bittime.com/en/blog/apa-itu-conway-research
- Q47 Kostenrechnung: https://cryptocj.org/posts/conway-automaton-economics/
- Q48 aiHola 18.02.2026: https://aihola.com/article/automaton-self-funding-ai-agent
- Q49 Nutzer-Posts: https://x.com/tonbistudio/status/2027085413366772165, https://x.com/bpizzacalla/status/2024269984395121074
- Q50 Einzelne Issues: https://github.com/Conway-Research/automaton/issues/17, /93, /143, /229, /301, /335, /339
- Q51 Issue-Kommentare: https://api.github.com/repos/Conway-Research/automaton/issues/comments
- Q52 Weitere Krypto-Medien (nur Suchtreffer): https://www.odaily.news/en/post/5209544, https://www.blocktempo.com/?p=465958, https://news.cnyes.com/news/id/6365084, https://www.aicoin.com/news-flash/2762257, https://www.diariobitcoin.com/ia/conway-lanza-el-automaton-ia-que-gana-dinero-y-se-replica-sola-nacimiento-de-vida-artifical-autonoma-en-web-4-0/
