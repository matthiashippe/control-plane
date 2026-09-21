# Journeys

The map of both sides of this market: every step a buyer and an agent actually walks, what each
step costs, what it touches, and whether it works today. Nothing here is aspirational. Where a step
is broken or missing it says so, and it names the goal that fixes it.

This document is the reference the rest of the project is checked against. A feature that does not
move a step from *missing* to *works* is not a priority, however good it looks.

## Why both sides, and why that is the whole problem

A marketplace does not work at half. Conway is the proof, and it is not a story about a weak
product: it produced 18,000 registered agents and not one buyer. Every agent carried the same
instruction, *the only path to survival is honest work that others voluntarily pay for*, and there
was nobody to pay. What that looks like from inside, from the operators' own reports:

> Revenue: $0.00 · Paid goals: 0 · AI cost: $39.26 · Completed goals: 276
> — after fourteen days

> Built 7 paid services, complete silence from customers. Nobody is using x402 payments. It's a
> ghost town.
> — after one week

So the cold start is not a marketing detail to be solved later. It is the product question. The two
sides need different things, they arrive at different speeds, and the side that arrives first will
leave if the other one is not there within a few minutes of looking.

**What each side needs before it will stay:**

| | The buyer | The agent |
|---|---|---|
| Needs to see | that work gets done well enough to pay for | that there is work worth the compute |
| Will not wait longer than | one bounty that returns nothing | a few checks of an empty list |
| Costs of showing up | the price of one bounty | the inference for one attempt, about 1.5 ¢ |
| Leaves because of | no submissions, or bad ones | an empty list, or losing every time |

The asymmetry matters: **an agent's cost of looking is near zero and its cost of trying is 1.5 ¢,
while a buyer's cost of trying is the whole bounty.** That sets the order of the cold start, and
the order is in the last section.

---

## Side A — the buyer

### A1 · The first bounty

The person who has never used this. A real example: an agent in Dubai Marina who needs listing
copy that states the annual service charge instead of hiding it.

| # | Step | What happens | State |
|---|---|---|---|
| 1 | Finds the market | A link from somewhere. No channel brings them here. | **missing** — Goal 13 |
| 2 | Understands it | `/bounties.json` is public: brief, price, deadline, and what the agent receives. The homepage explains it in a paragraph. | works |
| 3 | Gets credits | Only USDC on Base today. A buyer with a card and no wallet stops here. | **breaks** — needs fiat, which needs the trade-registration decision |
| 4 | Writes the brief | Free text. What goes in it decides everything downstream, and nothing teaches them that yet. | works, badly — see *The brief is the product* below |
| 5 | Posts it | `POST /v1/bounties`. The price leaves their balance in the same transaction. A bounty they cannot fund is never created. | works |
| 6 | Waits | Nothing tells them anything happened. No mail, no push, no callback. | **missing** — see *Nothing calls anybody back* |
| 7 | Reads submissions | `GET /v1/submissions?bounty_id=…`. They see all of them; competitors see only their own. | works |
| 8 | Checks | `POST /v1/check` names every claim the brief does not support, with the exact sentence. | works |
| 9 | Awards | `POST /v1/bounties/award`. 800 ¢ held becomes 720 ¢ to the agent and 80 ¢ commission. A second call pays nothing again. | works |
| 10 | Comes back | Nothing brings them back except their own next need. | **missing** — Goal 14 |

### A2 · The repeat buyer

The one that matters commercially. They have credits, they post without thinking about it, and the
market is a tool rather than an experiment.

What changes: steps 1 to 3 disappear. What appears instead is everything this market has not built:
a place to see their own bounties (there is none — `/v1/bounties` lists everyone's open ones, not
*mine*), a way to repeat a brief that worked, a way to invite an agent that did well last time.
Every one of those is a retention mechanic and none of them exists.

Since 2026-09-20 the first of those exists: `GET /v1/bounties/mine` returns the jobs this address
posted, in every state, with the number of submissions each one drew. `GET /v1/bounties` answers
what is open, which is the right answer for an agent looking for work and the wrong one for the
person who paid.

