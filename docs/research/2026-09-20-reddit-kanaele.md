# Wohin gehört das Logbuch auf Reddit, und unter welchen Bedingungen?

Stand 20.09.2026. Anlass: Der Dienst hat seit dem 19.09.2026 genau einen zahlenden fremden Kunden,
bis zum 19.10.2026 sollen es fünf sein. Der erste kam über drei Kommentare in Conway-Issues
(`2026-09-19-woher-kam-der-kunde.md`). Reddit ist der nächste zu prüfende Kanal, und der Rohstoff
liegt bereit: 41 Stunden eigener Automaton-Betrieb, 9,18 USDC Ausgaben gegen 0,04 USDC Einnahmen,
603 On-Chain-Mikrozahlungen mit 0,0065 USDC Durchschnitt, 5,00 USDC beim Erststart an Conway
verloren, 649 Turns in sieben Tagen, dazu elf Address-Poisoning-Transfers über 0,00 USDC von einer
Adresse, die Conways payTo-Adresse vorne und hinten nachahmt.

Das Ergebnis vorweg, weil es der Erwartung widerspricht: **Upvotes sind in keinem der geprüften
Subreddits zu erwarten.** Der Post, der dem geplanten Format am nächsten kommt, den es auf Reddit
gibt, hat eine einzige Stimme bekommen. Die Empfehlung am Ende folgt deshalb nicht der Frage, wo
die meisten Leute sind, sondern wo der Post stehenbleibt und von den richtigen zwanzig gelesen wird.

## Wie gemessen wurde, und was nicht messbar war

Reddit ist für unauthentifizierte Abrufe vollständig zu. Das ist kein Nebensatz, sondern bestimmt,
welche Zahlen in diesem Dokument belegt sind und welche nicht.

| Weg | Ergebnis |
|---|---|
| `https://www.reddit.com/r/LocalLLaMA/about.json` | HTTP 403, HTML-Seite "Blocked" |
| `https://old.reddit.com/r/AI_Agents/.rss` | HTTP 403 |
| `robots.txt` | `User-agent: *` / `Disallow: /` |
| Redlib-Instanzen (`red.artemislena.eu`, `safereddit.com`, `redlib.privacyredirect.com`, `redlib.privadency.com`, `redlib.catsarch.com`) | Anubis-Proof-of-Work-Schutz, nicht umgangen |
| `eddrit.com` | ebenfalls Anubis |
| `api.pullpush.io` | durchgängig HTTP 429 |
| `r.jina.ai`, `api.allorigins.win`, `corsproxy.io`, `gateway.reddit.com` | 403, 522 beziehungsweise API-Schlüssel nötig |

Gemessen wurde deshalb über vier Quellen, jede mit eigener Schwäche, die hier jeweils dabeisteht:

1. **arctic-shift** (`arctic-shift.photon-reddit.com`), das öffentliche Reddit-Archiv. Liefert
   Post-Volumen, Volltextsuche über Titel und Text, Subreddit-Metadaten und die
   AutoModerator-Meldungen. Schwäche: Posts werden rund 20 Sekunden nach Erstellung eingelesen,
   der dort gespeicherte `score` ist deshalb immer 1 und als Upvote-Zahl wertlos. Skript:
   `data/reddit-scan.py`, Rohdaten: `data/2026-09-20-reddit-subreddits.json`.
2. **embed.reddit.com**, der für Einbettung durch Dritte vorgesehene Host. Liefert pro Post die
   aktuelle Upvote-Zahl als `<faceplate-number number="…">` und erkennt gelöschte Posts. Das ist
   die einzige Live-Quelle, die geantwortet hat. Skript: `data/reddit-score.py`.
3. **Wayback Machine**, Snapshots von `old.reddit.com/r/<sub>/about/rules`. Nur dort sind die
   Regeln im Wortlaut zu bekommen, denn die heutige Regelseite ist gesperrt und die Snapshots von
   `www.reddit.com` sind leere JavaScript-Hüllen. Jedes Zitat unten steht mit Snapshot-Datum.
   Rohdaten: `data/2026-09-20-reddit-regeln.json`.
4. **prowlo.com** und **gummysearch.com** für Mitgliederzahlen, jeweils mit Erhebungsdatum des
   Anbieters. Eine einzige eigene Live-Messung gelang: r/LocalLLaMA hatte am 20.09.2026 um 09:32 UTC
   genau 829.684 Mitglieder (Redlib-Abruf, bevor Anubis zuschlug).

**Nicht ermittelbar:** Die Regelseiten von r/ethdev, r/ethereum und r/CryptoTechnology, weil die
Wayback Machine seit 2024 keinen brauchbaren Snapshot hat. Für diese drei steht unten die Sidebar
aus den Reddit-eigenen Metadaten, also der Text, den die Moderatoren selbst geschrieben haben.
Ebenfalls nicht ermittelbar: Volltextsuche in Kommentaren großer Subreddits (Server-Timeout bei
Fenstern über einem Monat) und die Karma-Schwellen als Zahl, weil AutoModerator-Konfigurationen
laut Reddit nicht öffentlich sind. Was davon trotzdem belegbar ist, steht im Abschnitt über das
neue Konto.

## Die Kandidaten im Einzelnen

