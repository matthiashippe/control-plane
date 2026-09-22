/**
 * The market, rendered into the landing page on the server.
 *
 * `docs/journeys.md` on the spectator (A3): "They need to see the competing submissions side by
 * side, what each attempt cost, and who won. There is still no page, only JSON." The only human
 * ever observed here in a browser, 149.57.180.12 on 2026-09-20, loaded `/` and `/v1/status` and
 * left. They were told in prose that a market runs here and shown none of it.
 *
 * **Rendered on the server and not by the page's script, and that is a constraint rather than a
 * preference.** The inline script is covered by a CSP hash that lives in the Caddyfile, and
 * `deploy/**` is not touched without a human. Every byte added to that script would break the
 * hash and take the site's security headers with it. Writing into the body instead leaves the
 * script untouched.
 *
 * **Everything from a buyer is escaped.** A brief is arbitrary text from anybody who can post a
 * job, and until now it only ever appeared inside JSON. Putting it into HTML makes it an injection
 * vector, and the answer is to escape it here rather than to trust the CSP to catch what got
 * through. The Content-Security-Policy is a second line, not the first.
 */

/**
 * **Neither of these sweeps the expired bounties, and that is deliberate.**
 *
 * `releaseExpired` is a write: it moves a bounty out of `open` and pays the hold back. Both render
 * functions called it, so every single view of the landing page opened two write transactions
 * against SQLite. A page that only reads should only read, whatever the traffic is; the service
 * measured 608 requests a second with them still in place, so this is not a rescue, it is simply
 * the right shape.
 *
 * Nothing is lost by leaving it out. `openBounties` filters on `deadline > now`, so an expired
 * bounty is invisible here either way, and the sweep still runs on every API path that touches the
 * market, which is where the money actually has to move.
 */
import type { Db } from "../db.js";
import { openBounties, feeMc } from "../bounties/store.js";
import { receipts } from "../bounties/receipts.js";
import { mcToCents } from "../db.js";
import { ourAddresses, wallets } from "../bounties/ours.js";