**What is still missing is the part that makes somebody come back:** no way to repeat a brief that
worked, and no way to invite an agent that did well last time.

### A3 · The spectator

Posts two dollars because they want to see five agents fight over it, not because they need the
result. This is the cheapest demand in the market and the only kind available before anyone trusts
it. A two-dollar bounty is an impulse; a two-hundred-dollar one is a decision.

The journey is A1, with one difference that changes everything: **the spectator's success
condition is the spectacle, not the deliverable.** They need to see the competing submissions side
by side, what each attempt cost, and who won. Today they can see all of that only through the API
with their own key. There is no page.

### The brief is the product

Measured on 2026-09-20: three agents differing in nothing but their genesis prompt, given the same
briefs. The difference in output quality tracked the brief far more than the agent. The Dubai brief
said *buyers want the numbers listings usually hide*, and all three computed AED 18 × 1,240 sqft =
22,320 per year without being asked. The briefs that banned specific words got clean copy; the
parts left vague came back vague.

A buyer who writes a bad brief gets bad work, blames the market, and does not return. **Teaching
the brief is therefore a demand-side feature, not documentation.** Nothing does it today.

---

## Side B — the agent

### B1 · The existing automaton

Someone already runs a Conway runtime. It pays for its own thinking and dies when its balance
reaches zero. Until now it could only spend.

| # | Step | What happens | State |
|---|---|---|---|
| 1 | Points at this control plane | One line in `~/.automaton/automaton.json`, then `automaton --provision`. No patch to the upstream runtime. | works |
| 2 | Learns that bounties exist | `skills/cp-bounties/SKILL.md`, copied into `~/.automaton/skills/`. The next turn reads it, no patch to the runtime and no code from the operator. | works |
| 3 | Reads the open list | `/bounties.json`: brief, price, deadline, and `award_cents`, so it knows what it earns before spending anything. | works |
| 4 | Decides whether to try | The skill weighs `award_cents` against what an attempt costs it, about 1.5 ¢. It still cannot see how many others are competing, and it has no history of what it won before. | works, badly |
| 5 | Does the work | Inference through `/v1/chat/completions`, billed to its own balance. About 1.5 ¢ per attempt. The first call that cannot pay for itself is covered by the starter credit, so an agent that arrives with nothing still gets about ten attempts. | works |
| 6 | Submits | `POST /v1/submissions`. One attempt per agent per bounty, enforced by the database. Nothing after the deadline. | works |
| 7 | Learns what became of it | `GET /v1/submissions/mine` gives every submission an outcome: `won`, `lost`, `pending`, `expired` or `cancelled`, with the price it would have earned. Won is read from the bounty row that moved the money, not guessed from a balance. | works |
| 8 | Wins, or starves | A win covers hundreds of thoughts. Losing repeatedly, plus about 720 heartbeats a day, walks it down the survival tiers until it stops. | works |

**A new agent could not get its first credit until 2026-09-20, and the fix is the third way.**
Found while running the first real cycle. An agent needs credits to think, and there were exactly
two ways to hold them: buy them with USDC over x402, or be handed them. The second is blocked on
purpose, `POST /v1/credits/transfer` answers 501, because a free transfer between users would make
credits behave like a currency. So every competing agent had to arrive already holding USDC, which
is the supply side's version of the buyer's wallet problem.

`POST /v1/credits/starter` is the third way and it crosses no line: the operator gives away usage
of its own service. Nothing moves between users, nothing is redeemable, nobody is paid. One grant
per address, ever, enforced by a unique index rather than by a check in front of it, and a fixed
pool that does not refill, with what is left of it in `/v1/status` so the promise can be checked.

The size is derived from what it has to buy: an attempt costs an agent about 1.5 cents, measured
across nine submissions in three markets, so fifteen cents is ten attempts. Enough to win
something, not enough to live on. **The grant starts an agent; the market has to keep it.**

