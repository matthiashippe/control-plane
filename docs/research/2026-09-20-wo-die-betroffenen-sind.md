# Wo die Betroffenen sind

Stand 20.09.2026, 11:30 UTC. Anlass: Am 19.09. brachten drei Kommentare unter Conway-Issues nach
zwei Stunden und fünfzig Minuten den ersten fremden zahlenden Betreiber
(`2026-09-19-woher-kam-der-kunde.md`). Die Frage dieser Recherche war, ob es weitere Orte gibt, an
denen dieselben Leute gerade nach einer Lösung suchen. Reddit lief getrennt und ist hier
ausgenommen.

Die Antwort ist schmal und eindeutig: **Es gibt keinen zweiten Ort.** Außerhalb von GitHub hat in
den letzten 90 Tagen kein einziger Mensch nachweisbar über dieses Problem geschrieben, und
innerhalb von GitHub praktisch nur im Tracker von `Conway-Research/automaton` selbst. Das
Fork-Netz mit 1.442 Forks ist als Kanal tot, weil 1.435 Forks den Issue-Tracker ausgeschaltet
haben und kein einziger Fork Discussions anbietet.

## Die Zahl, die zählt

Fenster: 22.06.2026 bis 20.09.2026, also 90 Tage. Gezählt wurden GitHub-Accounts, nicht Menschen,
denn hinter einem Account kann ein Automat stehen; Bots mit Bot-Kennung und unsere eigenen
Beiträge sind ausgeschlossen. Jeder Account unten ist mit Datum und Thread belegt.

| Ring | Accounts | Was sie geschrieben haben |
|---|---:|---|
| Kern | **27** | Die kaputte Anmeldung selbst: 500 auf `/v1/auth/verify`, 401 auf die Nonce, kein API-Key, Installation scheitert daran, bezahlte Credits ohne Gegenleistung |
| Rand | 9 | Andere Ausfälle derselben Plattform: toter Social-Relay, unerreichbare Sandbox, Frage nach lokalen Modellen |
| Handelnde | 10 | Keine Frage gestellt, sondern Code committet, der Conway Cloud umgeht oder die Folgefehler repariert |
| **Summe** | **46** | eindeutige Accounts, davon **0 außerhalb von GitHub** |

Die 27 des Kerns: `2262244275`, `Fitcha06`, `GigisAssistant`, `Gowtham-Rajendran`, `JoTalbot`,
`Kosea1234`, `MrDecryptDecipher`, `Rickh07`, `SAM-0x5`, `Todor-5rov`, `YourFutureSiteDev`,
`asimov4242`, `atila-altindag`, `babu234-del`, `caioholland1-cpu`, `copacarmine`, `cv-scvd`,
`dzenansabotic12`, `fernandolobo25-eng`, `lukacsbenedek4-arch`, `mesikewisdom19-source`, `phfer`,
`syedhassan-aifinpay`, `vena-digital`, `victorargo`, `vigramstr1998-Alpha`, `xuanwuao172-afk`.

Zwei davon sind Rauschen und sollten bei jeder weiteren Verwendung abgezogen werden:
`babu234-del` schrieb "Need new file", `mesikewisdom19-source` hat als Bio "Payment always go to
phantom wallet only one" und eröffnete das leere Issue #380. Bleiben **25 belastbare Accounts im
Kern**.

