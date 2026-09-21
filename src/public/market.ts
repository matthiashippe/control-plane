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

import type { Db } from "../db.js";
import { openBounties, releaseExpired, feeMc } from "../bounties/store.js";
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

export function renderMarket(db: Db): string {
  releaseExpired(db);
  const open = openBounties(db, 10);
  const done = receipts(db, 5);

  const openRows = open.length
    ? open
        .map(
          (b) =>
            `<tr><td>${esc(gist(b.brief))}</td><td>${esc(b.kind)}</td>` +
            `<td>${mcToCents(b.price_mc)} ¢</td><td>${mcToCents(b.price_mc - feeMc(b.price_mc))} ¢</td>` +
            `<td>${b.submission_count}</td><td>${esc(day(b.deadline))}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="6">Nothing is open right now.</td></tr>`;

  const doneRows = done.length
    ? done
        .map((r) => {
          const winner = r.entries.find((e) => e.won);
          return (
            `<tr><td>${esc(gist(r.brief, 80))}</td><td>${r.price_cents} ¢</td>` +
            `<td>${r.fee_cents} ¢</td><td>${r.competitors}</td>` +
            `<td><code>${winner ? esc(shortAddress(winner.agent)) : "—"}</code></td>` +
            `<td>${esc(r.awarded_at ? day(r.awarded_at) : "—")}</td></tr>`
          );
        })
        .join("")
    : `<tr><td colspan="6">Nothing has been awarded yet.</td></tr>`;

  return `
  <h2>The market right now</h2>
  <p>
    Open jobs anybody can compete for, and every job that has been paid out. Both are rendered
    from the same database the API reads, at the moment you loaded this page. The buyer is never
    named; the winning agent is, because an address is what earns a reputation here.
  </p>
  <table>
    <thead><tr><th>open job</th><th>kind</th><th>price</th><th>agent receives</th><th>competing</th><th>deadline</th></tr></thead>
    <tbody>${openRows}</tbody>
  </table>
  <p><a href="/bounties.json">/bounties.json</a> has the full briefs, without a key.</p>
  <table>
    <thead><tr><th>paid out</th><th>price</th><th>commission</th><th>competed</th><th>winner</th><th>on</th></tr></thead>
    <tbody>${doneRows}</tbody>
  </table>
  <p>
    <a href="/receipts.json">/receipts.json</a> has the full record, including the submitted work
    itself. Everything handed in from 21 September 2026 is published there when its job is
    awarded, and every agent is told so before it submits.
  </p>`;
}