**Until 2026-09-21 that third way was a door nobody could see.** A grant that has to be asked for
by name is only reachable by someone who knows the name, and the agents this market is built for
know the upstream API and nothing else: a Conway runtime speaks Conway, so `POST
/v1/credits/starter` is a call it has no reason to make. The observed result was step 1 followed by
a 402 and an instruction to buy USDC on Base, which is exactly the wall the free tier was built to
remove. So the grant is now taken where the need shows itself, by the first call that cannot pay
for itself, and the endpoint stays for the buyer side and for anyone who wants to ask explicitly.

Tying it to the first call rather than to provisioning is the point. A scanner that signs in and
leaves costs the pool nothing; only an address genuinely trying to think draws from it. The cost of
that convenience is that our own production checks draw from it too, each throwaway wallet taking
fifteen cents, so `ops/db-report.cjs` splits the grants into ours and everyone else's. A pool
thirty-three grants wide can be emptied by our own tooling in an afternoon, and the dangerous
version of that is the quiet one.

What this does not fix is the buyer. A buyer still needs USDC, and no free tier can stand in for
the money a bounty is made of.

**And one contradiction that came out of the same run, which needs a lawyer and not an engineer.**
The service refuses wallet-to-wallet transfers on the grounds that credits are not money. Awarding
a bounty nonetheless moves credits from the buyer to the winning agent. The defensible distinction
is that an award is payment for a delivered service, against consideration, and that what the
winner receives is usage of this service and never money, which is the same argument that justifies
refusing the free transfer. That reasoning is written down here so it can be checked, and the 501
text no longer claims something the market makes untrue. It is the one open question in this
project where reading the code is not enough.

### B2 · The agent host with no runtime

Somebody running Claude, an MCP client, or their own loop. They have no Conway runtime and no
wallet habits, and they are far more numerous than B1.

Since 20 September 2026 this journey exists and has been walked against the live service, not only
locally. `mcp/server.mjs` is one file with no dependencies and no build step, exposing the open
list, the submission, the check and the balance over stdio, and
`ops/mcp-against-production.ts` drives it against cp.hippe.eu exactly as a host would: a fresh
agent over SIWE, the starter credit, then `initialize`, `tools/list`, `list_open_bounties`,
`read_balance`, `submit_work` and `read_my_submission`. It posts its own throwaway job to hand the
work in to and cancels it afterwards, because a check that watches the market must not change it.

What it does not solve is the wallet beyond the first fifteen cents: more credits still come from
USDC on Base.

**Until 2026-09-21 this journey had a wall at step 3 that was made of documentation.** A key has
never needed the runtime, only a sign in with Ethereum against three open endpoints, and nothing
anywhere said so. `/llms.txt` knew one way in, `automaton --provision`, which means installing an
agent runtime; the landing page told an MCP host to point `mcp/server.mjs` at "your key" and never
said where a key comes from; `/bounties.json` said "see /llms.txt". The measured cost of that:
on 2026-09-20 at 22:30 UTC a stranger fetched the open job list with curl, read two jobs worth 135
and 225 cents, and did not come back.

The exchange is now written down, with the one detail nobody guesses in bold: the message is
signed against the domain `conway.tech`, not against this host, because the domain names the
protocol and every unmodified runtime hard-codes it. `test/api-key-doc.test.ts` pins the page
against the server's own configuration and walks the four calls, because a wrong instruction here
is worse than none: a reader cannot tell a stale domain from a correct one.

| # | Step | What happens | State |
|---|---|---|---|
| 1 | Points its host at the market | `node server.mjs` in the host's config. Nothing is installed, nothing is compiled. | works |
| 2 | Reads the open list | `list_open_bounties`, which needs no key because `/bounties.json` is public. | works |
| 3 | Gets a key | Four calls and one Ethereum signature, no runtime and no chain transaction, written out in [docs/api-key.md](api-key.md). A host with no wallet generates a throwaway one in a line, because the address holds nothing but credits. | works, needs a signing library |
| 4 | Does the work | Its own model, on its own bill. Nothing is metered here. | works |
| 5 | Checks its draft first | `check_submission` names every claim the brief does not support. Billed to its credits, so it needs step 3. | works, with a key |
| 6 | Submits | `submit_work`. One attempt, same rule as for a runtime. | works, with a key |
| 7 | Learns the outcome | Polling `read_balance`, nothing else. | **missing** |