/** The five characters that can end an HTML text node or an attribute. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The first sentence or so of a brief, for a card. */
function gist(brief: string, max = 90): string {
  const firstLine = brief.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  // A buyer opens their brief with the format word the API asks for. On a card that is the same
  // three words in front of every job, and four of the five open ones started with "FACT SHEET
  // for a" or "BRIEF for the", so the list looked like one job posted five times.
  const ohne = firstLine.replace(/^(FACT SHEET|BRIEF)\s+for\s+(a|an|the)\s+/i, "");
  const s = ohne === firstLine ? firstLine : ohne.charAt(0).toUpperCase() + ohne.slice(1);
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

const day = (iso: string): string => iso.slice(0, 10);
const shortAddress = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * The four numbers that go under the hero, before anything is explained.
 *
 * A market is either visible in the first screen or it is a claim. `starterCents` is the hook and
 * the honest one: a newcomer's first job is paid out of the operator's own pool, so the answer to
 * "what does it cost me to find out" is nothing.
 */
/**
 * The price rule, under the hero, before anything is explained.
 *
 * Until 2026-09-22 these four cells were the operator's own volume, in the largest type on the
 * page: open jobs, money held, money paid out, agents competing. Read by a buyer that is one
 * sentence, and it is "565 c waiting and 180 c ever paid", which is the disqualifying number set
 * in 36px mono. The figure that actually decides whether they try, the free first job, stood
 * underneath at 14.4px and 42 per cent opacity. The volume moved into the market section, where
 * two of those numbers are context instead of a balance sheet, and this strip carries the three
 * constants: what a first job costs, what the service takes from the buyer, and what happens when
 * nothing is good enough.
 *
 * `poolLeftCents` is taken because the first cell is a promise with a floor. POOL_MC is 500_000
 * millicents, thirty-three grants, and `starterAvailableMc` returns 0 once they are gone. The old
 * sentence was unconditional, so the thirty-fourth newcomer was promised something the server
 * refuses in the same second, and nothing on either side would have noticed.
 */
export function renderNumbers(starterCents: number, poolLeftCents: number): string {
  const frei = poolLeftCents >= starterCents;
  return `
    <div class="strip">
      ${frei ? `<div><span class="k">your first job</span><span class="v">free<small>up to ${starterCents} ¢, while the pool lasts</small></span></div>` : ""}
      <div><span class="k">you pay on top</span><span class="v">nothing<small>the winner carries the fee</small></span></div>
      <div><span class="k">nothing good enough</span><span class="v">all back</span></div>
    </div>`;
}

export function renderMarket(db: Db): string {
  const alle = openBounties(db, 100);
  // Two cards, by price, not eight by age. `openBounties` orders by created_at, so the page was
  // leading with the jobs nobody had wanted for longest, five times the same shape, and from the
  // third card on a first-time reader learns nothing. The rest is one link to /jobs, which carries
  // every brief in full, the per-job statistics and the exact call that enters one.
  const open = [...alle].sort((a, b) => b.price_mc - a.price_mc).slice(0, 2);
  const quittungen = receipts(db, 100);
  const done = quittungen.slice(0, 1);
  const paid = quittungen.reduce((sum, r) => sum + r.award_cents, 0);
  // Agents, not submissions. This summed `submission_count` across the open jobs until 2026-09-22,
  // so an agent that entered three jobs stood in the strip as three agents. It happened to be
  // right while three different agents had one job each, which is the worst kind of wrong:
  // correct by coincidence on the day somebody checks, wrong the first time anybody competes
  // twice. /terms says the count on a single job is a count of submissions, which is exact there,
  // because on one job one agent can only be in once. Across jobs it is not.
  const entrants = (
    db
      .prepare(
        `SELECT count(DISTINCT s.agent) AS n FROM submissions s
           JOIN bounties b ON b.id = s.bounty_id
          WHERE b.status = 'open' AND b.deadline > ?`,
      )
      .get(new Date().toISOString()) as { n: number }
  ).n;
  // And how many of them are not ours.
  //
  // `/terms` says in the honesty paragraph: "the count of agents competing on a job is a real
  // count of real submissions, and until a stranger arrives it is a count of us." The strip said
  // "agents competing 3" and all three were ours, seeded by ops/compete.ts, which is the sentence
  // from /terms rendered as its own opposite. Found by an adversarial read on 2026-09-22 (B15).
  //
  // Marked rather than subtracted: a page that showed 0 here would be hiding that three agents
  // really did compete, which is true and is the thing that has to work before a stranger will.
  const fremde = (() => {
    const agenten = (
      db
        .prepare(
          `SELECT DISTINCT s.agent AS agent FROM submissions s
             JOIN bounties b ON b.id = s.bounty_id
            WHERE b.status = 'open' AND b.deadline > ?`,
        )
        .all(new Date().toISOString()) as { agent: string }[]
    ).map((r) => r.agent);
    return agenten.length - ourAddresses(db, agenten).size;
  })();

  const jobs = open.length
    ? `<div class="jobs">${open
        .map((b) => {
          const award = mcToCents(b.price_mc - feeMc(b.price_mc));
          const rivals = b.submission_count;
          return (
            `<article class="job">` +
            // The whole card is the tap target. It lifted on hover and coloured its border on
            // :focus-within while holding no focusable child at all, and on a phone the section
            // was 38 per cent of the page with not one link in it. /jobs renders an anchor per
            // bounty, so the destination already exists.
            `<a class="jump" href="/jobs#${esc(b.id)}"><span class="vh">Read the full brief</span></a>` +
            `<span class="tag">${esc(b.kind)} · closes ${esc(day(b.deadline))}</span>` +
            `<p class="brief">${esc(gist(b.brief))}</p>` +
            `<div class="row">` +
            `<span class="pay">${award} ¢ <span>of ${mcToCents(b.price_mc)} ¢ posted</span></span>` +
            `<span class="meta">${rivals === 0 ? '<span class="free">nobody competing yet</span>' : `${rivals} competing`}</span>` +
            `</div></article>`
          );
        })
        .join("")}</div>`
    : `<p class="empty">Nothing is open right now. <a href="/jobs">The board</a> fills again.</p>`;

  const receiptRows = done.length
    ? done
        .map((r) => {
          const winner = r.entries.find((e) => e.won);
          return (
            `<div class="receipt">` +
            `<span class="t">${esc(gist(r.brief, 70))}</span>` +
            `<span class="amt">${r.award_cents} ¢ paid, ${r.fee_cents} ¢ commission</span>` +
            `<span class="who">${winner?.agent ? esc(shortAddress(winner.agent)) : "winner withheld"}</span>` +
            `<span class="t">${esc(r.awarded_at ? day(r.awarded_at) : "")}</span>` +
            `</div>`
          );
        })
        .join("")
    : `<p class="empty">Nothing has been paid out yet.</p>`;

  return `
  <section id="market">
    <div class="wrap">
      <p class="kicker">The market, right now</p>
      <h2>Open right now</h2>
      ${jobs}
      <p class="sub"><a href="/jobs">All ${alle.length} open jobs, with the full brief</a></p>
      <div class="strip">
        <div><span class="k">agents competing</span><span class="v">${entrants}<small>${fremde} from outside</small></span></div>
        <div><span class="k">paid out so far</span><span class="v">${paid} ¢</span></div>
      </div>
      ${receiptRows}
      <p class="sub"><a href="/receipts">Every job that has been paid, and the work that won it</a></p>
    </div>
  </section>`;
}

/**
 * The status line in the footer, with the part that is not ours broken out.
 *
 * Two numbers, each twice: how many wallets did the thing, and how many of those are not the
 * operator's. That second figure is what `/terms` calls "the one figure that separates a market
 * from a demonstration", and until 2026-09-22 the landing page showed only the first, unmarked,
 * in a line a reader reads as the score.
 *
 * Nothing is hidden and nothing is subtracted: ours are counted like anybody else's and marked,
 * the same treatment `/conway` gives our own transfer into Conway. A page that quietly dropped
 * its own rows would be a second way of saying something untrue.
 */
export function renderStatus(db: Db): string {
  const satz = (n: { total: number; not_ours: number }, was: string) =>
    n.total === 0
      ? `nobody has ${was} yet`
      : `${n.total} ${was}, ${n.not_ours} from outside`;
  const zahler = wallets(db, "topup");
  const denker = wallets(db, "inference");
  return `${esc(satz(zahler, "paid"))} &middot; ${esc(satz(denker, "thought here"))}`;
}
