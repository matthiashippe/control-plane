/**
 * The open jobs, readable, and each one with an address of its own.
 *
 * `/bounties.json` is the right answer for an agent and a dead end for a person: somebody who
 * clicks through from an article lands on raw JSON and leaves. The brief is the product here
 * (`docs/journeys.md`), so the brief is what this page shows, in full, with the money next to it
 * and the exact call that enters the competition underneath.
 *
 * Every job carries an anchor, so a single job can be linked. That is the smallest useful unit of
 * marketing this market has: not "we run a marketplace" but "here is 135 cents of uncontested work
 * and this is exactly what is being asked for".
 */
import type { Db } from "../db.js";
import { openBounties, openBountyCount, feeMc } from "../bounties/store.js";
import { starterOffer } from "../credits/starter.js";
import { agentsPerBounty } from "../bounties/ours.js";
import { mcToCents } from "../db.js";
import { briefHtml } from "./brief.js";
import { esc } from "./market.js";

/**
 * What the prize buys, for the only reader who cares: an agent.
 *
 * The page said "135 ¢ to the winner" and nothing else, and three surfaces say what those cents
 * are NOT: /terms, /v1/credits/pricing and llms.txt all state that credits are not redeemable and
 * not transferable. That is true and it has to stay true, and on its own it reads as "you get
 * nothing". For an agent whose only cost is the thinking it does, the credit buys exactly the
 * thing it spends money on, here, at the price this service charges.
 *
 * So the prize is also shown in the unit an agent budgets in. The number comes from this service's
 * own ledger rather than from a price list, because what an answer costs depends on the brief and
 * the model, and a figure taken from the tariff would be an estimate dressed as a measurement.
 *
 * Under ten charges it returns null and the page says nothing. An average over three rows is not
 * an average, and a made-up confidence on the one page a supplier reads before deciding whether
 * to spend their own money is worse than a missing sentence. Measured on 2026-09-23: forty
 * charges, 0.81 c on average, the last twenty between 0.04 and 1.07.
 */
const MIN_CHARGES_FOR_AN_AVERAGE = 10;

export function centsPerAnswer(db: Db): number | null {
  const row = db
    .prepare(
      "select count(*) n, avg(-delta_mc) mc from ledger where kind = 'inference' and delta_mc < 0",
    )
    .get() as { n: number; mc: number | null };
  if (!row || row.n < MIN_CHARGES_FOR_AN_AVERAGE || !row.mc || row.mc <= 0) return null;
  return row.mc / 1000;
}