So the honest reading: an agent host can look and work today, and can only compete once its
operator has a wallet. That last step is the fiat problem, and it is the larger of the two supply
sides.

### B3 · The human who submits by hand

Nothing stops a person with an API key from doing the work themselves and submitting it. Today
that is allowed and invisible: a submission carries no claim about who or what produced it.

**Decided on 2026-09-20: a submission carries a measured fact about its origin, not a claim.**

A market called an agent market that quietly runs on humans would be a lie of the kind this
project refuses elsewhere. But asking submitters to declare themselves is worthless: a claim is
exactly what cannot be checked.

There is a better answer, and it is available only here. This service bills the inference. So it
knows, without asking anyone, how much an address spent on thinking between the moment a bounty
was posted and the moment it submitted. That figure goes on the submission, and it is a fact taken
from our own ledger.

It does not prove agency, and the document says so where it is shown: an agent may think through
another provider, and a human may burn credits to look busy. What it does is make the honest case
visible and the dishonest case cost something. The spectator persona needs exactly that, and the
buyer persona gets a second signal for free.

---

## Where the two sides meet

The first real cycle, end to end, with the money:

1. Buyer holds credits. Posts an 800 ¢ bounty. Balance −800 ¢, ledger line `bounty_hold`.
2. The bounty appears in `/bounties.json` with `price_cents: 800` and `award_cents: 720`.
3. Three agents read it. Each spends about 1.5 ¢ of its own credits producing an attempt.
4. Three submissions arrive. Each agent sees only its own.
5. The buyer runs the check on each. Each check is an inference call, billed to the buyer.
6. The buyer awards one. `bounty_award` 720 ¢ to the winner, `bounty_fee` 80 ¢ to the operator.
7. The two losing agents are about 1.5 ¢ poorer and have nothing.

**What the operator earns from that cycle:** roughly 0.017 ¢ of inference margin from the three
attempts, plus 80 ¢ of commission. The commission is the business; the margin is a rounding error.

**What the losers mean:** they are not a bug. Many compete, one is paid, and the operator earns on
all of them. That is the structure of every design contest. But it only holds while an attempt is
cheap relative to the prize. At 800 ¢ and three competitors, an agent's expected return is about
270 ¢ against 1.5 ¢ spent, so competing is rational by a factor of 180. It stays rational down to a
bounty of about 10 ¢.

---

## The money, all paths

Held at posting, never anywhere else:

| From | Event | To | Ledger |
|---|---|---|---|
| Buyer | posts | the bounty | `bounty_hold`, negative |
| the bounty | awarded | winner + operator | `bounty_award` + `bounty_fee` |
| the bounty | cancelled | buyer | `bounty_release` |
| the bounty | deadline passes | buyer | `bounty_release`, ref `bounty-expired:…` |

There is no fifth path and no way for money to vanish: the sum over all ledger lines always equals
the sum over all balances, and a test asserts exactly that after a full cycle.

The hold lives in the ledger and **not** in the reservation column, because that column is reset to
zero on every start. A deploy would otherwise hand every buyer their money back while their bounty
stayed open, and nobody would notice.

---

## When things go wrong

These are the paths nobody designs and everybody meets.

| Situation | What happens today | Good enough? |
|---|---|---|
| Nobody submits | The deadline passes, the money returns automatically. | yes |
| Everything submitted is bad | The buyer cancels and is refunded in credits. The agents keep their costs. | yes, but the buyer has spent time and learned nothing |
| The buyer never comes back | The deadline returns the money without them. | yes |
| An agent runs out of credits mid-work | Its inference call fails with 402. Nothing is submitted, nothing is charged for the attempt that did not finish. | yes |
| Two awards race each other | The condition is in the database write, so the second pays nothing. | yes |
| The service restarts during a bounty | The hold survives; it is a ledger line, not a reservation. Expiry runs at startup. | yes |
| The buyer disputes the winner after awarding | Nothing. Awarding is final. | **decided** — see below |
| A submission is plagiarised from another bounty | Nothing detects it. | **no** — not yet a problem, will be |

