# Artikel: 1,582 wallets funded an AI agent in February. By June, three were left.

**Status: fertig, nicht gepostet.** Der Titel ist entschieden, der Text steht unten auf Englisch,
weil er nach Hacker News soll. Das Posten macht Matthias selbst.

## Stand der Entscheidungen

**Titel steht** (Matthias, 19.09.2026): "1,582 wallets funded an AI agent in February. By June,
three were left." Die Zahl ist aus dem Datensatz gerechnet (`docs/research/data/artikel-zahlen.py`)
und behauptet nichts, was nicht belegt ist. Die beiden Alternativen ("I scanned every USDC
payment…" und "An agent economy died in nine months…") sind verworfen: die erste verschenkt die
Pointe, die zweite überdehnt den Befund von einem Projekt auf eine ganze Ökonomie und wäre auf HN
im ersten Kommentar zerlegt worden.

**Postfertig aufbereitet:** `.scratch/gtm/hn-post.txt` enthält Titel und Text in der Syntax, die
Hacker News tatsächlich rendert. Der Text unten ist Markdown; HN kennt keine Überschriften, keine
Tabellen und keinen Fettdruck, deshalb wäre ein direktes Kopieren dieser Datei ein kaputter Post.
In der aufbereiteten Fassung ist die Monatstabelle ein eingerückter Monospace-Block.

**Offen: ob und wann er rausgeht.** Zwei Felder auf news.ycombinator.com/submit, `url` bleibt leer.
Posten muss Matthias selbst: Es ist kein HN-Account hinterlegt, und der Harness verweigert das
Ansteuern der Submit-Seite.

**Vor dem Posten nachziehen:** Der Datensatz endet am 19.09.2026 14:59 UTC. Liegt der Text länger
als ein, zwei Wochen, die Monatstabelle und die 30-Tage-Zahl neu rechnen, sonst stimmt der erste
Absatz nicht mehr. Der Vollscan muss dafür nicht wiederholt werden, es reicht, ab dem letzten Block
der CSV weiterzuscannen.

## Was der Text nicht tut

Keine Wallet-Adresse wird einzeln genannt, auch nicht die vier, die heute noch regelmäßig zahlen.
Die Daten sind öffentlich, das Anprangern einzelner Zahler wäre trotzdem billig. Keine erfundenen
Zahlen, keine Screenshots, keine Behauptung über Umsatz oder Nutzer, die wir nicht haben.

---

## Draft

**1,582 wallets funded an AI agent in February. By June, three were left.**

In February 2026, an open-source project called Conway Automaton had a moment. The pitch was a
self-running AI agent that pays for its own inference: you fund its wallet with USDC, it buys
tokens, it keeps itself alive. The code is on GitHub. The payments are on Base. That second part
means the whole thing is measurable, so I measured it.

I scanned every USDC transfer to the platform's receiving address from January 1 to September 19,
2026: 5,652 sequential `eth_getLogs` calls against the public Base RPC, 2,000 blocks at a time,
9,026 transfer events, about 30 minutes of walking the chain. The raw data is a CSV in the repo
linked at the bottom, so you do not have to take my word for any number here.

| Month | USDC | Paying wallets | Transfers |
|---|---:|---:|---:|
| February | 37,958.65 | 1,582 | 6,119 |
| March | 19,112.44 | 581 | 1,961 |
| April | 2,845.00 | 198 | 461 |
| May | 1,215.00 | 90 | 198 |
| June | 420.00 | 34 | 68 |
| July | 360.00 | 24 | 60 |
| August | 415.00 | 40 | 83 |
| September (to the 19th) | 290.05 | 30 | 76 |

Total over nine months: 62,616 USDC from 2,491 distinct wallets. February alone is 61 percent of
it. The median payment was exactly 5 USDC, the smallest tier on offer.

Three things in this table surprised me.

**The collapse came before the outage.** The platform's onboarding endpoint broke in mid-July:
every fresh wallet gets a 500 from `POST /v1/auth/verify`, and twelve GitHub issues describe the
same wall. That is the kind of event you expect to see in a chart. It is not in this one. By April,
three months earlier, volume was already down 93 percent from February. Whatever killed this did
not break it. People simply stopped caring, and the outage arrived at a corpse.

**Almost nobody came back.** Of the 1,582 wallets that funded an agent in February, three were
still paying in June or later. Not three percent. Three wallets. 1,035 of the 2,491 wallets in the
whole dataset paid exactly once and never again. Whatever the product did after the first 5 USDC,
it did not make people spend a second 5 USDC.

**A small group still pays into a system that cannot deliver.** In the last 30 days of the scan,
44 wallets sent 430 USDC in 104 transfers. That is well over two payments per wallet, which fits an
open issue about retry-driven duplicate topups: a failed payment gets retried with a fresh nonce
and the second one settles too. The onboarding has been broken since July. The last commit to the
repository was in August and only touched the README. No maintainer has answered an issue since
March 7. Money is still moving into it, every week, in small amounts.

I wanted to know what those wallets are actually buying, so I ran the unmodified runtime myself
with the billing endpoint pointed at a dead address. The result is more brutal than I expected.
The runtime does not degrade. It stops thinking entirely. When the balance endpoint is unreachable
and no cached balance exists, the code returns a sentinel of `-1`, the survival tier resolves to
`dead`, and the routing matrix has an empty candidate list for every task type at that tier. Eleven
turns in 0.3 seconds, zero tokens, zero outbound inference requests, then sleep. Note the asymmetry:
a balance of zero resolves to `critical`, which still routes to a small model. Being broke is
survivable. Being unable to reach your billing server is not.

That is the part worth taking away from this, and it has nothing to do with AI agents specifically.
This system's dependency on its billing infrastructure was total and invisible. Nothing in the
documentation says "if this endpoint is unreachable, the agent is a no-op." You find it by reading
the router. An agent that was sold as autonomous turned out to have a single point of failure that
its own users could not name, and it is not the model, the wallet, or the chain. It is the invoice.

There are two free ways around it, incidentally, and neither is documented upstream: point the
runtime at a local Ollama model, or write a balance into its own SQLite state and use your own
OpenAI key. The first one has a trap that cost me an hour. There are two config fields named
`inferenceModel`, and the router reads the nested one, not the top-level one the setup wizard
writes. I have written both routes up with the exact code paths, because someone paying 5 USDC a
week into a dead endpoint deserves to know they do not have to.

Full disclosure, since it would be dishonest to leave it out: after my own agent hit this wall, I
built a replacement for the billing layer and run it as a paid service. This post is not an ad for
it. The data above is the reason I no longer expect it to be a business.

---

*Data, scan method, and the write-up of the free routes:
https://github.com/matthiashippe/control-plane*