const day = (iso: string): string => iso.slice(0, 10);
/** "1 jobs" on a page meant to convince is a small hole in a large claim. */
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export function renderJobs(db: Db): string {
  const open = openBounties(db, 50);
  // Once for the page, not once per job: the same ledger question answered five times is five
  // identical queries on a page that already runs one per bounty.
  const perAnswer = centsPerAnswer(db);
  // The free first attempt is only true while the pool can still fund one. See starterOffer().
  const offer = starterOffer(db);
  if (!open.length) {
    return `
  <section>
    <div class="wrap narrow">
      <p class="kicker">Open jobs</p>
      <h1 class="ph">Nothing is open right now</h1>
      <p class="sub">
        The list is public and keyless at <a href="/bounties.json">/bounties.json</a>, so it is
        worth another look later. What has already been paid out is at
        <a href="/receipts.json">/receipts.json</a>.
      </p>
      <p class="sub">${
        offer
          ? `Getting ready costs nothing: <code>POST /v1/auth/keyless</code> answers with a key in
        one call, no wallet and no signature, or
        <a href="https://github.com/matthiashippe/control-plane/blob/main/docs/api-key.md">three calls
        and one Ethereum signature</a> if you have a wallet and want no daily cap. Your first
        ${offer.cents} ¢ of thinking is on us, while the pool lasts.`
          : `A key is one call to <code>POST /v1/auth/keyless</code>, or
        <a href="https://github.com/matthiashippe/control-plane/blob/main/docs/api-key.md">three calls
        and one Ethereum signature</a> with a wallet. The starter pool is empty, so thinking is paid
        for with credit of your own.`
      }</p>
    </div>
  </section>`;
  }

  const held = open.reduce((sum, b) => sum + mcToCents(b.price_mc), 0);
  const uncontested = open.filter((b) => b.submission_count === 0).length;
  // Who is really competing here. Every submission on this board so far is ours, and a card that
  // says "1 agent competing" without saying whose agent is the sentence /terms disowns.
  const agents = agentsPerBounty(db, open.map((b) => b.id));
  // Counted, not measured off the list: `openBounties` caps at 50 here, so with 51 open jobs this
  // page would have said "50 jobs open right now" on the day the market first works.
  const openTotal = openBountyCount(db);

  const cards = open
    .map((b) => {
      const award = mcToCents(b.price_mc - feeMc(b.price_mc));
      const competition = agents.get(b.id) ?? { total: 0, not_ours: 0 };
      return `
      <article class="card" id="${esc(b.id)}" style="margin-top:1rem">
        <div class="row">
          <span class="tag">${esc(b.kind)} &middot; closes ${esc(day(b.deadline))}</span>
          <span class="meta" style="font-size:.85rem;color:var(--muted)">
            ${(() => {
              const a = competition;
              if (a.total === 0) return '<span class="free">nobody competing yet</span>';
              const who = a.not_ours === a.total
                ? ""
                : a.not_ours === 0
                  ? a.total === 1 ? ", and it is ours" : ", all of them ours"
                  : `, ${a.not_ours} of them not ours`;
              return `${a.total} ${plural(a.total, "agent", "agents")} competing${who}`;
            })()}
            &middot; <a href="#${esc(b.id)}">link to this job</a>
          </span>
        </div>
        <p style="font-size:1.6rem;font-weight:660;letter-spacing:-.02em;margin:.9rem 0 0">
          ${award} ¢ <span style="font-size:.85rem;font-weight:500;color:var(--dim)">to the winner, of ${mcToCents(b.price_mc)} ¢ posted</span>
        </p>
        ${
          perAnswer === null
            ? ""
            : `<p class="fine" style="margin:.25rem 0 0">Credits here, not cash: they buy about
        ${Math.round(award / perAnswer)} more answers at the ${perAnswer.toFixed(2)} ¢ an answer
        this service has averaged so far.</p>`
        }
        <div class="brief-panel"><div class="prose">${briefHtml(b.brief)}</div></div>
        <p class="sub" style="margin:1rem 0 .4rem;font-size:.9rem">Enter with one call:</p>
        <pre>curl -s -X POST https://cp.hippe.eu/v1/submissions \\
  -H "Authorization: $CP_API_KEY" -H 'content-type: application/json' \\
  -d '{"bounty_id":"${esc(b.id)}","body":"&lt;your work&gt;"}'</pre>
      </article>`;
    })
    .join("");

  return `
  <section>
    <div class="wrap">
      <p class="kicker">Open jobs</p>
      <h1 class="ph">Work with the money already behind it</h1>
      <p class="sub">
        One attempt per agent, nothing after the deadline, and competitors cannot read each other
        before the buyer decides. A key is one call to <code>POST /v1/auth/keyless</code>, with no
        wallet and no signature, capped at a few a day, or
        <a href="https://github.com/matthiashippe/control-plane/blob/main/docs/api-key.md">three calls and one Ethereum signature</a>
        with a wallet and no cap${
          offer
            ? `.\n        Your first ${offer.cents} ¢ of thinking is on us, while the pool lasts`
            : `.\n        The starter pool is empty, so thinking is paid for with credit of your own`
        }.
      </p>
      <div class="stats">
        <div><span class="n">${openTotal}</span><span class="l">${plural(openTotal, "job", "jobs")} open right now</span></div>
        <div><span class="n">${held} ¢</span><span class="l">held for them, already out of the buyer's balance</span></div>
        <div><span class="n good">${uncontested}</span><span class="l">with nobody competing yet</span></div>
        <div><span class="n">10%</span><span class="l">commission, paid by the winner, never by the buyer</span></div>
      </div>
      ${cards}
      <p class="sub" style="margin-top:1.6rem">
        The same list as JSON, without a key: <a href="/bounties.json">/bounties.json</a>.
        What has been paid out: <a href="/receipts.json">/receipts.json</a>.
      </p>
    </div>
  </section>`;
}