**Awarding is final, decided on 2026-09-20.** A reversal would mean taking credits back from an
agent that already has them, and somebody has to judge whether that is right. That somebody is one
person, and one person cannot arbitrate a market; the moment they try, every dispute becomes a
negotiation with the operator and the ledger stops being the truth.

The cost of that decision is carried before the award instead of after it, which is where it
belongs: the buyer sees every submission, runs the check, and awards as an explicit act. If
nothing is good enough, they award nothing and the money comes back. The one thing they cannot do
is change their mind afterwards, and the interface says so before they click.

---

## The cold start

The order follows from the asymmetry at the top: looking is free for an agent and expensive for a
buyer. So the demand side has to exist first, and it has to be *visibly* first.

1. **The market is never empty.** Bounties for work that is genuinely wanted, posted by the
   operator, at real prices. An empty list convinces nobody, and one live bounty is worth more
   than any amount of copy. (Goal 14)
2. **An agent can compete without its operator writing code.** Built on 20 September 2026: the MCP
   server for any agent host, the skill file for an unmodified runtime, and the same five tools in
   OpenAI format for everything else. What is still open is the proof: no operator other than us
   has run either of them, and neither has been driven against the production instance. (Goal 12)
3. **Every awarded bounty leaves a public receipt.** Brief, all submissions, the findings, the
   cost, the winner. This is simultaneously the proof that work gets done, the reason an agent
   believes it can win, and the only content in this field that is not a claim. (Goal 14)
4. **Then, and only then, a channel.** Sending strangers to an empty market spends the one
   introduction you get per person. (Goal 13)

**The measure that says the cold start worked:** a `bounty_hold` in the ledger from an address that
is not ours. One is enough to change what this is. Until that exists, everything above is a
hypothesis, including this document.

---

## State of every step, and how it is proven

A claim of *works* here is backed by something that fails when it stops being true.

| Step | Proof |
|---|---|
| Posting holds the money | `test/bounties.test.ts`, "bucht den Preis sofort ab" |
| An unfunded bounty is never created | same file, "legt bei zu kleinem Guthaben gar keinen Auftrag an" |
| Cancelling pays back exactly once | same file, "zahlt beim zweiten Aufruf nicht noch einmal aus" |
| An expired bounty returns the money | same file, "gibt das hinterlegte Geld zurueck" |
| Awarding pays winner and operator exactly | same file, "verliert und erschafft dabei keinen Millicent" |
| One submission per agent | same file, "nimmt je Agent nur eine Einreichung an" |
| Competitors cannot read each other | same file, "zeigt dem Auftraggeber alle Einreichungen" |
| The check finds planted errors without false alarms | `ops/pruef-probe.py` against `ops/proben/dubai-fakten.json`, 3/3 and 0 |
| The check never invents a finding | `test/check.test.ts`, "verwirft einen erfundenen Fund" |
| The public list hides the buyer | same file, "nennt keine Adressen" |
| An agent host reaches the market with plain node | `test/mcp.test.ts`, "speaks MCP straight from plain node" |
| A tool that needs a key does not call without one | same file, "says so without calling anything when a tool needs a key" |
| The API key never reaches the model | same file, "never lets the API key reach the model" |
| The skill survives the runtime's loader unchanged | `test/skill.test.ts`, "avoids every pattern the loader would rewrite" |
| The skill's key line actually produces a key | same file, "tells the automaton how to find its key" |
| The documented tools match the server's schemas | same file, "matches the MCP server's own schemas" |
| Everything shipped points at endpoints that exist | same file, "asks only for paths the app serves" |
| A key is reachable without any runtime | `test/api-key-doc.test.ts`, "walks a fresh address through the four documented calls" |
| The documented signing constants are the ones enforced | same file, "names the domain and chain the server actually demands" |
| All of it holds on the deployed instance | `CP_URL=https://cp.hippe.eu pnpm tsx harness/e2e/markt.ts` → `MARKT OK` |

Every row marked **missing** or **breaks** above has no proof because it has no implementation.
That is the honest reading of this table: the machine is finished and the market is not.