Jede Mitgliederzahl steht mit Quelle und Datum, jede Posts-pro-Tag-Zahl ist aus den Zeitstempeln
der jeweils letzten 100 eingelesenen Posts gerechnet (eigene Messung, 20.09.2026). Jedes
Regelzitat steht im Wortlaut mit Link auf die Regelseite und dem Datum des Snapshots, aus dem es
stammt, weil die Live-Seite gesperrt ist.

### r/LocalLLaMA

829.684 Mitglieder (eigene Messung, 20.09.2026 09:32 UTC), 80,3 Posts pro Tag (100 Posts über
29,6 Stunden), 68 Prozent Selfposts.

Regelseite: <https://www.reddit.com/r/LocalLLaMA/about/rules/>, zitiert nach dem Wayback-Snapshot
vom 07.08.2026 (<https://web.archive.org/web/20260807221923/https://old.reddit.com/r/LocalLLaMA/about/rules/>).

> **2. Off-Topic Posts.** Posts must be related to Llama or the topic of LLMs.

> **4. Limit Self-Promotion.** The 1/10th rule is a good guideline: self-promotion should not be
> more than 10% of your content. Affiliation must be disclosed: No engagement farming, No "I found
> this..", etc.

Dazu der gepinnte Project-Showcase-Megathread vom 14.09.2026 (29 Upvotes, 120 Kommentare,
<https://www.reddit.com/r/LocalLLaMA/comments/1wgcpww/>), dessen Schlusssatz für uns entscheidend ist:

> NOTE: This community is geared towards open weight, open source, locally hostable software. Thus
> any closed source commercial service or other such projects will be removed.

`cp.hippe.eu` ist ein bezahlter Dienst unter PolyForm Noncommercial 1.0.0 ("Do not sell it as a
service", `LICENSE.md`). Das ist keine Open-Source-Lizenz im Sinne der OSI. Der Showcase-Thread
ist damit zu.

**Mindestanforderung, belegt:** AutoModerator entfernt Posts von Konten unter fünf Karma. Wortlaut
aus einer Entfernung vom 19.09.2026, erhoben über arctic-shift:

> Hello! Your post was removed as you do not have sufficient karma on r/LocalLLaMa. We are doing
> this in response to the large volume of spam we are unfortunately experiencing. Please participate
> in the sub (through comments), gain the minimum of 5 karma and then re-post

**Wurde hier über x402 gesprochen:** ja, 25 Posts seit April 2025. Über Conway oder die
Automaton-Runtime: nein. Die sieben Treffer auf "conway" sind sämtlich Conways Game of Life, die
acht auf "automaton" betreffen andere Projekte.

**Wie die x402-Posts liefen:** Ich habe alle 25 über `embed.reddit.com` nachgemessen. Drei sind
gelöscht, die übrigen 22 stehen bei null oder einem Upvote. Kein einziger hat zweistellig
abgeschnitten, auch der vom Vortag nicht:
`[Disclosure: I built this] x402-powered API for 24 countries of economic data` vom 19.09.2026
(<https://www.reddit.com/r/LocalLLaMA/comments/1wk9pox/>) steht bei null.

Zum Vergleich die Verteilung eines normalen Tages: 30 Posts vom 12.09.2026, Median 1 Upvote, sieben
davon inzwischen gelöscht, aber sechs über zehn und ein Ausreißer bei 1.975
(`This seems more probable than it was before.`, <https://www.reddit.com/r/LocalLLaMA/comments/1wepx7w/>),
264 für `Qwen3.8 Flash Next now at 1.2k t/s prefill on Strix Halo`, 102 für `Real-SWE Benchmark (new)`.
Der Subreddit belohnt also durchaus, aber ausschließlich Modelle, Benchmarks und Hardware.

### r/AI_Agents

434.356 Mitglieder (prowlo.com, Stand 04.09.2026), 85,2 Posts pro Tag (100 Posts über 27,9 Stunden),
100 Prozent Selfposts.

Regelseite: <https://www.reddit.com/r/AI_Agents/about/rules/>, zitiert nach dem Wayback-Snapshot
vom 28.07.2026 (<https://web.archive.org/web/20260728122000/https://old.reddit.com/r/AI_Agents/about/rules/>).

> **3. Put your links in the comments, not the posts.** This is mainly to prevent spam. If you have
> a blog post you want to link, link it in the comments. If you have a project you want to show off,
> link it in the weekly project display thread.

> **4. Limit self promotion.** Self promotion is fine, but if your posts are all self promotion
> (including promotion of your projects/products), you will be banned. A good ratio is one out of
> ten posts/comments.

Das ist die freundlichste Regel im ganzen Feld: Eigenwerbung ist erlaubt, der Link gehört nur nicht
in den Post, sondern in einen eigenen Kommentar darunter.

**Mindestanforderung:** keine Karma-Schwelle gefunden. Die AutoModerator-Meldungen dieses
Subreddits sind ein Wiki-Hinweis unter jedem Post und eine Entfernung mit dem Text
"Your comment has been removed. Surveys and polls aren't allowed here." (19.09.2026). Eine
Karma- oder Altersschwelle taucht in der Stichprobe nicht auf. Das ist ein schwacher Beleg für ihre
Abwesenheit, kein starker: AutoModerator-Konfigurationen sind nicht öffentlich.

**Wurde hier über x402 gesprochen:** ja, und aktuell. 25 Posts, davon zwölf seit dem 29.08.2026,
unter anderem `If your agent can pay for things automatically, it can also get scammed`
(05.09.2026, <https://www.reddit.com/r/AI_Agents/comments/1w7wz82/>), also genau das Thema des
Address-Poisoning-Befunds. Über Conway: nein, die fünf Treffer sind Conways Gesetz.

**Wie es dort läuft:** Die 25 x402-Posts liegen bei Median 1, Maximum 12, drei sind gelöscht. Die
Tagesstichprobe vom 12.09.2026 liegt bei Median 1 und Maximum 9. In diesem Subreddit gibt es keinen
Ausreißer nach oben: 85 Posts pro Tag, und fast jeder davon versinkt bei ein bis vier Stimmen. Die
beiden besten thematisch passenden Posts der letzten drei Wochen sind
`VALIDATION on my Fable 5 agent that I gave a domain, wallet and email, making it a full blown
business from an initial prompt` (12 Upvotes, <https://www.reddit.com/r/AI_Agents/comments/1w1q4d2/>)
und `Four AI-agent-payment updates in the last few days: Stripe, Natural, Binance, Chainlink`
(12 Upvotes, <https://www.reddit.com/r/AI_Agents/comments/1vtuj37/>).

### r/ethdev

125.000 Mitglieder (gummysearch.com, Stand 18.09.2026), 6,1 Posts pro Tag (100 Posts über
387,7 Stunden, also gut 16 Tage), 58 Prozent Selfposts.

Eine Regelseite existiert, ist aber seit 2024 nicht mehr archiviert und heute gesperrt. Was die
Moderatoren selbst in die Sidebar geschrieben haben (Reddit-Metadaten über arctic-shift,
abgerufen 20.09.2026), ist eindeutig:

> #Ethereum Development and DApps
>
> No specific rules are enforced apart from the normal global reddit rules.

**Mindestanforderung:** keine gefunden. Die einzige AutoModerator-Regel in der Stichprobe betrifft
die Formatierung von Code-Fragen ("there was no `inline code` in your post").

**Wurde hier über x402 gesprochen:** ja, 25 Posts, und mehrere davon haben exakt das geplante
Format. Drei Beispiele, jeweils mit heute nachgemessener Upvote-Zahl:

| Post | Datum | Upvotes |
|---|---|---:|
| [Two months running a pay-per-call API on x402: every number including the zeros, plus two production incidents only real settlements caught](https://www.reddit.com/r/ethdev/comments/1v5f0t1/) | 24.07.2026 | 1 |
| [I indexed all x402 USDC settlement on Base for 30 days — 95% of transactions are one routing pair, price-matched volume is ~$37k/mo](https://www.reddit.com/r/ethdev/comments/1v558ba/) | 24.07.2026 | 1 |
| [I pulled every resource in Coinbase's x402 Bazaar (14.820 paid endpoints) and summed Coinbase's own 30-day counters](https://www.reddit.com/r/ethdev/comments/1w1hu3z/) | 29.08.2026 | 1 |

Das ist der wichtigste Einzelbefund dieser Recherche. Wer vor uns genau das geschrieben hat, was
wir schreiben wollen, hat dafür eine Stimme bekommen. Alle 25 x402-Posts in r/ethdev liegen
zwischen null und fünf Upvotes.

Der Subreddit belohnt aber auch sonst nichts: In der Stichprobe von 32 Posts zwischen dem 01. und
15.09.2026 liegt der Median bei 1 und das Maximum bei 6
(`Over a year of writing about EVM internals. Here's where I'd start.`). Zwei Posts der Stichprobe
tragen `[ Removed by Reddit ]`, sind also seitenweit entfernt worden. Eine Stimme ist hier der
Normalfall, kein Urteil.

### r/ethereum

3,7 Millionen Mitglieder (gummysearch.com, Stand 18.09.2026), 4,4 Posts pro Tag (100 Posts über
543,2 Stunden, also 22 Tage). Das ist das auffälligste Verhältnis im ganzen Feld: sehr groß, fast
tot.

Die Regeln stehen in der Sidebar (Reddit-Metadaten über arctic-shift, abgerufen 20.09.2026), und
dort steht auch die einzige explizit dokumentierte Mindestanforderung aller geprüften Subreddits:

> Posts and comments must be made from an account at least 10 days old with a minimum of 20 comment
> karma. Exceptions may be made on a discretionary basis.

Weiter aus derselben Liste:

> No spamming or drive by posting.
> Keep price discussion and market talk, posts that state how much coins you brought/own, memes &
> exchanges to the daily general discussion pinned post.
> For deeper Ethereum dev discussion also see r/ethdev

Der letzte Satz ist eine Wegweisung: Der Subreddit verweist technische Entwicklerthemen selbst nach
r/ethdev. AutoModerator entfernt außerdem Textposts unter 50 Zeichen.

**Wurde hier über x402 gesprochen:** ja, 13 Posts, der jüngste vom 03.06.2026, dazu zwei Kommentare
im Zeitraum 20.08. bis 20.09.2026. Das Thema läuft hier langsamer als in r/ethdev und r/AI_Agents.

### r/selfhosted

835.969 Mitglieder (prowlo.com, Stand 09.09.2026), 63,0 Posts pro Tag.

Regelseite: <https://www.reddit.com/r/selfhosted/about/rules/>, zitiert nach dem Wayback-Snapshot
vom 11.08.2026 (<https://web.archive.org/web/20260811152937/https://old.reddit.com/r/selfhosted/about/rules>).

> **2. Spam / Self-Promotion / Affiliate Links.** Do not spam or promote your own projects too much.
> We expect you to follow this Reddit self-promotion guideline. Promoted apps must be production
> ready and have docs. No direct ads for web hosting or VPS. Only mention your service in comments
> if it's relevant and adds value.

> **4. Blog Link Posts.** Blog posts are allowed, but do not post just a link, add an explanation
> about the blog, why it matters, and how it helps users.

> **6. New Projects - "New Project Megathread" Exceptions.** Only in the current "New Project
> Megathread", you may post projects that are younger than 3 months (measured by first public
> presence, e.g. git commit, social media post, etc.).

Regel 6 ist für uns bindend. Das Repo ist am 19.09.2026 öffentlich geworden, der Dienst ist einen
Tag alt. Ein eigener Post über `cp.hippe.eu` gehört hier bis zum 19.12.2026 ausschließlich in den
New-Project-Megathread. Ein Logbuch über den Betrieb eines fremden Runtimes ist kein Projektpost
und fiele nicht unter Regel 6, wäre dann aber nach Regel 1 zu prüfen ("All posts must be about
self-hosting").

**Wurde hier über x402 gesprochen:** praktisch nicht. Ein einziger Treffer seit Bestehen
(16.03.2026), keiner zu Conway. Das ist nicht unsere Leserschaft.

### r/CryptoTechnology

1,3 Millionen Mitglieder (gummysearch.com, Stand 19.09.2026), 7,1 Posts pro Tag. Auch hier: sehr
groß, fast still.

Die Beschreibung des Subreddits ist selbst die Regel (Reddit-Metadaten, abgerufen 20.09.2026):

> A subreddit for serious & technical discussion of cc/blockchain technology. Absolutely no memes,
> links, price, marketing or promotional posts allowed.

**Eigenwerbung ist hier vollständig verboten.** Es gibt keinen Weg drumherum, auch keinen
Megathread. Ein Logbuch ohne jeden Link und ohne jede Nennung des eigenen Dienstes wäre formal
zulässig, aber dann fehlt ihm der Zweck.

**Mindestanforderung, belegt:** AutoModerator entfernt Posts neuer Konten, sobald ein
Link-Shortener im Spiel ist ("It appears you're trying to post a URL shortener and your account is
too new. The post has been removed.", 05.09.2026), und der Spam-Filter greift sichtbar oft: vier
der sechs erfassten AutoModerator-Meldungen aus dem Zeitraum Juli bis September 2026 lauten
"has been automatically removed because it triggered our spam filters".

### r/MachineLearning

3.070.476 Mitglieder (prowlo.com, Stand 08.09.2026). Bei der Aktivität gehen die Zahlen
auseinander, und die Differenz ist selbst ein Befund: prowlo misst 5,7 Posts pro Tag (100 Posts
über 17,3 Tage), meine Messung über das Archiv kommt auf 21,4 (100 Posts über 111 Stunden).
prowlo sieht nur, was stehenbleibt, das Archiv sieht auch das, was wieder verschwindet. Rund drei
Viertel der Einreichungen überleben hier also nicht.

Regelseite: <https://www.reddit.com/r/MachineLearning/about/rules/>, zitiert nach dem
Wayback-Snapshot vom 16.07.2026
(<https://web.archive.org/web/20260716084247/https://old.reddit.com/r/MachineLearning/about/rules>).

> **2. No Self-Promotion.** r/MachineLearning does not permit the promotion of paid products,
> wherein the intent is clearly to promote a particular product. However, posts with links to paid
> products are acceptable, contingent on the fact that the post offers sufficient value to the
> community members and the intent is to share a resource or collect feedback for an open-dialogue.
> The decision will be made entirely at the discretion of the moderator team.

> **3. No Marketing Campaigns (SEO).** r/MachineLearning strictly prohibits strategic marketing
> campaigns targeted at community members, and posts intended to rank for SEO purposes. In the
> event that such behavior is caught, the user in violation of our policy will be perpetually banned
> with all past posts and comments purged entirely from the subreddit.

**Mindestanforderung:** keine Karma-Schwelle gefunden, dafür zwei harte Formregeln, die
AutoModerator selbst durchsetzt: Der Titel braucht ein Kürzel ([R], [N], [P] oder [D]), und
Link-Posts sind werktags gesperrt (Meldungen vom 13. und 19.09.2026).

**Wurde hier über x402 gesprochen:** ein einziger Post seit Bestehen
(`[R] We indexed all 3 agent payment protocols (x402…)`, 02.05.2026). Falsche Leserschaft.

### r/singularity

3.959.207 Mitglieder (prowlo.com, Stand 29.08.2026), 63,3 Posts pro Tag.

Regelseite: <https://www.reddit.com/r/singularity/about/rules/>, zitiert nach dem Wayback-Snapshot
vom 28.08.2026
(<https://web.archive.org/web/20260828184532/https://old.reddit.com/r/singularity/about/rules>).

> **2. Self-Promotion/Advertising Spam.** Self-Promotion/Advertisement posts will not be tolerated.
> This includes all cypto-scams and ICOs. Paywalled articles are not allowed either. Any posts with
> potentially financial motives will be removed. If you think your post might break this rule,
> please contact the moderators over modmail.

**Eigenwerbung ist hier vollständig verboten**, und der Halbsatz "any posts with potentially
financial motives" trifft ein Logbuch über einen bezahlten Dienst direkt. Dazu Regel 5: "No
fear-mongering about AI and its impact. This is a pro-AI sub." Eine Geschichte über einen Agenten,
der 230-mal mehr ausgibt als er einnimmt, ist dort strukturell unerwünscht.

### r/homelab

1.082.503 Mitglieder (prowlo.com, Stand 02.09.2026).

Regelseite: <https://www.reddit.com/r/homelab/about/rules/>, zitiert nach dem Wayback-Snapshot
vom 17.08.2026
(<https://web.archive.org/web/20260817160242/https://old.reddit.com/r/homelab/about/rules/>).

> **6. No Commercial Advertising or Monetized Referral Links.** Monetized referral links, affiliate
> links, product advertising, and company advertising are not allowed. Contact the moderators via
> Mod Mail before posting if you believe an exception applies. Non-commercial personal projects are
> permitted, but must follow all other sub rules.

> **7. Software Project Posting Requirements.** All software projects must be relevant to r/homelab,
> use a "Project: Software" flair, disclose AI usage with post flair and in the text of the post,
> include responses to the prompt displayed when posting with one of the software project flairs,
> and the user must meet the minimum subreddit karma requirement.

`cp.hippe.eu` ist ein bezahlter Dienst, also gewerbliche Werbung im Sinne von Regel 6. Der einzige
dokumentierte Weg ist Mod Mail vor dem Posten. Beide Regeln greifen nachweislich: AutoModerator hat
am 19.09.2026 einmal mit "Company Promotion is not permitted" und einmal mit

> Your post has been automatically removed because **you do not meet the minimum subreddit karma
> requirement** to share a software project here. Please see rule #7 below for more details.

entfernt. Die Zahl hinter der Karma-Schwelle steht nirgends. 62,9 Posts pro Tag, kein einziger
x402-Treffer seit Bestehen. Thematisch passt ein Logbuch über einen Agenten ohnehin nicht zu einem
Subreddit über Hardware im Keller.

### r/LLMDevs

169.173 Mitglieder (prowlo.com, Stand 14.09.2026), 21,8 Posts pro Tag nach prowlo.

Regelseite: <https://www.reddit.com/r/LLMDevs/about/rules/>, zitiert nach dem Wayback-Snapshot
vom 16.07.2026
(<https://web.archive.org/web/20260716085605/https://old.reddit.com/r/LLMDevs/about/rules>).

> **5. No commercial self-promotion: Share openly, not for profit.** Posts or comments promoting
> yourself, your brand, or content for monetary gain will be removed without warning.
> To encourage members to share their projects, advertising is allowed with these restrictions:
> The free version must be functionally identical to any other version — no locked features behind
> a paywall / commercial / "pro" license.
> Must be FOSS-licensed OR meet all three: source-available, prior mod approval, clear disclaimer.

Das ist die einzige Regel im Feld, die unsere Lizenzlage direkt entscheidet. PolyForm Noncommercial
1.0.0 ist source-available, aber keine FOSS-Lizenz. Der zweite Zweig gilt also, und der verlangt
**vorherige Moderatoren-Freigabe**. Ein Post ohne Modmail vorher wird nach Regel 5 ohne Warnung
entfernt.

### r/mcp

119.891 Mitglieder (prowlo.com, Stand 04.09.2026).

Regelseite: <https://www.reddit.com/r/mcp/about/rules/>, zitiert nach dem Wayback-Snapshot
vom 16.07.2026 (<https://web.archive.org/web/20260716085047/https://old.reddit.com/r/mcp/about/rules>).

> **3. No astroturfing.** Self-promotion is allowed with proper disclosure. Anyone caught promoting
> their product while pretending to be an unaffiliated user will be permanently banned.

> **4. Use showcase tag to share your work.** If you've built something in the MCP ecosystem, use
> showcase tag to indicate authorship and intent of demonstrating your work to others.

Die freizügigste Regel überhaupt: Eigenwerbung ausdrücklich erlaubt, solange offengelegt. Nur passt
das Thema nicht. `cp.hippe.eu` implementiert die Conway-API, nicht MCP.

### r/SideProject

Die Regelseite (<https://web.archive.org/web/20260828184531/https://old.reddit.com/r/SideProject/about/rules>,
Snapshot 28.08.2026) ist leer: Der Subreddit hat keine einzige Regel hinterlegt. Die Sidebar gibt
nur ein Titelformat vor ("[Project name] - [Short description]"). Ein Post ist dort erlaubt und
folgenlos, weil dort ausschließlich Leute posten, die selbst etwas verkaufen wollen.

## Das neue Konto: was zuerst passieren muss

Das Konto wird neu angelegt. Diese Frage entscheidet mehr als jede Regel, weil ein entfernter Post
gar nicht erst zur Regelauslegung kommt.

Reddit sagt dazu selbst (Hilfeseite "What is karma", Stand 28.03.2026, zitiert nach dem
Wayback-Snapshot vom 11.09.2026,
<https://web.archive.org/web/20260911112924/https://support.reddithelp.com/hc/en-us/articles/204511829-What-is-karma>):

> If you're new to Reddit and posting to a community for the first time, you might run into some
> issues such as your post not showing up. This could be due to a number of reasons, one reason
> being, some communities require a certain amount of karma before allowing you to post there. This
> measure is taken to prevent spamming within the community.

Die konkreten Schwellen stehen in der AutoModerator-Konfiguration der jeweiligen Community, und die
ist nicht öffentlich: kein API-Endpunkt, keine Regelseite, keine Dokumentation. Was öffentlich ist,
sind die Entfernungsmeldungen, die AutoModerator unter die entfernten Posts schreibt. Genau die
habe ich über arctic-shift erhoben. Was dabei herauskam:

| Subreddit | Schwelle | Beleg |
|---|---|---|
| r/ethereum | **10 Tage Kontoalter und 20 Kommentar-Karma** | Sidebar im Wortlaut, Reddit-Metadaten, abgerufen 20.09.2026 |
| r/LocalLLaMA | **5 Karma**, über Kommentare zu verdienen | AutoModerator-Entfernung vom 19.09.2026 |
| r/CryptoTechnology | Konto "too new" bei Link-Shortenern, häufige Spam-Filter-Treffer | AutoModerator-Meldungen vom 05.09. und 31.08.2026 |
| r/homelab | Karma-Schwelle existiert, Zahl nicht genannt, greift aktiv | Regel 7 (Snapshot 17.08.2026) und AutoModerator-Entfernung vom 19.09.2026 |
| r/AI_Agents | in der Stichprobe keine gefunden | AutoModerator-Meldungen 06.-09.2026 |
| r/ethdev | in der Stichprobe keine gefunden | AutoModerator-Meldungen 06.-09.2026 |
| r/MachineLearning | keine Karma-Schwelle, dafür Titel-Kürzel und Link-Post-Sperre werktags | AutoModerator-Meldungen vom 13. und 19.09.2026 |

"In der Stichprobe keine gefunden" ist ein schwacher Beleg. Er sagt, dass unter den erfassten
AutoModerator-Meldungen des jeweiligen Subreddits keine Karma-Entfernung war, nicht dass es keine
Schwelle gibt.

**Was das Konto also zuerst tun muss**, in dieser Reihenfolge:

1. **Kommentieren, nicht posten, mindestens zehn Tage lang.** Zehn Tage deckt die einzige hart
   dokumentierte Altersschwelle ab (r/ethereum). Zwanzig Kommentar-Karma deckt zugleich die
   LocalLLaMA-Schwelle von fünf mit ab.
2. **Die Kommentare dort schreiben, wo die Antwort ohnehin fällig ist.** In r/AI_Agents liegen
   passende offene Fragen: `How do you handle service discovery for agents that need to pay for
   APIs?` vom 18.09.2026 (<https://www.reddit.com/r/AI_Agents/comments/1wk1qfk/>, 4 Upvotes) und
   `If your agent can pay for things automatically, it can also get scammed` vom 05.09.2026
   (<https://www.reddit.com/r/AI_Agents/comments/1w7wz82/>). Auf die zweite passt der
   Address-Poisoning-Befund wortwörtlich.
3. **Erst danach posten.** Und zwar im Subreddit mit dem niedrigsten Filterrisiko, nicht im
   größten.

Zu erwarten ist trotzdem, dass der erste Post irgendwo stillschweigend im Spam-Filter landet. Das
ist keine Vermutung: In meiner Tagesstichprobe aus r/LocalLLaMA vom 12.09.2026 waren sieben von
dreißig Posts binnen acht Tagen verschwunden, in r/AI_Agents zwei von dreißig.

## Der Befund, der die Empfehlung bestimmt

Ich habe jeden Post, den die vier thematisch passenden Subreddits zu x402 jemals hatten, einzeln
über `embed.reddit.com` nachgemessen: 95 Posts, davon 86 mit auslesbarer Zahl, neun gelöscht.

| Subreddit | Posts | gelöscht | Titel trägt "[Removed]" | Median | Maximum |
|---|---:|---:|---:|---:|---:|
| r/LocalLLaMA | 25 | 3 | 7 | 0 | 1 |
| r/AI_Agents | 25 | 3 | 0 | 1 | 12 |
| r/ethdev | 25 | 0 | 0 | 1 | 5 |
| r/CryptoTechnology | 20 | 3 | 4 | 1 | 5 |
| **zusammen** | **95** | **9** | **11** | **1** | **12** |

**Zwei von 86 Posts haben mehr als fünf Stimmen bekommen.** Der Median über alle vier Subreddits
ist eine einzige Stimme.

Dazu kommt die Entfernungsquote. Im Archiv ist der Beitragstext von 39 der erfassten Posts als
`[removed]` gespeichert, bei allen 39 steht der Autorenname noch da. Löscht ein Autor seinen
eigenen Post, wird der Text zu `[deleted]`; `[removed]` mit intaktem Autor ist die Signatur einer
Entfernung durch Moderation oder Filter. Auf die x402-Posts gerechnet: r/LocalLLaMA 12 von 25,
r/AI_Agents 10 von 25, r/ethdev 9 von 25, r/ethereum 4 von 13.

Der Post, der dem geplanten Logbuch am nächsten kommt, den es auf Reddit überhaupt gibt, ist
`Two months running a pay-per-call API on x402: every number including the zeros, plus two
production incidents only real settlements caught` in r/ethdev vom 24.07.2026. Zwei Monate Betrieb,
alle Zahlen offengelegt, zwei Vorfälle beschrieben, also genau die Bauart, die wir planen. **Eine
Stimme.**

Das ist kein Urteil über die Qualität. In r/ethdev ist eine Stimme der Normalfall: In einer
Stichprobe von 76 Posts zwischen dem 15.08. und 15.09.2026 liegt der Median bei 1, das Maximum bei
8, und 13 der 76 sind inzwischen entfernt. Wer dort postet, wird nicht hochgewählt, sondern
gelesen oder nicht.

Ein Muster gibt es doch: **Fragen schlagen Ankündigungen.** Vier der fünf bestbewerteten Posts der
ethdev-Stichprobe sind Fragen, die beiden obersten heißen `Best way to accept crypto payments from
card-buying customers` (8 Upvotes) und `How do we let an AI use a wallet without giving the AI
unrestricted control?` (7 Upvotes). Der Median der Fragen liegt bei 1,5, der aller anderen Posts
bei 1,0. Das ist ein schwacher Effekt auf kleiner Stichprobe, aber er zeigt in dieselbe Richtung
wie das, was beim ersten Kunden funktioniert hat: Er kam nicht über eine Ankündigung, sondern über
drei Kommentare, die jeweils zuerst das Problem des Fragenden gelöst haben.

## Conway kommt auf Reddit nicht vor

Ich habe in allen geprüften Subreddits nach "conway" und "automaton" gesucht, über den gesamten
Archivzeitraum. 39 Treffer, und **kein einziger** meint die Automaton-Runtime von Conway Research.
Die Liste besteht aus Conways Game of Life, Conways Gesetz ("your agent architecture will mirror
your org chart"), dem Mathematiker John Conway und einem NVIDIA-Mitarbeiter namens Joey Conway.

Das ist der wichtigste Nebenbefund. Die Menschen, die einen Conway-Automaton betreiben und deren
`POST /v1/auth/verify` seit Juli 2026 mit 500 antwortet, sind nicht auf Reddit. Sie sind in den
zwölf offenen Issues, aus denen der erste zahlende Kunde kam. Reddit ist für dieses Produkt kein
Ort, an dem Nachfrage wartet, sondern bestenfalls einer, an dem man das Thema erst aufmacht.

## Empfehlung

### Zuerst: r/ethdev, als Frage, nicht als Logbuch

r/ethdev ist der einzige Subreddit im ganzen Feld, der **keine Regel zu Eigenwerbung hat**: "No
specific rules are enforced apart from the normal global reddit rules." Er hat **keine belegte
Karma-Schwelle**. Er hat mit 6,1 Posts pro Tag die niedrigste Konkurrenz, ein Post steht dort einen
ganzen Tag auf der ersten Seite statt einer Stunde. Und er hat 25 x402-Posts, die Leserschaft kennt
das Thema also.

Die Form ist eine Frage, kein Logbuch und keine Ankündigung, aus zwei Gründen: Fragen belegen vier
der fünf oberen Plätze in der Stichprobe, und von den 25 x402-Posts in r/ethdev sind neun im Archiv
als `[removed]` gespeichert, durchweg die werblichen.

Der Aufhänger ist der Address-Poisoning-Befund, nicht die Kostenrechnung. Elf Transfers über
0,00 USDC von einer Adresse, die Conways payTo-Adresse in den ersten und letzten vier Zeichen
nachahmt, sind eine on-chain nachprüfbare Beobachtung auf Base, also genau das, was dieser
Subreddit tut. Die Betriebszahlen (9,18 USDC in 41 Stunden, 603 Zahlungen, 0,0065 USDC im Schnitt,
5,00 USDC beim Erststart verloren) gehören in den Text als Kontext, der erklärt, wie die
Beobachtung zustande kam, nicht als eigene Pointe. Kein Link auf `cp.hippe.eu` im Titel und nicht im
Textkörper, sondern erst in einem Kommentar, wenn jemand fragt, und dann mit offengelegter
Zugehörigkeit.

Eine realistische Erwartung an das Ergebnis: eine bis fünf Stimmen. Es gibt in der gesamten
Stichprobe von 76 ethdev-Posts keinen einzigen über acht.

### Danach: r/AI_Agents, aber zuerst nur kommentieren

r/AI_Agents hat die aktuellste x402-Diskussion (zwölf Posts seit dem 29.08.2026), die freundlichste
Werberegel ("Put your links in the comments, not the posts") und keine gefundene Karma-Schwelle.
Der Preis ist die Lautstärke: 85,2 Posts pro Tag, Median 1 Upvote, Maximum 9 an einem Stichtag.

Der Weg dorthin führt über Kommentare, nicht über einen Post, und zwar aus einem belegbaren Grund:
Regel 4 verlangt ein Verhältnis von eins zu zehn. Ein neues Konto, dessen erster Beitrag der eigene
Dienst ist, steht bei zehn zu zehn. Zwei offene Threads passen heute schon wortwörtlich:

- `If your agent can pay for things automatically, it can also get scammed` vom 05.09.2026
  (<https://www.reddit.com/r/AI_Agents/comments/1w7wz82/>). Genau der Address-Poisoning-Fall.
- `How do you handle service discovery for agents that need to pay for APIs?` vom 18.09.2026
  (<https://www.reddit.com/r/AI_Agents/comments/1wk1qfk/>, 4 Upvotes). Die 603 Zahlungen sind die
  Antwort aus der Praxis.

### Was ausscheidet, und warum

| Subreddit | Warum nicht |
|---|---|
| r/singularity | Eigenwerbung vollständig verboten, "any posts with potentially financial motives will be removed". Dazu Regel 5, die Kritik an KI untersagt. Kein Weg drumherum. |
| r/CryptoTechnology | "Absolutely no memes, links, price, marketing or promotional posts allowed." Vollständiges Verbot. Dazu ein Spam-Filter, der neue Konten belegbar greift. |
| r/MachineLearning | Regel 2 verbietet die Bewerbung bezahlter Produkte, Regel 3 droht bei Marketingkampagnen mit dauerhaftem Bann und Löschung aller Beiträge. Ein einziger x402-Post seit Bestehen. |
| r/LocalLLaMA | Der Showcase-Thread schließt "any closed source commercial service" ausdrücklich aus, und PolyForm Noncommercial ist keine Open-Source-Lizenz. Fünf Karma Mindestschwelle. Alle 25 x402-Posts stehen bei null oder eins, zehn davon sind weg. |
| r/homelab | Regel 6 verbietet gewerbliche Werbung, Regel 7 verlangt Karma, beide entfernen belegbar. Null x402-Posts. Thema passt nicht. |
| r/selfhosted | Regel 6: Projekte unter drei Monaten ausschließlich im New-Project-Megathread. `cp.hippe.eu` ist seit dem 19.09.2026 öffentlich, das gilt also bis zum 19.12.2026. Ein x402-Post seit Bestehen. |
| r/LLMDevs | Regel 5 erlaubt Werbung nur für FOSS-lizenzierte Projekte oder mit **vorheriger Moderatoren-Freigabe**. PolyForm Noncommercial ist source-available, nicht FOSS. Ohne Modmail vorher: Entfernung ohne Warnung. |
| r/ethereum | 10 Tage Kontoalter und 20 Kommentar-Karma, und die Sidebar verweist Entwicklerthemen selbst nach r/ethdev. |
| r/mcp | Regeln wären ideal ("Self-promotion is allowed with proper disclosure"), aber `cp.hippe.eu` implementiert die Conway-API, nicht MCP. Falsches Thema. |
| r/SideProject | Keine Regeln, keine Leser, die etwas kaufen. Dort posten nur Leute, die selbst verkaufen wollen. |

r/LLMDevs ist der einzige Ausgeschiedene mit einem dokumentierten Weg zurück: eine Modmail vor dem
Posten, in der die Lizenzlage offengelegt wird. Das kostet nichts außer einer Nachricht und wäre
der einzige zusätzliche Versuch, der sich lohnt, falls r/ethdev und r/AI_Agents nichts bringen.

## Was daran scheitern kann

**Der Post wird stillschweigend gefiltert.** Ein neues Konto ohne Historie ist genau das Muster,
gegen das Reddits seitenweiter Spam-Filter gebaut ist, und er meldet sich nicht. In meiner
ethdev-Stichprobe tragen zwei von 76 Posts `[ Removed by Reddit ]`, also eine Entfernung durch
Reddit selbst, nicht durch die Moderation. Gegenmittel: zehn Tage kommentieren, bevor der erste
Post kommt, und danach im ausgeloggten Browser prüfen, ob der Post für Fremde sichtbar ist.

**Die Erwartung ist zu hoch.** 95 gemessene x402-Posts, Median eine Stimme, zwei über fünf. Wenn
aus Reddit fünf zahlende Betreiber bis zum 19.10.2026 werden sollen, ist das gegen die Datenlage
gerechnet. Der Kanal, der den ersten Kunden gebracht hat, hat drei Kommentare gebraucht und drei
Stunden, und dreizehn weitere Antworten liegen fertig in `.scratch/gtm/issue-antworten/`. Reddit
ist das zweitbeste Werkzeug, solange die Issues nicht abgearbeitet sind.

**Der Address-Poisoning-Befund wird als Angriff auf Conway gelesen.** In r/ethdev gibt es dagegen
keine Regel, in r/singularity wäre es Regel 5. Die Beobachtung gehört so formuliert, wie sie ist:
elf Transfers über null USDC von einer Adresse, die eine andere nachahmt, ist ein Muster gegen den
Betreiber des Automatons, nicht gegen Conway.

**Ein Moderator liest den Post als Anzeige.** In r/ethdev gibt es keine Regel, auf die man sich
dann berufen könnte, weil es überhaupt keine Regeln gibt. Neun der 25 x402-Posts dort sind
entfernt. Gegenmittel ist die Form: eine Frage mit nachprüfbaren Zahlen, der Link erst im
Kommentar.

**Die Messung selbst kann altern.** Alle Upvote-Zahlen in diesem Dokument sind vom 20.09.2026, die
Regelzitate stammen aus Snapshots zwischen dem 16.07. und 28.08.2026. Die Regelseiten sind heute
nicht abrufbar, eine Änderung seitdem ist nicht ausgeschlossen. Vor dem ersten Post gehört jede
zitierte Regel im eingeloggten Browser einmal gegengelesen.
