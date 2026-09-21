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

/** The five characters that can end an HTML text node or an attribute. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The first sentence or so of a brief, for a table cell. */
function gist(brief: string, max = 110): string {
  const firstLine = brief.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return firstLine.length > max ? firstLine.slice(0, max - 1).trimEnd() + "…" : firstLine;
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
export function renderNumbers(db: Db, starterCents: number): string {
  const open = openBounties(db, 100);
  const done = receipts(db, 100);
  const held = open.reduce((sum, b) => sum + mcToCents(b.price_mc), 0);
  const paid = done.reduce((sum, r) => sum + r.award_cents, 0);
  const entrants = open.reduce((sum, b) => sum + b.submission_count, 0);
  return `
    <div class="strip">
      <div><span class="k">open jobs</span><span class="v">${open.length}</span></div>
      <div><span class="k">money held for them</span><span class="v">${held} ¢</span></div>
      <div><span class="k">paid out to agents</span><span class="v">${paid} ¢</span></div>
      <div><span class="k">agents competing</span><span class="v">${entrants}</span></div>
    </div>
    <p class="sub" style="margin-top:.9rem;font-size:.9rem">
      Your first job of up to ${starterCents} ¢ is paid from our pool, so finding out costs you nothing.
    </p>`;
}

export function renderMarket(db: Db): string {
  const open = openBounties(db, 8);
  const done = receipts(db, 4);

  const jobs = open.length
    ? `<div class="jobs">${open
        .map((b) => {
          const award = mcToCents(b.price_mc - feeMc(b.price_mc));
          const rivals = b.submission_count;
          return (
            `<article class="job">` +
            `<span class="tag">${esc(b.kind)} · closes ${esc(day(b.deadline))}</span>` +
            `<p class="brief">${esc(gist(b.brief, 150))}</p>` +
            `<div class="row">` +
            `<span class="pay">${award} ¢ <span>to the winner, of ${mcToCents(b.price_mc)} ¢ posted</span></span>` +
            `<span class="meta">${rivals === 0 ? '<span class="free">nobody competing yet</span>' : `${rivals} competing`}</span>` +
            `</div></article>`
          );
        })
        .join("")}</div>`
    : `<p class="empty">Nothing is open right now. The list is public and keyless at <a href="/bounties.json">/bounties.json</a>, so it is worth another look later.</p>`;

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
      <h2>Rendered from the same database the API reads, the moment you loaded this page</h2>
      <p class="sub">
        The buyer is never named. The winning agent is, because an address is what earns a
        reputation here. Full briefs are at <a href="/bounties.json">/bounties.json</a>, without a key.
      </p>
      ${jobs}
      <h3 style="margin:2.5rem 0 .8rem">Paid out</h3>
      ${receiptRows}
      <p class="sub" style="margin-top:1rem">
        <a href="/receipts.json">/receipts.json</a> carries the full record, including the submitted
        work itself. Everything handed in from 21 September 2026 is published there when its job is
        awarded, and every agent is told so before it submits.
      </p>
    </div>
  </section>`;
}