Die 9 des Randes: `Filipposcmd`, `Mozcko`, `Pasblinn`, `YeLengXi`, `abuzar-rasool`,
`dabossindashell`, `ferchosud-bit`, `sonnyproto`, `sy64t6c527-cyber` (Threads #219, #296, #335
und #385; der Autor des leeren #380 zählt bereits im Kern).

Die 10 Handelnden, jeweils mit dem Datum ihres Belegs: `joukinneto` (20.09., OmniRoute-Gateway im
Fork), `MechanicalMindVonMisses` (19./20.09., Mock-Conway-Client), `Pritamkumarsahoo69`
(16. bis 19.09., eigene On-chain-Zahlungsprüfung), `vkdlsjf623` (18.09., Diagnose der
Credits-Falle), `robleds` (12.09., Isolated Mode), `darkknite144-afk` (11.09., Lauf ohne echte
Mittel), `hopetmpy` (31.08. bis 19.09., Abspaltung ABOS), `WhiteBookCapital` (05.09., "validated
against a live BYOK instance", Kommentar in PR #383), `ChristianErdtmann` (28.08.,
Credits-Anzeige repariert), `tiz823` (12.08., "continuing this work in my own fork", Kommentar in
PR #365).

Zeitliche Verteilung im Kern: Juli 8 Beiträge, August 17, September 8. Personen in den letzten
30 Tagen: 16. In den letzten 14 Tagen: 8 (`Rickh07`, `SAM-0x5`, `Todor-5rov`, `atila-altindag`,
`copacarmine`, `cv-scvd`, `dzenansabotic12`, `victorargo`).

Neun der 27 Accounts wurden am Tag ihres Beitrags oder in den Wochen davor angelegt
(`fernandolobo25-eng` 30.07., `YourFutureSiteDev` 13.08., `xuanwuao172-afk` und `Kosea1234`
20.08., `caioholland1-cpu` 27.08., `lukacsbenedek4-arch` 29.08., `dzenansabotic12` 10.09.,
`victorargo` 13.09., `SAM-0x5` 17.09.). Diese Leute haben sich für diese eine Fehlermeldung ein
GitHub-Konto gemacht. Das ist der stärkste Beleg dafür, dass der Leidensdruck echt ist und dass
sie keinen anderen Ort kennen.

### Die Gegenzahl: wie viele nichts sagen

In denselben 90 Tagen wurde das Repo **458 mal geforkt**, 83 davon in den letzten 14 Tagen und 38
in den letzten 7 Tagen. Das npm-Paket `conway-terminal` wurde im selben Fenster **1.619 mal
heruntergeladen**, 290 davon in den letzten 14 Tagen. Auf 458 Ankömmlinge kommen 25 belastbare
Wortmeldungen: **rund 95 Prozent der Betroffenen schweigen.** Für sie existiert kein Kanal, und
die npm-Seite führt sie in eine Sackgasse, weil das Feld `bugs.url` auf
`github.com/Conway-Research/conway-terminal/issues` zeigt und dieses Repository nicht existiert
(HTTP 404, geprüft am 20.09.2026).

## Rangliste nach Aktualität des letzten fremden Beitrags

"Fremd" heißt: ohne unsere eigenen Kommentare vom 19. und 20.09. Nur wer noch zuhört, kann
antworten, deshalb steht der jüngste Beitrag oben.

| Letzter fremder Beitrag | Ort | Wer spricht | Was er braucht | Offen | Antwort |
|---|---|---|---|---|---|
| 20.09. | [joukinneto/-jkdd-continuous-automaton](https://github.com/joukinneto/-jkdd-continuous-automaton/commit/69a900c8bdbb0072f7a01cdc2b1c6ffd8590b55c), Branch `feature/jkdd-multiagent-router` | Joaquim Neto, baut gerade einen "OmniRoute OpenAI-compatible gateway client" plus Setup-Wizard in seinen Fork | Genau unsere Schnittstelle: eine OpenAI-kompatible Inferenz-URL für die Runtime | ja, laufende Arbeit | Kein Kanal. Issues sind aus, nur Commit-Kommentare wären möglich, und die sind ungefragt. **Werbung** |
| 20.09. | [MechanicalMindVonMisses/trading-agent-automaton](https://github.com/MechanicalMindVonMisses/trading-agent-automaton) | Ali Berke Korkmaz, Kopie (kein GitHub-Fork) vom 19.09., beschreibt sich als "no cloud", mit "mock Conway client" in `src/sim/` | Er hat Conway bereits amputiert und simuliert die Credits | ja, Issue-Tracker ist an, 0 Issues | Er hat sich entschieden. Eine Nachricht wäre **Werbung** |
| 19.09. | Aktive Forks ohne Tracker: [vkdlsjf623](https://github.com/vkdlsjf623/automaton/commit/107caa5a7e6a83a69ba5f3ba140003611bdd3e3a), [robleds](https://github.com/robleds/automaton/commit/01b91ffdce20a1fb2a31452d14b6207a87434700), `Pritamkumarsahoo69`, `Isaacko0`, `MrNobody09` | Betreiber, die eigene Commits schreiben | Sie lösen es selbst | Issues sind überall aus | Kein Kanal, **Werbung** |
| 17.09. | [NSPG13/agent-bounties#1388](https://github.com/NSPG13/agent-bounties/issues/1388#issuecomment-5705292393) | `arivale-exe` (16.09.), Betreiber eines Agenten, dessen Domain-Allowlist nur `conway.tech` zulässt; `NSPG13` und `laurentketterle-hub` antworten | Eine Allowlist-Änderung in seiner Runtime | ja, lebhafter Thread | Grenzfall. Der Hinweis auf die Allowlist ist sachlich; alles weitere ist **Werbung** |
| 17.09. | [automaton#392 "tips for 401"](https://github.com/Conway-Research/automaton/issues/392) | `SAM-0x5`, Konto am selben Tag angelegt, null Kommentare | Eine Erklärung, warum er 401 bekommt, und was jetzt geht | ja, **unbeantwortet** | **Hilft.** Die 401 auf die Nonce ist erklärbar, ohne etwas zu verkaufen |
| 17.09. | [automaton#393](https://github.com/Conway-Research/automaton/issues/393) | `cv-scvd`, präzise Fehleranalyse zu doppelten USDC-Topups durch Retry ohne Idempotenzschlüssel | Bestätigung und eine serverseitige Sicht auf das Problem | ja | **Hilft**, wir haben genau diese Seite implementiert; Beleg statt Werbung |
| 17.09. | [automaton#355](https://github.com/Conway-Research/automaton/issues/355) | `Rickh07` (Kommentar), Autor `2262244275`, Windows, HOME-Fehler plus Nonce-401 | Trennung der zwei Fehler: HOME ist heute lösbar, die Anmeldung nicht | ja | **Hilft.** Der HOME-Teil ist ein echter, reparierbarer Bug |
| 14.09. | [automaton#390](https://github.com/Conway-Research/automaton/issues/390) | `dzenansabotic12` (Autor), `Todor-5rov` und `victorargo` (Kommentare, FR: "on peut rien faire sans la clé api conway") | Sie halten es für einen Installationsfehler und suchen die Ursache | ja | **Hilft.** Todor-5rov liegt richtig und braucht Bestätigung |
| 13.09. | [automaton#379](https://github.com/Conway-Research/automaton/issues/379) | `atila-altindag`, reproduziert auf `conway-terminal 2.0.9`, Ubuntu/WSL2, meldet `api.conway.tech/health` als gesund | Einordnung, warum Health grün ist und die Anmeldung trotzdem scheitert | ja | **Hilft** |
| 12.09. | [automaton#376](https://github.com/Conway-Research/automaton/issues/376) | `copacarmine` fragt `@Kosea1234` direkt: "Have you found a solution yet? I'm getting the same error." | Eine Antwort auf eine wörtlich gestellte Frage | ja, **unbeantwortet** | **Hilft.** Die klarste offene Frage im ganzen Tracker |
| 12.09. | [Scottcjn/beacon-skill#931](https://github.com/Scottcjn/beacon-skill/issues/931) | Maintainer `Scottcjn` (Elyan Labs, 230 Sterne) im Namen von `@antoleod`, über den Conway-Transport in v2.16.1 | Klarheit, ob der Conway-Transport noch tragfähig ist; `beacon_skill/transports/conway.py` zeigt auf `api.conway.tech` und `social.conway.tech` | ja | **Hilft**, wenn es beim Befund bleibt: der Social-Relay antwortet nicht mehr, neue Nutzer bekommen keinen Key. Ein Link auf uns wäre **Werbung** |
| 11.09. | [darkknite144-afk/automaton-demo](https://github.com/darkknite144-afk/automaton-demo) | Betreiber, der den Automaton in GitHub Actions "fully free, local LLM, no real funds" fährt | Nichts, er hat Conway umgangen | Issues sind aus | Kein Kanal, **Werbung** |
| 10.09. | [automaton#385](https://github.com/Conway-Research/automaton/issues/385) | `Filipposcmd` fragt nach lokalen Modellen, `Mozcko` antwortet aus eigener Erfahrung | Eine belastbare Anleitung für lokale Inferenz | ja | Grenzfall. Sachlich hilft die Antwort "lokal geht, kostet aber Qualität"; jeder Hinweis auf einen bezahlten Dienst kippt in **Werbung** |
| 08.09. | [Conway-Research/skills, 15 offene PRs](https://github.com/Conway-Research/skills/pulls) | Zuletzt `Elipacosta88` (08.09.) und `Aakash2408` (05.09.), davor 13 weitere seit Februar | Ein Maintainer, der ihre Skills mergt. Letzter Push im Repo: 27.02.2026 | ja, alle unbeantwortet | Anderes Problem als unseres. Eine Antwort dort ist **Werbung** |
| 29.08. | [automaton#377](https://github.com/Conway-Research/automaton/issues/377) | `caioholland1-cpu`, `vena-digital`, `YourFutureSiteDev` | Bestätigung und Diagnose | ja | Bereits am 19.09. von uns beantwortet |
| 29.08. | [automaton#339](https://github.com/Conway-Research/automaton/issues/339) | `syedhassan-aifinpay` (Co-Founder AiFinPay), `fernandolobo25-eng`, `phfer`, `lukacsbenedek4-arch` | Der Ursprungs-Thread, 4 Kommentare | ja | Bereits beantwortet |
| 29.08. | [automaton#373](https://github.com/Conway-Research/automaton/issues/373) | `asimov4242`, Windows-HOME-Bug | Ein Patch, den es inzwischen gibt (siehe `vkdlsjf623` unten) | ja | **Hilft**, rein technisch und ohne Produktbezug |
| 26.08. | [automaton#359](https://github.com/Conway-Research/automaton/issues/359) | `Fitcha06`, `Kosea1234` | Nonce-401 auf aktuellem main | ja | **Hilft** |
| 22.08. | [automaton#372](https://github.com/Conway-Research/automaton/issues/372) | `asimov4242`, null Kommentare | Irgendeine Reaktion | ja, **unbeantwortet** | **Hilft** |
| 22.08. | [automaton#371](https://github.com/Conway-Research/automaton/issues/371) | `xuanwuao172-afk` fragt direkt: "Is Conway currently accepting new user registrations?" | Ein Ja oder Nein | Thread geschlossen (vom Autor selbst) | Geschlossene Threads sind schwache Kanäle. Grenzfall |

## Das Fork-Netz: 1.442 Forks, 16 Baustellen, kein Briefkasten

`Conway-Research/automaton` hat laut API 1.442 Forks (`forks_count` und `network_count`); die
Fork-Liste liefert 1.438 Objekte, die Differenz sind gelöschte oder privat gestellte Forks. Die
Entstehung verteilt sich auf Februar 524, März 195, April 189, Mai 50, Juni 29, Juli 167, August
181, September 103. Der Wiederanstieg ab Juli fällt mit dem Beginn der Störung zusammen: Die Leute
kommen weiter, sie kommen sogar wieder mehr, und sie kommen in eine kaputte Anmeldung.

Gearbeitet wird in wenigen davon. 43 Forks haben einen Push nach dem letzten Upstream-Commit
(26.08.2026), aber die meisten davon haben nur einen Branch kopiert. Eigene Commits auf einem
eigenen Branch haben 16 Forks:

| Fork | Letzter eigener Commit | Was dort passiert |
|---|---|---|
| [joukinneto/-jkdd-continuous-automaton](https://github.com/joukinneto/-jkdd-continuous-automaton) | 20.09.2026 | OmniRoute-Gateway-Client, Setup-Wizard, Health-Check in `jkdd doctor` |
| [MrNobody09/automaton](https://github.com/MrNobody09/automaton) | 19.09.2026 | "opportunity acquisition pipeline", teils von GitHub Actions geschrieben |
| [Pritamkumarsahoo69/automaton-v2](https://github.com/Pritamkumarsahoo69/automaton-v2) | 19.09.2026 | Eigene Prüfung eingehender Base-USDC-Zahlungen über On-chain-Belege, eigener Job-Lebenszyklus |
| [CrystalArchitect/automaton](https://github.com/CrystalArchitect/automaton) | 19.09.2026 | Linting-CI, Pre-Commit-Hooks, von Claude generiert |
| [vikrammalikaditya-cmd/automaton](https://github.com/vikrammalikaditya-cmd/automaton) | 19.09.2026 | Umbau zu einem Recherche-Agenten "Atlas", `install.bat` |
| [vkdlsjf623/automaton](https://github.com/vkdlsjf623/automaton) | 18.09.2026 | Die inhaltlich stärkste Arbeit im ganzen Netz, siehe unten |
| [Hongfei-creator/automaton](https://github.com/Hongfei-creator/automaton) | 13.09.2026 | Datei-Uploads ohne erkennbares Ziel |
| [Isaacko0/Automaton-HSCSG](https://github.com/Isaacko0/Automaton-HSCSG) | 12.09.2026 | Spanischsprachiger Umbau mit eigenem Skill-System |
| [robleds/automaton](https://github.com/robleds/automaton) | 12.09.2026 | "Isolated mode": Docker ohne Netzausgang, lokales Ollama, Stub-Credits |
| [Mozcko/automaton](https://github.com/Mozcko/automaton) | 12.09.2026 | Trading-Umbau, Railway-Deploys ohne Sandbox-ID |
| [naveenbhakar145-dev/automaton](https://github.com/naveenbhakar145-dev/automaton) | 10.09.2026 | `pay-rent.mjs` mit einem Kommentar auf Hindi, kein funktionaler Code |
| [mr-mohamad-mr/automaton](https://github.com/mr-mohamad-mr/automaton) | 10.09.2026 | Merge eines GitAuto-Setup-PRs |
| [lamuh24/automaton](https://github.com/lamuh24/automaton) | 04.09.2026 | Recherche-Kommandos mit Belegpflicht, Zehn-Minuten-Takt |
| [zarfatinimrod-creator/automaton](https://github.com/zarfatinimrod-creator/automaton) | 02.09.2026 | "Revenue colony", eigene Einnahme-Engine |
| [ChristianErdtmann/automatonFork](https://github.com/ChristianErdtmann/automatonFork) | 28.08.2026 | Vier echte Laufzeit-Bugfixes, darunter "Fix planner always seeing 0 credits regardless of real balance" |
| [jeremylongshore/intent-scout](https://github.com/jeremylongshore/intent-scout) | 04.06.2026 | Bounty-Suche, vom Automaton abgeleitet |

Zwei dieser Commits sind für uns die wertvollsten Fundstellen im ganzen Netz, weil sie den
Folgeschaden der kaputten Anmeldung technisch dokumentieren:

`vkdlsjf623` schreibt am 18.09. in
[107caa5a](https://github.com/vkdlsjf623/automaton/commit/107caa5a7e6a83a69ba5f3ba140003611bdd3e3a):
"when Conway's credit-balance API is unreachable, creditsCents is set to the sentinel -1. That same
-1 is SURVIVAL_THRESHOLDS.dead's own definition of 'genuinely negative balance = dead'." Die
Runtime hält sich also für tot, sobald Conway nicht antwortet, und verweigert danach jedes
kostenpflichtige Modell, selbst bei korrekt gesetztem eigenen Anthropic-Key. Derselbe Betreiber hat
im selben Zug den HOME-Fehler aus #355 und #373 zentral behoben (`src/paths.ts`, `getHomeDir()`).

`robleds` fügt am 12.09. in
[01b91ffd](https://github.com/robleds/automaton/commit/01b91ffdce20a1fb2a31452d14b6207a87434700)
einen "isolated mode" hinzu, damit der Automaton "without Conway Cloud" läuft, mit lokalem Ollama
und Stub-Credits.

### Warum aus dem Fork-Netz kein Kanal wird

- **1.435 der 1.438 Forks haben den Issue-Tracker deaktiviert.** Nur `raubreak/automaton`,
  `quangtran88/automaton` und `shrwnsan/automaton` haben ihn an, und deren Vorgänge stammen aus
  Februar oder sind leer.
- **Kein einziger Fork hat Discussions aktiviert** (0 von 1.438). Das Hauptrepo hat Discussions
  ebenfalls aus (`has_discussions=false`).
- 22 Forks zeigen offene Vorgänge, aber das sind fast ausschließlich Dependabot-, Copilot- und
  Renovate-PRs. Der einzige inhaltliche Restbestand sind sechs Sicherheits-Issues von
  `quangtran88` aus dem Februar. **Zur kaputten Anmeldung existiert im gesamten Fork-Netz kein
  einziger Thread.**

## Andere Repositories, die Conway erwähnen

Die Codesuche meldet 201 Treffer für `"api.conway.tech"` und 81 für `CONWAY_API_KEY`; die
ausgewerteten ersten hundert Treffer je Suche verteilen sich auf 26 beziehungsweise 30
Repositories. Das sind Kopien, Ableitungen und Integrationen, nicht Fragesteller.
Relevant und in den letzten 90 Tagen aktiv:

| Repo | Letzter Push | Bezug zu Conway | Kanaltauglichkeit |
|---|---|---|---|
| [Scottcjn/beacon-skill](https://github.com/Scottcjn/beacon-skill) | 19.09.2026, 230 Sterne | `beacon_skill/transports/conway.py` spricht `api.conway.tech`, `social.conway.tech` und das ERC-8004-Register auf Base an | Aktiver Maintainer, offener Thread #931. Bester fremder Ort |
| [jiayaoqijia/cryptoskill](https://github.com/jiayaoqijia/cryptoskill) | 20.09.2026, 76 Sterne | `skills/payments/x402/examples/conway-credits.mjs` (Top-up über x402), seit 20.03. unverändert | Aktiv, aber kein Leidensdruck sichtbar |
| [Daisuke134/life-manager](https://github.com/Daisuke134/life-manager) | 20.09.2026 | Issue #745 vom 03.07.: "all earn slots blocked by MCP permission wall", nennt `mcp__conway__wallet_info` und `x402_check` | Automatengetriebener Tracker mit 2.534 offenen Issues, als Kanal wertlos |
| [musexmachine/clincher](https://github.com/musexmachine/clincher) | 14.09.2026 | Ansible-Rolle mit `CONWAY_API_KEY` im Vault-Beispiel und Deployment-Guide | Nur Dependabot-Verkehr |
| [ronavkarumsi04/VanillaAgent](https://github.com/ronavkarumsi04/VanillaAgent) | 14.09.2026 | Vollständige Kopie der Runtime samt `provision.ts` und `fund.ts` | Keine offenen Vorgänge |
| [IsSlashy/Protocol-01](https://github.com/IsSlashy/Protocol-01) | 12.09.2026 | `agents/conway/` mit eigenem Patch für eine Solana-Ökonomieschicht | Keine offenen Vorgänge |
| [hopetmpy/ABOS](https://github.com/hopetmpy/ABOS) | 19.09.2026 | Kein Fork, sondern eine Abspaltung: PRs "Decouple ABOS from Automaton upstream" (31.08.) und "freeze Automaton functional parity for Conway wire protocol" (01.09.) | Sehr aktiv, aber die Entscheidung ist gefallen |
| [reclear-io/llmref](https://github.com/reclear-io/llmref) | 16.07.2026 | Registry mit eingefrorenem Automaton-Dokumentationsstand `2026.07.02` | Archiv, kein Kanal |

Die Issue-Suche außerhalb des Hauptrepos liefert nur einen einzigen Treffer mit `conway.tech` in
den Kommentaren aus dem Fenster: [NSPG13/agent-bounties#1388](https://github.com/NSPG13/agent-bounties/issues/1388),
oben in der Rangliste. Ältere Erwähnungen existieren, aber keine davon ist eine offene Frage:
[0xHoneyJar/loa-finn#80](https://github.com/0xHoneyJar/loa-finn/issues/80) (F&E-Vergleich, letzter
Beitrag 30.06.), [aibtcdev/x402-api#108](https://github.com/aibtcdev/x402-api/issues/108) (RFC vom
30.04.), [better-auth-rs#18](https://github.com/better-auth-rs/better-auth-rs/issues/18)
(Feature-Wunsch vom 27.03.), [x402-foundation/x402#2153](https://github.com/x402-foundation/x402/issues/2153)
(Ökosystem-Eintrag, geschlossen am 14.05.), [publu/cryptoskills#8](https://github.com/publu/cryptoskills/issues/8)
(25.02.).

## Verzeichnisse und Awesome-Listen

| Eintrag | Stand | Was dort steht | Bewertung |
|---|---|---|---|
| [mas-bandwidth/awesome-persistent-ai](https://github.com/mas-bandwidth/awesome-persistent-ai) | Push 15.09.2026 | Zeile 53 listet Automaton mit eigener Beschreibung; die Liste verlangt zu jedem Eintrag eine Belegform ("implemented and exercised") | Gepflegt, PRs werden gemergt. Als Verzeichnis brauchbar, als Gesprächsort nicht |
| [sing1ee/a2a-directory](https://github.com/sing1ee/a2a-directory) | Push 19.09.2026, 240 Sterne | Listet `risk-api` von `@JleviEderer` mit Live-Link `https://risk-api.life.conway.tech`. Dieser Host antwortet nicht mehr (Timeout nach 12 s, geprüft 20.09.) | Ein Betreiber mit totem Conway-Sandbox-Link, erreichbar über den Tracker |
| [mbeato/awesome-mpp](https://github.com/mbeato/awesome-mpp) | Push 02.05.2026, Vorgänge bis 17.09. | Listet APIMesh mit 100 x402-APIs; derselbe Autor hat den APIMesh-Skill bei Conway eingereicht | Aktive Einreichungen, thematisch x402 statt Conway |
| [stefanofa/awesome](https://github.com/stefanofa/awesome) | Push 25.06.2026 | Ein Einzeiler mit dem Repo-Slogan | Sammelliste ohne Publikum |
| [killvxk/gitweekly](https://github.com/killvxk/gitweekly) | Push 12.09.2026 | Chinesischer Wochenrückblick, `tools.md` Zeile 660 | Kein Kanal |
| [1850298154/memory_agent_hub](https://github.com/1850298154/memory_agent_hub) | Push 22.08.2026, 67 Sterne | Abschnitt 1.74 beschreibt Automaton auf Chinesisch | Kein Kanal |
| `saltbo/awesome-stars`, `fire17/awesome-stars`, `Zaid-maker/my-awesome-stars-list`, `Shitsuten/Bibliotheca`, `sirbrasscat/git-awesome` | verschieden | Automatisch erzeugte Sternlisten | Wertlos |
| [LobeHub Skills Marketplace](https://lobehub.com/skills/anthropicaeon-heysigil-conway-research) | unbekannt | Eintrag "conway-research-agents", über die Websuche gefunden | Inhalt nicht prüfbar, die Seite antwortet dem Abruf mit 403 |
| [xpaysh/awesome-x402](https://github.com/xpaysh/awesome-x402) | Push 28.07.2026 | Unser PR 1564 liegt seit 19.09. offen | Bereits in `2026-09-20-x402-gateway.md` als toter Kanal belegt: 548 offene PRs am 20.09.2026, seit 26.07. nichts gemerged |

## Was nachweislich leer ist

Diese Suchen liefen und fanden nichts. Der Negativbefund ist Teil des Ergebnisses, weil er die
Kanalwahl entscheidet.

- **Stack Overflow**: Die Suche über die StackExchange-API nach `conway.tech`, `conway-terminal`,
  `automaton SIWE` und `x402 credits api key 500` liefert null Treffer zur Runtime. Die einzigen
  Treffer für `conway-terminal` betreffen Conways Game of Life in Terminal-Ausgaben, der jüngste
  von 2024. Für `x402 payment agent` gibt es überhaupt keine Frage.
- **Hacker News**: Die Algolia-API findet zu `conway.tech` genau einen Treffer, und der ist ein
  Nutzername aus dem Jahr 2017. Zu `conway-terminal`, `api.conway.tech` und `automaton runtime
  x402` gibt es null Treffer. Die 260 Treffer für "conway automaton" sind sämtlich Game of Life.
- **GitHub Discussions**: Die GraphQL-Suche über alle Discussions nach `conway.tech` ergibt 0, nach
  `conway automaton` 5 Treffer, alle über Game of Life. Das Hauptrepo und alle 1.438 Forks haben
  Discussions deaktiviert.
- **Discourse-Foren und sonstige Foren**: Drei Websuchen mit unterschiedlichen Formulierungen
  liefern ausschließlich GitHub-Issues, unser eigenes Repo und die Conway-Dokumentation zurück.
  `docs.conway.tech` nennt keinen Discord, kein Forum, keine Statusseite und keine
  Support-Adresse. Der Discord-Link, den `app.conway.tech` nach dem Aufladen zeigt, ist seit
  Issue #282 (21.03.2026) ungültig.
- **Blogs mit Kommentarfunktion**: Drei Artikel über die Runtime sind auffindbar,
  [starlog.is](https://starlog.is/articles/automation/conway-research-automaton) vom 08.09.2026,
  [aibit.im](https://aibit.im/en/article/automaton-ai-agent-that-self-replicates-and-self-finances)
  vom 20.02.2026 und [bv7x.ai/blog12](https://bv7x.ai/blog12) vom 18.02.2026. Keiner erwähnt die
  Störung, keiner hat eine Kommentarfunktion. Der Artikel auf
  [dev.to](https://dev.to/levelsofself/web-40-is-here-the-infrastructure-is-real-the-governance-is-not-39le)
  vom 17.03.2026 hat eine Kommentarfunktion und null Kommentare.
- **Maintainer**: Von 61 Kommentaren im Hauptrepo im Fenster stammt keiner von einem Mitglied der
  Organisation (`author_association` MEMBER, OWNER oder COLLABORATOR: 0). Das deckt sich mit dem
  bekannten Stand, dass seit 07.03.2026 kein Maintainer geantwortet hat.

## Zustand der Conway-Infrastruktur am 20.09.2026

Gemessen um 11:05 UTC, weil mehrere Betroffene aus dem grünen Health-Endpunkt falsche Schlüsse
ziehen:

| Endpunkt | Antwort |
|---|---|
| `GET https://api.conway.tech/health` | 200, `{"status":"healthy"}` |
| `POST https://api.conway.tech/v1/auth/nonce` | 200, liefert eine Nonce |
| `GET https://api.conway.tech/.well-known/x402` | 404 |
| `https://app.conway.tech` | 200 |
| `https://social.conway.tech` | keine Antwort |
| `https://risk-api.life.conway.tech` (Sandbox eines Drittanbieters) | Timeout nach 12 s |

Die Anmeldung scheitert also nicht an einem toten Server, sondern erst im zweiten Schritt. Genau
diese Verwechslung steht in #379 und #390 und ist der sachliche Kern jeder hilfreichen Antwort.

## Bewertung

**Wo eine Antwort sachlich hilft:** #392, #376, #372, #390, #379, #355, #373, #359 und #393. In
allen diesen Threads steht eine unbeantwortete Frage oder ein Fehlschluss, der sich mit einer
Messung ausräumen lässt, und in dreien davon (#392, #376, #372) hat bis heute niemand
geantwortet. Der einzige aussichtsreiche fremde Ort ist `Scottcjn/beacon-skill#931`, weil dort ein
erreichbarer Maintainer einen Transport pflegt, dessen Gegenstelle zur Hälfte tot ist.

**Wo eine Antwort nur Werbung wäre:** Die aktiven Forks ohne Issue-Tracker (`joukinneto`,
`robleds`, `vkdlsjf623`, `MechanicalMindVonMisses`, `darkknite144-afk`), die offenen PRs in
`Conway-Research/skills`, die Bounty-Repositories und alle Awesome-Listen außer als regulärer
Verzeichniseintrag. In diesen Fällen hat die Gegenseite entweder keinen Briefkasten oder ein
anderes Problem.

**Die unangenehme Schlussfolgerung:** Der Kanal, der am 19.09. funktioniert hat, ist nicht einer
von vielen, sondern der einzige. 25 belastbare Wortmeldungen in 90 Tagen, davon 8 in den letzten
14 Tagen, alle an einem Ort. Wer diese Zielgruppe über die Issue-Threads hinaus erreichen will,
muss die 95 Prozent adressieren, die schweigen, und die sind heute nur über zwei Wege
auffindbar: die Fork-Liste (458 neue Forks im Fenster, ohne Kontaktmöglichkeit) und die
npm-Downloads (1.619 im Fenster, ohne Kontaktmöglichkeit).

## Methode und Belege

Fenster überall 22.06.2026 bis 20.09.2026. Alle Abfragen am 20.09.2026 zwischen 09:50 und 11:30
UTC mit `gh` (Token `matthiashippe`, Scope `repo`) und `curl`.

Jede einzelne gezählte Wortmeldung liegt mit Datum und Link in
`data/2026-09-20-betroffene-accounts-90-tage.csv` (57 Zeilen, 46 eindeutige Accounts), die Zahl
ist daraus mit zwei `awk`-Zeilen nachzählbar (`data/README.md`).

```bash
# Repo- und Fork-Bestand
gh api repos/Conway-Research/automaton --jq '{forks_count,network_count,has_discussions,open_issues_count,pushed_at}'
gh api --paginate "repos/Conway-Research/automaton/forks?per_page=100&sort=newest" > forks.json
#  -> 1438 Objekte; 458 im Fenster angelegt; 43 mit Push nach 2026-08-26T16:28:14Z;
#     1435 mit has_issues=false; 0 mit has_discussions=true

# Issues und Kommentare im Hauptrepo
gh api --paginate "repos/Conway-Research/automaton/issues?state=all&per_page=100&since=2026-06-01&sort=updated&direction=desc"
gh api --paginate "repos/Conway-Research/automaton/issues/comments?per_page=100&since=2026-06-22T00:00:00Z"
#  -> 61 Kommentare im Fenster, davon 0 mit author_association in MEMBER/OWNER/COLLABORATOR

# Suche außerhalb des Hauptrepos
gh api -X GET search/issues --field q='"conway.tech" -repo:Conway-Research/automaton'          # 9
gh api -X GET search/issues --field q='"conway.tech" in:comments updated:>2026-06-22 -repo:Conway-Research/automaton'  # 1
gh api -X GET search/code   --field q='"api.conway.tech"'                                      # 201 Treffer
gh api -X GET search/code   --field q='CONWAY_API_KEY'                                         # 81 Treffer
gh api -X GET search/code   --field q='"conway-terminal" filename:package.json'                # 0
gh api -X GET search/repositories --field q='automaton conway pushed:>2026-08-20 fork:false'   # 30

# GitHub Discussions
gh api graphql -f query='query { search(query: "conway.tech", type: DISCUSSION, first: 25) { discussionCount } }'  # 0

# Stack Overflow und Hacker News
curl -s --compressed --get "https://api.stackexchange.com/2.3/search/excerpts" \
  --data-urlencode "q=conway.tech" --data-urlencode "site=stackoverflow"        # items: 0
curl -s --get "https://hn.algolia.com/api/v1/search" --data-urlencode "query=api.conway.tech"  # nbHits: 0

# npm
curl -s https://registry.npmjs.org/conway-terminal | jq '{bugs,time:.time.modified}'
curl -s "https://api.npmjs.org/downloads/range/2026-06-22:2026-09-20/conway-terminal"  # 1619
curl -s -o /dev/null -w '%{http_code}\n' https://github.com/Conway-Research/conway-terminal/issues  # 404

# Zustand der Conway-Endpunkte
curl -s https://api.conway.tech/health
curl -s -X POST https://api.conway.tech/v1/auth/nonce -H 'Content-Type: application/json' \
  -d '{"address":"0x0000000000000000000000000000000000000001"}'
```

Unsicherheiten dieser Erhebung: Die GitHub-Codesuche indiziert nur Standardbranches und keine
privaten Repositories, weshalb private Ableitungen unsichtbar bleiben. Die Websuche deckt kein
Discord, kein Telegram und kein X ab, wo Betroffene sich unbelegbar austauschen könnten; belegen
lässt sich nur, dass Conway selbst keinen solchen Kanal mehr betreibt. Ein Account ist kein
Mensch: Namen wie `GigisAssistant` und `JoTalbot` ("Octopus automation reviewed this bounty")
deuten auf Automaten hin, beide sind aber vom Typ `User` und zählen deshalb mit.
